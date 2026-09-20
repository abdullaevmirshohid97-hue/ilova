// =============================================================
//  CLARY — TELEGRAM TASDIQLASH SINOVI
//
//  Tasdiq — DALIL, shart emas (reja 7.4). Demak bu yerda
//  tekshiriladigan narsa qoldiq emas, HUQUQ: kim nimani
//  tasdiqlay oladi va qachon oladi.
//
//  Eng muhim to'rttasi:
//
//   1. TOKEN BIR MARTALIK. Ikkinchi marta ishlamaydi — aks holda
//      havola boshqa odamga o'tsa, u qayta bosib yurardi.
//   2. TOKEN MUDDATLI. 7 kundan keyin o'ladi.
//   3. FAQAT `kutilmoqda` TASDIQLANADI. Yopilgan yoki bekor
//      qilingan bitimni qayta tasdiqlab bo'lmaydi.
//   4. BOT `bitim_id` NI QABUL QILMAYDI. Zanjir bazada token'dan
//      qaytadan quriladi: bot yolg'on id yuborsa ham ta'sir
//      qilmaydi, chunki bunday parametr umuman yo'q.
//
//  Va bittasi jim: TASDIQ QOLDIQNI O'ZGARTIRMASLIGI kerak.
//  O'zgartirsa, hamkor tugmani bosgan kuni daftardagi raqam
//  sakrab ketardi.
//
//  Hammasi BITTA `do` blokida bajariladi va oxirida `raise
//  exception` bilan QAYTARIB OLINADI — jonli bazada iz qolmaydi.
//
//  Ishga tushirish:  node tests/kassa-tasdiq.mjs
//  SQL ni ko'rish:   node tests/kassa-tasdiq.mjs --sql
// =============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

const BLOK = `
do $$
declare
  v_org uuid; v_org2 uuid; v_user uuid;
  v_hisob uuid; v_hamkor uuid; v_hamkor2 uuid;
  v_bitim uuid; v_bitim2 uuid; v_yopiq uuid;
  v_hav jsonb; v_tok text; v_tok2 text;
  v_kor jsonb; v_natija jsonb;
  v_n jsonb := '[]'::jsonb;
  v_q numeric; v_qoldiq_oldin numeric; v_soni int; v_tg bigint;
begin
  -- ---------- Tayyorgarlik ----------
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-TASDIQ ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-TASDIQ2 ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org2;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-tasdiq-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user;

  insert into public.profiles (id, role, org_id, full_name)
  values (v_user, 'admin', v_org, 'Sinov admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org, 'Naqd', 'naqd', 'USD', 0) returning id into v_hisob;

  insert into public.kassa_klientlar (org_id, ism, turi, valyuta)
  values (v_org, 'Tonirok', 'hamkor', 'USD') returning id into v_hamkor;
  insert into public.kassa_klientlar (org_id, ism, turi)
  values (v_org2, 'Begona hamkor', 'hamkor') returning id into v_hamkor2;

  -- 1 200 dona x $0.10 = $120
  v_bitim := public.kassa_bitim_yarat(
    v_hamkor, 'berdim', 'tovar', 120.00,
    'Karobka', 'dona', 1200, 0.10, 'USD', 1, null, null, null, null
  );

  -- ---------- 1. Havola yaratish ----------
  v_hav := public.kassa_tasdiq_havola(v_bitim);
  v_tok := v_hav->>'token';

  v_n := v_n || jsonb_build_object(
    'nom', 'havola yaratildi va "T_" bilan boshlanadi',
    'ok', left(v_tok, 2) = 'T_' and length(v_tok) = 34,
    'izoh', coalesce(left(v_tok, 6) || '... (' || length(v_tok) || ' belgi)', 'null'));

  -- Telegram callback_data 64 baytdan oshmasligi kerak: "t:" + token
  v_n := v_n || jsonb_build_object(
    'nom', 'token callback_data ga sig''adi (64 bayt)',
    'ok', length(v_tok) + 2 <= 64,
    'izoh', (length(v_tok) + 2) || ' bayt');

  -- Token matni bazada SAQLANMAYDI, faqat xeshi
  select count(*) into v_soni from public.kassa_tasdiq_tokenlar
   where bitim_id = v_bitim and xesh = v_tok;
  v_n := v_n || jsonb_build_object(
    'nom', 'token matni bazada saqlanmaydi (faqat xesh)',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta ochiq token');

  select count(*) into v_soni from public.kassa_tasdiq_tokenlar
   where bitim_id = v_bitim
     and xesh = encode(extensions.digest(v_tok, 'sha256'), 'hex');
  v_n := v_n || jsonb_build_object(
    'nom', 'xesh mos keladi',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  -- ---------- 2. Kartochkani ko'rish ----------
  v_kor := public.kassa_tasdiq_korish(v_tok);
  v_n := v_n || jsonb_build_object(
    'nom', 'kartochkada tovar, miqdor va summa bor',
    'ok', v_kor->>'tovar_nom' = 'Karobka'
      and v_kor->>'summa' = '120.00'
      and v_kor->>'hamkor' = 'Tonirok',
    'izoh', coalesce(v_kor->>'tovar_nom', '?') || ' / ' || coalesce(v_kor->>'summa', '?'));

  -- Pul MATN bo'lib chiqadi: to_jsonb numeric ni float ga
  -- aylantirsa, 0.1 + 0.2 muammosi ilovaga kirib kelardi.
  v_n := v_n || jsonb_build_object(
    'nom', 'summa JSON da MATN (float emas)',
    'ok', jsonb_typeof(v_kor->'summa') = 'string',
    'izoh', jsonb_typeof(v_kor->'summa'));

  -- Ko'rish tokenni SARFLAMAYDI
  select count(*) into v_soni from public.kassa_tasdiq_tokenlar
   where bitim_id = v_bitim and ishlatilgan_at is not null;
  v_n := v_n || jsonb_build_object(
    'nom', 'kartochkani ko''rish tokenni sarflamaydi',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta ishlatilgan');

  -- ---------- 3. Tasdiq qoldiqni O'ZGARTIRMAYDI ----------
  select public.kassa_hamkor_qoldiq(v_hamkor) into v_qoldiq_oldin;

  v_natija := public.kassa_tasdiq_bajar(v_tok, 555001, 'tasdiq');
  v_n := v_n || jsonb_build_object(
    'nom', 'tasdiq qabul qilindi',
    'ok', (v_natija->>'ok')::boolean and v_natija->>'holat' = 'tasdiqlangan',
    'izoh', coalesce(v_natija::text, 'null'));

  v_n := v_n || jsonb_build_object(
    'nom', 'bitim holati tasdiqlangan bo''ldi',
    'ok', (select holat from public.kassa_bitimlar where id = v_bitim) = 'tasdiqlangan',
    'izoh', (select holat from public.kassa_bitimlar where id = v_bitim));

  select public.kassa_hamkor_qoldiq(v_hamkor) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQ QOLDIQNI O''ZGARTIRMAYDI',
    'ok', v_q = v_qoldiq_oldin,
    'izoh', v_qoldiq_oldin::text || ' -> ' || v_q::text);

  -- Hamkorga chat bog'landi
  select telegram_id into v_tg from public.kassa_klientlar where id = v_hamkor;
  v_n := v_n || jsonb_build_object(
    'nom', 'hamkorga telegram_id bog''landi',
    'ok', v_tg = 555001, 'izoh', coalesce(v_tg::text, 'null'));

  -- ---------- 4. Token BIR MARTALIK ----------
  v_natija := public.kassa_tasdiq_bajar(v_tok, 555001, 'tasdiq');
  v_n := v_n || jsonb_build_object(
    'nom', 'token IKKINCHI marta ishlamaydi',
    'ok', v_natija->>'xato' = 'TOKEN_ISHLATILGAN',
    'izoh', coalesce(v_natija->>'xato', 'O''TIB KETDI'));

  v_kor := public.kassa_tasdiq_korish(v_tok);
  v_n := v_n || jsonb_build_object(
    'nom', 'ishlatilgan tokenda kartochka ham ochilmaydi',
    'ok', v_kor->>'xato' = 'TOKEN_ISHLATILGAN',
    'izoh', coalesce(v_kor->>'xato', 'OCHILDI'));

  -- ---------- 5. Begona va buzuq token ----------
  v_natija := public.kassa_tasdiq_bajar('T_begona0000000000000000000000000', 555002, 'tasdiq');
  v_n := v_n || jsonb_build_object(
    'nom', 'begona token rad etiladi',
    'ok', v_natija->>'xato' = 'TOKEN_NOTOGRI',
    'izoh', coalesce(v_natija->>'xato', 'O''TIB KETDI'));

  v_natija := public.kassa_tasdiq_bajar('', 555002, 'tasdiq');
  v_n := v_n || jsonb_build_object(
    'nom', 'bo''sh token rad etiladi',
    'ok', v_natija->>'xato' = 'TOKEN_NOTOGRI',
    'izoh', coalesce(v_natija->>'xato', 'O''TIB KETDI'));

  v_natija := public.kassa_tasdiq_bajar(v_tok, 555002, 'ha');
  v_n := v_n || jsonb_build_object(
    'nom', 'notanish javob rad etiladi',
    'ok', v_natija->>'xato' = 'JAVOB_NOTOGRI',
    'izoh', coalesce(v_natija->>'xato', 'O''TIB KETDI'));

  -- ---------- 6. Faqat «kutilmoqda» tasdiqlanadi ----------
  -- Tasdiqlangan bitimga yangi havola umuman berilmaydi
  begin
    v_hav := public.kassa_tasdiq_havola(v_bitim);
    v_n := v_n || jsonb_build_object(
      'nom', 'tasdiqlangan bitimga havola berilmaydi',
      'ok', false, 'izoh', 'havola berildi');
  exception when others then
    v_n := v_n || jsonb_build_object(
      'nom', 'tasdiqlangan bitimga havola berilmaydi',
      'ok', sqlerrm like 'TASDIQ_KERAKMAS%', 'izoh', sqlerrm);
  end;

  -- Havola olingandan KEYIN bitim yopilsa, tugma ham ishlamasin
  v_bitim2 := public.kassa_bitim_yarat(
    v_hamkor, 'berdim', 'qarz', 50.00,
    null, null, null, null, 'USD', 1, null, null, null,
    v_hisob
  );
  v_hav := public.kassa_tasdiq_havola(v_bitim2);
  v_tok2 := v_hav->>'token';
  update public.kassa_bitimlar set holat = 'bekor', bekor_sabab = 'sinov'
   where id = v_bitim2;
  v_natija := public.kassa_tasdiq_bajar(v_tok2, 555003, 'tasdiq');
  v_n := v_n || jsonb_build_object(
    'nom', 'bekor qilingan bitim tasdiqni QABUL QILMAYDI',
    'ok', v_natija->>'xato' = 'HOLAT_MOS_EMAS',
    'izoh', coalesce(v_natija->>'xato', 'O''TIB KETDI'));

  -- ---------- 7. Rad etish ----------
  v_yopiq := public.kassa_bitim_yarat(
    v_hamkor, 'berdim', 'tovar', 10.00,
    'Qop', 'dona', 1, 10.00, 'USD', 1, null, null, null, null
  );
  v_hav := public.kassa_tasdiq_havola(v_yopiq);
  v_natija := public.kassa_tasdiq_bajar(v_hav->>'token', 555004, 'rad');
  v_n := v_n || jsonb_build_object(
    'nom', 'rad etish holatni "rad" qiladi',
    'ok', (select holat from public.kassa_bitimlar where id = v_yopiq) = 'rad',
    'izoh', (select holat from public.kassa_bitimlar where id = v_yopiq));

  -- Rad etilgani ham qoldiqda qoladi: «rad» — bekor EMAS.
  -- Hamkor «men olmadim» desa ham daftar o'chirilmaydi, nizo
  -- odamlar orasida hal bo'ladi.
  select public.kassa_hamkor_qoldiq(v_hamkor) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'RAD ETILGAN bitim ham qoldiqda qoladi',
    'ok', v_q <> 0, 'izoh', v_q::text);

  -- ---------- 8. Tenant ajratish ----------
  -- Boshqa tashkilotning bitimiga havola so'ralsa topilmasin
  declare
    v_begona uuid;
  begin
    insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, summa, valyuta)
    values (v_org2, v_hamkor2, 'berdim', 'qarz', 99, 'USD')
    returning id into v_begona;

    begin
      v_hav := public.kassa_tasdiq_havola(v_begona);
      v_n := v_n || jsonb_build_object(
        'nom', 'BEGONA tashkilot bitimiga havola berilmaydi',
        'ok', false, 'izoh', 'havola berildi');
    exception when others then
      v_n := v_n || jsonb_build_object(
        'nom', 'BEGONA tashkilot bitimiga havola berilmaydi',
        'ok', sqlerrm like 'BITIM_TOPILMADI%', 'izoh', sqlerrm);
    end;
  end;

  -- ---------- 9. Muddat ----------
  v_bitim2 := public.kassa_bitim_yarat(
    v_hamkor, 'berdim', 'tovar', 7.00,
    'Eski', 'dona', 1, 7.00, 'USD', 1, null, null, null, null
  );
  v_hav := public.kassa_tasdiq_havola(v_bitim2);
  v_tok2 := v_hav->>'token';
  update public.kassa_tasdiq_tokenlar
     set amal_qiladi = now() - interval '1 second'
   where xesh = encode(extensions.digest(v_tok2, 'sha256'), 'hex');

  v_natija := public.kassa_tasdiq_bajar(v_tok2, 555005, 'tasdiq');
  v_n := v_n || jsonb_build_object(
    'nom', 'MUDDATI O''TGAN token ishlamaydi',
    'ok', v_natija->>'xato' = 'TOKEN_MUDDATI_OTGAN',
    'izoh', coalesce(v_natija->>'xato', 'O''TIB KETDI'));

  v_kor := public.kassa_tasdiq_korish(v_tok2);
  v_n := v_n || jsonb_build_object(
    'nom', 'muddati o''tgan tokenda kartochka ham ochilmaydi',
    'ok', v_kor->>'xato' = 'TOKEN_MUDDATI_OTGAN',
    'izoh', coalesce(v_kor->>'xato', 'OCHILDI'));

  -- ---------- 10. Huquqlar ----------
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_tasdiq_bajar anon ga OCHIQ EMAS',
    'ok', not has_function_privilege('anon', 'public.kassa_tasdiq_bajar(text,bigint,text)', 'execute'),
    'izoh', 'anon');

  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_tasdiq_bajar authenticated ga ham ochiq emas',
    'ok', not has_function_privilege('authenticated', 'public.kassa_tasdiq_bajar(text,bigint,text)', 'execute'),
    'izoh', 'authenticated');

  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_tasdiq_korish anon ga OCHIQ EMAS',
    'ok', not has_function_privilege('anon', 'public.kassa_tasdiq_korish(text)', 'execute'),
    'izoh', 'anon');

  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_tasdiq_korish authenticated ga ham ochiq emas',
    'ok', not has_function_privilege('authenticated', 'public.kassa_tasdiq_korish(text)', 'execute'),
    'izoh', 'authenticated');

  v_n := v_n || jsonb_build_object(
    'nom', 'ikkalasi service_role ga ochiq (bot shundan chaqiradi)',
    'ok', has_function_privilege('service_role', 'public.kassa_tasdiq_bajar(text,bigint,text)', 'execute')
      and has_function_privilege('service_role', 'public.kassa_tasdiq_korish(text)', 'execute'),
    'izoh', 'service_role');

  v_n := v_n || jsonb_build_object(
    'nom', 'havola yaratish authenticated ga ochiq, anon ga yo''q',
    'ok', has_function_privilege('authenticated', 'public.kassa_tasdiq_havola(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.kassa_tasdiq_havola(uuid)', 'execute'),
    'izoh', 'havola');

  -- RLS yoqilganmi
  select count(*) into v_soni from pg_class
   where relname = 'kassa_tasdiq_tokenlar' and relrowsecurity;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_tasdiq_tokenlar da RLS yoqilgan',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  -- ---------- Hammasini qaytarib olamiz ----------
  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;

// --sql bilan blokni chop etadi: Dashboard -> SQL Editor ga
// qo'yish uchun. Fayl ham yoziladi — terminaldan nusxa olish
// uzun blokda ishonchsiz.
if (process.argv.includes('--sql')) {
  const chiqish = join(ROOT, 'supabase/sinov/kassa-tasdiq-sinov.sql');
  writeFileSync(chiqish, BLOK.trimStart(), 'utf8');
  console.log(BLOK);
  console.log('\n  fayl: ' + chiqish);
  process.exit(0);
}

let K;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}

console.log('\n\x1b[1mCLARY — TELEGRAM TASDIQLASH\x1b[0m\n');

if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kodchi/kalitlar.json topilmadi — sinov o‘tkazib yuborildi.');
  console.log('    SQL ni ko‘rish: node tests/kassa-tasdiq.mjs --sql\n');
  process.exit(0);
}

async function sqlXom(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    body: JSON.stringify({ query: q }),
  });
  return { ok: r.ok, matn: await r.text() };
}

const javob = await sqlXom(BLOK);
let xabar = javob.matn;
try {
  xabar = JSON.parse(javob.matn)?.message ?? JSON.parse(javob.matn)?.error?.message ?? javob.matn;
} catch {
  /* JSON emas */
}
const m = xabar.match(/SINOV_NATIJA: (\[[\s\S]*?\])\s*(?:CONTEXT|PL\/pgSQL|$)/);
if (!m) {
  tekshir('sinov bloki bajarildi', false, xabar.slice(0, 400));
} else {
  for (const n of JSON.parse(m[1])) tekshir(n.nom, n.ok === true, n.izoh);
}

// Rollback haqiqatan bo'ldimi — jonli bazada iz qolmasin
const qoldi = await sqlXom(
  "select count(*) as n from public.organizations where name like 'SINOV-TASDIQ%'",
);
let soni = -1;
try {
  soni = Number(JSON.parse(qoldi.matn)[0]?.n);
} catch {
  /* o'qib bo'lmadi */
}
tekshir('sinov tashkilotlari qaytarib olindi', soni === 0, soni === 0 ? 'iz yo‘q' : `${soni} ta QOLDI`);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
