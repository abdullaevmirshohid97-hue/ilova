-- =============================================================
--  Xodim botidagi "📤 Mijozga" tugmasi uchun.
--
--  Bot mijozning chat_id'sini BILMASLIGI kerak — aks holda uni
--  botning o'zida taxmin qilish/almashtirish yo'li ochilardi. Shuning
--  uchun tekshiruv ham, manzil ham shu funksiyada: xodim buyurtmaga
--  haqiqatan egami degan savolni baza hal qiladi va mijozning chatini
--  o'zi qaytaradi.
--
--  Faktura MIJOZGA ketadi, shuning uchun narx HAQIQIY (mijoz to'laydigan)
--  bo'ladi — admin yuborganda ham. Admin javob sifatida faqat "yuborildi"
--  degan xabarni ko'radi, faktura mazmunini emas: ya'ni menejer ustamasi
--  bu yo'l bilan ham ochilmaydi.
-- =============================================================

create or replace function public.order_invoice_for_staff_to_customer(
  p_order_id       uuid,
  p_staff_chat_id  bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_org     uuid;
  v_manager uuid;
  v_ruxsat  boolean;
  v_chat    bigint;
  v_inv     jsonb;
begin
  select p.role, p.org_id, p.manager_id
    into v_role, v_org, v_manager
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_staff_chat_id;

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'ULANMAGAN');
  end if;

  select (
    v_role = 'super_admin'
    or (v_role = 'admin'   and c.org_id     = v_org)
    or (v_role = 'manager' and c.manager_id = v_manager)
  ), c.telegram_chat_id
  into v_ruxsat, v_chat
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id;

  if coalesce(v_ruxsat, false) = false then
    return jsonb_build_object('ok', false, 'error', 'RUXSAT_YOQ');
  end if;
  if v_chat is null then
    return jsonb_build_object('ok', false, 'error', 'MIJOZ_ULANMAGAN');
  end if;

  v_inv := order_invoice_payload(p_order_id, false);
  return jsonb_build_object('ok', true, 'chat_id', v_chat, 'invoice', v_inv);
end $$;

revoke all on function public.order_invoice_for_staff_to_customer(uuid, bigint) from anon, authenticated, public;
grant execute on function public.order_invoice_for_staff_to_customer(uuid, bigint) to service_role;
