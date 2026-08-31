-- =============================================================
--  USTAMANI SUMMADA QO'YISH
--
--  Foiz kichik summalarda yaxshi ishlamaydi: 900 so'mlik doriga 5%
--  qo'yilsa 45 so'm bo'ladi, yaxlitlashdan keyin esa umuman yo'qoladi.
--  Shuning uchun "har quticha ustiga 2000 so'm" degan usul kerak -
--  foyda oldindan ma'lum va yaxlit bo'ladi.
--
--  Bazada markup_sum/discount_sum ustunlari allaqachon bor va hisoblagich
--  ularni biladi (dori_offer_narx). Yetishmayotgani - QO'YISH yo'li:
--  dori_price_rule_set va _bulk faqat foizni qabul qilardi, shuning
--  uchun panelda summa maydonini ko'rsatib bo'lmasdi.
--
--  QOIDA O'ZGARMAYDI: foiz va summa BITTA darajadan olinadi. Bir darajada
--  ikkalasi ham to'ldirilsa - avval foiz qo'shiladi, keyin summa
--  (tannarx * (1 + foiz/100) + summa). Ya'ni "5% ustiga yana 2000 so'm".
-- =============================================================

-- ---------- 1. Bitta qoida (umumiy / guruh / dori) ----------
create or replace function public.dori_price_rule_set(
  p_scope        text,
  p_target_key   text default null,
  p_markup_pct   numeric default null,
  p_discount_pct numeric default null,
  p_note         text default null,
  p_markup_sum   numeric default null,
  p_discount_sum numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  int;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Hammasi bo'sh bo'lsa — qoidani o'chirish deb tushuniladi
  if p_markup_pct is null and p_discount_pct is null
     and p_markup_sum is null and p_discount_sum is null then
    update dori_price_rules
       set is_active = false, updated_at = now()
     where is_active and scope = p_scope
       and coalesce(target_key, '') = coalesce(p_target_key, '');
  else
    insert into dori_price_rules (scope, target_key, markup_pct, discount_pct,
                                  markup_sum, discount_sum, note, created_by)
    values (p_scope, p_target_key, p_markup_pct, p_discount_pct,
            p_markup_sum, p_discount_sum, p_note, auth.uid())
    on conflict (scope, coalesce(target_key, '')) where is_active
    do update set markup_pct   = excluded.markup_pct,
                  discount_pct = excluded.discount_pct,
                  markup_sum   = excluded.markup_sum,
                  discount_sum = excluded.discount_sum,
                  note         = excluded.note,
                  updated_at   = now()
    returning id into v_id;
  end if;

  v_n := dori_narx_hisobla(null);
  return jsonb_build_object('ok', true, 'rule_id', v_id, 'ozgargan_narx', v_n);
end $$;

revoke all on function public.dori_price_rule_set(text, text, numeric, numeric, text, numeric, numeric)
  from public, anon;
grant execute on function public.dori_price_rule_set(text, text, numeric, numeric, text, numeric, numeric)
  to authenticated;

-- Eski 5 argumentli variant olib tashlanadi: default'lar tufayli ikkalasi
-- ham bir xil chaqiruvga to'g'ri kelib, "function is not unique" bo'lardi
drop function if exists public.dori_price_rule_set(text, text, numeric, numeric, text);

-- ---------- 2. Tanlangan dorilarga ----------
create or replace function public.dori_price_rule_bulk(
  p_ids          uuid[],
  p_markup_pct   numeric default null,
  p_discount_pct numeric default null,
  p_note         text default null,
  p_markup_sum   numeric default null,
  p_discount_sum numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', true, 'ozgargan_narx', 0);
  end if;

  if p_markup_pct is null and p_discount_pct is null
     and p_markup_sum is null and p_discount_sum is null then
    update dori_price_rules
       set is_active = false, updated_at = now()
     where is_active and scope = 'product' and target_key = any (
       select unnest(p_ids)::text
     );
  else
    insert into dori_price_rules (scope, target_key, markup_pct, discount_pct,
                                  markup_sum, discount_sum, note, created_by)
    select 'product', i::text, p_markup_pct, p_discount_pct,
           p_markup_sum, p_discount_sum, p_note, auth.uid()
    from unnest(p_ids) i
    on conflict (scope, coalesce(target_key, '')) where is_active
    do update set markup_pct   = excluded.markup_pct,
                  discount_pct = excluded.discount_pct,
                  markup_sum   = excluded.markup_sum,
                  discount_sum = excluded.discount_sum,
                  note         = excluded.note,
                  updated_at   = now();
  end if;

  v_n := dori_narx_hisobla(p_ids);
  return jsonb_build_object('ok', true, 'ozgargan_narx', v_n);
end $$;

revoke all on function public.dori_price_rule_bulk(uuid[], numeric, numeric, text, numeric, numeric)
  from public, anon;
grant execute on function public.dori_price_rule_bulk(uuid[], numeric, numeric, text, numeric, numeric)
  to authenticated;

drop function if exists public.dori_price_rule_bulk(uuid[], numeric, numeric, text);

-- ---------- 3. Qoidalar ro'yxatida summa ham ko'rinsin ----------
create or replace function public.dori_price_rules_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.tartib, t.created_at desc), '[]'::jsonb) into v_res
  from (
    select r.id, r.scope, r.target_key, r.markup_pct, r.discount_pct,
           r.markup_sum, r.discount_sum, r.note, r.created_at,
           case r.scope when 'global' then 1 when 'group' then 2 else 3 end as tartib,
           case r.scope
             when 'product' then (select p.name from dori_products p where p.id::text = r.target_key)
             else r.target_key
           end as nishon
    from dori_price_rules r
    where r.is_active
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_price_rules_list() from public, anon;
grant execute on function public.dori_price_rules_list() to authenticated;

-- ---------- 4. Umumiy ko'rsatkichlarga FOYDA qo'shildi ----------
-- "Summa kiritsak foydani ham yaxlit ko'ra olamiz" - foyda aynan shu
-- yerda ko'rinadi: har dorida sotuv - tannarx, va ularning yig'indisi.
create or replace function public.dori_price_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select jsonb_build_object(
    'jami',       (select count(*) from dori_products where is_active),
    'yaxlitlash', (select rounding from dori_settings where id),
    'umumiy_ustama',       (select markup_pct   from dori_price_rules where is_active and scope = 'global'),
    'umumiy_chegirma',     (select discount_pct from dori_price_rules where is_active and scope = 'global'),
    'umumiy_ustama_sum',   (select markup_sum   from dori_price_rules where is_active and scope = 'global'),
    'umumiy_chegirma_sum', (select discount_sum from dori_price_rules where is_active and scope = 'global'),
    'ortacha_ustama', (
      select round(avg(case when coalesce(base_price, 0) > 0
                       then (price - base_price) * 100.0 / base_price end), 2)
      from dori_products where is_active
    ),
    -- Bitta dorida o'rtacha necha so'm foyda
    'ortacha_foyda', (
      select round(avg(coalesce(price, 0) - coalesce(base_price, 0)))
      from dori_products where is_active and price is not null and base_price is not null
    ),
    -- Foydasi umuman yo'q (yoki manfiy) pozitsiyalar: foiz kichik
    -- summalarda yaxlitlashdan keyin yo'qoladi - shuni ko'rsatamiz
    'foydasiz', (
      select count(*) from dori_products
      where is_active and price is not null and base_price is not null
        and price - base_price <= 0
    ),
    'guruhlar', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select coalesce(grp, '—') as grp, count(*) as n
        from dori_products where is_active
        group by 1 order by count(*) desc limit 30
      ) t
    )
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_price_overview() from public, anon;
grant execute on function public.dori_price_overview() to authenticated;
