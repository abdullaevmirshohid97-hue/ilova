# Clary — AI agentni ulash (MCP)

Daftaringizga sun'iy intellekt agentini ulaysiz va u pul, qarz va
hisobot savollariga javob beradi:

> «Qancha pulim bor?» · «Bu oy qancha ketdi?» · «Kim qancha qarz?»
> «Ijaraga shu yilda qancha to'ladim?»

Protokol — **MCP** (Model Context Protocol), ya'ni Claude, Cursor,
VS Code kengaytmalari va MCP'ni qo'llaydigan istalgan mobil AI
dasturi ulanadi.

---

## 1. Kalit olish

Ilovada: **Yana → AI ulanish → Ulanish yaratish**.

Kalit **bir marta** ko'rsatiladi — bazada faqat uning sha256 izi
saqlanadi. Ya'ni kalitni biz ham qayta ko'rsata olmaymiz;
yo'qotsangiz yangisini yaratasiz, eskisini yopasiz.

Yaratishda bitta savol bor: **«Yozuv qo'sha olsin»**.

| Belgilanmagan (standart) | Belgilangan |
|---|---|
| Agent faqat **o'qiydi** | Agent yozuv ham qo'sha oladi |
| `yozuv_yarat` asbobi ro'yxatda **ko'rinmaydi** | Ko'rinadi, lekin **tasdiqsiz yozmaydi** |

---

## 2. Server manzili

```
https://gnuddryjsmcrjchrbvyz.supabase.co/functions/v1/kassa-mcp
```

Autentifikatsiya — oddiy sarlavha:

```
Authorization: Bearer cd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. Ulash

### Claude Desktop (va shunga o'xshash dasturlar)

Sozlama faylida (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "credit-debit": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://gnuddryjsmcrjchrbvyz.supabase.co/functions/v1/kassa-mcp",
        "--header", "Authorization: Bearer cd_SIZNING_KALITINGIZ"
      ]
    }
  }
}
```

### To'g'ridan-to'g'ri HTTP qo'llaydigan mijozlar

Manzil va sarlavhani qo'ying — boshqa hech narsa kerak emas.
Server "Streamable HTTP" usulida ishlaydi va JSON-RPC javobini
to'g'ridan-to'g'ri qaytaradi.

### Tekshirish (kalitni sinash)

```bash
curl -s https://gnuddryjsmcrjchrbvyz.supabase.co/functions/v1/kassa-mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cd_SIZNING_KALITINGIZ" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"qoldiq_ol","arguments":{}}}'
```

Javobda hisoblaringiz va qoldiq chiqsa — ulanish ishlayapti.

---

## 4. Asboblar

| Asbob | Nima qiladi |
|---|---|
| `qoldiq_ol` | Hisoblar va ularning qoldig'i |
| `yozuvlar_ol` | Davr bo'yicha kirim-chiqim ro'yxati |
| `hisobot_ol` | Jami kirim/chiqim/farq va turkumlar kesimi |
| `qarzlar_ol` | Kim qancha qarz (musbat — bizga qarzdor) |
| `qidir` | Izoh, turkum yoki kontakt bo'yicha qidirish |
| `yozuv_yarat` | Yangi kirim/chiqim — **faqat yozish huquqli kalitda** |

**Hamkor bilan oldi-berdi.** Daftar yozuvi (kirim/chiqim) va hamkor
bilan oldi-berdi — boshqa-boshqa narsa. Birinchisi kassadagi pul
harakati, ikkinchisi «kim kimga qarzdor».

| Asbob | Nima qiladi |
|---|---|
| `bitimlar_ol` | Bitta hamkor bilan bitim va to'lovlar tarixi, oxirida qoldiq |
| `bitim_yarat` | Tovar/qarz berdim yoki oldim — **yozish huquqli kalitda** |
| `tolov_yarat` | Qarzni kamaytiradigan to'lov — **yozish huquqli kalitda** |
| `valyutalar_ol` | Asosiy valyuta va kurslar |

`bitim_yarat` da hamkor topilmasa, **yangi hamkor yaratiladi** — lekin
tasdiqdan oldin buni ekranda aytib qo'yadi («← YANGI, yaratiladi»).

Yo'nalish ishorasi hamma joyda bir xil: **berdim** — u sizga qarzdor
bo'ladi, **oldim** — siz unga. To'lovda esa teskari: hamkor to'lasa
`oldim`, siz to‘lasangiz `berdim`.

Davr nomlari: `bugun`, `kecha`, `hafta`, `oy`, `yil`, `hammasi`.

---

## 5. Yozuv yaratish — ikki qadam

Bu ataylab shunday, chunki pul masalasida model xato tushunishi
mumkin:

1. Agent `yozuv_yarat` (yoki `bitim_yarat`, `tolov_yarat`) ni
   **tasdiqsiz** chaqiradi. Server hech narsa
   yozmaydi va faqat nima yoziladiganini qaytaradi:

   ```
   CHIQIM
   Summa:  250 000 so'm
   Hisob:  Naqd
   Turkum: Ijara

   Hech narsa YOZILMADI. Foydalanuvchidan tasdiq oling...
   ```

2. Siz «ha» degandan keyin agent o'sha chaqiruvni `tasdiq: true`
   bilan takrorlaydi — shundagina yoziladi.

Server `initialize` javobida modelga shu qoidani ochiq aytadi, ya'ni
agent uni o'zi biladi.

---

## 6. Xavfsizlik

- **Kalit — tashkilotingizga bog'langan.** Agent boshqa hech kimning
  ma'lumotini ko'ra olmaydi. Buni `tests/kassa-mcp.mjs` har safar
  bosib ko'radi: A ning kaliti bilan B ning pulini so'raydi va
  javob bo'sh chiqishi tekshiriladi.
- **Kalit matni saqlanmaydi** — faqat sha256 izi. Baza o'g'irlansa
  ham kalit bilan kirib bo'lmaydi.
- **Yopish o'sha zahoti ishlaydi** — ilovadagi «yopish» tugmasi.
- **Har so'rov jurnalga tushadi**: qaysi asbob, qachon, natija nima.
- **Kunlik chegara — 100 so‘rov** (har tenantda alohida sozlanadi).
  Model mijozning O‘Z AI obunasida ishlagani uchun bu chegara pul
  uchun emas — sikldagi agent serverni bo‘g‘ib qo‘ymasligi uchun.
- Bir vaqtda **10 tadan ko'p** faol kalit bo'lmaydi.

---

## 7. Cheklovlar

- Agent yozuvni **o'chira olmaydi** va tahrirlay olmaydi — faqat
  qo'sha oladi. O'chirish/tahrir ilovada, odam qo'li bilan.
- Hisob, turkum, kontakt yarata olmaydi: mavjudlaridan tanlaydi.
  Topilmasa — bo'sh qoldiradi va buni javobda aytadi.
- Fayl (Excel/PDF) chiqarish hozircha yo'q — ilovada bor.
