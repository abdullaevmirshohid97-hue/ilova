# TUZATISH REJASI — 2026-07-19 auditi asosida

> Audit natijasi: 16 admin + 11 mobil kamchilik. Poydevor mustahkam,
> muammo — kundalik ish oqimlarining UI'da yopilmagani.
> Tartib: avval adminning kundalik og'rig'i, keyin mobil masshtab, keyin sayqal.

---

## 1-BOSQICH — Admin: Mijoz boshqaruvi (2-3 kun) 🔴 eng shoshilinch

Yopiladigan kamchiliklar: №6, №7(to'lov), №8, №15

| Ish | Yechim |
|---|---|
| **Mijoz kartochkasi** `/customers/:id` | Bitta sahifada: profil (rasm, aloqa, tarif), balans, buyurtmalar tarixi, to'lovlar/ledger tarixi |
| **Tahrirlash** | Ism, manzil, viloyat, gmail, tarif, rasm — to'g'ridan-to'g'ri; **telefon o'zgarishi** login-emailni ham o'zgartiradi → Edge Function `admin-update-customer` (service role) |
| **Bloklash / faollashtirish** | `is_active` tugmasi; bloklangan mijoz buyurtma berolmaydi (RLS allaqachon tekshiradi) + auth akkauntini ban qilish |
| **Parol tiklash** | Kartochkada "🔑 Yangi parol" tugmasi → Edge Function `updateUserById` → yangi parol ko'rsatiladi + nusxalash |
| **To'lov modali** | `prompt()` o'rniga to'liq forma: summa (ming ajratkichli), usul (naqd/karta/o'tkazma), sana, izoh |
| **To'lov storno** | Ledger'ga teskari yozuv (`adjustment`) + izoh majburiy — xato summa tuzatiladi |

## 2-BOSQICH — Admin: Mahsulot va Ombor (2-3 kun) 🔴

Yopiladigan: №1, №2, №3, №4, №7(kirim)

| Ish | Yechim |
|---|---|
| **Mahsulotni yashirish/o'chirish** | `is_active` toggle (katalogdan darhol yo'qoladi); buyurtmasi yo'q mahsulotga haqiqiy o'chirish |
| **Variant tahrirlash** | Razmer/rang/SKU tahriri, variantni yashirish (soft delete) |
| **Chiqim/korreksiya modali** | `adjust_stock` UI: +/- miqdor, **izoh majburiy** (audit uchun), sabab tanlash |
| **Kirim modali** | `prompt()` o'rniga forma: miqdor, izoh, sana |
| **Ombor jurnali** `/inventory` | `stock_movements` ro'yxati: sana, variant, +/-, sabab, buyurtma №, kim qilgan; variant va sana bo'yicha filtr |

## 3-BOSQICH — Excel import (2 kun) 🔴

Yopiladigan: №5 (eng katta qarz)

| Ish | Yechim |
|---|---|
| Shablon | "📥 Shablon yuklab olish" — ustunlar: nomi, model, kategoriya, material, razmer, rang, SKU, 4 tarif narxi, boshlang'ich qoldiq |
| Parsing | `xlsx` (SheetJS) kutubxonasi — brauzerda o'qiladi, server kerak emas |
| Preview | Yuklashdan oldin jadval ko'rinadi: xato qatorlar qizil, sabab yozilgan; faqat to'g'rilari o'tadi |
| Yozish | 200 tadan bo'lib (batch) yoziladi, progress-bar; mavjud SKU → yangilanadi (upsert) |
| Rasmlar | Import keyin — mahsulot kartasidan qo'lda yoki nomi mos fayllarni ommaviy yuklash (keyingi iteratsiya) |

## 4-BOSQICH — Admin: Qidiruv, signal, hisobot (2-3 kun) 🟡

Yopiladigan: №9, №10, №11, №12, №13, №14, №16(qisman)

| Ish | Yechim |
|---|---|
| Buyurtma qidiruvi | Mijoz nomi / buyurtma № bo'yicha; sana oralig'i filtri |
| Pagination | Barcha ro'yxatlarga `.range()` — 50 tadan, "Keyingi" tugmasi |
| **Yangi buyurtma signali** | Realtime INSERT → ovoz (beep) + brauzer Notification + sidebar'da qizil sanoq |
| Hisobotlar `/reports` | Davr tanlash → kunlik sotuv grafigi, top-10 mahsulot, qarzdorlar reytingi, ombor qiymati; **CSV eksport** |
| Kategoriya CRUD | Kichik boshqaruv oynasi: qo'shish, nomlash, tartiblash |
| Narx guruhi CRUD | Yangi tarif ochish, nomlash |
| Xodim qo'shish | Edge Function orqali ikkinchi admin yaratish (super_admin uchun asos) |

## 5-BOSQICH — Mobil: Masshtab (2-3 kun) 🟡

Yopiladigan: mobil №1, №2, №3, №6, №7, №10(narxsiz)

| Ish | Yechim |
|---|---|
| **Server qidiruv + sahifalash** | `.ilike`/full-text + `.range()` infinite-scroll — 100 000 mahsulotda ham tez; pg_trgm indekslar ishga tushadi |
| **Kategoriya chiplari** | Katalog tepasida gorizontal filtr |
| **Thumbnail** | Admin yuklaganda brauzerda 2 o'lcham yasaladi (300px / 1200px, canvas bilan — bepul); katalog faqat kichigini oladi |
| **Savat saqlanishi** | AsyncStorage — ilova yopilsa ham savat turadi |
| Buyurtma izohi | Savatda maydon → `p_comment` |
| Narxsiz mahsulot | Mijoz guruhida narxi yo'q variantlar katalogda chiqmaydi |

## 6-BOSQICH — Mobil: Qulayliklar (2-3 kun) 🟢

Yopiladigan: mobil №4, №5, №8, №9, №10(til)

| Ish | Yechim |
|---|---|
| **Push-bildirishnoma** | expo-notifications + token profilga saqlanadi; buyurtma holati o'zgarganda DB webhook → Edge Function → Expo Push ("Buyurtmangiz qabul qilindi ✅") |
| Parol o'zgartirish | Profilda: eski + yangi parol |
| Parolni unutdim | V1: "Adminga murojaat" ekrani (tel raqami bilan); SMS OTP — 7-bosqichda |
| Rasm galereyasi | Admin ko'p rasm yuklaydi, mobilda swipe |
| **Rus tili** | Oddiy lug'at (uz/ru), drawer'da til tanlash |
| Offline kesh | Oxirgi katalog AsyncStorage'da — internet uzilsa ham ko'rinadi (buyurtma faqat onlayn) |

## 7-BOSQICH — Nashr va infratuzilma (1 hafta + kutishlar) 🟢

| Ish | Yechim |
|---|---|
| **APK** | EAS Build (preview profil) → to'g'ridan-to'g'ri mijozlarga APK; keyin Play Market ($25) |
| SMTP | Resend (bepul: 100 email/kun) → gmail takliflari cheklovsiz |
| SMS OTP | Eskiz.uz — parol tiklash va tasdiqlash |
| Backup | Kunlik avtomatik dump (GitHub Actions, bepul) → repo'dan alohida xavfsiz joyga |
| iOS | Apple Developer ($99/yil) — talab bo'lsa |

---

## Texnik qarorlar (nima uchun shunday)

1. **Soft-delete hamma joyda** (`is_active`) — buyurtmalar tarixi buzilmaydi; haqiqiy o'chirish faqat hech qayerda ishlatilmagan yozuvlarga.
2. **Telefon/parol o'zgarishlari faqat Edge Function orqali** — service kalit brauzerga chiqmaydi.
3. **Rasm kichraytirish klientda** (canvas) — Supabase'ning pullik transformatsiyasisiz, bepul rejada ishlaydi.
4. **Excel klientda o'qiladi** — 10 000 qator uchun ham server shart emas, xatolar yuklashdan OLDIN ko'rinadi.
5. **Push — Expo'ning bepul xizmati** — alohida server/FCM sozlash shart emas.

## Umumiy muddat: ~2.5-3 hafta (7 bosqich, har biri alohida topshiriladi va sinaladi)

Tavsiya etilgan tartib: 1 → 2 → 3 → 5 → 4 → 6 → 7
(1-3 admin og'rig'ini yopadi, 5 mobil masshtabni — bular biznesni to'xtatuvchi;
4, 6, 7 — sifat va nashr.)
