-- Row-level security, grants and practice bootstrap.
-- Principle: default deny. Nothing is readable or writable unless a policy or an explicit function says so.

-- ───────────────────────── practice bootstrap (privileged, so it lives in functions) ─────────────────────────
create or replace function public.create_practice(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.practices (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_id;
  insert into public.practice_members (practice_id, user_id, role) values (v_id, v_uid, 'practice_owner');
  perform public._audit(v_id, 'practice.created', 'practice', v_id, '{}');
  return v_id;
end $$;

create or replace function public.activate_practice(p_id uuid, p_status text default 'active') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'invalid_status'; end if;
  update public.practices set status = p_status where id = p_id;
  perform public._audit(p_id, 'practice.status', 'practice', p_id, jsonb_build_object('status', p_status));
end $$;

create or replace function public.can_see_marketing_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.marketing_requests r
     where r.id = p_request
       and (public.has_practice_role(r.practice_id, array['practice_owner']::public.practice_role[])
            or (public.is_marketing_operator() and r.status <> 'draft'))
  );
$$;

-- ───────────────────────── enable RLS everywhere ─────────────────────────
alter table public.profiles                   enable row level security;
alter table public.platform_roles             enable row level security;
alter table public.practices                  enable row level security;
alter table public.practice_members           enable row level security;
alter table public.locations                  enable row level security;
alter table public.practitioners              enable row level security;
alter table public.practitioner_registrations enable row level security;
alter table public.services                   enable row level security;
alter table public.practitioner_services      enable row level security;
alter table public.availability_rules         enable row level security;
alter table public.time_off                   enable row level security;
alter table public.clients                    enable row level security;
alter table public.appointments               enable row level security;
alter table public.slot_holds                 enable row level security;
alter table public.queue_entries              enable row level security;
alter table public.marketing_services         enable row level security;
alter table public.marketing_requests         enable row level security;
alter table public.marketing_assets           enable row level security;
alter table public.marketing_approvals        enable row level security;
alter table public.campaign_updates           enable row level security;
alter table public.campaign_reports           enable row level security;
alter table public.leads                      enable row level security;
alter table public.audit_log                  enable row level security;

-- ───────────────────────── policies ─────────────────────────
-- profiles: your own
create policy profiles_own_read   on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_own_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- practices
create policy practices_public_read  on public.practices for select to anon, authenticated using (status = 'active');
create policy practices_member_read  on public.practices for select to authenticated using (public.is_member(id));
create policy practices_admin_read   on public.practices for select to authenticated using (public.is_platform_admin());
create policy practices_owner_update on public.practices for update to authenticated
  using (public.has_practice_role(id, array['practice_owner']::public.practice_role[]))
  with check (public.has_practice_role(id, array['practice_owner']::public.practice_role[]));

-- practice_members: see your colleagues; only owners manage membership
create policy members_read   on public.practice_members for select to authenticated using (public.is_member(practice_id));
create policy members_insert on public.practice_members for insert to authenticated
  with check (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));
create policy members_update on public.practice_members for update to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));
create policy members_delete on public.practice_members for delete to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

-- locations
create policy locations_public_read on public.locations for select to anon, authenticated
  using (exists (select 1 from public.practices p where p.id = practice_id and p.status = 'active'));
create policy locations_member_all on public.locations for all to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));
create policy locations_member_read on public.locations for select to authenticated using (public.is_member(practice_id));

-- practitioners: public sees listed practitioners of active practices; members see their own practice's
create policy practitioners_public_read on public.practitioners for select to anon, authenticated
  using (listing_status = 'listed' and exists (select 1 from public.practices p where p.id = practice_id and p.status = 'active'));
create policy practitioners_member_read on public.practitioners for select to authenticated using (public.is_member(practice_id));
create policy practitioners_admin_read  on public.practitioners for select to authenticated using (public.is_platform_admin());
create policy practitioners_owner_write on public.practitioners for all to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

create policy registrations_read on public.practitioner_registrations for select to authenticated
  using (public.is_platform_admin()
         or exists (select 1 from public.practitioners p where p.id = practitioner_id and public.is_member(p.practice_id)));
create policy registrations_write on public.practitioner_registrations for all to authenticated
  using (exists (select 1 from public.practitioners p where p.id = practitioner_id and public.has_practice_role(p.practice_id, array['practice_owner']::public.practice_role[])))
  with check (exists (select 1 from public.practitioners p where p.id = practitioner_id and public.has_practice_role(p.practice_id, array['practice_owner']::public.practice_role[])));

-- services
create policy services_public_read on public.services for select to anon, authenticated
  using (active and exists (select 1 from public.practices p where p.id = practice_id and p.status = 'active'));
create policy services_member_read on public.services for select to authenticated using (public.is_member(practice_id));
create policy services_owner_write on public.services for all to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

create policy pservices_public_read on public.practitioner_services for select to anon, authenticated
  using (exists (select 1 from public.practitioners pt where pt.id = practitioner_id and pt.listing_status = 'listed'));
create policy pservices_member_read on public.practitioner_services for select to authenticated using (public.is_member(practice_id));
create policy pservices_owner_write on public.practitioner_services for all to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

-- availability & leave: members only (consumers get slots through get_available_slots)
create policy rules_member_read  on public.availability_rules for select to authenticated using (public.is_member(practice_id));
create policy rules_owner_write  on public.availability_rules for all to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner', 'receptionist']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner', 'receptionist']::public.practice_role[]));
create policy timeoff_member_read on public.time_off for select to authenticated using (public.is_member(practice_id));
create policy timeoff_write       on public.time_off for all to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner', 'receptionist']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner', 'receptionist']::public.practice_role[]));

-- clients: staff of the practice, plus the consumer's own record
create policy clients_member_read  on public.clients for select to authenticated using (public.is_member(practice_id));
create policy clients_own_read     on public.clients for select to authenticated using (user_id = auth.uid());
create policy clients_member_insert on public.clients for insert to authenticated with check (public.is_member(practice_id));
create policy clients_member_update on public.clients for update to authenticated
  using (public.is_member(practice_id)) with check (public.is_member(practice_id));
create policy clients_owner_delete on public.clients for delete to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

-- appointments: staff of the practice, plus the consumer who booked. Creation goes through functions only.
create policy appts_member_read on public.appointments for select to authenticated using (public.is_member(practice_id));
create policy appts_own_read    on public.appointments for select to authenticated using (consumer_id = auth.uid());
create policy appts_member_update on public.appointments for update to authenticated
  using (public.is_member(practice_id)) with check (public.is_member(practice_id));

create policy holds_own_read on public.slot_holds for select to authenticated using (consumer_id = auth.uid());

-- queue
create policy queue_member_all on public.queue_entries for all to authenticated
  using (public.is_member(practice_id)) with check (public.is_member(practice_id));

-- marketing
create policy mservices_read  on public.marketing_services for select to authenticated using (active or public.is_platform_admin());
create policy mservices_admin on public.marketing_services for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Evaluated inline (not via can_see_marketing_request) so INSERT ... RETURNING can see the row it just created.
create policy mreq_read   on public.marketing_requests for select to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[])
         or (public.is_marketing_operator() and status <> 'draft'));
create policy mreq_insert on public.marketing_requests for insert to authenticated
  with check (created_by = auth.uid() and status = 'draft'
              and public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));
create policy mreq_update on public.marketing_requests for update to authenticated
  using (status = 'draft' and public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]))
  with check (status = 'draft' and public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

create policy massets_read   on public.marketing_assets for select to authenticated using (public.can_see_marketing_request(request_id));
create policy massets_insert on public.marketing_assets for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_see_marketing_request(request_id)
              and (kind = 'brief_asset' or public.is_marketing_operator()));
create policy mappr_read     on public.marketing_approvals for select to authenticated using (public.can_see_marketing_request(request_id));
create policy mappr_insert   on public.marketing_approvals for insert to authenticated
  with check (public.is_marketing_operator() and public.can_see_marketing_request(request_id));
create policy cupd_read      on public.campaign_updates for select to authenticated using (public.can_see_marketing_request(request_id));
create policy cupd_insert    on public.campaign_updates for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_marketing_request(request_id));
create policy crep_read      on public.campaign_reports for select to authenticated using (public.can_see_marketing_request(request_id));
create policy crep_insert    on public.campaign_reports for insert to authenticated
  with check (created_by = auth.uid() and public.is_marketing_operator() and public.can_see_marketing_request(request_id));

-- audit: owners and platform admins can read; nobody writes directly
create policy audit_read on public.audit_log for select to authenticated
  using (public.is_platform_admin()
         or (practice_id is not null and public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[])));

-- leads and platform_roles: no policies. Only the service role (server) can touch them.

-- ───────────────────────── grants (least privilege) ─────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.practices, public.practitioners, public.services, public.practitioner_services,
                public.locations to anon, authenticated;
grant select on public.profiles, public.practice_members, public.practitioner_registrations, public.availability_rules,
                public.time_off, public.clients, public.appointments, public.slot_holds, public.queue_entries,
                public.marketing_services, public.marketing_requests, public.marketing_assets, public.marketing_approvals,
                public.campaign_updates, public.campaign_reports, public.audit_log to authenticated;

grant insert, update on public.profiles to authenticated;
grant update (name, province, min_notice_minutes, cancellation_notice_hours) on public.practices to authenticated;
grant insert, update, delete on public.practice_members, public.locations, public.practitioners,
                               public.practitioner_registrations, public.services, public.practitioner_services,
                               public.availability_rules, public.time_off, public.clients, public.queue_entries to authenticated;
grant update (status) on public.appointments to authenticated;
grant insert on public.marketing_requests to authenticated;
grant update (title, brief, budget_min_cents, budget_max_cents, deadline) on public.marketing_requests to authenticated;
grant insert on public.marketing_assets, public.marketing_approvals, public.campaign_updates, public.campaign_reports to authenticated;
grant insert, update, delete on public.marketing_services to authenticated;

-- functions
grant execute on function public.is_platform_admin(), public.is_marketing_operator(), public.is_member(uuid),
                          public.has_practice_role(uuid, public.practice_role[]), public.can_see_marketing_request(uuid)
  to anon, authenticated;
grant execute on function public.get_available_slots(uuid, uuid, date, date), public.join_queue(text, text, text, text),
                          public.get_queue_status(text) to anon, authenticated;
grant execute on function public.hold_slot(uuid, uuid, timestamptz), public.book_appointment(uuid),
                          public.staff_create_appointment(uuid, uuid, uuid, timestamptz, text),
                          public.cancel_appointment(uuid, text), public.reschedule_appointment(uuid, timestamptz),
                          public.create_practice(text, text), public.activate_practice(uuid, text),
                          public.set_verification(uuid, text), public.marketing_set_status(uuid, public.marketing_status),
                          public.decide_approval(uuid, text, text) to authenticated;
