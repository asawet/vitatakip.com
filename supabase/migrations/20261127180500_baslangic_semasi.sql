-- VitaTakip — başlangıç şeması (Supabase, proje: vitatakip / eu-central-1)
-- Uygulanma: Supabase MCP apply_migration, 2026-11-27
--
-- Tasarım:
--  * profiles     : auth.users ile 1:1. Kayıtta tetikleyiciyle otomatik oluşur. Kullanıcı yalnız ad soyadını değiştirebilir
--                   (hesap türü / takma ad istemciden değiştirilemez).
--  * user_stores  : uygulamanın localStorage verisinin bulut kopyası. Her veri türü (supplements, labs, symptoms …)
--                   bir satır, içerik jsonb. Uygulamadaki "vitatakip_<store>_<userId>" yapısının birebir karşılığı.
--  * RLS          : her tabloda açık; herkes yalnız kendi satırlarını görür/yazar. anon rolüne hiçbir yetki yok.
--  * security definer fonksiyonlar API'ye açık olmayan "private" şemasında, search_path = ''.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ortak: updated_at
-- ---------------------------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text,
  full_name    text not null default '' check (char_length(full_name) <= 120),
  account_type text not null default 'patient' check (account_type in ('patient', 'doctor')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- takma ad: küçük harf, rakam, alt çizgi; 3-20 karakter (e-postayla kayıtta boş olabilir)
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$')
);
create unique index profiles_username_key on public.profiles (username) where username is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Kayıtta profil satırı: bilgiler signUp(options.data) ile gelen user_metadata'dan, doğrulanarak alınır.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text  := lower(coalesce(meta ->> 'username', ''));
begin
  insert into public.profiles (id, username, full_name, account_type)
  values (
    new.id,
    case when uname ~ '^[a-z0-9_]{3,20}$' then uname end,
    left(coalesce(meta ->> 'full_name', ''), 120),
    case when meta ->> 'account_type' = 'doctor' then 'doctor' else 'patient' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;

create policy "profil: kendi satırını okur"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profil: kendi satırını günceller"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Yetkiler: ekleme/silme yalnız tetikleyici ve cascade ile; güncellemede yalnız ad soyad.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------------------------
-- user_stores
-- ---------------------------------------------------------------------------------------------
create table public.user_stores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  store      text not null check (store ~ '^[a-z][a-z0-9_]{0,39}$'),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, store),
  -- tek veri türü en fazla ~2 MB (PDF'ler buluta gönderilmez, cihazda kalır)
  constraint user_stores_data_size check (pg_column_size(data) <= 2097152)
);

create trigger user_stores_set_updated_at
  before update on public.user_stores
  for each row execute function private.set_updated_at();

alter table public.user_stores enable row level security;

create policy "veri: kendi satırlarını okur"
  on public.user_stores for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "veri: kendi adına ekler"
  on public.user_stores for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "veri: kendi satırlarını günceller"
  on public.user_stores for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "veri: kendi satırlarını siler"
  on public.user_stores for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_stores from anon, authenticated;
grant select, insert, update, delete on public.user_stores to authenticated;
grant all on public.user_stores to service_role;
