-- =============================================================
-- BUG TUZATISH: yangi mahsulot/variant yaratish ishlamas edi.
--
-- tg_init_stock_level va tg_apply_stock_movement security definer
-- EMAS edi. Admin to'g'ridan-to'g'ri product_variants'ga INSERT
-- qilganda (masalan "Yangi kirim" oynasidan), trg_variant_created
-- ishga tushib stock_levels'ga qator qo'shishga urinadi — lekin
-- stock_levels'da authenticated uchun INSERT siyosati yo'q (faqat
-- SELECT), shuning uchun "new row violates row-level security
-- policy for table stock_levels" xatosi chiqadi.
--
-- Business RPC'lar (add_stock, adjust_stock, confirm_order...) ham
-- SECURITY DEFINER bo'lgani uchun bugungacha ishlagandek ko'rinardi,
-- lekin variant/mahsulot TO'G'RIDAN-TO'G'RI yaratilganda (RPC'siz)
-- birinchi marta sinovdan o'tkazilganda aniqlandi.
-- =============================================================

create or replace function public.tg_init_stock_level()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock_levels (variant_id, qty) values (new.id, 0)
  on conflict do nothing;
  return new;
end $$;

-- 0004'dagi UPDATE-then-INSERT mantig'i saqlanadi (ON CONFLICT DO UPDATE
-- check-constraint'ni taklif qilingan qatorga tekshirgani uchun manfiy
-- harakatlarda xato berardi) — bu yerda faqat security definer qo'shiladi.
create or replace function public.tg_apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.stock_levels
     set qty = qty + new.qty,
         updated_at = now()
   where variant_id = new.variant_id;

  if not found then
    insert into public.stock_levels (variant_id, qty, updated_at)
    values (new.variant_id, new.qty, now());
  end if;

  return new;
end $$;
