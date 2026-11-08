-- Functions the BabyBlue App (patients) and BabyBlue OS (practices) call. Same security model as 0002/0003:
-- SECURITY DEFINER, pinned search_path, identity and role re-checked inside, least-privilege grants at the end.

-- ───────────────────────── profile auto-creation ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── marketing assets carry their own bytes (swap for Storage later) ─────────────────────────
alter table public.marketing_assets alter column storage_path drop not null;
alter table public.marketing_assets add column mime text;
alter table public.marketing_assets add column size_bytes int check (size_bytes is null or size_bytes <= 5242880);
alter table public.marketing_assets add column content bytea;

-- ───────────────────────── patient app ─────────────────────────
create or replace function public.search_practitioners(
  p_q text default null, p_speciality text default null, p_city text default null,
  p_verified_only boolean default false, p_limit int default 40)
returns table (
  practitioner_id uuid, practice_id uuid, display_name text, title text, speciality text, bio text, languages text[],
  verification_status text, practice_name text, practice_slug text, city text, province text, address text,
  from_price_cents int, service_count int, next_available timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select p.id as practitioner_id, pr.id as practice_id, p.display_name, p.title, p.speciality, p.bio, p.languages, p.verification_status,
           pr.name as practice_name, pr.slug as practice_slug, l.city, pr.province, l.address,
           (select min(s.price_cents) from public.services s join public.practitioner_services ps on ps.service_id = s.id
             where ps.practitioner_id = p.id and s.active) as from_price_cents,
           (select count(*)::int from public.services s join public.practitioner_services ps on ps.service_id = s.id
             where ps.practitioner_id = p.id and s.active) as service_count,
           (select min(sl.starts_at)
              from public.services s
              join public.practitioner_services ps on ps.service_id = s.id and ps.practitioner_id = p.id
              cross join lateral public.get_available_slots(p.id, s.id, current_date, current_date + 13) sl
             where s.active) as next_available
      from public.practitioners p
      join public.practices pr on pr.id = p.practice_id and pr.status = 'active'
      left join lateral (select city, address from public.locations where practice_id = pr.id order by name limit 1) l on true
     where p.listing_status = 'listed'
       and (coalesce(p_q, '') = '' or p.display_name ilike '%' || p_q || '%' or p.speciality ilike '%' || p_q || '%'
            or pr.name ilike '%' || p_q || '%'
            or exists (select 1 from public.services s join public.practitioner_services ps on ps.service_id = s.id
                        where ps.practitioner_id = p.id and s.active and s.name ilike '%' || p_q || '%'))
       and (coalesce(p_speciality, '') = '' or p.speciality = p_speciality)
       and (coalesce(p_city, '') = '' or l.city = p_city)
       and (not p_verified_only or p.verification_status = 'verified')
  ) r
  order by r.next_available nulls last, r.display_name
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.my_appointments()
returns table (
  id uuid, status public.appointment_status, starts_at timestamptz, ends_at timestamptz, source text,
  practice_id uuid, practice_name text, practice_phone text, practitioner_id uuid, practitioner_name text, speciality text,
  service_name text, price_cents int, address text, city text, cancellation_notice_hours int, can_cancel boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.starts_at, a.ends_at, a.source, pr.id, pr.name, null::text, pt.id, pt.display_name, pt.speciality,
         s.name, s.price_cents, l.address, l.city, pr.cancellation_notice_hours,
         (a.status in ('booked', 'confirmed') and a.starts_at - make_interval(hours => pr.cancellation_notice_hours) > now())
    from public.appointments a
    join public.practices pr on pr.id = a.practice_id
    join public.practitioners pt on pt.id = a.practitioner_id
    join public.services s on s.id = a.service_id
    left join lateral (select address, city from public.locations where practice_id = pr.id order by name limit 1) l on true
   where a.consumer_id = auth.uid()
   order by a.starts_at desc;
$$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.practice_members where user_id = auth.uid() and role = 'practice_owner'
              and not exists (select 1 from public.practice_members m2 where m2.practice_id = practice_members.practice_id
                              and m2.role = 'practice_owner' and m2.user_id <> auth.uid())) then
    raise exception 'sole_owner';
  end if;
  update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'Account deleted'
   where consumer_id = auth.uid() and status in ('booked', 'confirmed') and starts_at > now();
  delete from auth.users where id = auth.uid();
exception when foreign_key_violation then
  raise exception 'has_records';
end $$;

-- ───────────────────────── check-in, status and queue (staff + patient) ─────────────────────────
create or replace function public._ensure_queue_entry(p_appointment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.appointments%rowtype; c public.clients%rowtype;
begin
  select * into a from public.appointments where id = p_appointment;
  select * into c from public.clients where id = a.client_id;
  if not exists (select 1 from public.queue_entries where appointment_id = p_appointment) then
    insert into public.queue_entries (practice_id, appointment_id, display_name, phone, source)
    values (a.practice_id, p_appointment, trim(c.first_name || ' ' || c.last_name), c.phone, 'booked');
  end if;
end $$;

create or replace function public.check_in_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.appointments%rowtype; v_staff boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_staff := public.is_member(a.practice_id);
  if not (v_staff or a.consumer_id = auth.uid()) then raise exception 'not_found'; end if;
  if a.status not in ('booked', 'confirmed') then raise exception 'not_checkin_able'; end if;
  if not v_staff and (a.starts_at > now() + interval '2 hours' or a.ends_at < now() - interval '2 hours') then
    raise exception 'too_early_to_check_in';
  end if;
  update public.appointments set status = 'checked_in' where id = p_id;
  perform public._ensure_queue_entry(p_id);
  perform public._audit(a.practice_id, 'appointment.checked_in', 'appointment', p_id, '{}');
end $$;

create or replace function public.set_appointment_status(p_id uuid, p_status public.appointment_status) returns void
language plpgsql security definer set search_path = public as $$
declare a public.appointments%rowtype; ok boolean;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.is_member(a.practice_id) then raise exception 'not_found'; end if;
  ok := (a.status, p_status) in (
    ('booked', 'confirmed'), ('booked', 'checked_in'), ('booked', 'in_progress'), ('booked', 'completed'), ('booked', 'no_show'), ('booked', 'cancelled'),
    ('confirmed', 'checked_in'), ('confirmed', 'in_progress'), ('confirmed', 'completed'), ('confirmed', 'no_show'), ('confirmed', 'cancelled'),
    ('checked_in', 'in_progress'), ('checked_in', 'completed'), ('checked_in', 'no_show'), ('checked_in', 'cancelled'),
    ('in_progress', 'completed'));
  if not ok then raise exception 'invalid_transition'; end if;
  if p_status = 'checked_in' then
    perform public._ensure_queue_entry(p_id);
  end if;
  update public.appointments
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
         cancelled_by = case when p_status = 'cancelled' then auth.uid() else cancelled_by end
   where id = p_id;
  -- Keep the queue in step with the appointment.
  update public.queue_entries
     set status = case p_status when 'in_progress' then 'in_consultation'::public.queue_status
                                when 'completed' then 'done' when 'cancelled' then 'cancelled' when 'no_show' then 'cancelled'
                                else status end,
         called_at = case when p_status = 'in_progress' then coalesce(called_at, now()) else called_at end,
         completed_at = case when p_status in ('completed', 'cancelled', 'no_show') then now() else completed_at end
   where appointment_id = p_id and p_status in ('in_progress', 'completed', 'cancelled', 'no_show');
  perform public._audit(a.practice_id, 'appointment.status', 'appointment', p_id, jsonb_build_object('from', a.status, 'to', p_status));
end $$;

create or replace function public.queue_add_walkin(p_practice uuid, p_name text, p_phone text default null, p_urgency text default 'routine')
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not public.is_member(p_practice) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name'; end if;
  if p_urgency not in ('routine', 'soon', 'urgent') then raise exception 'invalid_urgency'; end if;
  insert into public.queue_entries (practice_id, display_name, phone, urgency, source)
  values (p_practice, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_urgency, 'reception') returning public_token into v_token;
  return v_token;
end $$;

create or replace function public.queue_set_status(p_entry uuid, p_status public.queue_status) returns void
language plpgsql security definer set search_path = public as $$
declare q public.queue_entries%rowtype;
begin
  select * into q from public.queue_entries where id = p_entry for update;
  if not found or not public.is_member(q.practice_id) then raise exception 'not_found'; end if;
  if q.status in ('done', 'cancelled') then raise exception 'invalid_transition'; end if;
  if (q.status, p_status) not in (('waiting', 'in_consultation'), ('waiting', 'cancelled'), ('in_consultation', 'done'), ('in_consultation', 'cancelled'), ('waiting', 'done')) then
    raise exception 'invalid_transition';
  end if;
  update public.queue_entries
     set status = p_status,
         called_at = case when p_status = 'in_consultation' then now() else called_at end,
         completed_at = case when p_status in ('done', 'cancelled') then now() else completed_at end
   where id = p_entry;
  if q.appointment_id is not null then
    update public.appointments
       set status = case p_status when 'in_consultation' then 'in_progress'::public.appointment_status when 'done' then 'completed' else 'no_show' end
     where id = q.appointment_id and status in ('checked_in', 'in_progress', 'booked', 'confirmed');
  end if;
end $$;

-- A patient leaves the queue using their private token.
create or replace function public.leave_queue(p_token text) returns void
language sql security definer set search_path = public as $$
  update public.queue_entries set status = 'cancelled', completed_at = now() where public_token = p_token and status = 'waiting';
$$;

-- ───────────────────────── team ─────────────────────────
create or replace function public.add_practice_member_by_email(p_practice uuid, p_email text, p_role public.practice_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.has_practice_role(p_practice, array['practice_owner']::public.practice_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found'; end if;
  insert into public.practice_members (practice_id, user_id, role) values (p_practice, v_user, p_role)
  on conflict (practice_id, user_id) do update set role = excluded.role;
  perform public._audit(p_practice, 'member.added', 'practice', p_practice, jsonb_build_object('role', p_role));
end $$;

create or replace function public.remove_practice_member(p_practice uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_practice_role(p_practice, array['practice_owner']::public.practice_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select role from public.practice_members where practice_id = p_practice and user_id = p_user) = 'practice_owner'
     and (select count(*) from public.practice_members where practice_id = p_practice and role = 'practice_owner') <= 1 then
    raise exception 'sole_owner';
  end if;
  delete from public.practice_members where practice_id = p_practice and user_id = p_user;
  perform public._audit(p_practice, 'member.removed', 'practice', p_practice, '{}');
end $$;

create or replace function public.practice_team(p_practice uuid)
returns table (user_id uuid, email text, display_name text, role public.practice_role)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email, pf.display_name, m.role
    from public.practice_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles pf on pf.id = m.user_id
   where m.practice_id = p_practice and public.is_member(p_practice)
   order by m.role, pf.display_name;
$$;

create or replace function public.submit_verification(p_practitioner uuid, p_body text, p_number text) returns void
language plpgsql security definer set search_path = public as $$
declare v_practice uuid;
begin
  select practice_id into v_practice from public.practitioners where id = p_practitioner;
  if v_practice is null or not public.has_practice_role(v_practice, array['practice_owner']::public.practice_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 2 or char_length(trim(coalesce(p_number, ''))) < 3 then raise exception 'invalid_registration'; end if;
  insert into public.practitioner_registrations (practitioner_id, body, registration_number)
  values (p_practitioner, trim(p_body), trim(p_number))
  on conflict (practitioner_id) do update set body = excluded.body, registration_number = excluded.registration_number, submitted_at = now();
  update public.practitioners set verification_status = 'pending' where id = p_practitioner and verification_status in ('unverified', 'rejected');
  perform public._audit(v_practice, 'practitioner.verification_submitted', 'practitioner', p_practitioner, '{}');
exception when unique_violation then
  raise exception 'registration_in_use';
end $$;

-- ───────────────────────── platform admin ─────────────────────────
create or replace function public.grant_platform_role(p_email text, p_role public.platform_role) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found'; end if;
  insert into public.platform_roles (user_id, role) values (v_user, p_role)
  on conflict (user_id) do update set role = excluded.role;
  perform public._audit(null, 'platform.role_granted', 'user', v_user, jsonb_build_object('role', p_role));
end $$;

create or replace function public.my_platform_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.platform_roles where user_id = auth.uid();
$$;

create or replace function public.admin_overview()
returns table (kind text, id uuid, practice_id uuid, practice_name text, label text, detail text, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'practice'::text, p.id, p.id, p.name, p.name, coalesce(p.province, ''), p.status, p.created_at
      from public.practices p where public.is_platform_admin()
    union all
    select 'practitioner', pt.id, pr.id, pr.name, pt.display_name || ' · ' || pt.speciality,
           coalesce(r.body || ' ' || r.registration_number, 'No registration submitted'), pt.verification_status, pt.created_at
      from public.practitioners pt join public.practices pr on pr.id = pt.practice_id
      left join public.practitioner_registrations r on r.practitioner_id = pt.id
     where public.is_platform_admin()
  ) x order by x.created_at desc;
$$;

-- ───────────────────────── Growth ─────────────────────────
create or replace function public.marketing_inbox()
returns table (id uuid, practice_id uuid, practice_name text, service_name text, title text, status public.marketing_status,
               budget_min_cents int, budget_max_cents int, deadline date, created_at timestamptz, updated_at timestamptz, assigned_to uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.practice_id, p.name, s.name, r.title, r.status, r.budget_min_cents, r.budget_max_cents, r.deadline, r.created_at, r.updated_at, r.assigned_to
    from public.marketing_requests r
    join public.practices p on p.id = r.practice_id
    join public.marketing_services s on s.id = r.service_id
   where public.is_marketing_operator() and r.status <> 'draft'
   order by r.updated_at desc;
$$;

-- ───────────────────────── dashboards: real numbers only ─────────────────────────
create or replace function public.practice_stats(p_practice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
  v_avail numeric; v_booked numeric;
  r jsonb;
begin
  if not public.is_member(p_practice) then raise exception 'forbidden' using errcode = '42501'; end if;
  select timezone into v_tz from public.practices where id = p_practice;
  v_today := (now() at time zone v_tz)::date;

  -- Utilisation over the next 7 days: booked minutes ÷ minutes practitioners are open (less leave).
  select coalesce(sum(greatest(0, extract(epoch from (
           upper(w.win) - lower(w.win)) / 60.0)
         - coalesce((select sum(extract(epoch from (upper(w.win * t.during) - lower(w.win * t.during))) / 60.0)
                       from public.time_off t where t.practitioner_id = w.pid and t.during && w.win), 0))), 0)
    into v_avail
    from (select pt.id as pid,
                 tstzrange((d.day + ru.start_time) at time zone v_tz, (d.day + ru.end_time) at time zone v_tz) as win
            from public.practitioners pt
            join public.availability_rules ru on ru.practitioner_id = pt.id
            cross join (select generate_series(v_today::timestamp, (v_today + 6)::timestamp, interval '1 day')::date as day) d
           where pt.practice_id = p_practice and ru.weekday = extract(isodow from d.day)::int - 1) w;

  select coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 60.0), 0) into v_booked
    from public.appointments a
   where a.practice_id = p_practice and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed')
     and a.starts_at >= (v_today::timestamp at time zone v_tz) and a.starts_at < ((v_today + 7)::timestamp at time zone v_tz);

  select jsonb_build_object(
    'today_total',      (select count(*) from public.appointments a where a.practice_id = p_practice and a.status <> 'cancelled'
                          and (a.starts_at at time zone v_tz)::date = v_today),
    'today_completed',  (select count(*) from public.appointments a where a.practice_id = p_practice and a.status = 'completed'
                          and (a.starts_at at time zone v_tz)::date = v_today),
    'today_remaining',  (select count(*) from public.appointments a where a.practice_id = p_practice and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress')
                          and (a.starts_at at time zone v_tz)::date = v_today),
    'upcoming_7d',      (select count(*) from public.appointments a where a.practice_id = p_practice and a.status in ('booked', 'confirmed', 'checked_in')
                          and a.starts_at >= now() and a.starts_at < now() + interval '7 days'),
    'new_bookings_7d',  (select count(*) from public.appointments a where a.practice_id = p_practice and a.created_at >= now() - interval '7 days'),
    'bookings_30d',     (select count(*) from public.appointments a where a.practice_id = p_practice and a.starts_at >= now() - interval '30 days' and a.starts_at < now()
                          and a.status in ('completed', 'in_progress', 'checked_in', 'confirmed', 'booked')),
    'cancelled_30d',    (select count(*) from public.appointments a where a.practice_id = p_practice and a.status = 'cancelled'
                          and a.starts_at >= now() - interval '30 days' and a.starts_at < now() + interval '30 days'),
    'no_show_30d',      (select count(*) from public.appointments a where a.practice_id = p_practice and a.status = 'no_show' and a.starts_at >= now() - interval '30 days'),
    'scheduled_30d',    (select count(*) from public.appointments a where a.practice_id = p_practice and a.starts_at >= now() - interval '30 days' and a.starts_at < now() + interval '30 days'),
    'new_clients_30d',  (select count(*) from public.clients c where c.practice_id = p_practice and c.created_at >= now() - interval '30 days'),
    'total_clients',    (select count(*) from public.clients c where c.practice_id = p_practice),
    'booked_minutes_7d', round(v_booked),
    'available_minutes_7d', round(v_avail),
    'utilisation_7d',   case when v_avail > 0 then round(v_booked / v_avail * 100, 1) end,
    'revenue_est_30d_cents', (select coalesce(sum(s.price_cents), 0) from public.appointments a join public.services s on s.id = a.service_id
                               where a.practice_id = p_practice and a.status = 'completed' and a.starts_at >= now() - interval '30 days'),
    'queue_waiting',    (select count(*) from public.queue_entries q where q.practice_id = p_practice and q.status = 'waiting'),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'booked', coalesce(x.booked, 0), 'cancelled', coalesce(x.cancelled, 0)) order by d.day), '[]')
                 from (select generate_series(v_today - 29, v_today, interval '1 day')::date as day) d
                 left join (select (a.starts_at at time zone v_tz)::date as day,
                                   count(*) filter (where a.status <> 'cancelled') as booked,
                                   count(*) filter (where a.status = 'cancelled') as cancelled
                              from public.appointments a where a.practice_id = p_practice group by 1) x on x.day = d.day),
    'top_services', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (
                       select s.name, count(*) as n from public.appointments a join public.services s on s.id = a.service_id
                        where a.practice_id = p_practice and a.status <> 'cancelled' and a.starts_at >= now() - interval '30 days'
                        group by s.name order by count(*) desc limit 5) t)
  ) into r;
  return r;
end $$;

create or replace function public.practice_insights(p_practice uuid, p_weeks int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_since timestamptz; r jsonb;
begin
  if not public.is_member(p_practice) then raise exception 'forbidden' using errcode = '42501'; end if;
  select timezone into v_tz from public.practices where id = p_practice;
  v_since := date_trunc('week', now() at time zone v_tz) at time zone v_tz - make_interval(weeks => greatest(p_weeks, 1) - 1);
  select jsonb_build_object(
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w.wk, 'booked', coalesce(x.booked, 0), 'cancelled', coalesce(x.cancelled, 0), 'no_show', coalesce(x.no_show, 0), 'completed', coalesce(x.completed, 0)) order by w.wk), '[]')
                 from (select generate_series(date_trunc('week', v_since at time zone v_tz), date_trunc('week', now() at time zone v_tz), interval '1 week')::date as wk) w
                 left join (select date_trunc('week', a.starts_at at time zone v_tz)::date as wk,
                                   count(*) filter (where a.status not in ('cancelled', 'no_show')) as booked,
                                   count(*) filter (where a.status = 'cancelled') as cancelled,
                                   count(*) filter (where a.status = 'no_show') as no_show,
                                   count(*) filter (where a.status = 'completed') as completed
                              from public.appointments a where a.practice_id = p_practice and a.starts_at >= v_since group by 1) x on x.wk = w.wk),
    'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('weekday', h.wd, 'hour', h.hr, 'n', h.n)), '[]') from (
                  select extract(isodow from a.starts_at at time zone v_tz)::int - 1 as wd, extract(hour from a.starts_at at time zone v_tz)::int as hr, count(*) as n
                    from public.appointments a where a.practice_id = p_practice and a.status not in ('cancelled') and a.starts_at >= v_since group by 1, 2) h),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'n', s.n)), '[]') from (
                    select a.source, count(*) as n from public.appointments a where a.practice_id = p_practice and a.starts_at >= v_since and a.status <> 'cancelled' group by a.source) s),
    'by_practitioner', (select coalesce(jsonb_agg(jsonb_build_object('name', pt.display_name,
                          'booked', (select count(*) from public.appointments a where a.practitioner_id = pt.id and a.status not in ('cancelled', 'no_show') and a.starts_at >= v_since and a.starts_at < now()),
                          'cancelled', (select count(*) from public.appointments a where a.practitioner_id = pt.id and a.status = 'cancelled' and a.starts_at >= v_since and a.starts_at < now()))), '[]')
                          from public.practitioners pt where pt.practice_id = p_practice),
    'repeat', jsonb_build_object(
        'clients_with_visit', (select count(distinct a.client_id) from public.appointments a where a.practice_id = p_practice and a.status = 'completed'),
        'repeat_clients', (select count(*) from (select a.client_id from public.appointments a where a.practice_id = p_practice and a.status = 'completed' group by a.client_id having count(*) >= 2) rc)),
    'revenue_est_cents', (select coalesce(sum(s.price_cents), 0) from public.appointments a join public.services s on s.id = a.service_id
                           where a.practice_id = p_practice and a.status = 'completed' and a.starts_at >= v_since)
  ) into r;
  return r;
end $$;

-- A patient gives a held time back (e.g. chooses a different slot).
create or replace function public.release_hold(p_hold uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.slot_holds where id = p_hold and consumer_id = auth.uid();
$$;

-- Staff can see what happened to an appointment.
create or replace function public.appointment_history(p_id uuid)
returns table (at timestamptz, action text, actor_name text, meta jsonb)
language sql stable security definer set search_path = public as $$
  select l.at, l.action, pf.display_name, l.meta
    from public.audit_log l
    join public.appointments a on a.id = l.entity_id and l.entity = 'appointment'
    left join public.profiles pf on pf.id = l.actor_id
   where a.id = p_id and public.is_member(a.practice_id)
   order by l.at;
$$;

-- What a person scanning a practice QR code may see before joining: the practice and how busy it is. No names.
create or replace function public.public_queue_info(p_slug text)
returns table (practice_name text, address text, city text, waiting int, accepting boolean)
language sql stable security definer set search_path = public as $$
  select p.name, l.address, l.city,
         (select count(*)::int from public.queue_entries q where q.practice_id = p.id and q.status = 'waiting'),
         p.status = 'active'
    from public.practices p
    left join lateral (select address, city from public.locations where practice_id = p.id limit 1) l on true
   where p.slug = p_slug and p.status = 'active';
$$;

-- ───────────────────────── grants ─────────────────────────
-- New functions are executable by PUBLIC by default (and by anon/authenticated on Supabase). Reset, then grant explicitly,
-- re-stating the earlier grants so the whole list lives in one place.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_platform_admin(), public.is_marketing_operator(), public.is_member(uuid),
  public.has_practice_role(uuid, public.practice_role[]), public.can_see_marketing_request(uuid) to anon, authenticated;
grant execute on function public.get_available_slots(uuid, uuid, date, date), public.join_queue(text, text, text, text),
  public.get_queue_status(text), public.search_practitioners(text, text, text, boolean, int), public.leave_queue(text),
  public.public_queue_info(text) to anon, authenticated;
grant execute on function public.hold_slot(uuid, uuid, timestamptz), public.book_appointment(uuid),
  public.staff_create_appointment(uuid, uuid, uuid, timestamptz, text), public.cancel_appointment(uuid, text),
  public.reschedule_appointment(uuid, timestamptz), public.create_practice(text, text), public.activate_practice(uuid, text),
  public.set_verification(uuid, text), public.marketing_set_status(uuid, public.marketing_status), public.decide_approval(uuid, text, text),
  public.my_appointments(), public.delete_my_account(), public.check_in_appointment(uuid),
  public.set_appointment_status(uuid, public.appointment_status), public.queue_add_walkin(uuid, text, text, text),
  public.queue_set_status(uuid, public.queue_status), public.add_practice_member_by_email(uuid, text, public.practice_role),
  public.remove_practice_member(uuid, uuid), public.practice_team(uuid), public.submit_verification(uuid, text, text),
  public.grant_platform_role(text, public.platform_role), public.my_platform_role(), public.admin_overview(),
  public.marketing_inbox(), public.practice_stats(uuid), public.practice_insights(uuid, int),
  public.release_hold(uuid), public.appointment_history(uuid) to authenticated;
-- Internal helpers (_audit, _ensure_queue_entry, handle_new_user) are deliberately NOT granted to any client role.
grant insert on public.marketing_assets to authenticated;
