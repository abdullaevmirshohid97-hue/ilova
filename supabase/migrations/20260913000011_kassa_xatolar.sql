-- =============================================================
-- CREDIT DEBIT — MIJOZ TOMONIDAGI XATOLAR
--
-- Server xatosini biz ko'ramiz, TELEFONDAGI xatoni esa yo'q.
-- Ilova oq ekran bo'lib qolsa, foydalanuvchi "ishlamayapti" deb
-- yozadi, biz esa nima bo'lganini so'rab-surishtirib topamiz —
-- odatda topolmaymiz va odam qaytib kelmaydi.
--
-- Shuning uchun ilova o'z xatosini shu jadvalga yozadi. Bu
-- "telemetriya" emas: hech qanday xatti-harakat, ekran ochilishi
-- yoki summalar YO'Q. Faqat xato matni, qayerda bo'lgani va
-- qurilma turi.
--
-- MAXFIYLIK: xato matni ichida pul summasi bo'lib qolishi mumkin
-- (masalan "NaN dan 12000 ga o'girib bo'lmadi"). Shuning uchun
-- jadvalni FAQAT egasi va superadmin ko'radi, boshqa hech kim.
--
-- SPAM: buzuq ilova soniyasiga yuzlab xato yozib, jadvalni to'ldirib
-- yuborishi mumkin. Shuning uchun `kassa_xato_yoz` bir qurilmadan
-- KUNIGA 50 tadan ortiq qabul qilmaydi va bir xil xatoni takror
-- yozmaydi — sanog'ini oshiradi.
-- =============================================================

create table if not exists public.kassa_xatolar (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  -- Qaysi ekran yoki amal: "YozuvOynasi.yubor", "sinx.yubor"
  joy         text not null,
  xabar       text not null,
  -- Qisqartirilgan stack (5 qator) — qayerdan kelganini topish uchun
  iz          text,
  -- "android 34", "web Chrome", "ios 17"
  qurilma     text,
  -- Ilova versiyasi: tuzatilgan xato qaytib kelganini shundan bilamiz
  versiya     text,
  -- Bir xil xato necha marta takrorlandi
  soni        integer not null default 1,
  -- Xatolarni guruhlash kaliti: sha256(joy || xabar)
  barmoq      text not null,
  birinchi_at timestamptz not null default now(),
  oxirgi_at   timestamptz not null default now()
);

create unique index if not exists kassa_xatolar_barmoq_uniq
  on public.kassa_xatolar (org_id, barmoq);
create index if not exists kassa_xatolar_org_idx
  on public.kassa_xatolar (org_id, oxirgi_at desc);

alter table public.kassa_xatolar enable row level security;

-- O'z tashkilotining xatolari — ko'rish uchun. Yozish faqat
-- quyidagi funksiya orqali (u chegarani tekshiradi).
drop policy if exists "kassa_xatolar: ozi korsin" on public.kassa_xatolar;
create policy "kassa_xatolar: ozi korsin" on public.kassa_xatolar
  for select to authenticated
  using (org_id = current_org_id());


-- ---------- Yozish ----------
-- `security definer`: RLS'da insert siyosati ataylab yo'q, chunki
-- to'g'ridan-to'g'ri insert chegarani chetlab o'tardi.
create or replace function public.kassa_xato_yoz(
  p_joy     text,
  p_xabar   text,
  p_iz      text default null,
  p_qurilma text default null,
  p_versiya text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org    uuid := current_org_id();
  v_barmoq text;
  v_bugun  integer;
begin
  if v_org is null then
    return;  -- tashkilotsiz foydalanuvchi: jim o'tkazamiz
  end if;

  -- Uzun matnni kesamiz: xato izi 100 KB bo'lib kelishi mumkin
  p_joy   := left(coalesce(p_joy, 'nomalum'), 120);
  p_xabar := left(coalesce(p_xabar, ''), 500);
  p_iz    := left(p_iz, 2000);

  v_barmoq := encode(extensions.digest(p_joy || '|' || p_xabar, 'sha256'), 'hex');

  -- Kunlik chegara: bir tashkilotdan 50 xil xato yetarli.
  -- Takroriy xato sanog'i oshaveradi, u chegaraga kirmaydi.
  select count(*) into v_bugun
  from public.kassa_xatolar
  where org_id = v_org and birinchi_at > now() - interval '1 day';

  if v_bugun >= 50 then
    -- Chegaradan oshdi: faqat MAVJUD xatoning sanog'ini oshiramiz
    update public.kassa_xatolar
       set soni = soni + 1, oxirgi_at = now()
     where org_id = v_org and barmoq = v_barmoq;
    return;
  end if;

  insert into public.kassa_xatolar (
    org_id, user_id, joy, xabar, iz, qurilma, versiya, barmoq
  ) values (
    v_org, auth.uid(), p_joy, p_xabar, p_iz, left(p_qurilma, 60), left(p_versiya, 20), v_barmoq
  )
  on conflict (org_id, barmoq) do update
    set soni      = public.kassa_xatolar.soni + 1,
        oxirgi_at = now(),
        -- Yangi iz foydaliroq: oxirgi holatni saqlaymiz
        iz        = coalesce(excluded.iz, public.kassa_xatolar.iz),
        versiya   = coalesce(excluded.versiya, public.kassa_xatolar.versiya);
end;
$$;

revoke all on function public.kassa_xato_yoz(text, text, text, text, text) from public;
grant execute on function public.kassa_xato_yoz(text, text, text, text, text) to authenticated;


-- ---------- Ko'rish ----------
-- Ilovadagi «Sozlamalar → Xatolar» ro'yxati uchun.
create or replace function public.kassa_xatolarim()
returns table (
  id uuid, joy text, xabar text, qurilma text, versiya text,
  soni integer, oxirgi_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select x.id, x.joy, x.xabar, x.qurilma, x.versiya, x.soni, x.oxirgi_at
    from public.kassa_xatolar x
   where x.org_id = current_org_id()
   order by x.oxirgi_at desc
   limit 50;
$$;

revoke all on function public.kassa_xatolarim() from public;
grant execute on function public.kassa_xatolarim() to authenticated;
