-- =============================================================
--  0-BOSQICH · XATOLIK TELEMETRIYASI
--
--  "Buglar ko'p" — lekin ular qayerda va qanchalik tez-tez chiqayotgani
--  o'lchanmayapti. Shu jadval bo'lgach, bug'lar o'zi ro'yxatga tushadi:
--  qaysi ekran, qaysi qurilma, necha marta, nechta foydalanuvchida.
--
--  NEGA TASHQI XIZMAT (Sentry) EMAS: u ro'yxatdan o'tish, kalit va oylik
--  to'lov talab qiladi, ustiga mijoz ma'lumotlari uchinchi tomon serveriga
--  chiqadi. Bizga kerak bo'lgan narsa — "qaysi ekran necha marta yiqildi"
--  — o'z bazamizda ham to'liq ishlaydi.
--
--  XAVFSIZLIK:
--   * jadval faqat RPC orqali to'ldiriladi, to'g'ridan-to'g'ri INSERT yo'q;
--   * RPC ATAYLAB anon'ga ham ochiq — xatolarning bir qismi kirish
--     ekranida, ya'ni login BO'LMAGAN holatda chiqadi va aynan o'shalar
--     eng og'riqlisi. Buning evaziga:
--       - matn uzunligi cheklanadi (spam va katta yuk bo'lmasin),
--       - bir daqiqada 20 tadan ortiq yozuv qabul qilinmaydi,
--       - o'qishni faqat super admin ko'radi.
--   * xato matnidan tashqari hech qanday shaxsiy ma'lumot yozilmaydi.
-- =============================================================

create table if not exists public.client_errors (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  app         text not null check (app in ('mobile', 'admin')),
  platform    text,
  app_version text,
  screen      text,
  message     text not null,
  stack       text,
  extra       jsonb,
  profile_id  uuid references public.profiles(id) on delete set null,
  org_id      uuid references public.organizations(id) on delete set null,
  -- Bir xil xatoni guruhlash uchun: ekran + xabar boshi
  fingerprint text not null
);

create index if not exists client_errors_fp_idx  on public.client_errors (fingerprint, at desc);
create index if not exists client_errors_at_idx  on public.client_errors (at desc);

alter table public.client_errors enable row level security;

-- Faqat super admin ko'radi: xato matnida ichki tafsilotlar bo'lishi mumkin
drop policy if exists "client_errors: super_admin read" on public.client_errors;
create policy "client_errors: super_admin read"
  on public.client_errors for select to authenticated
  using (is_super_admin());

revoke all on table public.client_errors from anon, authenticated;

-- ---------- Yozish ----------
create or replace function public.report_client_error(
  p_app         text,
  p_message     text,
  p_screen      text default null,
  p_stack       text default null,
  p_platform    text default null,
  p_app_version text default null,
  p_extra       jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg   text := left(coalesce(p_message, ''), 500);
  v_stack text := left(coalesce(p_stack, ''), 4000);
  v_fp    text;
  v_uid   uuid := auth.uid();
  v_org   uuid;
begin
  if p_app not in ('mobile', 'admin') or v_msg = '' then
    return;                       -- jim rad etamiz: telemetriya hech qachon ilovani buzmasin
  end if;

  -- Oddiy tezlik chegarasi: daqiqasiga 20 ta yozuvdan ortig'i tashlab yuboriladi
  if (select count(*) from client_errors where at > now() - interval '1 minute') >= 20 then
    return;
  end if;

  select org_id into v_org from profiles where id = v_uid;

  v_fp := md5(coalesce(p_screen, '') || '|' || left(v_msg, 200));

  insert into client_errors (app, platform, app_version, screen, message, stack, extra,
                             profile_id, org_id, fingerprint)
  values (p_app, left(coalesce(p_platform, ''), 40), left(coalesce(p_app_version, ''), 40),
          left(coalesce(p_screen, ''), 80), v_msg, nullif(v_stack, ''), p_extra,
          v_uid, v_org, v_fp);
end $$;

revoke all on function public.report_client_error(text, text, text, text, text, text, jsonb) from public;
-- Kirish ekranidagi xatolar login bo'lmasdan yuboriladi — shuning uchun anon ham
grant execute on function public.report_client_error(text, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- ---------- O'qish: guruhlangan ko'rinish ----------
-- Konsolda kerak bo'ladigan asosiy savol: "qaysi xato eng ko'p chiqyapti".
create or replace function public.client_error_groups(
  p_days  int default 7,
  p_limit int default 50
)
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

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select e.fingerprint,
           min(e.message)                     as message,
           min(e.screen)                      as screen,
           min(e.app)                         as app,
           count(*)                           as hodisalar,
           count(distinct e.profile_id)       as foydalanuvchilar,
           max(e.at)                          as oxirgi,
           min(e.at)                          as birinchi,
           (array_agg(distinct e.platform))   as platformalar,
           (array_agg(e.stack order by e.at desc))[1] as stack
    from client_errors e
    where e.at > now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
    group by e.fingerprint
    order by count(*) desc
    limit least(coalesce(p_limit, 50), 200)
  ) t;

  return v_res;
end $$;

revoke all on function public.client_error_groups(int, int) from public, anon;
grant execute on function public.client_error_groups(int, int) to authenticated;

-- ---------- Tozalash ----------
-- 90 kundan eskisi kerak emas: telemetriya tarix uchun emas, tuzatish uchun.
create or replace function public.purge_client_errors()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.client_errors where at < now() - interval '90 days';
$$;

revoke all on function public.purge_client_errors() from public, anon, authenticated;

select cron.unschedule('purge-client-errors')
where exists (select 1 from cron.job where jobname = 'purge-client-errors');

select cron.schedule('purge-client-errors', '30 2 * * *', 'select public.purge_client_errors();');
