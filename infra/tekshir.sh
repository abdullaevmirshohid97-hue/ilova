#!/bin/bash
# Serverdagi panel qaysi commit'dan qurilgan - shuni aytadi.
#
# NEGA BU YO'L: avval fayl nomidagi hash solishtirilgan edi - mahalliy va
# serverdagi build bir xil manbadan har xil hash beradi (Windows CRLF, node
# versiyasi), ya'ni "eski" degan yolg'on xulosa chiqardi. Keyin kod ichidan
# belgi qidirildi - u ham aldadi: supabase-js kutubxonasining o'z funksiyasi
# "mening yangi kodim" deb hisoblanib, deploy bo'lmagan holda "OK" berdi.
#
# Endi build o'zi commit hashini versiya.json ga yozib qo'yadi
# (apps/admin/vite.config.ts). Taxmin qiladigan joy qolmadi.
#
# Ishlatish: bash infra/tekshir.sh              (4020.yukchibolla.com)
#            bash infra/tekshir.sh https://...  (boshqa manzil)

set -uo pipefail
S=${1:-https://4020.yukchibolla.com}

# Uch marta urinamiz: javob vaqti-vaqti bilan bo'sh kelar ekan
# (uchdan birida). Bir marta so'rasak, tekshiruv tasodifan "panel eski"
# deb yolg'on ogohlantirish berardi.
javob=''
for _ in 1 2 3; do
  javob=$(curl -s --max-time 15 "$S/versiya.json?t=$RANDOM$$")
  [ -n "$javob" ] && break
done

# SPA fallback: mavjud bo'lmagan fayl so'ralsa Caddy index.html qaytaradi
case "$javob" in
  *'"commit"'*) ;;
  *)
    echo "  x versiya.json yo'q — serverda build tamg'asisiz eski panel turibdi"
    echo "    serverda: bash /opt/ilova/infra/deploy.sh"
    exit 1
    ;;
esac

serverda=$(printf '%s' "$javob" | tr -d ' "' | sed -n 's/.*commit:\([a-z0-9]*\).*/\1/p')
sana=$(printf '%s' "$javob" | tr -d ' "' | sed -n 's/.*sana:\([^,}]*\).*/\1/p')

mahalliy=$(git rev-parse --short HEAD 2>/dev/null || echo '?')
uzoq=$(git rev-parse --short origin/main 2>/dev/null || echo '?')

echo "  serverda : $serverda   ($sana)"
echo "  origin   : $uzoq"
echo "  mahalliy : $mahalliy"
echo ""

if [ "$serverda" = "$uzoq" ]; then
  echo "PANEL YANGI"
  ORTDA=0
else
  # Nechta commit ortda qolganini ham aytamiz - "biroz eski" bilan
  # "bir hafta eski" o'rtasida katta farq bor
  n=$(git rev-list --count "$serverda..$uzoq" 2>/dev/null || echo '?')
  echo "PANEL ESKI — $n ta commit ortda"
  echo "  serverda: bash /opt/ilova/infra/deploy.sh"
  ORTDA=1
fi

if [ "$mahalliy" != "$uzoq" ]; then
  echo ""
  echo "  ! mahalliy HEAD origin/main bilan bir xil emas — push qilinmagan ish bor"
fi

# ---------------------------------------------------------------------------
# Credit Debit (apps/kassa) — u alohida yo'lda (/kassa) va alohida Caddy
# bloki bilan turadi. Ya'ni deploy.sh o'tib ketsa ham, Caddyfile qo'lda
# yangilanmagan bo'lsa bu qism ISHLAMAYDI va buni faqat foydalanuvchi
# ko'rardi. Shuning uchun alohida tekshiramiz.
# ---------------------------------------------------------------------------
echo ""
echo "Credit Debit:"
CD=${CD_MANZIL:-https://app.yukchibolla.com}

sahifa=$(curl -s --max-time 15 "$CD/kassa/?t=$RANDOM$$")
case "$sahifa" in
  *'/kassa/_expo/'*)
    echo "  ✓ $CD/kassa/ — sahifa o'z bundle'iga ishora qilyapti"
    ;;
  '')
    echo "  x $CD/kassa/ — javob bo'sh (Caddy bloki qo'shilganmi?)"
    ORTDA=1
    ;;
  *)
    # Eng ehtimolli xato: /kassa/* uchun handle bloki yo'q va umumiy
    # SPA fallback b2b ilovasining index.html ini qaytaryapti.
    echo "  x $CD/kassa/ — boshqa sahifa qaytdi (b2b index.html bo'lishi mumkin)"
    echo "    infra/Caddyfile.snippet dagi 'handle /kassa/*' bloki qo'shilganini tekshiring"
    ORTDA=1
    ;;
esac

# Play uchun majburiy ikki sahifa. Ular yo'q bo'lsa ilova do'konda
# rad etiladi va sabab faqat Play Console'da ko'rinadi.
for sahifa in maxfiylik hisob-ochirish; do
  kod=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$CD/$sahifa.html")
  if [ "$kod" = "200" ]; then
    echo "  ✓ $CD/$sahifa.html"
  else
    echo "  x $CD/$sahifa.html — HTTP $kod (Play buni talab qiladi)"
    ORTDA=1
  fi
done

apk=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$CD/credit-debit.apk")
if [ "$apk" = "200" ]; then
  echo "  ✓ $CD/credit-debit.apk — yuklab olish ishlayapti"
else
  echo "  ! $CD/credit-debit.apk — HTTP $apk (APK serverga qo'yilmagan)"
  echo "    scp apps/kassa/credit-debit.apk root@<server>:/var/www/ilova-app-landing/"
fi

exit $ORTDA
