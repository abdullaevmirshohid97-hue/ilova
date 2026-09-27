// =============================================================
//  CLARY — KLAVIATURA EKRANNI BOSMASLIGI
//
//  NEGA BU SINOV BOR — 2026-09-27 dagi kritik xato.
//
//  Foydalanuvchi: «APK da login-parol tergandan keyin KIRISH
//  tugmasi yo'q». Webda bor. Ya'ni ilovaga umuman kirib
//  bo'lmagan — Play Market'ga chiqqan bo'lsa har bir yangi
//  mijoz yo'qolardi.
//
//  Tugma o'z joyida edi. Sabab: `app.json` da
//  `edgeToEdgeEnabled: true` (Expo SDK 54; Android 15 buni
//  talab qiladi). Edge-to-edge da klaviatura chiqqanda Android
//  oynani QAYTA O'LCHAMAYDI — manifestdagi `adjustResize` ish
//  ko'rmaydi. Klaviatura ekran USTIGA tushadi va pastdagi hamma
//  narsani bosib qoladi.
//
//  `KeyboardAvoidingView` ni
//  `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
//  bilan ishlatish AYNAN shu sababdan xato: Android'da
//  `undefined` «tizim o'zi hal qiladi» degani, edge-to-edge da
//  esa u hech narsa qilmaydi. Shakl to'g'ri ko'rinadi va shuning
//  uchun ko'z bilan tekshirganda o'tib ketadi.
//
//  BU SINOVNI KO'Z BILAN TEKSHIRIB BO'LMAYDI: xato faqat
//  haqiqiy telefonda, klaviatura chiqqanda ko'rinadi. Shuning
//  uchun qoida FAYLDAN tekshiriladi.
//
//  Ishga tushirish:  node tests/kassa-klaviatura.mjs
// =============================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KASSA = join(ROOT, 'apps/kassa');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

/** Izohlarni olib tashlaydi: izohda yozilgan misol sinovni yiqitmasin. */
function izohsiz(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function oq(...yol) {
  return readFileSync(join(KASSA, ...yol), 'utf8');
}

function fayllar(papka) {
  return readdirSync(join(KASSA, papka))
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => ({ nom: f, yol: papka + '/' + f, matn: oq(papka, f) }));
}

console.log('\n\x1b[1mCLARY — KLAVIATURA\x1b[0m\n');

// -------------------------------------------------------------
console.log('\x1b[1m1. Edge-to-edge rostdan yoqilganmi\x1b[0m');
//
// Agar kimdir uni o'chirib qo'ysa, quyidagi qoidalar shart
// bo'lmay qoladi — lekin ular zarar ham qilmaydi. Shuning uchun
// bu tekshiruv EMAS, ma'lumot: sabab yo'qolganda odam
// nima uchun bu fayl borligini tushunsin.
const app = JSON.parse(oq('app.json'));
const e2e = app.expo?.android?.edgeToEdgeEnabled === true;
tekshir(
  'app.json da edgeToEdgeEnabled',
  true,
  e2e ? 'yoqilgan — quyidagi qoidalar SHART' : 'o‘chirilgan — qoidalar zarar qilmaydi',
);

// -------------------------------------------------------------
console.log('\n\x1b[1m2. Android‘da behavior undefined qolmagan\x1b[0m');
//
// Bu aynan o'sha xato shakli. Topilsa — qaytib kelgan.
const hammasi = [...fayllar('src/ekran'), ...fayllar('src/ui'), { nom: 'App.tsx', yol: 'App.tsx', matn: oq('App.tsx') }];
const aybdorlar = hammasi.filter((f) => {
  const t = izohsiz(f.matn);
  return /behavior=\{[^}]*:\s*undefined\s*\}/.test(t);
});
tekshir(
  'hech qayerda «behavior: undefined» yo‘q',
  aybdorlar.length === 0,
  aybdorlar.length === 0 ? 'toza' : aybdorlar.map((f) => f.nom).join(', '),
);

// -------------------------------------------------------------
console.log('\n\x1b[1m3. Modal oynalar klaviaturani hisoblaydi\x1b[0m');
//
// Android'da `Modal` — ALOHIDA oyna. Ya'ni App ildizidagi
// bo'shliq unga TUSHMAYDI va har oyna o'zi hal qilishi kerak.
//
// Tizim klaviaturasi chiqadigan oyna = ichida `<TextInput` bor.
// Ilovaning o'z raqamli klaviaturasi (`Kalkulator`) hisobga
// olinmaydi: u oddiy `TouchableOpacity` lardan yasalgan.
const modallar = hammasi.filter((f) => {
  const t = izohsiz(f.matn);
  return /<Modal/.test(t) && /<TextInput/.test(t);
});
tekshir('tizim klaviaturali modal oynalar topildi', modallar.length >= 8, modallar.length + ' ta');

for (const f of modallar) {
  const t = izohsiz(f.matn);
  const oralgan = /<Klaviaturali/.test(t);
  const qolda = /useKlaviaturaBalandligi/.test(t);
  if (!oralgan && !qolda) {
    tekshir('  ' + f.nom, false, 'klaviatura hisobga olinmagan');
    continue;
  }
  // IMPORT ham tekshiriladi. Birinchi yozilishida bu tushib
  // qolgan edi: sinov yashil chiqdi, `tsc` esa «Cannot find name
  // Klaviaturali» berdi. Ya'ni sinov ishlatilmayotgan narsani
  // «bor» deb hisoblagan.
  const kerakli = oralgan ? 'Klaviaturali' : 'useKlaviaturaBalandligi';
  const impBor = new RegExp("import \\{[^}]*\\b" + kerakli + "\\b[^}]*\\} from").test(t);
  tekshir('  ' + f.nom, impBor, impBor ? kerakli : kerakli + ' import qilinmagan');
}

// -------------------------------------------------------------
console.log('\n\x1b[1m4. App ildizi ham o‘ralgan\x1b[0m');
//
// Ichki ekranlar (Yana*, Ai*, valyuta, turkumlar) o'z idishiga
// ega emas — ular App ildizi ostida turadi. Shuning uchun
// bo'shliq bir joyda, ildizda qo'yiladi.
{
  const t = izohsiz(oq('App.tsx'));
  tekshir('App.tsx ildizi Klaviaturali', /<Klaviaturali/.test(t) && /<\/Klaviaturali>/.test(t));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m5. Kirish ekranida UCH himoya\x1b[0m');
//
// Bu ekran yopilsa odam ilovaga UMUMAN kira olmaydi — bitta
// himoya kamlik qiladi. Uchtasi bir-birini ushlab turadi.
{
  const t = izohsiz(oq('src/ekran/KirishEkrani.tsx'));
  tekshir('1) pastdan klaviatura balandligicha bo‘shliq', /paddingBottom: O\.chekka \+ klaviatura/.test(t));
  tekshir('2) klaviatura chiqqanda tugmaga aylantiradi', /scrollToEnd/.test(t));
  tekshir('3) parol maydonida Enter ham yuboradi', /onSubmitEditing=\{\(\) => void yubor\(\)\}/.test(t));
  tekshir('email maydoni parolga o‘tkazadi', /parolMaydoni\.current\?\.focus\(\)/.test(t));
  // Eski, ishlamaydigan yechim qaytib kelmasin.
  tekshir('KeyboardAvoidingView olib tashlangan', !/KeyboardAvoidingView/.test(t));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m6. Biznes ochish ekrani\x1b[0m');
//
// Ro'yxatdan o'tishning IKKINCHI qadami va maydonda `autoFocus`
// bor: klaviatura ekran ochilishi bilan chiqadi va «Boshlash»
// tugmasini darhol bosib qoladi. Odam ro'yxatdan o'tib shu
// yerda qotib qolardi.
{
  // NOMLAR ATAYLAB TAKRORLANMAYDI. Avval bu yerda «Enter ham
  // yuboradi» deb yozilgan edi va u 5-bo'limdagi «3) parol
  // maydonida Enter ham yuboradi» ning ichida bor. Mutatsiya
  // tekshirgichi noto'g'ri qatorni topib, buzilgan kodni
  // «tutildi» deb ko'rsatgan.
  const t = izohsiz(oq('src/ekran/BiznesEkrani.tsx'));
  tekshir('biznes: bo‘shliq qo‘yilgan', /paddingBottom: O\.chekka \+ klaviatura/.test(t));
  tekshir('biznes: tugmaga aylantiradi', /scrollToEnd/.test(t));
  tekshir('biznes: Enter yuboradi', /onSubmitEditing=\{\(\) => void och\(\)\}/.test(t));
  tekshir('biznes: KeyboardAvoidingView olib tashlangan', !/KeyboardAvoidingView/.test(t));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m7. Hodisalar to‘g‘ri tanlangan\x1b[0m');
//
// iOS da `Will` hodisalari animatsiya BOSHIDA keladi — ekran
// klaviatura bilan birga siljiydi. Android'da `Will` YO'Q,
// faqat `Did` bor: `keyboardWillShow` ga yozilsa Android'da
// hech qachon ishlamaydi va xato jimgina qaytadi.
{
  const t = oq('src/lib/klaviatura.ts');
  tekshir('iOS uchun keyboardWillShow', /keyboardWillShow/.test(t));
  tekshir('Android uchun keyboardDidShow', /keyboardDidShow/.test(t));
  tekshir('ikkisi platformaga qarab tanlanadi', /ios \?\s*'keyboardWillShow'\s*:\s*'keyboardDidShow'/.test(t));
  tekshir('yopilganda 0 ga qaytadi', /setBalandlik\(0\)/.test(t));
  tekshir('tinglagichlar tozalanadi', /ochildi\.remove\(\)/.test(t) && /yopildi\.remove\(\)/.test(t));
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
