# Credit Debit — audit hisoboti

> Sana: 2026-09-13. Ko'rib chiqilgan: `apps/kassa` (5 986 qator),
> `packages/kassa-yadro`, 6 ta migratsiya, 3 ta chekka funksiya,
> 9 ta sinov. Web bundle: 841 KB.

---

## 1. Qisqacha xulosa

**Poydevor mustahkam.** Pul mantiqi (jurnal, tiyin, ziddiyat, tenant
ajratilishi) sinovlar bilan qo'riqlangan va ular haqiqiy xatolarni
topdi: float'da ketayotgan summa, kursor yo'qotishi, RLS teshigi.

**Uch joyda bo'shliq bor:**

| | Nima |
|---|---|
| **Standart** | Android «orqaga» tugmasi ishlamaydi, tegish maydonlari kichik, planshetda cho'zilib ketadi |
| **Ortiqcha** | Yarim qurilgan ko'p valyuta, ishlatilmaydigan ustunlar, o'lik funksiyalar |
| **Qaytish** | Ilova hech qachon o'zi eslatmaydi — foydalanuvchi o'zi eslashi kerak |

Uchinchisi — eng muhimi. Ilova yaxshi, lekin **jim**. Kuniga 5-10
marta kirish uchun ikki narsa kerak: yozuv 5 soniyada tushsin va
kerakli paytda ilova o'zi chaqirsin.

---

## 2. Sinov natijasi

| Sinov | Nima qo'riqlaydi |
|---|---|
| `kassa-raqam` | «ikki million» → 2 000 000, tiyin, kalkulyator |
| `kassa-balans` | Qoldiq = yozuvlar yig'indisi, kasr kesilmasligi |
| `kassa-dizayn` | Davr mantiqi, `Intl` yo'qligi, rang temada |
| `kassa-hujjat` | Excel/PDF ichidagi ma'lumot, A4 chegarasi |
| `kassa-sinx` | Dvigatel: navbat, ziddiyat, kursor (mutatsiya bilan sinalgan) |
| `kassa-sinx-baza` | Haqiqiy server: RLS, 23505, versiya ziddiyati |
| `kassa-mcp` | AI eshigi: begona tenant, yozish huquqi, tasdiq |
| `kassa-ai-kalit` | Mijoz kaliti: shifr, egasi ham o'qiy olmasligi |
| `kassa-ochirish` | Hisobni o'chirish chegaralari |

Sinovlar **jonli bazada** ishlaydi va o'zidan keyin tozalaydi.

### Sinovlar qamramaydigan joy

- **Ekran o'zi hech qachon sinalmagan.** Hamma sinov mantiq va
  baza darajasida. Tugma bosilganda nima bo'lishini faqat qo'lda
  tekshirish mumkin. (Bu — ongli qaror: RN uchun ekran sinovi
  qimmat. Lekin bilib turish kerak.)
- **Offline qatlam telefonda sinalmagan** — dvigatel soxta server
  bilan, server esa haqiqiy baza bilan sinalgan, lekin ikkalasi
  BIRGA, haqiqiy SQLite ustida ishlaganini faqat APK ko'rsatadi.

---

## 3. Ortiqcha — olib tashlash kerak

### 3.1. Yarim qurilgan ko'p valyuta — eng katta bo'shliq

Hisob ochishda USD tanlash mumkin, lekin:

- kurs har doim `1` va hech qayerda so'ralmaydi;
- hisobotda valyutalar **qo'shilib ketadi** (`hisobot_ol` hammasini
  bir qopga soladi);
- o'tkazmada valyuta farqi taqiqlangan, ya'ni USD hisob naqd bilan
  bog'lanmaydi;
- Excel/PDF da valyuta ustuni yo'q.

**Qaror kerak:** yo USD'ni yashiramiz (bir kunlik ish), yo kursni
oxirigacha qilamiz (3-4 kun: kurs kiritish, valyuta bo'yicha
hisobot, o'tkazmada konvertatsiya). Hozirgi holat — eng yomoni:
ko'rinadi, lekin ishonib bo'lmaydi.

### 3.2. Ishlatilmaydigan ustun va funksiyalar

| Nima | Holat | Taklif |
|---|---|---|
| `kassa_turkumlar.ota_id` | 0 marta ishlatilgan | Turkum daraxti kerakmi? Kerak bo'lmasa — olib tashlash |
| `kassa_klientlar.rasm_path` | yozilmaydi | Kontakt surati rejada bor edi — yo qilinadi, yo olib tashlanadi |
| `kassa_yozuvlar.tolov_usuli` | har doim `naqd` | Ekranda tanlov yo'q. Naqd/karta ajratish kerakmi? |
| `baytBase64` (yadro) | 0 marta | O'chirish |
| `valyutaBoyicha` (yadro) | 0 marta | Ko'p valyuta qaroridan keyin hal bo'ladi |
| `kassa_qurilmalar` | to'ladi, ko'rinmaydi | Sozlamalarda «qurilmalarim» ekrani — foydali, 2 soat |
| `manba='ovoz'` | hali yo'q xususiyat uchun | Qolsin (robot rejasida bor) |

### 3.3. `YanaEkrani.tsx` — 757 qator

Ichida beshta mustaqil ekran: hisoblar, turkumlar, hisobot,
sozlama, AI. Ular bir-biriga bog'liq emas. Ajratish kerak —
hozir bitta xato butun bo'limni yiqitadi.

---

## 4. Dizayn va standart kamchiliklari

Jiddiylik bo'yicha tartiblangan.

### 4.1. Android «orqaga» tugmasi ishlamaydi — **eng jiddiy**

Modal ochiq bo'lsa ham, «Yozuvlar» bo'limida turgan bo'lsa ham,
orqaga bosilsa **ilova yopiladi**. Android foydalanuvchisi buni
buzuqlik deb qabul qiladi.

To'g'ri xulq: modal ochiq → yopilsin; ichki sahifada → orqaga;
asosiy bo'limda → «Bosh»ga; «Bosh»da → chiqish.
(`apps/mobile` da bu bor — naqsh tayyor.) **Yarim kun.**

### 4.2. Tegish maydonlari kichik

`Chip` balandligi ~31 px. Android va iOS talabi — **48 dp / 44 pt**.
Turkum va filtr tanlash — eng ko'p bosiladigan joy, ya'ni eng ko'p
«tegmadi» bo'ladigan joy. **2 soat.**

### 4.3. Planshet va brauzerda cho'zilib ketadi

`maxWidth` faqat modallarda. Web'da 1920 px ekranda yozuvlar
ro'yxati butun enni egallaydi — o'qib bo'lmaydi.
`apps/mobile/src/lib/responsive.ts` naqshi bor. **3 soat.**

### 4.4. Faqat o'zbek tili

B2B ilovada o'zbek va rus bor. Bu yerda yo'q. O'zbekistonda
savdo qiluvchilarning sezilarli qismi rus tilida yozadi.
**1 kun** (matnlar ko'p emas).

### 4.5. Xatolik kuzatuvi yo'q

B2B ilovada `client_errors` jadvali bor — foydalanuvchida nima
yiqilgani bizgacha yetadi. Bu yerda yo'q: telefonda oq ekran
bo'lsa, biz hech qachon bilmaymiz. **3 soat.**

### 4.6. Kichik, lekin kunlik g'ashlik

| Muammo | Ta'siri |
|---|---|
| Summa kiritishda ming ajratgich yo'q (`1200000`) | Nol sanash kerak, xato kiritish oson |
| Sana faqat kunba-kun o'q | O'tgan oyning yozuvi = 30 marta bosish |
| Turkum ro'yxatida qidiruv yo'q | 10+ turkumda aylantirish kerak |
| Yozuvni bekor qilish — **uzoq bosish**, hech qayerda yozilmagan | Foydalanuvchi topa olmaydi |
| Yangi hisobda «boshlang'ich qoldiq» tushuntirilmagan | Birinchi kun balansi noto'g'ri chiqadi |
| Hisobotda o'tgan davr bilan taqqoslash yo'q | «Ko'pmi yoki kam?» degan savol javobsiz |

---

## 5. Psixologiya: kuniga 5-10 marta qaytish

### 5.1. Avval halol gap

«Kuniga 5-10 marta kirsin» — bu **maqsad emas, natija**. Do'kondor
ilovani sevgani uchun emas, **pul harakati bo'lgani uchun** ochadi.
Kuniga 20 marta pul olib-berilsa, 20 marta ochishi kerak — agar
har safar 5 soniya ketsa. Agar 30 soniya ketsa, kechqurun bir marta
o'tirib «eslab» yozadi va uchdan ikkisi yo'qoladi.

Shuning uchun birinchi vazifa — **tezlik**, ikkinchisi — **eslatma**.
Bildirishnoma bilan majburlash (kuniga 5 ta push) teskari ishlaydi:
ilova o'chiriladi.

### 5.2. Tezlik — har yozuv 5 soniyada

Hozir: ochish → «Chiqim» → raqam → turkum → «Qo'shish» = **4 tegish
+ raqam**. Yomon emas, lekin quyidagilar uni yarmiga tushiradi:

1. **Oxirgi turkumni eslab qolish.** Do'kondor kun bo'yi bir xil
   turkumga yozadi. Hozir har safar qaytadan tanlaydi.
2. **«Takrorlash»** — oxirgi yozuvni bir tegish bilan qaytarish
   («yana 50 000 benzin»).
3. **Tez summalar** — eng ko'p ishlatilgan 3 ta summa tugmasi
   (5 000 · 10 000 · 50 000). Odamning summalari takrorlanadi.
4. **Bosh ekrandan to'g'ridan-to'g'ri klaviatura** — «Chiqim»
   bosilganda darhol raqam terish (hozir ham shunday, yaxshi).

**Natija: 2 tegish, 3 soniya.** Shunda kuniga 10-20 marta ochish
tabiiy bo'ladi.

### 5.3. Qaytish sabablari — kuchlisidan boshlab

**a) Qarz eslatmasi — eng kuchli.**
«Ahmad 7 kundan beri to'lamadi — 2 400 000 so'm».
Pul yo'qotish qo'rquvi har qanday «streak»dan kuchli. Bizda qarz
ma'lumoti bor, eslatma yo'q.

**b) Kun yopish marosimi.**
Kechqurun 20:00: «Bugun 12 yozuv · qoldiq 1 240 000. Kassani sanab
ko'ring». Bosilsa — kassa sanog'i ekrani: real pulni kiritadi,
farq chiqsa korreksiya yozuvi tushadi. Bu — **kunlik odat**, va
u ayni paytda ma'lumot sifatini oshiradi.

**c) Telegram bot — bizning eng katta ustunligimiz.**
Loyihada allaqachon oltita Telegram funksiyasi va ishlayotgan qarz
boti bor. Do'kondor kun bo'yi Telegramda. Botga «500 ming benzin»
deb yozsa — yozuv tushadi, ilova ochilmasa ham.

Bu «ilova ochish»ni kamaytiradi, lekin **mahsulotdan chiqib
ketmaslikni** oshiradi — aslida muhimi shu. Raqobatchilarda yo'q.

**d) Bosh ekran vidjeti** (Android): qoldiq + ikkita tugma.
Ilovani ochmasdan yozuv — ya'ni to'siq nolga tushadi.

**e) Haftalik xulosa.** Dushanba ertalab: «O'tgan hafta: kirim X,
chiqim Y. Eng katta xarajat — ijara. O'tgan haftaga nisbatan +12%».
Haftada bir marta, lekin o'qiladi.

**f) Ketma-ketlik (streak) — ehtiyotkorlik bilan.**
«14 kun ketma-ket yozdingiz» — yaxshi. «Ketma-ketligingiz
buzildi!» — moliyaviy ilovada bosim va aybdorlik hissi beradi,
odam ilovadan qochadi. Faqat ijobiy tomoni qolsin.

### 5.4. Nimani QILMASLIK kerak

- Kuniga bir nechta push. Bir kunda **bitta** (kechqurun) + qarz
  eslatmasi haftasiga bir-ikki marta.
- «Oltin kubok», ball, daraja — moliyaviy ilovada jiddiylikni
  yo'qotadi.
- Ochilishda reklama yoki «tarifni ko'taring» oynasi. Pul
  yozayotgan odamni to'xtatish — eng yomon payt.

---

## 6. Tavsiya qilinadigan tartib

Ta'siri katta va arzonidan boshlab:

| # | Ish | Holat | Nima berdi |
|---|---|---|---|
| 1 | Android orqaga tugmasi | **bajarildi** | `BackHandler`: tanlov → ichki sahifa → bo'lim → chiqish |
| 2 | Tegish maydonlari 48 dp | **bajarildi** | Chip 44, qator 56, tugma 48 dp |
| 3 | Oxirgi turkum + «Takrorlash» + tez summalar | **bajarildi** | Yozuv 2 tegishga tushdi |
| 4 | Ming ajratgich + sana tanlash | **bajarildi** | `ifodaKorinish`, «Bugun/Kecha» |
| 5 | Qarz eslatmasi (bildirishnoma) | **kerak emas** | Qaror 20.09: bildirishnoma qilinmaydi |
| 6 | Kun yopish + kassa sanog'i | **bajarildi** | Kechqurun taklif, farq yozuv bo'lib tushadi |
| 7 | Telegram bot (yozuv kiritish) | savol ochiq | Qaror kerak (7.2) |
| 8 | Planshet/web kengligi | **bajarildi** | Markazda 640 px ustun |
| 9 | Rus tili | **bajarildi** | `lib/til.ts`, sozlamada tanlanadi |
| 10 | Xatolik kuzatuvi | **bajarildi** | `kassa_xatolar` + xato qalqoni |
| 11 | Ko'p valyuta: yashirish yoki tugatish | **tugatildi** | Hisobot har valyutani alohida sanaydi |
| 12 | `YanaEkrani` ni bo'lish | **bajarildi** | 771 → 123 qator + 4 ta ekran |

**Bajarilgani** (1-4, 6, 8-12) ilovani «ishlaydi»dan «qulay»ga
o'tkazdi: yozuv 2 tegishda kiritiladi, orqaga tugmasi standart
bo'yicha ishlaydi, hisobot valyutalarni aralashtirmaydi, kechqurun
kassa sanog‘i taklif qilinadi va telefondagi nosozlik endi bizga
yetib keladi.

**Bildirishnoma (5)** — 20.09 dagi qaror bo'yicha QILINMAYDI.
Muddati o'tgan qarz ro'yxatning o'zida ajralib turadi.

**Qolgani (7)** — Telegram bot orqali yozuv kiritish. Texnik emas,
qaror masalasi: bot qilinadimi.

---

## 7. Ochiq savollar

1. **Ko'p valyuta**: yashiramizmi yoki tugatamizmi?
2. **Telegram bot**: qilamizmi? (Men «ha» deb o'ylayman — bizda
   infratuzilma tayyor va bu raqobatchilarda yo'q.)
3. **Bildirishnoma**: Expo push kerak (yangi qatlam) yoki Telegram
   orqali yuboramizmi? Telegram arzonroq va O'zbekistonda
   ishonchliroq.
4. **Turkum daraxti** (`ota_id`) kerakmi yoki tekis ro'yxat yetadimi?
