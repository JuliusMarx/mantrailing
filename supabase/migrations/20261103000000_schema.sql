-- Mantrailing: Schema, Row-Level-Security und RPCs.
-- Mehrere Hundeschulen (Mandanten); Rollen pro Schule: trainer / customer.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  role text not null check (role in ('trainer', 'customer')),
  created_at timestamptz not null default now(),
  primary key (user_id, school_id)
);
create index memberships_school_idx on public.memberships (school_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null,
  role text not null default 'customer' check (role in ('trainer', 'customer')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invitations_school_idx on public.invitations (school_id);

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  breed text,
  birth_date date,
  notes text,
  photo_url text,
  created_at timestamptz not null default now()
);
create index dogs_owner_idx on public.dogs (owner_id);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  meeting_point jsonb,
  meeting_address text,
  deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'closed', 'finalized')),
  final_option_id uuid,
  appointment_id uuid,
  created_at timestamptz not null default now()
);
create index polls_school_idx on public.polls (school_id);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  max_dogs int check (max_dogs is null or max_dogs > 0)
);
create index poll_options_poll_idx on public.poll_options (poll_id);

alter table public.polls
  add constraint polls_final_option_fk foreign key (final_option_id)
  references public.poll_options (id) on delete set null;

create table public.poll_votes (
  poll_option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (poll_option_id, user_id)
);

create table public.poll_dogs (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  primary key (poll_id, dog_id)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  poll_id uuid references public.polls (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  title text not null check (length(trim(title)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz,
  meeting_point jsonb,
  meeting_address text,
  max_dogs int check (max_dogs is null or max_dogs > 0),
  registration_deadline timestamptz,
  status text not null default 'planned' check (status in ('planned', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);
create index appointments_school_start_idx on public.appointments (school_id, starts_at);

alter table public.polls
  add constraint polls_appointment_fk foreign key (appointment_id)
  references public.appointments (id) on delete set null;

create table public.appointment_participants (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('registered', 'waitlist', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (appointment_id, dog_id)
);
create index participants_user_idx on public.appointment_participants (user_id);

create table public.trails (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  appointment_id uuid references public.appointments (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  description text,
  difficulty smallint check (difficulty between 1 and 5),
  surface text,
  -- GeoJSON LineString der fertigen Route
  route jsonb,
  -- Stützpunkte [{id, lng, lat, type, note}] für den Editor
  waypoints jsonb not null default '[]',
  -- Segmente [{mode, coords}] zwischen den Stützpunkten (erneut bearbeitbar ohne Routing)
  segments jsonb not null default '[]',
  length_m numeric not null default 0,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trails_school_idx on public.trails (school_id);

create table public.trail_assignments (
  id uuid primary key default gen_random_uuid(),
  trail_id uuid not null references public.trails (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null default auth.uid(),
  message text,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (trail_id, customer_id)
);
create index trail_assignments_customer_idx on public.trail_assignments (customer_id);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create function public.is_member(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where user_id = auth.uid() and school_id = p_school);
$$;

create function public.is_trainer(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and school_id = p_school and role = 'trainer'
  );
$$;

-- Ich bin Trainer in einer Schule, in der p_user Mitglied ist.
create function public.is_trainer_of_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships me
    join memberships other on other.school_id = me.school_id
    where me.user_id = auth.uid() and me.role = 'trainer' and other.user_id = p_user
  );
$$;

-- Profile sieht man von sich selbst, als Trainer von Mitgliedern der eigenen
-- Schule und als Kunde von den Trainern der eigenen Schule.
create function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
    or public.is_trainer_of_user(p_user)
    or exists (
      select 1 from memberships me
      join memberships other on other.school_id = me.school_id
      where me.user_id = auth.uid() and other.user_id = p_user and other.role = 'trainer'
    );
$$;

-- Schule eines Trails / Zuweisung an mich, ohne RLS (verhindert rekursive Policies
-- zwischen trails und trail_assignments).
create function public.trail_school(p_trail uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from trails where id = p_trail;
$$;

create function public.is_assigned_trail(p_trail uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trail_assignments where trail_id = p_trail and customer_id = auth.uid());
$$;

-- Länge einer GeoJSON-LineString in Metern (Haversine, ohne PostGIS).
create function public.line_length_m(p_line jsonb) returns numeric
language plpgsql immutable as $$
declare
  coords jsonb := p_line -> 'coordinates';
  total double precision := 0;
  i int;
  lat1 double precision; lon1 double precision;
  lat2 double precision; lon2 double precision;
  a double precision;
begin
  if coords is null or jsonb_typeof(coords) <> 'array' or jsonb_array_length(coords) < 2 then
    return 0;
  end if;
  for i in 1 .. jsonb_array_length(coords) - 1 loop
    lon1 := radians((coords -> (i - 1) ->> 0)::double precision);
    lat1 := radians((coords -> (i - 1) ->> 1)::double precision);
    lon2 := radians((coords -> i ->> 0)::double precision);
    lat2 := radians((coords -> i ->> 1)::double precision);
    a := sin((lat2 - lat1) / 2) ^ 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ^ 2;
    total := total + 2 * 6371008.8 * asin(least(1, sqrt(a)));
  end loop;
  return round(total::numeric, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.trails_before_write() returns trigger
language plpgsql as $$
begin
  new.length_m := public.line_length_m(new.route);
  new.updated_at := now();
  return new;
end;
$$;

create trigger trails_before_write
  before insert or update on public.trails
  for each row execute function public.trails_before_write();

-- Rückt Hunde von der Warteliste nach, solange Plätze frei sind.
create function public.promote_waitlist(p_appointment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cap int;
  taken int;
  next_id uuid;
begin
  select max_dogs into cap from appointments where id = p_appointment and status = 'planned';
  if not found then
    return;
  end if;
  loop
    select count(*) into taken from appointment_participants
      where appointment_id = p_appointment and status = 'registered';
    exit when cap is not null and taken >= cap;
    select id into next_id from appointment_participants
      where appointment_id = p_appointment and status = 'waitlist'
      order by created_at, id limit 1;
    exit when next_id is null;
    update appointment_participants set status = 'registered' where id = next_id;
  end loop;
end;
$$;

create function public.participants_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'registered' and (tg_op = 'DELETE' or new.status <> 'registered') then
    perform public.promote_waitlist(old.appointment_id);
  end if;
  return null;
end;
$$;

create trigger participants_after_change
  after update or delete on public.appointment_participants
  for each row execute function public.participants_after_change();

create function public.appointments_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.max_dogs is distinct from old.max_dogs or new.status <> old.status then
    perform public.promote_waitlist(new.id);
  end if;
  return null;
end;
$$;

create trigger appointments_after_update
  after update on public.appointments
  for each row execute function public.appointments_after_update();

-- ---------------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------------

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.dogs enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.poll_dogs enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_participants enable row level security;
alter table public.trails enable row level security;
alter table public.trail_assignments enable row level security;

-- schools: Anlegen nur über create_school()
create policy schools_select on public.schools for select to authenticated
  using (public.is_member(id));
create policy schools_update on public.schools for update to authenticated
  using (public.is_trainer(id)) with check (public.is_trainer(id));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships: Beitritt nur über accept_invitation() / create_school()
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_trainer(school_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_trainer(school_id) and user_id <> auth.uid())
  with check (public.is_trainer(school_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = auth.uid() or public.is_trainer(school_id));

-- invitations
create policy invitations_trainer on public.invitations for all to authenticated
  using (public.is_trainer(school_id)) with check (public.is_trainer(school_id));

-- dogs
create policy dogs_owner on public.dogs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy dogs_trainer_select on public.dogs for select to authenticated
  using (public.is_trainer_of_user(owner_id));

-- polls / poll_options
create policy polls_select on public.polls for select to authenticated
  using (public.is_member(school_id));
create policy polls_trainer on public.polls for all to authenticated
  using (public.is_trainer(school_id)) with check (public.is_trainer(school_id));

create policy poll_options_select on public.poll_options for select to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and public.is_member(p.school_id)));
create policy poll_options_trainer on public.poll_options for all to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and public.is_trainer(p.school_id)))
  with check (exists (select 1 from polls p where p.id = poll_id and public.is_trainer(p.school_id)));

-- poll_votes / poll_dogs: Schreiben nur über submit_poll_response()
create policy poll_votes_select on public.poll_votes for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from poll_options o join polls p on p.id = o.poll_id
      where o.id = poll_option_id and public.is_trainer(p.school_id)
    )
  );
create policy poll_dogs_select on public.poll_dogs for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from polls p where p.id = poll_id and public.is_trainer(p.school_id))
  );

-- appointments
create policy appointments_select on public.appointments for select to authenticated
  using (public.is_member(school_id));
create policy appointments_trainer on public.appointments for all to authenticated
  using (public.is_trainer(school_id)) with check (public.is_trainer(school_id));

-- appointment_participants: Kunden melden sich über register_for_appointment() an
create policy participants_select on public.appointment_participants for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from appointments a where a.id = appointment_id and public.is_trainer(a.school_id))
  );
create policy participants_trainer on public.appointment_participants for all to authenticated
  using (exists (select 1 from appointments a where a.id = appointment_id and public.is_trainer(a.school_id)))
  with check (exists (select 1 from appointments a where a.id = appointment_id and public.is_trainer(a.school_id)));

-- trails
create policy trails_select on public.trails for select to authenticated
  using (public.is_trainer(school_id) or public.is_assigned_trail(id));
create policy trails_trainer on public.trails for all to authenticated
  using (public.is_trainer(school_id)) with check (public.is_trainer(school_id));

-- trail_assignments
create policy trail_assignments_select on public.trail_assignments for select to authenticated
  using (customer_id = auth.uid() or public.is_trainer(public.trail_school(trail_id)));
create policy trail_assignments_trainer on public.trail_assignments for all to authenticated
  using (public.is_trainer(public.trail_school(trail_id)))
  with check (
    public.is_trainer(public.trail_school(trail_id))
    and exists (
      select 1 from memberships m
      where m.school_id = public.trail_school(trail_id) and m.user_id = customer_id
    )
  );

-- ---------------------------------------------------------------------------
-- Views (Zusammenfassungen, die Kunden ohne Einblick in fremde Anmeldungen sehen)
-- ---------------------------------------------------------------------------

create view public.appointment_summary with (security_barrier) as
  select a.id as appointment_id,
         count(*) filter (where p.status = 'registered')::int as registered_dogs,
         count(*) filter (where p.status = 'waitlist')::int as waitlist_dogs
  from appointments a
  left join appointment_participants p on p.appointment_id = a.id
  where public.is_member(a.school_id)
  group by a.id;

create view public.poll_option_summary with (security_barrier) as
  select o.id as poll_option_id,
         o.poll_id,
         count(distinct v.user_id) filter (where v.answer = 'yes')::int as yes_people,
         count(distinct v.user_id) filter (where v.answer = 'maybe')::int as maybe_people,
         count(distinct v.user_id) filter (where v.answer = 'no')::int as no_people,
         count(d.dog_id) filter (where v.answer = 'yes')::int as yes_dogs,
         count(d.dog_id) filter (where v.answer = 'maybe')::int as maybe_dogs
  from poll_options o
  join polls p on p.id = o.poll_id
  left join poll_votes v on v.poll_option_id = o.id
  left join poll_dogs d on d.poll_id = o.poll_id and d.user_id = v.user_id
  where public.is_member(p.school_id)
  group by o.id, o.poll_id;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_school(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  insert into schools (name) values (trim(p_name)) returning id into new_id;
  insert into memberships (user_id, school_id, role) values (auth.uid(), new_id, 'trainer');
  return new_id;
end;
$$;

-- Infos zu einer Einladung, auch ohne Login (für die Einladungsseite).
create function public.get_invitation(p_token text)
returns table (school_name text, email text, role text, valid boolean)
language sql stable security definer set search_path = public as $$
  select s.name, i.email, i.role, (i.accepted_at is null and i.expires_at > now())
  from invitations i join schools s on s.id = i.school_id
  where i.token = p_token;
$$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  my_email text;
begin
  select * into inv from invitations where token = p_token for update;
  if not found or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'Einladung ungültig oder abgelaufen';
  end if;
  select email into my_email from auth.users where id = auth.uid();
  if my_email is null or lower(my_email) <> lower(inv.email) then
    raise exception 'Diese Einladung gilt für eine andere E-Mail-Adresse';
  end if;
  insert into memberships (user_id, school_id, role)
  values (auth.uid(), inv.school_id, inv.role)
  on conflict (user_id, school_id) do update
    set role = case when memberships.role = 'trainer' then 'trainer' else excluded.role end;
  update invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  return inv.school_id;
end;
$$;

create function public.register_for_appointment(p_appointment uuid, p_dogs uuid[])
returns table (dog_id uuid, status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  appt appointments%rowtype;
  d uuid;
  taken int;
  new_status text;
begin
  select * into appt from appointments where id = p_appointment for update;
  if not found or not public.is_member(appt.school_id) then
    raise exception 'Termin nicht gefunden';
  end if;
  if appt.status <> 'planned' then
    raise exception 'Termin wurde abgesagt';
  end if;
  if coalesce(appt.registration_deadline, appt.starts_at) <= now() then
    raise exception 'Anmeldeschluss ist vorbei';
  end if;

  foreach d in array p_dogs loop
    if not exists (select 1 from dogs where id = d and owner_id = auth.uid()) then
      raise exception 'Hund gehört nicht dir';
    end if;
    if exists (
      select 1 from appointment_participants
      where appointment_id = p_appointment and dog_id = d and status <> 'cancelled'
    ) then
      continue;
    end if;
    select count(*) into taken from appointment_participants
      where appointment_id = p_appointment and status = 'registered';
    new_status := case when appt.max_dogs is null or taken < appt.max_dogs then 'registered' else 'waitlist' end;
    insert into appointment_participants (appointment_id, dog_id, user_id, status)
    values (p_appointment, d, auth.uid(), new_status)
    on conflict (appointment_id, dog_id)
      do update set status = excluded.status, created_at = now(), user_id = excluded.user_id;
  end loop;

  return query
    select p.dog_id, p.status from appointment_participants p
    where p.appointment_id = p_appointment and p.dog_id = any (p_dogs);
end;
$$;

create function public.cancel_registration(p_appointment uuid, p_dogs uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from appointments where id = p_appointment for update;
  update appointment_participants
    set status = 'cancelled'
    where appointment_id = p_appointment and dog_id = any (p_dogs)
      and user_id = auth.uid() and status <> 'cancelled';
end;
$$;

-- p_votes: [{"option_id": "...", "answer": "yes|maybe|no"}]
create function public.submit_poll_response(p_poll uuid, p_dogs uuid[], p_votes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  pl polls%rowtype;
  v jsonb;
begin
  select * into pl from polls where id = p_poll;
  if not found or not public.is_member(pl.school_id) then
    raise exception 'Umfrage nicht gefunden';
  end if;
  if pl.status <> 'open' or (pl.deadline is not null and pl.deadline <= now()) then
    raise exception 'Umfrage ist geschlossen';
  end if;
  if exists (select 1 from unnest(p_dogs) x where not exists (
    select 1 from dogs where id = x and owner_id = auth.uid()
  )) then
    raise exception 'Hund gehört nicht dir';
  end if;

  delete from poll_dogs where poll_id = p_poll and user_id = auth.uid();
  insert into poll_dogs (poll_id, user_id, dog_id)
    select p_poll, auth.uid(), x from unnest(p_dogs) x;

  for v in select * from jsonb_array_elements(coalesce(p_votes, '[]')) loop
    if not exists (select 1 from poll_options where id = (v ->> 'option_id')::uuid and poll_id = p_poll) then
      raise exception 'Option gehört nicht zur Umfrage';
    end if;
    insert into poll_votes (poll_option_id, user_id, answer, updated_at)
    values ((v ->> 'option_id')::uuid, auth.uid(), v ->> 'answer', now())
    on conflict (poll_option_id, user_id)
      do update set answer = excluded.answer,
                    updated_at = case when poll_votes.answer = excluded.answer
                                      then poll_votes.updated_at else now() end;
  end loop;
end;
$$;

-- Legt aus einer Option einen Termin an. Ja-Stimmen werden angemeldet (bis zur
-- Kapazität, Rest auf die Warteliste), Vielleicht-Stimmen kommen auf die Warteliste.
create function public.finalize_poll(p_poll uuid, p_option uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pl polls%rowtype;
  opt poll_options%rowtype;
  appt_id uuid;
  r record;
  taken int := 0;
begin
  select * into pl from polls where id = p_poll for update;
  if not found or not public.is_trainer(pl.school_id) then
    raise exception 'Keine Berechtigung';
  end if;
  if pl.status = 'finalized' then
    raise exception 'Umfrage wurde bereits festgelegt';
  end if;
  select * into opt from poll_options where id = p_option and poll_id = p_poll;
  if not found then
    raise exception 'Option gehört nicht zur Umfrage';
  end if;

  insert into appointments (school_id, poll_id, title, starts_at, ends_at, meeting_point,
                            meeting_address, max_dogs, notes)
  values (pl.school_id, pl.id, pl.title, opt.starts_at, opt.ends_at, pl.meeting_point,
          pl.meeting_address, opt.max_dogs, pl.description)
  returning id into appt_id;

  for r in
    select d.dog_id, d.user_id, v.answer
    from poll_votes v
    join poll_dogs d on d.poll_id = p_poll and d.user_id = v.user_id
    where v.poll_option_id = p_option and v.answer in ('yes', 'maybe')
    order by (v.answer = 'yes') desc, v.updated_at, d.dog_id
  loop
    insert into appointment_participants (appointment_id, dog_id, user_id, status, created_at)
    values (
      appt_id, r.dog_id, r.user_id,
      case when r.answer = 'yes' and (opt.max_dogs is null or taken < opt.max_dogs)
           then 'registered' else 'waitlist' end,
      clock_timestamp()
    );
    if r.answer = 'yes' and (opt.max_dogs is null or taken < opt.max_dogs) then
      taken := taken + 1;
    end if;
  end loop;

  update polls set status = 'finalized', final_option_id = p_option, appointment_id = appt_id
    where id = p_poll;
  return appt_id;
end;
$$;

create function public.enable_trail_share(p_trail uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  tok text;
begin
  if not exists (select 1 from trails where id = p_trail and public.is_trainer(school_id)) then
    raise exception 'Keine Berechtigung';
  end if;
  update trails
    set share_token = coalesce(share_token, replace(gen_random_uuid()::text, '-', '')
                                            || replace(gen_random_uuid()::text, '-', ''))
    where id = p_trail
    returning share_token into tok;
  return tok;
end;
$$;

-- Öffentliche Ansicht über den geteilten Link (auch für anon).
create function public.get_shared_trail(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'description', t.description, 'difficulty', t.difficulty,
    'surface', t.surface, 'route', t.route, 'waypoints', t.waypoints,
    'length_m', t.length_m, 'school_name', s.name
  )
  from trails t join schools s on s.id = t.school_id
  where p_token is not null and length(p_token) >= 32 and t.share_token = p_token;
$$;

create function public.mark_trail_seen(p_trail uuid) returns void
language sql security definer set search_path = public as $$
  update trail_assignments set seen_at = coalesce(seen_at, now())
  where trail_id = p_trail and customer_id = auth.uid();
$$;

create function public.delete_my_account() returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert on public.schools, public.memberships, public.poll_votes, public.poll_dogs from authenticated;
revoke update, delete on public.poll_votes, public.poll_dogs from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.get_shared_trail(text), public.get_invitation(text) to anon;
