import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ---------------------------------------------------------------------------
// BUILD TAMG'ASI
//
// "Serverdagi panel yangimi?" degan savolga javob berish har safar qiyin
// bo'lardi: fayl nomidagi hash mahalliy va serverdagi build'da har xil
// chiqadi (Windows CRLF, node versiyasi), kodning ichidan belgi qidirish
// esa ishonchsiz - bir marta supabase-js kutubxonasining o'z funksiyasini
// "mening kodim" deb yolg'on "OK" berdi.
//
// Shuning uchun build o'zi commit hashini yozib qo'yadi. infra/tekshir.sh
// shuni o'qiydi va HEAD bilan solishtiradi - taxmin qilinadigan joy qolmaydi.
// ---------------------------------------------------------------------------
function buildTamgasi(): Plugin {
  return {
    name: 'ilova-build-tamgasi',
    generateBundle() {
      let commit = 'nomalum';
      try {
        commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
      } catch {
        // git yo'q (masalan konteynerda) - tamg'a "nomalum" bo'lib qoladi,
        // build esa to'xtamaydi
      }
      this.emitFile({
        type: 'asset',
        fileName: 'versiya.json',
        source: JSON.stringify({ commit, sana: new Date().toISOString() }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), buildTamgasi()],
});
