
do $$
declare
  v_org uuid; v_org2 uuid; v_user uuid;
  v_hisob uuid; v_hamkor uuid; v_hamkor2 uuid;
  v_bitim uuid; v_bitim2 uuid; v_tolov uuid;
  v_n jsonb := '[]'::jsonb; v_ok boolean;
  v_q numeric; v_soni int; v_holat text; v_turi text; v_ozg jsonb;
begin
  -- ---------- Tayyorgarlik ----------
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-BITIM ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-BITIM2 ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org2;

  -- KIRGAN FOYDALANUVCHI kerak: RPC lar org_id ni `current_org_id()`
  -- dan oladi, u esa `profiles` ni `auth.uid()` bo'yicha o'qiydi.
  -- Usiz funksiya org_id siz yozmoqchi bo'lib yiqilardi.
  --
  -- `kassa: true` metadata: `handle_new_user` shu shoxda profil
  -- yaratmay qaytadi (migratsiya 4), profilni o'zimiz qo'yamiz.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-bitim-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user;

  insert into public.profiles (id, role, org_id, full_name)
  values (v_user, 'admin', v_org, 'Sinov admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_n := v_n || jsonb_build_object(
    'nom', 'sinov konteksti: current_org_id() ishlayapti',
    'ok', public.current_org_id() = v_org,
    'izoh', coalesce(public.current_org_id()::text, 'null'));

  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org, 'Naqd', 'naqd', 'USD', 0) returning id into v_hisob;

  insert into public.kassa_klientlar (org_id, ism, turi, valyuta)
  values (v_org, 'Tonirok', 'hamkor', 'USD') returning id into v_hamkor;
  insert into public.kassa_klientlar (org_id, ism, turi)
  values (v_org2, 'Begona hamkor', 'hamkor') returning id into v_hamkor2;

  -- ---------- 1. Tovar bitimi kassaga TEGMAYDI ----------
  -- 1 200 dona x $0.10 = $120, men OLDIM -> men qarzdorman
  v_bitim := public.kassa_bitim_yarat(
    v_hamkor, 'oldim', 'tovar', 120.00,
    'Karobka', 'dona', 1200, 0.10, 'USD', 1, null, null, null, null
  );

  select count(*) into v_soni from public.kassa_yozuvlar where bitim_id = v_bitim;
  v_n := v_n || jsonb_build_object(
    'nom', 'tovar bitimi daftarga yozuv YOZMAYDI (kassa qimirlamaydi)',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta yozuv');

  select public.kassa_hisob_qoldiq(v_hisob) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'tovar bitimidan keyin hisob qoldig''i 0',
    'ok', v_q = 0, 'izoh', v_q::text);

  -- ---------- 2. Ishora qoidasi ----------
  select public.kassa_hamkor_qoldiq(v_hamkor) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', '«oldim» -> qoldiq MANFIY (men qarzdorman): -120',
    'ok', v_q = -120.00, 'izoh', v_q::text);

  -- ---------- 3. Tasdiqlanmagan bitim ham qoldiqda ----------
  select holat into v_holat from public.kassa_bitimlar where id = v_bitim;
  v_n := v_n || jsonb_build_object(
    'nom', 'yangi bitim «kutilmoqda» holatida',
    'ok', v_holat = 'kutilmoqda', 'izoh', v_holat);
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANMAGAN bitim ham qoldiqqa kiradi',
    'ok', v_q = -120.00, 'izoh', 'qoldiq ' || v_q::text);

  -- ---------- 4. Qarz bitimi daftarga TUSHADI ----------
  v_bitim2 := public.kassa_bitim_yarat(
    v_hamkor, 'berdim', 'qarz', 50.00,
    null, null, null, null, 'USD', 1, null, 'Qarzga berdim', null, v_hisob
  );
  select count(*), min(turi) into v_soni, v_turi
    from public.kassa_yozuvlar where bitim_id = v_bitim2;
  v_n := v_n || jsonb_build_object(
    'nom', 'qarz berdim -> daftarda CHIQIM yozuvi',
    'ok', v_soni = 1 and v_turi = 'chiqim', 'izoh', v_soni || ' ta, turi ' || coalesce(v_turi, '-'));

  select public.kassa_hamkor_qoldiq(v_hamkor) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'qoldiq: -120 + 50 = -70',
    'ok', v_q = -70.00, 'izoh', v_q::text);

  -- ---------- 5. Hisobsiz qarz bitimi rad etiladi ----------
  begin
    perform public.kassa_bitim_yarat(v_hamkor, 'berdim', 'qarz', 10, null, null, null, null, 'USD', 1, null, null, null, null);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%HISOB_KERAK%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'pul harakati bor bitim hisobsiz yozilmaydi', 'ok', v_ok);

  -- ---------- 6. Qisman to'lov ----------
  -- Men qarzdorman (bitim 'oldim'), demak to'lov 'berdim'
  v_tolov := public.kassa_tolov_qosh(
    v_hamkor, 'berdim', 70.00, v_hisob, v_bitim, 'naqd', 'USD', 1, null, null, null
  );
  select public.kassa_bitim_qoldiq(v_bitim) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'qisman to''lov: 120 - 70 = 50 qoldi',
    'ok', v_q = 50.00, 'izoh', v_q::text);

  select holat into v_holat from public.kassa_bitimlar where id = v_bitim;
  v_n := v_n || jsonb_build_object(
    'nom', 'qisman to''langan bitim YOPILMAYDI',
    'ok', v_holat <> 'yopilgan', 'izoh', v_holat);

  -- ---------- 7. To'liq to'lov bitimni yopadi ----------
  perform public.kassa_tolov_qosh(
    v_hamkor, 'berdim', 50.00, v_hisob, v_bitim, 'naqd', 'USD', 1, null, null, null
  );
  select holat into v_holat from public.kassa_bitimlar where id = v_bitim;
  v_n := v_n || jsonb_build_object(
    'nom', 'to''liq to''langach bitim «yopilgan»',
    'ok', v_holat = 'yopilgan', 'izoh', v_holat);

  select public.kassa_bitim_qoldiq(v_bitim) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'yopilgan bitim qoldig''i 0', 'ok', v_q = 0, 'izoh', v_q::text);

  -- ---------- 8. To'lov yo'nalishi TESKARI bo'lishi shart ----------
  begin
    perform public.kassa_tolov_qosh(
      v_hamkor, 'oldim', 10.00, v_hisob, v_bitim, 'naqd', 'USD', 1, null, null, null
    );
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%YONALISH_TESKARI%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'bitim bilan bir xil yo''nalishdagi to''lov rad etiladi', 'ok', v_ok);

  -- ---------- 9. Begona hamkorga to'lov ----------
  begin
    perform public.kassa_tolov_qosh(
      v_hamkor2, 'berdim', 10.00, v_hisob, v_bitim, 'naqd', 'USD', 1, null, null, null
    );
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'boshqa tenant hamkoriga to''lov yozib bo''lmaydi', 'ok', v_ok);

  -- ---------- 10. Hamkorsiz bitim yo'q ----------
  begin
    insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, summa)
    values (v_org, null, 'oldim', 'qarz', 10);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'hamkorsiz bitim yaratib bo''lmaydi', 'ok', v_ok);

  -- ---------- 11. Nomsiz tovar ----------
  begin
    insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, summa)
    values (v_org, v_hamkor, 'oldim', 'tovar', 10);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'nomsiz tovar bitimi rad etiladi', 'ok', v_ok);

  -- ---------- 12. Manfiy va nol summa ----------
  begin
    insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, summa)
    values (v_org, v_hamkor, 'oldim', 'qarz', 0);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'nol summali bitim rad etiladi', 'ok', v_ok);

  -- ---------- 13. Bekor qilingan bitim qoldiqdan chiqadi ----------
  select public.kassa_hamkor_qoldiq(v_hamkor) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'bekordan oldin qoldiq: -120 +50 +120 = 50',
    'ok', v_q = 50.00, 'izoh', v_q::text);

  update public.kassa_bitimlar
     set holat = 'bekor', bekor_sabab = 'sinov'
   where id = v_bitim2;
  select public.kassa_hamkor_qoldiq(v_hamkor) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'bekor qilingan bitim qoldiqdan CHIQADI: 50 - 50 = 0',
    'ok', v_q = 0, 'izoh', v_q::text);

  -- ---------- 14. Kasr yo'qolmaydi ----------
  perform public.kassa_bitim_yarat(
    v_hamkor, 'berdim', 'tovar', 125000.50,
    'Mato', 'metr', 1000.5, 124.94, 'UZS', 1, null, null, null, null
  );
  select summa into v_q from public.kassa_bitimlar
   where klient_id = v_hamkor and tovar_nom = 'Mato';
  v_n := v_n || jsonb_build_object(
    'nom', 'kasr saqlanadi: 125000.50', 'ok', v_q = 125000.50, 'izoh', v_q::text);

  -- ---------- 15. Sinxronizatsiya ikki yangi jadvalni beradi ----------
  select public.kassa_ozgarishlar(0, 2000) into v_ozg;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_ozgarishlar «bitimlar» massivini qaytaradi',
    'ok', v_ozg ? 'bitimlar', 'izoh', coalesce(jsonb_array_length(v_ozg->'bitimlar'), -1)::text || ' ta');
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_ozgarishlar «tolovlar» massivini qaytaradi',
    'ok', v_ozg ? 'tolovlar', 'izoh', coalesce(jsonb_array_length(v_ozg->'tolovlar'), -1)::text || ' ta');

  -- Pul MATN bo'lib chiqsin (float bo'lsa kasr nollari yo'qoladi)
  v_ok := jsonb_typeof((v_ozg->'bitimlar'->0->'summa')) = 'string';
  v_n := v_n || jsonb_build_object(
    'nom', 'bitim summasi sinxda MATN (float emas)',
    'ok', v_ok, 'izoh', jsonb_typeof(v_ozg->'bitimlar'->0->'summa'));

  -- ---------- Hammasini qaytarib olamiz ----------
  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;

