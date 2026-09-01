#!/bin/bash
# Panel serverda YANGILANGANMI - kod bo'yicha tekshiradi.
#
# NEGA HASH EMAS: mahalliy build va serverdagi build bir xil manbadan
# HAR XIL hash beradi (Windows CRLF, node/pnpm versiyasi, install tartibi).
# Ya'ni "index-XXXX.js mos kelmadi" degani "deploy bo'lmadi" degani EMAS -
# bir marta shu adashtirdi. Ishonchli belgi: yangi kod chaqiradigan RPC
# nomlari jonli bundle ichida bormi.
#
# Ishlatish: bash infra/tekshir.sh   (istalgan kompyuterdan)

set -uo pipefail
S=${1:-https://4020.yukchibolla.com}

IDX=$(curl -s "$S/" | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
[ -z "$IDX" ] && { echo "  x index.html'da bundle topilmadi - sayt ochilmayaptimi?"; exit 1; }

# Panel lazy-chunk'larga bo'lingan: yangi kod asosiy bundle'da emas,
# SuperAdminPanel chunk'ida. Uning nomini asosiy bundle'dan olamiz.
CH=$(curl -s "$S$IDX" | grep -o 'SuperAdminPanel-[A-Za-z0-9_-]*\.js' | head -1)
[ -z "$CH" ] && { echo "  x SuperAdminPanel chunk topilmadi"; exit 1; }
JS=$(curl -s "$S/assets/$CH")

# Har biri bitta modulning yangi ishiga tegishli:
#   dori_sotuv_mijozlar    - SOTUV: mijoz avtoto'ldirish
#   dori_katalog_royxat    - DORI: sklad ustunlari
#   dori_sklad_prays       - SKLAD: prays sklad ichida yuklanadi
#   dori_push_tayyorla     - MIJOZLAR: push xabar
#   dori_buyurtma_ochir    - BUYURTMALAR: tahrir va o'chirish
#   dori_buyurtma_skladlar - BUYURTMALAR: qaysi skladda
yiqildi=0
for f in dori_sotuv_mijozlar dori_katalog_royxat dori_sklad_prays \
         dori_push_tayyorla dori_buyurtma_ochir dori_buyurtma_skladlar
do
  # Quvur ishlatmaymiz: `grep -q` moslikni topgach darrov chiqadi, uni
  # oziqlantirayotgan buyruq SIGPIPE oladi va `pipefail` buni "topilmadi"
  # deb ko'rsatib qo'yardi - natija har safar boshqacha chiqardi.
  if [[ $JS == *"$f"* ]]; then
    echo "  OK  $f"
  else
    echo "  YO'Q $f"
    yiqildi=$((yiqildi + 1))
  fi
done

echo ""
if [ $yiqildi -eq 0 ]; then
  echo "PANEL YANGI"
else
  echo "$yiqildi ta yo'q -> serverda: bash /opt/ilova/infra/deploy.sh"
fi
exit $yiqildi
