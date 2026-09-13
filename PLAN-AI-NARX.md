# AI xarajati — kim to'laydi va qancha

> Sana: 2026-09-13. Narxlar Anthropic API'ning amaldagi tariflari
> (2026-06-24 holati): Haiku 4.5 — $1/$5, Sonnet 5 — $2/$10,
> Opus 5 — $5/$25 (kirish/chiqish, million token uchun).
> Kurs taxminan 1 USD ≈ 12 600 so'm deb olindi — u o'zgaradi.

---

## 1. Ikki xil AI bor va ularning puli ikki xil joydan chiqadi

Buni aralashtirib yuborish oson, natijada narx butunlay noto'g'ri
hisoblanadi.

| | **MCP — tashqi agent** | **Ilova ichidagi robot** |
|---|---|---|
| Modelni kim chaqiradi | **Mijozning o'zi** (uning Claude/ChatGPT ilovasi) | **Biz** |
| Token puli kimdan | Mijozning o'z obunasidan | **Bizdan** |
| Bizning xarajat | Chekka funksiya chaqiruvi + baza o'qishi | Har token uchun to'lov |
| Holat | **Ishlaydi** | Hali qurilmagan |

**Ya'ni MCP allaqachon "mijozning o'z hisobidan" ishlaydi.**
Foydalanuvchi o'z AI dasturiga kalitni qo'yadi, savolni o'sha
dasturga beradi — model u yerda ishlaydi, biz faqat ma'lumot
beramiz. Bizning xarajatimiz 100 so'rovga:

```
100 so'rov/kun × 30 kun = 3 000 chaqiruv/oy
Supabase chekka funksiyasi: bepul tarifda 500 000 chaqiruv/oy
→ xarajat: 0
```

Shuning uchun MCP'dagi 100 ta chegara — **pul uchun emas**,
suiiste'molga qarshi: sikldagi agent serverni bo'g'ib qo'ymasin.

---

## 2. Ilova ichidagi robot — mana shu pul turadi

Bitta savol odatda **ikki marta** modelga boradi:
avval «qaysi asbobni chaqiray?», keyin «natijani odam tiliga
o'gir». Tizim ko'rsatmasi va asboblar ta'rifi keshlanadi (ular
o'zgarmaydi), shuning uchun ikkinchi chaqiruvda ular ~10 barobar
arzon.

Bitta so'rovning taxminiy o'lchami:

| Nima | Token |
|---|---|
| Keshdan o'qilgan (tizim + asboblar, 2 chaqiruv) | ~3 000 |
| Yangi kirish (savol + asbob natijasi) | ~700 |
| Chiqish (javob + asbob chaqiruvi) | ~320 |

### Bitta so'rov narxi

| Model | Bitta so'rov | 100 so'rov/kun | Oyiga (30 kun) |
|---|---|---|---|
| **Haiku 4.5** | $0.0026 | $0.26 | **$7.8** ≈ 98 000 so'm |
| **Sonnet 5** | $0.0052 | $0.52 | **$15.6** ≈ 196 000 so'm |
| **Opus 5** | $0.0130 | $1.30 | **$39** ≈ 491 000 so'm |

### Lekin 100 ta — bu SHIFT, o'rtacha emas

Kundalik daftar yurituvchi odam robotdan kuniga 5-15 marta
so'raydi. O'rtacha 10 ta bo'lsa:

| Model | Oyiga (10 so'rov/kun) |
|---|---|
| Haiku 4.5 | **$0.78** ≈ 10 000 so'm |
| Sonnet 5 | **$1.56** ≈ 20 000 so'm |
| Opus 5 | **$3.90** ≈ 49 000 so'm |

Ovoz (nutqni matnga o'girish) alohida xarajat — u Claude API'da
emas va narxi alohida hisoblanadi.

---

## 3. Pul mijozdan qanday qaytadi

Baza tomonda hammasi tayyor (`20260913000009_kassa_ai_limit.sql`):

| Nima | Qayerda |
|---|---|
| Har tenantning kunlik MCP chegarasi | `organizations.kassa_ai_kunlik` (standart **100**) |
| Robotning oylik chegarasi | `organizations.kassa_robot_oylik` (standart **0** — robot yoqilmagan) |
| Har chaqiruvning token va dollar hisobi | `kassa_ai_sarf` |
| Tenant o'z sarfini ko'radi | `kassa_ai_holat()` |
| Super admin chegarani qo'yadi | `kassa_ai_chegara_qoy()` |

Narx **so'rov paytida** hisoblanadi va saqlanadi: model tarifi
keyin o'zgarsa, o'tgan oyning hisoboti o'zgarmasin.

### Tavsiya qilinadigan tarif

| Tarif | Robot so'rovi/oy | Bizning xarajat (Haiku) | Taklif |
|---|---|---|---|
| Bepul | 0 (robot yo'q) | $0 | MCP bor — o'z AI'si bilan ishlatadi |
| Standart | 150 | ~$0.40 | obuna ichida |
| Biznes | 600 | ~$1.55 | obuna ichida |
| Qo'shimcha | har 100 ta | ~$0.26 | ustiga qo'shiladi |

Ya'ni robotni obunaga qo'shsak, u obuna narxining bir necha
foizini eydi — bu sog'lom nisbat. Chegara tugaganda robot
«limit tugadi, tarifni ko'taring» deydi va **o'chib qoladi**:
kutilmagan hisob kelmaydi.

---

## 4. Qaror sizniki: qaysi model

Kod yozishda standart — **Opus 5** (eng kuchli). Uni arzonroqqa
almashtirish — sifat bo'yicha qaror, shuning uchun uni siz
aytasiz:

- **Haiku 4.5** — eng arzon. «Ahmadga ikki million berdim» kabi
  oddiy jumlani tushunish uchun yetadi. Murakkab savolda
  («oxirgi uch oyda transport qancha oshdi?») adashishi mumkin.
- **Sonnet 5** — o'rtacha narx, ishonchli tushunish. Ko'p
  holatda eng to'g'ri tanlov.
- **Opus 5** — eng aniq, lekin 5 barobar qimmat. Robotning
  kundalik ishiga ortiqcha.

**Aralash yo'l ham bor:** oddiy yozuv kiritishni Haiku bajaradi,
murakkab savolni Sonnet oladi. Bu narxni ~2 barobar tushiradi,
lekin kodni murakkablashtiradi — ikkinchi bosqichda qilsa bo'ladi.

Qaysi biri bo'lsin?
