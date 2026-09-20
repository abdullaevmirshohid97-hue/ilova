// =============================================================
//  Dizayn tizimini BRAUZER uchun yig'ish
//
//  Komponentlar React Native uchun yozilgan. Brauzerda ular
//  `react-native-web` orqali ishlaydi — kassa ilovasining o'zi
//  ham aynan shu yo'l bilan `app.yukchibolla.com/kassa` ga
//  chiqadi, ya'ni bu sinovdan o'tgan yo'l.
//
//  `react` va `react-dom` TASHQARIDA qoldiriladi: claude.ai
//  dizayn muhiti ularni o'zi beradi. Ikki nusxa React bo'lsa
//  hooklar «invalid hook call» bilan yiqilardi.
//
//  Ishga tushirish:  node qur.mjs
// =============================================================

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { statSync } from 'node:fs';

const KATALOG = dirname(fileURLToPath(import.meta.url));

const natija = await build({
  entryPoints: [join(KATALOG, 'index.tsx')],
  outfile: join(KATALOG, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',

  // React Native -> web. Bitta qator, lekin butun ish shunga
  // bog'liq: usiz `View`, `Text`, `TouchableOpacity` brauzerda
  // umuman yo'q.
  alias: { 'react-native': 'react-native-web' },

  // RN paketlari brauzer qurilmasini `browser` sharti ostida
  // beradi.
  conditions: ['browser', 'import', 'module', 'default'],
  mainFields: ['browser', 'module', 'main'],

  // RN paketlari brauzer nusxasini .web.js kengaytmasi bilan
  // beradi va u oddiy .js DAN OLDIN turishi kerak. Usiz
  // safe-area-context ning NATIVE spec fayli olinib,
  // codegenNativeComponent topilmay yiqilardi.
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json'],

  external: ['react', 'react-dom', 'react/jsx-runtime'],
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },

  // Kartochkalarda o'qilishi uchun siqilmaydi — hajm bu yerda
  // muhim emas, xato izlash muhim.
  minify: false,
  sourcemap: false,
  metafile: true,
  logLevel: 'info',
});

const kb = (statSync(join(KATALOG, 'dist/index.js')).size / 1024).toFixed(0);
const kirganlar = Object.keys(natija.metafile.outputs[Object.keys(natija.metafile.outputs)[0]].inputs ?? {}).length;
console.log(`\n  dist/index.js — ${kb} KB, ${kirganlar} ta modul`);
