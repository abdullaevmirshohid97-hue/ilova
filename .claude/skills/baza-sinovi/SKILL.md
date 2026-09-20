---
name: baza-sinovi
description: >
  Ilova loyihasida Supabase bazasiga tegadigan sinov yozish va yuritish.
  Migratsiya, RPC, RLS siyosati, cheklov (check/unique), trigger yoki sinx
  funksiyasiga tegilganda SHU SKILLNI O'QING — sinov shakli, tozalash
  qoidasi va bu yerda odamni bir necha marta aldagan tuzoqlar shu yerda
  yozilgan. "sinov yoz", "migratsiyani tekshir", "RLS sizyaptimi", "tenant
  ajratilganmi", "cheklov ishlayaptimi" degan ishlarda ham shu skill.
  Sinov yozmasdan migratsiya qo'llash — bu loyihada xato hisoblanadi.
---

# Baza sinovi

Bu repoda bazaga tegadigan har o'zgarish sinov bilan keladi. Sinovlar
`tests/<nom>.mjs` da turadi va `node tests/<nom>.mjs` bilan yuriladi.
`CLAUDE.md` dagi ro'yxatga yangi nomni qo'shish ham ishning bir qismi.

## Avval: qaysi shakl

Ikki xil sinov bor va ular **butunlay boshqacha xavf tug'diradi**.

| Shakl | Qachon | Tozalash |
|---|---|---|
| **`do $$` bloki** | cheklov, trigger, RPC mantig'i, funksiya xulqi | avtomatik — blok oxiridagi `raise exception` HAMMASINI qaytarib oladi |
| **REST + haqiqiy JWT** | RLS, tenant ajratilishi, huquqlar | **qo'lda** — har `insert` alohida commit bo'ladi |

Farqi hal qiluvchi. `do` bloki bitta tranzaksiya: o'rtada yiqilsa ham iz
qolmaydi. REST sinovi esa har qadamda yozib boradi — o'rtada yiqilsa
**jonli bazada sinov qatorlari qolib ketadi**.

## `do $$` shakli

`.mjs` fayl SQL ni matn sifatida saqlaydi va ikki ish qiladi: `--sql`
bilan uni `supabase/sinov/<nom>-sinov.sql` ga yozadi (odam SQL Editor'ga
qo'yadi), tokensiz esa Management API orqali o'zi yuboradi.

```js
const BLOK = `
do $$
declare
  v_org uuid; v_user uuid;
  v_ok boolean; v_soni int;
  v_n jsonb := '[]'::jsonb;
begin
  -- 1. O'Z ma'lumotini o'zi yaratadi
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-<NOM> ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;

  -- 2. Tekshiruvlar. Har biri jsonb ga qo'shiladi
  begin
    insert into ... ;   -- rad etilishi KERAK bo'lgan narsa
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'nima tekshirildi', 'ok', v_ok);

  -- 3. Natijani XATO sifatida qaytaradi — shu yerda hammasi rollback
  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;
```

`raise exception` — bu **xato emas, usul**. U natijani ham qaytaradi, izni
ham tozalaydi. SQL Editor'da «Failed to run sql query» ko'rinadi va bu
kutilgan holat; odamga shuni aytib qo'ying, aks holda u xato deb o'ylaydi.

Har tekshiruv `{"nom": ..., "ok": true|false, "izoh": ...}`. `izoh` ga
haqiqiy raqamni qo'ying (`v_soni || ' ta'`) — yiqilganda sabab darrov
ko'rinadi.

## REST shakli

`tests/tenant-ajratish.mjs` namuna. Haqiqiy foydalanuvchi bilan kiriladi
va `authenticated` roli ostida so'rov yuboriladi.

Uch qoida:

1. **Begona tashkilot MAVJUD tashkilot.** U `select id from organizations
   where id <> '<meniki>' limit 1` bilan olinadi — ya'ni **jonli mijoz**
   bo'lishi mumkin. Qo'ygan qatoringizni faqat **`id` bo'yicha** o'chiring.
   `where org_id = ...` — bu o'sha tashkilotning haqiqiy ma'lumotini olib
   ketadi.
2. **Bo'sh jadval hech narsani isbotlamaydi.** «0 qator ko'rindi» —
   sizish yo'qligini emas, ko'rsatadigan narsa yo'qligini bildiradi. Avval
   begona tashkilotga qator qo'ying, keyin ko'rinmasligini tekshiring.
3. **Yiqilsa tozalash bajarilmaydi.** Skript o'rtada `throw` qilsa,
   oxiridagi `delete` lar ishlamaydi. Yangi sinov yozganingizda uni bir
   marta ataylab yiqitib ko'ring va qoldiq qolmaganini tekshiring.

## Tuzoqlar

Bularning har biri shu loyihada kamida bir marta vaqt yegan.

**Orqa tirnoq SQL izohida.** Butun `BLOK` — JS template literal. Izohga
`` `postgres` `` deb yozsangiz literal o'sha yerda uziladi va fayl
umuman yuklanmaydi. SQL izohlarida tirnoq emas, «qo'shtirnoq» ishlating.

**SQL Editor RLS ni chetlab o'tadi.** U `postgres` roli ostida ishlaydi,
u esa jadval egasi. Ya'ni `select count(*)` butun bazani sanaydi, faqat
sinov tashkilotini emas. `do` blokida chiqqan raqam kutilganidan katta
bo'lsa — sabab shu, sizish emas. RLS ni **faqat** REST shakli tekshiradi.

**Cheklovlar matnni qabul qilmaydi.** `nima in ('tovar','qarz')`,
`yonalish in ('oldim','berdim')`, `turi in ('kirim','chiqim')`. Sinov
belgisini shunday ustunga yozib bo'lmaydi — u `izoh` yoki `nom` ga
boradi.

**Pul sinxda MATN bo'lishi kerak.** `to_jsonb` `numeric` ni JSON float
ga aylantiradi va `11850.500000` yo'qoladi. RPC da `::text` qo'ying,
sinovda esa `jsonb_typeof(...) = 'string'` ni tekshiring.

**Qisman unikal indeks bo'shlikni ushlamaydi.** `unique (org_id) where
asosiy` — asosiy umuman yo'q bo'lsa, birinchi `asosiy = true` ni bemalol
qabul qiladi. «Ikkinchisi rad etiladi» sinovi shuning uchun avval
birinchisi BOR ekanini tekshirishi kerak.

**Sinov jonli sozlamaga tayanmasin.** Kerak bo'lsa o'zi qo'yib, oxirida
aynan tiklasin. Aks holda sinov yiqiladi, kod esa to'g'ri bo'ladi va
soatlab noto'g'ri joy qidiriladi.

**`kalitlar.json` BOM bilan yozilsa** `JSON.parse` yiqiladi, sinov esa
`catch` ichida uni yutib «kalitlar topilmadi — o'tkazib yuborildi» deydi.
Ya'ni **yashil emas, o'tkazib yuborilgan**. Chiqishda «o'tkazib
yuborildi» ko'rsangiz, avval faylni tekshiring.

## Yuritish

```bash
node tests/<nom>.mjs          # Management token bilan, to'liq
node tests/<nom>.mjs --sql    # SQL ni supabase/sinov/ ga yozadi
```

Token 401 bersa: `.\kodchi\token-yangila.ps1 -Token sbp_xxxx`. U tokenni
avval sinab ko'radi va faqat ishlagandagina yozadi.

Tokensiz ishlash kerak bo'lsa — `--sql` bilan fayl yaratib, odamdan uni
SQL Editor'da yuritishni so'rang va natijani qaytarishini kuting.

## Yozib bo'lgach

- `CLAUDE.md` dagi sinovlar ro'yxatiga nomni qo'shing
- Mutatsiya bilan tekshiring: kodni ataylab buzing va sinov **yiqilishini**
  ko'ring. Yiqilmasa — sinov hech narsa tekshirmayapti
- Sinov o'zidan keyin iz qoldirmaganini bazadan tasdiqlang
