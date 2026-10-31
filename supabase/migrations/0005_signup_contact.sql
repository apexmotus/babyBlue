-- 0005 · Sign-up collects a name, an email and a WhatsApp-compatible mobile number, and nothing sensitive
-- (no ID or passport numbers, no date of birth). The number is kept in international format so WhatsApp links
-- and reminders always work. The database enforces the format, so it holds no matter which client signs someone up.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

alter table public.profiles
  add constraint profiles_phone_international check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
