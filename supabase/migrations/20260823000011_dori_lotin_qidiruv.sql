-- =============================================================
--  IKKI ALIFBODA QIDIRUV
--
--  Katalogdagi nomlar deyarli hammasi kirillcha ("Азитромицин"), lekin
--  mijoz lotinda yozishi mumkin ("azitromitsin"). Hozir bunday so'rov
--  hech narsa topmaydi — bu esa botning eng ko'p ishlatiladigan joyi.
--
--  YECHIM: ikkala tomon ham bitta UMUMIY KO'RINISHGA keltiriladi.
--  Nom saqlanganda `name_lat` ustuniga, so'rov esa qidiruv paytida —
--  shundan keyin ular bir maydonda solishtiriladi.
--
--  Umumiy ko'rinish shunchaki transliteratsiya emas: yozuv variantlari
--  ham birlashtiriladi, chunki bir dori uch xil yoziladi —
--    Азитромицин / azitromitsin / azithromycin
--  Qoidalar: ph->f, th->t, kh/x->h, y->i, ts/c->s, q->k, w->v va
--  takroriy harflar qisqartiriladi. Uchalasi ham "azitromisin" bo'ladi.
-- =============================================================

create or replace function public.dori_lat(p_text text)
returns text
language sql
immutable
as $$
  with t as (select lower(coalesce(p_text, '')) as s),
  -- 1) Kirill -> lotin. Ko'p harfli almashtirishlar avval:
  kop as (
    select replace(replace(replace(replace(replace(replace(replace(replace(
             replace(replace(replace(s,
             'щ', 'sch'), 'ш', 'sh'), 'ч', 'ch'), 'ц', 'ts'),
             'ю', 'yu'), 'я', 'ya'), 'ё', 'yo'), 'ж', 'j'),
             'ъ', ''), 'ь', ''), 'ы', 'i') as s
    from t
  ),
  -- 2) Qolgan bir harflilar
  bir as (
    select translate(s,
      'абвгдезийклмнопрстуфхэ',
      'abvgdeziyklmnoprstufhe') as s
    from kop
  ),
  -- 3) Yozuv variantlarini birlashtirish. Tartib muhim: 'ch'/'sh' avval
  --    vaqtincha belgilanadi, aks holda ularning 'c' va 's' harflari
  --    keyingi qoidalarga tushib ketardi.
  variant as (
    select replace(replace(replace(replace(replace(replace(replace(replace(
             replace(replace(replace(replace(replace(s,
             'ch', '\1'), 'sh', '\2'),
             'ph', 'f'), 'th', 't'), 'kh', 'h'),
             'x', 'h'), 'w', 'v'), 'y', 'i'),
             'ts', 's'), 'c', 's'), 'q', 'k'),
             '\1', 'ch'), '\2', 'sh') as s
    from bir
  )
  -- 4) Faqat harf va raqam; takroriy harflar bittaga tushadi
  select regexp_replace(
           regexp_replace(s, '[^a-z0-9]+', '', 'g'),
           '(.)\1+', '\1', 'g'
         )
  from variant;
$$;

-- ---------- Ustun va indeks ----------
alter table public.dori_products
  add column if not exists name_lat text;

update public.dori_products
   set name_lat = dori_lat(name)
 where name_lat is distinct from dori_lat(name);

create index if not exists dori_products_lat_trgm_idx
  on public.dori_products using gin (name_lat gin_trgm_ops);

-- Nom o'zgarganda name_lat o'zi yangilanadi — importda unutib qo'yilmasin
create or replace function public.dori_lat_trigger()
returns trigger
language plpgsql
as $$
begin
  new.name_lat := public.dori_lat(new.name);
  return new;
end $$;

drop trigger if exists dori_products_lat on public.dori_products;
create trigger dori_products_lat
  before insert or update of name on public.dori_products
  for each row execute function public.dori_lat_trigger();

-- ---------- Qidiruv: ikkala alifboda ham ----------
create or replace function public.dori_search(p_q text, p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v_lat text;
  v_res jsonb;
begin
  if v_q is null or length(v_q) < 2 then
    return '[]'::jsonb;
  end if;

  v_lat := dori_lat(v_q);
  if length(v_lat) < 2 then
    return '[]'::jsonb;
  end if;

  -- word_similarity(): so'rovni nomning ENG MOS BO'LAGI bilan solishtiradi.
  -- similarity() bo'lsa uzun nom bilan qisqa so'rov solishtirilganda ball
  -- juda past chiqib, hech narsa topilmasdi.
  perform set_config('pg_trgm.word_similarity_threshold', '0.45', true);

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select p.id, p.name, p.manufacturer, p.price, p.unit, p.grp,
           coalesce(p.stock, 0) as stock,
           (select min(b.expiry) from dori_batches b
             where b.product_id = p.id and b.expiry >= current_date) as eng_yaqin_muddat
    from dori_products p
    where p.is_active
      and (
        -- asl yozuvda (kirillcha so'rov kirillcha nomga)
        p.name ilike v_q || '%'
        or p.name ilike '%' || v_q || '%'
        -- umumiy ko'rinishda (lotin <-> kirill, yozuv variantlari)
        or p.name_lat like v_lat || '%'
        or p.name_lat like '%' || v_lat || '%'
        -- xato yozilgan nom
        or v_lat <% p.name_lat
      )
    order by
      (p.name_lat like v_lat || '%') desc,
      word_similarity(v_lat, p.name_lat) desc,
      p.name
    limit least(coalesce(p_limit, 20), 50)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_search(text, int) from public, anon;
grant execute on function public.dori_search(text, int) to authenticated, service_role;
