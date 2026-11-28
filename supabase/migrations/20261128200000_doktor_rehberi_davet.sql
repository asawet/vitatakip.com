-- Doktor rehberi + doktordan hastaya erişim isteği (davet).
--  1) verified_doctors(): giriş yapmış kullanıcı, ONAYLI doktorların yalnız adını ve kodunu görür (başka alan yok).
--     Hasta listeden seçip mevcut grant_doctor_access(kod) ile izin verir. Doktor kayıt ekranı bunu doktora bildirir.
--  2) access_requests: onaylı doktor, hastanın takma adı / e-postasıyla erişim İSTEĞİ gönderir; hasta kabul etmeden
--     doktor HİÇBİR veri göremez (erişim yine yalnız patient_doctor_links 'active' ile açılır). Kabul = izin verme.
--     Kötüye kullanım sınırları: doktor başına günde 30 istek; aynı çifte tek bekleyen istek; hasta reddettiyse 7 gün yeni istek yok.
--     Tabloya istemci YAZAMAZ (yalnız kendi satırlarını okur); tüm yazmalar aşağıdaki fonksiyonlardan geçer.
--  Fonksiyonlar başka kullanıcıların profilini / e-postasını aradığı için SECURITY DEFINER'dır; her biri çağıranı
--  auth.uid() ile denetler. Supabase denetimindeki ilgili uyarılar bilinçlidir.

create or replace function public.verified_doctors()
returns table (id uuid, full_name text, doctor_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.doctor_code
  from public.profiles p
  where (select auth.uid()) is not null
    and p.account_type = 'doctor' and p.doctor_verified and p.doctor_code is not null
    and p.id <> (select auth.uid())
  order by p.full_name;
$$;
revoke all on function public.verified_doctors() from public, anon;
grant execute on function public.verified_doctors() to authenticated;

create table public.access_requests (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    uuid not null references auth.users (id) on delete cascade,
  patient_id   uuid not null references auth.users (id) on delete cascade,
  doctor_label text not null default '' check (char_length(doctor_label) <= 160),
  requested_as text not null default '' check (char_length(requested_as) <= 254),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint access_requests_not_self check (doctor_id <> patient_id)
);
create unique index access_requests_one_pending on public.access_requests (doctor_id, patient_id) where status = 'pending';
create index access_requests_patient on public.access_requests (patient_id, status);
create index access_requests_doctor on public.access_requests (doctor_id, created_at desc);
alter table public.access_requests enable row level security;
create policy "istek: doktor ve hasta kendi isteğini görür" on public.access_requests
  for select to authenticated using ((select auth.uid()) in (doctor_id, patient_id));
revoke all on public.access_requests from anon, authenticated;
grant select on public.access_requests to authenticated;
grant all on public.access_requests to service_role;

-- Doktor: hastaya erişim isteği gönder (takma ad ya da e-posta)
create or replace function public.request_patient_access(p_identifier text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  d record;
  ident text := lower(trim(coalesce(p_identifier, '')));
  pid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select p.full_name, p.doctor_code, p.doctor_verified into d from public.profiles p where p.id = me and p.account_type = 'doctor';
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_doctor'); end if;
  if not d.doctor_verified then return jsonb_build_object('ok', false, 'reason', 'not_verified'); end if;
  if ident = '' or char_length(ident) > 254 then return jsonb_build_object('ok', false, 'reason', 'bad_identifier'); end if;
  if (select count(*) from public.access_requests r where r.doctor_id = me and r.created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limit');
  end if;
  ident := regexp_replace(ident, '^@', ''); -- "@takma_ad" biçimi de kabul edilir
  if position('@' in ident) > 0 then
    select u.id into pid from auth.users u join public.profiles p on p.id = u.id
      where lower(u.email) = ident and p.account_type = 'patient';
  else
    if ident !~ '^[a-z0-9_]{3,20}$' then return jsonb_build_object('ok', false, 'reason', 'bad_identifier'); end if;
    select p.id into pid from public.profiles p where p.username = ident and p.account_type = 'patient';
  end if;
  if pid is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if pid = me then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if exists (select 1 from public.patient_doctor_links l where l.patient_id = pid and l.doctor_id = me and l.status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;
  if exists (select 1 from public.access_requests r where r.patient_id = pid and r.doctor_id = me and r.status = 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;
  if exists (select 1 from public.access_requests r where r.patient_id = pid and r.doctor_id = me and r.status = 'declined'
             and r.responded_at > now() - interval '7 days') then
    return jsonb_build_object('ok', false, 'reason', 'recently_declined');
  end if;
  insert into public.access_requests (doctor_id, patient_id, doctor_label, requested_as)
    values (me, pid, left(d.full_name || ' (' || coalesce(d.doctor_code, '') || ')', 160), ident);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.request_patient_access(text) from public, anon;
grant execute on function public.request_patient_access(text) to authenticated;

-- Hasta: isteği kabul et (= izin ver) ya da reddet
create or replace function public.respond_access_request(p_request uuid, p_accept boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r record;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select * into r from public.access_requests q where q.id = p_request and q.patient_id = me for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
  if p_accept then
    if not exists (select 1 from public.profiles p where p.id = r.doctor_id and p.account_type = 'doctor' and p.doctor_verified) then
      return jsonb_build_object('ok', false, 'reason', 'not_verified');
    end if;
    insert into public.patient_doctor_links (patient_id, doctor_id, status, granted_at, revoked_at)
      values (me, r.doctor_id, 'active', now(), null)
      on conflict (patient_id, doctor_id) do update set status = 'active', granted_at = now(), revoked_at = null;
    update public.access_requests set status = 'accepted', responded_at = now() where id = r.id;
  else
    update public.access_requests set status = 'declined', responded_at = now() where id = r.id;
  end if;
  return jsonb_build_object('ok', true, 'doctor_label', r.doctor_label);
end;
$$;
revoke all on function public.respond_access_request(uuid, boolean) from public, anon;
grant execute on function public.respond_access_request(uuid, boolean) to authenticated;

-- Doktor: bekleyen isteğini geri çek
create or replace function public.cancel_access_request(p_request uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with u as (
    update public.access_requests set status = 'cancelled', responded_at = now()
    where id = p_request and doctor_id = (select auth.uid()) and status = 'pending'
    returning 1
  ) select exists (select 1 from u);
$$;
revoke all on function public.cancel_access_request(uuid) from public, anon;
grant execute on function public.cancel_access_request(uuid) to authenticated;
