# APK build — EAS orqali (qo'llanma)

Bu ilova (`apps/mobile`) Expo bilan yozilgan. Android APK yasash uchun **EAS
Build** (Expo'ning bulutli build xizmati) ishlatiladi — bu sizning shaxsiy
Expo akkauntingiz orqali ishlaydi, shuning uchun bu qadamni **siz o'zingiz**
bajarasiz (Claude buni avtomatik qila olmaydi).

## 1. Bir martalik tayyorgarlik

Agar Expo akkauntingiz yo'q bo'lsa: https://expo.dev — bepul ro'yxatdan o'ting.

```
cd D:\ilova\apps\mobile
npx eas-cli login
```
(email/parol yoki brauzer orqali kirasiz)

## 2. Birinchi build (preview — to'g'ridan-to'g'ri APK)

```
npx eas-cli build --platform android --profile preview
```

Birinchi marta ishga tushirganda EAS sizdan so'raydi:
- **"Would you like to create a project for @<sizning-akkaunt>/yukchibolla?"** — Ha
  (bu `app.json`ga `extra.eas.projectId` avtomatik yozadi)
- **Android keystore (imzo kaliti)** — "Generate new keystore" tanlang (EAS
  buni o'zi xavfsiz saqlaydi, hech narsa qo'lda qilish shart emas)

Build ~10-15 daqiqa bulutda ishlaydi (terminalda progress ko'rinadi). Tugagach:
- Terminalda to'g'ridan-to'g'ri **yuklab olish havolasi** chiqadi, YOKI
- https://expo.dev/accounts/**sizning-akkaunt**/projects/yukchibolla/builds
  sahifasida ko'rinadi

## 3. APK'ni serverga qo'yish

Yuklab olingan `.apk` faylni **aynan shu nom bilan** serverga qo'ying
(deploy.sh shu yo'lni web-ilovadagi "Yuklab olish" tugmasiga ulagan):

```
scp yukchibolla.apk root@72.61.88.214:/var/www/ilova-app-landing/yukchibolla.apk
```

(Agar fayl boshqa nom bilan yuklangan bo'lsa — serverga qo'yishdan oldin
`yukchibolla.apk`ga nomlang.)

Shundan keyin `https://app.yukchibolla.com` dagi "📱 Android ilovasini
yuklab olish" tugmasi ishlaydi — bosilganda darhol shu APK yuklanadi.

## 4. Keyingi yangilanishlar

Kod o'zgarganda yangi APK kerak bo'lsa:
1. `app.json`da `version` va `android.versionCode`ni oshiring (masalan
   `"version": "1.0.1"`, `"versionCode": 2`)
2. Qayta: `npx eas-cli build --platform android --profile preview`
3. Yangi APK'ni xuddi shu yo'lga (`yukchibolla.apk` nomi bilan) qo'ying —
   eskisining ustidan yoziladi

## 5. Play Market'ga chiqarish (keyinroq, ixtiyoriy)

Hozircha `preview` profili — to'g'ridan-to'g'ri APK, do'kon kerak emas.
Play Market uchun keyinroq: `production` profili + Google Play Developer
akkaunt ($25 bir martalik) + `eas submit`.
