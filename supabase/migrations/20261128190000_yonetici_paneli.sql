-- Yönetici paneli: doktor hesaplarını uygulama içinden onaylama / onayı kaldırma.
--  * Yönetici, profiles.is_admin = true olan hesaptır. Bu alanı istemci DEĞİŞTİREMEZ: profiles üzerinde istemcinin
--    güncelleme yetkisi yalnız full_name sütunundadır (20261127180500_baslangic_semasi.sql). Yönetici yalnız SQL ile atanır:
--      update public.profiles set is_admin = true where id = '<kullanıcı uuid>';
--  * Yönetici işlemleri yalnız aşağıdaki fonksiyonlardan geçer. Başka kullanıcıların e-postasını (auth.users) okumak ve
--    başkasının profilini güncellemek gerektiği için SECURITY DEFINER'dır; HER BİRİ ilk satırda çağıranın yönetici
--    olduğunu denetler (değilse 42501). Supabase denetimindeki "SECURITY DEFINER" uyarısı bu üçü için bilinçlidir.
--  * Her onay / onay kaldırma public.admin_audit'e yazılır (kim, ne zaman, kimi). İstemci bu tabloyu doğrudan okuyamaz.

alter table public.profiles add column is_admin boolean not null default false;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;
revoke all on function private.is_admin() from public, anon, authenticated;

-- my_profile: is_admin de döner (istemci yönetici menüsünü buna göre gösterir; yetkiyi yine sunucu denetler)
drop function public.my_profile();
create function public.my_profile()
returns table (id uuid, full_name text, account_type text, doctor_code text, doctor_verified boolean, is_admin boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select id, full_name, account_type, doctor_code, doctor_verified, is_admin from public.profiles where id = (select auth.uid());
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Denetim kaydı
create table public.admin_audit (
  id           bigint generated always as identity primary key,
  admin_id     uuid references auth.users (id) on delete set null,
  admin_label  text not null default '',
  action       text not null check (action in ('doctor_verify', 'doctor_unverify')),
  target_id    uuid references auth.users (id) on delete set null,
  target_label text not null default '',
  at           timestamptz not null default now()
);
create index admin_audit_at on public.admin_audit (at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
grant all on public.admin_audit to service_role;

-- Doktor listesi (yalnız yönetici)
create or replace function public.admin_list_doctors()
returns table (
  id uuid, full_name text, doctor_code text, doctor_verified boolean, created_at timestamptz,
  login text, pledge_at timestamptz, active_patients bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Bu işlem yalnız yöneticiler içindir.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.doctor_code, p.doctor_verified, p.created_at,
           case when u.email like '%@hesap.vitatakip.com.tr' then '@' || coalesce(p.username, '') else u.email::text end,
           case when (u.raw_user_meta_data ->> 'doctor_pledge_at') ~ '^\d{4}-\d{2}-\d{2}T'
                then (u.raw_user_meta_data ->> 'doctor_pledge_at')::timestamptz end,
           (select count(*) from public.patient_doctor_links l where l.doctor_id = p.id and l.status = 'active')
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.account_type = 'doctor'
    order by p.doctor_verified, p.created_at desc;
end;
$$;
revoke all on function public.admin_list_doctors() from public, anon;
grant execute on function public.admin_list_doctors() to authenticated;

-- Onay ver / kaldır (yalnız yönetici; denetim kaydı yazılır)
create or replace function public.admin_set_doctor_verified(p_doctor uuid, p_verified boolean)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d record;
  me uuid := (select auth.uid());
  me_name text;
begin
  if not private.is_admin() then
    raise exception 'Bu işlem yalnız yöneticiler içindir.' using errcode = '42501';
  end if;
  select p.id, p.full_name, p.doctor_code, p.doctor_verified into d
    from public.profiles p where p.id = p_doctor and p.account_type = 'doctor' for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if d.doctor_verified = p_verified then
    return json_build_object('ok', true, 'changed', false);
  end if;
  update public.profiles set doctor_verified = p_verified where id = p_doctor;
  select full_name into me_name from public.profiles where id = me;
  insert into public.admin_audit (admin_id, admin_label, action, target_id, target_label)
    values (me, coalesce(me_name, ''), case when p_verified then 'doctor_verify' else 'doctor_unverify' end,
            p_doctor, d.full_name || ' (' || coalesce(d.doctor_code, '—') || ')');
  return json_build_object('ok', true, 'changed', true);
end;
$$;
revoke all on function public.admin_set_doctor_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_doctor_verified(uuid, boolean) to authenticated;

-- Son işlemler (yalnız yönetici)
create or replace function public.admin_audit_recent(p_limit integer default 20)
returns table (at timestamptz, admin_label text, action text, target_label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Bu işlem yalnız yöneticiler içindir.' using errcode = '42501';
  end if;
  return query
    select a.at, a.admin_label, a.action, a.target_label
    from public.admin_audit a
    order by a.at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;
revoke all on function public.admin_audit_recent(integer) from public, anon;
grant execute on function public.admin_audit_recent(integer) to authenticated;
