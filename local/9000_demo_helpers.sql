-- Local demo only: lets a new practice owner go live immediately (in production a platform admin activates practices).
create function public.demo_activate_practice(p_practice uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_practice_role(p_practice, array['practice_owner']::public.practice_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.practices set status = 'active' where id = p_practice;
  update public.practitioners set listing_status = 'listed' where practice_id = p_practice and listing_status = 'draft';
end $$;
revoke execute on function public.demo_activate_practice(uuid) from public;
grant execute on function public.demo_activate_practice(uuid) to authenticated;

-- Bookkeeping so a pre-built demo snapshot can be moved forward in time when it is opened days after it was built.
create table public.demo_meta (k text primary key, v text not null);
