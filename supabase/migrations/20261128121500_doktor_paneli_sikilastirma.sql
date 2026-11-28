-- Doktor paneli sıkılaştırma (Supabase denetimi: "authenticated_security_definer_function_executable",
-- "multiple_permissive_policies").
--  * my_profile, my_doctors, my_patients, revoke_doctor_access artık SECURITY INVOKER: çağıranın RLS yetkisiyle çalışır.
--  * Yalnız grant_doctor_access SECURITY DEFINER kalır (bilinçli): başkasının profilinde doktor KODUNU arar ve bağlantı
--    satırı yazar; çağıranı auth.uid() ile denetler, yalnız onaylı doktora izin verir.
--  * Hasta, izni geri almak için kendi bağlantısını YALNIZ 'revoked' durumuna çevirebilir (doğrudan 'active' yapamaz:
--    onaysız doktora izin açılmasın).
--  * Aynı işlem için birden çok izin veren politika tek politikada birleştirildi (performans).

-- Hasta: kendi bağlantısını yalnız geri alabilir
create policy "bağlantı: hasta izni yalnız geri alır"
  on public.patient_doctor_links for update
  to authenticated
  using ((select auth.uid()) = patient_id)
  with check ((select auth.uid()) = patient_id and status = 'revoked');
grant update (status, revoked_at) on public.patient_doctor_links to authenticated;

create or replace function public.revoke_doctor_access(p_doctor uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.patient_doctor_links set status = 'revoked', revoked_at = now()
    where patient_id = (select auth.uid()) and doctor_id = p_doctor and status = 'active'
    returning 1
  ) select exists (select 1 from u);
$$;

-- Hasta: aktif doktorlarım (doktor profili RLS ile yalnız aktif izinde görünür)
create or replace function public.my_doctors()
returns table (doctor_id uuid, full_name text, doctor_code text, status text, granted_at timestamptz, revoked_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.doctor_id, p.full_name, p.doctor_code, l.status, l.granted_at, l.revoked_at
  from public.patient_doctor_links l join public.profiles p on p.id = l.doctor_id
  where l.patient_id = (select auth.uid()) and l.status = 'active'
  order by l.granted_at desc;
$$;

create or replace function public.my_patients()
returns table (patient_id uuid, full_name text, granted_at timestamptz, last_update timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.patient_id, p.full_name, l.granted_at,
         (select max(s.updated_at) from public.user_stores s where s.user_id = l.patient_id)
  from public.patient_doctor_links l
  join public.profiles p on p.id = l.patient_id
  where l.doctor_id = (select auth.uid()) and l.patient_id in (select private.my_patient_ids())
  order by 4 desc nulls last;
$$;

create or replace function public.my_profile()
returns table (id uuid, full_name text, account_type text, doctor_code text, doctor_verified boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select id, full_name, account_type, doctor_code, doctor_verified from public.profiles where id = (select auth.uid());
$$;

-- profiles: üç SELECT politikası → bir
drop policy "profil: kendi satırını okur" on public.profiles;
drop policy "profil: onaylı doktor hastasının profilini görür" on public.profiles;
drop policy "profil: hasta izin verdiği doktorun profilini görür" on public.profiles;
create policy "profil: kendisi, onaylı doktoru olduğu hasta, izin verdiği doktor"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) = id
    or id in (select private.my_patient_ids())
    or id in (select l.doctor_id from public.patient_doctor_links l where l.patient_id = (select auth.uid()) and l.status = 'active')
  );

-- user_stores: iki SELECT politikası → bir
drop policy "veri: kendi satırlarını okur" on public.user_stores;
drop policy "veri: onaylı doktor izin veren hastanın seçili kayıtlarını okur" on public.user_stores;
create policy "veri: kendi satırları; onaylı doktor izin veren hastanın seçili kayıtları"
  on public.user_stores for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      store in ('user', 'supplements', 'medications', 'labhistory', 'labs', 'labreferences', 'symptoms', 'resolved_symptoms', 'notes', 'recheck')
      and user_id in (select private.my_patient_ids())
    )
  );
