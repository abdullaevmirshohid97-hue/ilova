// =============================================================
//  MENEJER HISOB-KITOBI SINOVI
//
//  Menejer mijozlarini yashirsa, korxona ular bilan pul ishini
//  yuritmaydi — pulni menejer o'zi oladi. Shuning uchun unga o'z
//  to'lov vositasi berildi (menejer_tolov / menejer_storno).
//
//  Bu yerda eng katta xavf — CHEGARA: menejer faqat O'Z mijoziga
//  yoza olishi kerak. Boshqa menejerning mijoziga yoki o'zining
//  korxona oldidagi qarziga "to'ladim" deb yozib qo'ysa, pul
//  yo'qoladi va buni faqat oy oxirida sezilardi.
//
//  Sinov jonli bazaga to'lov yozadi va OXIRIDA o'zi tozalaydi:
//  boshlang'ich balans bir tiyinigacha qaytarilgani tekshiriladi.
//
//  Ishga tushirish:  node tests/menejer-hisob.mjs
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

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${K.mgmt_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) return { xato: t.slice(0, 400) };
  return { qatorlar: JSON.parse(t) };
}

// Aynan shu odam sifatida: RLS va funksiya tekshiruvlari to'liq ishlaydi
async function kimdir(uid, q) {
  return sql(
    `set local role authenticated;` +
      ` select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true);` +
      ` ${q}`
  );
}

async function son(q) {
  const { qatorlar } = await sql(q);
  return Number(Object.values(qatorlar[0])[0]);
}

console.log('\n\x1b[1mMENEJER HISOB-KITOBI\x1b[0m');

// ---------- Ishtirokchilar ----------
const { qatorlar: mgrlar } = await sql(`
  select m.id, m.name,
         (select p.id from profiles p where p.manager_id = m.id limit 1) as profil,
         (select px.id from customers px where px.proxy_manager_id = m.id) as proxy_id,
         (select c.id from customers c where c.manager_id = m.id order by c.name limit 1) as mijoz_id,
         (select c.name from customers c where c.manager_id = m.id order by c.name limit 1) as mijoz_nom
  from managers m
  where exists (select 1 from customers c where c.manager_id = m.id)
    and exists (select 1 from profiles p where p.manager_id = m.id)
  limit 1
`);
const mgr = mgrlar?.[0];

tekshir('menejer va uning profili topildi', Boolean(mgr?.profil), mgr?.name ?? '');
tekshir('sinash uchun mijoz bor', Boolean(mgr?.mijoz_id), mgr?.mijoz_nom ?? '');
tekshir('menejer-xaridor kartochkasi bor', Boolean(mgr?.proxy_id));

if (!mgr?.profil || !mgr?.mijoz_id || !mgr?.proxy_id) {
  console.error('\n  Ishtirokchilar to\'liq emas — to\'xtatildi.\n');
  process.exit(1);
}

// Begona mijoz — menejerga tegishli BO'LMAGAN
const { qatorlar: begonalar } = await sql(
  `select id, name from customers where (manager_id is null or manager_id <> '${mgr.id}')
     and proxy_manager_id is null limit 1`
);
const begona = begonalar?.[0];

const BOSH = {
  balans: await son(
    `select coalesce(sum(amount),0) from ledger_entries where customer_id = '${mgr.mijoz_id}'`
  ),
  tolov: await son(`select count(*)::int from payments`),
  yozuv: await son(`select count(*)::int from ledger_entries`),
};
console.log(
  `\n  boshlang'ich: mijoz balansi=${BOSH.balans}, to'lovlar=${BOSH.tolov}, yozuvlar=${BOSH.yozuv}`
);

let tolovId = null;

try {
  // ---------- 1. Hisob varag'i ----------
  console.log('\n1. Hisob varag\'i');

  const { qatorlar: h } = await kimdir(mgr.profil, 'select menejer_hisob() as j');
  const hisob = h[0].j;
  tekshir('menejer_hisob ishlaydi', Boolean(hisob));
  tekshir(
    'mijozlar ro\'yxati keldi',
    Array.isArray(hisob.mijozlar) && hisob.mijozlar.length > 0,
    (hisob.mijozlar?.length ?? 0) + ' ta'
  );

  const kutilganMijozQarz = await son(`
    select coalesce(sum(le.amount),0) from ledger_entries le
    join customers c on c.id = le.customer_id where c.manager_id = '${mgr.id}'
  `);
  const kutilganKorxona = await son(
    `select coalesce(sum(amount),0) from ledger_entries where customer_id = '${mgr.proxy_id}'`
  );
  tekshir(
    'mijozlar qarzi to\'g\'ri',
    Number(hisob.mijozlar_qarzi) === kutilganMijozQarz,
    `${hisob.mijozlar_qarzi} / ${kutilganMijozQarz}`
  );
  tekshir(
    'korxona oldidagi qarz to\'g\'ri',
    Number(hisob.korxonaga_qarzim) === kutilganKorxona,
    `${hisob.korxonaga_qarzim} / ${kutilganKorxona}`
  );
  tekshir(
    'ikki qarz ajratilgan (aralashib ketmagan)',
    Number(hisob.mijozlar_qarzi) !== Number(hisob.korxonaga_qarzim) ||
      kutilganMijozQarz === kutilganKorxona
  );

  // ---------- 2. To'lov yozish ----------
  console.log('\n2. To\'lov qabul qilish');

  const SUMMA = 1000;
  const r = await kimdir(
    mgr.profil,
    `select menejer_tolov('${mgr.mijoz_id}', ${SUMMA}, 'cash', 'SINOV to''lovi') as id`
  );
  tolovId = r.qatorlar?.[0]?.id ?? null;
  tekshir('menejer o\'z mijoziga to\'lov yoza oladi', Boolean(tolovId), r.xato ?? '');

  if (tolovId) {
    const yangiBalans = await son(
      `select coalesce(sum(amount),0) from ledger_entries where customer_id = '${mgr.mijoz_id}'`
    );
    tekshir(
      'balans to\'lov summasiga kamaydi',
      yangiBalans === BOSH.balans - SUMMA,
      `${yangiBalans} / kutilgan ${BOSH.balans - SUMMA}`
    );

    // Menejer o'z to'lovini ko'rishi kerak — avval payments'da unga
    // siyosat yo'q edi: to'lov yozilardi, lekin ro'yxatda ko'rinmasdi
    const { qatorlar: p } = await kimdir(
      mgr.profil,
      `select count(*)::int as n from payments where id = '${tolovId}'`
    );
    tekshir('menejer o\'z to\'lovini ko\'radi', Number(p[0].n) === 1);

    const { qatorlar: hr } = await kimdir(
      mgr.profil,
      `select menejer_mijoz_harakati('${mgr.mijoz_id}') as j`
    );
    const bor = (hr[0].j ?? []).some((x) => x.payment_id === tolovId);
    tekshir('harakat ro\'yxatida ko\'rinadi', bor);
  }

  // ---------- 3. Chegara ----------
  console.log('\n3. Chegara');

  if (begona) {
    const r2 = await kimdir(
      mgr.profil,
      `select menejer_tolov('${begona.id}', 100, 'cash', 'SINOV — bo''lmasligi kerak') as id`
    );
    tekshir(
      'begona mijozga to\'lov yoza olmaydi',
      Boolean(r2.xato) && /RUXSAT_YOQ/.test(r2.xato),
      r2.xato ? '' : 'YOZILDI!'
    );
  } else {
    tekshir('begona mijoz topildi (sinov bo\'shga ishlamayapti)', false, 'topilmadi');
  }
  {
    // O'zining korxona oldidagi qarzini "to'ladim" deb yoza olmasin
    const r3 = await kimdir(
      mgr.profil,
      `select menejer_tolov('${mgr.proxy_id}', 100, 'cash', 'SINOV — bo''lmasligi kerak') as id`
    );
    tekshir(
      'o\'z korxona qarzini o\'zi yopa olmaydi',
      Boolean(r3.xato) && /RUXSAT_YOQ/.test(r3.xato),
      r3.xato ? '' : 'YOZILDI!'
    );
  }
  {
    const r4 = await kimdir(
      mgr.profil,
      `select menejer_tolov('${mgr.mijoz_id}', -500, 'cash', 'SINOV') as id`
    );
    tekshir('manfiy summa o\'tmaydi', Boolean(r4.xato) && /NOTOGRI_SUMMA/.test(r4.xato));
  }
  {
    const r5 = await kimdir(
      mgr.profil,
      `select menejer_tolov('${mgr.mijoz_id}', 100, 'bitcoin', 'SINOV') as id`
    );
    tekshir('noma\'lum to\'lov usuli o\'tmaydi', Boolean(r5.xato) && /NOTOGRI_USUL/.test(r5.xato));
  }
  {
    const r6 = await kimdir(
      mgr.profil,
      `select menejer_tolov('${mgr.mijoz_id}', 100, 'cash', 'SINOV', now() + interval '2 days') as id`
    );
    tekshir('kelajak sanasi o\'tmaydi', Boolean(r6.xato) && /SANA_KELAJAKDA/.test(r6.xato));
  }
  {
    // Admin menejerning yashirin mijoziga tegmasin
    const { qatorlar: a } = await sql(
      `select p.id as pid from profiles p join managers m on m.org_id = p.org_id
       where p.role = 'admin' and m.id = '${mgr.id}' limit 1`
    );
    const adminId = a?.[0]?.pid;
    const yashirin = await son(
      `select case when mijoz_korinsin then 0 else 1 end from managers where id = '${mgr.id}'`
    );
    if (adminId && yashirin === 1) {
      const r7 = await kimdir(
        adminId,
        `select record_payment('${mgr.mijoz_id}', 100, 'cash', 'SINOV') as id`
      );
      tekshir(
        'admin yashirin mijozga to\'lov yoza olmaydi',
        Boolean(r7.xato) && /RUXSAT_YOQ/.test(r7.xato),
        r7.xato ? '' : 'YOZILDI!'
      );
    } else {
      tekshir('admin tekshiruvi o\'tkazildi', true, 'menejer yashirin emas — o\'tkazib yuborildi');
    }
  }

  // ---------- 4. Storno ----------
  console.log('\n4. Storno');

  if (tolovId) {
    const s1 = await kimdir(mgr.profil, `select menejer_storno('${tolovId}', '') as x`);
    tekshir('izohsiz storno o\'tmaydi', Boolean(s1.xato) && /IZOH_MAJBURIY/.test(s1.xato));

    const s2 = await kimdir(mgr.profil, `select menejer_storno('${tolovId}', 'SINOV storno') as x`);
    tekshir('storno ishlaydi', !s2.xato, s2.xato ?? '');

    const balans = await son(
      `select coalesce(sum(amount),0) from ledger_entries where customer_id = '${mgr.mijoz_id}'`
    );
    tekshir(
      'storno balansni tikladi',
      balans === BOSH.balans,
      `${balans} / ${BOSH.balans}`
    );

    const s3 = await kimdir(mgr.profil, `select menejer_storno('${tolovId}', 'ikkinchi marta') as x`);
    tekshir(
      'ikki marta storno qilib bo\'lmaydi',
      Boolean(s3.xato) && /ALLAQACHON_STORNO/.test(s3.xato),
      s3.xato ? '' : 'IKKI MARTA O\'TDI!'
    );
  }
} finally {
  // ---------- 5. Tozalash ----------
  console.log('\n5. Tozalash');
  // Faqat tolovId bo'yicha tozalash YETARLI EMAS: chegara sinovlaridan
  // biri kutilmaganda o'tib ketsa (bir marta shunday bo'ldi — admin
  // yashirin mijozga to'lov yozib yubordi), o'sha yozuv jonli bazada
  // qolib ketardi. Shuning uchun izohi bo'yicha hammasi olib tashlanadi.
  await sql(`delete from ledger_entries where payment_id in (
               select id from payments where note like 'SINOV%')`);
  await sql(`delete from payments where note like 'SINOV%'`);
  if (tolovId) {
    await sql(`delete from ledger_entries where payment_id = '${tolovId}'`);
    await sql(`delete from payments where id = '${tolovId}'`);
  }

  const oxir = {
    balans: await son(
      `select coalesce(sum(amount),0) from ledger_entries where customer_id = '${mgr.mijoz_id}'`
    ),
    tolov: await son(`select count(*)::int from payments`),
    yozuv: await son(`select count(*)::int from ledger_entries`),
  };
  tekshir('mijoz balansi tiklandi', oxir.balans === BOSH.balans, `${oxir.balans} / ${BOSH.balans}`);
  tekshir('sinov to\'lovi qolmadi', oxir.tolov === BOSH.tolov, `${oxir.tolov} / ${BOSH.tolov}`);
  tekshir('ortiqcha yozuv qolmadi', oxir.yozuv === BOSH.yozuv, `${oxir.yozuv} / ${BOSH.yozuv}`);
}

console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
