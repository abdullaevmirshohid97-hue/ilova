# Ilova — agent uchun asosiy qoidalar

Bu fayl har sessiyada o'qiladi. Batafsil qo'llanma: `.claude/skills/ilova/SKILL.md`
(prays roboti, RLS tuzoqlari, Excel, sinov usullari). Shu loyihada ish
boshlashdan oldin uni o'qing.

## Til

Foydalanuvchi o'zbek tilida ishlaydi. Javoblar, UI matnlari, kod izohlari,
commit xabarlari, xato xabarlari — **o'zbekcha**. Kod nomlari ham o'zbekcha
(`qatorlar`, `tekshir`, `saqla`), bu loyihaning uslubi.

## Qat'iy taqiqlar

| Taqiq | Sabab |
|---|---|
| `aoubdvlkcatbeifuysau` bazasiga yozish | Clary'ning JONLI prod bazasi, foydalanuvchilari bor |
| `oxzenyupcolsamojccfg` bazasiga yozish | kerakli buxgalteriya ilovasi turibdi |
| `D:\SAAS` ni tahrirlash | boshqa loyiha |
| `kodchi/` ni serverga yoki repoga chiqarish | kalitlar shu yerda, gitignore'da |
| Jonli ma'lumotni ruxsatsiz o'chirish/birlashtirish | qaytarib bo'lmaydi |

Bu loyihaning bazasi: **`gnuddryjsmcrjchrbvyz`**.

## Ish oqimi

```bash
# Migratsiya (PowerShell)
.\kodchi\migratsiya-qollash.ps1 -Fayl 2026MMDD00000N_nom.sql

# Chekka funksiya
.\kodchi\edge-deploy-api.ps1 -Funksiya <nom>

# Deploy — SERVERDA
bash /opt/ilova/infra/deploy.sh

# Deploy tekshiruvi — O'Z KOMPYUTERINGIZDA
bash infra/tekshir.sh
```

Sinovlar (`node tests/<nom>.mjs`): `tenant-ajratish`, `xavfsizlik`, `dizayn`,
`hujjatlar`, `prays-oqimi`, `prays-hujjat`, `robot-ustunlar`, `qoralama`,
`yonalishlar`, `panel-yonalish`, `dori-skladlar`, `kritik-yollar`,
`miniapp-savat`, `tarif`.

## Uch qoida — buzilsa zarar keladi

**1. Jonli ma'lumotga yozishdan oldin quruq sinov.** Funksiyaga
`p_qollash boolean default false` qo'ying: u nima o'zgarishini ko'rsatsin,
hech narsa yozmasin. Natijani foydalanuvchiga ko'rsating, keyin qo'llang.

**2. Sinov jonli sozlamaga tayanmasin.** Kerak bo'lsa o'zi qo'yib, oxirida
aynan tiklasin. Bu sessiyada uch marta sinov yiqildi, kod esa to'g'ri edi:
`qoldiq_cheklovi`, `rounding`, faol dori bo'lishi.

**3. Tekshirmasdan xulosa qilmang.** "Fayl aybdor" deb aytgan edim — rasm
kelgach ma'lum bo'ldiki fayl to'g'ri, robot xato. Avval bazadan yoki
fayldan dalil oling.
