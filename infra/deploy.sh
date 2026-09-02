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

# ---------------------------------------------------------------------------
# KODNI OLISH
#
# Odatda `git pull`. Lekin bu serverda git GitHub'dan 401 oladi, holbuki
# CURL AYNAN SHU MANZILDAN 200 oladi va sertifikat ham haqiqiy (Sectigo,
# proksi yo'q). Ya'ni tarmoq soz, gap git tomonida - sozlama esa toza:
# `.git/config`, `/etc/gitconfig`, `~/.gitconfig`, `~/.netrc`, muhit
# o'zgaruvchilari - hammasi bo'sh.
#
# Sabab hali aniqlanmagan, lekin deploy shu sababli to'xtab turishi
# kerak emas. Repozitoriy OCHIQ, ya'ni kodni tarball bilan olish
# mumkin - hech qanday kalit yoki parol kerak emas.
#
# Tartib: avval git, u ishlamasa tarball. Tarball ishlatilganda ekranda
# ogohlantirish chiqadi - sabab yopilmasin, unutilib ketmasin.
# ---------------------------------------------------------------------------
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/true

GITHUB_OWNER=abdullaevmirshohid97-hue
GITHUB_REPO=ilova
GITHUB_BRANCH=main

git_bilan() {
  git -C "$REPO_DIR" pull --ff-only 2>/dev/null
}

tarball_bilan() {
  local tmp
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN

  echo "   tarball yuklanmoqda..."
  if ! curl -fsSL \
      "https://codeload.github.com/$GITHUB_OWNER/$GITHUB_REPO/tar.gz/refs/heads/$GITHUB_BRANCH" \
      -o "$tmp/kod.tar.gz"; then
    echo "   ! tarball yuklanmadi"
    return 1
  fi

  tar xzf "$tmp/kod.tar.gz" -C "$tmp" || return 1
  local ildiz="$tmp/$GITHUB_REPO-$GITHUB_BRANCH"

  # Kutilgan fayl bormi - yarim yuklangan arxivni ustiga yozib
  # yubormaslik uchun
  if [ ! -f "$ildiz/apps/admin/package.json" ]; then
    echo "   ! arxiv kutilganday emas - to'xtatildi"
    return 1
  fi

  # .git, .env va node_modules SAQLANADI:
  #   .git      - keyin git tuzalganda tarix joyida bo'lsin
  #   .env      - skript o'zi qayta yozadi, lekin yo'qolib ketmasin
  #   node_modules - qayta o'rnatish uzoq
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.git/' --exclude 'node_modules/' \
      --exclude '.env' --exclude '**/.env' \
      --exclude 'dist/' --exclude '**/dist/' \
      "$ildiz/" "$REPO_DIR/"
  else
    # rsync yo'q bo'lsa: eski manbani o'chirmasdan ustiga yozamiz.
    # --delete yo'q, ya'ni o'chirilgan fayllar qolib ketishi mumkin -
    # shuning uchun rsync afzal.
    echo "   ! rsync yo'q - fayllar ustiga yoziladi (o'chirilganlari qoladi)"
    cp -a "$ildiz/." "$REPO_DIR/"
  fi

  # Commit tamg'asi: .git eski holida qolgani uchun `git rev-parse`
  # yolg'on javob berardi va tekshiruv "panel yangi" deb aldardi.
  #
  # Manba sifatida GitHub API EMAS, git endpoint ishlatiladi: API
  # kalitsiz so'rovga 403 (cheklov) qaytaradi, bu endpoint esa aynan
  # shu serverda 200 berishi tekshirilgan.
  #
  # `|| true` shart: javob kelmasa `set -e` butun deploy'ni to'xtatib
  # qo'yardi. Tamg'asiz ham panel joylashishi kerak.
  ILOVA_COMMIT=$(curl -fsSL \
    "https://github.com/$GITHUB_OWNER/$GITHUB_REPO.git/info/refs?service=git-upload-pack" \
    | tr -d '\0' | grep -o '[0-9a-f]\{40\} HEAD' | head -1 | cut -c1-7 || true)

  export ILOVA_COMMIT
  return 0
}

echo "Kod olinmoqda..."
if git_bilan; then
  echo "   git pull: OK"
else
  echo ""
  echo "   ⚠  git ishlamadi — tarball bilan olinmoqda."
  echo "      Sabab hali topilmagan: curl 200 oladi, git 401."
  echo "      Tekshirish uchun:"
  echo "        GIT_CURL_VERBOSE=1 git -C $REPO_DIR fetch origin 2>&1 | grep '< HTTP'"
  echo ""
  if ! tarball_bilan; then
    echo "!! Kodni olib bo'lmadi. Deploy to'xtatildi."
    exit 1
  fi
  echo "   tarball: OK${ILOVA_COMMIT:+  (commit $ILOVA_COMMIT)}"
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
