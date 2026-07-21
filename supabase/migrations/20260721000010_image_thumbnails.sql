-- =============================================================
-- ILOVA B2B — Mahsulot rasmlariga thumbnail (kichik nusxa)
-- Admin yuklaganda brauzerda (canvas) ikki o'lcham yasaladi:
-- thumb (~300px, katalog uchun) va full (~1200px, mahsulot sahifasi uchun).
-- Sekin internetda mobil katalog faqat kichigini yuklaydi.
-- =============================================================

alter table public.product_images
  add column thumb_path text;
