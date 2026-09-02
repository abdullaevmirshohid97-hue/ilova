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

javob=$(curl -s "$S/versiya.json?t=$(date +%s)")

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

exit $ORTDA
