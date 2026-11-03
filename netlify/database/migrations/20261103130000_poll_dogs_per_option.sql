-- Umfragen: Kund:innen wählen pro Terminvorschlag, mit welchen Hunden sie kommen
-- (statt Ja/Vielleicht/Nein plus einer Hundeauswahl für die ganze Umfrage).
-- Aus einer Umfrage können mehrere Termine festgelegt werden – je Vorschlag einer.

alter table public.poll_options
  add column appointment_id uuid references public.appointments (id) on delete set null;
update public.poll_options o set appointment_id = p.appointment_id
  from public.polls p where p.final_option_id = o.id and p.appointment_id is not null;

create table public.poll_option_dogs (
  poll_option_id uuid not null references public.poll_options (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_option_id, dog_id)
);
create index poll_option_dogs_user_idx on public.poll_option_dogs (user_id);

-- Wer überhaupt geantwortet hat (auch wenn an keinem Termin ein Hund ausgewählt ist)
create table public.poll_responses (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

-- Bisherige Antworten übernehmen: "Ja" mit den gewählten Hunden
insert into public.poll_option_dogs (poll_option_id, dog_id, user_id, created_at)
  select v.poll_option_id, d.dog_id, v.user_id, v.updated_at
  from public.poll_votes v
  join public.poll_options o on o.id = v.poll_option_id
  join public.poll_dogs d on d.poll_id = o.poll_id and d.user_id = v.user_id
  where v.answer = 'yes'
  on conflict do nothing;
insert into public.poll_responses (poll_id, user_id)
  select distinct poll_id, user_id from public.poll_dogs
  on conflict do nothing;

drop view public.poll_option_summary;
drop function public.submit_poll_response(uuid, uuid[], jsonb);
drop function public.finalize_poll(uuid, uuid);
drop table public.poll_votes;
drop table public.poll_dogs;

alter table public.poll_option_dogs enable row level security;
alter table public.poll_responses enable row level security;

create function public.poll_school(p_poll uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from polls where id = p_poll;
$$;

create policy poll_option_dogs_select on public.poll_option_dogs for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from poll_options o where o.id = poll_option_id and public.is_trainer(public.poll_school(o.poll_id))
    )
  );
create policy poll_responses_select on public.poll_responses for select to authenticated
  using (user_id = auth.uid() or public.is_trainer(public.poll_school(poll_id)));

-- Schreiben nur über submit_poll_response()
grant select on public.poll_option_dogs, public.poll_responses to authenticated;

create view public.poll_option_summary with (security_barrier) as
  select o.id as poll_option_id,
         o.poll_id,
         count(d.dog_id)::int as dogs,
         count(distinct d.user_id)::int as people
  from poll_options o
  join polls p on p.id = o.poll_id
  left join poll_option_dogs d on d.poll_option_id = o.id
  where public.is_member(p.school_id)
  group by o.id, o.poll_id;
grant select on public.poll_option_summary to authenticated;

-- p_choices: [{"option_id": "...", "dog_ids": ["...", ...]}]
-- Vorschläge, die schon begonnen haben oder bereits als Termin festgelegt sind, bleiben unverändert.
create function public.submit_poll_response(p_poll uuid, p_choices jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  pl polls%rowtype;
  c jsonb;
  opt poll_options%rowtype;
  v_dogs uuid[];
begin
  select * into pl from polls where id = p_poll;
  if not found or not public.is_member(pl.school_id) then
    raise exception 'Umfrage nicht gefunden';
  end if;
  if pl.status <> 'open' then
    raise exception 'Umfrage ist geschlossen';
  end if;
  if not exists (
    select 1 from poll_options where poll_id = p_poll and starts_at > now() and appointment_id is null
  ) then
    raise exception 'Für diese Umfrage kann nicht mehr abgestimmt werden';
  end if;

  for c in select * from jsonb_array_elements(coalesce(p_choices, '[]')) loop
    select * into opt from poll_options where id = (c ->> 'option_id')::uuid and poll_id = p_poll;
    if not found then
      raise exception 'Option gehört nicht zur Umfrage';
    end if;
    continue when opt.starts_at <= now() or opt.appointment_id is not null;

    select coalesce(array_agg(x::uuid), '{}') into v_dogs
      from jsonb_array_elements_text(coalesce(c -> 'dog_ids', '[]')) x;
    if exists (select 1 from unnest(v_dogs) d where not exists (
      select 1 from public.dogs where id = d and owner_id = auth.uid()
    )) then
      raise exception 'Hund gehört nicht dir';
    end if;

    delete from poll_option_dogs
      where poll_option_id = opt.id and user_id = auth.uid() and not (dog_id = any (v_dogs));
    -- bestehende Zusagen behalten ihren Zeitpunkt (für die Reihenfolge beim Festlegen)
    insert into poll_option_dogs (poll_option_id, dog_id, user_id)
      select opt.id, d, auth.uid() from unnest(v_dogs) d
      on conflict (poll_option_id, dog_id) do nothing;
  end loop;

  insert into poll_responses (poll_id, user_id) values (p_poll, auth.uid())
  on conflict (poll_id, user_id) do update set updated_at = now();
end;
$$;

-- Legt aus einem Vorschlag einen Termin an. Die dafür gewählten Hunde werden in der
-- Reihenfolge ihrer Zusage angemeldet, über der Kapazität kommen sie auf die Warteliste.
create function public.finalize_poll(p_poll uuid, p_option uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pl polls%rowtype;
  opt poll_options%rowtype;
  appt_id uuid;
  r record;
  taken int := 0;
begin
  select * into pl from polls where id = p_poll;
  if not found or not public.is_trainer(pl.school_id) then
    raise exception 'Keine Berechtigung';
  end if;
  select * into opt from poll_options where id = p_option and poll_id = p_poll for update;
  if not found then
    raise exception 'Option gehört nicht zur Umfrage';
  end if;
  if opt.appointment_id is not null then
    raise exception 'Für diesen Vorschlag gibt es schon einen Termin';
  end if;

  insert into appointments (school_id, poll_id, title, starts_at, meeting_point, meeting_address, max_dogs, notes)
  values (pl.school_id, pl.id, pl.title, opt.starts_at, pl.meeting_point, pl.meeting_address, opt.max_dogs, pl.description)
  returning id into appt_id;

  for r in
    select dog_id, user_id from poll_option_dogs
    where poll_option_id = p_option
    order by created_at, dog_id
  loop
    insert into appointment_participants (appointment_id, dog_id, user_id, status, created_at)
    values (
      appt_id, r.dog_id, r.user_id,
      case when opt.max_dogs is null or taken < opt.max_dogs then 'registered' else 'waitlist' end,
      clock_timestamp()
    );
    taken := taken + 1;
  end loop;

  update poll_options set appointment_id = appt_id where id = p_option;
  update polls set appointment_id = coalesce(appointment_id, appt_id) where id = p_poll;
  return appt_id;
end;
$$;

revoke execute on function public.poll_school(uuid), public.submit_poll_response(uuid, jsonb),
  public.finalize_poll(uuid, uuid) from public, anon;
grant execute on function public.poll_school(uuid), public.submit_poll_response(uuid, jsonb),
  public.finalize_poll(uuid, uuid) to authenticated;
