-- BabyBlue business logic. Everything that must be atomic or privileged lives here, not in the client.
-- All SECURITY DEFINER functions pin search_path and re-check the caller's identity and role.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_roles where user_id = auth.uid() and role = 'platform_admin');
$$;

create or replace function public.is_marketing_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_roles where user_id = auth.uid() and role in ('marketing_operator', 'platform_admin'));
$$;

create or replace function public.is_member(p_practice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.practice_members where practice_id = p_practice and user_id = auth.uid());
$$;

create or replace function public.has_practice_role(p_practice uuid, p_roles public.practice_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.practice_members
                 where practice_id = p_practice and user_id = auth.uid() and role = any (p_roles));
$$;

create or replace function public._audit(p_practice uuid, p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, practice_id, action, entity, entity_id, meta)
  values (auth.uid(), p_practice, p_action, p_entity, p_entity_id, p_meta);
$$;

-- ───────────────────────── verification can only be granted by platform admins ─────────────────────────
-- SECURITY INVOKER on purpose: current_user must be the caller's role, not the function owner.
create or replace function public.practitioners_guard_verification() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not (public.is_platform_admin() or current_user in ('postgres', 'service_role', 'supabase_admin')) then
      new.verification_status := 'unverified';
      new.verified_at := null;
      new.verified_by := null;
    end if;
  elsif (new.verification_status is distinct from old.verification_status
      or new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by)
     and not (public.is_platform_admin() or current_user in ('postgres', 'service_role', 'supabase_admin')) then
    raise exception 'verification_requires_platform_admin' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger practitioners_guard_verification
  before insert or update on public.practitioners
  for each row execute function public.practitioners_guard_verification();

create or replace function public.set_verification(p_practitioner uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_practice uuid;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending', 'verified', 'rejected', 'unverified') then raise exception 'invalid_status'; end if;
  update public.practitioners
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then now() else null end,
         verified_by = case when p_status = 'verified' then auth.uid() else null end
   where id = p_practitioner returning practice_id into v_practice;
  if v_practice is null then raise exception 'not_found'; end if;
  perform public._audit(v_practice, 'practitioner.verification', 'practitioner', p_practitioner, jsonb_build_object('status', p_status));
end $$;

-- ───────────────────────── availability ─────────────────────────
-- Returns genuinely open slots for a listed practitioner and service. Public by design (no personal data).
create or replace function public.get_available_slots(p_practitioner uuid, p_service uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_practice public.practices%rowtype;
  v_svc      public.services%rowtype;
begin
  if p_to < p_from or p_to - p_from > 31 then raise exception 'invalid_range'; end if;

  select pr.* into v_practice
    from public.practices pr join public.practitioners pt on pt.practice_id = pr.id
   where pt.id = p_practitioner and pt.listing_status = 'listed' and pr.status = 'active';
  if not found then return; end if;

  select s.* into v_svc
    from public.services s join public.practitioner_services ps on ps.service_id = s.id
   where s.id = p_service and ps.practitioner_id = p_practitioner and s.active and s.practice_id = v_practice.id;
  if not found then return; end if;

  return query
  with days as (
    select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ), windows as (
    select (d.day + r.start_time) at time zone v_practice.timezone as w_start,
           (d.day + r.end_time)   at time zone v_practice.timezone as w_end
      from days d
      join public.availability_rules r
        on r.practitioner_id = p_practitioner and r.weekday = extract(isodow from d.day)::int - 1
  ), candidates as (
    select g as c_start, g + make_interval(mins => v_svc.duration_min) as c_end
      from windows w,
           lateral generate_series(w.w_start, w.w_end - make_interval(mins => v_svc.duration_min),
                                   make_interval(mins => v_svc.duration_min + v_svc.buffer_min)) g
  )
  select c.c_start, c.c_end
    from candidates c
   where c.c_start >= now() + make_interval(mins => v_practice.min_notice_minutes)
     and not exists (select 1 from public.time_off t
                      where t.practitioner_id = p_practitioner
                        and t.during && tstzrange(c.c_start, c.c_end + make_interval(mins => v_svc.buffer_min)))
     and not exists (select 1 from public.appointments a
                      where a.practitioner_id = p_practitioner
                        and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed')
                        and a.during && tstzrange(c.c_start, c.c_end + make_interval(mins => v_svc.buffer_min)))
     and not exists (select 1 from public.slot_holds h
                      where h.practitioner_id = p_practitioner and h.expires_at > now()
                        and h.during && tstzrange(c.c_start, c.c_end + make_interval(mins => v_svc.buffer_min)))
   order by c.c_start;
end $$;

-- ───────────────────────── booking ─────────────────────────
-- Step 1 of a consumer booking: reserve the slot for five minutes.
create or replace function public.hold_slot(p_practitioner uuid, p_service uuid, p_starts timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pt  public.practitioners%rowtype;
  v_pr  public.practices%rowtype;
  v_svc public.services%rowtype;
  v_day date;
  v_end timestamptz;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_pt from public.practitioners where id = p_practitioner;
  if not found then raise exception 'slot_unavailable'; end if;
  select * into v_pr from public.practices where id = v_pt.practice_id;
  select * into v_svc from public.services where id = p_service and practice_id = v_pt.practice_id;
  if not found then raise exception 'slot_unavailable'; end if;

  -- Release anything stale, and any earlier hold this person has with this practitioner.
  delete from public.slot_holds where practitioner_id = p_practitioner and (expires_at <= now() or consumer_id = v_uid);

  v_day := (p_starts at time zone v_pr.timezone)::date;
  if not exists (select 1 from public.get_available_slots(p_practitioner, p_service, v_day, v_day) s where s.starts_at = p_starts) then
    raise exception 'slot_unavailable';
  end if;

  v_end := p_starts + make_interval(mins => v_svc.duration_min);
  insert into public.slot_holds (practice_id, practitioner_id, service_id, consumer_id, starts_at, ends_at, during, expires_at)
  values (v_pt.practice_id, p_practitioner, p_service, v_uid, p_starts, v_end,
          tstzrange(p_starts, v_end + make_interval(mins => v_svc.buffer_min)), now() + interval '5 minutes')
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'slot_unavailable';
end $$;

-- Step 2: turn a live hold into a confirmed appointment. The exclusion constraint is the final guard.
create or replace function public.book_appointment(p_hold uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  h       public.slot_holds%rowtype;
  v_svc   public.services%rowtype;
  v_cl    uuid;
  v_name  text;
  v_phone text;
  v_email text;
  v_first text;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into h from public.slot_holds where id = p_hold and consumer_id = v_uid and expires_at > now() for update;
  if not found then raise exception 'hold_expired'; end if;
  select * into v_svc from public.services where id = h.service_id;

  select id into v_cl from public.clients where practice_id = h.practice_id and user_id = v_uid;
  if v_cl is null then
    select display_name, phone into v_name, v_phone from public.profiles where id = v_uid;
    select email into v_email from auth.users where id = v_uid;
    v_first := coalesce(nullif(split_part(coalesce(v_name, ''), ' ', 1), ''), 'Client');
    insert into public.clients (practice_id, user_id, first_name, last_name, email, phone)
    values (h.practice_id, v_uid, v_first, coalesce(nullif(trim(substr(coalesce(v_name, ''), char_length(v_first) + 1)), ''), ''), v_email, v_phone)
    returning id into v_cl;
  end if;

  delete from public.slot_holds where id = h.id;
  insert into public.appointments (practice_id, practitioner_id, service_id, client_id, consumer_id, starts_at, ends_at, buffer_min, during, status, source)
  values (h.practice_id, h.practitioner_id, h.service_id, v_cl, v_uid, h.starts_at, h.ends_at, v_svc.buffer_min, h.during, 'confirmed', 'app')
  returning id into v_id;

  perform public._audit(h.practice_id, 'appointment.booked', 'appointment', v_id, jsonb_build_object('source', 'app'));
  return v_id;
exception when exclusion_violation then
  raise exception 'slot_unavailable';
end $$;

-- Staff-created booking (BabyBlue OS / Flow). Staff may book outside published availability but never over another booking.
create or replace function public.staff_create_appointment(p_practitioner uuid, p_service uuid, p_client uuid, p_starts timestamptz, p_source text default 'os')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pt  public.practitioners%rowtype;
  v_svc public.services%rowtype;
  v_end timestamptz;
  v_id  uuid;
begin
  select * into v_pt from public.practitioners where id = p_practitioner;
  if not found then raise exception 'not_found'; end if;
  if not public.has_practice_role(v_pt.practice_id, array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_svc from public.services where id = p_service and practice_id = v_pt.practice_id;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from public.clients where id = p_client and practice_id = v_pt.practice_id) then raise exception 'not_found'; end if;
  if p_source not in ('os', 'flow') then raise exception 'invalid_source'; end if;

  v_end := p_starts + make_interval(mins => v_svc.duration_min);
  insert into public.appointments (practice_id, practitioner_id, service_id, client_id, starts_at, ends_at, buffer_min, during, status, source)
  values (v_pt.practice_id, p_practitioner, p_service, p_client, p_starts, v_end, v_svc.buffer_min,
          tstzrange(p_starts, v_end + make_interval(mins => v_svc.buffer_min)), 'confirmed', p_source)
  returning id into v_id;
  perform public._audit(v_pt.practice_id, 'appointment.created', 'appointment', v_id, jsonb_build_object('source', p_source));
  return v_id;
exception when exclusion_violation then
  raise exception 'slot_unavailable';
end $$;

create or replace function public.cancel_appointment(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  a     public.appointments%rowtype;
  v_pr  public.practices%rowtype;
  v_staff boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_staff := public.has_practice_role(a.practice_id, array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  if not (v_staff or a.consumer_id = v_uid) then raise exception 'not_found'; end if;  -- do not reveal existence
  if a.status not in ('booked', 'confirmed') then raise exception 'not_cancellable'; end if;
  if not v_staff then
    select * into v_pr from public.practices where id = a.practice_id;
    if a.starts_at - make_interval(hours => v_pr.cancellation_notice_hours) < now() then raise exception 'too_late_to_cancel'; end if;
  end if;
  update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid, cancel_reason = left(p_reason, 500) where id = p_id;
  perform public._audit(a.practice_id, 'appointment.cancelled', 'appointment', p_id, jsonb_build_object('by', case when v_staff then 'staff' else 'consumer' end));
end $$;

create or replace function public.reschedule_appointment(p_id uuid, p_new_starts timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  a     public.appointments%rowtype;
  v_pr  public.practices%rowtype;
  v_svc public.services%rowtype;
  v_staff boolean;
  v_end timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_staff := public.has_practice_role(a.practice_id, array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  if not (v_staff or a.consumer_id = v_uid) then raise exception 'not_found'; end if;
  if a.status not in ('booked', 'confirmed') then raise exception 'not_reschedulable'; end if;
  select * into v_pr from public.practices where id = a.practice_id;
  select * into v_svc from public.services where id = a.service_id;

  if not v_staff then
    if a.starts_at - make_interval(hours => v_pr.cancellation_notice_hours) < now() then raise exception 'too_late_to_cancel'; end if;
    -- The new time must be one the practitioner actually offers.
    if not exists (select 1 from public.get_available_slots(a.practitioner_id, a.service_id,
                     (p_new_starts at time zone v_pr.timezone)::date, (p_new_starts at time zone v_pr.timezone)::date) s
                    where s.starts_at = p_new_starts) then
      raise exception 'slot_unavailable';
    end if;
  end if;

  v_end := p_new_starts + make_interval(mins => v_svc.duration_min);
  update public.appointments
     set starts_at = p_new_starts, ends_at = v_end, buffer_min = v_svc.buffer_min,
         during = tstzrange(p_new_starts, v_end + make_interval(mins => v_svc.buffer_min)), reminder_sent_at = null
   where id = p_id;
  perform public._audit(a.practice_id, 'appointment.rescheduled', 'appointment', p_id, '{}');
exception when exclusion_violation then
  raise exception 'slot_unavailable';
end $$;

-- ───────────────────────── Flow: privacy-safe public queue access ─────────────────────────
create or replace function public.join_queue(p_practice_slug text, p_name text, p_phone text default null, p_urgency text default 'routine')
returns text language plpgsql security definer set search_path = public as $$
declare v_pr public.practices%rowtype; v_token text;
begin
  select * into v_pr from public.practices where slug = p_practice_slug and status = 'active';
  if not found then raise exception 'practice_not_found'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(p_name) > 120 then raise exception 'invalid_name'; end if;
  if p_urgency not in ('routine', 'soon', 'urgent') then raise exception 'invalid_urgency'; end if;
  insert into public.queue_entries (practice_id, display_name, phone, urgency, source)
  values (v_pr.id, trim(p_name), nullif(left(trim(coalesce(p_phone, '')), 20), ''), p_urgency, 'qr')
  returning public_token into v_token;
  return v_token;
end $$;

-- What a patient's phone may learn: status, place in line and the practice name. Nothing else.
create or replace function public.get_queue_status(p_token text)
returns table (status public.queue_status, queue_position int, practice_name text)
language sql stable security definer set search_path = public as $$
  select q.status,
         case when q.status = 'waiting'
              then (select count(*)::int from public.queue_entries w
                     where w.practice_id = q.practice_id and w.status = 'waiting' and w.seq <= q.seq) end,
         p.name
    from public.queue_entries q join public.practices p on p.id = q.practice_id
   where q.public_token = p_token;
$$;

-- ───────────────────────── Growth: controlled status transitions ─────────────────────────
create or replace function public.marketing_set_status(p_id uuid, p_status public.marketing_status) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.marketing_requests%rowtype;
  v_owner boolean;
  v_op boolean := public.is_marketing_operator();
  ok boolean := false;
begin
  select * into r from public.marketing_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_owner := public.has_practice_role(r.practice_id, array['practice_owner']::public.practice_role[]);
  if not (v_owner or (v_op and r.status <> 'draft')) then raise exception 'not_found'; end if;

  if v_owner then
    ok := (r.status, p_status) in (('draft', 'submitted'), ('proposal_sent', 'approved'), ('proposal_sent', 'declined'), ('delivered', 'closed'));
  end if;
  if not ok and v_op then
    ok := (r.status, p_status) in (('submitted', 'in_review'), ('in_review', 'proposal_sent'), ('in_review', 'declined'), ('approved', 'in_progress'),
                                   ('in_progress', 'awaiting_approval'), ('in_progress', 'delivered'), ('awaiting_approval', 'in_progress'),
                                   ('awaiting_approval', 'delivered'), ('delivered', 'closed'));
  end if;
  if not ok then raise exception 'invalid_transition'; end if;
  update public.marketing_requests set status = p_status, updated_at = now(),
         assigned_to = case when v_op and p_status = 'in_review' then auth.uid() else assigned_to end where id = p_id;
  perform public._audit(r.practice_id, 'marketing.status', 'marketing_request', p_id, jsonb_build_object('from', r.status, 'to', p_status));
end $$;

create or replace function public.decide_approval(p_id uuid, p_status text, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare ap public.marketing_approvals%rowtype; r public.marketing_requests%rowtype;
begin
  if p_status not in ('approved', 'changes_requested') then raise exception 'invalid_status'; end if;
  select * into ap from public.marketing_approvals where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into r from public.marketing_requests where id = ap.request_id;
  if not public.has_practice_role(r.practice_id, array['practice_owner']::public.practice_role[]) then raise exception 'not_found'; end if;
  update public.marketing_approvals set status = p_status, comment = left(p_comment, 1000), decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform public._audit(r.practice_id, 'marketing.approval', 'marketing_approval', p_id, jsonb_build_object('status', p_status));
end $$;
