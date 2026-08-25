-- =============================================================
--  SAVATNI TAHRIRLASH
--
--  dori_bot_cart_add() miqdorni QO'SHADI (qty = qty + yangi). Bu "yana
--  2 dona" uchun to'g'ri, lekin tahrirlash uchun yaramaydi: mijoz 3 ta
--  qilib qo'ymoqchi bo'lsa, hozirgisini bilishi va ayirmasini hisoblashi
--  kerak bo'lardi.
--
--  Shuning uchun aniq qiymatga O'RNATADIGAN funksiya. U idempotent —
--  mijoz "+" ni tez-tez bossa va so'rovlar tartibi buzilsa ham oxirgi
--  qiymat o'sha-o'sha bo'ladi (add bilan bunday emas: har bir takroriy
--  so'rov miqdorni yana oshirib yuborardi).
--
--  Miqdor 0 yoki manfiy bo'lsa — qator o'chiriladi (mijoz "−" ni bosib
--  turib nolgacha tushirsa, savatdan chiqib ketsin).
--
--  Javobda yangilangan savat qaytadi: Mini App bitta so'rov bilan
--  ekranni yangilaydi, ikkitasi bilan emas.
-- =============================================================

create or replace function public.dori_bot_cart_set(
  p_chat_id    bigint,
  p_product_id uuid,
  p_qty        numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bor boolean;
begin
  select true into v_bor
  from dori_products where id = p_product_id and is_active;

  if not coalesce(v_bor, false) then
    return jsonb_build_object('ok', false, 'error', 'DORI_TOPILMADI');
  end if;

  -- Behuda katta miqdor: terish xatosi (masalan 100 o'rniga 100000).
  -- Bunday buyurtma baribir bajarilmaydi, savatda turishi ham shart emas.
  if coalesce(p_qty, 0) > 100000 then
    return jsonb_build_object('ok', false, 'error', 'MIQDOR_JUDA_KATTA');
  end if;

  if coalesce(p_qty, 0) <= 0 then
    delete from dori_cart where chat_id = p_chat_id and product_id = p_product_id;
  else
    insert into dori_cart (chat_id, product_id, qty)
    values (p_chat_id, p_product_id, p_qty)
    on conflict (chat_id, product_id) do update set qty = excluded.qty;
  end if;

  return jsonb_build_object('ok', true, 'savat', public.dori_bot_cart(p_chat_id));
end $$;

-- Chaqiruvchi — service_role bilan ishlaydigan edge funksiya (Telegram
-- imzosini o'sha tekshiradi). Mijozning brauzeriga bu funksiya
-- ochilmaydi, aks holda istalgan chat_id ni yozib yuborish mumkin edi.
revoke all on function public.dori_bot_cart_set(bigint, uuid, numeric) from public, anon, authenticated;
grant execute on function public.dori_bot_cart_set(bigint, uuid, numeric) to service_role;
