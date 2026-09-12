// =============================================================
//  BOSH SAHIFA: BANNER VA "ENG KO'P SOTILGAN"
//
//  Ikkala narsa ham mijoz ilovasining bosh sahifasida ko'rinadi,
//  ya'ni ikkalasi ham TENANT chegarasidan o'tadi:
//
//   · banner — faqat O'Z tashkilotiniki ko'rinadi
//   · mijoz banner yoza olmaydi (faqat admin)
//   · eng_kop_sotilgan() — mijoz BOSHQALARNING buyurtmasini ko'rmaydi,
//     shuning uchun yig'indi security definer funksiyada. Tashqariga
//     faqat mahsulot id'lari chiqadi va faqat O'Z tashkilotiniki
//   · bekor qilingan buyurtma hisobga olinmaydi
//
//  Sinov ikkita tashkilot yaratadi va oxirida `raise` bilan hammasini
//  qaytarib oladi — jonli bazada iz qolmaydi.
//
//  Ishga tushirish:  node tests/bosh-sahifa.mjs
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

console.log('\n\x1b[1mBOSH SAHIFA: BANNER VA ENG KO‘P SOTILGAN\x1b[0m');

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
  v_org_a uuid; v_org_b uuid; v_tarif_a uuid; v_tarif_b uuid;
  v_kat uuid; v_mah_kop uuid; v_mah_kam uuid; v_mah_bekor uuid;
  v_var_kop uuid; v_var_kam uuid; v_var_bekor uuid;
  v_cust uuid; v_user uuid; v_buyurtma uuid;
  v_n jsonb := '[]'::jsonb; v_ok boolean;
  v_soni int; v_birinchi uuid;
begin
  select p.id into v_user
  from public.profiles p where p.role = 'customer' and p.customer_id is not null limit 1;
  if v_user is null then
    raise exception 'SINOV_NATIJA: [{"nom":"sinov uchun mijoz profili topilmadi","ok":false}]';
  end if;

  insert into public.organizations (name, subscription_status)
  values ('SINOV-BOSH-A ' || gen_random_uuid(), 'active') returning id into v_org_a;
  insert into public.organizations (name, subscription_status)
  values ('SINOV-BOSH-B ' || gen_random_uuid(), 'active') returning id into v_org_b;
  select id into v_tarif_a from public.price_groups where org_id = v_org_a limit 1;
  select id into v_tarif_b from public.price_groups where org_id = v_org_b limit 1;

  insert into public.categories (org_id, name, sort_order) values (v_org_a, 'Sinov', 1)
  returning id into v_kat;

  -- Uchta mahsulot: ko'p sotilgan, kam sotilgan, bekor qilingani
  insert into public.products (org_id, name, category_id) values (v_org_a, 'Ko''p sotilgan', v_kat)
  returning id into v_mah_kop;
  insert into public.products (org_id, name, category_id) values (v_org_a, 'Kam sotilgan', v_kat)
  returning id into v_mah_kam;
  insert into public.products (org_id, name, category_id) values (v_org_a, 'Bekor qilingan', v_kat)
  returning id into v_mah_bekor;

  insert into public.product_variants (product_id, sku)
  values (v_mah_kop, 'SB-KOP-' || substr(gen_random_uuid()::text, 1, 8)) returning id into v_var_kop;
  insert into public.product_variants (product_id, sku)
  values (v_mah_kam, 'SB-KAM-' || substr(gen_random_uuid()::text, 1, 8)) returning id into v_var_kam;
  insert into public.product_variants (product_id, sku)
  values (v_mah_bekor, 'SB-BEK-' || substr(gen_random_uuid()::text, 1, 8)) returning id into v_var_bekor;

  insert into public.prices (variant_id, price_group_id, price)
  values (v_var_kop, v_tarif_a, 1000), (v_var_kam, v_tarif_a, 1000), (v_var_bekor, v_tarif_a, 1000);

  insert into public.stock_levels (variant_id, qty, reserved)
  values (v_var_kop, 10000, 0), (v_var_kam, 10000, 0), (v_var_bekor, 10000, 0)
  on conflict (variant_id) do update set qty = excluded.qty, reserved = excluded.reserved;

  insert into public.customers (org_id, name, phone, price_group_id, display_currency)
  values (v_org_a, 'Sinov mijoz', '+99893' || substr(gen_random_uuid()::text, 1, 7), v_tarif_a, 'UZS')
  returning id into v_cust;

  update public.profiles set customer_id = v_cust, org_id = v_org_a where id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  -- ---------- Sotuvlar ----------
  perform public.create_order(jsonb_build_array(
    jsonb_build_object('variant_id', v_var_kop, 'qty', 100),
    jsonb_build_object('variant_id', v_var_kam, 'qty', 5)), null);

  -- Bekor qilingan buyurtma hisobga kirmasligi kerak
  v_buyurtma := public.create_order(
    jsonb_build_array(jsonb_build_object('variant_id', v_var_bekor, 'qty', 9999)), null);
  update public.orders set status = 'cancelled' where id = v_buyurtma;

  select count(*) into v_soni from public.eng_kop_sotilgan(8);
  select product_id into v_birinchi from public.eng_kop_sotilgan(8) limit 1;

  v_n := v_n || jsonb_build_object(
    'nom', 'eng ko''p sotilgan birinchi o''rinda', 'ok', v_birinchi = v_mah_kop);
  v_n := v_n || jsonb_build_object(
    'nom', 'bekor qilingan buyurtma hisobga kirmadi',
    'ok', not exists (select 1 from public.eng_kop_sotilgan(8) where product_id = v_mah_bekor),
    'izoh', v_soni || ' ta mahsulot');

  -- ---------- Bannerlar ----------
  insert into public.bannerlar (org_id, sarlavha, matn, tartib)
  values (v_org_a, 'A banner', 'o''z tashkiloti', 1),
         (v_org_b, 'B banner', 'begona tashkilot', 1);

  -- Mijoz nomidan o'qiymiz (RLS ishlashi uchun rol ham almashadi)
  perform set_config('role', 'authenticated', true);
  select count(*) into v_soni from public.bannerlar;
  v_n := v_n || jsonb_build_object(
    'nom', 'mijoz FAQAT o''z tashkiloti bannerini ko''radi',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  begin
    insert into public.bannerlar (org_id, sarlavha) values (v_org_a, 'Mijoz yozdi');
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'mijoz banner yoza olmaydi', 'ok', v_ok);
  perform set_config('role', 'postgres', true);

  -- ---------- Begona tashkilot mahsuloti chiqmaydi ----------
  insert into public.products (org_id, name) values (v_org_b, 'Begona mahsulot');
  v_n := v_n || jsonb_build_object(
    'nom', 'eng ko''p sotilganda begona tenant mahsuloti yo''q',
    'ok', not exists (
      select 1 from public.eng_kop_sotilgan(20) e
      join public.products p on p.id = e.product_id
      where p.org_id = v_org_b));

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
  `select (select count(*) from public.organizations where name like 'SINOV-BOSH%')
        + (select count(*) from public.bannerlar where sarlavha in ('A banner','B banner')) as n;`,
);
const nQoldi = JSON.parse(qoldi.matn)?.[0]?.n;
console.log('');
tekshir('sinovdan iz qolmadi (rollback)', nQoldi === 0, 'qolgan qator: ' + nQoldi);

console.log(
  yiqildi === 0 ? '\n\x1b[32mHAMMASI O‘TDI\x1b[0m\n' : `\n\x1b[31m${yiqildi} ta yiqildi\x1b[0m\n`,
);
process.exit(yiqildi === 0 ? 0 : 1);
