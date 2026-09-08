// =============================================================
//  SKLADLAR ARO NARX
//
//  Ikki talab tekshiriladi:
//
//   1. Katalogdagi SOLISHTIRISH jadvali (`dori_narx_solishtir`):
//      qator — dori nomi, ustun — sklad, katak — TANNARX. Sotuv narxi
//      emas: ustama har skladda har xil va u skladning arzonligini
//      emas, bizning foydamizni ko'rsatadi. Shu sabab sinov ataylab
//      ustamasi katta sklad qo'yadi va katakda TANNARX turishini
//      talab qiladi.
//
//   2. Sotuv qidiruvi (`dori_sotuv_qidir_skladlar`): mijoz «aspirin
//      bormi?» deganda uch skladdagi narx ham ko'rinsin. Joriy sklad
//      birinchi turadi, joriy skladda yo'q dori ham ro'yxatga tushadi.
//
//  Bir xil nom IKKI dori qatori bo'lishi mumkin (ishlab chiqaruvchi
//  har xil yozilgan). Solishtirish NOM bo'yicha — sinovda aynan shu
//  holat quriladi.
//
//  Sinov O'Z skladlarini va dorilarini yaratadi (SINOV-SOL-*) va
//  oxirida o'chiradi — haqiqiy katalogga tegmaydi.
//
//  Ishga tushirish:
//    node tests/sklad-solishtir.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let K;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  console.error('\n  kodchi/kalitlar.json topilmadi — bu skript shaxsiy kompyuterda ishlaydi.\n');
  process.exit(1);
}

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + K.mgmt_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 400));
  return JSON.parse(t);
}

// RPC ichida is_super_admin() bor: so'rovni super admin nomidan bajaramiz
async function admin(q) {
  const r = await sql(
    `select set_config('request.jwt.claims',
       json_build_object('sub', (select id from profiles where role = 'super_admin' limit 1))::text,
       true) as x;
     ${q}`
  );
  return r[r.length - 1];
}

let yiqildi = 0;
function tekshir(nom, ok, qosh) {
  console.log((ok ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (qosh !== undefined ? '  → ' + qosh : ''));
  if (!ok) yiqildi++;
}

const NOM  = 'SINOV SOLISHTIR DORI';
const NOM2 = 'SINOV YOLGIZ SOLISHTIR';

async function tozala() {
  // Sklad o'chsa taklif ham o'chadi (on delete cascade), lekin dori
  // qoladi — uni alohida o'chiramiz, aks holda keyingi yurishda
  // «duplicate key» chiqardi
  await sql(`delete from dori_warehouses where name like 'SINOV-SOL-%';`);
  await sql(`delete from dori_products where name in ('${NOM}', '${NOM2}');`);
}

(async () => {
  await tozala();
  console.log('\n\x1b[1mSKLADLAR ARO NARX\x1b[0m');

  // ---------- tayyorlash ----------
  // A: ustamasiz.  B: ustamasi 100% — sotuv narxi tannarxdan ikki
  // barobar. Solishtirish TANNARXNI olishi kerak.
  const [{ id: wA }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-SOL-A', 901) returning id;"
  );
  const [{ id: wB }] = await sql(
    "insert into dori_warehouses (name, markup_pct, priority) values ('SINOV-SOL-B', 100, 902) returning id;"
  );

  // Bir xil NOM, har xil ishlab chiqaruvchi — bazada IKKI qator.
  // Odam uchun esa bitta dori: solishtirish shuni bir qatorga yig'sin.
  const [{ id: pA }] = await sql(
    `insert into dori_products (name, name_norm, manufacturer)
     values ('${NOM}', dori_norm('${NOM}'), 'ISHLAB A') returning id;`
  );
  const [{ id: pB }] = await sql(
    `insert into dori_products (name, name_norm, manufacturer)
     values ('${NOM}', dori_norm('${NOM}'), 'ISHLAB B') returning id;`
  );
  const [{ id: pC }] = await sql(
    `insert into dori_products (name, name_norm, manufacturer)
     values ('${NOM2}', dori_norm('${NOM2}'), 'ISHLAB A') returning id;`
  );

  await sql(`
    insert into dori_offers (warehouse_id, product_id, base_price, price, stock) values
      ('${wA}', '${pA}', 10000, 10000, 5),
      ('${wB}', '${pB}', 20000, 40000, 7),
      ('${wA}', '${pC}',  5000,  5000, 3);
  `);

  // ================================================== 1. SOLISHTIRISH
  console.log('\n1. Solishtirish jadvali');

  const j1 = (await admin(`select dori_narx_solishtir('${NOM}', true, 'nom', 0, 50) as j;`)).j;
  const q1 = (j1.items ?? []).find((x) => x.nom === NOM);

  tekshir('bir xil nom BITTA qatorga yig‘ildi', !!q1 && q1.skladlar_soni === 2,
    q1 ? `${q1.skladlar_soni} sklad` : 'qator topilmadi');

  const kA = q1?.hujayralar?.[wA];
  const kB = q1?.hujayralar?.[wB];
  tekshir('A skladning tannarxi katakda', Number(kA?.narx) === 10000, kA?.narx);

  // Eng muhim tekshiruv: B ning SOTUV narxi 40 000, tannarxi 20 000.
  // Katakda 40 000 chiqsa - jadval skladning arzonligini emas, bizning
  // ustamamizni ko'rsatgan bo'ladi.
  tekshir('katakda SOTUV narxi emas, TANNARX', Number(kB?.narx) === 20000,
    kB?.narx + ' (sotuv narxi 40 000)');

  tekshir('farq to‘g‘ri hisoblandi',
    Number(q1?.min_narx) === 10000 && Number(q1?.max_narx) === 20000 && Number(q1?.farq) === 10000,
    `${q1?.min_narx} → ${q1?.max_narx}`);
  tekshir('farq foizi to‘g‘ri', Number(q1?.farq_foiz) === 100, q1?.farq_foiz + '%');

  tekshir('ishlab chiqaruvchi katakda ko‘rinadi', kA?.ic === 'ISHLAB A' && kB?.ic === 'ISHLAB B',
    `${kA?.ic} / ${kB?.ic}`);
  tekshir('qoldiq katakda ko‘rinadi', Number(kA?.qoldiq) === 5 && Number(kB?.qoldiq) === 7,
    `${kA?.qoldiq} / ${kB?.qoldiq}`);

  // ---------- «faqat nomi bir xillari» ----------
  console.log('\n2. Faqat bir nechta skladda bori');

  const j2 = (await admin(`select dori_narx_solishtir('SINOV', true, 'nom', 0, 50) as j;`)).j;
  const nomlar2 = (j2.items ?? []).map((x) => x.nom);
  tekshir('yolg‘iz skladdagi dori chiqmaydi',
    nomlar2.includes(NOM) && !nomlar2.includes(NOM2),
    nomlar2.join(', ') || 'bo‘sh');

  const j3 = (await admin(`select dori_narx_solishtir('SINOV', false, 'nom', 0, 50) as j;`)).j;
  const nomlar3 = (j3.items ?? []).map((x) => x.nom);
  tekshir('belgi olib tashlansa — chiqadi',
    nomlar3.includes(NOM) && nomlar3.includes(NOM2),
    nomlar3.join(', ') || 'bo‘sh');

  // ---------- saralash ----------
  console.log('\n3. Saralash');

  const j4 = (await admin(`select dori_narx_solishtir('SINOV', false, 'farq', 0, 50) as j;`)).j;
  const oxirgi = (j4.items ?? []).map((x) => x.nom);
  tekshir('farq bo‘yicha saralanganda kattasi yuqorida',
    oxirgi.indexOf(NOM) >= 0 && oxirgi.indexOf(NOM) < oxirgi.indexOf(NOM2),
    oxirgi.join(' → '));

  const j5 = (await admin(`select dori_narx_solishtir('SINOV', false, 'nom', 0, 50) as j;`)).j;
  const alifbo = (j5.items ?? []).map((x) => x.nom);
  tekshir('nom bo‘yicha saralanganda alifbo tartibi',
    alifbo.indexOf(NOM) < alifbo.indexOf(NOM2),
    alifbo.join(' → '));

  // ---------- bitta skladda bir nechta taklif ----------
  console.log('\n4. Bitta skladda bir xil nomdagi ikki taklif');

  // A skladga o'sha nomdagi IKKINCHI dori qo'shiladi (boshqa ishlab
  // chiqaruvchi, arzonroq). Katak eng arzonini ko'rsatib, nechtaligini
  // aytib turishi kerak - aks holda operator "narx tushib ketibdi"
  // deb o'ylardi.
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock)
             values ('${wA}', '${pB}', 8000, 8000, 2);`);

  const j6 = (await admin(`select dori_narx_solishtir('${NOM}', true, 'nom', 0, 50) as j;`)).j;
  const q6 = (j6.items ?? []).find((x) => x.nom === NOM);
  tekshir('katakda eng arzoni', Number(q6?.hujayralar?.[wA]?.narx) === 8000, q6?.hujayralar?.[wA]?.narx);
  tekshir('taklif soni aytiladi', Number(q6?.hujayralar?.[wA]?.soni) === 2, q6?.hujayralar?.[wA]?.soni);

  // ================================================== 5. SOTUV QIDIRUVI
  console.log('\n5. Sotuv qidiruvi — hamma sklad');

  const s1 = (await admin(`select dori_sotuv_qidir_skladlar('${wA}', '${NOM}', 20) as j;`)).j;
  const g1 = (s1 ?? []).find((x) => x.nom === NOM);
  tekshir('nom bo‘yicha bitta guruh', !!g1, g1 ? `${g1.takliflar.length} taklif` : 'topilmadi');
  tekshir('hamma sklad taklifi qaytdi', (g1?.takliflar ?? []).length === 3,
    (g1?.takliflar ?? []).map((t) => t.sklad + ':' + t.price).join(' · '));
  tekshir('joriy sklad birinchi', g1?.takliflar?.[0]?.warehouse_id === wA,
    g1?.takliflar?.[0]?.sklad);
  tekshir('joriy skladda borligi belgilangan', g1?.joriyda === true, String(g1?.joriyda));

  // Sotuv qidiruvida SOTUV narxi turadi (mijoz shuni to'laydi) -
  // solishtirish jadvalidan farqli
  const bTaklif = (g1?.takliflar ?? []).find((t) => t.warehouse_id === wB);
  tekshir('sotuvda ustamali narx ko‘rinadi', Number(bTaklif?.price) === 40000,
    bTaklif?.price + ' (tannarx 20 000)');
  tekshir('pachka maydoni bor', Number(g1?.takliflar?.[0]?.pachka) >= 1, g1?.takliflar?.[0]?.pachka);

  // Joriy skladda YO'Q dori ham ko'rinishi kerak: aynan shu sotuvni
  // qo'ldan chiqarardi
  const s2 = (await admin(`select dori_sotuv_qidir_skladlar('${wB}', '${NOM2}', 20) as j;`)).j;
  const g2 = (s2 ?? []).find((x) => x.nom === NOM2);
  tekshir('joriy skladda yo‘q dori ham chiqadi', !!g2 && g2.joriyda === false,
    g2 ? 'joriyda=' + g2.joriyda : 'topilmadi');
  tekshir('boshqa skladning nomi aytiladi', g2?.takliflar?.[0]?.sklad === 'SINOV-SOL-A',
    g2?.takliflar?.[0]?.sklad);

  // ================================================== 6. RUXSAT
  console.log('\n6. Ruxsat');

  for (const chaqiruv of [
    `dori_narx_solishtir(null, true, 'nom', 0, 5)`,
    `dori_sotuv_qidir_skladlar('${wA}', '${NOM}', 5)`,
  ]) {
    let radMi = false;
    try {
      // Super admin BO'LMAGAN foydalanuvchi nomidan
      await sql(
        `select set_config('request.jwt.claims',
           json_build_object('sub', (select id from profiles where role <> 'super_admin' limit 1))::text,
           true) as x;
         select ${chaqiruv} as j;`
      );
    } catch (e) {
      radMi = /RUXSAT_YOQ/.test(String(e.message));
    }
    tekshir('super admin bo‘lmaganga yopiq: ' + chaqiruv.split('(')[0], radMi);
  }

  // ---------- tozalash ----------
  await tozala();
  const [{ n }] = await sql(
    `select count(*)::int as n from dori_warehouses where name like 'SINOV-SOL-%';`
  );
  const [{ m }] = await sql(
    `select count(*)::int as m from dori_products where name in ('${NOM}', '${NOM2}');`
  );
  tekshir('sinov ma’lumoti o‘zidan keyin tozalandi', n === 0 && m === 0, `${n} sklad, ${m} dori`);

  console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
  process.exit(yiqildi === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\n\x1b[31mSINOV YIQILDI:\x1b[0m ' + e.message + '\n');
  // Yiqilsa ham sinov ma'lumoti bazada qolib ketmasin
  try { await tozala(); } catch { /* tozalab bo'lmadi — qo'lda o'chiriladi */ }
  process.exit(1);
});
