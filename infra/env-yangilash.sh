#!/bin/bash
# =============================================================
# Yukchibolla — serverdagi .env'ni ESKI bazadan YANGI bazaga o'tkazish
# va ilovani noldan qayta joylash.
#
# NIMA UCHUN KERAK:
#   Eski Supabase loyihasi (hgyugftmkausfkekandq) pauza qilingan
#   (bepul tarifda uzoq ishlatilmagani uchun Supabase o'chirib qo'ygan).
#   Shu sababli "noto'g'ri parol" xatosi chiqardi — parol to'g'ri edi,
#   baza o'chib turgan edi. Yangi loyiha: gnuddryjsmcrjchrbvyz.
#
# BU SKRIPT NIMA QILADI (hammasini o'zi):
#   1. Eski .env fayllarni zaxiraga oladi va o'chiradi
#   2. Eski build'lar (dist) va Vite keshini tozalaydi
#   3. deploy.sh'ni chaqiradi (git pull + yangi .env + build + joylash)
#   4. Natijani TEKSHIRADI — bundle ichida yangi URL bormi, eski qolmadimi
#
# ISHLATISH (serverda, root sifatida):
#   cd /opt/ilova && git pull --ff-only && bash infra/env-yangilash.sh
#
# Qayta ishga tushirish xavfsiz (idempotent).
# =============================================================

set -euo pipefail

REPO_DIR=/opt/ilova
ADMIN_WWW=/var/www/ilova-admin
LANDING_WWW=/var/www/ilova-app-landing

YANGI_REF="gnuddryjsmcrjchrbvyz"
ESKI_REF="hgyugftmkausfkekandq"

STAMP=$(date +%Y%m%d-%H%M%S)

echo "============================================================"
echo " Yukchibolla — yangi bazaga o'tkazish  ($STAMP)"
echo "============================================================"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "XATO: $REPO_DIR topilmadi. Birinchi marta bo'lsa:"
  echo "  git clone https://github.com/abdullaevmirshohid97-hue/ilova.git $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

# ---------- 1. Eski .env — zaxira + o'chirish ----------
echo ""
echo "[1/4] Eski .env fayllar zaxiralanib o'chirilmoqda..."
ZAXIRA_DIR="$REPO_DIR/.env-zaxira"
mkdir -p "$ZAXIRA_DIR"

for f in apps/admin/.env apps/mobile/.env; do
  if [ -f "$f" ]; then
    nom=$(echo "$f" | tr '/' '-')
    cp "$f" "$ZAXIRA_DIR/${nom}.${STAMP}"
    echo "    zaxira: $ZAXIRA_DIR/${nom}.${STAMP}"
    if grep -q "$ESKI_REF" "$f" 2>/dev/null; then
      echo "    ^ bu faylda ESKI baza ($ESKI_REF) edi — almashtiriladi"
    fi
    rm -f "$f"
    echo "    o'chirildi: $f"
  else
    echo "    yo'q edi: $f"
  fi
done

# ---------- 2. Eski build va kesh ----------
echo ""
echo "[2/4] Eski build'lar va kesh tozalanmoqda..."
rm -rf apps/admin/dist apps/admin/node_modules/.vite
rm -rf apps/mobile/dist apps/mobile/.expo
echo "    tozalandi: apps/admin/dist, apps/mobile/dist, Vite/Expo kesh"

# ---------- 3. Deploy ----------
echo ""
echo "[3/4] deploy.sh ishga tushmoqda (git pull + .env + build + joylash)..."
echo "------------------------------------------------------------"
bash "$REPO_DIR/infra/deploy.sh"
echo "------------------------------------------------------------"

# ---------- 4. Tekshiruv ----------
echo ""
echo "[4/4] TEKSHIRUV"
xato=0

echo ""
echo "  .env fayllar:"
for f in apps/admin/.env apps/mobile/.env; do
  if [ -f "$f" ] && grep -q "$YANGI_REF" "$f"; then
    echo "    OK   $f -> yangi baza"
  else
    echo "    XATO $f -> yangi baza YOZILMAGAN"
    xato=1
  fi
done

echo ""
echo "  Joylashtirilgan admin bundle:"
if [ -d "$ADMIN_WWW/dist" ]; then
  if grep -rqs "$YANGI_REF" "$ADMIN_WWW/dist"; then
    echo "    OK   yangi baza URL bundle ichida bor"
  else
    echo "    XATO yangi baza URL bundle ichida YO'Q"
    xato=1
  fi
  if grep -rqs "$ESKI_REF" "$ADMIN_WWW/dist"; then
    echo "    XATO eski baza URL bundle ichida HALI BOR"
    xato=1
  else
    echo "    OK   eski baza URL butunlay yo'q"
  fi
else
  echo "    XATO $ADMIN_WWW/dist topilmadi"
  xato=1
fi

echo ""
echo "  Joylashtirilgan mijoz web-ilovasi:"
# -a (--text) SHART: Expo bundle'i katta va ichida ko'p belgilar bo'lgani
# uchun grep uni ba'zan "binary" deb hisoblab, jimgina o'tkazib yuboradi
if [ -d "$LANDING_WWW" ] && grep -raqs "$YANGI_REF" "$LANDING_WWW"; then
  echo "    OK   yangi baza URL bor"
  if grep -raqs "$ESKI_REF" "$LANDING_WWW"; then
    echo "    XATO eski baza URL hali bor"
    xato=1
  else
    echo "    OK   eski baza URL yo'q"
  fi
else
  echo "    XATO $LANDING_WWW da yangi URL topilmadi"
  xato=1
fi

echo ""
echo "  Yangi baza javob beryaptimi:"
# apikey SHART — usiz Supabase 401 qaytaradi va bu "pauzada" degani EMAS
ANON_KEY=$(sed -n 's/^VITE_SUPABASE_ANON_KEY=//p' apps/admin/.env)
kod=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
  -H "apikey: $ANON_KEY" \
  "https://${YANGI_REF}.supabase.co/auth/v1/settings" || echo "000")
if [ "$kod" = "200" ]; then
  echo "    OK   Supabase javob berdi (HTTP $kod)"
elif [ "$kod" = "000" ]; then
  echo "    XATO Supabase umuman javob bermadi — loyiha PAUZADA bo'lishi mumkin"
  xato=1
else
  echo "    XATO Supabase kutilmagan javob berdi (HTTP $kod)"
  xato=1
fi

echo ""
echo "  Caddy:"
if systemctl is-active --quiet caddy; then
  echo "    OK   caddy ishlab turibdi"
else
  echo "    DIQQAT caddy ishlamayapti: systemctl status caddy"
  xato=1
fi

echo ""
echo "============================================================"
if [ "$xato" -eq 0 ]; then
  echo " ✅ HAMMASI TAYYOR — yangi bazaga o'tildi"
  echo ""
  echo " admin.yukchibolla.com   ->  admin@ilova.local / IlovaAdmin#2026"
  echo " app.yukchibolla.com     ->  +998901112233 / Alisher2026!"
  echo ""
  echo " Brauzerda Ctrl+Shift+R bosing (eski kesh tozalanishi uchun)."
else
  echo " ⚠️  Yuqorida XATO belgilangan qatorlar bor — o'shalarni ko'ring."
  echo "    Eski .env zaxirasi: $ZAXIRA_DIR"
fi
echo "============================================================"
