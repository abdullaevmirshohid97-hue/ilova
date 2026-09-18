# Kassa (Hisob daftari) yo'nalishi — texnik reja

> Sana: 2026-09-13. Asos: `PLAN.md` (b2b yadro) va mavjud platforma
> (`gnuddryjsmcrjchrbvyz`, 151 migratsiya, 23 chekka funksiya).
> Bu reja 13.09 dagi konsepsiya va "Cash Book / Credit Debit" ilovasining
> ekran rasmlari asosida tuzildi.

---

## Bajarilgan ish

| Sana | Nima qilindi |
|---|---|
| 2026-09-13 | `20260913000003_kassa_yonalish.sql` — `kassa` yo'nalishi + 4 jadval (`kassa_hisoblar`, `kassa_turkumlar`, `kassa_klientlar`, `kassa_yozuvlar`) + RLS + `o_raqam`/`versiya` triggeri + qoldiq funksiyalari. **Jonli bazaga qo'llandi.** |
| 2026-09-13 | `packages/kassa-yadro/` — `pul.ts` (tiyin, Intl'siz formatlash, kalkulyator), `raqam.ts` (o'zbekcha summa tahlili), `balans.ts` (qoldiq, yuruvchi qoldiq, kalendar), `turi.ts` |
| 2026-09-13 | Sinovlar: `kassa-raqam` (60+ tekshiruv), `kassa-balans` (JS + baza, rollback bilan), `tenant-ajratish` ga 4 jadval qo'shildi — hammasi yashil |
| 2026-09-13 | Panelda yo'nalish: «CREDIT DEBIT» (`apps/admin/src/lib/yonalishlar.ts`) |
| 2026-09-13 | `20260913000004_kassa_royxat.sql` — Play Market yo'li: `handle_new_user` ga `kassa` shoxi, `kassa_royxatdan_ot()` (tashkilot + admin profil + 2 hisob + 10 turkum), `kassa_men()`. **Jonli bazada sinovdan o'tdi**: tasdiqlangan hisob bilan to'liq oqim ishladi, ikkinchi tashkilot ochilmadi (`HISOB_BOR`), sinov ma'lumoti tozalandi |
| 2026-09-13 | `apps/kassa` — **Credit Debit** ilovasi (14.1: B varianti — alohida ilova). Kirish/ro'yxatdan o'tish, biznes ochish, hisoblar, kirim/chiqim, kalkulyatorli klaviatura, yig'indi paneli, yuruvchi qoldiq. Web eksport ishlaydi (751 KB) |
| 2026-09-13 | Grafika: `scripts/credit-debit-logo.mjs` — ikonka, adaptiv ikonka, splash, favicon, Play 512×512, banner 1024×500, gorizontal logo (kutubxonasiz, koddan) |
| 2026-09-13 | Sayt: `app.yukchibolla.com/kassa/` (Caddy `handle` bloki + `baseUrl`), b2b login sahifasida «APK yuklab olish» va «Brauzerda ochish» tugmalari, `deploy.sh` kassani ham yig'adi |
| 2026-09-13 | Imzo kaliti `kodchi/credit-debit.jks` (RSA 2048, 10 000 kun), EAS loyihasi `@amirxon.ai4020/credit-debit`, `apps/kassa/PLAY-QOLLANMA.md` |
| 2026-09-13 | **Offline qatlam**: mahalliy ombor (SQLite / IndexedDB / xotira), navbat, sinxronizatsiya dvigateli, `kassa_ozgarishlar` RPC, sinx holati belgisi. Sinovlar: `kassa-sinx` (soxta server, 27 tekshiruv) va `kassa-sinx-baza` (jonli baza, 21 tekshiruv) |
| 2026-09-13 | Hisobni o'chirish + maxfiylik/o'chirish veb sahifalari — Play sharti yopildi |
| 2026-09-13 | Excel va PDF eksport; hujjat dvigateli `packages/kassa-yadro/hujjat.ts` ga ko'chirildi (bot bilan umumiy) |
| 2026-09-13 | AI: MCP serveri (`kassa-mcp`, tokenlar + jurnal + kunlik chegara), mijozning o'z kaliti (BYOK: Claude / ChatGPT / Gemini), `kassa_ai_kalit` shifrlangan saqlash |
| 2026-09-13 | **Audit** (`PLAN-AUDIT.md`): ortiqcha, standart kamchiliklari, qaytish mantiqi va tartiblangan tuzatish ro‘yxati |
| 2026-09-18 | Audit 1-4: Android «orqaga» tugmasi, tegish maydonlari 48 dp, oxirgi turkum/hisob eslab qolinadi, «Takrorlash», tez summalar, ming ajratgich, «Bugun/Kecha». **Yozuv 4 tegishdan 2 ga tushdi** |
| 2026-09-18 | Audit 8, 11, 12: planshet/web uchun markazda 640 px ustun; hisobot endi valyutalarni aralashtirmaydi (avval 2 mln so‘m + 100 dollar = «2 000 100» chiqardi); `YanaEkrani` 771 → 123 qator + 4 ta ekran |
| 2026-09-18 | Audit 10: xato qalqoni (oq ekran o‘rniga o‘qiladigan ekran) va `kassa_xatolar` jadvali — telefondagi nosozlik endi bizga yetib keladi. **Jonli bazaga qo‘llandi** (18.09, Dashboard orqali; yozish yo‘li quruq sinovda tekshirildi — 1 qator, keyin qaytarildi) |
| 2026-09-18 | Audit 9: **rus tili** (`src/lib/til.ts`, 280+ matn, oy nomlari qaratqich kelishigi bilan). Sinov `kassa-til` kodni o'qib, tarjimasiz qolgan matnni topadi |
| 2026-09-18 | Audit 6: **kun yakuni** — kechqurun kassani sanash taklifi. Farq chiqsa «Kassa sanog'i» yozuvi bo'lib tushadi (yangi jadval yo'q, daftar qo'shib yozadigan bo'lib qoladi) |

**Ochiq qolgan (Play uchun shart):** ekran rasmlari va **email tasdiqlash**
(hozir Supabase pochtasi soatiga ~2 ta xat yuboradi — ommaviy ro'yxatdan
o'tishga yetmaydi). Hisobni o'chirish va huquqiy sahifalar — bajarildi.

**Qo‘llanmagan migratsiya yo‘q** — `20260913000011_kassa_xatolar.sql`
18.09 da Dashboard orqali qo‘llandi va `schema_migrations` ga yozildi.
Eslatma: Dashboard orqali qo‘llanganda versiya ro‘yxatga O‘ZI tushmaydi —
uni qo‘lda qo‘shish kerak, aks holda skript keyinroq qayta qo‘llashga
urinadi (zararsiz, lekin chalkashtiradi).

**Lekin Supabase boshqaruv tokeni (`sbp_v0_…`) hali 401 qaytaradi.**
U `kodchi/migratsiya-qollash.ps1` va `tests/kassa-balans.mjs` ning baza
qismida ishlatiladi — ikkalasi ham token yangilanmaguncha ishlamaydi
(sinovning mantiq qismidagi 12 ta tekshiruv o‘tadi). Tokenni loyihani
ochgan akkauntdan olish kerak.

---

## Ilovaning to'liq qamrovi (2026-09-13 da aniqlashtirildi)

Birinchi qurilgan versiya — **yadro**: hisoblar, kirim/chiqim, yig'indi
paneli. Foydalanuvchi to'g'ri aytdi: rejadagi qolgan hamma narsa yo'q
edi. Quyida — Credit Debit "tugadi" deyish uchun kerak bo'lgan ro'yxat.
Tartib ataylab: har bir qator o'zidan oldingisiz ma'nosiz.

### A. Qobiq va harakat (asos)

| Nima | Nega kerak |
|---|---|
| Pastki 5 ta bo'lim: Bosh · Yozuvlar · Kontaktlar · Kalendar · Yana | Hozir bitta ekran bor, qolganiga yo'l yo'q |
| Markazda katta **+** tugmasi | Yozuv kiritish — eng ko'p takrorlanadigan amal |
| Yorug'/tungi rejim, qurilma sozlamasiga ergashadi | Kechqurun daftar yuritiladi |
| Bo'sh holat, yuklanish, xato ekranlari | Bo'sh ilova "buzuq" ko'rinadi |

### B. Pul (yadro kengaytmasi)

| Nima | Holat |
|---|---|
| Yozuvni **tahrirlash** va bekor qilish | bekor qilish bor, tahrir yo'q |
| **Hisoblararo o'tkazma** (ikki yozuv, bitta `kochirma_id`) | baza tayyor, ekran yo'q |
| Hisob qo'shish / tahrirlash / yashirish | yo'q |
| Turkum qo'shish / tahrirlash | yo'q |
| Har qatorda yuruvchi qoldiq | bor |

### C. Qarz — mahsulotning nomi shundan («Credit Debit»)

| Nima |
|---|
| Mijoz / ta'minotchi ro'yxati, **Hammasi · Qarzi bor · Oldindan** filtri |
| Kontakt kartochkasi: tarix, qoldiq, «Berdim» / «Oldim» tugmalari |
| Umumiy qarz paneli: jami berilgan, jami olingan, farq |
| Telefon daftaridan kontakt olish (keyinroq) |

### D. Ko'rish va topish

| Nima |
|---|
| Yozuvlar ro'yxati: **Kunlik · Haftalik · Oylik · Hammasi** + sana o'qlari |
| Qidiruv (izoh, summa, kontakt) va filtr (hisob, turkum, tur) |
| **Kalendar**: har kunda kirim/chiqim, kun bosilsa o'sha kun yozuvlari |
| Bosh ekran: balans, oylik kirim/chiqim, oddiy grafik, oxirgi yozuvlar |

### E. Hisobot va hujjat

| Nima |
|---|
| Davr bo'yicha hisobot: turkum kesimi, hisob kesimi, kontakt kesimi |
| **PDF va Excel eksport** — `telegram-qarz/hujjat.ts` moduli qayta ishlatiladi |
| Zaxira: `.json` eksport (odam bulutga ishonmasa) |

### F. Sozlama va huquqiy

| Nima |
|---|
| Biznes nomi, valyuta, til (o'zbek/rus) |
| Tungi rejim tanlovi |
| **Hisobni o'chirish** — Play talabi |
| Chiqish, qurilmalar ro'yxati (sinx bilan birga) |

### G. Keyingi bosqichlar (o'zgarmadi)

Offline qatlam → robot (matn) → robot (ovoz) → desktop.

**UI/UX qarorlari menda** (foydalanuvchi ishonib topshirdi): tinch
palitra, uch bosishda yozuv, har ro'yxatda yig'indi, rangga qo'shimcha
ishora, `Intl` ishlatilmaydi.

---

## 0. Bir jumlada

**Yukchibolla platformasiga oltinchi yo'nalish — `kassa`: telefonda,
brauzerda va kompyuterda internetsiz ishlaydigan kirim-chiqim daftari,
hisoblar, mijoz qarzi va yozuvni gapirib kiritadigan robot. Play
Market'dan o'zi ro'yxatdan o'tgan foydalanuvchi — yangi tenant;
`app.yukchibolla.com` — o'sha ilovaning web ko'rinishi;
`4020.yukchibolla.com` — super admin hammasini ko'radi.**

Nol nuqtadan yangi tizim qurilmaydi. Tenant, RLS, auth, tarif, chekka
funksiya, deploy, Telegram bot — hammasi turibdi va ishlayapti. Yangi
qurilishi kerak bo'lgan narsa aslida **uchta**: kassa moduli, offline
qatlam va robot. Qolgani — ulash.

---

## 1. Rasmlardan nima olamiz

Yuborilgan ekranlar 2021-yilgi ilovaniki, dizayni eskirgan, lekin UX
mantiqi sinovdan o'tgan. Shuni ajratib olamiz:

| Ko'rgan narsa | Qaror | Sabab |
|---|---|---|
| Pastdagi doimiy **yig'indi paneli** (Total Cash In / Out / Balance) | **Olamiz** | Ilovaning butun qiymati shu uch raqamda. Har ro'yxatda ko'rinib tursin |
| Ikkita katta tugma **Cash In / Cash Out** | **Olamiz** | Yozuv 3 ta bosishda kiritiladi. Bu ilovaning yashash sharti |
| Summa maydonida **kalkulyator klaviaturasi** (`+ - * / =`) | **Olamiz** | Odam "1200+300" deb yozadi. Kichik detal, lekin odat shunday |
| Har qatorda **yuruvchi qoldiq** ("Balance -6,200") | **Olamiz, lekin hisoblab** | Saqlanmaydi — tartiblangan ro'yxatdan hisoblanadi (offlineda yozuvlar tartibsiz keladi) |
| **Opening Balance** qatori | **Olamiz** | Hisob ochilgandagi qoldiq — busiz birinchi kun noto'g'ri chiqadi |
| **Business** almashtirgich (pastki oyna + "Add Business") | **Bor** | Bizda bu `organizations` + `uzvliklar`. Yangi jadval kerak emas |
| **Accounts** almashtirgich (qidiruv bilan) | **Olamiz** | Yangi `kassa_hisoblar` jadvali |
| Kontakt ro'yxati: avatar, "Customer/Supplier", rangli qoldiq, **All/Due/Advance** filtri | **Olamiz** | Bu — `qarz_clients` mantiqining aynan o'zi |
| **Kalendar**: har kunda kirim/chiqim raqami | **Olamiz** | Oylik manzarani bitta ekranda beradi |
| **Daily / Weekly / Monthly / All** + sana o'qlari | **Olamiz** | Hamma hisobotning asosi shu davr tanlagichi |
| **PDF / Excel eksport** | **Olamiz** | Kod bor: `supabase/functions/telegram-qarz/hujjat.ts` kutubxonasiz XLSX+PDF yasaydi |
| **Delete Account** (ilova ichida) | **Majburiy** | Google Play talabi, busiz ilova qabul qilinmaydi |
| Google Drive backup | **O'zgartiramiz** | Bizda bulut sinxronizatsiya bor. O'rniga `.xlsx`/`.json` eksport (odam bulutga ishonmasa) |
| Light / Dark | **Olamiz** | `apps/mobile/src/lib/theme.ts` bor |
| Ko'k-qizil-yashil baland ranglar | **Olmaymiz** | Ko'z charchaydi; tanlangan yo'nalish — tinchroq palitra |
| Biznes vizitkasi ulashish | **Tashlaymiz** | Moliyaga aloqasi yo'q, ekran band qiladi |
| Reklama bloklari | **Tashlaymiz** | Bizniki tarifli, reklamasiz |

---

## 2. Sizning rejangiz — nima qoladi, nimani o'zgartiramiz

Reja umuman to'g'ri o'ylangan: offline-first, ledger, tool-based AI,
tasdiqsiz yozmaslik — bularning hammasi to'g'ri va o'z holicha qoladi.
O'zgartirish kerak bo'lgan joy — **texnologiya tanlovi**: reja bo'sh
maydonga yozilgan, maydon esa bo'sh emas.

| Mavzu | Sizning rejangizda | Tavsiya | Sabab |
|---|---|---|---|
| Backend | Node.js + Express/Fastify + Redis + Docker + Nginx | **Supabase (mavjud)** + chekka funksiya | `PLAN.md` 2-bo'limida bu savol allaqachon hal qilingan. Ikkinchi backend = ikkinchi xavfsizlik modeli, ikkinchi deploy, ikkinchi log. RLS bu yerda uch marta teshilib, uch marta yopilgan — uni qayta yozish xavfli |
| Veb-server | Nginx | **Caddy** | VPS'da Caddy turibdi (Clary + Luxury + Ilova bitta faylda). Nginx qo'shilsa 443-port urishadi |
| Redis | keshlash | **Kerak emas** | Yuk yo'q. Kerak bo'lsa Postgres materialized view yetadi |
| Monorepo | yangi `finance-app/` | **Mavjud monorepo** | `apps/`, `supabase/`, `infra/` allaqachon shunday (pnpm workspace, `node-linker=hoisted`) |
| Web | alohida React ilova | **Expo web eksporti** | `app.yukchibolla.com` hozir aynan `apps/mobile` ning web eksporti. Ikkinchi UI = ikki barobar ish va ikki barobar xato |
| Desktop | Electron `.exe` (2-bosqich) | **PWA, keyin Tauri** (8-bosqich) | Electron: imzolash, avtoyangilanish, 150 MB build. PWA o'rnatiladi va offline ishlaydi — bir xil kod. Haqiqiy `.exe` kerak bo'lganda Tauri bilan o'raladi |
| iOS | 2-bosqichda | **Keyinga** | $99/yil + ko'rib chiqish. Avval Android'da odam yig'ilsin |
| Offline DB | SQLite + IndexedDB + SQLite (3 ta) | **Bitta interfeys, ikkita adapter** | Modulga 6-8 ta so'rov kerak, uchta implementatsiya ortiqcha |
| Invoice / Inventory / OCR | 4-bosqich | **Takrorlamaymiz** | `dori_invoices`, `stock_movements`, `pos_sotuvlar` bor. Kassa ularga *havola* qiladi |
| AI tool-based arxitektura | to'g'ri | **Olamiz** | Faqat: tool'lar **foydalanuvchi JWT'si bilan** ishlasin (8-bo'lim) |
| Tasdiqsiz yozmaslik | to'g'ri | **Olamiz** | `CLAUDE.md` 1-qoidasi bilan bir xil |
| SaaS / tarif / rol (5-bosqich) | oxirida | **Qisman bor** | `organizations`, `uzvliklar`, `subscription_status`, super admin paneli turibdi |

**Bir jumlada:** rejaning mahsulot qismi to'g'ri, texnologiya qismi esa
6-8 oylik ortiqcha ish. Supabase ustida bu **3,5-4 oy**.

---

## 3. Arxitektura

```
   Android (Expo)        Web (Expo eksport)       Windows (PWA/Tauri)
        │                        │                        │
        └────────────────┬───────┴────────────────────────┘
                         │
              packages/kassa-yadro        ← biznes mantiq, BIR MARTA yoziladi
                         │
              ┌──────────┴──────────┐
              │   Mahalliy ombor    │   expo-sqlite  |  IndexedDB (web)
              │   + navbat (outbox) │
              └──────────┬──────────┘
                         │  internet paydo bo'lganda
                 kassa-sync (chekka funksiya)
                         │
        ┌────────────────┴────────────────┐
        │  Supabase Postgres + RLS        │  ← organizations / profiles
        │  kassa_* jadvallar              │     mavjud tenant modeli
        └─────────────────────────────────┘
                         │
              kassa-robot (chekka funksiya) → AI, foydalanuvchi JWT'si bilan
```

### Yadro qaror: hamma narsa — jurnal (append-only)

Bu loyihada `ledger_entries` va `qarz_transactions` allaqachon shunday
ishlaydi va aynan shu narsa **offline'ni oson qiladi**:

- Qoldiq saqlanmaydi → ikki qurilma qoldiqni bir-birining ustiga yoza
  olmaydi. Qoldiq = yozuvlar yig'indisi, kelish tartibi muhim emas.
- O'chirish yo'q → bekor qilish yangi yozuv bilan. Ikki qurilma bitta
  yozuvni bekor qilsa ham ziddiyat chiqmaydi.
- `id` **qurilmada** yaratiladi (uuid) → serverga ikki marta yuborilsa
  `on conflict (id) do nothing` ishlaydi, dubl bo'lmaydi.

Shuning uchun ziddiyat faqat bitta holatda qoladi: **bir yozuvni ikki
qurilmada tahrirlash**. U `versiya` raqami bilan yopiladi (5.3).

---

## 4. Baza sxemasi

Nomlar loyiha uslubida — o'zbekcha, prefiks `kassa_`.

```sql
kassa_hisoblar          -- "Accounts": Naqd, Bank, Karta, Uy, Ofis
  id uuid pk            -- qurilmada yaratiladi
  org_id uuid           -- tenant (RLS shu bo'yicha)
  nom text
  turi text             -- naqd | bank | karta | boshqa
  valyuta text          -- UZS | USD | EUR | RUB
  boshlangich numeric(18,2)   -- Opening Balance
  rang text, belgi text       -- ikonka/rang
  faol boolean
  tartib int

kassa_turkumlar         -- "Categories": Oziq-ovqat, Ish haqi, Transport
  id, org_id, nom, turi ('kirim'|'chiqim'), ota_id (daraxt), rang, faol

kassa_yozuvlar          -- ASOSIY JURNAL. O'chirilmaydi
  id uuid pk
  org_id uuid
  hisob_id uuid         -- qaysi hisobdan
  turi text             -- kirim | chiqim
  summa numeric(18,2)   -- HAR DOIM musbat; yo'nalishni `turi` beradi
  valyuta text
  kurs numeric(18,6)    -- yozuv paytidagi kurs (UZS ga)
  turkum_id uuid
  klient_id uuid        -- ixtiyoriy: mijoz/ta'minotchi
  izoh text
  sana timestamptz      -- FOYDALANUVCHI qo'ygan sana (kechagi ham bo'ladi)
  tolov_usuli text      -- naqd | karta | otkazma
  kochirma_id uuid      -- hisoblararo o'tkazma juftligi
  bekor_at timestamptz  -- bekor qilingan bo'lsa (o'chirish o'rniga)
  bekor_sabab text
  versiya int not null default 1      -- tahrir ziddiyati uchun
  qurilma_id text                     -- qaysi qurilma yozgan
  o_raqam bigint                      -- SERVER navbat raqami (sinx kursori)
  created_at, updated_at timestamptz

kassa_klientlar         -- "Customer / Supplier"
  id, org_id, ism, telefon, turi ('mijoz'|'taminotchi'), rasm_yol,
  izoh, faol, versiya, o_raqam

kassa_ilovalar          -- chek rasmi / fayl
  id, org_id, yozuv_id, yol text, turi, hajm, yuklandi boolean

kassa_qurilmalar        -- qurilmalar va ularning oxirgi kursori
  id, org_id, user_id, nom, platforma, oxirgi_kursor bigint, oxirgi_sinx timestamptz
```

### Uchta qat'iy qoida

1. **Summa hech qachon `float` emas.** Bazada `numeric(18,2)`, JS
   tomonida **tiyin (butun son)**. Sabab: bu loyihada bir marta RPC
   o'zgaruvchisi kasrni kesib tashlagan — funksiya o'zgartirilganda
   `pg_get_functiondef` bilan tekshiriladi, migratsiya fayliga ishonib
   bo'lmaydi.
2. **Valyutalar qo'shilmaydi.** Har hisobning valyutasi bor, umumiy
   balans valyuta bo'yicha alohida chiqadi. Aralashtirish kerak bo'lsa —
   ekranda kurs ochiq ko'rsatiladi (`tests/valyuta.mjs` uslubi).
3. **`o_raqam`** — trigger bilan qo'yiladigan monoton server raqami.
   Sinxronizatsiya kursori vaqt bo'yicha emas, aynan shu raqam bo'yicha
   ketadi (sabab 5.2).

---

## 5. Offline sinxronizatsiya — eng qiyin qism

Bu loyihada offline qatlam **umuman yo'q** (`apps/mobile` faqat
AsyncStorage ishlatadi). Ya'ni nolga yaqin joydan quriladigan yagona
katta bo'lak shu. Shuning uchun eng batafsil qism ham shu.

### 5.1. Yozish yo'li

```
Foydalanuvchi "Saqla" bosadi
   ↓
uuid yaratiladi (qurilmada)
   ↓
mahalliy bazaga yoziladi  →  EKRAN DARHOL YANGILANADI
   ↓
navbatga qo'shiladi (outbox)
   ↓
internet bor ekan → kassa-sync ga paket yuboriladi
   ↓
server javobi: har amal uchun  ok | ziddiyat | rad
   ↓
ok bo'lsa navbatdan o'chadi, yozuv "sinxron" belgisini oladi
```

Navbat jadvali (mahalliy): `amal_id, tur (insert|update|bekor), jadval,
payload json, urinish int, oxirgi_xato text, yaratilgan`.

Urinish soni ortganda kechikish oshadi (1s, 5s, 30s, 2m, 10m). 10 ta
urinishdan keyin foydalanuvchiga ko'rsatiladi — **jimgina yo'qolmaydi**.

### 5.2. O'qish yo'li — kursor nega vaqt bo'yicha bo'lmaydi

Odatiy xato: `where updated_at > oxirgi_sinx`. Ikki sabab bilan yozuv
yo'qoladi:

- bir millisekundda ikki qator yangilansa, ikkinchisi tushib qoladi;
- telefon soati serverdan farq qiladi (qurilma soati qo'lda
  o'zgartiriladi, vaqt mintaqasi almashadi).

Shuning uchun har qatorda **server navbat raqami** `o_raqam` turadi
(trigger `nextval` bilan qo'yadi). Mijoz `oxirgi_kursor` ni saqlaydi va
`kassa_ozgarishlar(p_kursor bigint)` chaqiradi. Yozuv yo'qolishi
imkonsiz bo'ladi.

### 5.3. Ziddiyat

| Holat | Yechim |
|---|---|
| Bir yozuv ikki qurilmada **yaratildi** | Bo'lmaydi — uuid qurilmada, `on conflict do nothing` |
| Bir yozuv ikki marta **yuborildi** (tarmoq uzildi) | Idempotent: `on conflict (id) do nothing` |
| Bir yozuv ikki qurilmada **tahrirlandi** | `versiya` mos kelmasa server **rad etadi**; ekranda "Bu yozuv boshqa qurilmada o'zgargan" + ikkala variant, odam tanlaydi |
| Yozuv **bekor** qilindi, keyin tahrirlandi | Bekor ustun — tahrir rad etiladi |
| Hisob o'chirildi, unga yozuv keldi | Hisob o'chmaydi, `faol=false` bo'ladi — yozuv baribir tushadi |

**Pulda jimgina "last-write-wins" qilinmaydi.** Yo'qolgan pul —
yo'qolgan ishonch.

### 5.4. Mahalliy ombor

```
packages/kassa-yadro/ombor/
  turi.ts        — interfeys: ochish, yoz, oqi, navbat, tozala
  sqlite.ts      — expo-sqlite (Android/iOS/Tauri)
  indexeddb.ts   — brauzer (Expo web eksporti)
```

Kerak bo'ladigan so'rovlar soni oz (davr bo'yicha yozuvlar, hisob
bo'yicha qoldiq, klient bo'yicha qoldiq, qidiruv, navbat) — shuning
uchun ikki adapterni qo'lda yozish ~300 qator. Muqobil: **PowerSync**
(Supabase bilan ishlaydigan tayyor sinxronizatsiya) — 2-3 haftani
tejaydi, lekin tashqi xizmat va oylik to'lov qo'shadi (narxini alohida
tekshirish kerak). Qaror — 14.2.

### 5.5. Fayllar (chek rasmi)

Rasm mahalliy saqlanadi, internet kelganda **alohida navbat** bilan
Storage'ga chiqadi. Bucket **yopiq**, imzolangan havola bilan
ko'rsatiladi — ochiq bucket bu loyihada bir marta mijoz suratini
internetga chiqarib qo'ygan.

---

## 6. Ro'yxatdan o'tish (Play Market → yangi tenant)

Hozir tizimda **o'z-o'zidan ro'yxatdan o'tish yo'q**: hisobni super
admin yoki tenant admini yaratadi (`super-admin-create-org`). Kassa uchun
bu o'zgaradi va bu — xavfsizlik nuqtasi.

```
Ilova → "Ro'yxatdan o'tish"
   ↓  email + parol  (Supabase Auth signUp + email tasdiqlash + captcha)
   ↓
kassa_royxatdan_ot()  — RPC, authenticated chaqiradi
   ↓
tekshiradi:  profiles da qator BORMI?  bor bo'lsa → RAD
   ↓
yaratadi:  organizations (yonalishlar = ['kassa'], subscription 'trial')
           profiles (role='admin', org_id)
           kassa_hisoblar: "Naqd"  + standart turkumlar
   ↓
ilova ochiladi
```

Diqqat qilinadigan joylar:

- Loyihada `ALTER DEFAULT PRIVILEGES` turibdi — yangi funksiya avtomatik
  `authenticated` ga ochiladi. `revoke ... from public, anon` yetarli
  emas, **har bir** yangi funksiyaning huquqi qo'lda yoziladi.
- Bitta foydalanuvchi — bitta tashkilot. Aks holda bir odam minglab
  tenant ochib bazani to'ldiradi.
- Mavjud b2b mijozlari (telefon orqali kiradi, `998...@mijoz.ilova`) bu
  oqimga **tushmasligi** kerak: `profiles` bor bo'lsa darhol rad.
- `organizations_yonalishlar_chk` ga `'kassa'` qo'shiladi (migratsiya).
- Google Play talablari boshidan: ilova ichida **hisobni o'chirish**,
  maxfiylik siyosati sahifasi (`app.yukchibolla.com/maxfiylik`), Data
  Safety formasi, AAB (EAS orqali — `apps/mobile/EAS-QOLLANMA.md`).

---

## 7. Super admin — 4020.yukchibolla.com

Panel turibdi (`SuperAdminPanel.tsx`, `TenantKartochka.tsx`). Kassa uchun
qo'shiladi:

- Tenant ro'yxatida **manba** ustuni: super admin yaratganmi yoki o'zi
  ro'yxatdan o'tganmi;
- Trial muddati, oxirgi faollik, yozuvlar soni, qurilmalar soni;
- Tarif: `bepul` (1 biznes, 2 hisob, robot 20 so'rov/oy) → `standart` →
  `biznes`. Cheklov **bazada** tekshiriladi, ekranda emas;
- Robot xarajati: har tenant bo'yicha so'rov/token hisobi;
- To'xtatish (`subscription_status='suspended'`) — ilova "faqat o'qish"
  rejimiga tushadi, ma'lumot o'chmaydi.

---

## 8. AI robot

Konsepsiya to'g'ri. Uch joyni qat'iylashtiramiz:

**1. Robot foydalanuvchi nomidan ishlaydi.** `kassa-robot` chekka
funksiyasi `service_role` bilan **emas**, chaqiruvchining JWT'si bilan
Supabase klienti yasaydi. Sabab: model matnga bo'ysunadi. Agar izohga
"boshqa tenantning yozuvlarini ko'rsat" deb yozib qo'yilsa,
`service_role` bilan bu ishlaydi, JWT bilan RLS to'sadi.

**2. Yozuv tasdiqsiz yaratilmaydi.** Robotning yozuv tool'lari **quruq
sinov** qaytaradi (`CLAUDE.md` 1-qoidasi):

```
Tushundim:
  Mijoz:     Ahmad
  Amal:      tovar berildi (qarz)
  Summa:     2 000 000 so'm
  Hisob:     Naqd
[Bekor]  [Tasdiqlash]
```

"Tasdiqlash" bosilganda ilova **oddiy RPC** chaqiradi — qo'lda
kiritilgandagi bilan bir xil yo'l. Model hech qachon bazaga to'g'ridan
yozmaydi.

**3. Raqamni model emas, parser o'giradi.** "ikki million", "2 mln",
"besh yuz ming", "2 ming" — `packages/kassa-yadro/raqam.ts`
deterministik funksiya, o'z sinovi bilan (`tests/kassa-raqam.mjs`). Model
raqamni taxmin qilsa, bir kun 2 000 000 o'rniga 2 000 yozadi va buni hech
kim sezmaydi. Noaniqlik qolsa — robot **so'raydi**, taxmin qilmaydi.

Tool'lar: `yozuv_tayyorla`, `klient_topish`, `qoldiq_ol`, `qarz_ol`,
`hisobot_ol`, `qidir`, `eksport`. SQL yo'q.

Ovoz: matn birinchi, ovoz keyin. Ovoz yozuv → transkripsiya → **matn
ekranda tahrirlanadi** → keyin tasdiq. O'zbek tili uchun transkripsiya
sifati dialektga qarab o'zgaradi, shuning uchun matnni ko'rsatmasdan
yozish mumkin emas.

Robot internetsiz ishlamaydi — offlineda tugma o'chadi va sabab yoziladi
("Robot internet talab qiladi, yozuvni qo'lda kiriting").

---

## 9. Hisobot va eksport

Yangi kutubxona kerak emas. `supabase/functions/telegram-qarz/hujjat.ts`
da kutubxonasiz XLSX va PDF yasash allaqachon yozilgan, `tests/qarz-fayl.mjs`
esa faylni **qayta ochib** tekshiradi. Kassa hujjatlari shu moduldan
foydalanadi.

Hisobotlar: kunlik / haftalik / oylik / yillik; hisob kesimida, turkum
kesimida, klient kesimida; foyda-zarar; pul oqimi. Hammasi bitta davr
tanlagichi va bitta eksport tugmasidan.

Diqqat: PDF'da standart Helvetica kirillni bilmaydi — mavjud kod matnni
lotinga o'giradi. Excel'da bunday cheklov yo'q.

---

## 10. Dizayn qoidalari

- Palitra **tinch**: baland ko'k/qizil/yashil emas. Kirim va chiqim farqi
  faqat rang bilan emas, **ishora + rang** bilan beriladi (rangni
  ajratmaydigan odam ham o'qiydi).
- `Intl` ishlatilmaydi — Telegram WebView'da u ikki marta oq ekran
  bergan. Formatlash qo'lda (`lib/valyuta.ts` uslubi), kasr unutilmaydi.
- Bir kod uch o'lchamga: telefon (< 768), planshet (768-1199), desktop
  (≥ 1200). `lib/responsive.ts` bor.
- Yozuv kiritish **3 ta bosish**: tugma → summa → saqla. Turkum, hisob,
  sana oldingi tanlovdan avtomatik to'ladi.
- Har ro'yxat tagida yig'indi paneli (rasmlardagidek).
- Sinxronizatsiya holati doim ko'rinadi: sinxron / navbatda / internet
  yo'q / ziddiyat.

---

## 11. Bosqichlar

Baholar — bitta ishlab chiquvchi + AI yordami bilan.

| # | Bosqich | Natija | Muddat |
|---|---|---|---|
| **0** | Qarorlar + skelet | 14-bo'limdagi javoblar, `kassa` yo'nalishi migratsiyasi, `packages/kassa-yadro` skeleti | 1 hafta |
| **1** | Kassa yadrosi (onlayn) | Hisoblar, kirim/chiqim, turkum, o'tkazma, ro'yxat, kalendar, yig'indi paneli. Mobil + web bitta kod | 2-3 hafta |
| **2** | **Offline qatlam** | Mahalliy ombor, navbat, `kassa-sync`, kursor, ziddiyat oynasi, holat belgilari | 3 hafta |
| **3** | Klient va qarz | Mijoz/ta'minotchi, qarz qoldig'i, All/Due/Advance, to'lov, sverka | 1,5 hafta |
| **4** | Hisobot + eksport | Davrlar, kesimlar, PDF/Excel (mavjud moduldan) | 1,5 hafta |
| **5** | Ro'yxatdan o'tish + Play Market | Self-signup, tarif cheklovlari, hisobni o'chirish, maxfiylik sahifasi, AAB, super admin ustunlari | 2 hafta |
| **6** | Robot — matn | `kassa-robot`, tool'lar, raqam parseri, tasdiq oynasi, limit | 2 hafta |
| **7** | Robot — ovoz | Yozib olish, transkripsiya, tahrir, tasdiq | 1-2 hafta |
| **8** | Desktop (ixtiyoriy) | PWA o'rnatilsin; kerak bo'lsa Tauri `.exe` | 1 hafta |

**Jami: ~3,5-4 oy.** Rejangizdagi besh bosqich o'z holicha qurilsa 8-12
oy bo'lardi — farq asosan backend'ni qayta yozmaslikdan chiqadi.

Har bosqich oxirida **tirik ilova** bo'ladi: 1-bosqichdan keyin telefonda
pul yozib yurish mumkin, 2-bosqichdan keyin internetsiz ham.

---

## 12. Sinovlar

Loyiha uslubi: `node tests/<nom>.mjs`, jonli bazaga tegsa — oxirida aynan
tiklab qo'yadi.

| Fayl | Nimani ushlaydi |
|---|---|
| `tests/kassa-tenant.mjs` | Boshqa tenantning yozuvi ko'rinmasligi (view'da `security_invoker`, `is_admin() and org_id`) |
| `tests/kassa-sinx.mjs` | Kursor yo'qotmasligi, takror yuborish dubl bermasligi, ziddiyat rad etilishi |
| `tests/kassa-balans.mjs` | Qoldiq = yozuvlar yig'indisi; bekor qilingan yozuv hisobga kirmasligi; kasr kesilmasligi |
| `tests/kassa-valyuta.mjs` | Valyutalar qo'shilib ketmasligi, kurs saqlanishi |
| `tests/kassa-raqam.mjs` | "ikki million" → 2000000; noaniq holatda savol berilishi |
| `tests/kassa-royxat.mjs` | Ikkinchi tenant ochib bo'lmasligi, mavjud mijoz o'tmasligi |
| `tests/kassa-hujjat.mjs` | XLSX qayta ochilishi, PDF `xref` to'g'riligi |
| `tests/kassa-robot.mjs` | Tool'lar boshqa tenantga o'tolmasligi, tasdiqsiz yozmasligi |

---

## 13. Xavflar

| Xavf | Ehtimol | Yechim |
|---|---|---|
| Offline sinxronizatsiya rejadan uzoq cho'ziladi | **Yuqori** | 2-bosqichda faqat `kassa_yozuvlar` sinxronlanadi; klient va turkum keyingi qadamda |
| Mavjud b2b ilovasiga kassa qo'shilib bundle og'irlashadi | O'rta | Modul `yonalishlar` bo'yicha lazy yuklanadi. O'lchanadi, taxmin qilinmaydi |
| Self-signup orqali spam tenantlar | O'rta | Email tasdiqlash + captcha + bitta user = bitta org + super adminda tozalash |
| Robot noto'g'ri summa yozadi | **Zarari yuqori** | Tasdiqsiz yozuv yo'q + raqam parseri + audit jurnali |
| Play Market rad etadi | O'rta | Hisobni o'chirish, maxfiylik siyosati, Data Safety — 5-bosqichda, oxirida emas |
| Ikki mahsulot bitta ilovada chalkashadi | O'rta | Kirishdan keyin yo'nalish bo'yicha ochiladi; 14.1 dagi qaror |
| `service_role` bilan yozilgan funksiya tenantni teshadi | O'rta | Har bir yangi SECURITY DEFINER funksiya `tests/kassa-tenant.mjs` ga qo'shiladi |

---

## 14. Sizdan kutiladigan qarorlar

Kod yozishdan oldin to'rtta javob kerak.

**14.1. Bitta ilovami yoki ikkita?**
- **A (tavsiya):** `apps/mobile` ichida modul. Bitta APK, bitta web manzil
  (`app.yukchibolla.com`), bitta deploy. Kirgandan keyin ilova
  `yonalishlar` ga qarab kassani yoki b2b katalogni ochadi.
- **B:** alohida `apps/kassa` + alohida APK + alohida subdomen. Toza
  ajralish, lekin ikki build, ikki do'kon sahifasi, ikki deploy.

**14.2. Offline: qo'lda yozamizmi yoki PowerSync?**
Qo'lda — 2-3 hafta ko'proq, lekin tashqi xizmatsiz va oylik to'lovsiz,
hammasi o'z qo'limizda. PowerSync — tezroq, lekin qaramlik.

**14.3. Nomi va Play Market hisobi.**
Ilova nomi qanday bo'ladi ("Yukchibolla Kassa" yoki alohida brend)?
Google Play Developer hisobi ochilganmi ($25, bir martalik)?

**14.4. Valyuta va til.**
Faqat UZS + USD yetarlimi? Ilova tili: o'zbek + rus + ingliz
(`i18n.tsx` bor)?

---

## 15. Birinchi qadam (javoblar kelgach, o'sha kuni)

1. `20260914000001_kassa_yonalish.sql` — `organizations_yonalishlar_chk`
   ga `'kassa'`, `kassa_hisoblar`, `kassa_turkumlar`, `kassa_yozuvlar`,
   RLS siyosatlari, `o_raqam` triggeri.
2. `packages/kassa-yadro/` — tiplar, `raqam.ts`, `balans.ts`, ombor
   interfeysi.
3. `tests/kassa-tenant.mjs` va `tests/kassa-balans.mjs` — jadval
   qo'shilishi bilanoq, keyinga qoldirilmaydi.
4. Mobil: `KassaScreen` — hisoblar ro'yxati + Kirim/Chiqim tugmasi +
   yig'indi paneli (onlayn ishlaydi, offline 2-bosqichda ulanadi).
