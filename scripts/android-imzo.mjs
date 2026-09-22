// =============================================================
//  RELEASE APK NI HAQIQIY KALIT BILAN IMZOLASH
//
//  `expo prebuild` yaratgan `app/build.gradle` da release bloki
//  DEBUG kaliti bilan imzolaydi:
//
//      release {
//        // Caution! In production, you need to generate your own...
//        signingConfig signingConfigs.debug
//      }
//
//  Bu shunchaki noto'g'ri emas — u jimgina zarar keltiradi:
//  debug kaliti bilan imzolangan APK mavjud APK ning USTIGA
//  O'RNATILMAYDI. Android imzoni solishtiradi va rad etadi,
//  odam esa "nega o'rnatilmayapti" deb o'ylab qoladi.
//
//  PREBUILD BU FAYLNI QAYTA YOZADI. Shuning uchun tuzatish qo'lda
//  emas, shu skript bilan qilinadi va har qurishdan oldin
//  chaqiriladi.
//
//  PAROL BU YERDA YO'Q. U `GRADLE_USER_HOME/gradle.properties`
//  ga yoziladi — repodan tashqarida. Skript uni
//  `apps/kassa/credentials.json` dan (gitignore'dagi `kodchi/`
//  kalitiga ishora qiladi) bir marta ko'chiradi.
//
//  Ishga tushirish:  node scripts/android-imzo.mjs
// =============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ILDIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const KASSA = join(ILDIZ, 'apps/kassa');
const GRADLE = join(KASSA, 'android/app/build.gradle');

function ayt(m) {
  console.log('  ' + m);
}

if (!existsSync(GRADLE)) {
  console.error('  android/ yo‘q — avval: npx expo prebuild --platform android');
  process.exit(1);
}

// ---------- 1. Parollarni Gradle uyiga ----------
const gradleUyi = process.env.GRADLE_USER_HOME;
if (!gradleUyi) {
  console.error('  GRADLE_USER_HOME qo‘yilmagan. Reja: PLAN-MAHALLIY-QURISH.md, Faza 0');
  process.exit(1);
}

const kalitlar = JSON.parse(readFileSync(join(KASSA, 'credentials.json'), 'utf8'));
const k = kalitlar.android?.keystore ?? {};
for (const maydon of ['keystorePath', 'keystorePassword', 'keyAlias', 'keyPassword']) {
  if (!k[maydon]) {
    console.error(`  credentials.json da ${maydon} yo‘q`);
    process.exit(1);
  }
}

// Gradle `\` ni qochirish belgisi deb o'qiydi — Windows yo'li
// `/` bilan yoziladi, aks holda yo'l buziladi.
const kalitYoli = resolve(KASSA, k.keystorePath).split('\\').join('/');
if (!existsSync(kalitYoli)) {
  console.error('  kalit fayli topilmadi: ' + kalitYoli);
  process.exit(1);
}

mkdirSync(gradleUyi, { recursive: true });
const xos = join(gradleUyi, 'gradle.properties');
const eski = existsSync(xos) ? readFileSync(xos, 'utf8') : '';
const bizniki = [
  '# Clary release imzosi — bu fayl REPODAN TASHQARIDA turadi.',
  'CLARY_STORE_FILE=' + kalitYoli,
  'CLARY_STORE_PASSWORD=' + k.keystorePassword,
  'CLARY_KEY_ALIAS=' + k.keyAlias,
  'CLARY_KEY_PASSWORD=' + k.keyPassword,
].join('\n');

const tozalangan = eski
  .split('\n')
  .filter((q) => !q.startsWith('CLARY_') && !q.startsWith('# Clary release imzosi'))
  .join('\n')
  .trimEnd();
writeFileSync(xos, (tozalangan ? tozalangan + '\n\n' : '') + bizniki + '\n');
ayt('parollar: ' + xos + '  (alias ' + k.keyAlias + ')');

// ---------- 2. Arxitekturalar ----------
//
// Standart: armeabi-v7a, arm64-v8a, x86, x86_64. Oxirgi ikkitasi
// FAQAT emulyator uchun — haqiqiy telefonda ishlatilmaydi, lekin
// har qurishda vaqt yeydi va APK ni kattalashtiradi.
//
// arm64-v8a — hozirgi telefonlar, armeabi-v7a — eski arzonlari.
// Ikkalasi qoldiriladi: ilova bozor savdogarlariga tarqaladi va
// ularda eski telefon ham bo‘lishi mumkin.
{
  const gp = join(KASSA, 'android/gradle.properties');
  const t = readFileSync(gp, 'utf8');
  const eski = 'reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64';
  const yangi = 'reactNativeArchitectures=arm64-v8a,armeabi-v7a';
  if (t.includes(eski)) {
    writeFileSync(gp, t.replace(eski, yangi));
    ayt('arxitekturalar: arm64-v8a, armeabi-v7a (emulyatorniki olindi)');
  } else {
    ayt('arxitekturalar: allaqachon sozlangan');
  }
}

// ---------- 2. build.gradle ni tuzatish ----------
let g = readFileSync(GRADLE, 'utf8').split('\r\n').join('\n');

if (g.includes('clarySigning')) {
  ayt('build.gradle allaqachon tuzatilgan');
} else {
  const ESKI_BLOK = "            keyPassword 'android'\n        }\n    }";
  if (!g.includes(ESKI_BLOK)) throw new Error('signingConfigs bloki topilmadi');

  // `hasProperty` sharti bilan: parol yo'q kompyuterda qurish
  // to'xtamasin, faqat debug kaliti bilan ketsin.
  g = g.replace(
    ESKI_BLOK,
    [
      "            keyPassword 'android'",
      '        }',
      '        clarySigning {',
      "            if (project.hasProperty('CLARY_STORE_FILE')) {",
      '                storeFile file(CLARY_STORE_FILE)',
      '                storePassword CLARY_STORE_PASSWORD',
      '                keyAlias CLARY_KEY_ALIAS',
      '                keyPassword CLARY_KEY_PASSWORD',
      '            }',
      '        }',
      '    }',
    ].join('\n'),
  );

  const ESKI_RELEASE = [
    '        release {',
    '            // Caution! In production, you need to generate your own keystore file.',
    '            // see https://reactnative.dev/docs/signed-apk-android.',
    '            signingConfig signingConfigs.debug',
  ].join('\n');
  if (!g.includes(ESKI_RELEASE)) throw new Error('release bloki topilmadi');

  g = g.replace(
    ESKI_RELEASE,
    [
      '        release {',
      '            // Haqiqiy kalit bo‘lsa o‘sha, bo‘lmasa debug.',
      '            // Debug kaliti bilan imzolangan APK mavjudining',
      '            // ustiga O‘RNATILMAYDI — shuning uchun bu muhim.',
      "            signingConfig project.hasProperty('CLARY_STORE_FILE')",
      '                ? signingConfigs.clarySigning',
      '                : signingConfigs.debug',
    ].join('\n'),
  );

  writeFileSync(GRADLE, g);
  ayt('build.gradle: release endi clarySigning bilan imzolanadi');
}
