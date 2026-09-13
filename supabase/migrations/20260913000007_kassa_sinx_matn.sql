-- =============================================================
-- CREDIT DEBIT — sinxronizatsiyada PUL MATN bo'lib ketsin
--
-- MUAMMO (sinovda ushlandi): `to_jsonb(qator)` `numeric` ustunni
-- JSON RAQAMIGA aylantiradi. JSON raqami esa — ikki aniqlikdagi
-- float. Ya'ni:
--
--   bazada   125000.50  (numeric(18,2))
--   javobda  125000.5   (double)
--
-- Bu loyihaning asosiy qoidasiga zid: pul float'da yuritilmaydi.
-- Hozirgi summalarda zarar ko'rinmaydi (double 9 000 000 000 000 000
-- gacha aniq), lekin:
--   · qiymat "125000.50" va 125000.5 bo'lib IKKI XIL shaklda
--     saqlanardi — mahalliy yaratilgani matn, serverdan kelgani raqam;
--   · kasr nollari yo'qolib, hujjatda "125000.5" ko'rinardi;
--   · katta summada (milliard tiyin) yaxlitlash xatosi boshlanardi.
--
-- YECHIM: pul ustunlari javobda ATAYLAB matn bo'lib ketadi
-- (`::text`). PostgREST ham aynan shunday qiladi — ya'ni endi
-- ikkala yo'l bir xil shakl beradi.
-- =============================================================

create or replace function public.kassa_ozgarishlar(
  p_kursor  bigint default 0,
  p_chegara int default 500
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_kursor  bigint := greatest(coalesce(p_kursor, 0), 0);
  v_chegara int    := least(greatest(coalesce(p_chegara, 500), 1), 2000);
  v_yangi   bigint := v_kursor;
  v_tosiq   bigint := null;   -- chegaraga to'lgan jadvalning oxirgi raqami
  v_h jsonb; v_t jsonb; v_k jsonb; v_y jsonb;
  v_n int; v_max bigint;
begin
  -- ---------- Hisoblar ----------
  -- `boshlangich` — pul, shuning uchun matn
  with q as (
    select * from public.kassa_hisoblar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(
           jsonb_agg(
             (to_jsonb(q) - 'boshlangich')
               || jsonb_build_object('boshlangich', q.boshlangich::text)
             order by q.o_raqam
           ),
           '[]'::jsonb
         ),
         count(*), max(q.o_raqam)
    into v_h, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Turkumlar (pul ustuni yo'q) ----------
  with q as (
    select * from public.kassa_turkumlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by q.o_raqam), '[]'::jsonb), count(*), max(q.o_raqam)
    into v_t, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Klientlar (pul ustuni yo'q) ----------
  with q as (
    select * from public.kassa_klientlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by q.o_raqam), '[]'::jsonb), count(*), max(q.o_raqam)
    into v_k, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Yozuvlar ----------
  -- `summa` va `kurs` — pul va kurs, ikkalasi ham matn
  with q as (
    select * from public.kassa_yozuvlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(
           jsonb_agg(
             (to_jsonb(q) - 'summa' - 'kurs')
               || jsonb_build_object('summa', q.summa::text, 'kurs', q.kurs::text)
             order by q.o_raqam
           ),
           '[]'::jsonb
         ),
         count(*), max(q.o_raqam)
    into v_y, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  if v_tosiq is not null then
    v_yangi := v_tosiq;
  end if;

  return jsonb_build_object(
    'kursor',    v_yangi,
    -- «yana bor» bo'lsa mijoz darhol keyingi paketni so'raydi
    'yana',      v_tosiq is not null,
    'hisoblar',  v_h,
    'turkumlar', v_t,
    'klientlar', v_k,
    'yozuvlar',  v_y
  );
end $$;

revoke all on function public.kassa_ozgarishlar(bigint, int) from public, anon;
grant execute on function public.kassa_ozgarishlar(bigint, int) to authenticated;
