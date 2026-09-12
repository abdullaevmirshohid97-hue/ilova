// =============================================================
//  MINIMAL PARTIYA VA BREND
//
//  Ulgurjida tovar bittalab sotilmaydi: «Min. 50 dona». Bu ekrandagi
//  yozuv emas, QOIDA — ilovada tugma to'silgani bilan so'rovni qo'lda
//  yasash mumkin. Shuning uchun tekshiruv create_order ning ichida.
//
//  Tekshiriladigan asosiy narsalar:
//   · minimaldan kam buyurtma RAD ETILADI (MIN_MIQDOR)
//   · minimalga teng buyurtma o'tadi va qoldiqni band qiladi
//   · rad etilgan urinish qoldiqni BAND QILMAYDI (yarim yozuv qolmasin)
//   · standart qiymat 1 — eski mahsulotlarning xulqi o'zgarmaydi
//   · brend ustuni saqlanadi va o'qiladi
//
//  Sinov o'z tashkiloti, mahsuloti va mijozini yaratadi, oxirida
//  `raise` bilan hammasini qaytarib oladi — jonli bazada iz qolmaydi.
//
//  Ishga tushirish:  node tests/min-partiya.mjs
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

console.log('\n\x1b[1mMINIMAL PARTIYA VA BREND\x1b[0m');

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
  v_mahsulot uuid; v_oddiy uuid;
  v_variant uuid; v_variant2 uuid;
  v_cust uuid; v_user uuid; v_buyurtma uuid;
  v_n jsonb := '[]'::jsonb; v_ok boolean;
  v_band int; v_brend text;
begin
  select p.id into v_user
  from public.profiles p where p.role = 'customer' and p.customer_id is not null limit 1;
  if v_user is null then
    raise exception 'SINOV_NATIJA: [{"nom":"sinov uchun mijoz profili topilmadi","ok":false}]';
  end if;

  insert into public.organizations (name, subscription_status)
  values ('SINOV-MIN ' || gen_random_uuid(), 'active') returning id into v_org;
  select id into v_tarif from public.price_groups where org_id = v_org limit 1;

  insert into public.categories (org_id, name, sort_order)
  values (v_org, 'Sinov', 1) returning id into v_kat;

  -- Minimal partiyasi 50 bo'lgan mahsulot
  insert into public.products (org_id, name, model, category_id, brand, min_order_qty)
  values (v_org, 'Sinov qadoq', 'S-50', v_kat, 'ChunSe', 50) returning id into v_mahsulot;

  -- Minimalsiz (standart) mahsulot — eski xulq
  insert into public.products (org_id, name, model, category_id)
  values (v_org, 'Oddiy qadoq', 'S-1', v_kat) returning id into v_oddiy;

  select min_order_qty into v_band from public.products where id = v_oddiy;
  v_n := v_n || jsonb_build_object(
    'nom', 'standart minimal = 1 (eski mahsulotlar o''zgarmaydi)',
    'ok', v_band = 1, 'izoh', v_band::text);

  select brand into v_brend from public.products where id = v_mahsulot;
  v_n := v_n || jsonb_build_object('nom', 'brend saqlandi va o''qildi', 'ok', v_brend = 'ChunSe');

  insert into public.product_variants (product_id, sku, size, color)
  values (v_mahsulot, 'SINOV-MIN-' || substr(gen_random_uuid()::text, 1, 8), 'M', 'Qora')
  returning id into v_variant;
  insert into public.product_variants (product_id, sku, size, color)
  values (v_oddiy, 'SINOV-ODD-' || substr(gen_random_uuid()::text, 1, 8), 'M', 'Oq')
  returning id into v_variant2;

  insert into public.prices (variant_id, price_group_id, price)
  values (v_variant, v_tarif, 12500), (v_variant2, v_tarif, 9500);

  -- stock_levels qatori variant yaratilganda TRIGGER bilan o'zi paydo
  -- bo'ladi, shuning uchun insert emas — upsert
  insert into public.stock_levels (variant_id, qty, reserved)
  values (v_variant, 1000, 0), (v_variant2, 1000, 0)
  on conflict (variant_id) do update set qty = excluded.qty, reserved = excluded.reserved;

  insert into public.customers (org_id, name, phone, price_group_id, display_currency)
  values (v_org, 'Sinov mijoz', '+99891' || substr(gen_random_uuid()::text, 1, 7), v_tarif, 'UZS')
  returning id into v_cust;

  update public.profiles set customer_id = v_cust, org_id = v_org where id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  -- ---------- 1. Minimaldan kam ----------
  begin
    perform public.create_order(
      jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'qty', 10)), null);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%MIN_MIQDOR%';
  end;
  v_n := v_n || jsonb_build_object('nom', '10 dona (min 50) rad etildi', 'ok', coalesce(v_ok, false));

  select reserved into v_band from public.stock_levels where variant_id = v_variant;
  v_n := v_n || jsonb_build_object(
    'nom', 'rad etilgan urinish qoldiqni band qilmadi',
    'ok', v_band = 0, 'izoh', 'band: ' || v_band);

  -- ---------- 2. Minimalga teng ----------
  v_buyurtma := public.create_order(
    jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'qty', 50)), null);
  v_n := v_n || jsonb_build_object('nom', '50 dona o''tdi', 'ok', v_buyurtma is not null);

  select reserved into v_band from public.stock_levels where variant_id = v_variant;
  v_n := v_n || jsonb_build_object(
    'nom', 'qoldiq band qilindi', 'ok', v_band = 50, 'izoh', 'band: ' || v_band);

  -- ---------- 3. Minimalsiz mahsulot ----------
  begin
    v_buyurtma := public.create_order(
      jsonb_build_array(jsonb_build_object('variant_id', v_variant2, 'qty', 1)), null);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'minimalsiz mahsulotni 1 dona olish mumkin', 'ok', v_ok);

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
  console.log('    ' + xabar.slice(0, 600));
  process.exit(1);
}

console.log('');
for (const n of JSON.parse(m[1])) tekshir(n.nom, n.ok === true, n.izoh);

const qoldi = await sqlXom(
  `select (select count(*) from public.organizations where name like 'SINOV-MIN%')
        + (select count(*) from public.products where name in ('Sinov qadoq','Oddiy qadoq')) as n;`,
);
const nQoldi = JSON.parse(qoldi.matn)?.[0]?.n;
console.log('');
tekshir('sinovdan iz qolmadi (rollback)', nQoldi === 0, 'qolgan qator: ' + nQoldi);

console.log(
  yiqildi === 0 ? '\n\x1b[32mHAMMASI O‘TDI\x1b[0m\n' : `\n\x1b[31m${yiqildi} ta yiqildi\x1b[0m\n`,
);
process.exit(yiqildi === 0 ? 0 : 1);
