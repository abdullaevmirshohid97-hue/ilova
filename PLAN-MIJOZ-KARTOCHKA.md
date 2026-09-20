# Mijoz kartochkasi — reja (2-tahrir)

> Sana: 2026-09-21. Asos: foydalanuvchining 20–21.09 dagi topshirig'i.
> Hozirgi holat: `KontaktlarEkrani.tsx` → `KontaktOynasi` (kichik oyna).

---

## 0. Bir jumlada

**Mijoz kartochkasi qalqib chiquvchi oynadan TO'LIQ EKRANGA aylanadi;
har bir operatsiyani ochib tahrirlash, rasmga olish, hisoblash va
mijozga xabar yuborish mumkin bo'ladi.**

---

## 1. Tasdiqlangan qarorlar (21.09)

| Savol | Javob |
|---|---|
| Rang | **ko'k = kirim, qizil = chiqim** |
| Qamrov | **butun ilova**, faqat kartochka emas |
| Filtr | joriy davr: bu kun / hafta / oy / yil |

---

## 2. Uch ekran

```
  KARTOCHKA              OPERATSIYA              XABAR
┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│ ‹ Tonirok ☰ ⋮  │    │ ‹ Operatsiya   │    │ ‹ Xabar        │
├────────────────┤    ├────────────────┤    ├────────────────┤
│47 ta   Balans▣ │    │ Kirim      [⌨] │    │ Tonirok aka,   │
├────────────────┤    │ 1 200 000      │    │                │
│(Hammasi)Kunlik…│    │                │    │ 20.09 tovar    │
├────────────────┤    │ Chiqim     [⌨] │    │   +1 200 000   │
│Pay, 20 sen 2026│    │ —              │    │ 21.09 to'lov   │
│📦 Tovar berdim │    │                │    │   −500 000     │
│      +1 200 000│    │ Sana  20.09.26 │    │ ─────────────  │
│muddat 05.10·3k │    │ Vaqt  14:35    │    │ Qoldiq 700 000 │
│┌──────────────┐│    │                │    │                │
││Karobka 12 don││    │ Izoh           │    ├────────────────┤
│└──────────────┘│    │ ┌────────────┐ │    │[SMS][TG][WA]   │
│  balans 1.2 mln│    │ └────────────┘ │    │[Nusxa olish]   │
├────────────────┤    │ [📷 Rasmga ol] │    └────────────────┘
│ [+Kirim][−Chiq]│    ├────────────────┤
├────────────────┤    │[Xabar][Saqlash]│
│Kirim│Chiqim│Bal│    └────────────────┘
└────────────────┘
```

---

## 3. ☰ — mijoz menyusi

| Band | Nima qiladi | Holat |
|---|---|---|
| Sana | Bitta kunni tanlash | yangi |
| Sana oralig'i | Boshdan-oxirgacha | yangi |
| Eslatma | **savol 6.1** | yangi |
| Kalit so'z bo'yicha qidirish | Izoh va tovar nomidan | yangi |
| Miqdor bo'yicha qidirish | «500000 dan katta» kabi | yangi |
| Ulashish — PDF / Excel | Shu mijoz bilan **sverka** | dvigatel bor |
| Chop etish | Tizim chop etish oynasi | `expo-print` kerak |
| Profilga | **savol 6.3** | yangi |
| O'chirilgan operatsiyalar | Bekor qilinganlar tarixi | **ma'lumot bor** |

**O'chirilgan tarix — yaxshi xabar.** Daftar qo'shib yoziladigan
(append-only): hech narsa haqiqatan o'chmaydi, `bekor_at` yoki
`holat='bekor'` qo'yiladi, xolos. Ya'ni tarix **allaqachon saqlanib
turibdi** — uni faqat ko'rsatish kerak.

**Sverka — dvigatel ham tayyor.** `telegram-qarz/hujjat.ts` da
`sverkaPdf` va `sverkaXlsx` bor va qarz boti ular bilan ishlaydi.
Ilovaga ko'chiriladi.

---

## 4. ⋮ — amallar va saralash

**Amallar:** Tahrirlash · Qo'ng'iroq · Telegram tasdiq havolasi ·
Hujjat (PDF) · Yashirish

**Saralash:**
- Qabul qilingan bo'yicha
- To'langan bo'yicha
- Sana ↑ (eskisidan yangisiga)
- Sana ↓ (yangisidan eskisiga) — standart

---

## 5. Operatsiya oynasi

Qatorni bosganda ochiladi.

### 5.1. Maydonlar
1. **Kirim summa** — yonida kalkulator tugmasi
2. **Chiqim summa** — yonida kalkulator tugmasi
3. **Sana** va **vaqt** — ikkalasi ham tahrirlanadi
4. **Izoh** — uzun maydon
5. **Rasmga olish** — kamera yoki galereya
6. Tovar/qarz bo'lsa — **muddat**

### 5.2. Kalkulator
Tugma bosilsa raqamli panel chiqadi, `OK` bosilsa natija **o'sha
maydonga** yoziladi.

Hisoblash dvigateli tayyor: `ifodaHisobla` qo'shish, ayirish,
ko'paytirish va qavsni biladi va TIYINDA ishlaydi (kasr yo'qolmaydi).
Yangi narsa faqat panelning o'zi.

### 5.3. Rasm
Operatsiya rasmi uchun **yangi ustun kerak**: hozir `rasm_path` faqat
`kassa_klientlar` da bor. Uchta jadvalga qo'shiladi (`kassa_yozuvlar`,
`kassa_bitimlar`, `kassa_bitim_tolovlar`), rasm esa o'sha
`kassa-rasm` omborida turadi:

```
<org_id>/operatsiya/<id>.jpg
```

Siyosat o'zgarmaydi — u birinchi bo'lakka (org_id) qaraydi.

### 5.4. Saqlash
Pastdagi **Saqlash** faqat biror narsa o'zgargandagina yonadi.
O'zgarishsiz bosilsa versiya bekorga o'sardi va sinxronizatsiya
bo'sh ish qilardi.

---

## 6. Javoblar (21.09)

| Savol | Javob |
|---|---|
| «Eslatma» nima? | **Sanasiz qayd** — «akasi kelib to‘laydi» kabi. Bildirishnoma yo‘q. |
| Kirim ham, chiqim ham bo‘ladimi? | **Yo‘q.** Bittasi to‘ladi, ikkinchisi bo‘sh. Model o‘zgarmaydi. |
| ☰ va ⋮ bir xilmi? | **Yo‘q, ikkalasi alohida.** Har biri o‘z vazifasida, 3 va 4-bo‘limdagidek. |

Ya’ni ☰ ichida «Profilga» (ko‘rish) va ⋮ ichida «Tahrirlash»
(o‘zgartirish) — ikkalasi ham qoladi.
## 7. Xabar yuborish

### 7.1. Oqim
1. **Xabar** tugmasi bosiladi
2. **Shablon ko'rinadi** — odam nima ketishini oldin o'qiydi
3. Tanlaydi: **SMS · Telegram · WhatsApp · Nusxa olish**

Matn oldin ko'rinishi shart: tayyor xabar to'g'ridan-to'g'ri
ketib qolsa, xato raqam yoki noto'g'ri qoldiq mijozga borardi va
uni qaytarib bo'lmasdi.

### 7.2. Shablon
```
Tonirok aka, hisobingiz:

20.09.2026  Tovar berdim    +1 200 000
21.09.2026  Pul oldim         −500 000
────────────────────────────
Qoldiq:                        700 000

Anvar do'koni
```

Qatorlar **tekislanadi**: SMS da jadval bo'lmaydi, lekin bo'shliq
bilan tekislangan ustun o'qiladi.

### 7.3. Texnik
| Yo'l | Qanday |
|---|---|
| SMS | `sms:<raqam>?body=...` — telefon ilovasi ochiladi |
| Telegram | `https://t.me/share/url?text=...` |
| WhatsApp | `https://wa.me/<raqam>?text=...` |
| Nusxa olish | `expo-clipboard` — **allaqachon bor** |

Raqam kiritilmagan bo'lsa SMS va WhatsApp **xira** turadi: bosilib
keyin «raqam yo'q» deyilishi ortiqcha qadam.

---

## 8. Yangi bog'liqliklar

| Modul | Nima uchun | Native? |
|---|---|---|
| `expo-print` | Chop etish | ha |
| `@react-native-community/datetimepicker` | Sana va vaqt | ha |
| `expo-image-picker` | Rasmga olish (kamera) | **bor** |
| `expo-clipboard` | Nusxa olish | **bor** |

Ikkitasi native — APK qayta yig'ilishi shart.

---

## 9. Bosqichlar

### 1-bosqich — yadro va sinov
- `hamkorYuruvchi` — yuruvchi balans
- `operatsiyaNomi` — «Tovar berdim» kabi nom
- `DavrTuri` ga `yil`
- `xabarMatni` — SMS shabloni
- **Invariant sinovi:** oxirgi qatordagi qoldiq `hamkorQoldiq` ga
  AYNAN teng. Kod yozilishidan OLDIN yoziladi.

**Ilovaga ta'siri yo'q.**

### 2-bosqich — ranglar
- `kirim` ko'k, `chiqim` qizil — butun ilovada
- Tungi rejim uchun ochroq variant
- `kassa-dizayn` sinovi: kontrast yetarlimi

### 3-bosqich — kartochka
- `MijozKartochka.tsx`: sarlavha, ☰, ⋮, soni, balans kaliti, filtr
- Qatorlar: hafta kuni, muddat, izoh qutisi, yuruvchi balans
- Pastda kirim/chiqim tugmalari va uchta jami
- Saralash

### 4-bosqich — operatsiya oynasi
- Migratsiya: uch jadvalga `rasm_path`
- Kalkulator paneli
- Sana/vaqt tanlagich
- Rasmga olish
- Saqlash

### 5-bosqich — xabar va hujjat
- Shablon ekrani, SMS/Telegram/WhatsApp/nusxa
- Sverka PDF va Excel (`sverkaPdf` ko'chiriladi)
- Chop etish

### 6-bosqich — ☰ ichidagi qidiruv va tarix
- Sana, oraliq, kalit so'z, miqdor
- O'chirilgan operatsiyalar

**Jami: ~5 ish kuni.**

---

## 10. Nima xavf ostida

**Yuruvchi balans va pastdagi jami farq qilishi** — eng jiddiy.
Ro'yxat oxiri bir raqamni, «Balans» boshqasini ko'rsatsa, qaysi biri
to'g'ri ekanini hech kim bilmaydi. Shuning uchun invariant sinovi
1-bosqichda va koddan oldin yoziladi.

**Rang butun ilovaga tegadi** — hisobot, kalendar, bosh ekran,
PDF hujjat. Bittasi esdan chiqsa, bir ekranda yashil qolib ketardi.
Shuning uchun rang faqat `tema.ts` dan olinishini tekshiradigan
qadam qo'shiladi.

**Chop etish va sana tanlagich native** — eski APK da ishlamaydi.
