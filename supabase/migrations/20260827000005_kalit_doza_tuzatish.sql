-- =============================================================
--  KALITDAGI DOZA XATOSI
--
--  500 mg -> "5mg" bo'lib ketardi: son matnga aylantirilgach oxiridagi
--  nollar kesilardi (500.000 -> 500 uchun qilingan edi, lekin butun
--  500 ham "5" bo'lib qolardi).
--
--  trim_scale() aynan shu ish uchun: 500.000 -> 500, 0.500 -> 0.5,
--  500 esa 500 bo'lib qoladi.
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
  s := regexp_replace(s, '(\d),(\d)', '\1.\2', 'g');

  m := regexp_match(s, '(?:№|#|\mn\M)\s*(\d+)');
  if m is not null then
    v_son := m[1];
    s := regexp_replace(s, '(?:№|#|\mn\M)\s*\d+', ' ', 'g');
  end if;

  m := regexp_match(s, '(\d+(?:\.\d+)?)\s*(мкг|mcg|мг|mg|гр|г\M|gr|gm|g\M|мл|ml|%)');
  if m is not null then
    v_doza := m[1]::numeric;
    case
      when m[2] in ('г', 'гр', 'g', 'gr', 'gm') then v_doza := v_doza * 1000; v_birlik := 'mg';
      when m[2] in ('мкг', 'mcg')               then v_doza := v_doza / 1000; v_birlik := 'mg';
      when m[2] in ('мг', 'mg')                 then v_birlik := 'mg';
      when m[2] in ('мл', 'ml')                 then v_birlik := 'ml';
      else v_birlik := 'pc';
    end case;
    s := regexp_replace(s, '(\d+(?:\.\d+)?)\s*(мкг|mcg|мг|mg|гр|г\M|gr|gm|g\M|мл|ml|%)', ' ');
  end if;

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
  s := regexp_replace(s, '(д/инъек[а-я]*|для инъекц[а-я]*|инъек[а-я]*)', ' ', 'g');

  return public.dori_lat(s)
         || '|' || coalesce(trim_scale(v_doza)::text, '') || v_birlik
         || '|' || v_son;
end $$;

drop index if exists dori_products_kalit_idx;
create index dori_products_kalit_idx on public.dori_products (public.dori_kalit(name));
