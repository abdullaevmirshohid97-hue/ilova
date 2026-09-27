do $$
declare
  v_org uuid; v_user uuid; v_hamkor uuid; v_hisob uuid;
  v_kut uuid; v_tas uuid; v_tolov uuid;
  v_ok boolean; v_n jsonb := '[]'::jsonb;
  v_summa numeric; v_izoh text;
begin
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-TAHRIR ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-tahrir-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user;

  insert into public.profiles (id, role, org_id, full_name)
  values (v_user, 'admin', v_org, 'Sinov admin');

  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org, 'Naqd', 'naqd', 'UZS', 0) returning id into v_hisob;

  insert into public.kassa_klientlar (org_id, ism, turi)
  values (v_org, 'Sinov hamkor', 'hamkor') returning id into v_hamkor;

  -- Ikki bitim: biri kutilmoqda, biri tasdiqlangan
  insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, tovar_nom, summa)
  values (v_org, v_hamkor, 'berdim', 'tovar', 'Karobka', 1200000)
  returning id into v_kut;

  insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, tovar_nom, summa, holat)
  values (v_org, v_hamkor, 'berdim', 'tovar', 'Shakar', 1200000, 'tasdiqlangan')
  returning id into v_tas;

  insert into public.kassa_bitim_tolovlar (org_id, klient_id, yonalish, summa, holat)
  values (v_org, v_hamkor, 'oldim', 500000, 'tasdiqlangan')
  returning id into v_tolov;

  -- ---------- 1. KUTILMOQDA — hammasi mumkin ----------
  begin
    update public.kassa_bitimlar set summa = 999999 where id = v_kut;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'kutilmoqda: summa o''zgaradi', 'ok', v_ok);

  begin
    update public.kassa_bitimlar set sana = now() - interval '3 days' where id = v_kut;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'kutilmoqda: sana o''zgaradi', 'ok', v_ok);

  -- ---------- 2. TASDIQLANGAN — pul o'zgarmaydi ----------
  begin
    update public.kassa_bitimlar set summa = 2000000 where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: summa RAD etiladi', 'ok', v_ok);

  select summa into v_summa from public.kassa_bitimlar where id = v_tas;
  v_n := v_n || jsonb_build_object(
    'nom', 'summa haqiqatan o''zgarmagan',
    'ok', v_summa = 1200000, 'izoh', v_summa::text);

  begin
    update public.kassa_bitimlar set sana = now() - interval '5 days' where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: sana RAD etiladi', 'ok', v_ok);

  begin
    update public.kassa_bitimlar set yonalish = 'oldim' where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: yo''nalish RAD etiladi', 'ok', v_ok);

  -- NULL li ustun: cheklov "is distinct from" bilan yozilgan.
  -- Oddiy tengsizlik bilan yozilsa, NULL dan qiymatga o'tish
  -- jimgina o'tib ketardi.
  begin
    update public.kassa_bitimlar set miqdor = 50 where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: NULL dan qiymatga ham RAD etiladi', 'ok', v_ok);

  -- ---------- 3. TASDIQLANGAN — izoh va muddat MUMKIN ----------
  begin
    update public.kassa_bitimlar set izoh = 'Akasi kelib to''laydi' where id = v_tas;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: izoh MUMKIN', 'ok', v_ok);

  select izoh into v_izoh from public.kassa_bitimlar where id = v_tas;
  v_n := v_n || jsonb_build_object(
    'nom', 'izoh haqiqatan yozildi',
    'ok', v_izoh is not null, 'izoh', coalesce(v_izoh, 'null'));

  begin
    update public.kassa_bitimlar set muddat = current_date + 10 where id = v_tas;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: muddat MUMKIN', 'ok', v_ok);

  -- ---------- 4. HOLAT o'zgarishi to'siqdan O'TADI ----------
  -- Busiz tasdiq va bekor qilish tugmalarining o'zi ishlamasdi.
  begin
    update public.kassa_bitimlar
       set holat = 'bekor', bekor_sabab = 'sinov'
     where id = v_tas;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'holat o''zgarishi to''sib qo''yilmaydi', 'ok', v_ok);

  -- ---------- 5. TO'LOV uchun ham ----------
  begin
    update public.kassa_bitim_tolovlar set summa = 700000 where id = v_tolov;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TO''LOV tasdiqlangan: summa RAD etiladi', 'ok', v_ok);

  begin
    update public.kassa_bitim_tolovlar set izoh = 'qayd' where id = v_tolov;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TO''LOV tasdiqlangan: izoh MUMKIN', 'ok', v_ok);

  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
