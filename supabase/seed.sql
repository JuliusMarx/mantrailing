-- Testdaten für die Entwicklung. NICHT in Produktion ausführen.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen (nach der Migration).
--
-- Test-Logins (Passwort für alle: Trail-Test-2026!)
--   trainer@mantrailing.test  – Trainerin der "Spürnasen Mantrailing"
--   kunde@mantrailing.test    – Kundin mit den Hunden Luna und Balu
--   kunde2@mantrailing.test   – Kunde mit dem Hund Rex

do $$
declare
  pw text := 'Trail-Test-2026!';
  trainer uuid := '11111111-1111-1111-1111-111111111111';
  kunde uuid := '22222222-2222-2222-2222-222222222222';
  kunde2 uuid := '33333333-3333-3333-3333-333333333333';
  school uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  u record;
  poll uuid;
begin
  for u in
    select * from (values
      (trainer, 'trainer@mantrailing.test', 'Tina Trainerin'),
      (kunde, 'kunde@mantrailing.test', 'Karla Kundin'),
      (kunde2, 'kunde2@mantrailing.test', 'Konrad Kunde')
    ) as t (id, email, name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt(pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.name),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;
  end loop;

  insert into public.schools (id, name) values (school, 'Spürnasen Mantrailing') on conflict do nothing;
  insert into public.memberships (user_id, school_id, role) values
    (trainer, school, 'trainer'), (kunde, school, 'customer'), (kunde2, school, 'customer')
  on conflict do nothing;

  insert into public.dogs (owner_id, name, breed, birth_date) values
    (kunde, 'Luna', 'Labrador Retriever', '2021-04-12'),
    (kunde, 'Balu', 'Beagle', '2019-09-03'),
    (kunde2, 'Rex', 'Deutscher Schäferhund', '2020-01-20');

  insert into public.appointments (school_id, created_by, title, starts_at, ends_at, meeting_point,
                                   meeting_address, max_dogs, notes)
  values (school, trainer, 'Stadttrail Innenstadt', date_trunc('day', now()) + interval '4 days 9 hours',
          date_trunc('day', now()) + interval '4 days 12 hours',
          '{"type":"Point","coordinates":[8.6821,50.1109]}', 'Römerberg, Frankfurt am Main', 6,
          'Bitte Geruchsartikel in Tüte mitbringen.');

  insert into public.polls (school_id, created_by, title, description, meeting_address, deadline)
  values (school, trainer, 'Waldtrail im Stadtwald', 'Langer Trail mit Liegezeit 2 h.',
          'Parkplatz Oberschweinstiege', now() + interval '5 days')
  returning id into poll;
  insert into public.poll_options (poll_id, starts_at, ends_at, max_dogs) values
    (poll, date_trunc('day', now()) + interval '9 days 9 hours', date_trunc('day', now()) + interval '9 days 12 hours', 5),
    (poll, date_trunc('day', now()) + interval '9 days 14 hours', date_trunc('day', now()) + interval '9 days 17 hours', 5),
    (poll, date_trunc('day', now()) + interval '10 days 10 hours', date_trunc('day', now()) + interval '10 days 13 hours', 5);
end;
$$;
