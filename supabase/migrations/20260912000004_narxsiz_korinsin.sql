-- =============================================================
-- YUKCHIBOLLA — narxi yo'q mahsulot katalogda ko'rinsinmi
--
-- Hozircha qat'iy qoida bor edi: narxi yo'q variant mijoz katalogida
-- UMUMAN ko'rinmaydi (`my_effective_prices()` uni qaytarmaydi, ilova
-- esa narxsiz variantni tashlab yuboradi).
--
-- Bu ko'p hollarda to'g'ri — narxsiz tovarni sotib bo'lmaydi. Lekin
-- amalda boshqacha ham bo'ldi: yangi tashkilot 43 ta mahsulotni
-- yukladi, narx esa hali qo'yilmagan edi — do'kon butunlay bo'sh
-- ko'rindi va "ilova ishlamayapti" degan xulosa chiqdi.
--
-- Endi buni ADMIN hal qiladi: sozlamada bitta tugma.
--   o'chiq (standart) — eski xulq: narxsiz mahsulot ko'rinmaydi
--   yoqilgan        — assortiment ko'rinadi, narx o'rnida "Narx
--                      kelishiladi" yozuvi chiqadi
--
-- MUHIM: ko'rinish BUYURTMA BERISH degani emas. Narxsiz variantni
-- savatga qo'shib bo'lmaydi, `create_order` esa uni allaqachon
-- `NARX_TOPILMADI` bilan rad etadi. Aks holda korxona 0 so'mga tovar
-- jo'natib, qarz noto'g'ri yozilardi.
-- =============================================================

alter table public.organizations
  add column if not exists narxsiz_korinsin boolean not null default false;

comment on column public.organizations.narxsiz_korinsin is
  'Narxi qo''yilmagan mahsulot mijoz katalogida ko''rinadimi. Ko''rinsa ham savatga qo''shib bo''lmaydi — narxsiz buyurtma qarzni buzadi.';

-- ---------- Admin o'zgartiradi ----------

create or replace function public.narxsiz_korinishni_saqla(p_qiymat boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  -- is_admin() YOLG'IZ yetarli emas: u har tenant adminiga ochiq.
  -- Yozuv faqat O'Z tashkilotiga tegadi.
  if not public.is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_qiymat is null then
    raise exception 'QIYMAT_YOQ';
  end if;

  update public.organizations
  set narxsiz_korinsin = p_qiymat
  where id = public.current_org_id();

  return p_qiymat;
end $$;

revoke all on function public.narxsiz_korinishni_saqla(boolean) from public, anon;
grant execute on function public.narxsiz_korinishni_saqla(boolean) to authenticated;

-- ---------- Katalog narxlari ----------
--
-- Faqat OXIRGI blok yangi: sozlama yoqilgan bo'lsa, mijoz tarifida
-- narxi yo'q variantlar ham qaytariladi — narx ustunlari bo'sh (null)
-- bilan. Ilova null narxni "Narx kelishiladi" deb ko'rsatadi va
-- savat tugmasini o'chiradi.

create or replace function public.my_effective_prices()
returns table (variant_id uuid, price numeric, currency text, orig_price numeric,
               disp_price numeric, disp_currency text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_group_id    uuid;
  v_manager_id  uuid;
  v_korinish    text;
  v_usd_rate    numeric(14,2);
  v_disp_val    text;
  v_org_id      uuid;
  v_narxsiz     boolean;
begin
  select p.customer_id, c.price_group_id, c.manager_id, c.display_currency, c.org_id
    into v_customer_id, v_group_id, v_manager_id, v_korinish, v_org_id
  from profiles p
  join customers c on c.id = p.customer_id and c.is_active
  where p.id = auth.uid();

  if v_customer_id is null then
    return;
  end if;

  if v_manager_id is not null then
    select usd_rate into v_usd_rate from managers where id = v_manager_id;
  end if;
  v_disp_val := korinish_valyutasi(v_korinish, v_usd_rate);

  select o.narxsiz_korinsin into v_narxsiz
  from organizations o where o.id = v_org_id;

  return query
  with hisob as (
    select
      pr.variant_id as vid,
      (coalesce(
        case when mcp.currency = 'USD' then round(mcp.price * v_usd_rate) else mcp.price end,
        case when mp.currency  = 'USD' then round(mp.price  * v_usd_rate) else mp.price  end,
        pr.price
      ))::numeric(14,0) as som_narx,
      coalesce(mcp.currency, mp.currency, 'UZS') as manba_val,
      case
        when coalesce(mcp.currency, mp.currency, 'UZS') = 'USD'
        then coalesce(mcp.price, mp.price)
        else null
      end::numeric(14,2) as asl_narx
    from prices pr
    left join manager_customer_prices mcp
      on v_manager_id is not null
     and mcp.manager_id = v_manager_id
     and mcp.customer_id = v_customer_id
     and mcp.variant_id = pr.variant_id
    left join manager_prices mp
      on v_manager_id is not null
     and mp.manager_id = v_manager_id
     and mp.variant_id = pr.variant_id
    where pr.price_group_id = v_group_id
  )
  select
    h.vid,
    h.som_narx,
    h.manba_val,
    h.asl_narx,
    korinish_narxi(h.som_narx, h.manba_val, h.asl_narx, v_korinish, v_usd_rate)::numeric(14,2),
    v_disp_val
  from hisob h

  union all

  -- Narxsiz variantlar — FAQAT sozlama yoqilgan bo'lsa. Narx null:
  -- ilova buni "Narx kelishiladi" deb ko'rsatadi, savatga qo'shmaydi.
  select
    v.id,
    null::numeric(14,0),
    'UZS'::text,
    null::numeric(14,2),
    null::numeric(14,2),
    v_disp_val
  from product_variants v
  join products pd on pd.id = v.product_id
  where coalesce(v_narxsiz, false)
    and pd.org_id = v_org_id
    and v.is_active
    and pd.is_active
    and not exists (
      select 1 from prices pr
      where pr.variant_id = v.id and pr.price_group_id = v_group_id
    );
end $$;
