-- Yapay zekâ proxy'si (supabase/functions/ai-proxy) için günlük kullanım kotası.
-- Ücretsiz Gemini anahtarı: Google'ın günlük sınırı düşük ve değişken; kullanıcı başına ve uygulama geneli sınır konur.
-- Gün Türkiye saatine göre (Europe/Istanbul) sayılır.

create table public.ai_usage (
  user_id uuid    not null references auth.users (id) on delete cascade,
  day     date    not null,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);
create index ai_usage_day_idx on public.ai_usage (day);

alter table public.ai_usage enable row level security;

-- Kullanıcı yalnız kendi kullanımını görür (Ayarlar'da "bugün kalan hak"); değiştiremez.
create policy "ai kullanım: kendi satırını okur"
  on public.ai_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;

-- Atomik kota düşümü: aynı anda gelen istekler sınırı aşamasın (gün bazında danışma kilidi).
-- Döner: {"ok":true,"used":n,"limit":L} ya da {"ok":false,"reason":"user"|"global",...}
-- YALNIZ service_role (Edge Function) çağırabilir.
create or replace function public.ai_quota_take(p_user uuid, p_user_limit integer, p_global_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (now() at time zone 'Europe/Istanbul')::date;
  u integer;
  g integer;
begin
  perform pg_advisory_xact_lock(hashtext('vita_ai_quota_' || d::text));
  select coalesce(sum(count), 0) into g from public.ai_usage where day = d;
  select coalesce(max(count), 0) into u from public.ai_usage where user_id = p_user and day = d;
  if u >= p_user_limit then
    return jsonb_build_object('ok', false, 'reason', 'user', 'used', u, 'limit', p_user_limit);
  end if;
  if g >= p_global_limit then
    return jsonb_build_object('ok', false, 'reason', 'global', 'used', u, 'limit', p_user_limit);
  end if;
  insert into public.ai_usage (user_id, day, count) values (p_user, d, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1;
  return jsonb_build_object('ok', true, 'used', u + 1, 'limit', p_user_limit);
end;
$$;

-- Google yanıt veremezse düşülen hak geri verilir (kullanıcı başarısız istek için hak kaybetmez).
create or replace function public.ai_quota_refund(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set count = greatest(count - 1, 0)
  where user_id = p_user and day = (now() at time zone 'Europe/Istanbul')::date;
$$;

revoke all on function public.ai_quota_take(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_quota_refund(uuid) from public, anon, authenticated;
grant execute on function public.ai_quota_take(uuid, integer, integer) to service_role;
grant execute on function public.ai_quota_refund(uuid) to service_role;
