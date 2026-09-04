---
name: ilova
description: Yukchibolla/Idaa Farm loyihasining qo'llanmasi — RLS va tenant ajratilishi tuzoqlari, prays roboti, Excel hujjatlari, sinov usullari, jonli ma'lumot bilan ishlash qoidalari. Shu repoda ishlashdan oldin o'qing; ayniqsa baza, migratsiya, sklad/prays, eksport yoki xavfsizlikka tegadigan ish oldidan.
---

# Ilova loyihasi — ish qo'llanmasi

Bu yerdagi har bir qoida **haqiqiy xatodan** kelib chiqqan. Har biri
qanday xato bo'lgani bilan yozilgan — sabab ma'lum bo'lsa, qoida
esda qoladi va kerak bo'lsa asosli ravishda buzilishi mumkin.

---

## 1. Ma'lumot xavfsizligi — tenant ajratilishi

Platforma ko'p ijarachili: `organizations` jadvali, har foydalanuvchi
`profiles.org_id` orqali bittasiga bog'langan. RLS bu chegarani ushlab
turadi. **Uch marta u teshilgan.**

### View RLS'ni chetlab o'tadi

```sql
-- NOTO'G'RI: view egasining huquqi bilan ishlaydi, RLS chaqirilmaydi
create view customers_masked as select ... from customers;

-- TO'G'RI
alter view customers_masked set (security_invoker = on);
```

**Bo'lgan hodisa:** Mary Collection admini o'z panelida clary tenantining
mijozlarini ko'rgan. Siyosat to'g'ri edi
(`is_admin() and org_id = current_org_id()`) — u shunchaki chaqirilmagan.
Jadvaldan o'qilsa hammasi to'g'ri, view orqali o'qilsa ochiladi.

**Qoida:** tenant ma'lumotiga tegadigan har bir view'da `security_invoker`
majburiy. `tests/tenant-ajratish.mjs` buni tekshiradi.

### `is_admin()` yolg'iz yetarli emas

```sql
using (is_admin())                                -- har tenant adminiga ochiq
using (is_admin() and org_id = current_org_id())  -- to'g'ri
```

Storage siyosatlarida ham xuddi shunday: bir tenant admini boshqasining
rasmlarini o'chira olardi.

### SECURITY DEFINER funksiyalar RLS'dan ustun

Ular chaqiruvchining RLS'ini chetlab o'tadi, ya'ni **org filtri qo'lda**
yozilishi kerak. Yaxshi namuna — `create_order`: har qator uchun
`p.org_id <> v_org` bo'lsa `RUXSAT_YOQ` beradi.

`order_usd_total` da bu yo'q edi: istalgan buyurtma id'si bilan boshqa
tenantning summasi ko'rinardi.

**Nozik joy:** org tekshiruvini qo'shganda `service_role` ni to'sib
qo'ymang. Botlar va cron `auth.uid() is null` bilan chaqiradi:

```sql
and (auth.uid() is null or is_super_admin() or c.org_id = current_org_id())
```

### Storage: ochiq bucket = internetda

```
avatars bucket public=true
  → ro'yxat olinadi → yo'l bilinadi → surat login'siz yuklab olinadi
```

Mijozning shaxsiy surati shunday ochiq turgan. Yopiq bucket + imzolangan
havola ishlating. Hujjatga qo'yiladigan rasm esa **hujjat ichiga**
joylanadi (data-URI yoki ExcelJS `addImage`), havola bilan emas — mijoz
bizning bucket'ga kira olmaydi.

Diqqat: bucket yopilgandan keyin ham CDN keshidagi eski nusxa bir muddat
xizmat qiladi.

### Yangi jadval qo'shsangiz

`org_id` + RLS **birinchi kundan**, va darhol `tests/tenant-ajratish.mjs`
ga qo'shing. Bo'sh jadvalda "0 qator" hech narsani isbotlamaydi — sinov
begona tenantga vaqtincha yozuv qo'yib, u ko'rinmasligini tekshiradi va
o'zidan keyin tozalaydi.

---

## 2. Jonli ma'lumot bilan ishlash

### Quruq sinov — standart holat

Ma'lumotni o'zgartiradigan har funksiyaga:

```sql
create function ...(p_qollash boolean default false)
-- p_qollash = false: nima o'zgarishini qaytaradi, hech narsa yozmaydi
```

Natijani foydalanuvchiga ko'rsating, keyin qo'llang. `dori_ic_nomdan` va
`dori_ic_navbatdan` shunday ishlaydi.

### Nima o'zim qilaman, nima uchun so'rayman

| O'zim | So'rayman |
|---|---|
| Bo'sh maydonni to'ldirish | Yozuvlarni birlashtirish |
| Xavfsizlik teshigini yopish | Hisob o'chirish |
| Sozlamani tiklash (sinovdan keyin) | Katalogni tozalash |
| Sxema qo'shish | Jonli sozlamani o'zgartirish |

O'lchov: **qaytarib bo'ladimi?** Bo'sh maydonni to'ldirish — ha.
Birlashtirish — yo'q.

### Unikal cheklov "birlashtirish kerak" degani

```
duplicate key (name_norm, coalesce(manufacturer,''))
```

Bu "to'ldirib bo'lmaydi" degani emas — "bu ikkovi bir yozuv" degani.
To'qnashadiganlarni chetlab o'ting va sonini alohida qaytaring: ular
birlashtirish uchun ro'yxat.

### Sinov jonli holatga tayanmasin

Uch marta sinov yiqildi, kod esa to'g'ri edi:

| Nimaga tayangan | Nima bo'ldi |
|---|---|
| `qoldiq_cheklovi = true` | sinov uni o'chirib qoldirdi |
| `rounding = 100` | foydalanuvchi 0 qilgach yiqildi |
| faol dori bo'lishi | takliflar o'chgach yiqildi |

**Naqsh:** sinov kerakli holatni o'zi qo'yadi, oxirida **aynan** tiklaydi
va tiklanganini alohida tekshiradi.

---

## 3. Prays roboti (`lib/faktura-robot.ts`)

Excel praysidan ustunlarni taniydi. Eng ko'p xato shu yerda.

### O'rganilgan shablon robotni bosmasin

`dori_templates` fayl imzosi bo'yicha moslashtirishni eslab qoladi. Avval u
butun natijani **almashtirardi**:

```js
const m = shablon.mapping;   // robot topgani tashlanardi
```

29-avgustda saqlangan shablonda ishlab chiqaruvchi yo'q edi; ta'minotchi
keyin ustunni qo'shdi; robot uni har safar topardi, shablon darrov
o'chirardi. **Robot bir marta xato o'rgangan va unutolmasdi.**

To'g'ri: shablonda **bor** maydon shablonникidan (odam to'g'rilagan
bo'lishi mumkin), **yo'q** maydon robotdan — band bo'lmagan ustunga.

### Mijoz to'ldiradigan ustunlar e'tiborsiz

«Ваш заказ», «Сумма заказ» — bo'sh ustunlar. Robot ularni "miqdor" deb
olsa, butun prays bo'ylab miqdor nol bo'ladi. `ETIBORSIZ_USTUNLAR` da.

### Bitta ustun — bitta maydon

`moslashniTop` `bandUstun` bilan buni ta'minlaydi. Eski shablonlarda
`qty:2` va `unit:2` bir ustunda edi.

### Ustun topilmasa jimgina o'tmasin

Muhim maydon (nom, narx, ishlab chiqaruvchi, muddat) topilmasa —
saqlashdan **oldin** ochiq yozing. Avval prays saqlanar, ustun bo'sh
qolar va bu faqat eksportda bilinardi.

### Prays yuklash = eskisini o'chirish

`dori_import_apply` `p_finalize=true` bilan shu importga tegmagan hamma
taklifni o'chiradi. Kichik fayl butun skladni bo'shatadi. Shuning uchun
mavjudning yarmidan ko'pi o'chadigan yuklash **tasdiq so'raydi**.

`p_warehouse_id` null bo'lsa asosiy skladga tushadi — sinovlarda **doim
aniq id** bering.

---

## 4. Excel hujjatlari (`lib/prays-eksport.ts`)

### xlsx yoki ExcelJS

| Kerak | Kutubxona |
|---|---|
| Oddiy jadval | `xlsx` (yengil) |
| Rang, ramka, formula, rasm | `exceljs` |

ExcelJS ~900 KB — **dinamik import** qiling, asosiy paketga tushmasin:

```ts
const ExcelJS = (await import('exceljs')).default;
```

### Qamrovni hisoblang, qo'lda yozmang

```ts
v.mergeCells('A1:F1');                    // jadval 7 ustunli — G oq qoladi
v.mergeCells(`A1:${ustunHarfi(n)}1`);     // to'g'ri
```

### Hujjat yasash mantiqi alohida modulda

Komponent ichida qolsa, uni faqat "kodda shunday yozilganmi" deb
tekshirish mumkin — bu formulaning noto'g'ri katakka ishora qilishini
**ushlamaydi**. Alohida modul bo'lsa, sinov hujjatni haqiqatan yasab,
ExcelJS bilan qayta ochib tekshiradi.

---

## 5. Panel (React) tuzoqlari

### `window.open` `await` dan OLDIN

Brauzer pop-up'ga faqat foydalanuvchi harakati paytida ruxsat beradi.
Sozlama yuklanguncha kutilsa — oyna bloklanadi va **hech qanday xato
chiqmaydi**.

```ts
const w = oynaOch();        // darhol
if (!w) return;
const s = await sozlamaniOl();
hujjatniYoz(w, {...});
```

### `functions.invoke` xato matnini yutadi

Har xato uchun bitta gap qaytaradi: *"Edge Function returned a non-2xx
status code"*. Serverning o'z xabari javob tanasida qoladi. `fnXato()`
uni ochib oladi — invoke ishlatgan **har joyda** shuni ishlating.

### PostgREST 1000 qatorda kesadi

Funksiyaga `p_limit: 50000` berilsa ham javob 1000 qator. Xato ham,
ogohlantirish ham yo'q. 4 828 dorilik katalog 1 000 bo'lib chiqqan.

**Yechim:** `p_offset` + bo'lak-bo'lak so'rash. Tartib **barqaror**
bo'lsin (`order by name, id`) — aks holda bir xil nomlarda qator ikki
marta tushib, boshqasi umuman tushmaydi.

### Modul almashsa holat o'ladi

Panel modulni shart bilan chizadi (`bolim === 'sotuv' && <DoriSotuv />`).
Shart yolg'on bo'lsa React komponentni yo'q qiladi — savat, tanlangan
mijoz, izoh yo'qoladi.

`useQoralama` (lib/qoralama.ts) `sessionStorage` ga saqlaydi. Qidiruv
natijasi **saqlanmaydi** — u eskirgan qoldiq ko'rsatishi mumkin.

### Locale nomini qattiq yozmang

```ts
d.toLocaleDateString('ru-RU')   // ICU qirqilgan muhitda RangeError
```

Telegram WebView'da shu sababdan ekran **ikki marta** bo'sh qolgan. Oy
nomlari kerak bo'lsa massiv bilan yozing.

### Rangni ko'z bilan tanlamang

`text-gray-400` oq fonda 2.54:1 — WCAG talabi 4.5. `tests/dizayn.mjs`
kontrastni **hisoblaydi**.

---

## 6. Sinov usullari

### Faylning o'zidan tekshiring

Kod o'qish "shunday yozilganmi" degan savolga javob beradi. Hujjat
formulasi noto'g'ri katakka ishora qilsa, kod o'qish uni ushlamaydi.
`tests/prays-hujjat.mjs` hujjatni yasab, qayta ochib tekshiradi.

### Sinovni mutatsiya bilan sinang

Sinov yozgach, kodni **ataylab buzing** va yiqilishiga ishonch hosil
qiling. Bu sessiyada bir necha sinov yashil turib, hech narsani
tekshirmayotgani shunday aniqlandi:

- `[a-z_]+` regex `b2b` ni qamramagan — eng muhim yo'nalish sinovdan
  chetda qolgan
- ustun tekshiruvi ikki faylda takrorlangan, biri eskirib yolg'on xato
  bergan
- `grep -q` quvurda `pipefail` bilan SIGPIPE berib, natija har safar
  boshqacha chiqqan

### Ikki joyda takrorlamang

Bir tekshiruv ikki faylda tursa, biri o'zgarganda ikkinchisi eskirib
yolg'on xato beradi.

---

## 7. Deploy

```bash
bash /opt/ilova/infra/deploy.sh   # serverda
bash infra/tekshir.sh             # o'z kompyuteringizda
```

**Hash bilan solishtirmang.** Mahalliy va serverdagi build bir xil
manbadan har xil hash beradi (CRLF, node versiyasi). Vite `versiya.json`
ga commit yozadi, `tekshir.sh` shuni solishtiradi.

Tarball yo'li: bu serverda `git` GitHub'dan 401 oladi, `curl` esa 200 —
sabab topilmagan. `deploy.sh` git ishlamasa tarball'ga o'tadi. Shunda
`.git` eski commit'da qoladi, shuning uchun tamg'a `ILOVA_COMMIT` muhit
o'zgaruvchisidan olinadi — aks holda `versiya.json` yolg'on gapiradi.

---

## 8. Xulosa qilishdan oldin

Bu sessiyada bir necha marta xato tashxis qo'yilgan:

| Aytilgan | Haqiqat |
|---|---|
| "Jadvallar telefonda buzilyapti" | ular chop etish hujjatida edi |
| "Sinovlarim katalogni o'chirdi" | sinov aniq sklad id'si yuboradi |
| "Faylda ustun yo'q" | ustun bor edi, robot topmagan |
| "Saqlash tugmasi o'chirilgan" | tugma bor, nomi boshqa amalni bildirardi |

**Qoida:** dalilsiz xulosa aytmang. Bazadan so'rang, faylni oching,
haqiqiy hisob bilan kirib ko'ring. Xato tashxis foydalanuvchining
vaqtini yo'qotadi va ishonchni buzadi.

Xato aytilgan bo'lsa — qisqa tuzating va davom eting.
