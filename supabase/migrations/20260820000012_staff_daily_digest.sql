-- =============================================================
--  4-BOSQICH — kun yakuni
--
--  Har kuni soat 20:00 (Toshkent) da ulangan xodimga qisqa yakun
--  keladi: bugun nechta buyurtma, qancha summa, nechtasi hali
--  tasdiqlanmagan. Hech narsa bo'lmagan kunda xabar YUBORILMAYDI —
--  har kuni "0 buyurtma" deb yozaversa, xabarga e'tibor so'nadi.
--
--  Summa har kim uchun o'zi ko'radigan narxda: admin baza narxda,
--  menejer o'z narxida (dollarli savdo bo'lsa dollarda). Bu qoida
--  order_usd_total() va staff_* funksiyalari bilan bir xil.
-- =============================================================

create or replace function public.staff_daily_digest()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bosh timestamptz := (date_trunc('day', now() at time zone 'Asia/Tashkent'))
                        at time zone 'Asia/Tashkent';
  v_res jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select st.chat_id,
           p.role,
           x.orders_count,
           x.pending_count,
           -- Dollar faqat menejerda va faqat bugungi HAMMA buyurtma
           -- dollarda bo'lsa: aralash kunni qo'shib bo'lmaydi
           case when p.role = 'manager' and x.orders_count > 0
                     and x.usd_count = x.orders_count
                then 'USD' else 'UZS' end as currency,
           case when p.role in ('admin', 'super_admin') then x.base_sum
                when x.orders_count > 0 and x.usd_count = x.orders_count then x.usd_sum
                else x.real_sum end as total
    from staff_telegram st
    join profiles p on p.id = st.profile_id
    join lateral (
      select count(*)                                          as orders_count,
             count(*) filter (where o.status = 'new')          as pending_count,
             count(*) filter (where order_usd_total(o.id) is not null) as usd_count,
             coalesce(sum(o.base_total), 0)                    as base_sum,
             coalesce(sum(o.total), 0)                         as real_sum,
             coalesce(sum(order_usd_total(o.id)), 0)           as usd_sum
      from orders o
      join customers c on c.id = o.customer_id
      where o.created_at >= v_bosh
        and o.status <> 'cancelled'
        and (
          p.role = 'super_admin'
          or (p.role = 'admin'   and c.org_id     = p.org_id)
          or (p.role = 'manager' and c.manager_id = p.manager_id)
        )
    ) x on true
    where x.orders_count > 0
  ) t;

  return v_res;
end $$;

revoke all on function public.staff_daily_digest() from anon, authenticated, public;
grant execute on function public.staff_daily_digest() to service_role;

-- ---------- Kunlik chaqiruv ----------
-- Trigger bilan bir xil yo'l: manzil va maxfiy kalit app_secrets'da,
-- ya'ni migratsiya faylida maxfiy narsa yo'q.
create or replace function public.staff_send_daily_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from app_secrets where key = 'staff_notify_url';
  select value into v_secret from app_secrets where key = 'internal_notify_secret';
  if v_url is null or v_secret is null then return; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-internal-secret', v_secret),
    body    := jsonb_build_object('kind', 'digest')
  );
end $$;

revoke all on function public.staff_send_daily_digest() from anon, authenticated, public;

create extension if not exists pg_cron;

-- 15:00 UTC = 20:00 Toshkent (pg_cron UTC'da ishlaydi)
select cron.unschedule('staff-daily-digest')
where exists (select 1 from cron.job where jobname = 'staff-daily-digest');

select cron.schedule('staff-daily-digest', '0 15 * * *', 'select public.staff_send_daily_digest();');
