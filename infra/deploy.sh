#!/bin/bash
# Yukchibolla — admin panel + mijoz web-ilovasini VPS'ga joylashtirish.
#
# MUHIM: bu VPS Clary bilan BIRGA ishlaydi (/opt/clary, pm2 clary-api) va
# Luxury Textile bilan ham (/opt/luxury, pm2 luxury). Bu skript FAQAT
# /opt/ilova, /var/www/ilova-admin, /var/www/ilova-app-landing papkalariga
# tegadi — boshqa loyihalarga sira tegmaydi. Caddyfile'ni bu skript
# O'ZGARTIRMAYDI (u umumiy fayl, Clary+Luxury ham shu yerda) — Caddy blokini
# infra/Caddyfile.snippet'dan qo'lda qo'shib, pastdagi "Caddy" bo'limidagi
# buyruqlar bilan tekshirib-qayta ishga tushiring.
#
# app.yukchibolla.com — mijoz mobil ilovasining (apps/mobile) AYNAN o'zi,
# Expo'ning web-eksporti orqali brauzerda ishlaydi (1/1 bir xil kod).
# yukchibolla.apk fayli bu skript tomonidan O'CHIRILMAYDI/YARATILMAYDI —
# EAS build orqali olingach, $LANDING_WWW/yukchibolla.apk ga bir marta qo'lda
# qo'yiladi (apps/mobile/EAS-QOLLANMA.md ga qarang).
#
# Ishlatish: ssh orqali serverga kirib -> bash /opt/ilova/infra/deploy.sh
# (birinchi marta: quyidagi git clone qatorini qo'lda bir marta bajaring)

set -euo pipefail

REPO_DIR=/opt/ilova
ADMIN_WWW=/var/www/ilova-admin
LANDING_WWW=/var/www/ilova-app-landing

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Birinchi marta: git clone https://github.com/abdullaevmirshohid97-hue/ilova.git $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"
git pull --ff-only

# apps/admin/.env va apps/mobile/.env — gitignore'da, serverda bir marta
# qo'lda yaratiladi. Bu yerdagi kalit PUBLISHABLE (anon) — client bundle'ga
# baribir ochiq chiqadi, shuning uchun faylda saqlash xavfsiz.
if [ ! -f apps/admin/.env ]; then
  cat > apps/admin/.env <<'ENVEOF'
VITE_SUPABASE_URL=https://hgyugftmkausfkekandq.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xUgjGdPDbukb5Pk57H4U6w_VO9vWTRO
ENVEOF
  echo "apps/admin/.env yaratildi (birinchi marta)."
fi

if [ ! -f apps/mobile/.env ]; then
  cat > apps/mobile/.env <<'ENVEOF'
EXPO_PUBLIC_SUPABASE_URL=https://hgyugftmkausfkekandq.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xUgjGdPDbukb5Pk57H4U6w_VO9vWTRO
ENVEOF
  echo "apps/mobile/.env yaratildi (birinchi marta)."
fi

corepack enable
pnpm install --filter "@ilova/admin..." --filter "@ilova/mobile..." --frozen-lockfile

pnpm --filter @ilova/admin build
mkdir -p "$ADMIN_WWW"
rm -rf "${ADMIN_WWW:?}/dist"
cp -r apps/admin/dist "$ADMIN_WWW/dist"

pnpm --filter @ilova/mobile build:web
mkdir -p "$LANDING_WWW"
# rm -rf QILINMAYDI — yukchibolla.apk shu papkada qo'lda qo'yilgan bo'lishi
# mumkin, uni o'chirib yubormaslik uchun faqat ustidan ko'chiramiz
cp -r apps/mobile/dist/. "$LANDING_WWW/"

echo ""
echo "✅ Statik fayllar joylashtirildi:"
echo "   $ADMIN_WWW/dist        (admin.yukchibolla.com, 4020.yukchibolla.com)"
echo "   $LANDING_WWW           (app.yukchibolla.com — mijoz web-ilovasi)"
if [ ! -f "$LANDING_WWW/yukchibolla.apk" ]; then
  echo ""
  echo "⚠️  $LANDING_WWW/yukchibolla.apk hali yo'q — 'APK yuklab olish' tugmasi"
  echo "   404 beradi. EAS build tugagach APK'ni shu yerga qo'ying."
fi
echo ""
echo "Caddy blok hali qo'shilmagan bo'lsa: infra/Caddyfile.snippet ga qarang."
echo "Caddyfile o'zgargandan keyin:"
echo "   caddy validate --config /etc/caddy/Caddyfile"
echo "   systemctl restart caddy   # (reload emas — admin API off holatda)"
