// =============================================================
//  IDAA — IKONKA TO'PLAMINI TAYYORLASH
//
//  Manba: foydalanuvchi bergan tayyor rasm (yashil kvadrat ichida
//  qo'l berish, quti, hujjat va ikki o'q).
//
//  Manbadagi uch narsa ikonkaga to'g'ridan-to'g'ri yaramaydi:
//
//   1. OQ CHEKKA VA SOYA. Rasm atrofida oq maydon bor. Ikonka
//      qilib qo'yilsa, Android o'z niqobini qo'yganda «kvadrat
//      ichida kvadrat» chiqadi va burchaklarda oq ko'rinadi.
//   2. O'Z BURCHAKLARI YUMALOQ. Tizim baribir o'zi yumaloqlaydi,
//      shuning uchun rasm to'la kvadrat bo'lishi kerak.
//   3. ADAPTIV IKONKA CHEGARASI. Androidda rasm 108 dp, ko'rinadigan
//      qismi 72 dp — har chetdan ~17% kesiladi. To'liq rasm qo'yilsa
//      o'qlar qirqilib, faqat qo'l berish qoladi (sinab ko'rildi).
//
//  Shuning uchun:
//   · yashil kvadrat kesib olinadi va burchaklar chiqib ketguncha
//     ichkariga suriladi — natija to'la kvadrat, oqsiz;
//   · adaptiv ikonkada rasm 66% ga kichraytirilib, ORQA FONI
//     o'sha rasmning o'zidan yasalgan xira yoyilma ustiga qo'yiladi
//     — tekis rang qo'yilsa chegara chizig'i bilinib turardi.
//
//  Ishga tushirish:  node scripts/clary-ikonka-yasa.mjs <manba.png>
// =============================================================

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'apps/kassa/assets');
const PLAY = join(ASSETS, 'play');
mkdirSync(PLAY, { recursive: true });

const MANBA = process.argv[2];
if (!MANBA) {
  console.error('Manba rasm ko‘rsatilmadi.\n  node scripts/clary-ikonka-yasa.mjs <rasm.png>');
  process.exit(1);
}

// =============================================================
//  1. Yashil kvadrat chegarasini TOPISH
//
//  Qo'lda yozib qo'yilmaydi: manba rasm almashtirilsa, o'lchamlar
//  ham o'zgaradi va qo'lda yozilgan raqam jimgina noto'g'ri kesadi.
// =============================================================
const { data, info } = await sharp(MANBA).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const px = (x, y) => {
  const i = (y * W + x) * C;
  return [data[i], data[i + 1], data[i + 2]];
};

// Fon — oq yoki kulrang soya: uch kanal bir-biriga yaqin va yorug'
const fonmi = ([r, g, b]) => {
  const eng = Math.max(r, g, b);
  const kam = Math.min(r, g, b);
  return eng - kam < 26 && eng > 150;
};

const ortaY = Math.round(H / 2);
const ortaX = Math.round(W / 2);
let chap = 0;
while (chap < W && fonmi(px(chap, ortaY))) chap++;
let ong = W - 1;
while (ong > 0 && fonmi(px(ong, ortaY))) ong--;
let yuqori = 0;
while (yuqori < H && fonmi(px(ortaX, yuqori))) yuqori++;
let past = H - 1;
while (past > 0 && fonmi(px(ortaX, past))) past--;

const en = ong - chap + 1;
const boy = past - yuqori + 1;

// Burchak radiusi: chap chekka yuqoridan qancha pastda boshlanadi
let radius = 0;
for (let d = 0; d < Math.round(boy / 2); d++) {
  if (!fonmi(px(chap + 4, yuqori + d))) {
    radius = d;
    break;
  }
}
// Burchakdagi oq uchburchak diagonal bo'ylab r*(1-1/sqrt2) ichkariga
// kiradi. Shuncha + zaxira kesilsa, oq butunlay chiqib ketadi.
const SURISH = Math.ceil(radius * (1 - 1 / Math.SQRT2)) + 12;

console.log(`Manba: ${W}×${H}`);
console.log(`Yashil kvadrat: ${en}×${boy} (${chap},${yuqori}) — burchak radiusi ~${radius}px`);
console.log(`Ichkariga surish: ${SURISH}px`);

const TOMON = Math.min(en, boy) - SURISH * 2;
const toliq1024 = await sharp(MANBA)
  .extract({ left: chap + SURISH, top: yuqori + SURISH, width: TOMON, height: TOMON })
  .resize(1024, 1024, { fit: 'fill' })
  .png()
  .toBuffer();

// Oq qolmaganini TEKSHIRAMIZ — kesish noto'g'ri bo'lsa shu yerda bilinadi
{
  const t = await sharp(toliq1024).raw().toBuffer({ resolveWithObject: true });
  const p = (x, y) => {
    const i = (y * t.info.width + x) * t.info.channels;
    return [t.data[i], t.data[i + 1], t.data[i + 2]];
  };
  const burchaklar = [p(4, 4), p(1019, 4), p(4, 1019), p(1019, 1019)];
  const oq = burchaklar.filter(([r, g, b]) => r > 200 && g > 200 && b > 200);
  if (oq.length) {
    console.error('XATO: burchaklarda oq qoldi — surish yetarli emas');
    process.exit(1);
  }
  console.log('Burchaklar toza (oq yo‘q)');
}

// =============================================================
//  2. Adaptiv ikonka: rasm 66% da, orqasida o'ziniki xira yoyilma
// =============================================================
const ICHKI = Math.round(1024 * 0.66);
const CHET = Math.round((1024 - ICHKI) / 2);

// Chekka rangi: rasmning TO'Q YASHIL foni. Xira yoyilma sinab
// ko'rildi va yaramadi — qizil o'qning rangi chekkalarga yoyilib,
// dog' bo'lib chiqdi. Tekis rang toza ko'rinadi.
//
// Rang qo'lda yozilmaydi: manbadagi to'q yashil piksellarning
// medianasi olinadi (o'rtacha emas — yorqin o'q va oq hujjat
// o'rtachani tortib yuboradi).
const yashillar = { r: [], g: [], b: [] };
for (let y = yuqori; y <= past; y += 3) {
  for (let x = chap; x <= ong; x += 3) {
    const [r, g, b] = px(x, y);
    if (g > r + 20 && g > b + 10 && g < 130) {
      yashillar.r.push(r);
      yashillar.g.push(g);
      yashillar.b.push(b);
    }
  }
}
const mediana = (a) => {
  a.sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};
const fonRang = { r: mediana(yashillar.r), g: mediana(yashillar.g), b: mediana(yashillar.b), alpha: 1 };
console.log(`Chekka yashili: rgb(${fonRang.r}, ${fonRang.g}, ${fonRang.b})`);

const kichik = await sharp(toliq1024).resize(ICHKI, ICHKI).png().toBuffer();
const adaptiv = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: fonRang },
})
  .composite([{ input: kichik, left: CHET, top: CHET }])
  .png()
  .toBuffer();

// =============================================================
//  3. Fayllar
// =============================================================
const yasalgan = [];
async function yoz(nom, bufer, o, imkon = {}) {
  const yol = join(nom.startsWith('play/') ? PLAY : ASSETS, nom.replace('play/', ''));
  await sharp(bufer)
    .resize(o.en, o.boy, imkon.fit ? { fit: imkon.fit, background: imkon.fon } : undefined)
    .png()
    .toFile(yol);
  yasalgan.push([nom, `${o.en}×${o.boy}`]);
}

await yoz('icon.png', toliq1024, { en: 1024, boy: 1024 });
await yoz('adaptive-icon.png', adaptiv, { en: 1024, boy: 1024 });
await yoz('favicon.png', toliq1024, { en: 196, boy: 196 });
await yoz('play/play-icon-512.png', toliq1024, { en: 512, boy: 512 });

// Splash: markazda ikonka, atrofi to'q yashil (app.json dagi fon)
const splash = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: await sharp(toliq1024).resize(560, 560).png().toBuffer(), left: 232, top: 232 }])
  .png()
  .toBuffer();
await yoz('splash-icon.png', splash, { en: 1024, boy: 1024 });

// Play banneri 1024×500: chapda ikonka, o'ngi bo'sh (matn keyin qo'yiladi)
const banner = await sharp({
  create: { width: 1024, height: 500, channels: 4, background: fonRang },
})
  .composite([{ input: await sharp(toliq1024).resize(380, 380).png().toBuffer(), left: 62, top: 60 }])
  .png()
  .toBuffer();
await yoz('play/feature-graphic-1024x500.png', banner, { en: 1024, boy: 500 });

console.log('\nYasaldi:');
for (const [nom, o] of yasalgan) console.log(`  ${nom.padEnd(34)} ${o}`);

// Fon rangi: app.json uchun kerak (adaptiv ikonka orqasi, splash)
{
  const t = await sharp(toliq1024).resize(1, 1).raw().toBuffer();
  const rang = `#${[t[0], t[1], t[2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  console.log(`\napp.json uchun o‘rtacha rang: ${rang}`);
}
