-- =============================================================
--  PRAYS YUKLASHDA USTAMA
--
--  Ustama hozir faqat sklad sozlamasida turadi: prays yuklayotgan odam
--  boshqa ekranga o'tib, uni o'zgartirib, keyin qaytib kelishi kerak.
--  Amalda esa ustama aynan prays kelganda o'zgaradi - yangi prays, yangi
--  ustama.
--
--  dori_sklad_saqla() bor, lekin u skladning HAMMA maydonini talab qiladi
--  (nom, kod, telefon, manzil...). Yuklash ekranida ular yo'q va ularni
--  faqat ustama uchun tashib yurish - keyinchalik bittasi tushib qolib,
--  skladning telefoni o'chib ketishiga olib keladi.
--
--  Shuning uchun tor funksiya: faqat ustama, o'zgargach narx darhol
--  qayta hisoblanadi.
-- =============================================================

create or replace function public.dori_sklad_ustama(
  p_warehouse_id uuid,
  p_markup_pct   numeric default null,
  p_markup_sum   numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_narx int;
  v_zarar int;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if not exists (select 1 from dori_warehouses where id = p_warehouse_id) then
    raise exception 'SKLAD_TOPILMADI';
  end if;

  -- Manfiy ustama "chegirma" degani emas: chegirma uchun alohida ustun
  -- bor. Bu yerda manfiy qiymat kelsa - bu xato, narxni jimgina buzadi.
  if coalesce(p_markup_pct, 0) < 0 or coalesce(p_markup_sum, 0) < 0 then
    raise exception 'USTAMA_MANFIY';
  end if;

  update dori_warehouses
     set markup_pct = p_markup_pct,
         markup_sum = p_markup_sum,
         updated_at = now()
   where id = p_warehouse_id;

  -- Narx darhol qayta hisoblanadi: aks holda ustama o'zgargan, narx esa
  -- eski bo'lib qolardi va buni hech kim sezmasdi.
  v_narx := dori_offer_narx(p_warehouse_id, null);

  -- Zarariga ketadigan pozitsiya bormi. dori_offer_narx yaxlitlashni
  -- tannarxdan past tushirmaydi, lekin ATAYLAB qo'yilgan chegirma
  -- tushirishi mumkin - shuni ko'rsatamiz.
  select count(*) into v_zarar
  from dori_offers
  where warehouse_id = p_warehouse_id
    and base_price > 0
    and price < base_price;

  return jsonb_build_object(
    'narx_yangilandi', v_narx,
    'zarariga', v_zarar
  );
end $$;

revoke all on function public.dori_sklad_ustama(uuid, numeric, numeric) from public, anon;
grant execute on function public.dori_sklad_ustama(uuid, numeric, numeric) to authenticated;


-- ---------- Yuklashdan oldin ogohlantirish uchun ----------
-- "2 266 pozitsiya bor, yangi faylda 3 ta" - bu deyarli har doim xato
-- fayl yoki noto'g'ri varaq. Panel shuni oldindan so'rashi uchun
-- skladdagi hozirgi pozitsiya sonini biladigan tor funksiya.
create or replace function public.dori_sklad_pozitsiya(p_warehouse_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from dori_offers
  where warehouse_id = p_warehouse_id and is_super_admin();
$$;

revoke all on function public.dori_sklad_pozitsiya(uuid) from public, anon;
grant execute on function public.dori_sklad_pozitsiya(uuid) to authenticated;
