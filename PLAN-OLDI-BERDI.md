# Oldi-berdi: Credit Debit'ni qayta qurish rejasi

> Sana: 2026-09-20. Asos: foydalanuvchining 20.09 dagi konsepsiyasi.
> Hozirgi holat: `PLAN-KASSA.md`, audit: `PLAN-AUDIT.md`.

---

## 0. Bir jumlada

**Ilova «kirim-chiqim daftari»dan «oldi-berdi daftari»ga o'tadi: markazda
hisob emas, HAMKOR turadi; yozuv emas, BITIM turadi; va har bitim
Telegram orqali ikki tomon tasdig'idan o'tishi mumkin.**

Bu qo'shimcha funksiya emas — o'zakning almashuvi. Shuning uchun reja
nimani olib tashlashdan boshlanadi, nimani qo'shishdan emas.

---

## 1. Nega bu to'g'ri burilish

Hozirgi ilova savolga javob beradi: **«bu oy qancha sarfladim?»**

Konsepsiyadagi ilova boshqa savolga javob beradi: **«Tonirok menga
qancha qarzdor va u buni tan oladimi?»**

Ikkinchisi kuchliroq, chunki:

- birinchi savolga Excel ham javob beradi, ikkinchisiga yo'q;
- pul yo'qotish qo'rquvi xarajatni bilish istagidan kuchli
  (auditda ham shu chiqqan edi: qarz eslatmasi — eng kuchli qaytish sababi);
- **tasdiqlash** — raqobatchilarda yo'q narsa. «Men bermadim» degan
  bahsni oldindan yopadi.

---

## 2. Bitta raqam to'g'rilanishi kerak

Konsepsiyada:

> 1 200 dona × $0.10 = $24 000

Aslida **1 200 × 0.10 = $120**. Siz buni o'zingiz ham sezgansiz.

Buning rejaga ta'siri bor: ilova **miqdor × narx** ni o'zi hisoblab,
jamini KATTA qilib ko'rsatishi shart, va odam uni saqlashdan oldin
ko'rishi kerak. Aks holda bir nol xatosi qarz bo'lib qoladi va oylar
o'tib chiqadi.

Shu bilan birga **jamini qo'lda kiritish** ham ochiq qoladi: bozorda
ko'pincha «karobkasi 100 mingdan, jami 12 million» deb kelishiladi,
donasini sanab o'tirmaydi. Ya'ni uch maydondan **ikkitasi** to'ldirilsa,
uchinchisi o'zi chiqadi.

---

## 3. Hozirgi holat va kerakli holat

| Konsepsiyada bor | Bazada bor? | Ilovada bor? |
|---|---|---|
| Hamkor (kontakt) | `kassa_klientlar` — ism, telefon, turi | Kontaktlar ekrani |
| Hamkor profili: Telegram, kompaniya, STIR, manzil | **yo'q** | **yo'q** |
| Pul harakati | `kassa_yozuvlar` (kirim/chiqim) | bor |
| **Bitim** (tovar + miqdor + narx + muddat + holat) | **yo'q** | **yo'q** |
| Tovar nomi, o'lchov birligi, miqdor, narx | **yo'q** | **yo'q** |
| Qisman to'lov va qoldiq | qisman: klient qoldig'i yig'indi bo'yicha | **bitim bo'yicha yo'q** |
| Bitim holati (kutilmoqda / tasdiqlangan / yopilgan) | **yo'q** | **yo'q** |
| Telegram tasdiqlash | infratuzilma bor (`telegram-qarz`) | **yo'q** |
| Dashboard: menga qarzdor / men qarzdorman | hisoblanadi | bosh ekranda bor |

Ya'ni **hamkor va pul bor, BITIM yo'q**. Qurilishi kerak bo'lgan asosiy
narsa shu.

---

## 4. Asosiy qaror: bitim daftarning USTIDA turadi

Ikki yo'l bor edi:

**A. `kassa_yozuvlar` ni kengaytirish** — unga tovar, miqdor, narx,
holat ustunlarini qo'shish.

**B. Alohida `kassa_bitimlar` jadvali** — bitim biznes obyekti bo'ladi,
pul harakati esa avvalgidek daftarga tushadi.

**B tanlanadi.** Sabab:

- Bitimning **hayoti** bor: yaratildi → tasdiqlandi → qisman to'landi →
  yopildi. Daftar yozuvining hayoti yo'q, u faqat bo'lib o'tgan fakt.
- Daftar **qo'shib yoziladigan** (append-only) bo'lib qolishi kerak —
  loyihaning asosiy qoidasi. Bitim holati esa o'zgaradi. Ikkisini bir
  jadvalga qo'yish o'sha qoidani buzadi.
- Bitta bitimdan **bir nechta** yozuv chiqadi (tovar berildi, keyin
  uch marta qisman to'lov). Bir qatorga sig'maydi.

Demak: **bitim — sabab, yozuv — oqibat.** Qoldiq har doim yozuvlardan
hisoblanaveradi, bu o'zgarmaydi.

---

## 5. Ma'lumot modeli

### 5.1. Hamkor profili kengayadi

`kassa_klientlar` ga qo'shiladi:

| Ustun | Nima uchun |
|---|---|
| `telegram_id bigint` | tasdiqlash uchun — birinchi tasdiqda bog'lanadi |
| `telegram_nom text` | ekranda ko'rsatish uchun |
| `kompaniya text` | hujjatda kerak |
| `stir text` | ixtiyoriy, faktura uchun |
| `manzil text` | ixtiyoriy |
| `valyuta text` | shu hamkor bilan qaysi valyutada ishlanadi |

`turi` ham kengayadi: `mijoz | taminotchi | hamkor`. Konsepsiyadagi
«Business Partner» — ikkalasi ham bo'lishi mumkin bo'lgan uchinchi tur.

### 5.2. Yangi: `kassa_bitimlar`

| Ustun | Izoh |
|---|---|
| `klient_id` | kim bilan — **majburiy**, bitim hamkorsiz bo'lmaydi |
| `yonalish` | `oldim` \| `berdim` |
| `nima` | `tovar` \| `pul` |
| `tovar_nom`, `birlik`, `miqdor`, `narx` | tovar bo'lsa |
| `summa`, `valyuta`, `kurs` | jami — miqdor × narx yoki qo'lda |
| `muddat date` | qachongacha — eslatma shunga tayanadi |
| `izoh`, `sana` | |
| `holat` | `kutilmoqda` \| `tasdiqlangan` \| `rad` \| `yopilgan` \| `bekor` |
| `tasdiq_at`, `tasdiq_kim` | kim va qachon tasdiqladi |
| `tasdiq_token` | Telegram havolasi uchun bir martalik kalit |

**`summa` har doim musbat**, yo'nalishni `yonalish` beradi — daftardagi
bilan bir xil qoida (sababi `kassa_yozuvlar` izohida yozilgan).

### 5.3. Yangi: `kassa_bitim_tolovlar`

| Ustun | Izoh |
|---|---|
| `bitim_id` | qaysi bitimga |
| `summa`, `valyuta` | qancha |
| `usuli` | `naqd` \| `karta` \| `bank` \| `tovar` |
| `yozuv_id` | daftardagi qaysi yozuvni yaratdi |
| `holat`, `tasdiq_at` | to'lov ham tasdiqlanadi |

Qoldiq **hisoblanadi**: `bitim.summa − sum(tolovlar.summa)`. Saqlanmaydi
— balans saqlanmaydigan loyiha qoidasi shu yerda ham amal qiladi.

### 5.4. Daftar bilan bog'lanish

`kassa_yozuvlar` ga **bitta** ustun qo'shiladi: `bitim_id uuid`.

Bitim yaratilganda:

- **tovar berdim / qarz berdim** → daftarga yozuv tushmaydi (pul
  harakati bo'lmagan, faqat qarz paydo bo'lgan);
- **pul berdim** → `chiqim` yozuvi;
- **to'lov keldi** → `kirim` yozuvi.

Ya'ni **qarz — pul emas**. Bu muhim: hozir ilovada «Tovar berdim»
tugmasi bosilsa, u chiqim bo'lib kassadan pul yechib yuboradi. Yangi
modelda kassaga tegmaydi, faqat hamkor qoldig'i o'zgaradi.

---

## 6. Ekranlar

### 6.1. Yangi tuzilma

Hozir beshta bo'lim bor: Bosh · Yozuvlar · Kontakt · Kalendar · Yana.

Yangi tuzilma **to'rtta**:

| Bo'lim | Nima |
|---|---|
| **Bosh** | To'rt raqam + so'nggi operatsiyalar |
| **Operatsiyalar** | Hamma bitim va yozuv, filtr bilan |
| **Hamkorlar** | Kontaktlar va ularning qoldig'i |
| **Yana** | Hisoblar, turkumlar, hisobot, sozlama, kalendar |

**Kalendar «Yana» ichiga ko'chadi.** Sababi: u chiroyli, lekin kunlik
ish uchun kerak emas — uni kuniga bir marta ham ochmaydi, pastda esa
to'rtinchi o'rinni egallab turibdi. Soddalashtirish shu yerdan
boshlanadi.

### 6.2. «+ Operatsiya» — asosiy tugma

Konsepsiyadagi eng to'g'ri qaror shu: **«Credit / Debit» emas, «Oldim /
Berdim»**.

Bosilganda olti tugma:

```
📦 Tovar oldim      📦 Tovar berdim
💰 Qarz oldim       💰 Qarz berdim
💵 Pul oldim        💵 Pul berdim
```

Ostida bitta xira qator: **«Kassa yozuvi»** — hamkorsiz kirim/chiqim
(ijara, benzin, kommunal). Bu hozirgi ilovaning butun mantiqi, endi u
ikkinchi darajaga tushadi. Yo'q qilinmaydi: do'kondorning xarajati
baribir bor.

### 6.3. Bitim oynasi

Bir ekran, tepadan pastga:

1. **Hamkor** — qidiruv bilan; yo'q bo'lsa shu yerda yaratiladi
2. **Tovar bo'lsa:** nomi · miqdor · birlik · narx
3. **Jami** — katta raqam, o'zi hisoblanadi, qo'lda ham yozsa bo'ladi
4. Valyuta (hamkornikidan oldindan qo'yiladi)
5. Muddat (ixtiyoriy) · Izoh
6. **Saqlash** va **Saqlab, Telegramga yuborish**

### 6.4. Hamkor profili

```
TONIROK                          $120 qarzdor
────────────────────────────────────────────
[ + To'lov ]  [ + Operatsiya ]  [ Telegram ]

🟠 20.09  Tovar oldim   1 200 × $0.10   $120   kutilmoqda
🟢 21.09  To'lov                        $120   tasdiqlangan
🟢 Yakunlandi
```

Tepada qoldiq, pastda tarix. Har qator holati rangi bilan ko'rinadi.

### 6.5. Bosh ekran

Konsepsiyadagi to'rt raqam:

| 🟢 Kirim | 🔴 Chiqim | 🟠 Menga qarzdor | 🔵 Men qarzdorman |

Hozirgi bosh ekranda uchtasi bor (kirim, chiqim, farq) va qarz alohida
pastda. To'rttasi tepaga chiqadi, «farq» olib tashlanadi — u kamroq
ishlatiladi va o'rin egallaydi.

---

## 7. Telegram tasdiqlash — eng qiyin qism

### 7.1. Asosiy muammo

**Hamkorda ilova yo'q va bo'lmaydi ham.** Tonirok — bozordagi odam,
u hech qachon ro'yxatdan o'tmaydi. Demak tasdiqlash ilovasiz ishlashi
kerak.

### 7.2. Yechim: bir martalik havola

1. Siz bitimni saqlaysiz → server `tasdiq_token` yaratadi
2. Ilova havola beradi: `t.me/<bot>?start=T_<token>`
3. Siz uni **istalgan yo'l bilan** yuborasiz — Telegram, SMS, WhatsApp
4. Tonirok bosadi, bot bitim kartochkasini ko'rsatadi:

```
OLDI-BERDI TASDIQLASH
👤 Anvar do'koni
📦 Karobka · 1 200 dona × $0.10
💰 Jami: $120
📅 20.09.2026 · muddat 05.10.2026

[✅ Tasdiqlayman]   [❌ Rozi emasman]
```

5. Bosilganda: `holat` → `tasdiqlangan`, `telegram_id` hamkorga
   bog'lanadi (keyingi safar havola kerak emas), sizga xabar keladi

### 7.3. Xavfsizlik

Loyihada qarz boti allaqachon bor va uning darslari yozilgan
(`telegram-qarz/index.ts` boshidagi izoh). O'sha qoidalar shu yerda ham:

- chekka funksiya `verify_jwt = false` (chaqiruvchi — Telegram serveri),
  himoya `x-telegram-bot-api-secret-token` sarlavhasi;
- **token bir martalik va muddatli** (7 kun). Aks holda havola
  boshqa odamga o'tsa, u begona bitimni tasdiqlab yuboradi;
- token bazada **xeshlanib** saqlanadi — `kassa_tokenlar` da qilingandek;
- bot hech qachon o'zi huquq hisoblamaydi: har amal `chat_id → hamkor →
  bitim` zanjirini bazada qaytadan quradigan RPC orqali o'tadi;
- **tasdiqni faqat KUTILMOQDA holatidagi bitim qabul qiladi.**
  Yopilganini qayta tasdiqlab bo'lmaydi.

### 7.4. Eng muhim qaror: tasdiq SHART EMAS

**Tasdiqlanmagan bitim ham qoldiqqa kiradi.**

Aks holda: Tonirok tugmani bosmadi — sizning daftaringiz to'xtab
qoladi. Bu ilovani ishlatib bo'lmaydigan qiladi, chunki tasdiq
boshqa odamning xohishiga bog'liq.

Tasdiq — **dalil**, shart emas. U faqat holat belgisini o'zgartiradi
va nizoda ishga yaraydi. Hisobotda esa alohida ustun bo'ladi:
«tasdiqlangan qarz» va «tasdiqlanmagan qarz».

---

## 8. Nima soddalashadi

Siz «soddalashtir» dedingiz. Qo'shilayotgan narsa ko'p, shuning uchun
olib tashlanadigani ham bo'lishi shart:

| Olib tashlanadi | O'rniga |
|---|---|
| Pastdagi **Kalendar** bo'limi | «Yana» ichiga |
| Bosh ekrandagi **«Farq»** kartochkasi | «Menga qarzdor» va «Men qarzdorman» |
| **«Kirim» / «Chiqim»** atamalari asosiy oqimda | «Oldim» / «Berdim» |
| Ikki katta tugma (Kirim / Chiqim) | Bitta **«+ Operatsiya»** |
| Yozuv oynasidagi **turkum** majburiyligi | Bitimda turkum yo'q — hamkor bor |
| **Hisoblararo o'tkazma** bosh menyudan | «Yana» ichiga (kam ishlatiladi) |

Natija: bosh ekranda bitta tugma, ichida oltita aniq javob. Hozirgi
«kirim yoki chiqim → turkum → hisob → summa» zanjiri o'rniga
«kim bilan → nima → qancha».

---

## 9. Bosqichlar

Har bosqich oxirida ilova **ishlaydigan** holatda qoladi. Bu shart:
yarim qurilgan ilova bilan bir kun ham yashab bo'lmaydi.

### 1-bosqich — Baza (2 kun)

- `kassa_klientlar` kengayadi (telegram, kompaniya, stir, manzil, valyuta)
- `kassa_bitimlar`, `kassa_bitim_tolovlar` jadvallari + RLS + trigger
- `kassa_yozuvlar.bitim_id`
- `kassa_bitim_yarat`, `kassa_tolov_qosh`, `kassa_bitim_qoldiq` RPC lari
- Sinov: `kassa-bitim` — qoldiq matematikasi, qisman to'lov, bekor qilish

**Ilovaga ta'siri yo'q** — eski oqim ishlayveradi.

### 2-bosqich — Bitim ilovada (3 kun)

- «+ Operatsiya» va olti tugma
- Bitim oynasi (tovar, miqdor, narx, jami)
- Hamkor profili: qoldiq + tarix + «To'lov» tugmasi
- Bosh ekranda to'rt raqam
- Offline: bitim ham navbatdan o'tadi (`sinx.ts` kengayadi)

**Shu bosqichdan keyin ilova konsepsiya bo'yicha ishlaydi**, faqat
Telegram tasdig'i yo'q.

### 3-bosqich — Telegram tasdiqlash (3 kun)

- `kassa-telegram` chekka funksiyasi (bot)
- Havola yaratish, kartochka, ikki tugma
- Tasdiq kelganda ilovaga bildirishnoma
- Sinov: `kassa-tasdiq` — begona token, muddati o'tgan token, ikki
  marta tasdiqlash, yopilgan bitimni tasdiqlash

### 4-bosqich — Soddalashtirish va tozalash (2 kun)

- Kalendar «Yana» ga ko'chadi, bo'limlar to'rtta bo'ladi
- Eski «Kirim/Chiqim» tugmalari «Kassa yozuvi» ostiga tushadi
- Hisobotga «tasdiqlangan / tasdiqlanmagan qarz» ustuni
- Lug'atga yangi matnlar (`kassa-til` sinovi ularni talab qiladi)

### 5-bosqich — Hujjat va eslatma (2 kun)

- Bitim bo'yicha PDF (hozirgi `hujjat.ts` dvigateli qayta ishlatiladi)
- Muddati o'tgan qarz eslatmasi — auditdagi 5-band shu yerda yopiladi

**Jami: ~12 ish kuni.**

---

## 10. Nima buziladi va nima bo'lmaydi

**Buzilmaydi:**

- Mavjud yozuvlar joyida qoladi, `bitim_id` ularda bo'sh bo'ladi
- Qoldiq hisobi o'zgarmaydi — u avvalgidek yozuvlardan chiqadi
- Offline qatlam, sinx, eksport, AI ulanishi — hammasi ishlayveradi
- Paket nomi va ilova kimligi o'zgarmaydi

**Ehtiyot bo'lish kerak:**

- **«Tovar berdim» endi kassadan pul yechmaydi.** Eski yozuvlar
  boshqacha mantiq bilan kiritilgan — ularni ko'chirmaymiz, faqat
  yangi oqim yangi qoida bilan ishlaydi. Buni foydalanuvchiga bir
  marta aytish kerak.
- **Valyuta endi haqiqatan kerak** — bitimlar dollarda. Hisobot
  valyutalarni aralashtirmaydigan qilib 18.09 da tuzatilgan edi, bu
  aynan asqotadi.

---

## 11. Ochiq savollar — sizdan

1. **Nom.** «IDAA Money Management» qaror qilingan bo'lsa, bu reja
   uning ostida boradi. Ikonka varianti ham tanlanishi kerak.

2. **Bot.** Tasdiqlash uchun **yangi bot** ochamizmi yoki mavjud
   `telegram-qarz` botiga kassa shoxini qo'shamizmi? Mening fikrim:
   **yangi bot** — eski bot b2b agentlariniki, ikkisi aralashsa
   xavfsizlik zanjiri chalkashadi.

3. **O'lchov birligi** ro'yxat bo'lsinmi (dona, kg, metr, quti, litr)
   yoki erkin matnmi? Ro'yxat — hisobotda yig'ish mumkin; erkin matn —
   hech nimani cheklamaydi.

4. **Tovar katalogi** kerakmi? Ya'ni «Karobka» bir marta yaratilib,
   keyin ro'yxatdan tanlanadimi, yoki har safar qo'lda yoziladimi?
   Birinchi bosqichda **qo'lda** deb o'ylayman — katalog keyin, agar
   bir xil tovar takrorlanayotgani ko'rinsa.

5. **Eslatma** qaysi kanal orqali: Telegram yoki push? Bot qilingandan
   keyin Telegram arzonroq va ishonchliroq bo'ladi.

---

## 12. Birinchi qadam

Tasdiqlashingiz kerak bo'lgan ikki narsa bor, qolgani ularga bog'liq:

- **4-bo'limdagi qaror:** bitim alohida jadval bo'ladi, daftar
  o'zgarmaydi;
- **7.4-dagi qaror:** tasdiqlanmagan bitim ham qoldiqqa kiradi.

Shu ikkisiga «ha» desangiz, 1-bosqichdan boshlayman.
