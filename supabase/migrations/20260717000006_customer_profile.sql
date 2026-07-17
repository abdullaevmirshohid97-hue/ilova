-- Mijoz profili kengaytmasi: email, rasm + avatarlar bucket'i

alter table public.customers
  add column email text,
  add column photo_path text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_admin());

create policy "avatars: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.is_admin());

create policy "avatars: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());
