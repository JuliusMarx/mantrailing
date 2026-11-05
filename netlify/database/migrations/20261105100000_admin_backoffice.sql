-- Plattform-Admins (Backoffice) und Löschen von Hundeschulen.

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Nur über Funktionen bzw. die Admin-API zugänglich
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Erster Admin: das Konto mit dieser Login-Adresse, solange es noch keinen Admin gibt.
create function public.bootstrap_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email = 'admin-7f3k9@mantrailing.app' and not exists (select 1 from platform_admins) then
    insert into platform_admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Trigger laufen alphabetisch: nach on_auth_user_created (legt das Profil an)
create trigger on_auth_user_created_zz_admin
  after insert on auth.users
  for each row execute function public.bootstrap_admin();

insert into public.platform_admins (user_id)
  select u.id from auth.users u
  where u.email = 'admin-7f3k9@mantrailing.app' and not exists (select 1 from public.platform_admins)
  on conflict do nothing;

-- Trainer:in löscht die eigene Schule; zur Sicherheit muss der Name übereinstimmen.
-- Termine, Umfragen, Trails und Mitgliedschaften werden mitgelöscht, Konten und Hunde bleiben.
create function public.delete_school(p_school uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  sname text;
begin
  if not (public.is_trainer(p_school) or public.is_admin()) then
    raise exception 'Keine Berechtigung';
  end if;
  select name into sname from schools where id = p_school;
  if sname is null then
    raise exception 'Hundeschule nicht gefunden';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(sname)) then
    raise exception 'Der eingegebene Name stimmt nicht mit der Hundeschule überein';
  end if;
  delete from schools where id = p_school;
end;
$$;

revoke execute on function public.is_admin(), public.bootstrap_admin(),
  public.delete_school(uuid, text) from public, anon;
grant execute on function public.is_admin(), public.delete_school(uuid, text) to authenticated;
