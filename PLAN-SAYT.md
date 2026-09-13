# yukchibolla.com — landing sayt rejasi

> Sana: 2026-09-13. Bog'liq rejalar: [PLAN.md](PLAN.md) (b2b yadro),
> [PLAN-KASSA.md](PLAN-KASSA.md) (Credit Debit).
> Infra: mavjud VPS + Caddy (`infra/Caddyfile.snippet`).

---

## 0. Bir jumlada

**`yukchibolla.com` — platformaning yuzi: mahsulotlarni ko'rsatadi,
yo'riqnoma beradi, ilovalarni yuklatadi va savolga robot javob beradi.
Ishlaydigan ilovalar o'z manzillarida qoladi** (`app.` — mijoz ilovasi
va Credit Debit, `admin.`/`4020.` — panel). Sayt ularga eshik, ularning
o'rniga emas.

---

## 1. Nega alohida sayt, nega `app.` ga qo'shilmaydi

Hozir `app.yukchibolla.com` — bu **ilovaning o'zi** (Expo web eksporti).
U React bundle'ini yuklaydi, keyin ekran chizadi. Reklama sahifasi
uchun bu noto'g'ri:

| Talab | Ilova (SPA) | Landing |
|---|---|---|
| Google'da topilishi | yomon — matn JS ichida | yaxshi — matn HTML'da |
| Birinchi ochilish | 750 KB bundle | 30-60 KB sahifa |
| Sekin internet | oq ekran, keyin chiziladi | darhol o'qiladi |
| Ijtimoiy tarmoqda ulashish | rasm/tavsif yo'q | OG rasm va tavsif |

Shuning uchun sayt **alohida**: o'z papkasi, o'z Caddy bloki, o'z build'i.

---

## 2. Sahifalar xaritasi

```
/                      Bosh sahifa — nima taklif qilamiz, kimga
/mahsulotlar           Hammasi bir ro'yxatda
  /kassa               Credit Debit (hisob-kitob daftari)
  /b2b                 Ulgurji savdo platformasi
  /dorixona            Dorixona tizimi
  /qarzdorlik          Qarz yuritish + Telegram bot
/yuklab-olish          Android APK, Play Market, web, desktop
/yoriqnoma             Qo'llanmalar (har mahsulot uchun bo'lim)
  /yoriqnoma/kassa     Birinchi yozuv, hisoblar, hisobot
  /yoriqnoma/b2b       Katalog, buyurtma, narx guruhlari
  /narxlar             Tariflar (QAROR kerak — 14.3)
/aloqa                 Telefon, Telegram, joylashuv, forma
/maxfiylik             Maxfiylik siyosati        ← Play uchun MAJBURIY
/hisob-ochirish        Hisobni o'chirish so'rovi ← Play uchun MAJBURIY
/shartlar              Foydalanish shartlari
```

Robot chat — alohida sahifa emas, **hamma sahifada pastki o'ng burchakda**
suzuvchi tugma.

---

## 3. Texnologiya

**Vite (ko'p sahifali) + Tailwind + TypeScript.** Panel allaqachon shu
stackda (`apps/admin`), ya'ni yangi qurilma, yangi build tizimi va yangi
xatolar sinfi qo'shilmaydi.

**React SPA QILINMAYDI.** Sayt uchun har sahifa o'z `.html` fayli
bo'ladi (Vite `rollupOptions.input` bilan ko'p kirish nuqtasi). Sabab
sodda: Google va Telegram sahifani JS'siz o'qiydi. Interaktiv qismlar
(robot oynasi, banner karuseli, forma) — kichik `<script>` bo'laklari,
butun sahifani React ushlab turmaydi.

```
apps/sayt/
├── index.html              bosh sahifa
├── kassa.html              ...
├── yuklab-olish.html
├── maxfiylik.html
├── src/
│   ├── uslub.css           Tailwind
│   ├── robot.ts            chat oynasi
│   ├── banner.ts           karusel
│   └── forma.ts            aloqa formasi
├── ommaviy/                rasm, ikonka, og-rasm
└── vite.config.ts
```

Build: `pnpm --filter @ilova/sayt build` → `dist/` → `/var/www/ilova-sayt`.

---

## 4. Robot chat

Saytdagi robot — **sotuvchi-maslahatchi**, ilovadagi moliya roboti
(`PLAN-KASSA.md` 8-bo'lim) EMAS. Ikkalasi aralashmasligi kerak.

```
Mehmon savol yozadi
   ↓
sayt-robot (chekka funksiya, verify_jwt = false)
   ↓
Claude API + bilim bazasi (mahsulot tavsiflari, narxlar, yo'riqnoma)
   ↓
javob + kerak bo'lsa "Telefon qoldiring" tugmasi
```

**Qat'iy chegaralar** — bu ochiq internetdagi funksiya:

1. **Bazaga kirish YO'Q.** Robotda tool ham, SQL ham yo'q. U faqat
   matn biladi. Aks holda prompt'ga "mijozlar ro'yxatini ber" deb
   yozgan odam javob olardi.
2. **IP bo'yicha cheklov**: kuniga N ta savol, daqiqada M ta.
   `sayt_robot_jurnal` jadvali — IP hash, vaqt, token soni.
3. **Oylik byudjet.** Chegara oshsa robot "hozir band, telefon
   qoldiring" deydi va forma ochadi. Chegarasiz qo'yilsa bitta bot
   bir kechada hisobni bo'shatadi.
4. **Javob uzunligi cheklangan**, tarix 10 ta xabardan oshmaydi.
5. Savol-javob saqlanadi — odamlar nima so'rayotgani eng arzon
   marketing tadqiqoti.

Bilim bazasi — `apps/sayt/bilim/*.md` fayllari, build paytida bitta
matnga yig'iladi va funksiyaga qo'yiladi. Ya'ni yangi mahsulot
qo'shilganda robot ham "o'rganadi", alohida ish qilinmaydi.

---

## 5. Reklama bannerlari

Ikki xil banner bor, chalkashtirmaslik kerak:

| Qayerda | Kim boshqaradi | Holat |
|---|---|---|
| Mijoz ilovasi ichida (`bannerlar` jadvali) | tenant admini | **bor** |
| Saytda (kampaniya, chegirma, yangi mahsulot) | super admin | **yangi** |

Sayt bannerlari uchun `sayt_bannerlar` jadvali: sarlavha, matn, rasm,
havola, muddat (`boshlanish`/`tugash`), tartib, faol. Super admin
paneliga (4020) kichik ekran qo'shiladi.

**1-bosqichda bannerlar KODDA turadi.** Boshqaruv ekrani — keyin.
Sabab: hozir kampaniya yo'q, bo'sh boshqaruv ekrani esa qo'shimcha
kod va qo'shimcha xato.

---

## 6. Yuklab olish bo'limi

Bu yerda halol bo'lish kerak — bor narsa bilan yo'q narsa aralashmasin:

| Nima | Holat | Sayt nima qiladi |
|---|---|---|
| Credit Debit APK | **bor** (54 MB, imzolangan) | to'g'ridan yuklab olish |
| Credit Debit web | tayyor, deploy kutyapti | «Brauzerda ochish» |
| Credit Debit Play Market | 4 ta shart qolgan | havola — chiqqach |
| Mijoz ilovasi APK (b2b) | bor | yuklab olish |
| **Desktop (.exe)** | **YO'Q** | 14.2 dagi qaror |

Desktop tugmasi ikki xil bo'lishi mumkin:

- **A (tez, bugun):** «Kompyuterga o'rnatish» → PWA yo'riqnomasi
  (Chrome/Edge: manzil satridagi ⊕ tugmasi). Ilova ish stolida
  yorliq bo'lib turadi, offline ishlaydi. Yangi kod deyarli kerak
  emas — `manifest.json` va service worker.
- **B (to'liq):** Tauri bilan haqiqiy `.exe` (~10 MB) + avtoyangilanish.
  Bir haftalik ish, imzolash sertifikati alohida masala (imzosiz
  `.exe` ni Windows SmartScreen "noma'lum nashriyot" deb qo'rqitadi).

Tavsiya: **A bilan chiqamiz**, B ni haqiqiy so'rov bo'lganda qilamiz.
«Tez orada» yozuvli o'lik tugma qo'yilmaydi — u ishonchni buzadi.

---

## 7. Yo'riqnomalar

Har mahsulot uchun: 5-7 ta qadam, har qadamda **haqiqiy ekran rasmi**
va bir-ikki jumla. Video keyin.

Ekran rasmlari ikki joyda kerak: saytda va Play Market sahifasida
(u yerda majburiy). Ya'ni bir marta olinadi, ikki joyda ishlatiladi.

Formatі: `apps/sayt/yoriqnoma/*.md` → build paytida HTML'ga o'giriladi.
Markdown'da yozilsa, yo'riqnomani kod bilmagan odam ham tahrirlay oladi.

---

## 8. Play Market uchun majburiy sahifalar

Bu sayt Credit Debit'ning Play'ga chiqishini **to'sib turgan ikki
shartni** yopadi:

1. `/maxfiylik` — qanday ma'lumot yig'iladi (email, yozuvlar), qayerda
   saqlanadi (Supabase, EU), kim ko'radi (faqat egasi), qancha turadi,
   qanday o'chiriladi. Play Console'da shu URL so'raladi.
2. `/hisob-ochirish` — ilovadan tashqari, **veb orqali** ham hisobni
   o'chirish yo'li bo'lishi shart. Sahifada forma: email → tasdiqlash
   xati → o'chirish. Ichida `kassa-hisob-ochir` chekka funksiyasi
   (`PLAY-QOLLANMA.md` dagi to'g'ri tartib bilan: avval `auth.users`,
   keyin `uzvliklar`, keyin `organizations`).

Ya'ni sayt — chiroy uchun emas, **chiqish sharti**.

---

## 9. Til va SEO

- **O'zbek asosiy**, rus ikkinchi (ilovalarda ham shu ikkisi bor).
  Har sahifaning ikki nusxasi: `/` va `/ru/`. Ingliz — keyin.
- Har sahifada: `<title>`, `description`, `og:image` (generator bilan
  yasaladi — `scripts/credit-debit-logo.mjs` naqshi), `canonical`,
  `hreflang`.
- `sitemap.xml` va `robots.txt` — build paytida yasaladi.
- Tahlil: **Plausible yoki Umami** (o'zimizda ham turadi, cookie
  banneri kerak emas). Google Analytics — GDPR va cookie rozilik
  oynasi olib keladi.
- Tezlik: rasm `webp`, shrift `font-display: swap`, JS < 30 KB.
  Caddy allaqachon zstd/gzip va `immutable` kesh beradi.

---

## 10. Infra

### DNS (siz qilasiz)

```
yukchibolla.com        A      <VPS IP>
www.yukchibolla.com    A      <VPS IP>     (yoki CNAME yukchibolla.com)
```

Mavjud `admin.`, `4020.`, `app.` yozuvlariga **tegilmaydi**.

### Caddy bloki

`infra/Caddyfile.snippet` ga qo'shiladi, serverda qo'lda ko'chiriladi:

```caddyfile
yukchibolla.com {
	root * /var/www/ilova-sayt
	encode zstd gzip

	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"

	header {
		Cache-Control "no-cache, must-revalidate"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}

	handle_errors {
		rewrite * /404.html
		file_server
	}

	file_server
}

www.yukchibolla.com {
	redir https://yukchibolla.com{uri} permanent
}
```

`try_files` kerak emas — har sahifa haqiqiy fayl.

### Deploy

`infra/deploy.sh` ga uchinchi build qo'shiladi (kassa qanday
qo'shilgan bo'lsa, shunday: xatosi ushlanadi va oxirida aytiladi).
`infra/tekshir.sh` ga: sayt ochilyaptimi, `/maxfiylik` bormi.

---

## 11. Dizayn

- **Tinch, ishonchli, ortiqcha animatsiyasiz.** Moliya mahsuloti
  sotilyapti — "startap" uslubidagi gradient va uchib yuruvchi
  bloklar bu yerda ishonchni kamaytiradi.
- Ranglar Credit Debit palitrasidan: to'q ko'k-kulrang `#16202E`,
  bosiq yashil `#3E8E68`, terakota `#B9615A`, oq-kulrang fon.
- Har mahsulot bo'limida **haqiqiy ekran rasmi** — chizilgan
  "mockup" emas. Odam nima olishini ko'rsin.
- Telefon birinchi: trafikning katta qismi telefondan keladi.
- Bosh sahifada eng tepada bitta aniq gap + ikkita tugma
  («Yuklab olish», «Ko'rib chiqish»), reklama shiori emas.

---

## 12. Bosqichlar

| # | Bosqich | Natija | Muddat |
|---|---|---|---|
| **0** | Skelet | `apps/sayt`, Vite MPA, Tailwind, deploy + Caddy, DNS ulanadi | 2 kun |
| **1** | Bosh sahifa + 4 mahsulot sahifasi | matn, rasm, tugmalar | 1 hafta |
| **2** | Yuklab olish + PWA | APK havolalari, «kompyuterga o'rnatish» | 3 kun |
| **3** | **Majburiy sahifalar** | `/maxfiylik`, `/hisob-ochirish` + chekka funksiya | 2 kun |
| **4** | Yo'riqnomalar | markdown → HTML, ekran rasmlari | 4 kun |
| **5** | Robot chat | `sayt-robot`, bilim bazasi, cheklovlar, jurnal | 5 kun |
| **6** | Bannerlar + aloqa formasi | kodda banner, forma → `sayt_sorovlar` | 3 kun |
| **7** | SEO, rus tili, tahlil | meta, sitemap, `/ru/`, Plausible | 4 kun |
| **8** | Desktop `.exe` (ixtiyoriy) | Tauri build | 1 hafta |

**Jami: ~4 hafta** (8-bosqichsiz).

Tartib ataylab shunday: **3-bosqich Play uchun eng muhim** — u
tugagach Credit Debit'ni do'konga yuborish yo'li ochiladi.

---

## 13. Sinovlar

| Fayl | Nimani ushlaydi |
|---|---|
| `tests/sayt-sahifalar.mjs` | Har sahifa 200 qaytaradi, `<title>` va `description` bor, ichki havolalar 404 bermaydi |
| `tests/sayt-robot.mjs` | Robot bazaga kira olmaydi; IP cheklovi ishlaydi; byudjet tugaganda forma taklif qiladi |
| `infra/tekshir.sh` | Sayt tirikmi, `/maxfiylik` va `/hisob-ochirish` ochiladimi |

---

## 14. Qarorlar — sizdan

**14.1. Sayt kimga gapiradi?**
Uch xil auditoriya bor va matn ularga har xil yoziladi:
- kichik biznes egasi (Credit Debit — o'zi ro'yxatdan o'tadi),
- korxona rahbari (b2b, dorixona — biz sozlab beramiz),
- ikkalasi (umumiy sayt, mahsulot sahifalari alohida).

Tavsiya: **ikkalasi**, lekin bosh sahifada Credit Debit oldinda —
u yagona o'zi ro'yxatdan o'tiladigan mahsulot.

**14.2. Desktop tugmasi:** PWA yo'riqnomasi (bugun) yoki Tauri `.exe`
(bir hafta)?

**14.3. Narxlar sahifasi bo'ladimi?**
Hozir bazada tarif (obuna) tizimi yo'q — `organizations.plan` bor,
lekin cheklov ham, to'lov ham yo'q. Uch yo'l: narxni umuman
ko'rsatmaslik («aloqaga chiqing»), «bepul» deb yozish, yoki tarif
tizimini qurish (alohida 2 haftalik ish).

**14.4. Robot uchun oylik byudjet?**
Claude API pullik. Kuniga ~200 savol uchun taxminan nechchi dollar
ajratamiz — shunga qarab cheklov qo'yiladi.

**14.5. Kontent kimdan?**
Mahsulot matnlari, ekran rasmlari, telefon raqamlar, kompaniya
rekvizitlari — men yozib chiqaman, siz to'g'rilaysizmi, yoki tayyor
matn berasizmi?
