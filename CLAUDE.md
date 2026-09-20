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

### Ikki Supabase hisobi — chalkashtirmang

Loyihalar IKKI xil hisobda turadi va nomlari bir-biriga o‘xshash:

| Hisob | Tashkilot | Loyiha |
|---|---|---|
| `shox4494@gmail.com` | **`b2b b2c`** | **`gnuddryjsmcrjchrbvyz` — SHU LOYIHA** |
| `shox4494@gmail.com` | shox4494-eng's Org | `hgyugftmkausfkekandq` (B2B), `oxzenyupcolsamojccfg` (taqiqlangan) |
| `abdullaevmirshohid97@gmail.com` | Orgclinic | `aoubdvlkcatbeifuysau` (**Clary prod — taqiqlangan**), `fwblwuxkmtagohucpqyz` |

`kodchi/kalitlar.json` dagi `sbp_` token — **birinchi** hisobniki.
MCP uchun brauzerda ham aynan o‘sha hisobga kirish kerak, aks holda
«Organization unavailable» chiqadi.

> **DIQQAT.** `claude.ai Supabase` ulagichi (agent asboblari
> `mcp__claude_ai_Supabase__*`) IKKINCHI hisobga ulangan — ya'ni u
> Clary'ning JONLI prod bazasini ko‘radi. Uning ichida yozadigan
> asboblar bor: `apply_migration`, `execute_sql`,
> `deploy_edge_function`. Shu loyiha uchun ULARNI ISHLATMANG.
> Bu yerdagi baza ishlari `kodchi/` skriptlari yoki `.mcp.json`
> dagi `supabase` serveri (u `read_only=true`) orqali boradi.

## Ish oqimi

```bash
# Migratsiya (PowerShell)
.\kodchi\migratsiya-qollash.ps1 -Fayl 2026MMDD00000N_nom.sql

# Chekka funksiya
.\kodchi\edge-deploy-api.ps1 -Funksiya <nom>

# Deploy — SERVERDA
bash /opt/ilova/infra/deploy.sh

# Deploy tekshiruvi — O'Z KOMPYUTERINGIZDA
# PowerShell da `bash` WSL ga ketadi va /bin/bash topilmaydi.
# Git Bash to‘liq yo‘l bilan chaqiriladi:
& "C:\Program Files\Git\bin\bash.exe" infra/tekshir.sh

# Supabase boshqaruv tokeni bekor qilinsa (401): baza sinovlari va
# chekka funksiya deploy‘i to‘xtaydi. Yangi token olib:
.\kodchi\token-yangila.ps1 -Token sbp_xxxx
```

Sinovlar (`node tests/<nom>.mjs`): `tenant-ajratish`, `xavfsizlik`, `dizayn`,
`hujjatlar`, `prays-oqimi`, `prays-hujjat`, `robot-ustunlar`, `qoralama`,
`yonalishlar`, `panel-yonalish`, `dori-skladlar`, `kritik-yollar`,
`miniapp-savat`, `tarif`, `faktura-dizayn`, `sotuv-varaq`, `dona-tahrir`,
`sklad-solishtir`, `favqulodda-kirish`, `dorixona-tenant`, `valyuta`,
`direktor`, `menejer-yashirin`, `menejer-hisob`, `prays-bloklar`,
`qarz-bot`, `qarz-hujjat`, `qarz-fayl`, `kop-tashkilot`, `narxsiz-korinish`, `katalog-korinish`, `min-partiya`, `bosh-sahifa`,
`kassa-raqam`, `kassa-balans`, `kassa-dizayn`, `kassa-hujjat`, `kassa-ochirish`, `kassa-sinx`, `kassa-sinx-baza`, `kassa-mcp`, `kassa-ai-kalit`, `kassa-til`, `kassa-bitim`, `kassa-tasdiq`, `kassa-biznes`, `kassa-valyuta`, `kassa-ui`.

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
