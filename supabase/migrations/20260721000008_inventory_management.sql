-- =============================================================
-- ILOVA B2B — Mahsulot/Ombor: kirimni orqaga sanalash imkoniyati
-- (chiqim/korreksiya — adjust_stock — allaqachon 0003'da tayyor)
-- =============================================================

drop function if exists public.add_stock(uuid, int, text);

create or replace function public.add_stock(
  p_variant_id  uuid,
  p_qty         int,
  p_note        text default null,
  p_created_at  timestamptz default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_when timestamptz := coalesce(p_created_at, now());
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'NOTOGRI_MIQDOR';
  end if;
  if v_when > now() then
    raise exception 'SANA_KELAJAKDA';
  end if;

  insert into stock_movements (variant_id, qty, reason, note, created_by, created_at)
  values (p_variant_id, p_qty, 'production_in', p_note, auth.uid(), v_when);
end $$;

grant execute on function public.add_stock(uuid, int, text, timestamptz) to authenticated;
