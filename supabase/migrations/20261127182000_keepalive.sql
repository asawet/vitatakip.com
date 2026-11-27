-- Keepalive: ücretsiz planda 7 gün etkinlik olmazsa proje duraklatılır (sunumda tüm istekler başarısız olur).
-- GitHub Actions (.github/workflows/supabase-keepalive.yml) günde bir kez bu fonksiyonu REST üzerinden çağırır.
-- Hiçbir tabloya dokunmaz, yalnız 1 döndürür; giriş yapmamış (anon) çağrıya bu yüzden açık.
create or replace function public.keepalive()
returns integer
language sql
stable
set search_path = ''
as $$ select 1 $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
