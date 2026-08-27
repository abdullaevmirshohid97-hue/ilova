-- =============================================================
--  DORINI TANIB OLISH KALITI
--
--  Muammo: ikki sklad praysi bir xil dorini butunlay boshqacha yozadi.
--      "Анальгин 0,5 г №10"    · Ирбитский ХФЗ/Россия
--      "Анальгин таб 0.5мг №10" · "Ирбит" Россия/Узбекистан
--  Natijada 2279 ta yangi dori yaratildi va ikkala skladda ham bor
--  dori 0 ta bo'lib qoldi: narx solishtirilmaydi, buyurtma bo'linmaydi.
--
--  Kalit uch qismdan iborat, chunki aynan shu uchtasi dorini ajratadi:
--      o'zak (nom + shakl)  |  doza (mg/ml ga keltirilgan)  |  paket soni
--  Masalan:
--      "Анальгин 0,5 г №10"  ->  analgin|500|10
--      "Анальгин таб 500мг №10" -> analgintab|500|10
--
--  DOZA BIR BIRLIKKA KELTIRILADI: 0,5 г va 500 мг - bir xil doza, lekin
--  matn sifatida umuman boshqacha. Buni hisoblamasak, eng ko'p uchraydigan
--  farq o'tkazib yuborilardi.
--
--  DORI SHAKLI SAQLANADI: tabletka va ampula - boshqa-boshqa tovar.
--  Qisqartmalar birxillashtiriladi (таб/табл/таблетки -> tab).
--
--  Kalit O'ZI birlashtirmaydi - u faqat NOMZOD topadi. Oxirgi qaror
--  odamniki: xato birlashtirish noto'g'ri narx va noto'g'ri buyurtma
--  degani.
-- =============================================================

create or replace function public.dori_kalit(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  s        text := lower(coalesce(p_text, ''));
  v_doza   numeric;
  v_birlik text := '';
  v_son    text := '';
  m        text[];
begin
  -- 0,5 -> 0.5 (ruscha va o'zbekcha yozuvda vergul ishlatiladi)
  s := regexp_replace(s, '(\d),(\d)', '\1.\2', 'g');

  -- Paket soni: №10, N10, #10, "10 dona"
  m := regexp_match(s, '(?:№|#|\mn\M)\s*(\d+)');
  if m is not null then
    v_son := m[1];
    s := regexp_replace(s, '(?:№|#|\mn\M)\s*\d+', ' ', 'g');
  end if;

  -- Doza: birinchi uchragan "son + birlik"
  m := regexp_match(s, '(\d+(?:\.\d+)?)\s*(мкг|mcg|мг|mg|гр|г\M|gr|gm|g\M|мл|ml|%)');
  if m is not null then
    v_doza := m[1]::numeric;
    case
      when m[2] in ('г', 'гр', 'g', 'gr', 'gm') then v_doza := v_doza * 1000; v_birlik := 'mg';
      when m[2] in ('мкг', 'mcg')               then v_doza := v_doza / 1000; v_birlik := 'mg';
      when m[2] in ('мг', 'mg')                 then v_birlik := 'mg';
      when m[2] in ('мл', 'ml')                 then v_birlik := 'ml';
      else v_birlik := 'pc';   -- foiz
    end case;
    s := regexp_replace(s, '(\d+(?:\.\d+)?)\s*(мкг|mcg|мг|mg|гр|г\M|gr|gm|g\M|мл|ml|%)', ' ');
  end if;

  -- Dori shakli qisqartmalari birxillashtiriladi. Shaklning O'ZI
  -- saqlanadi: tabletka va ampula boshqa-boshqa tovar.
  s := regexp_replace(s, '\m(таблетки|таблетка|табл|таб|tabletka|tabl|tab)\M', ' tab ', 'g');
  s := regexp_replace(s, '\m(ампулы|ампула|амп|ampula|amp)\M', ' amp ', 'g');
  s := regexp_replace(s, '\m(капсулы|капсула|капс|kapsula|kaps|caps)\M', ' kaps ', 'g');
  s := regexp_replace(s, '(р-?р|раствор|eritma)', ' rr ', 'g');
  s := regexp_replace(s, '\m(сироп|sirop|syrup)\M', ' sirop ', 'g');
  s := regexp_replace(s, '\m(мазь|maz|malham)\M', ' maz ', 'g');
  s := regexp_replace(s, '\m(крем|krem|cream)\M', ' krem ', 'g');
  s := regexp_replace(s, '\m(гель|gel)\M', ' gel ', 'g');
  s := regexp_replace(s, '\m(суппозитории|супп|shamcha)\M', ' supp ', 'g');
  s := regexp_replace(s, '\m(флакон|фл|flakon)\M', ' fl ', 'g');
  -- "д/инъек", "для инъекций" kabi izohlar dorini ajratmaydi
  s := regexp_replace(s, '(д/инъек[а-я]*|для инъекц[а-я]*|инъек[а-я]*)', ' ', 'g');

  return public.dori_lat(s)
         || '|' || coalesce(trim(trailing '.' from trim(trailing '0' from v_doza::text)), '')
         || v_birlik
         || '|' || v_son;
end $$;

comment on function public.dori_kalit(text) is
  'Dorini tanib olish kaliti: ozak|doza|paket_soni. Faqat NOMZOD topish uchun.';

-- Kalit bo'yicha qidiruv tez bo'lsin (9000+ qator)
create index if not exists dori_products_kalit_idx
  on public.dori_products (public.dori_kalit(name));
