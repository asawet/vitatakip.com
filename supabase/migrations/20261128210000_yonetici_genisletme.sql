-- Yönetici paneli genişletme: özet istatistikler, kullanıcı listesi, hesap silme kaydı.
--  * Yönetici HESAP bilgilerini görür (ad, giriş, tür, tarihler, bulut kayıt sayısı/boyutu); sağlık kayıtlarının
--    İÇERİĞİNİ göremez (KVKK: amaçla sınırlılık). Boyut yalnız metin uzunluğundan hesaplanır.
--  * Hesap silme yönetici API'si gerektirir: Edge Function "yonetici-islem" (yönetici denetimi + işlem kaydı).
--  * Fonksiyonlar SECURITY DEFINER; her biri ilk satırda private.is_admin() denetler (değilse 42501).

alter table public.admin_audit drop constraint admin_audit_action_check;
alter table public.admin_audit add constraint admin_audit_action_check
  check (action in ('doctor_verify', 'doctor_unverify', 'user_delete'));
alter table public.admin_audit add column note text not null default '' check (char_length(note) <= 300);

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if not private.is_admin() then
    raise exception 'Bu işlem yalnız yöneticiler içindir.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_total',      (select count(*) from public.profiles),
    'patients',         (select count(*) from public.profiles where account_type = 'patient'),
    'doctors_verified', (select count(*) from public.profiles where account_type = 'doctor' and doctor_verified),
    'doctors_pending',  (select count(*) from public.profiles where account_type = 'doctor' and not doctor_verified),
    'admins',           (select count(*) from public.profiles where is_admin),
    'username_accounts',(select count(*) from public.profiles where username is not null),
    'no_recovery_code', (select count(*) from public.profiles p where p.username is not null
                           and not exists (select 1 from public.recovery_codes c where c.user_id = p.id)),
    'new_7d',           (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_30d',          (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_7d',        (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'links_active',     (select count(*) from public.patient_doctor_links where status = 'active'),
    'requests_pending', (select count(*) from public.access_requests where status = 'pending'),
    'notes_total',      (select count(*) from public.doctor_notes),
    'cloud_users',      (select count(distinct user_id) from public.user_stores),
    'cloud_bytes',      (select coalesce(sum(octet_length(data::text)), 0) from public.user_stores),
    'ai_today',         (select coalesce(sum(count), 0) from public.ai_usage where day = today),
    'ai_users_today',   (select count(*) from public.ai_usage where day = today and count > 0)
  );
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.admin_list_users()
returns table (
  id uuid, full_name text, login text, account_type text, is_admin boolean, doctor_code text, doctor_verified boolean,
  created_at timestamptz, last_sign_in_at timestamptz, store_count bigint, data_bytes bigint,
  links_active bigint, has_recovery_code boolean, username_account boolean
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
    select p.id, p.full_name,
           case when p.username is not null then '@' || p.username else u.email::text end,
           p.account_type, p.is_admin, p.doctor_code, p.doctor_verified,
           p.created_at, u.last_sign_in_at,
           (select count(*) from public.user_stores s where s.user_id = p.id),
           (select coalesce(sum(octet_length(s.data::text)), 0)::bigint from public.user_stores s where s.user_id = p.id),
           (select count(*) from public.patient_doctor_links l where l.status = 'active' and (l.patient_id = p.id or l.doctor_id = p.id)),
           exists (select 1 from public.recovery_codes c where c.user_id = p.id),
           p.username is not null
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 500;
end;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- İşlem kaydı: not (silme gerekçesi) da döner
drop function public.admin_audit_recent(integer);
create function public.admin_audit_recent(p_limit integer default 20)
returns table (at timestamptz, admin_label text, action text, target_label text, note text)
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
    select a.at, a.admin_label, a.action, a.target_label, a.note
    from public.admin_audit a
    order by a.at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 200);
end;
$$;
revoke all on function public.admin_audit_recent(integer) from public, anon;
grant execute on function public.admin_audit_recent(integer) to authenticated;
