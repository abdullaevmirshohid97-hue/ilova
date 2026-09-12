-- =============================================================
-- YUKCHIBOLLA — yangi tenant tarifsiz tug'iladi (TUZATISH)
--
-- Bo'lgan hodisa: b2b ulgurjida yangi tenantga menejer qo'shilganda
--   MENEJER: TARIF_TOPILMADI: org 157ecc4a-...
-- chiqardi. Zanjir:
--   managers ga insert -> trg_menejer_xaridori -> menejer_xaridori()
--   -> org'ning birinchi tarifi qidiriladi -> yo'q -> exception.
--
-- Sabab menejerda emas: `super-admin-create-org` tenantni ochadi,
-- lekin unga bitta ham price_groups qatori qo'shmaydi. Eng birinchi
-- tenant tariflarni migratsiya backfill'idan meros olgan, keyingilari
-- esa bo'sh qolgan. customers.price_group_id ham NOT NULL — ya'ni
-- bunday tenantda MIJOZ ham qo'shib bo'lmasdi, faqat xato menejerda
-- oldinroq ko'rindi.
--
-- Yechim uch qavat:
--   1. Har yangi tenantga 'Standart' tarif triggeri bilan beriladi
--   2. Tarifi yo'q mavjud tenantlarga backfill
--   3. menejer_xaridori() o'zini tiklaydi — tarif topilmasa yaratadi
--      (admin Sozlamalarda oxirgi tarifni o'chirib yuborishi mumkin)
--
-- Nomi 'Standart': panel qat'iy shu nomni qidirmaydi
-- (`apps/admin/src/lib/tarif.ts` — asosiy tarifni o'zi tanlaydi),
-- shuning uchun admin uni erkin qayta nomlashi mumkin.
-- =============================================================

-- ---------- 1. Yangi tenant ochilganda standart tarif ----------

create or replace function public.tg_org_standart_tarif()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.price_groups (org_id, name)
  values (new.id, 'Standart')
  on conflict (org_id, name) do nothing;
  return new;
end $$;

drop trigger if exists trg_org_standart_tarif on public.organizations;
create trigger trg_org_standart_tarif
  after insert on public.organizations
  for each row execute function public.tg_org_standart_tarif();

-- Trigger funksiyasini PostgREST orqali chaqirib bo'lmaydi, lekin
-- loyihada ALTER DEFAULT PRIVILEGES turibdi — odat bo'yicha yopamiz.
revoke all on function public.tg_org_standart_tarif() from public, anon, authenticated;

-- ---------- 2. Tarifsiz qolgan tenantlar ----------

insert into public.price_groups (org_id, name)
select o.id, 'Standart'
from public.organizations o
where not exists (
  select 1 from public.price_groups g where g.org_id = o.id
);

-- ---------- 3. menejer_xaridori o'zini tiklasin ----------

create or replace function public.menejer_xaridori(p_manager_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id      uuid;
  v_mgr     record;
  v_group   uuid;
  v_tel     text;
  v_urinish int := 0;
begin
  select id into v_id from customers where proxy_manager_id = p_manager_id;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_mgr from managers where id = p_manager_id;
  if not found then
    raise exception 'MENEJER_TOPILMADI';
  end if;

  -- price_group_id majburiy. Qaysi tarif bo'lishi ahamiyatsiz: korxona
  -- menejerga BAZA narxida sotadi, tarif narxi ishlatilmaydi. Lekin
  -- ustun bo'sh qololmaydi, shuning uchun org'ning birinchi tarifi.
  select id into v_group from price_groups
  where org_id = v_mgr.org_id order by name limit 1;

  -- Tarif yo'qligi menejer qo'shishni to'sib qo'ymasin: avval
  -- TARIF_TOPILMADI deb yiqilardi va admin nima qilishni bilmasdi.
  if v_group is null then
    insert into price_groups (org_id, name) values (v_mgr.org_id, 'Standart')
    on conflict (org_id, name) do nothing
    returning id into v_group;
    if v_group is null then
      select id into v_group from price_groups
      where org_id = v_mgr.org_id order by name limit 1;
    end if;
  end if;

  -- customers.phone GLOBAL unikal. Menejerning telefoni allaqachon
  -- mijoz sifatida band bo'lishi mumkin — o'shanda qo'shimcha belgi
  -- qo'shamiz. Telefonni saqlaymiz: admin menejerga qo'ng'iroq
  -- qilishi kerak bo'ladi.
  v_tel := v_mgr.phone;
  while exists (select 1 from customers where phone = v_tel) loop
    v_urinish := v_urinish + 1;
    v_tel := v_mgr.phone || ' (menejer' || case when v_urinish > 1 then ' ' || v_urinish else '' end || ')';
    if v_urinish > 20 then
      raise exception 'TELEFON_BAND: %', v_mgr.phone;
    end if;
  end loop;

  insert into customers (org_id, name, phone, price_group_id, proxy_manager_id,
                         display_currency, notes)
  values (v_mgr.org_id,
          v_mgr.name || ' (menejer)',
          v_tel,
          v_group,
          p_manager_id,
          'UZS',
          'Menejerning xaridor kartochkasi — avtomatik yaratilgan. Yashirin mijozlardan kelgan buyurtmalar shu yerga yoziladi.')
  returning id into v_id;

  return v_id;
end $$;

-- `create or replace` huquqlarni saqlaydi, lekin bu funksiya bir marta
-- authenticated uchun ochiq qolib ketgan edi — qayta yopamiz.
revoke all on function public.menejer_xaridori(uuid) from public, anon, authenticated;
