-- =============================================================
--  SKLADNI BOSHQARISH: TAHRIR, O'CHIRISH, QOLDIQ CHEKLOVI
--
--  Uchta talab:
--
--  1) Har bir skladdagi dorini o'chirish - ASOSIY skladda ham.
--     Prays fayliga tushib qolgan keraksiz pozitsiyani olib tashlash
--     kerak, lekin dorining o'zi katalogdan yo'qolmasin: boshqa
--     skladda bo'lishi mumkin va eski buyurtmalar unga bog'langan.
--     Shuning uchun TAKLIF o'chadi, dori emas. Hech bir skladda
--     qolmasa - dori sotuvdan chiqadi (is_active = false), lekin
--     o'chirilmaydi.
--
--  2) Asosiy skladni ham o'chirish. Ilgari taqiqlangan edi, chunki
--     "asosiy" tushunchasi eski kod uchun kerak. Endi o'chirilsa,
--     asosiylik keyingi skladga o'tadi; oxirgisi bo'lsa - asosiy
--     umuman qolmaydi va yuklashda sklad tanlash MAJBURIY bo'ladi
--     (panelda allaqachon shunday).
--
--  3) Qoldiq cheklovini yoqish/o'chirish. Prays fayllarida qoldiq
--     ustuni bo'lmagani uchun cheklov ba'zan "qolmadi" deb bezovta
--     qiladi. O'chirilganda qoldiq faqat MA'LUMOT bo'lib qoladi:
--     ko'rinadi, lekin hech narsani to'xtatmaydi.
-- =============================================================

-- ---------- 1. Sozlama: qoldiq cheklovi ----------
alter table public.dori_settings
  add column if not exists qoldiq_cheklovi boolean not null default true;

comment on column public.dori_settings.qoldiq_cheklovi is
  'true: qoldiqdan ortiq buyurtma berib bo''lmaydi. false: qoldiq faqat ma''lumot.';

create or replace function public.dori_cheklov_yoqilganmi()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select qoldiq_cheklovi from dori_settings where id), true);
$$;

revoke all on function public.dori_cheklov_yoqilganmi() from public, anon;
grant execute on function public.dori_cheklov_yoqilganmi() to authenticated, service_role;

create or replace function public.dori_sozlama_qoy(
  p_qoldiq_cheklovi boolean default null,
  p_rounding        int     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_narx int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  update dori_settings
     set qoldiq_cheklovi = coalesce(p_qoldiq_cheklovi, qoldiq_cheklovi),
         rounding        = coalesce(p_rounding, rounding),
         updated_at      = now(),
         updated_by      = auth.uid()
   where id;

  -- Yaxlitlash o'zgargan bo'lsa narxlar qayta hisoblanadi
  if p_rounding is not null then
    v_narx := dori_offer_narx(null, null);
    perform dori_katalog_yigish(null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'qoldiq_cheklovi', (select qoldiq_cheklovi from dori_settings where id),
    'rounding', (select rounding from dori_settings where id),
    'narx_yangilandi', v_narx
  );
end $$;

revoke all on function public.dori_sozlama_qoy(boolean, int) from public, anon;
grant execute on function public.dori_sozlama_qoy(boolean, int) to authenticated;

create or replace function public.dori_sozlama()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  return (select jsonb_build_object('qoldiq_cheklovi', qoldiq_cheklovi, 'rounding', rounding)
          from dori_settings where id);
end $$;

revoke all on function public.dori_sozlama() from public, anon;
grant execute on function public.dori_sozlama() to authenticated;

-- ---------- 2. Skladdagi dorini o'chirish ----------
-- TAKLIF o'chadi, dori emas: dori boshqa skladda bo'lishi va eski
-- buyurtmalarga bog'langan bo'lishi mumkin.
create or replace function public.dori_taklif_ochir(
  p_warehouse_id uuid,
  p_product_ids  uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_product_ids is null or array_length(p_product_ids, 1) is null then
    return jsonb_build_object('ok', true, 'ochirildi', 0);
  end if;

  delete from dori_batches
   where warehouse_id = p_warehouse_id and product_id = any (p_product_ids);

  delete from dori_offers
   where warehouse_id = p_warehouse_id and product_id = any (p_product_ids);
  get diagnostics v_n = row_count;

  -- Hech bir skladda qolmagan dori sotuvdan chiqadi (o'chirilmaydi)
  perform dori_katalog_yigish(p_product_ids);

  return jsonb_build_object('ok', true, 'ochirildi', v_n);
end $$;

revoke all on function public.dori_taklif_ochir(uuid, uuid[]) from public, anon;
grant execute on function public.dori_taklif_ochir(uuid, uuid[]) to authenticated;

-- Skladning butun praysini tozalash
create or replace function public.dori_sklad_prays_tozala(p_warehouse_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_n   int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select array_agg(product_id) into v_ids from dori_offers where warehouse_id = p_warehouse_id;

  delete from dori_batches where warehouse_id = p_warehouse_id;
  delete from dori_offers  where warehouse_id = p_warehouse_id;
  get diagnostics v_n = row_count;

  if v_ids is not null then
    perform dori_katalog_yigish(v_ids);
  end if;

  return jsonb_build_object('ok', true, 'ochirildi', v_n);
end $$;

revoke all on function public.dori_sklad_prays_tozala(uuid) from public, anon;
grant execute on function public.dori_sklad_prays_tozala(uuid) to authenticated;

-- ---------- 3. Asosiy skladni almashtirish va o'chirish ----------
create or replace function public.dori_sklad_asosiy_qil(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if not exists (select 1 from dori_warehouses where id = p_id) then
    raise exception 'SKLAD_TOPILMADI';
  end if;

  update dori_warehouses set is_default = false where is_default and id <> p_id;
  update dori_warehouses set is_default = true, updated_at = now() where id = p_id;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_sklad_asosiy_qil(uuid) from public, anon;
grant execute on function public.dori_sklad_asosiy_qil(uuid) to authenticated;

-- Endi asosiy sklad ham o'chiriladi: asosiylik keyingisiga o'tadi
create or replace function public.dori_sklad_ochir(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def   boolean;
  v_ids   uuid[];
  v_keyin uuid;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select is_default into v_def from dori_warehouses where id = p_id;
  if v_def is null then
    raise exception 'SKLAD_TOPILMADI';
  end if;

  -- Qaysi dorilar ta'sirlanishini oldindan olamiz: sklad o'chgach
  -- takliflari ham cascade bilan ketadi va katalogni qayta yig'ish kerak
  select array_agg(product_id) into v_ids from dori_offers where warehouse_id = p_id;

  delete from dori_warehouses where id = p_id;

  -- Asosiy o'chgan bo'lsa - keyingisi asosiy bo'ladi
  if v_def then
    select id into v_keyin from dori_warehouses
     where is_active order by priority, name limit 1;
    if v_keyin is not null then
      update dori_warehouses set is_default = true where id = v_keyin;
    end if;
  end if;

  if v_ids is not null then
    perform dori_katalog_yigish(v_ids);
  else
    perform dori_katalog_yigish(null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'yangi_asosiy', (select name from dori_warehouses where is_default)
  );
end $$;

revoke all on function public.dori_sklad_ochir(uuid) from public, anon;
grant execute on function public.dori_sklad_ochir(uuid) to authenticated;
