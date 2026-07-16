-- =============================================================
-- ILOVA B2B — Sinov ma'lumotlari (faqat development uchun)
-- =============================================================

-- Narx guruhlari (sizning 4 xil "tarix")
insert into public.price_groups (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Standart'),
  ('a0000000-0000-0000-0000-000000000002', 'Diler'),
  ('a0000000-0000-0000-0000-000000000003', 'VIP'),
  ('a0000000-0000-0000-0000-000000000004', 'Eksport');

-- Kategoriyalar
insert into public.categories (id, name, sort_order) values
  ('b0000000-0000-0000-0000-000000000001', 'Choyshab to''plamlari', 1),
  ('b0000000-0000-0000-0000-000000000002', 'Yostiq jildlari', 2),
  ('b0000000-0000-0000-0000-000000000003', 'Adyollar', 3);

-- Mahsulot: Versace (misoldagi)
insert into public.products (id, name, model, category_id, material, description) values
  ('c0000000-0000-0000-0000-000000000001', 'Versace', 'V25',
   'b0000000-0000-0000-0000-000000000001', 'Paxta',
   'Premium choyshab to''plami, zich to''qilgan paxta');

-- Variantlar (razmer x rang) — stock_levels trigger orqali avtomatik 0 bo'ladi
insert into public.product_variants (id, product_id, sku, size, color) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'VER-V25-170200-BLU', '170x200', 'Ko''k'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'VER-V25-200220-BLU', '200x220', 'Ko''k'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'VER-V25-170200-GLD', '170x200', 'Oltin gul');

-- Narxlar: har guruhga alohida (misoldagi 2900/3000/3100/3300)
insert into public.prices (variant_id, price_group_id, price)
select v.id, g.id,
  case g.name
    when 'Standart' then 3000
    when 'Diler'    then 2900
    when 'VIP'      then 3100
    when 'Eksport'  then 3300
  end
from public.product_variants v
cross join public.price_groups g;

-- Mijozlar
insert into public.customers (id, name, phone, region, price_group_id) values
  ('e0000000-0000-0000-0000-000000000001', 'Alisher aka (Chorsu)', '+998901112233',
   'Toshkent', 'a0000000-0000-0000-0000-000000000002'),  -- Diler: 2900 ko'radi
  ('e0000000-0000-0000-0000-000000000002', 'Bekzod aka (Urganch)', '+998902223344',
   'Xorazm', 'a0000000-0000-0000-0000-000000000003');    -- VIP: 3100 ko'radi

-- Boshlang'ich kirim: 10 000 dona (misoldagi)
insert into public.stock_movements (variant_id, qty, reason, note) values
  ('d0000000-0000-0000-0000-000000000001', 10000, 'production_in', 'Boshlang''ich kirim'),
  ('d0000000-0000-0000-0000-000000000002',  5000, 'production_in', 'Boshlang''ich kirim'),
  ('d0000000-0000-0000-0000-000000000003',  3000, 'production_in', 'Boshlang''ich kirim');

-- ESLATMA: admin foydalanuvchi seed'da yaratilmaydi.
-- Dashboard -> Authentication -> Add user orqali yarating, so'ng:
--   update public.profiles set role = 'admin' where id = '<user-uuid>';
