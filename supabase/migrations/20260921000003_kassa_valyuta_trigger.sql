-- =============================================================
--  YANGI TASHKILOTGA ASOSIY VALYUTA
--
--  Sinov topgan kamchilik (21.09):
--
--    ✗ yangi tashkilotda asosiy valyuta bor  → 0 ta
--    ✗ IKKINCHI asosiy valyuta rad etiladi
--
--  Ikkinchisi birinchisining OQIBATI: asosiy valyuta umuman
--  bo'lmagani uchun unikal indeks ishga tushmaydi — birinchi
--  `asosiy = true` qatorni u bemalol qabul qiladi.
--
--  Sabab. 20260921000002 dagi backfill FAQAT o'sha paytda
--  mavjud tashkilotlarga qator qo'shgan. Keyin ochilgani —
--  `kassa_royxatdan_ot`, `kassa_biznes_qosh` yoki to'g'ridan
--  to'g'ri `insert` bilan — qatorsiz qoladi.
--
--  Yechim TRIGGER, RPC emas. RPC ga qo'shsak, uchta joyni
--  eslab yurish kerak bo'lardi va to'rtinchisi qo'shilganda
--  yana esdan chiqardi. Trigger esa yo'lidan qat'i nazar
--  ishlaydi.
--
--  Qamrov TOR: faqat `yonalishlar @> array['kassa']` bo'lgan
--  tashkilot. B2B tenantiga tegmaydi.
-- =============================================================

create or replace function public.tg_kassa_asosiy_valyuta()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not (coalesce(new.yonalishlar, array[]::text[]) @> array['kassa']) then
    return new;
  end if;

  -- 'UZS' ataylab: trigger tashkilot yaratilganda ishlaydi va
  -- o'sha paytda hali hisob yo'q, ya'ni valyutani hisobdan olib
  -- bo'lmaydi. Ro'yxatdan o'tish oqimi ham UZS li hisob
  -- yaratadi, demak ikkisi mos.
  --
  -- Boshqa valyutada ishlaydigan odam uni sozlamadan
  -- almashtiradi — bu bir marta qilinadigan ish.
  insert into public.kassa_valyutalar (org_id, valyuta, kurs, asosiy)
  values (new.id, 'UZS', 1, true)
  on conflict (org_id, valyuta) do nothing;

  return new;
end $$;

revoke all on function public.tg_kassa_asosiy_valyuta() from public, anon, authenticated;

drop trigger if exists trg_kassa_asosiy_valyuta on public.organizations;
create trigger trg_kassa_asosiy_valyuta
  after insert on public.organizations
  for each row execute function public.tg_kassa_asosiy_valyuta();


-- ---------- Qatorsiz qolganlarga ----------
--
-- 20260921000002 dan keyin, lekin bu migratsiyadan oldin
-- ochilgan tashkilotlar. Ikki holat bor va ular BOSHQACHA
-- hal qilinadi.

-- 1. Qatori BOR, lekin asosiysi yo‘q.
--
--    Bunda yangi qator qo‘shib bo‘lmaydi: `on conflict
--    (org_id, valyuta)` unikal ASOSIY indeksini ushlamaydi va
--    tashkilot asosiysiz qolib ketardi. Shuning uchun
--    borlaridan birinchisi asosiy qilinadi.
with nomzod as (
  select distinct on (v.org_id) v.id
    from public.kassa_valyutalar v
    join public.organizations o on o.id = v.org_id
   where o.yonalishlar @> array['kassa']
     and not exists (
       select 1 from public.kassa_valyutalar x
        where x.org_id = v.org_id and x.asosiy
     )
   order by v.org_id, v.created_at
)
update public.kassa_valyutalar set asosiy = true
 where id in (select id from nomzod);

-- 2. Umuman qatori yo‘q.
insert into public.kassa_valyutalar (org_id, valyuta, kurs, asosiy)
select o.id,
       coalesce(
         (select h.valyuta from public.kassa_hisoblar h
           where h.org_id = o.id order by h.tartib limit 1),
         'UZS'
       ),
       1,
       true
  from public.organizations o
 where o.yonalishlar @> array['kassa']
   and not exists (
     select 1 from public.kassa_valyutalar v where v.org_id = o.id
   );
