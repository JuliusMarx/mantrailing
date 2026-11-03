-- Beitrittslink pro Hundeschule statt Einladungen pro E-Mail-Adresse.
-- Wer den Link hat und angemeldet ist, wird Kund:in der Schule. Trainer:innen können
-- den Link erneuern (alter Link wird ungültig) oder abschalten (null).

alter table public.schools
  add column join_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.schools set join_token = replace(gen_random_uuid()::text, '-', '') where join_token is null;

-- Den Token sehen nur Trainer:innen (über school_join_token), nicht alle Mitglieder.
revoke select on public.schools from authenticated;
grant select (id, name, created_at) on public.schools to authenticated;

drop function public.get_invitation(text);
drop function public.accept_invitation(text);
drop table public.invitations;

-- Schulname zum Link, auch ohne Login (für die Beitrittsseite).
create function public.school_join_info(p_token text)
returns table (school_id uuid, school_name text)
language sql stable security definer set search_path = public as $$
  select id, name from schools
  where p_token is not null and length(p_token) >= 32 and join_token = p_token;
$$;

create function public.join_school(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  select id into sid from schools where p_token is not null and length(p_token) >= 32 and join_token = p_token;
  if sid is null then
    raise exception 'Dieser Beitrittslink ist ungültig oder wurde abgeschaltet';
  end if;
  -- Wer schon Mitglied ist (auch als Trainer:in), behält seine Rolle
  insert into memberships (user_id, school_id, role) values (auth.uid(), sid, 'customer')
  on conflict (user_id, school_id) do nothing;
  return sid;
end;
$$;

create function public.school_join_token(p_school uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_trainer(p_school) then
    raise exception 'Keine Berechtigung';
  end if;
  return (select join_token from schools where id = p_school);
end;
$$;

-- p_enabled = true: neuen Link erzeugen (alter wird ungültig), false: Link abschalten.
create function public.reset_school_join_token(p_school uuid, p_enabled boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  tok text;
begin
  if not public.is_trainer(p_school) then
    raise exception 'Keine Berechtigung';
  end if;
  update schools
    set join_token = case when p_enabled then replace(gen_random_uuid()::text, '-', '') end
    where id = p_school
    returning join_token into tok;
  return tok;
end;
$$;

revoke execute on function public.school_join_info(text), public.join_school(text),
  public.school_join_token(uuid), public.reset_school_join_token(uuid, boolean) from public, anon;
grant execute on function public.join_school(text), public.school_join_token(uuid),
  public.reset_school_join_token(uuid, boolean), public.school_join_info(text) to authenticated;
grant execute on function public.school_join_info(text) to anon;
