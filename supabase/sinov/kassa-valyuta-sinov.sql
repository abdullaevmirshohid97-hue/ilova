do $$
declare
  v_org uuid; v_b2b uuid; v_user uuid; v_hisob uuid; v_hamkor uuid;
  v_valyuta text;
  v_ok boolean; v_soni int; v_ozg jsonb; v_kurs numeric;
  v_n jsonb := '[]'::jsonb;
begin
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-VALYUTA ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-valyuta-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user;

  insert into public.profiles (id, role, org_id, full_name)
  values (v_user, 'admin', v_org, 'Sinov admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- ---------- 1. Yangi valyutalar qabul qilinadi ----------
  -- Ilovadagi ro'yxat: UZS USD EUR RUB KZT KGS TRY AZN TJS
  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org, 'Tenge', 'naqd', 'KZT', 0) returning id into v_hisob;
  v_n := v_n || jsonb_build_object('nom', 'KZT hisob yaratildi', 'ok', v_hisob is not null);

  begin
    insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
    values (v_org, 'Som', 'naqd', 'KGS', 0);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object('nom', 'KGS ham qabul qilinadi', 'ok', v_ok);

  begin
    insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
    values (v_org, 'Yolgon', 'naqd', 'XXX', 0);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'NOTANISH valyuta rad etiladi', 'ok', v_ok);

  -- Bitim va to'lovda ham
  insert into public.kassa_klientlar (org_id, ism, turi, valyuta)
  values (v_org, 'Tonirok', 'hamkor', 'KZT') returning id into v_hamkor;
  begin
    insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, summa, valyuta)
    values (v_org, v_hamkor, 'berdim', 'qarz', 100, 'TRY');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object('nom', 'bitimda TRY qabul qilinadi', 'ok', v_ok);

  -- ---------- 2. Valyuta jadvali ----------
  --
  -- Trigger tashkilot yaratilganda asosiy valyutani qo‘yadi.
  -- Usiz yangi biznes valyutasiz qolardi va unikal indeks ham
  -- ishga tushmasdi: asosiy umuman yo‘q bo‘lsa, ikkinchisini
  -- rad etadigan narsa qolmaydi.
  select count(*) into v_soni from public.kassa_valyutalar
   where org_id = v_org and asosiy;
  v_n := v_n || jsonb_build_object(
    'nom', 'TRIGGER yangi tashkilotga asosiy valyuta qo''yadi',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  select valyuta into v_valyuta from public.kassa_valyutalar
   where org_id = v_org and asosiy;
  v_n := v_n || jsonb_build_object(
    'nom', 'asosiy valyuta UZS',
    'ok', v_valyuta = 'UZS', 'izoh', coalesce(v_valyuta, 'null'));

  -- B2B tashkilotiga TEGMAYDI: trigger qamrovi tor.
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-VALYUTA B2B ' || gen_random_uuid(), 'active', array['b2b'])
  returning id into v_b2b;
  select count(*) into v_soni from public.kassa_valyutalar where org_id = v_b2b;
  v_n := v_n || jsonb_build_object(
    'nom', 'B2B tashkilotiga valyuta qo''yilmaydi',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta');

  insert into public.kassa_valyutalar (org_id, valyuta, kurs)
  values (v_org, 'USD', 11850.5);

  select kurs into v_kurs from public.kassa_valyutalar
   where org_id = v_org and valyuta = 'USD';
  v_n := v_n || jsonb_build_object(
    'nom', 'kasrli kurs saqlanadi (11850.5)',
    'ok', v_kurs = 11850.5, 'izoh', v_kurs::text);

  -- ---------- 3. ASOSIY BITTA ----------
  begin
    insert into public.kassa_valyutalar (org_id, valyuta, kurs, asosiy)
    values (v_org, 'EUR', 13000, true);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'IKKINCHI asosiy valyuta rad etiladi', 'ok', v_ok);

  -- Bir xil valyuta ikki marta ham yozilmaydi
  begin
    insert into public.kassa_valyutalar (org_id, valyuta, kurs)
    values (v_org, 'USD', 12000);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'bir valyuta IKKI MARTA yozilmaydi', 'ok', v_ok);

  -- Manfiy va nol kurs
  begin
    insert into public.kassa_valyutalar (org_id, valyuta, kurs)
    values (v_org, 'RUB', 0);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'nol kurs rad etiladi', 'ok', v_ok);

  -- ---------- 4. Sinxronizatsiya ----------
  select public.kassa_ozgarishlar(0, 2000) into v_ozg;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_ozgarishlar «valyutalar» beradi',
    'ok', v_ozg ? 'valyutalar',
    'izoh', coalesce(jsonb_array_length(v_ozg->'valyutalar'), -1)::text || ' ta');

  -- KURS MATN bo'lib chiqsin: float bo'lsa 11850.500000 yo'qolardi
  v_n := v_n || jsonb_build_object(
    'nom', 'kurs sinxda MATN (float emas)',
    'ok', jsonb_typeof(v_ozg->'valyutalar'->0->'kurs') = 'string',
    'izoh', coalesce(jsonb_typeof(v_ozg->'valyutalar'->0->'kurs'), 'yo''q'));

  -- ---------- 5. RLS va o_raqam ----------
  select count(*) into v_soni from pg_class
   where relname = 'kassa_valyutalar' and relrowsecurity;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_valyutalar da RLS yoqilgan', 'ok', v_soni = 1);

  select count(*) into v_soni from public.kassa_valyutalar
   where org_id = v_org and o_raqam is null;
  v_n := v_n || jsonb_build_object(
    'nom', 'trigger o_raqam qo''yadi (sinx uchun)',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta o''raqamsiz');

  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
