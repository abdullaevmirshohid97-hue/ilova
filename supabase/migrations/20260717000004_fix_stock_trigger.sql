-- =============================================================
-- TUZATISH: stock trigger'da ON CONFLICT muammosi.
-- Postgres INSERT ... ON CONFLICT DO UPDATE'da check-constraint'ni
-- avval taklif qilingan INSERT qatoriga tekshiradi — manfiy harakat
-- (masalan -500 chiqim) mavjud qator ustida ham xato berardi.
-- Yechim: avval UPDATE, topilmasa INSERT.
-- (Har variantga trg_variant_created 0-qator ochadi, shuning uchun
--  UPDATE yo'li deyarli doim ishlaydi; qty>=0 check himoyasi saqlanadi.)
-- =============================================================

create or replace function public.tg_apply_stock_movement()
returns trigger language plpgsql as $$
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
