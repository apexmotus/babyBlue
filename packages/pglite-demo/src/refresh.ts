/**
 * Moves a pre-built demo snapshot forward in time. Appointments shift by whole weeks (so weekdays and opening hours still line up),
 * the live queue shifts by the exact elapsed time, and statuses are made consistent with "now".
 */
export const REFRESH_SQL = `
do $$
declare
  shift_days int;
  snap timestamptz;
  qsnap timestamptz;
  w interval;
begin
  select v::timestamptz into snap from public.demo_meta where k = 'snapshot_at';
  select v::timestamptz into qsnap from public.demo_meta where k = 'queue_at';
  if snap is null then return; end if;
  shift_days := (floor(extract(epoch from (now() - snap)) / 86400 / 7) * 7)::int;
  if shift_days >= 7 then
    w := make_interval(days => shift_days);
    alter table public.appointments drop constraint no_double_booking;
    update public.appointments set starts_at = starts_at + w, ends_at = ends_at + w,
      during = tstzrange(lower(during) + w, upper(during) + w), created_at = created_at + w, cancelled_at = cancelled_at + w;
    alter table public.appointments add constraint no_double_booking
      exclude using gist (practitioner_id with =, during with &&)
      where (status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed'));
    update public.clients set created_at = created_at + w, consent_at = consent_at + w;
    update public.marketing_requests set created_at = created_at + w, updated_at = updated_at + w, deadline = deadline + shift_days;
    update public.campaign_updates set created_at = created_at + w;
    update public.marketing_approvals set created_at = created_at + w, decided_at = decided_at + w;
    update public.campaign_reports set created_at = created_at + w;
    update public.audit_log set at = at + w;
    update public.practices set created_at = created_at + w;
    update public.practitioners set verified_at = verified_at + w;
    update public.demo_meta set v = (snap + w)::text where k = 'snapshot_at';
  end if;
  if qsnap is not null then
    w := now() - qsnap;
    update public.queue_entries set joined_at = joined_at + w, called_at = called_at + w, completed_at = completed_at + w;
    update public.demo_meta set v = now()::text where k = 'queue_at';
  end if;
  update public.appointments set status = 'completed' where ends_at < now() and status in ('booked', 'confirmed', 'in_progress');
  update public.appointments set status = 'confirmed' where starts_at > now() and status in ('completed', 'in_progress');
end $$;
`;
