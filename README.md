# Ilova B2B — Ulgurji savdo platformasi

To'qimachilik zavodi uchun: katalog + real-vaqt ombor + buyurtma + mijoz-narxlari + qarzdorlik.
To'liq texnik reja: [PLAN.md](PLAN.md)

## Tuzilma

```
apps/admin      — Admin panel (React + Vite)        [1-bosqichda]
apps/mobile     — Mijoz ilovasi (Expo React Native) [2-bosqichda]
packages/shared — Umumiy tiplar va konstantalar
supabase/       — Baza migratsiyalari + seed
```

## ⚠️ XAVFSIZLIK QOIDASI

Bu loyiha **alohida Supabase akkauntda** ishlaydi. `D:\SAAS` (Clary) va uning
Supabase loyihalariga (`aoubdvlkca...`, `fwblwuxkmt...`) **hech qachon tegilmaydi** —
u yerda jonli foydalanuvchilar bor.

## Bazani o'rnatish (yangi akkaunt tayyor bo'lgach)

```bash
# 1. Login (yangi akkaunt tokeni bilan!)
npx supabase login

# 2. Loyihaga ulash (ref — YANGI loyihaniki)
npx supabase link --project-ref <YANGI_REF>

# 3. Migratsiyalarni yuklash
npx supabase db push

# 4. Sinov ma'lumotlari (ixtiyoriy, faqat test uchun)
# SQL Editor'da supabase/seed.sql ni ishga tushiring
```

## Baza arxitekturasi (qisqacha)

- **Ledger usuli**: ombor qoldig'i va mijoz qarzi — jurnal yozuvlari yig'indisi,
  hech qachon "qo'lda" o'zgartirilmaydi (`stock_movements`, `ledger_entries`).
- **RLS**: mijoz faqat o'z narx-guruhini, o'z buyurtmalarini, o'z balansini ko'radi —
  baza darajasida.
- **Atomik RPC**: `create_order`, `confirm_order` — poyga holati (overselling) imkonsiz.
- **Real-time**: `stock_levels` va `orders` jadvallari jonli efirda.
