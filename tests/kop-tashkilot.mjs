// =============================================================
//  BITTA MENEJER — BIR NECHTA TASHKILOT
//
//  Menejer erkin sotuvchi: bitta telefon-parol bilan bir necha
//  korxonada ishlaydi. Kirgandan keyin qaysi tashkilotda ishlashini
//  tanlaydi.
//
//  Tekshiriladigan asosiy narsalar:
//   · yangi tashkilotga "Standart" tarif o'zi qo'shiladi
//     (aks holda menejer qo'shishda TARIF_TOPILMADI chiqardi)
//   · bitta telefon ikki tashkilotda menejer bo'la oladi
//   · tashkilotni_tanla() profiles ni ko'chiradi, ya'ni
//     current_org_id() va current_manager_id() ergashadi
//   · a'zolik yo'q tashkilotga O'TIB BO'LMAYDI
//   · uzvliklar RLS: har kim faqat o'zinikini ko'radi
//
//  JONLI BAZAGA HECH NARSA YOZILMAYDI: butun sinov bitta DO
//  blokida bajariladi va oxirida `raise` bilan QAYTARIB OLINADI
//  (rollback). Natijalar xato matni ichida JSON bo'lib qaytadi.
//
//  Ishga tushirish:  node tests/kop-tashkilot.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mBITTA MENEJER — BIR NECHTA TASHKILOT\x1b[0m');

let K = null;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}
if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kalitlar yo‘q — sinov o‘tkazib yuborildi\n');
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

// Hamma narsa shu blok ichida: oxiridagi `raise` butun ishni
// qaytarib oladi, natija esa xato matnida qaytadi.
const BLOK = `
do $$
declare
  v_org_a uuid; v_org_b uuid; v_begona uuid;
  v_user uuid; v_mgr_a uuid; v_mgr_b uuid;
  v_prof record; v_n jsonb := '[]'::jsonb; v_ok boolean;
  v_kutilgan int; v_korindi int;
begin
  select p.id into v_user from public.profiles p where p.role = 'manager' limit 1;
  if v_user is null then
    raise exception 'SINOV_NATIJA: [{"nom":"sinov uchun menejer profili topilmadi","ok":false}]';
  end if;

  -- ---------- Sinov tashkilotlari ----------
  insert into public.organizations (name, subscription_status)
  values ('SINOV-A ' || gen_random_uuid(), 'active') returning id into v_org_a;
  insert into public.organizations (name, subscription_status)
  values ('SINOV-B ' || gen_random_uuid(), 'active') returning id into v_org_b;

  v_n := v_n || jsonb_build_object(
    'nom', 'yangi tashkilotga "Standart" tarif o''zi qo''shildi',
    'ok', exists (select 1 from public.price_groups where org_id = v_org_a and name = 'Standart'));

  -- ---------- Bitta telefon, ikki tashkilot ----------
  insert into public.managers (org_id, name, phone)
  values (v_org_a, 'Sinov menejer', '+998900000777') returning id into v_mgr_a;
  insert into public.managers (org_id, name, phone)
  values (v_org_b, 'Sinov menejer', '+998900000777') returning id into v_mgr_b;

  v_n := v_n || jsonb_build_object(
    'nom', 'bitta telefon ikki tashkilotda menejer bo''ldi',
    'ok', v_mgr_a is not null and v_mgr_b is not null);

  -- customers.phone GLOBAL unikal — kartochka ikkinchisiga belgi qo'shib ochiladi
  v_n := v_n || jsonb_build_object(
    'nom', 'ikkalasiga ham xaridor kartochkasi ochildi',
    'ok', (select count(*) from public.customers
           where proxy_manager_id in (v_mgr_a, v_mgr_b)) = 2);

  insert into public.uzvliklar (user_id, org_id, manager_id, role)
  values (v_user, v_org_a, v_mgr_a, 'manager'),
         (v_user, v_org_b, v_mgr_b, 'manager');

  -- ---------- Endi menejerning o'zi bo'lib gapiramiz ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  v_n := v_n || jsonb_build_object(
    'nom', 'uzvliklarim() uchala tashkilotni berdi',
    'ok', (select count(*) from public.uzvliklarim()) >= 3);

  -- ---------- Almashtirish ----------
  perform public.tashkilotni_tanla(v_org_b);
  select org_id, manager_id, role into v_prof from public.profiles where id = v_user;

  v_n := v_n || jsonb_build_object('nom', 'profiles B tashkilotiga ko''chdi',
    'ok', v_prof.org_id = v_org_b);
  v_n := v_n || jsonb_build_object('nom', 'manager_id ham B nikiga o''tdi',
    'ok', v_prof.manager_id = v_mgr_b);
  v_n := v_n || jsonb_build_object('nom', 'current_org_id() B ni ko''rsatdi',
    'ok', public.current_org_id() = v_org_b);
  v_n := v_n || jsonb_build_object('nom', 'current_manager_id() B nikini ko''rsatdi',
    'ok', public.current_manager_id() = v_mgr_b);

  perform public.tashkilotni_tanla(v_org_a);
  v_n := v_n || jsonb_build_object('nom', 'A ga qaytib o''tdi',
    'ok', public.current_org_id() = v_org_a);

  -- ---------- A'zolik yo'q tashkilot ----------
  select o.id into v_begona from public.organizations o
  where o.id not in (select u.org_id from public.uzvliklar u where u.user_id = v_user)
  limit 1;

  begin
    perform public.tashkilotni_tanla(v_begona);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%AZOLIK_YOQ%';
  end;
  v_n := v_n || jsonb_build_object('nom', 'begona tashkilotga o''tib bo''lmadi',
    'ok', coalesce(v_ok, false));
  v_n := v_n || jsonb_build_object('nom', 'urinishdan keyin ham A da qoldi',
    'ok', public.current_org_id() = v_org_a);

  -- ---------- RLS: o'zinikidan boshqasi ko'rinmaydi ----------
  select count(*) into v_kutilgan from public.uzvliklar where user_id = v_user;
  perform set_config('role', 'authenticated', true);
  select count(*) into v_korindi from public.uzvliklar;
  perform set_config('role', 'postgres', true);
  v_n := v_n || jsonb_build_object(
    'nom', 'RLS: menejer faqat o''z a''zoliklarini ko''radi',
    'ok', v_korindi = v_kutilgan, 'izoh', v_korindi || ' / ' || v_kutilgan);

  -- Hammasini qaytarib olamiz
  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;

const javob = await sqlXom(BLOK);

// Javob JSON: {"message":"... SINOV_NATIJA: [...]"}. AVVAL uni ochamiz —
// keyin ichidagi massiv oddiy JSON bo'lib qoladi. Qo'lda qochirishni
// yechishga urinish ("Standart" ichidagi qo'shtirnoqlar) matnni buzadi.
let xabar = javob.matn;
try {
  xabar = JSON.parse(javob.matn)?.message ?? JSON.parse(javob.matn)?.error?.message ?? javob.matn;
} catch {
  /* JSON emas — xom matnda qidiramiz */
}
const m = xabar.match(/SINOV_NATIJA: (\[[\s\S]*?\])\s*(?:CONTEXT|PL\/pgSQL|$)/);
if (!m) {
  console.log('  \x1b[31m✗\x1b[0m sinov bloki bajarilmadi');
  console.log('    ' + xabar.slice(0, 500));
  process.exit(1);
}

const natijalar = JSON.parse(m[1]);
console.log('');
for (const n of natijalar) tekshir(n.nom, n.ok === true, n.izoh);

// Rollback haqiqatan bo'ldimi — sinov tashkilotlari qolmasin
const qoldi = await sqlXom(
  `select count(*)::int as n from public.organizations where name like 'SINOV-%';`,
);
const nQoldi = JSON.parse(qoldi.matn)?.[0]?.n;
console.log('');
tekshir('sinovdan iz qolmadi (rollback)', nQoldi === 0, 'SINOV-* tashkilotlar: ' + nQoldi);

console.log(
  yiqildi === 0 ? '\n\x1b[32mHAMMASI O‘TDI\x1b[0m\n' : `\n\x1b[31m${yiqildi} ta yiqildi\x1b[0m\n`,
);
process.exit(yiqildi === 0 ? 0 : 1);
