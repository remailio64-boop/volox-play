-- Server-managed commercial exceptions; no addresses are kept in source control.
create table volox_private.approved_organizer_emails(
 email text primary key check(email=lower(btrim(email)) and position('@' in email)>1),
 granted_at timestamptz not null default now()
);
alter table volox_private.approved_organizer_emails enable row level security;
revoke all on volox_private.approved_organizer_emails from public,anon,authenticated;

create function volox_private.activate_free_organizer_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(
  select 1 from volox_private.approved_organizer_emails e where e.email=lower(btrim(new.email))
 ) then
  insert into public.platform_free_organizers(organizer_id) values(new.id) on conflict(organizer_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function volox_private.activate_free_organizer_account() from public,anon,authenticated;
create trigger activate_approved_free_organizer
 after insert or update of email,email_confirmed_at on auth.users
 for each row execute function volox_private.activate_free_organizer_account();
