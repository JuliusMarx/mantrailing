-- Abstimmen und Anmelden geht bis zum Beginn eines Termins (auch am selben Tag).
-- Abstimmungsfrist (polls.deadline) und Anmeldeschluss (appointments.registration_deadline)
-- werden nicht mehr verwendet; die Spalten bleiben nur für alte Daten bestehen.

create or replace function public.register_for_appointment(p_appointment uuid, p_dogs uuid[])
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
  if appt.starts_at <= now() then
    raise exception 'Der Termin hat schon begonnen';
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

-- Stimmen für Vorschläge, die schon begonnen haben, werden ignoriert (die alte Stimme bleibt).
create or replace function public.submit_poll_response(p_poll uuid, p_dogs uuid[], p_votes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  pl polls%rowtype;
  v jsonb;
  opt poll_options%rowtype;
begin
  select * into pl from polls where id = p_poll;
  if not found or not public.is_member(pl.school_id) then
    raise exception 'Umfrage nicht gefunden';
  end if;
  if pl.status <> 'open' then
    raise exception 'Umfrage ist geschlossen';
  end if;
  if not exists (select 1 from poll_options where poll_id = p_poll and starts_at > now()) then
    raise exception 'Alle Terminvorschläge liegen in der Vergangenheit';
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
    select * into opt from poll_options where id = (v ->> 'option_id')::uuid and poll_id = p_poll;
    if not found then
      raise exception 'Option gehört nicht zur Umfrage';
    end if;
    continue when opt.starts_at <= now();
    insert into poll_votes (poll_option_id, user_id, answer, updated_at)
    values (opt.id, auth.uid(), v ->> 'answer', now())
    on conflict (poll_option_id, user_id)
      do update set answer = excluded.answer,
                    updated_at = case when poll_votes.answer = excluded.answer
                                      then poll_votes.updated_at else now() end;
  end loop;
end;
$$;
