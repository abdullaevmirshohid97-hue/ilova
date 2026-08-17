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

# apps/admin/.env va apps/mobile/.env — gitignore'da, shuning uchun shu skript
# HAR SAFAR ustidan yozadi. Bu yerdagi kalit PUBLISHABLE (anon) — client
# bundle'ga baribir ochiq chiqadi, shuning uchun faylda saqlash xavfsiz.
#
# MUHIM: avval "faqat fayl yo'q bo'lsa yarat" mantiqi edi — natijada baza
# almashganda serverdagi eski .env o'zgarmay, deploy'dan keyin ham ilova
# ESKI bazaga qarab turardi. Endi har deploy'da qayta yoziladi, ya'ni
# haqiqat manbasi — shu fayl.
SUPABASE_URL=https://gnuddryjsmcrjchrbvyz.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_BjX_3t2LGX9y8FsKbCqFdw_7AOnXTN3

cat > apps/admin/.env <<ENVEOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_PUBLISHABLE_KEY
ENVEOF

cat > apps/mobile/.env <<ENVEOF
EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_PUBLISHABLE_KEY
ENVEOF

echo "apps/admin/.env va apps/mobile/.env yozildi -> $SUPABASE_URL"

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
