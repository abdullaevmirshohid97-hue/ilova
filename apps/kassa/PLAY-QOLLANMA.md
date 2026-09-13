# Credit Debit — Google Play va APK qo'llanmasi

Bu ilova (`apps/kassa`) — platformaning **kassa** yo'nalishi: hisob-kitob
daftari. B2B mijoz ilovasidan (`apps/mobile`) alohida turadi: alohida
paket nomi, alohida ikonka, alohida hisob (odam o'zi ro'yxatdan o'tadi).

| | |
|---|---|
| Ilova nomi | Credit Debit |
| Paket (Android) | `uz.yukchibolla.creditdebit` |
| EAS loyihasi | `@amirxon.ai4020/credit-debit` |
| Web manzili | `app.yukchibolla.com/kassa/` |
| APK manzili | `app.yukchibolla.com/credit-debit.apk` |
| Baza | `gnuddryjsmcrjchrbvyz` · jadvallar `kassa_*` |

---

## 1. Imzo kaliti — eng muhim fayl

```
kodchi/credit-debit.jks          ← imzo kaliti
kodchi/credit-debit-parol.txt    ← paroli
apps/kassa/credentials.json      ← EAS shu ikkisiga ishora qiladi
```

Uchalasi ham **gitignore'da** va serverga chiqmaydi.

**Bu kalit yo'qolsa, Play Market'dagi ilovani boshqa yangilab
bo'lmaydi** — yangi paket nomi bilan qaytadan chiqarish kerak bo'ladi
va foydalanuvchilar yo'qoladi. Nusxasini xavfsiz joyga oling (parol
menejeri yoki shifrlangan disk). Fleshkada ochiq holda saqlamang.

Kalit haqida: RSA 2048, amal muddati 10 000 kun (~27 yil),
SHA-256 barmoq izi `7E:0B:20:58:...:D2:76`.

---

### Imzo to'g'riligini tekshirish

APK'ning qaysi kalit bilan imzolanganini bilish kerak bo'lsa (masalan
Play «yuklangan APK boshqa kalit bilan imzolangan» desa), `apksigner`
shart emas — imzo blokidagi sertifikatni o'qib ko'rsa bo'ladi:

```bash
node -e "
const fs=require('fs'),crypto=require('crypto');
const b=fs.readFileSync('apps/kassa/credit-debit.apk');
const m=b.indexOf(Buffer.from('APK Sig Block 42','latin1'));
const h=Number(b.readBigUInt64LE(m-8));
let p=m+16-h; const oxir=m-8; let v2=null;
while(p+12<=oxir){const len=Number(b.readBigUInt64LE(p));
  if(b.readUInt32LE(p+8)>>>0===0x7109871a) v2=b.slice(p+12,p+8+len); p+=8+len;}
let o=0;const u32=()=>{const v=v2.readUInt32LE(o);o+=4;return v;};
u32();u32();u32();o+=u32();u32();const c=u32();
console.log(crypto.createHash('sha256').update(v2.slice(o,o+c)).digest('hex')
  .toUpperCase().match(/../g).join(':'));"
```

2026-09-13 dagi birinchi build tekshirildi — sertifikat
`7E:0B:20:58:...:D2:76`, ya'ni `kodchi/credit-debit.jks` bilan
imzolangan. ✅

---

## 2. APK yasash (sinov va sayt uchun)

```bash
cd apps/kassa
pnpm build:apk          # = eas build --platform android --profile preview
```

Build EAS bulutida ~10-20 daqiqa ishlaydi. Tugagach havola beriladi.
Yuklab olingan faylni serverga qo'ying:

```bash
scp credit-debit.apk root@<server>:/var/www/ilova-app-landing/credit-debit.apk
```

Shundan keyin `app.yukchibolla.com` dagi «APK yuklab olish» tugmasi
ishlaydi (`infra/deploy.sh` buni tekshiradi va yo'q bo'lsa ogohlantiradi).

---

## 3. Play Market uchun AAB

Play Market APK emas, **AAB** (Android App Bundle) qabul qiladi:

```bash
cd apps/kassa
pnpm build:aab          # = eas build --platform android --profile production
```

Versiyani oshirishni unutmang — har yangi yuklamada `app.json` dagi
`android.versionCode` **kattaroq** bo'lishi shart, aks holda Play rad
etadi:

```json
"version": "1.0.1",
"android": { "versionCode": 2 }
```

---

## 4. Do'kon sahifasi uchun grafika — tayyor

Hammasi koddan yasaladi: `node scripts/credit-debit-logo.mjs`

| Fayl | O'lcham | Qayerda kerak |
|---|---|---|
| `assets/play/play-icon-512.png` | 512×512 | Play Console → ilova ikonkasi |
| `assets/play/feature-graphic-1024x500.png` | 1024×500 | Play Console → banner (majburiy) |
| `assets/icon.png` | 1024×1024 | ilovaning o'zi (iOS/Android) |
| `assets/adaptive-icon.png` | 1024×1024 | Android adaptiv ikonka |
| `assets/splash-icon.png` | 1024×1024 | ochilish ekrani |
| `assets/favicon.png` | 196×196 | brauzer |
| `assets/play/logo-gorizontal-oq.png` | 1200×300 | sayt, reklama |

**Hali yo'q:** ekran rasmlari (screenshots). Play kamida 2 ta,
telefon uchun 1080×1920 atrofida so'raydi. Ularni ilova tayyor bo'lgach
haqiqiy ekrandan olish kerak — soxta rasm qo'yish taqiqlangan.

---

## 5. Play Console talablari — ro'yxat

| Talab | Holat |
|---|---|
| Ilova ikonkasi 512×512 | ✅ tayyor |
| Banner 1024×500 | ✅ tayyor |
| AAB fayli | ⏳ `pnpm build:aab` |
| Ekran rasmlari (2+) | ⏳ ilovadan olinadi |
| Qisqa tavsif (80 belgi) | pastda |
| To'liq tavsif (4000 belgi) | pastda |
| Maxfiylik siyosati (URL) | ⏳ `app.yukchibolla.com/maxfiylik` yaratilishi kerak |
| **Hisobni o'chirish** (ilova ichida + veb havola) | ⏳ qilinmagan — Play buni TEKSHIRADI |
| Data safety anketasi | ⏳ to'ldirilishi kerak |
| Target SDK | EAS o'zi eng yangisini qo'yadi |

### Qisqa tavsif (80 belgi)

```
Kirim-chiqim daftari: hisoblar, qarz, hisobot. Oddiy va tez.
```

### To'liq tavsif (loyiha)

```
Credit Debit — kichik biznes va shaxsiy pul uchun hisob-kitob daftari.

• Kirim va chiqim — uch bosishda yoziladi
• Bir nechta hisob: naqd, karta, bank
• Turkumlar bo'yicha xarajat tahlili
• Mijoz va ta'minotchi qarzi
• Kunlik, haftalik, oylik hisobot
• Hisoblararo o'tkazma
• Ma'lumot bulutda saqlanadi — telefon almashsa ham yo'qolmaydi

Ilova Yukchibolla platformasining bir qismi.
```

---

## 6. Hali qilinmagan, lekin Play uchun SHART

1. **Hisobni o'chirish.** Ilova ichida «Hisobni o'chirish» tugmasi va
   `app.yukchibolla.com/hisob-ochirish` sahifasi kerak. Buni chekka
   funksiya qiladi: `auth.users` dan foydalanuvchini va uning
   tashkilotini o'chiradi (`organizations` kaskad bilan `kassa_*` ni
   ham olib ketadi).

   **TARTIB MUHIM** (sinovda ushlandi): `profiles.org_id` ning FK'sida
   kaskad YO'Q, ya'ni profil turgan tashkilotni o'chirib bo'lmaydi —
   so'rov jimgina yiqiladi va tashkilot yetim bo'lib qoladi. To'g'ri
   ketma-ketlik:

   ```sql
   delete from auth.users where id = <uid>;   -- profiles kaskad bilan ketadi
   delete from public.uzvliklar where org_id = <org>;
   delete from public.organizations where id = <org>;  -- kassa_* kaskad
   ```
2. **Maxfiylik siyosati sahifasi.** Qaysi ma'lumot yig'iladi (email,
   yozuvlar), qayerda saqlanadi (Supabase), kim ko'radi (faqat
   foydalanuvchining o'zi), qanday o'chiriladi.
3. **Email tasdiqlash yo'li.** Hozir Supabase'ning o'z pochtasi ishlaydi
   va u soatiga ~2 ta xat bilan cheklangan — ya'ni ommaviy ro'yxatdan
   o'tish uchun YETMAYDI. Ikki yo'l bor:
   - SMTP ulash (Resend/SendGrid) — to'g'ri yo'l;
   - yoki tasdiqlashni o'chirish (`mailer_autoconfirm = true`) — tez,
     lekin email tekshirilmaydi.

   Bu **jonli sozlama**, shuning uchun qaror egasi — siz.
