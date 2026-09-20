// =============================================================
//  CREDIT DEBIT — QOLDIQ SINOVI
//
//  Qoldiq hech qayerda saqlanmaydi: u har safar yozuvlardan
//  hisoblanadi. Demak xato bo'lsa — BUTUN ilova yolg'on raqam
//  ko'rsatadi. Shu sababli bu yerda ikki tomon ham tekshiriladi:
//
//    1) JS mantiq (packages/kassa-yadro/balans.ts) — ilova ekranda
//       shu bilan hisoblaydi, offline paytda serverga umuman
//       bormaydi;
//    2) Baza funksiyalari (kassa_hisob_qoldiq, kassa_qoldiqlar) —
//       onlayn paytdagi javob. Ikkalasi BIR XIL chiqishi shart,
//       aks holda internet yoqilganda raqam "sakraydi".
//
//  Bazaga tegadigan qism BITTA `do` blokida bajariladi va oxirida
//  `raise` bilan butunlay qaytarib olinadi — jonli bazada iz
//  qolmaydi.
//
//  Ishga tushirish:  node tests/kassa-balans.mjs
// =============================================================

import { mkdtempSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mCREDIT DEBIT — QOLDIQ\x1b[0m');

// =============================================================
// 1-QISM: JS mantiq (internetsiz ishlaydi)
// =============================================================
const ish = mkdtempSync(join(tmpdir(), 'kassa-'));
const chiqish = join(ish, 'yadro.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'packages/kassa-yadro/index.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const Y = await import('file://' + chiqish.replace(/\\/g, '/'));

const HISOB = {
  id: 'h1', nom: 'Naqd', turi: 'naqd', valyuta: 'UZS',
  boshlangich: 50_000_00, tartib: 0, faol: true, versiya: 1,
};
const HISOB2 = {
  id: 'h2', nom: 'Bank', turi: 'bank', valyuta: 'UZS',
  boshlangich: 0, tartib: 1, faol: true, versiya: 1,
};

function yoz(id, hisob_id, turi, somma, qoshimcha = {}) {
  return {
    id, hisob_id, turi, summa: somma * 100, valyuta: 'UZS', kurs: 1,
    sana: '2026-09-10T10:00:00Z', tolov_usuli: 'naqd', versiya: 1,
    ...qoshimcha,
  };
}

console.log('\n1. Bekor qilingan yozuv');

const bekorli = [
  yoz('y1', 'h1', 'kirim', 100_000),
  yoz('y2', 'h1', 'chiqim', 30_000),
  yoz('y3', 'h1', 'chiqim', 999_999, { bekor_at: '2026-09-11T09:00:00Z', bekor_sabab: 'xato yozildi' }),
];
tekshir(
  'bekor qilingan chiqim qoldiqqa ta’sir qilmaydi',
  Y.hisobQoldiq(HISOB, bekorli) === (50_000 + 100_000 - 30_000) * 100,
  Y.formatla(Y.hisobQoldiq(HISOB, bekorli)),
);
const yig1 = Y.davrYigindi(bekorli);
tekshir('bekor qilingan yozuv yig‘indida yo‘q', yig1.chiqim === 30_000 * 100, Y.formatla(yig1.chiqim));

console.log('\n2. Hisoblararo o‘tkazma');

// 1 mln Naqd -> Bank. Bu na daromad, na xarajat: pul joyini o'zgartirdi.
const kochirma = [
  yoz('y1', 'h1', 'kirim', 200_000),
  yoz('k1', 'h1', 'chiqim', 1_000_000, { kochirma_id: 'kk1' }),
  yoz('k2', 'h2', 'kirim', 1_000_000, { kochirma_id: 'kk1' }),
];
tekshir(
  'o‘tkazma naqd qoldig‘idan chiqadi',
  Y.hisobQoldiq(HISOB, kochirma) === (50_000 + 200_000 - 1_000_000) * 100,
  Y.formatla(Y.hisobQoldiq(HISOB, kochirma)),
);
tekshir(
  'o‘tkazma bank qoldig‘iga tushadi',
  Y.hisobQoldiq(HISOB2, kochirma) === 1_000_000 * 100,
  Y.formatla(Y.hisobQoldiq(HISOB2, kochirma)),
);
const yig2 = Y.davrYigindi(kochirma);
tekshir(
  'o‘tkazma "kirim" hisobotiga qo‘shilmaydi',
  yig2.kirim === 200_000 * 100 && yig2.chiqim === 0,
  `kirim ${Y.formatla(yig2.kirim)}, chiqim ${Y.formatla(yig2.chiqim)}`,
);
tekshir(
  'umumiy balans o‘zgarmaydi (pul yo‘qolmadi)',
  Y.umumiyBalans([HISOB, HISOB2], kochirma).reduce((s, x) => s + x.qoldiq, 0) === (50_000 + 200_000) * 100,
);

console.log('\n3. Yuruvchi qoldiq tartibi');

// Bir soniyada yozilgan uch yozuv — offline ikki qurilmadan kelgan.
// Ro'yxat HAR OCHILGANDA bir xil tartibda bo'lishi kerak.
const bir_sana = [
  yoz('c', 'h1', 'kirim', 300, { o_raqam: 3 }),
  yoz('a', 'h1', 'kirim', 100, { o_raqam: 1 }),
  yoz('b', 'h1', 'chiqim', 200, { o_raqam: 2 }),
];
const tartib1 = Y.yuruvchiQoldiq(bir_sana).map((x) => x.yozuv.id).join('');
const tartib2 = Y.yuruvchiQoldiq([...bir_sana].reverse()).map((x) => x.yozuv.id).join('');
tekshir('tartib o‘zgarmaydi (o_raqam bo‘yicha)', tartib1 === 'abc' && tartib2 === 'abc', `${tartib1} / ${tartib2}`);

const yuruvchi = Y.yuruvchiQoldiq(bir_sana, 1000 * 100);
tekshir(
  'yuruvchi qoldiq: 1000 → 1100 → 900 → 1200',
  yuruvchi.map((x) => x.qoldiq / 100).join(',') === '1100,900,1200',
  yuruvchi.map((x) => x.qoldiq / 100).join(','),
);

console.log('\n4. Valyutalar qo‘shilmaydi');

const aralash = [
  yoz('u1', 'h1', 'kirim', 1_000_000),
  { ...yoz('d1', 'h1', 'kirim', 100), valyuta: 'USD', kurs: 12_500 },
];
const vb = Y.valyutaBoyicha(aralash);
tekshir(
  "so'm va dollar alohida yig‘iladi",
  vb.UZS?.kirim === 1_000_000 * 100 && vb.USD?.kirim === 100 * 100,
  `UZS ${vb.UZS?.kirim / 100}, USD ${vb.USD?.kirim / 100}`,
);

console.log('\n5. Klient qarzi');

// Tovar berildi (chiqim) 2 mln, to'lov keldi (kirim) 1,2 mln → qarz 800 ming
const klient = [
  yoz('q1', 'h1', 'chiqim', 2_000_000, { klient_id: 'm1' }),
  yoz('q2', 'h1', 'kirim', 1_200_000, { klient_id: 'm1' }),
  yoz('q3', 'h1', 'kirim', 5_000_000, { klient_id: 'm2' }),
];
tekshir('qarzi bor (Due)', Y.klientQoldiq('m1', klient) === 800_000 * 100, Y.formatla(Y.klientQoldiq('m1', klient)));
tekshir(
  'oldindan to‘lagan (Advance) manfiy chiqadi',
  Y.klientQoldiq('m2', klient) === -5_000_000 * 100,
  Y.formatla(Y.klientQoldiq('m2', klient)),
);

console.log('\n6. Kalendar (kun bo‘yicha)');

const kunlar = Y.kunlarBoyicha([
  yoz('g1', 'h1', 'kirim', 500, { sana: '2026-07-01T09:00:00Z' }),
  yoz('g2', 'h1', 'chiqim', 600, { sana: '2026-07-02T09:00:00Z' }),
  yoz('g3', 'h1', 'chiqim', 100, { sana: '2026-07-02T18:00:00Z' }),
]);
tekshir(
  "1-iyul: kirim 500, 2-iyul: chiqim 700",
  kunlar['2026-07-01']?.kirim === 500 * 100 && kunlar['2026-07-02']?.chiqim === 700 * 100,
  JSON.stringify(Object.keys(kunlar)),
);

// =============================================================
// 2-QISM: baza funksiyalari
// =============================================================
let K;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}
if (!K?.mgmt_token) {
  console.log('\n  \x1b[33m!\x1b[0m kalitlar yo‘q — baza qismi o‘tkazib yuborildi');
  console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
  process.exit(yiqildi === 0 ? 0 : 1);
}

async function sqlXom(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    body: JSON.stringify({ query: q }),
  });
  return { ok: r.ok, matn: await r.text() };
}

// Hammasi bitta blokda: oxiridagi `raise` yozilganini qaytarib oladi.
const BLOK = `
do $$
declare
  v_org uuid; v_org2 uuid; v_hisob uuid; v_hisob2 uuid; v_yozuv uuid;
  v_n jsonb := '[]'::jsonb; v_ok boolean;
  v_q numeric; v_oraqam bigint; v_oraqam2 bigint; v_versiya int;
begin
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-KASSA ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-KASSA2 ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org2;

  v_n := v_n || jsonb_build_object('nom', 'yo''nalish sifatida "kassa" qabul qilinadi', 'ok', true);

  -- Boshlang'ich qoldiq KASRLI: yaxlitlanib ketmasligi kerak
  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org, 'Naqd', 'naqd', 'UZS', 500.50) returning id into v_hisob;
  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org2, 'Begona hisob', 'naqd', 'UZS', 0) returning id into v_hisob2;

  insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa)
  values (v_org, v_hisob, 'kirim', 1000.25) returning id into v_yozuv;
  insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa)
  values (v_org, v_hisob, 'chiqim', 300.10);
  insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa, bekor_at, bekor_sabab)
  values (v_org, v_hisob, 'chiqim', 999999, now(), 'xato yozildi');

  -- ---------- Qoldiq ----------
  select public.kassa_hisob_qoldiq(v_hisob) into v_q;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_hisob_qoldiq: 500.50 + 1000.25 - 300.10 = 1200.65',
    'ok', v_q = 1200.65, 'izoh', v_q::text);

  select qoldiq into v_q from public.kassa_qoldiqlar() where hisob_id = v_hisob;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_qoldiqlar bir xil javob beradi',
    'ok', v_q = 1200.65, 'izoh', v_q::text);

  -- ---------- Cheklovlar ----------
  begin
    insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa)
    values (v_org, v_hisob, 'chiqim', 0);
    v_ok := false;
  exception when others then v_ok := true; end;
  v_n := v_n || jsonb_build_object('nom', 'nol summa qabul qilinmaydi', 'ok', v_ok);

  begin
    insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa)
    values (v_org, v_hisob, 'chiqim', -500);
    v_ok := false;
  exception when others then v_ok := true; end;
  v_n := v_n || jsonb_build_object('nom', 'manfiy summa qabul qilinmaydi', 'ok', v_ok);

  begin
    insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa, bekor_at)
    values (v_org, v_hisob, 'chiqim', 500, now());
    v_ok := false;
  exception when others then v_ok := true; end;
  v_n := v_n || jsonb_build_object('nom', 'bekor qilish sababsiz bo''lmaydi', 'ok', v_ok);

  begin
    insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa, valyuta)
    values (v_org, v_hisob, 'chiqim', 500, 'GBP');
    v_ok := false;
  exception when others then v_ok := true; end;
  v_n := v_n || jsonb_build_object('nom', 'noma''lum valyuta qabul qilinmaydi', 'ok', v_ok);

  -- ---------- Kompozit FK: begona tenantning hisobi ----------
  -- RLS'dan tashqari ikkinchi qulf. Qurilmada yaratilgan id kelgani
  -- uchun bu yo'l ochiq qolishi mumkin edi.
  begin
    insert into public.kassa_yozuvlar (org_id, hisob_id, turi, summa)
    values (v_org, v_hisob2, 'kirim', 100);
    v_ok := false;
  exception when others then v_ok := true; end;
  v_n := v_n || jsonb_build_object(
    'nom', 'begona tenant hisobiga yozuv bog''lab bo''lmaydi (kompozit FK)', 'ok', v_ok);

  -- ---------- o_raqam va versiya ----------
  select o_raqam, versiya into v_oraqam, v_versiya
  from public.kassa_yozuvlar where id = v_yozuv;
  v_n := v_n || jsonb_build_object('nom', 'o_raqam insert''da qo''yiladi',
    'ok', v_oraqam is not null, 'izoh', coalesce(v_oraqam::text, 'null'));
  v_n := v_n || jsonb_build_object('nom', 'versiya 1 dan boshlanadi', 'ok', v_versiya = 1);

  update public.kassa_yozuvlar set izoh = 'tahrirlandi' where id = v_yozuv;
  select o_raqam, versiya into v_oraqam2, v_versiya
  from public.kassa_yozuvlar where id = v_yozuv;
  v_n := v_n || jsonb_build_object('nom', 'tahrirda o_raqam OSHADI (sinx uni ko''radi)',
    'ok', v_oraqam2 > v_oraqam, 'izoh', v_oraqam || ' → ' || v_oraqam2);
  v_n := v_n || jsonb_build_object('nom', 'tahrirda versiya oshadi (ziddiyat uchun)',
    'ok', v_versiya = 2, 'izoh', v_versiya::text);

  -- Tahrir yozuvni boshqa tenantga ko'chirib yubormasin
  update public.kassa_yozuvlar set org_id = v_org2 where id = v_yozuv;
  select count(*) into v_versiya from public.kassa_yozuvlar
  where id = v_yozuv and org_id = v_org;
  v_n := v_n || jsonb_build_object('nom', 'tahrir yozuvni boshqa tenantga ko''chirmaydi',
    'ok', v_versiya = 1);

  -- Bekor qilingan yozuv qoldiqqa qaytmasin
  select public.kassa_hisob_qoldiq(v_hisob) into v_q;
  v_n := v_n || jsonb_build_object('nom', 'bekor qilingan 999 999 qoldiqda yo''q',
    'ok', v_q = 1200.65, 'izoh', v_q::text);

  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;

// =============================================================
// 6b. OLDI-BERDI QOLDIG‘I (bazasiz, sof mantiq)
//
//  Bu funksiyalar bazadagi `kassa_hamkor_qoldiq` bilan AYNAN bir
//  xil hisoblashi shart. Farq bo'lsa, ilova internetsiz bir
//  raqamni, internet kelganda boshqasini ko‘rsatardi.
// =============================================================
console.log('\n6b. Oldi-berdi qoldig‘i');

const B = (x) => ({
  id: x.id, klient_id: x.k, yonalish: x.y, nima: x.n ?? 'tovar',
  tovar_nom: 'Karobka', summa: x.s, valyuta: 'USD', kurs: 1,
  sana: x.sana ?? '2026-09-20T09:00:00.000Z', holat: x.h ?? 'kutilmoqda',
  muddat: x.muddat ?? null, versiya: 1,
});
const T = (x) => ({
  id: x.id, klient_id: x.k, bitim_id: x.b ?? null, yonalish: x.y,
  summa: x.s, valyuta: 'USD', kurs: 1, usuli: 'naqd',
  sana: '2026-09-21T09:00:00.000Z', holat: x.h ?? 'kutilmoqda', versiya: 1,
});

// Misol: Tonirokdan 1 200 x $0.10 = $120 tovar oldim
const b1 = B({ id: 'b1', k: 'tonirok', y: 'oldim', s: 12000 });

tekshir('«oldim» → qoldiq MANFIY (men qarzdorman)',
  Y.hamkorQoldiq('tonirok', [b1], []) === -12000,
  String(Y.hamkorQoldiq('tonirok', [b1], [])));

tekshir('tasdiqlanmagan bitim ham qoldiqda',
  Y.hamkorQoldiq('tonirok', [{ ...b1, holat: 'kutilmoqda' }], []) === -12000);

tekshir('bekor qilingan bitim qoldiqdan chiqadi',
  Y.hamkorQoldiq('tonirok', [{ ...b1, holat: 'bekor' }], []) === 0);

// $120 to‘ladim — to‘lov teskari yo‘nalishda
const t1 = T({ id: 't1', k: 'tonirok', b: 'b1', y: 'berdim', s: 12000 });
tekshir('to‘liq to‘lovdan keyin qoldiq 0',
  Y.hamkorQoldiq('tonirok', [b1], [t1]) === 0,
  String(Y.hamkorQoldiq('tonirok', [b1], [t1])));

const yarim = T({ id: 't2', k: 'tonirok', b: 'b1', y: 'berdim', s: 7000 });
tekshir('qisman to‘lov: -12000 + 7000 = -5000',
  Y.hamkorQoldiq('tonirok', [b1], [yarim]) === -5000,
  String(Y.hamkorQoldiq('tonirok', [b1], [yarim])));
tekshir('bitim qoldig‘i: 12000 - 7000 = 5000',
  Y.bitimQoldiq(b1, [yarim]) === 5000, String(Y.bitimQoldiq(b1, [yarim])));
tekshir('ortiqcha to‘lovda bitim qoldig‘i MANFIY bo‘lmaydi',
  Y.bitimQoldiq(b1, [T({ id: 't3', k: 'tonirok', b: 'b1', y: 'berdim', s: 99999 })]) === 0);

// Boshqa hamkorning bitimi aralashmasin
const b2 = B({ id: 'b2', k: 'ali', y: 'berdim', s: 5000 });
tekshir('boshqa hamkor qoldig‘i aralashmaydi',
  Y.hamkorQoldiq('tonirok', [b1, b2], []) === -12000 &&
  Y.hamkorQoldiq('ali', [b1, b2], []) === 5000);

// Jami: kim bizga qarzdor, biz kimga
const yig = Y.qarzYigindi([b1, b2], []);
tekshir('jami: olamiz 5000, beramiz 12000',
  yig.olamiz === 5000 && yig.beramiz === 12000,
  'olamiz ' + yig.olamiz + ', beramiz ' + yig.beramiz);

// Bir hamkorda ikki tomonlama: -12000 + 5000 = -7000 → faqat «beramiz»
const ikki = Y.qarzYigindi([b1, { ...b2, klient_id: 'tonirok' }], []);
tekshir('bir hamkorda ikki tomon O‘ZARO YECHILADI',
  ikki.olamiz === 0 && ikki.beramiz === 7000,
  'olamiz ' + ikki.olamiz + ', beramiz ' + ikki.beramiz);

// Muddat
const kechikkan = B({ id: 'b3', k: 'tonirok', y: 'berdim', s: 1000, muddat: '2026-09-01' });
const kelasi = B({ id: 'b4', k: 'tonirok', y: 'berdim', s: 1000, muddat: '2026-12-01' });
const otgan = Y.muddatiOtgan([kechikkan, kelasi], [], new Date(2026, 8, 20));
tekshir('muddati o‘tgan bitim topiladi', otgan.length === 1 && otgan[0].id === 'b3',
  otgan.length + ' ta');
tekshir('to‘langan bitim muddat ro‘yxatiga tushmaydi',
  Y.muddatiOtgan([kechikkan], [T({ id: 't4', k: 'tonirok', b: 'b3', y: 'oldim', s: 1000 })], new Date(2026, 8, 20)).length === 0);

// -------------------------------------------------------------
//  ESKI, BITIMSIZ DAFTAR YOZUVLARI
//
//  Bitim tushunchasi paydo bo'lgunicha hamma qarz shunday
//  yozilardi. Ular qoldiqdan tushib qolsa, ilova yangilangach
//  odamning qarzi ko'zdan yo'qolardi.
//
//  Bitimga BOG'LANGANI esa olinmasligi shart: to'lov ham bitimda,
//  ham daftarda turadi — ikkalasini sanasak qarz ikki barobar
//  chiqardi.
// -------------------------------------------------------------
const eskiY = (x) => ({
  id: x.id, hisob_id: 'h1', turi: x.turi, summa: x.s, valyuta: 'UZS',
  kurs: 1, klient_id: x.k, bitim_id: x.b ?? null,
  sana: '2026-09-05T09:00:00.000Z', tolov_usuli: 'naqd', versiya: 1,
  bekor_at: x.bekor ?? null, kochirma_id: x.koch ?? null,
});

// Tonirokka eski oqimda 800 lik tovar berilgan (chiqim = u qarzdor)
const eskilar = [
  eskiY({ id: 'e1', k: 'tonirok', turi: 'chiqim', s: 800 }),
  eskiY({ id: 'e2', k: 'tonirok', turi: 'kirim', s: 300 }),
];

tekshir('bitimsiz eski yozuv qarzga qo‘shiladi: -12000 + 500 = -11500',
  Y.hamkorQoldiq('tonirok', [b1], [], eskilar) === -11500,
  String(Y.hamkorQoldiq('tonirok', [b1], [], eskilar)));

tekshir('yozuvlar berilmasa eski xulq saqlanadi',
  Y.hamkorQoldiq('tonirok', [b1], []) === -12000);

// t1 — b1 ga to'langan $120. Daftarda ham izi bor, lekin bitim_id
// bilan: uni qayta sanamaslik kerak.
tekshir('bitimga bog‘langan yozuv IKKI MARTA sanalmaydi',
  Y.hamkorQoldiq('tonirok', [b1], [t1], [eskiY({ id: 'e3', k: 'tonirok', turi: 'chiqim', s: 12000, b: 'b1' })]) === 0,
  String(Y.hamkorQoldiq('tonirok', [b1], [t1], [eskiY({ id: 'e3', k: 'tonirok', turi: 'chiqim', s: 12000, b: 'b1' })])));

tekshir('bekor qilingan eski yozuv sanalmaydi',
  Y.hamkorQoldiq('tonirok', [b1], [], [eskiY({ id: 'e4', k: 'tonirok', turi: 'chiqim', s: 9999, bekor: '2026-09-06T09:00:00.000Z' })]) === -12000);

tekshir('hisoblararo o‘tkazma qarz emas',
  Y.hamkorQoldiq('tonirok', [b1], [], [eskiY({ id: 'e5', k: 'tonirok', turi: 'chiqim', s: 9999, koch: 'k1' })]) === -12000);

// Bosh ekrandagi ikki raqam hamkorlar kartochkalari yig'indisiga
// TENG bo'lishi shart — aks holda bosh ekranda bir son, hamkorlar
// ekranida boshqasi turardi.
const jamiY = Y.qarzYigindi([b1, b2], [], eskilar);
const jamiTonirok = Y.hamkorQoldiq('tonirok', [b1, b2], [], eskilar);
const jamiAli = Y.hamkorQoldiq('ali', [b1, b2], [], eskilar);
tekshir('bosh ekran jami = hamkorlar yig‘indisi',
  jamiY.olamiz - jamiY.beramiz === jamiTonirok + jamiAli,
  jamiY.olamiz + ' - ' + jamiY.beramiz + ' = ' + (jamiTonirok + jamiAli));

tekshir('eski yozuv jamida ham ko‘rinadi (beramiz 12000 → 11500)',
  jamiY.olamiz === 5000 && jamiY.beramiz === 11500,
  'olamiz ' + jamiY.olamiz + ', beramiz ' + jamiY.beramiz);

// -------------------------------------------------------------
//  TASDIQ HOLATI BO'YICHA QARZ (hisobot ustuni)
//
//  Reja 7.4: tasdiq shart emas, lekin DALIL. Ikkisi qo'shilganda
//  umumiy qarzga teng chiqishi shart — aks holda hisobotda pul
//  yo'qolardi.
// -------------------------------------------------------------
const tasdiqli = B({ id: 'bt1', k: 'tonirok', y: 'berdim', s: 4000, h: 'tasdiqlangan' });
const kutayotgan = B({ id: 'bt2', k: 'tonirok', y: 'berdim', s: 1000, h: 'kutilmoqda' });
const yopilgan = B({ id: 'bt3', k: 'ali', y: 'oldim', s: 2000, h: 'yopilgan' });

const bolingan = Y.qarzTasdiqBoyicha([tasdiqli, kutayotgan, yopilgan], []);
tekshir('tasdiqlangan: olamiz 4000, beramiz 2000',
  bolingan.tasdiqlangan.olamiz === 4000 && bolingan.tasdiqlangan.beramiz === 2000,
  'olamiz ' + bolingan.tasdiqlangan.olamiz + ', beramiz ' + bolingan.tasdiqlangan.beramiz);
tekshir('«yopilgan» ham TASDIQLANGAN tomonda',
  bolingan.tasdiqlangan.beramiz === 2000);
tekshir('tasdiqlanmagan: olamiz 1000',
  bolingan.tasdiqlanmagan.olamiz === 1000 && bolingan.tasdiqlanmagan.beramiz === 0,
  'olamiz ' + bolingan.tasdiqlanmagan.olamiz);

// Eski daftar yozuvi hech kim tasdiqlamagan — u TASDIQLANMAGAN tomonda
const bolingan2 = Y.qarzTasdiqBoyicha([tasdiqli], [], [eskiY({ id: 'e9', k: 'ali', turi: 'chiqim', s: 700 })]);
tekshir('eski yozuv tasdiqlanmagan deb sanaladi',
  bolingan2.tasdiqlanmagan.olamiz === 700 && bolingan2.tasdiqlangan.olamiz === 4000,
  'tasdiqsiz ' + bolingan2.tasdiqlanmagan.olamiz + ', tasdiqli ' + bolingan2.tasdiqlangan.olamiz);

// Ikkisining yig'indisi umumiy qarzga TENG
const umumiy = Y.qarzYigindi([tasdiqli, kutayotgan, yopilgan], []);
tekshir('tasdiqli + tasdiqsiz = umumiy qarz',
  bolingan.tasdiqlangan.olamiz + bolingan.tasdiqlanmagan.olamiz === umumiy.olamiz &&
  bolingan.tasdiqlangan.beramiz + bolingan.tasdiqlanmagan.beramiz === umumiy.beramiz,
  umumiy.olamiz + ' / ' + umumiy.beramiz);

// -------------------------------------------------------------
//  KECHIKKAN KUN (ro'yxatdagi qizil yozuv)
// -------------------------------------------------------------
const BUGUN = new Date(2026, 8, 20); // 20-sentabr
tekshir('3 kun oldingi muddat → 3 kun',
  Y.kechikkanKun(B({ id: 'k1', k: 'a', y: 'berdim', s: 100, muddat: '2026-09-17' }), [], BUGUN) === 3,
  String(Y.kechikkanKun(B({ id: 'k1', k: 'a', y: 'berdim', s: 100, muddat: '2026-09-17' }), [], BUGUN)));
tekshir('BUGUNGI muddat hali kechikmagan',
  Y.kechikkanKun(B({ id: 'k2', k: 'a', y: 'berdim', s: 100, muddat: '2026-09-20' }), [], BUGUN) === 0);
tekshir('kelajakdagi muddat kechikmagan',
  Y.kechikkanKun(B({ id: 'k3', k: 'a', y: 'berdim', s: 100, muddat: '2026-12-01' }), [], BUGUN) === 0);
tekshir('muddatsiz bitim kechikmaydi',
  Y.kechikkanKun(B({ id: 'k4', k: 'a', y: 'berdim', s: 100 }), [], BUGUN) === 0);
tekshir('to‘langan bitim kechikkan emas',
  Y.kechikkanKun(
    B({ id: 'k5', k: 'a', y: 'berdim', s: 100, muddat: '2026-09-01' }),
    [T({ id: 'kt', k: 'a', b: 'k5', y: 'oldim', s: 100 })],
    BUGUN,
  ) === 0);
tekshir('kechikkanKun va muddatiOtgan bir xil qaror beradi',
  (() => {
    const ro = [
      B({ id: 'z1', k: 'a', y: 'berdim', s: 100, muddat: '2026-09-17' }),
      B({ id: 'z2', k: 'a', y: 'berdim', s: 100, muddat: '2026-12-01' }),
      B({ id: 'z3', k: 'a', y: 'berdim', s: 100, muddat: '2026-09-01', h: 'yopilgan' }),
    ];
    const royxat = Y.muddatiOtgan(ro, [], BUGUN).map((b) => b.id).sort().join(',');
    const birma = ro.filter((b) => Y.kechikkanKun(b, [], BUGUN) > 0).map((b) => b.id).sort().join(',');
    return royxat === birma;
  })());

// -------------------------------------------------------------
//  YURUVCHI BALANS (mijoz kartochkasidagi ustun)
//
//  ENG MUHIM INVARIANT: oxirgi qatordagi qoldiq `hamkorQoldiq`
//  bilan AYNAN teng. Teng bo'lmasa, ro'yxat oxiri bir raqamni,
//  pastdagi «Balans» boshqasini ko'rsatardi.
// -------------------------------------------------------------
console.log('\n6v. Yuruvchi balans');

const yb1 = B({ id: 'yb1', k: 'aziz', y: 'berdim', s: 12000, sana: '2026-09-10T09:00:00.000Z' });
const yb2 = T({ id: 'yb2', k: 'aziz', b: 'yb1', y: 'oldim', s: 5000 });
const yb3 = B({ id: 'yb3', k: 'aziz', y: 'oldim', s: 3000, sana: '2026-09-25T09:00:00.000Z' });
const ybEski = eskiY({ id: 'yb4', k: 'aziz', turi: 'chiqim', s: 800 });

const yurish = Y.hamkorYuruvchi('aziz', [yb1, yb3], [yb2], [ybEski]);

tekshir('hamma qator chiqdi', yurish.length === 4, yurish.length + ' ta');

tekshir('tartib ESKIDAN yangiga',
  yurish.map((x) => x.qator.id).join(',') === 'yb4,yb1,yb2,yb3',
  yurish.map((x) => x.qator.id).join(','));

// ENG MUHIM: oxiri jami bilan teng
const jamiQoldiq = Y.hamkorQoldiq('aziz', [yb1, yb3], [yb2], [ybEski]);
tekshir('INVARIANT: oxirgi qator = hamkorQoldiq',
  yurish[yurish.length - 1].qoldiq === jamiQoldiq,
  yurish[yurish.length - 1].qoldiq + ' / ' + jamiQoldiq);

// Qadamma-qadam: 800 → 12800 → 7800 → 4800
tekshir('qadamlar to‘g‘ri',
  yurish.map((x) => x.qoldiq).join(',') === '800,12800,7800,4800',
  yurish.map((x) => x.qoldiq).join(','));

// Bekor qilingani UMUMAN chiqmaydi: ro'yxatda tursa, yig'indi
// bilan qatorlar mos kelmasdi.
const ybBekor = B({ id: 'yb9', k: 'aziz', y: 'berdim', s: 99999, h: 'bekor' });
const yurish2 = Y.hamkorYuruvchi('aziz', [yb1, yb3, ybBekor], [yb2], [ybEski]);
tekshir('bekor qilingan bitim ro‘yxatda yo‘q',
  yurish2.length === 4 && yurish2[yurish2.length - 1].qoldiq === jamiQoldiq);

// Boshqa hamkorniki aralashmasin
const yurish3 = Y.hamkorYuruvchi('boshqa', [yb1, yb3], [yb2], [ybEski]);
tekshir('boshqa hamkorda bo‘sh', yurish3.length === 0);

// Bitimga BOG'LANGAN yozuv ikki marta sanalmaydi
const ybBogli = eskiY({ id: 'yb5', k: 'aziz', turi: 'kirim', s: 5000, b: 'yb1' });
const yurish4 = Y.hamkorYuruvchi('aziz', [yb1, yb3], [yb2], [ybEski, ybBogli]);
tekshir('bitimga bog‘langan yozuv ro‘yxatda yo‘q',
  yurish4.length === 4 &&
  yurish4[yurish4.length - 1].qoldiq === Y.hamkorQoldiq('aziz', [yb1, yb3], [yb2], [ybEski, ybBogli]));

// Bir sanada ikki yozuv — tartib BARQAROR bo'lishi kerak
const bir1 = B({ id: 'aaa', k: 'x', y: 'berdim', s: 100, sana: '2026-09-10T09:00:00.000Z' });
const bir2 = B({ id: 'bbb', k: 'x', y: 'berdim', s: 200, sana: '2026-09-10T09:00:00.000Z' });
tekshir('bir sanada tartib barqaror',
  Y.hamkorYuruvchi('x', [bir1, bir2], [], []).map((v) => v.qator.id).join(',') ===
  Y.hamkorYuruvchi('x', [bir2, bir1], [], []).map((v) => v.qator.id).join(','));

// -------------------------------------------------------------
//  OPERATSIYA NOMI
// -------------------------------------------------------------
tekshir('tovar berdim',
  Y.operatsiyaNomi({ tur: 'bitim', bitim: { nima: 'tovar', yonalish: 'berdim' } }) === 'Tovar berdim');
tekshir('tovar oldim',
  Y.operatsiyaNomi({ tur: 'bitim', bitim: { nima: 'tovar', yonalish: 'oldim' } }) === 'Tovar oldim');
tekshir('qarz berdim',
  Y.operatsiyaNomi({ tur: 'bitim', bitim: { nima: 'qarz', yonalish: 'berdim' } }) === 'Qarz berdim');
tekshir('pul oldim',
  Y.operatsiyaNomi({ tur: 'tolov', tolov: { yonalish: 'oldim' } }) === 'Pul oldim');
tekshir('pul berdim',
  Y.operatsiyaNomi({ tur: 'tolov', tolov: { yonalish: 'berdim' } }) === 'Pul berdim');
tekshir('eski yozuv: kirim',
  Y.operatsiyaNomi({ tur: 'yozuv', yozuv: { turi: 'kirim' } }) === 'Kirim');

// -------------------------------------------------------------
//  VALYUTA O'GIRISH
//
//  Fayl boshidagi 3-qoida («VALYUTALAR QO'SHILMAYDI») bekor
//  qilinmadi, ANIQLASHTIRILDI: o'girish faqat yozuvda muzlatilgan
//  kurs bilan bo'ladi, taxmin bilan emas.
// -------------------------------------------------------------
console.log('\n6g. Valyuta o\u2018girish');

// $1.00 = 100 tiyin-USD. Kurs 11 850 bo'lsa → 11 850 so'm =
// 1 185 000 tiyin-UZS.
tekshir('1 dollar 11850 so\u2018m bo\u2018ladi',
  Y.asosiygaOgir(100, 11850) === 1185000,
  String(Y.asosiygaOgir(100, 11850)));

tekshir('kurs 1 bo\u2018lsa summa o\u2018zgarmaydi', Y.asosiygaOgir(250000, 1) === 250000);
tekshir('kurs yo\u2018q bo\u2018lsa summa o\u2018zgarmaydi', Y.asosiygaOgir(250000, null) === 250000);
tekshir('kurs nol bo\u2018lsa summa o\u2018zgarmaydi', Y.asosiygaOgir(250000, 0) === 250000);
tekshir('manfiy kurs ham o\u2018zgartirmaydi', Y.asosiygaOgir(250000, -5) === 250000);

// Manfiy summa (qarz) ham to'g'ri o'giriladi
tekshir('manfiy summa o\u2018giriladi', Y.asosiygaOgir(-100, 11850) === -1185000);

// Kasr kurs yaxlitlanadi, tiyin butun qoladi
tekshir('kasr kurs yaxlitlanadi',
  Number.isInteger(Y.asosiygaOgir(100, 11850.7)),
  String(Y.asosiygaOgir(100, 11850.7)));

// --- Hisoblarning asosiy valyutadagi jami ---
const vH = [
  { id: 'v1', nom: 'Naqd', turi: 'naqd', valyuta: 'UZS', boshlangich: 1000000, tartib: 0, faol: true, versiya: 1 },
  { id: 'v2', nom: 'Dollar', turi: 'naqd', valyuta: 'USD', boshlangich: 10000, tartib: 1, faol: true, versiya: 1 },
  { id: 'v3', nom: 'Yopiq', turi: 'naqd', valyuta: 'USD', boshlangich: 99999, tartib: 2, faol: false, versiya: 1 },
];
const vKurs = [{ valyuta: 'USD', kurs: 11850 }];

// 1 000 000 tiyin-UZS + 10 000 tiyin-USD * 11850 = 1 000 000 + 118 500 000
tekshir('jami asosiy valyutada',
  Y.jamiAsosiyda(vH, [], vKurs, 'UZS') === 1000000 + 118500000,
  String(Y.jamiAsosiyda(vH, [], vKurs, 'UZS')));

tekshir('YOPIQ hisob jamida yo\u2018q',
  Y.jamiAsosiyda(vH, [], vKurs, 'UZS') !== 1000000 + 118500000 + 99999 * 11850);

// Kurs berilmagan valyuta 1 deb olinadi — raqam yo'qolmaydi,
// lekin xato ham bo'lmaydi.
tekshir('kurssiz valyuta 1 deb olinadi',
  Y.jamiAsosiyda(vH, [], [], 'UZS') === 1000000 + 10000,
  String(Y.jamiAsosiyda(vH, [], [], 'UZS')));

// ASOSIY valyutadagi hisob HECH QACHON o'girilmaydi, hatto
// kurs jadvalida UZS bo'lsa ham: aks holda so'm so'mga
// ko'paytirilardi.
tekshir('asosiy valyuta o\u2018girilmaydi',
  Y.jamiAsosiyda(vH, [], [{ valyuta: 'UZS', kurs: 999 }, ...vKurs], 'UZS') ===
    1000000 + 118500000,
  String(Y.jamiAsosiyda(vH, [], [{ valyuta: 'UZS', kurs: 999 }, ...vKurs], 'UZS')));

// Valyutalar ro'yxati bazadagi cheklov bilan bir xil bo'lishi
// kerak — aks holda ilova yozmoqchi bo'lgan valyutani server
// rad etardi.
tekshir('to\u2018qqizta valyuta bor', Y.VALYUTALAR.length === 9, Y.VALYUTALAR.join(','));
for (const v of Y.VALYUTALAR) {
  const m = Y.formatla(123456, v);
  tekshir(v + ': belgisi bor', m.length > 4 && !m.includes('undefined'), m);
}

// -------------------------------------------------------------
//  BALANS CHEKLOVI
//
//  Cheklov — hamkorga berilishi mumkin bo'lgan eng katta QARZ.
//  Manfiy tomonga (men unga qarzdorman) cheklov qo'yilmaydi:
//  o'z qarzim mening ishim.
// -------------------------------------------------------------
tekshir('cheklov yo‘q → null', Y.cheklovTekshir(null, 5000, 9999) === null);
tekshir('nol cheklov ham yo‘q deb qaraladi', Y.cheklovTekshir(0, 5000, 9999) === null);

tekshir('10000 cheklovda 4000+5000=9000 — oshmadi',
  Y.cheklovTekshir(10000, 4000, 5000)?.oshdi === false);
tekshir('10000 cheklovda 4000+7000=11000 — OSHDI',
  Y.cheklovTekshir(10000, 4000, 7000)?.oshdi === true);
tekshir('oshgan miqdori 1000',
  Y.cheklovTekshir(10000, 4000, 7000)?.oshgan === 1000,
  String(Y.cheklovTekshir(10000, 4000, 7000)?.oshgan));
tekshir('aynan cheklovga teng bo‘lsa oshmagan',
  Y.cheklovTekshir(10000, 4000, 6000)?.oshdi === false);

// «oldim» manfiy o‘zgarish: qarzim kamayadi, cheklov tegmaydi
tekshir('manfiy o‘zgarish cheklovni buzmaydi',
  Y.cheklovTekshir(10000, 9000, -5000)?.oshdi === false);
tekshir('men qarzdor bo‘lsam cheklov ishlamaydi',
  Y.cheklovTekshir(10000, -50000, -9000)?.oshdi === false);

console.log('\n7. Baza funksiyalari va cheklovlar');

const javob = await sqlXom(BLOK);
let xabar = javob.matn;
try {
  xabar = JSON.parse(javob.matn)?.message ?? JSON.parse(javob.matn)?.error?.message ?? javob.matn;
} catch {
  /* JSON emas */
}
const m = xabar.match(/SINOV_NATIJA: (\[[\s\S]*?\])\s*(?:CONTEXT|PL\/pgSQL|$)/);
if (!m) {
  tekshir('sinov bloki bajarildi', false, xabar.slice(0, 300));
} else {
  for (const n of JSON.parse(m[1])) tekshir(n.nom, n.ok === true, n.izoh);
}

// Rollback haqiqatan bo'ldimi — jonli bazada iz qolmasin
const qoldi = await sqlXom(`
  select count(*) as n from public.organizations where name like 'SINOV-KASSA%'
`);
let soni = -1;
try {
  soni = Number(JSON.parse(qoldi.matn)[0]?.n);
} catch {
  /* o'qib bo'lmadi */
}
tekshir('sinov tashkilotlari qaytarib olindi', soni === 0, soni === 0 ? 'iz yo‘q' : `${soni} ta QOLDI`);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
