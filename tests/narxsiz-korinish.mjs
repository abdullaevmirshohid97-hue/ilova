// =============================================================
//  NARXSIZ MAHSULOT KATALOGDA KO'RINSINMI
//
//  Sozlama: Sozlamalar -> "Narxsiz mahsulotlar" -> Ko'rinsin /
//  Ko'rinmasin (organizations.narxsiz_korinsin).
//
//  Tekshiriladigan asosiy narsalar:
//   · o'chiq holatda narxsiz variant katalogda YO'Q (eski xulq)
//   · yoqilganda ko'rinadi, lekin narxi NULL bo'lib keladi
//     (ilova "Narx kelishiladi" deb yozadi)
//   · KO'RINISH BUYURTMA DEGANI EMAS: narxsiz variantga
//     create_order NARX_TOPILMADI beradi — aks holda korxona
//     0 so'mga tovar jo'natib, qarz noto'g'ri yozilardi
//   · sozlamani mijoz o'zgartira olmaydi (faqat admin)
//   · narxi BOR variant sozlamadan qat'i nazar joyida qoladi
//
//  Sinov o'z ma'lumotini o'zi yaratadi (tashkilot, mahsulot, mijoz)
//  va JONLI BAZAGA HECH NARSA YOZMAYDI: hammasi bitta DO blokida,
//  oxirida `raise` bilan qaytarib olinadi.
//
//  Ishga tushirish:  node tests/narxsiz-korinish.mjs
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

console.log('\n\x1b[1mNARXSIZ MAHSULOT KATALOGDA\x1b[0m');

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

const BLOK = `
do $$
declare
  v_org uuid; v_tarif uuid; v_kat uuid;
  v_mahsulot uuid; v_narxli uuid; v_narxsiz uuid;
  v_cust uuid; v_user uuid;
  v_eski_cust uuid; v_eski_org uuid;
  v_n jsonb := '[]'::jsonb; v_ok boolean;
  v_soni int; v_null_soni int;
begin
  -- Sinov mijozi uchun mavjud profil kerak (auth.users ga bog'liq),
  -- lekin u SINOV ma'lumotiga vaqtincha yo'naltiriladi va oxirida
  -- rollback bilan aynan tiklanadi.
  select p.id, p.customer_id, p.org_id into v_user, v_eski_cust, v_eski_org
  from public.profiles p where p.role = 'customer' and p.customer_id is not null limit 1;
  if v_user is null then
    raise exception 'SINOV_NATIJA: [{"nom":"sinov uchun mijoz profili topilmadi","ok":false}]';
  end if;

  -- ---------- O'z ma'lumoti ----------
  insert into public.organizations (name, subscription_status)
  values ('SINOV-NARX ' || gen_random_uuid(), 'active') returning id into v_org;

  -- Tarif triggerdan o'zi keladi
  select id into v_tarif from public.price_groups where org_id = v_org limit 1;
  v_n := v_n || jsonb_build_object('nom', 'yangi tashkilotda tarif bor', 'ok', v_tarif is not null);

  insert into public.categories (org_id, name, sort_order) values (v_org, 'Sinov', 1)
  returning id into v_kat;

  insert into public.products (org_id, name, model, category_id)
  values (v_org, 'Sinov mahsulot', 'S-1', v_kat) returning id into v_mahsulot;

  insert into public.product_variants (product_id, sku, size, color)
  values (v_mahsulot, 'SINOV-NARXLI-' || substr(gen_random_uuid()::text, 1, 8), 'M', 'Oq')
  returning id into v_narxli;

  insert into public.product_variants (product_id, sku, size, color)
  values (v_mahsulot, 'SINOV-NARXSIZ-' || substr(gen_random_uuid()::text, 1, 8), 'L', 'Qora')
  returning id into v_narxsiz;

  -- Biriga narx bor, ikkinchisiga YO'Q
  insert into public.prices (variant_id, price_group_id, price) values (v_narxli, v_tarif, 50000);

  insert into public.customers (org_id, name, phone, price_group_id, display_currency)
  values (v_org, 'Sinov mijoz', '+99890' || substr(gen_random_uuid()::text, 1, 7), v_tarif, 'UZS')
  returning id into v_cust;

  update public.profiles set customer_id = v_cust, org_id = v_org where id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  -- ---------- 1. Sozlama O'CHIQ (standart) ----------
  select count(*) into v_soni from public.my_effective_prices();
  v_n := v_n || jsonb_build_object(
    'nom', 'o''chiq: faqat narxi bor variant keladi',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  -- ---------- 2. Sozlama YOQILGAN ----------
  update public.organizations set narxsiz_korinsin = true where id = v_org;

  select count(*) into v_soni from public.my_effective_prices();
  select count(*) into v_null_soni from public.my_effective_prices() where price is null;
  v_n := v_n || jsonb_build_object(
    'nom', 'yoqilgan: narxsiz variant ham keladi',
    'ok', v_soni = 2, 'izoh', v_soni || ' ta');
  v_n := v_n || jsonb_build_object(
    'nom', 'narxsiz variantning narxi NULL (nol emas)',
    'ok', v_null_soni = 1, 'izoh', v_null_soni || ' ta');
  v_n := v_n || jsonb_build_object(
    'nom', 'narxi bor variant o''zgarmadi',
    'ok', (select price from public.my_effective_prices() where variant_id = v_narxli) = 50000);

  -- ---------- 3. Ko'rinish BUYURTMA degani emas ----------
  begin
    perform public.create_order(
      jsonb_build_array(jsonb_build_object('variant_id', v_narxsiz, 'qty', 1)), null);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%NARX_TOPILMADI%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'narxsiz variantga buyurtma berib bo''lmadi', 'ok', coalesce(v_ok, false));

  -- ---------- 4. Sozlamani mijoz o'zgartira olmaydi ----------
  begin
    perform public.narxsiz_korinishni_saqla(false);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%RUXSAT_YOQ%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'mijoz sozlamani o''zgartira olmadi', 'ok', coalesce(v_ok, false));

  -- ---------- 5. Qaytib o'chirish ----------
  update public.organizations set narxsiz_korinsin = false where id = v_org;
  select count(*) into v_soni from public.my_effective_prices();
  v_n := v_n || jsonb_build_object(
    'nom', 'o''chirilgach yana yashirindi', 'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;

const javob = await sqlXom(BLOK);
let xabar = javob.matn;
try {
  xabar = JSON.parse(javob.matn)?.message ?? javob.matn;
} catch {
  /* JSON emas */
}
const m = xabar.match(/SINOV_NATIJA: (\[[\s\S]*?\])\s*(?:CONTEXT|PL\/pgSQL|$)/);
if (!m) {
  console.log('  \x1b[31m✗\x1b[0m sinov bloki bajarilmadi');
  console.log('    ' + xabar.slice(0, 500));
  process.exit(1);
}

console.log('');
for (const n of JSON.parse(m[1])) tekshir(n.nom, n.ok === true, n.izoh);

// Rollback haqiqatan bo'ldimi
const qoldi = await sqlXom(
  `select (select count(*) from public.organizations where name like 'SINOV-NARX%')
        + (select count(*) from public.customers where name = 'Sinov mijoz') as n;`,
);
const nQoldi = JSON.parse(qoldi.matn)?.[0]?.n;
console.log('');
tekshir('sinovdan iz qolmadi (rollback)', nQoldi === 0, 'qolgan qator: ' + nQoldi);

console.log(
  yiqildi === 0 ? '\n\x1b[32mHAMMASI O‘TDI\x1b[0m\n' : `\n\x1b[31m${yiqildi} ta yiqildi\x1b[0m\n`,
);
process.exit(yiqildi === 0 ? 0 : 1);
