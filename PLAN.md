# B2B Ulgurji Savdo Platformasi — Texnik Reja (v1.0)

> To'qimachilik zavodi uchun: katalog + ombor + buyurtma + mijoz narxlari + qarzdorlik.
> Muallif: CTO-darajadagi texnik reja. Sana: 2026-07-17.

---

## 1. Loyiha bir jumlada

**Admin kompyuterdan mahsulot va mijozlarni boshqaradi; mijoz mobil ilovadan o'z narxida katalogni ko'rib buyurtma beradi; ombor qoldig'i real vaqtda, avtomatik yuritiladi; qarzdorlik ledger (jurnal) asosida hisoblanadi.**

---

## 2. Eng muhim arxitektura qarori (CTO fikri)

Sizga avval tavsiya qilingan stack (NestJS + Redis + MinIO + Socket.IO + alohida server) — bu **20 kishilik jamoa uchun** arxitektura. Sizning holatingizda bu 6 oylik qurilish va doimiy DevOps xarajati degani.

Amazon/Google darajasidagi haqiqiy tamoyil: **"Do'nt build what you can buy"** — o'zing yozadigan kod qancha kam bo'lsa, xato shuncha kam, tezlik shuncha yuqori.

**Qaror: Supabase-first arxitektura.**

| Ehtiyoj | "Katta" stack | Bizning yechim |
|---|---|---|
| Ma'lumotlar bazasi | PostgreSQL (o'zing boshqarasan) | Supabase PostgreSQL (boshqarilgan) |
| Real-vaqt qoldiq | Socket.IO + Redis | Supabase Realtime (tayyor) |
| Rasm saqlash | MinIO/S3 (o'zing sozlaysan) | Supabase Storage + CDN (tayyor) |
| Autentifikatsiya | JWT + OTP (o'zing yozasan) | Supabase Auth (tayyor) |
| Biznes-mantiq | NestJS server | Postgres funksiyalar (RPC) + Edge Functions |
| Xavfsizlik (narx sizib chiqmasligi) | Backend kodda tekshirish | Row Level Security (baza darajasida) |

Natija: **3-4 oy o'rniga 6-8 hafta**, oylik server xarajati $25-50, DevOps kerak emas. 100 000 mahsulot va minglab mijoz — Postgres uchun bu kichik yuk, hech qanday muammo yo'q.

Agar biznes juda o'sib ketsa (kuniga 10 000+ buyurtma), keyin NestJS qatlamini qo'shish mumkin — baza Postgres bo'lgani uchun hech narsa qayta yozilmaydi. Bu **qulflanmagan** yechim.

---

## 3. Texnologiya stack

| Qatlam | Texnologiya | Izoh |
|---|---|---|
| Admin panel | React + Vite + TypeScript + Tailwind + shadcn/ui | Kompyuter brauzerida, tez va zamonaviy |
| Mobil ilova | Expo (React Native) + TypeScript + NativeWind | Bitta kod — Android + iOS |
| Baza | Supabase PostgreSQL | RLS, triggerlar, full-text qidiruv |
| Real-vaqt | Supabase Realtime | Qoldiq o'zgardi → hamma ilovada jonli yangilanadi |
| Rasmlar | Supabase Storage + transformatsiya | Avtomatik thumbnail, CDN orqali tez yuklanadi |
| Auth | Supabase Auth (telefon + parol) | Akkauntni admin yaratadi, SMS OTP — 2-bosqichda (Eskiz.uz) |
| Print | Brauzerdan A4 chop etish (yig'ish varaqasi) | Alohida printer-server kerak emas |
| Monorepo | pnpm workspaces | `apps/admin`, `apps/mobile`, `packages/shared` |

---

## 4. Ma'lumotlar bazasi sxemasi (yadro)

```
categories        — kategoriyalar (daraxt: ota-bola)
products          — mahsulot: nom, model, SKU, kategoriya, tavsif, material
product_variants  — variant: razmer, rang/gul → HAR BIR variantning o'z qoldig'i
product_images    — rasmlar (tartib bilan, asosiy rasm)

price_groups      — narx guruhlari ("Standart", "VIP", "Diler"...) — sizdagi 4 xil "tarix"
prices            — variant × narx_guruhi → narx
customers         — mijoz: ism, telefon, manzil, narx_guruhi, kredit limiti
profiles          — auth foydalanuvchi ↔ mijoz bog'lanishi (admin / mijoz roli)

stock_movements   — OMBOR JURNALI: kirim (+30000), sotuv (-8000), qaytarish, korreksiya
                    Qoldiq = jurnal yig'indisi. Hech qachon "qo'lda" o'zgartirilmaydi.
stock_levels      — tezkor qoldiq (trigger avtomatik yangilaydi) → real-time shu yerdan

orders            — buyurtma: mijoz, holat (yangi→tasdiqlangan→yig'ilgan→yopilgan→bekor)
order_items       — pozitsiyalar: variant, miqdor, o'sha paytdagi narx (muzlatilgan)

ledger_entries    — MOLIYA JURNALI: buyurtma qarzi (+), to'lov (-), chegirma
                    Mijoz balansi = jurnal yig'indisi. Tarix hech qachon yo'qolmaydi.
payments          — to'lovlar: naqd / karta / o'tkazma, sana, izoh
```

### Nima uchun "jurnal" (ledger) usuli — bu kritik qaror

Qoldiq va qarzni **bitta raqam sifatida saqlash — xato**. Raqam buzilsa, nimadan buzilganini hech qachon bilolmaysiz. Jurnal usulida har bir o'zgarish yozuv bo'lib qoladi:

```
2026-07-01  Kirim (ishlab chiqarish)   +10 000   → qoldiq 10 000
2026-07-05  Buyurtma #142 (Mijoz A)     -8 000   → qoldiq  2 000
2026-07-10  Kirim (ishlab chiqarish)   +30 000   → qoldiq 32 000
```

Bank hisoblari ham shunday ishlaydi. Audit, hisobot, xatolarni topish — hammasi shundan chiqadi.

---

## 5. Kritik texnik yechimlar

### 5.1. Ortiqcha sotib yubormaslik (overselling)
Ikkita mijoz bir vaqtda oxirgi 2000 donaga buyurtma bersa — oddiy kod ikkalasiga ham "ha" deydi. Yechim: buyurtma tasdiqlash **bitta atomik Postgres funksiya (RPC)** ichida bo'ladi — qatorni qulflab (`FOR UPDATE`), qoldiqni tekshiradi, yetsa ayiradi, yetmasa rad etadi. Poyga holati (race condition) baza darajasida yopiladi.

### 5.2. Narx sizib chiqmasligi
Mijoz A 2900 ko'radi, Mijoz B 3100 — va B hech qachon A ning narxini ko'rolmasligi kerak. Bu **Row Level Security** bilan baza darajasida yopiladi: mijoz so'rovi faqat o'z narx-guruhidagi qatorlarni qaytaradi. Frontend xatosi ham, API xatosi ham narxni ochib berolmaydi — chunki baza o'zi bermaydi.

### 5.3. Real-vaqt qoldiq
`stock_levels` jadvaliga Supabase Realtime obuna: kimdir 5000 dona olsa, hamma ochiq ilovada qoldiq bir soniyada yangilanadi. WebSocket infratuzilmasini o'zimiz yozmaymiz.

### 5.4. Qidiruv (100 000 mahsulot)
Postgres full-text search + `pg_trgm` (xatoli yozilganda ham topadi: "versaje" → Versace). Nom, model, SKU, razmer, rang, material bo'yicha indeks. 100k yozuv uchun javob < 50ms. Elasticsearch kerak emas.

### 5.5. Rasmlar
Admin katta rasm yuklaydi → Storage avtomatik 3 o'lcham beradi (thumbnail / o'rta / to'liq). Katalog ro'yxatida faqat thumbnail yuklanadi — sekin internetda ham ilova uchadi.

### 5.6. Narx tarixi
`order_items` da narx **buyurtma paytida muzlatiladi**. Ertaga narx o'zgarsa, eski buyurtmalar tarixi o'zgarmaydi.

---

## 6. Funksiyalar ro'yxati

### Admin panel (brauzer)
1. **Mahsulotlar**: yaratish/tahrirlash, rasmlar, variantlar (razmer×rang), kategoriya, SKU, Excel import (10 000 tani qo'lda kiritmaslik uchun!)
2. **Ombor**: kirim kiritish (+20 000), korreksiya, jonli qoldiq, kam qolgan mahsulotlar ogohlantirishi
3. **Narxlar**: narx guruhlari, guruh bo'yicha narx belgilash, mijozga guruh biriktirish
4. **Mijozlar**: yaratish (ism, telefon, manzil, guruh), login/parol berish, bloklash
5. **Buyurtmalar**: jonli lenta (yangi buyurtma darhol tushadi), tasdiqlash/bekor qilish, **yig'ish varaqasini chop etish** (buyurtma №, mijoz, mahsulot, dona)
6. **Moliya**: to'lov kiritish, mijoz balansi, qarzdorlar ro'yxati
7. **Hisobot**: kunlik/oylik sotuv, top mahsulotlar, ombor qiymati, qarzdorlik jami

### Mijoz ilovasi (Android/iOS)
1. **Kirish**: telefon + parol (admin bergan)
2. **Katalog**: rasmli ro'yxat, kategoriyalar, jonli qoldiq, **faqat o'z narxi**
3. **Qidiruv**: nom / model / razmer / rang / SKU / material bo'yicha
4. **Savat → Buyurtma**: miqdor tanlash, yuborish, holatini kuzatish
5. **Profil**: buyurtmalar tarixi, balans/qarzdorlik, to'lovlar tarixi
6. **Push-bildirishnoma**: "Buyurtmangiz tasdiqlandi", "Yangi mahsulot keldi"

---

## 7. Bosqichma-bosqich reja

### 0-bosqich — Poydevor (3-4 kun)
Monorepo, Supabase loyiha, baza sxemasi + RLS + triggerlar, seed ma'lumotlar.
**Natija:** baza tayyor, xavfsizlik qoidalari ishlaydi.

### 1-bosqich — Admin yadrosi (1.5-2 hafta)
Login, mahsulot CRUD + rasm yuklash, variantlar, kategoriyalar, ombor kirim/qoldiq, narx guruhlari, mijoz yaratish.
**Natija:** admin katalogni to'ldira oladi. (Excel import shu yerda — birinchi kundan kerak bo'ladi.)

### 2-bosqich — Mijoz ilovasi MVP (2 hafta)
Login, katalog + qidiruv + kategoriya, mahsulot sahifasi (o'z narxi, jonli qoldiq), savat, buyurtma yuborish, tarix.
**Natija:** birinchi haqiqiy mijozga berish mumkin. ⭐ **Bu — investorga ko'rsatadigan nuqta.**

### 3-bosqich — Buyurtma sikli + moliya (1.5 hafta)
Admin buyurtma lentasi (real-time), atomik tasdiqlash + qoldiq ayirish, yig'ish varaqasi print, to'lovlar, balans/qarzdorlik, push-bildirishnomalar.
**Natija:** to'liq ish sikli: buyurtma → tasdiqlash → print → ombor → qarz.

### 4-bosqich — Sayqal (1-2 hafta)
Hisobotlar, SMS OTP (Eskiz.uz), kam-qoldiq ogohlantirish, Play Market / App Store nashr, ikoni/splash, yuk testlari.

**Jami: ~6-8 hafta to'liq ishlaydigan tizimgacha.**

---

## 8. Xavflar va yechimlar

| Xavf | Yechim |
|---|---|
| 10 000 mahsulotni kiritish — insoniy to'siq | Excel/CSV import 1-bosqichdan; rasmlarni ommaviy yuklash |
| Ikki mijoz bir paytda oxirgi tovarni olishi | Atomik RPC + qator qulfi (5.1) |
| Narx boshqa mijozga ko'rinishi | RLS — baza darajasida (5.2) |
| Internet uzilishi (mijozda) | Katalog keshi, buyurtma qoralamasi lokal saqlanadi |
| Qoldiq/qarz raqami "buzilishi" | Ledger usuli — har o'zgarish jurnalda, qayta hisoblash mumkin |
| App Store tekshiruvi cho'zilishi | Android birinchi (Play Market tezroq), iOS parallel |
| Supabase'ga "qulflanish" | Hammasi standart Postgres — istalgan payt o'z serveringizga ko'chadi |

---

## 9. Xarajatlar (oylik, taxminiy)

| Modda | Narx |
|---|---|
| Supabase Pro | $25/oy (boshida Free ham yetadi) |
| Admin hosting (Vercel/Netlify) | $0 |
| Apple Developer | $99/yil |
| Google Play | $25 (bir martalik) |
| Eskiz.uz SMS | ~50 so'm/SMS (faqat OTP bosqichida) |
| **Jami start** | **~$25-50/oy** |

---

## 10. Keyingi qadam

1. ✅ Planni tasdiqlash (yoki savol/o'zgartirishlar)
2. ✅ Supabase loyiha yaratish + baza sxemasi (0-bosqich)
3. ✅ Monorepo skeleti + mobil ilova + admin panel boshlash

---

## 11. Rezervatsiya modeli (2026-07-17 da qo'shildi)

WB/Ozon/Uzum kabi: mijoz **"Buyurtma berish"** bosgan zahoti tovar band qilinadi
(savatga qo'shilganda EMAS). Uch xil son yuritiladi:

| Son | Ma'nosi | Kim ko'radi |
|---|---|---|
| `qty` (fizik) | Omborda jismonan yotgan tovar | Admin |
| `reserved` (band) | Buyurtma berilgan, admin hali tasdiqlamagan | Admin |
| **mavjud** = qty − reserved | Sotuvga ochiq qism | **Mijozlar** |

Oqim: buyurtma → `reserved += n` (hammada mavjud son darhol kamayadi) →
admin tasdiqlasa `qty -= n, reserved -= n` + qarz yoziladi → bekor bo'lsa band yechiladi.
Hammasi atomik RPC ichida, qator qulflari bilan — poyga holati imkonsiz.

Kelajakda: "band muddati" (masalan, 48 soat ichida tasdiqlanmagan buyurtma
avtomatik bekor bo'lib band yechiladi) — pg_cron bilan qo'shiladi.

---

## 12. SaaS / Multi-tenant arxitektura (super-admin) — KEYINGI KATTA BOSQICH

Maqsad: bitta platformada **ko'plab zavod/do'konlar** (tenant), har biri o'z
katalogi, mijozlari, narxlari bilan. Siz — super-admin, ular — obunachi mijozlar.

### Chuqur tahlil — to'g'ri yo'l:

**1. Ma'lumot izolyatsiyasi: `org_id` + RLS (shared schema modeli)**
Har asosiy jadvalga `org_id uuid` qo'shiladi (`organizations` jadvali bilan).
RLS har so'rovga `org_id = current_org_id()` filtrini majburlaydi — bir tenant
ikkinchisining ma'lumotini BAZA darajasida ko'ra olmaydi. Bu Stripe, Shopify
va aksariyat SaaS'lar ishlatadigan model: arzon, boshqarish oson, 1000+ tenant'gacha
bemalol ko'taradi. (Har tenantga alohida baza — qimmat va operatsion og'ir; bu
faqat "enterprise" mijozlar uchun keyin qo'shilishi mumkin.)

**2. Rollar ierarxiyasi** (0005-migratsiyada boshlandi):
- `super_admin` — platforma egasi (siz): tenant yaratadi, obunani boshqaradi, statistika
- `admin` — tenant egasi (zavod direktori): o'z org'ining hamma narsasi
- `customer` — tenant'ning ulgurji mijozi
- Keyin: `manager` (faqat buyurtma), `warehouse` (faqat ombor) rollari

**3. Obuna (billing)**:
`organizations.subscription_status` + `plan` (free/basic/pro). To'lov O'zbekistonda:
Payme/Click Business API. Muddati o'tsa — org read-only rejimga tushadi (RLS bilan).

**4. Super-admin panel** (admin paneldagi alohida bo'lim, faqat super_admin ko'radi):
tenantlar ro'yxati, yaratish, bloklash, obuna holati, platforma statistikasi
(org'lar soni, jami buyurtmalar, MRR).

**5. Migratsiya yo'li** (hozirgi yakka-tenant → SaaS):
1. `organizations` jadvali + hozirgi ma'lumotlarga "birinchi org" biriktiriladi
2. Har jadvalga `org_id` (default = birinchi org) → hech narsa buzilmaydi
3. RLS'larga org filtri qo'shiladi
4. RPC'lar org-aware qilinadi
5. Super-admin UI

Bu bosqich ~1-1.5 hafta ish. Hozirgi sxema bunga TAYYOR qilib qurilgan
(UUID'lar, RLS, RPC pattern) — qayta yozish talab qilinmaydi.

### ✅ BAJARILDI (2026-07-22)

Migratsiyalar 0011-0014 orqali amalga oshirildi: `organizations` jadvali,
root jadvallarga (`profiles/customers/categories/products/price_groups`)
`org_id`, bola jadvallarga (`product_variants/prices/stock_*/orders/
order_items/payments/ledger_entries`) ota jadval orqali EXISTS-subquery RLS,
barcha biznes-RPC'larga qo'lda org tekshiruvi (RPC'lar SECURITY DEFINER
bo'lgani uchun RLS'ni chetlab o'tadi). Edge Function'lar (`admin-create-
customer`, `admin-update-customer`, `admin-create-staff`) org-aware qilindi;
yangi `super-admin-create-org` (yangi tenant + birinchi admin bir vaqtda) va
`super_admin_org_stats()` (faqat jamlangan sonlar — super_admin tenant
biznes-ma'lumotini to'g'ridan-to'g'ri ko'rmaydi) qo'shildi. Admin panelda
`SuperAdminPanel.tsx` — tenantlar ro'yxati/yaratish/holat almashtirish.

Mavjud yakka-tenant ma'lumot "Birinchi tenant" nomi bilan avtomatik
ko'chirildi. Alohida `super_admin` login yaratildi (kodchi/ da saqlangan).

**Sinovdan o'tkazilgan (haqiqiy loyihada, ikkinchi vaqtinchalik tenant bilan,
keyin to'liq tozalangan):** ikkinchi tenant mijozi birinchi tenant katalogini
ko'ra olmaydi; ikkinchi tenant admin birinchi tenant buyurtmasini tasdiqlash/
bekor qilish/holat o'zgartirishga urinsa RUXSAT_YOQ; to'g'ridan-to'g'ri jadval
so'rovlari ham boshqa tenant qatorlarini qaytarmaydi; `super_admin` ikkala
tenantni ro'yxatda ko'radi, lekin ularning mahsulot/mijoz jadvaliga
to'g'ridan-to'g'ri kirolmaydi (faqat jamlangan statistika).

**Bilingan V1 cheklovlar** (keyinroq, real ehtiyoj chiqsa hal qilinadi):
- `customers.phone` hali ham BUTUN PLATFORMADA yagona (mijoz login-emaili
  `{raqam}@mijoz.ilova` bo'lgani uchun) — bitta telefon raqam faqat bitta
  tenant'ga mijoz bo'la oladi. Hal qilish uchun login-emailga tenant
  diskriminatori qo'shish + mijoz "qaysi tenant" tanlash ekrani kerak bo'ladi.
- `product_variants.sku` ham hali BUTUN PLATFORMADA yagona (bola jadval —
  o'z `org_id`siga ega emas). Ikki tenant bir xil SKU ishlatmoqchi bo'lsa
  to'qnashishi mumkin.
- Billing (Payme/Click) yo'q — `organizations.subscription_status` hozircha
  faqat super-admin panelda qo'lda o'zgartiriladi.
