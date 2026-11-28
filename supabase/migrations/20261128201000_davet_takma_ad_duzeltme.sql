-- request_patient_access: "@takma_ad" biçimi e-posta sanılıyordu; baştaki "@" artık e-posta denetiminden önce silinir.

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
