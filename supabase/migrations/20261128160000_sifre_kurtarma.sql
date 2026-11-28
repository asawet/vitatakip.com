-- Şifre kurtarma — takma ad hesapları (e-postası olmayan hesaplar).
-- Kayıtta kullanıcıya tek bir kurtarma kodu gösterilir (XXXX-XXXX-XXXX-XXXX, 80 bit rastgele; tarayıcıda üretilir).
-- Veritabanında yalnız SHA-256 özeti tutulur; kodun kendisi hiçbir yerde saklanmaz. Kod yüksek entropili olduğu için
-- tuzsuz SHA-256 yeterlidir (kaba kuvvetle tahmin edilemez); denemeler ayrıca sınırlıdır (recovery_attempts).
-- Sıfırlamayı yalnız "sifre-kurtar" Edge Function yapar (yönetici anahtarı sunucuda): kodu doğrular, şifreyi değiştirir,
-- kullanılan kodu yenisiyle değiştirir.

create table public.recovery_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code_hash  text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.recovery_codes enable row level security;

-- Kullanıcı yalnız kendi kodunu oluşturur / yeniler / görür (özet; kodun kendisi değil)
create policy "kurtarma: kendi satırını okur" on public.recovery_codes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "kurtarma: kendi adına ekler" on public.recovery_codes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "kurtarma: kendi satırını yeniler" on public.recovery_codes
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "kurtarma: kendi satırını siler" on public.recovery_codes
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.recovery_codes from anon, authenticated;
grant select, insert, update, delete on public.recovery_codes to authenticated;
grant all on public.recovery_codes to service_role;

-- Deneme kaydı (kaba kuvvet sınırı): yalnız Edge Function (service_role) okur/yazar; istemciye kapalı.
create table public.recovery_attempts (
  id       bigint generated always as identity primary key,
  username text not null,
  ip       text not null default '',
  ok       boolean not null default false,
  at       timestamptz not null default now()
);
create index recovery_attempts_username_at on public.recovery_attempts (username, at desc);
create index recovery_attempts_ip_at on public.recovery_attempts (ip, at desc);
alter table public.recovery_attempts enable row level security;
revoke all on public.recovery_attempts from anon, authenticated;
grant all on public.recovery_attempts to service_role;
