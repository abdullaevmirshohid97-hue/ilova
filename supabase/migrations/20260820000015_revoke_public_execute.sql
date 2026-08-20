-- =============================================================
--  XAVFSIZLIK (davomi) — huquq PUBLIC roli orqali qolib ketgan edi
--
--  20260820000014 da anon'dan EXECUTE olib tashlandi, lekin tekshiruv
--  shuni ko'rsatdi: add_stock kabi funksiyalar baribir ochiq kalit bilan
--  chaqirilyapti. Sababi — PostgreSQL'da yangi funksiya DEFAULT holda
--  `PUBLIC` psevdo-roliga EXECUTE beradi, `anon` esa PUBLIC ichida.
--  Ya'ni "revoke ... from anon" hech narsani o'zgartirmaydi — huquq
--  anon'ga emas, PUBLIC'ga yozilgan.
--
--  Bu yerda PUBLIC'dan olib tashlanadi. Lekin shunchaki olib tashlash
--  ilovani buzardi, chunki authenticated ham aynan shu PUBLIC orqali
--  ishlayotgan bo'lishi mumkin — shuning uchun avval kerakli rollarga
--  ANIQ huquq beriladi, keyin PUBLIC yopiladi.
--
--  RLS yordamchilariga (is_admin, current_org_id va h.k.) `anon` ham
--  ATAYLAB qoldiriladi: bu funksiyalar policy ichida chaqiriladi va
--  huquq bo'lmasa, login qilmagan foydalanuvchining so'rovi bo'sh
--  ro'yxat o'rniga XATO qaytarardi.
-- =============================================================

do $$
declare
  r record;
  -- Policy ichida ishlatiladigan yordamchilar
  rls_yordamchi text[] := array[
    'is_admin', 'is_manager', 'is_super_admin',
    'current_org_id', 'current_customer_id', 'current_manager_id',
    'current_price_group_id'
  ];
begin
  for r in
    select p.oid::regprocedure as f,
           p.proname,
           p.prorettype = 'pg_catalog.trigger'::regtype as trigger_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- kengaytma (pg_trgm) funksiyalariga tegilmaydi
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
      -- faqat PUBLIC'ga ochiq qolganlari (proacl null = default = PUBLIC)
      and (
        p.proacl is null
        or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
      )
  loop
    if r.trigger_fn then
      -- Trigger funksiyasini hech kim to'g'ridan-to'g'ri chaqirmaydi
      execute format('revoke execute on function %s from public, anon, authenticated', r.f);
    elsif r.proname = any (rls_yordamchi) then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.f);
      execute format('revoke execute on function %s from public', r.f);
    else
      execute format('grant execute on function %s to authenticated, service_role', r.f);
      execute format('revoke execute on function %s from public, anon', r.f);
    end if;
  end loop;
end $$;

-- Bundan keyin yaratiladigan funksiyalar ham PUBLIC'ga ochilib qolmasin
alter default privileges in schema public revoke execute on functions from public;
