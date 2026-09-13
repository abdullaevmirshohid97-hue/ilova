// =============================================================
//  CREDIT DEBIT — SINXRONIZATSIYA DVIGATELI
//
//  Offline ilovaning eng xavfli qismi. Bu yerda xato bo'lsa,
//  foydalanuvchi yozuvini yo'qotadi va buni oy oxirida — balans
//  to'g'ri chiqmaganda — bilib qoladi.
//
//  Dvigatel `Ombor` va `Server` interfeyslari bilan ishlagani uchun
//  uni telefonsiz, brauzersiz va INTERNETSIZ sinash mumkin: bu yerda
//  server soxta (fake) va u ataylab yiqiladi, kechikadi, ziddiyat
//  qaytaradi.
//
//  Nimalar bosib ko'riladi:
//   · tarmoq yo'qligida yozuv navbatda qoladi va TARTIB saqlanadi
//   · bir amal ikki marta yuborilsa dubl bo'lmaydi
//   · kursor qatorni TUSHIRIB QOLDIRMAYDI (chegaraga to'lganda ham)
//   · ziddiyat jimgina bosib o'tilmaydi
//   · o'rtada uzilgan olish qayta kelganda ma'lumot yo'qolmaydi
//
//  Ishga tushirish:  node tests/kassa-sinx.mjs   (bazaga tegmaydi)
// =============================================================

import { mkdtempSync } from 'node:fs';
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

const ish = mkdtempSync(join(tmpdir(), 'kassa-sinx-'));

async function yigib(fayl, nom) {
  const chiqish = join(ish, nom);
  await esbuild.build({
    entryPoints: [join(ROOT, fayl)],
    outfile: chiqish,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
  });
  return import('file://' + chiqish.replace(/\\/g, '/'));
}

const S = await yigib('apps/kassa/src/lib/sinx.ts', 'sinx.mjs');
const X = await yigib('apps/kassa/src/ombor/xotira.ts', 'xotira.mjs');

console.log('\n\x1b[1mCREDIT DEBIT — SINXRONIZATSIYA\x1b[0m');

// =============================================================
//  Soxta server
// =============================================================
function soxtaServer(imkon = {}) {
  const jadvallar = { hisoblar: [], turkumlar: [], klientlar: [], yozuvlar: [] };
  let oqim = 0; // server ketma-ketligi (o_raqam)
  const tarix = [];

  const server = {
    /** Server tomondagi "boshqa qurilma" o'zgarishi */
    serverdaYoz(jadval, qator) {
      const bor = jadvallar[jadval].find((x) => x.id === qator.id);
      if (bor) Object.assign(bor, qator, { o_raqam: ++oqim, versiya: (bor.versiya ?? 1) + 1 });
      else jadvallar[jadval].push({ versiya: 1, ...qator, o_raqam: ++oqim });
    },
    jadvallar,
    tarix,

    async ozgarishlar(kursor) {
      if (imkon.olishYiqilsin) throw new Error('tarmoq yo‘q');
      const chegara = imkon.chegara ?? 500;
      const javob = { kursor, yana: false };
      let tosiq = null;
      for (const j of ['hisoblar', 'turkumlar', 'klientlar', 'yozuvlar']) {
        const hammasi = jadvallar[j].filter((x) => x.o_raqam > kursor).sort((a, b) => a.o_raqam - b.o_raqam);
        const paket = hammasi.slice(0, chegara);
        javob[j] = paket.map((x) => ({ ...x }));
        if (paket.length) javob.kursor = Math.max(javob.kursor, paket[paket.length - 1].o_raqam);
        if (hammasi.length > chegara) {
          const oxirgi = paket[paket.length - 1].o_raqam;
          tosiq = tosiq === null ? oxirgi : Math.min(tosiq, oxirgi);
        }
      }
      if (tosiq !== null) {
        javob.kursor = tosiq;
        javob.yana = true;
      }
      return javob;
    },

    async yubor(amal) {
      tarix.push({ amal_id: amal.id, yozuv_id: amal.yozuv_id, tur: amal.tur });
      if (imkon.yuborishYiqilsin) throw new Error('tarmoq yo‘q');

      const royxat = jadvallar[amal.jadval];
      const bor = royxat.find((x) => x.id === amal.yozuv_id);

      if (amal.tur === 'qosh') {
        // Idempotent: o'sha id bilan ikkinchi marta kelsa — jim o'tadi
        if (bor) return { holat: 'ok' };
        royxat.push({ id: amal.yozuv_id, ...amal.qiymat, versiya: 1, o_raqam: ++oqim });
        return { holat: 'ok' };
      }

      if (!bor) return { holat: 'rad', sabab: 'Yozuv topilmadi' };
      if (amal.versiya !== undefined && bor.versiya !== amal.versiya) {
        return { holat: 'ziddiyat' };
      }
      Object.assign(bor, amal.qiymat, { versiya: (bor.versiya ?? 1) + 1, o_raqam: ++oqim });
      return { holat: 'ok' };
    },

    async kursorSaqla() {},
  };
  return server;
}

// =============================================================
// 1. Oddiy oqim
// =============================================================
console.log('\n1. Oddiy oqim');

{
  const ombor = X.xotiraOmbori();
  const server = soxtaServer();
  await ombor.navbatQosh(S.amalYasa('qosh', 'yozuvlar', 'y1', { turi: 'kirim', summa: '100.00' }));

  const n = await S.sinxronla(ombor, server);
  tekshir('yozuv serverga yuborildi', n.yuborildi === 1, `${n.yuborildi} ta`);
  tekshir('navbat bo‘shadi', n.navbatda === 0);
  tekshir('holat: sinxron', n.holat === 'sinxron', n.holat);
  tekshir('server yozuvni oldi', server.jadvallar.yozuvlar.length === 1);

  // Ikkinchi sinx — server o'z yozuvini qaytaradi
  const n2 = await S.sinxronla(ombor, server);
  const mahalliy = await ombor.royxat('yozuvlar');
  tekshir('yozuv mahalliy omborda ham bor', mahalliy.length === 1, `${mahalliy.length} ta`);
  tekshir('takroriy sinx yangi narsa olmadi', n2.olindi === 0, `${n2.olindi} ta`);
}

// =============================================================
// 2. Internet yo'q
// =============================================================
console.log('\n2. Internet yo‘q');

{
  const ombor = X.xotiraOmbori();
  const server = soxtaServer({ yuborishYiqilsin: true, olishYiqilsin: true });
  await ombor.navbatQosh(S.amalYasa('qosh', 'yozuvlar', 'y1', { summa: '100.00' }));
  await ombor.navbatQosh(S.amalYasa('qosh', 'yozuvlar', 'y2', { summa: '200.00' }));

  const n = await S.sinxronla(ombor, server);
  tekshir('yozuvlar navbatda qoldi', n.navbatda === 2, `${n.navbatda} ta`);
  tekshir('holat: oflayn', n.holat === 'oflayn', n.holat);
  tekshir('hech narsa yo‘qolmadi', server.jadvallar.yozuvlar.length === 0);

  const navbat = await ombor.navbat();
  tekshir('birinchi amalda urinish belgilandi', navbat[0].urinish === 1, String(navbat[0].urinish));
  tekshir(
    'IKKINCHI amal urinilmadi (tartib saqlandi)',
    navbat[1].urinish === 0,
    `urinish ${navbat[1].urinish}`,
  );
}

// =============================================================
// 3. Internet qaytdi — navbat ketma-ket ketadi
// =============================================================
console.log('\n3. Internet qaytdi');

{
  const ombor = X.xotiraOmbori();
  const uzilgan = soxtaServer({ yuborishYiqilsin: true });
  await ombor.navbatQosh(S.amalYasa('qosh', 'hisoblar', 'h1', { nom: 'Naqd' }));
  await ombor.navbatQosh(S.amalYasa('qosh', 'yozuvlar', 'y1', { hisob_id: 'h1', summa: '50.00' }));
  await S.sinxronla(ombor, uzilgan);

  // O'sha server, endi tarmoq bor
  const server = soxtaServer();
  server.jadvallar.hisoblar = uzilgan.jadvallar.hisoblar;
  const n = await S.sinxronla(ombor, server, { hozir: Date.now() + 3_600_000 });
  tekshir('ikkala amal ham yuborildi', n.yuborildi === 2, `${n.yuborildi} ta`);
  tekshir(
    'hisob yozuvdan OLDIN ketdi',
    server.tarix[0].yozuv_id === 'h1' && server.tarix[1].yozuv_id === 'y1',
    server.tarix.map((t) => t.yozuv_id).join(' → '),
  );
}

// =============================================================
// 4. Takror yuborish — dubl bo'lmaydi
// =============================================================
console.log('\n4. Takror yuborish');

{
  const ombor = X.xotiraOmbori();
  const server = soxtaServer();
  const amal = S.amalYasa('qosh', 'yozuvlar', 'y-takror', { summa: '300.00' });
  await ombor.navbatQosh(amal);
  await S.sinxronla(ombor, server);
  // Xuddi o'sha amal yana navbatga tushdi (javob yo'qolgan holat)
  await ombor.navbatQosh({ ...amal, id: 'boshqa-amal-id' });
  await S.sinxronla(ombor, server);

  tekshir('serverda bitta yozuv', server.jadvallar.yozuvlar.length === 1, `${server.jadvallar.yozuvlar.length} ta`);
  const mahalliy = await ombor.royxat('yozuvlar');
  tekshir('mahalliyda ham bitta', mahalliy.length === 1, `${mahalliy.length} ta`);
}

// =============================================================
// 5. Ziddiyat — jimgina bosib o'tilmaydi
// =============================================================
console.log('\n5. Ziddiyat');

{
  const ombor = X.xotiraOmbori();
  const server = soxtaServer();
  server.serverdaYoz('yozuvlar', { id: 'y1', summa: '100.00' });
  await S.sinxronla(ombor, server); // mahalliyga olib kelamiz

  // Boshqa qurilma o'zgartirdi — versiya 2 bo'ldi
  server.serverdaYoz('yozuvlar', { id: 'y1', summa: '999.00' });

  // Biz esa eski versiya (1) bilan tahrir yubormoqchimiz
  await ombor.navbatQosh(S.amalYasa('tahrir', 'yozuvlar', 'y1', { summa: '150.00' }, 1));
  const n = await S.sinxronla(ombor, server);

  tekshir('ziddiyat qayd etildi', n.ziddiyat === 1, `${n.ziddiyat} ta`);
  tekshir('holat: ziddiyat', n.holat === 'ziddiyat', n.holat);
  tekshir('navbat tiqilib qolmadi', n.navbatda === 0, `${n.navbatda} ta`);

  const z = await ombor.ziddiyatlar();
  tekshir('ziddiyat sababi tushunarli', /boshqa qurilmada/.test(z[0].sabab), z[0].sabab.slice(0, 40));

  const server1 = server.jadvallar.yozuvlar.find((x) => x.id === 'y1');
  tekshir('serverdagi qiymat o‘zgarmadi', server1.summa === '999.00', String(server1.summa));
}

// =============================================================
// 6. Kursor: qator tushib qolmaydi
// =============================================================
console.log('\n6. Kursor va chegara');

{
  const ombor = X.xotiraOmbori();
  // Chegara 2 ta: har paketda 2 tadan keladi
  const server = soxtaServer({ chegara: 2 });
  for (let i = 1; i <= 7; i++) server.serverdaYoz('yozuvlar', { id: 'y' + i, summa: `${i}.00` });
  for (let i = 1; i <= 3; i++) server.serverdaYoz('hisoblar', { id: 'h' + i, nom: 'Hisob ' + i });

  const n = await S.sinxronla(ombor, server);
  const yozuvlar = await ombor.royxat('yozuvlar');
  const hisoblar = await ombor.royxat('hisoblar');
  tekshir('hamma yozuv keldi (7 ta)', yozuvlar.length === 7, `${yozuvlar.length} ta`);
  tekshir('hamma hisob keldi (3 ta)', hisoblar.length === 3, `${hisoblar.length} ta`);
  tekshir('takroriy paketlar dubl bermadi', n.olindi >= 10, `${n.olindi} qator o‘qildi`);

  // Yangi qator qo'shilsa — faqat u keladi
  server.serverdaYoz('yozuvlar', { id: 'y8', summa: '8.00' });
  const n2 = await S.sinxronla(ombor, server);
  tekshir('keyingi sinx faqat yangisini oldi', n2.olindi === 1, `${n2.olindi} ta`);
  tekshir('jami 8 ta yozuv', (await ombor.royxat('yozuvlar')).length === 8);
}

// =============================================================
// 7. Olish o'rtasida uzilish
// =============================================================
console.log('\n7. Olish o‘rtasida uzilish');

{
  const ombor = X.xotiraOmbori();
  const server = soxtaServer({ chegara: 2 });
  for (let i = 1; i <= 6; i++) server.serverdaYoz('yozuvlar', { id: 'y' + i, summa: `${i}.00` });

  // Birinchi paketdan keyin tarmoq uziladi
  let chaqirilgan = 0;
  const asl = server.ozgarishlar.bind(server);
  server.ozgarishlar = async (k) => {
    if (++chaqirilgan > 1) throw new Error('tarmoq uzildi');
    return asl(k);
  };

  const n1 = await S.sinxronla(ombor, server);
  const yarim = (await ombor.royxat('yozuvlar')).length;
  tekshir('yarim yo‘lda uzildi', n1.xato !== null && yarim > 0 && yarim < 6, `${yarim} ta olindi`);

  // Tarmoq qaytdi
  server.ozgarishlar = asl;
  await S.sinxronla(ombor, server);
  tekshir('qolganlari keyingi safar keldi', (await ombor.royxat('yozuvlar')).length === 6);
}

// =============================================================
// 8. Kechikish
// =============================================================
console.log('\n8. Qayta urinish kechikishi');

tekshir('birinchi urinish — 1 soniya', S.kechikish(0) === 1000, String(S.kechikish(0)));
tekshir('beshinchi urinish — 10 daqiqa', S.kechikish(4) === 600000, String(S.kechikish(4)));
tekshir('undan keyin ham 10 daqiqa (cheksiz o‘smaydi)', S.kechikish(99) === 600000);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
