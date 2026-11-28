-- VitaTakip — doktor paneli: doktor hesabı + kod, hasta→doktor erişim izni, doktor notları.
--
-- Güvenlik ilkeleri:
--  * Doktor hesapları "onay bekliyor" (doctor_verified=false) başlar; hasta yalnız ONAYLI doktora izin verebilir.
--    Onay yalnız yönetici tarafından: update public.profiles set doctor_verified = true where doctor_code = 'DR-....';
--    (kullanıcılar profiles'ta yalnız full_name sütununu güncelleyebilir; bkz. başlangıç şeması)
--  * Doktor yalnız İZİN VEREN hastanın seçili veri türlerini YALNIZ OKUR (su takibi, günlük alım işaretleri hariç).
--    İzin geri alınınca erişim veritabanı düzeyinde biter.
--  * Bağlantı satırları doğrudan yazılamaz; yalnız aşağıdaki fonksiyonlarla (kod ile izin ver / geri al).
--  * Hasta hesabını silerse doktor notları kalır ama hasta bağlantısı kopar (patient_id = null → "Anonim hasta").

-- ---------------------------------------------------------------------------------------------
-- Doktor alanları
-- ---------------------------------------------------------------------------------------------
alter table public.profiles
  add column doctor_code text unique,
  add column doctor_verified boolean not null default false;
alter table public.profiles
  add constraint profiles_doctor_code_format check (doctor_code is null or doctor_code ~ '^DR-[0-9]{4,6}$'),
  add constraint profiles_doctor_code_only_doctor check (doctor_code is null or account_type = 'doctor');

-- Benzersiz doktor kodu: DR-1000..DR-9999 (doluysa 6 hane)
create or replace function private.new_doctor_code()
returns text
language plpgsql
set search_path = ''
as $$
declare c text; i integer := 0;
begin
  loop
    i := i + 1;
    c := 'DR-' || case when i <= 30 then (1000 + floor(random() * 9000))::int::text else (100000 + floor(random() * 900000))::int::text end;
    exit when not exists (select 1 from public.profiles where doctor_code = c);
  end loop;
  return c;
end;
$$;

-- Kayıt tetikleyicisi: doktor hesabına kod atanır (onay bekliyor olarak)
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text  := lower(coalesce(meta ->> 'username', ''));
  is_doctor boolean := meta ->> 'account_type' = 'doctor';
begin
  insert into public.profiles (id, username, full_name, account_type, doctor_code)
  values (
    new.id,
    case when uname ~ '^[a-z0-9_]{3,20}$' then uname end,
    left(coalesce(meta ->> 'full_name', ''), 120),
    case when is_doctor then 'doctor' else 'patient' end,
    case when is_doctor then private.new_doctor_code() end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Hasta → doktor erişim izni
-- ---------------------------------------------------------------------------------------------
create table public.patient_doctor_links (
  patient_id uuid not null references auth.users (id) on delete cascade,
  doctor_id  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'active' check (status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (patient_id, doctor_id),
  constraint patient_doctor_links_not_self check (patient_id <> doctor_id)
);
create index patient_doctor_links_doctor_active on public.patient_doctor_links (doctor_id) where status = 'active';

alter table public.patient_doctor_links enable row level security;
create policy "bağlantı: hasta ve doktor kendi bağlantısını görür"
  on public.patient_doctor_links for select
  to authenticated
  using ((select auth.uid()) = patient_id or (select auth.uid()) = doctor_id);
revoke all on public.patient_doctor_links from anon, authenticated;
grant select on public.patient_doctor_links to authenticated;
grant all on public.patient_doctor_links to service_role;

-- Çağıran ONAYLI doktorsa, ona aktif izin vermiş hastaların kimlikleri (RLS politikalarında kullanılır)
create or replace function private.my_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.patient_id
  from public.patient_doctor_links l
  join public.profiles d on d.id = l.doctor_id
  where l.doctor_id = (select auth.uid()) and l.status = 'active'
    and d.account_type = 'doctor' and d.doctor_verified;
$$;

-- private şeması API'ye açık değildir; giriş yapmış rol yalnız politikadaki fonksiyonu çalıştırabilir
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.my_patient_ids() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Doktor okuma erişimi: profil ve seçili veri türleri
-- ---------------------------------------------------------------------------------------------
create policy "veri: onaylı doktor izin veren hastanın seçili kayıtlarını okur"
  on public.user_stores for select
  to authenticated
  using (
    store in ('user', 'supplements', 'medications', 'labhistory', 'labs', 'labreferences', 'symptoms', 'resolved_symptoms', 'notes', 'recheck')
    and user_id in (select private.my_patient_ids())
  );

create policy "profil: onaylı doktor hastasının profilini görür"
  on public.profiles for select
  to authenticated
  using (id in (select private.my_patient_ids()));

create policy "profil: hasta izin verdiği doktorun profilini görür"
  on public.profiles for select
  to authenticated
  using (id in (select l.doctor_id from public.patient_doctor_links l where l.patient_id = (select auth.uid()) and l.status = 'active'));

-- ---------------------------------------------------------------------------------------------
-- Doktor notları (hasta okur, yalnız yazan doktor düzenler/siler)
-- ---------------------------------------------------------------------------------------------
create table public.doctor_notes (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    uuid references auth.users (id) on delete set null,
  patient_id   uuid references auth.users (id) on delete set null,   -- hasta silinince null: "Anonim hasta"
  doctor_label text not null default '',                              -- doktor adı (doktor hesabı silinse de not okunur)
  body         text not null check (char_length(body) between 1 and 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index doctor_notes_patient_idx on public.doctor_notes (patient_id, created_at desc);
create index doctor_notes_doctor_idx on public.doctor_notes (doctor_id, created_at desc);

create or replace function private.doctor_note_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.doctor_label := coalesce((select full_name from public.profiles where id = new.doctor_id), '');
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger doctor_notes_defaults
  before insert or update on public.doctor_notes
  for each row execute function private.doctor_note_defaults();

alter table public.doctor_notes enable row level security;
create policy "not: doktor ve hasta görür"
  on public.doctor_notes for select
  to authenticated
  using ((select auth.uid()) = doctor_id or (select auth.uid()) = patient_id);
create policy "not: onaylı doktor izin veren hastasına yazar"
  on public.doctor_notes for insert
  to authenticated
  with check ((select auth.uid()) = doctor_id and patient_id in (select private.my_patient_ids()));
create policy "not: yazan doktor düzenler"
  on public.doctor_notes for update
  to authenticated
  using ((select auth.uid()) = doctor_id)
  with check ((select auth.uid()) = doctor_id);
create policy "not: yazan doktor siler"
  on public.doctor_notes for delete
  to authenticated
  using ((select auth.uid()) = doctor_id);
revoke all on public.doctor_notes from anon, authenticated;
grant select, delete on public.doctor_notes to authenticated;
grant insert (doctor_id, patient_id, body) on public.doctor_notes to authenticated;
grant update (body) on public.doctor_notes to authenticated;
grant all on public.doctor_notes to service_role;

-- ---------------------------------------------------------------------------------------------
-- İstemci fonksiyonları (REST /rpc; yalnız giriş yapmış kullanıcı)
-- ---------------------------------------------------------------------------------------------

-- Hasta: doktor koduyla erişim izni ver. Döner: {ok, doctor_id, full_name} ya da {ok:false, reason}
create or replace function public.grant_doctor_access(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := auth.uid(); d record; c text := upper(trim(coalesce(p_code, '')));
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if c !~ '^DR-?[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if c !~ '^DR-' then c := 'DR-' || substr(c, 3); end if;
  select id, full_name, doctor_verified into d from public.profiles where doctor_code = c and account_type = 'doctor';
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not d.doctor_verified then return jsonb_build_object('ok', false, 'reason', 'not_verified', 'full_name', d.full_name); end if;
  if d.id = me then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  insert into public.patient_doctor_links (patient_id, doctor_id, status, granted_at, revoked_at)
  values (me, d.id, 'active', now(), null)
  on conflict (patient_id, doctor_id) do update set status = 'active', granted_at = now(), revoked_at = null;
  return jsonb_build_object('ok', true, 'doctor_id', d.id, 'full_name', d.full_name);
end;
$$;

-- Hasta: izni geri al
create or replace function public.revoke_doctor_access(p_doctor uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.patient_doctor_links set status = 'revoked', revoked_at = now()
    where patient_id = auth.uid() and doctor_id = p_doctor and status = 'active'
    returning 1
  ) select exists (select 1 from u);
$$;

-- Hasta: doktorlarım (aktif ve geri alınmış)
create or replace function public.my_doctors()
returns table (doctor_id uuid, full_name text, doctor_code text, status text, granted_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.doctor_id, p.full_name, p.doctor_code, l.status, l.granted_at, l.revoked_at
  from public.patient_doctor_links l join public.profiles p on p.id = l.doctor_id
  where l.patient_id = auth.uid()
  order by l.status, l.granted_at desc;
$$;

-- Doktor: hastalarım (yalnız onaylı doktor; aktif izinler) + son güncelleme zamanı
create or replace function public.my_patients()
returns table (patient_id uuid, full_name text, granted_at timestamptz, last_update timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.patient_id, p.full_name, l.granted_at,
         (select max(s.updated_at) from public.user_stores s where s.user_id = l.patient_id)
  from public.patient_doctor_links l
  join public.profiles p on p.id = l.patient_id
  where l.patient_id in (select private.my_patient_ids())
    and l.doctor_id = auth.uid()
  order by 4 desc nulls last;
$$;

-- Kendi profilim (doktor kodu ve onay durumu dahil) — RLS zaten yalnız kendi satırını verir; kolaylık fonksiyonu
create or replace function public.my_profile()
returns table (id uuid, full_name text, account_type text, doctor_code text, doctor_verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select id, full_name, account_type, doctor_code, doctor_verified from public.profiles where id = auth.uid();
$$;

revoke all on function public.grant_doctor_access(text) from public, anon;
revoke all on function public.revoke_doctor_access(uuid) from public, anon;
revoke all on function public.my_doctors() from public, anon;
revoke all on function public.my_patients() from public, anon;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.grant_doctor_access(text) to authenticated;
grant execute on function public.revoke_doctor_access(uuid) to authenticated;
grant execute on function public.my_doctors() to authenticated;
grant execute on function public.my_patients() to authenticated;
grant execute on function public.my_profile() to authenticated;
