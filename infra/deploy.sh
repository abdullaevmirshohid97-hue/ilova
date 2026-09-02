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

# Git parol so'rab qotib qolmasin.
#
# Bir marta shunday bo'ldi: remote manzili noto'g'ri bo'lgani uchun
# GitHub 401 qaytardi, git esa "Username for..." deb so'radi va
# terminalga keyingi yozilgan BUYRUQ username bo'lib ketdi. Repozitoriy
# ochiq bo'lgani uchun bu yerda hech qanday parol kerak emas - so'rov
# chiqishining o'zi xato belgisi.
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/true

if ! git pull --ff-only; then
  echo ""
  echo "!! git pull ishlamadi. Tekshiring:"
  echo "   git -C $REPO_DIR remote -v"
  echo ""
  echo "   To'g'ri manzil (ochiq repozitoriy, parol kerak emas):"
  echo "   https://github.com/abdullaevmirshohid97-hue/ilova.git"
  echo ""
  echo "   Tuzatish:"
  echo "   git -C $REPO_DIR remote set-url origin https://github.com/abdullaevmirshohid97-hue/ilova.git"
  echo ""
  echo "   Mahalliy o'zgarish xalaqit berayotgan bo'lsa:"
  echo "   git -C $REPO_DIR status"
  exit 1
fi

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
# Papkaning O'ZINI rm -rf QILMAYMIZ — yukchibolla.apk shu yerda qo'lda
# qo'yilgan bo'lishi mumkin. Lekin _expo/ ni tozalaymiz: bundle nomida hash
# bor, ya'ni har build yangi fayl yaratadi va eskisi abadiy qolib ketardi.
# (index.html doim eng yangisini ko'rsatgani uchun ilova to'g'ri ishlardi,
# ammo eski fayllar joy egallab, tekshiruvni ham chalg'itardi.)
rm -rf "${LANDING_WWW:?}/_expo"
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
