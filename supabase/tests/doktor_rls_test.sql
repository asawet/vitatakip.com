-- DOKTOR PANELİ RLS DAVRANIŞ TESTİ (27 kontrol). Sondaki kasıtlı hata TÜM işlemi geri alır (hiçbir şey kalıcı yazılmaz).
-- Beklenen: tüm "engellendi" satırları engellendi; sayılar parantezdeki beklenen değerle aynı. Bkz. README.md
create temp table t (n int, k text, s text);
grant all on t to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
 ('a0000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p@rls.invalid','{"full_name":"Hasta Pelin"}', now(), now()),
 ('b0000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@rls.invalid','{"full_name":"Hasta Onur"}', now(), now()),
 ('d0000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-000000000000','authenticated','authenticated','d@rls.invalid','{"full_name":"Dr. Deniz","account_type":"doctor"}', now(), now()),
 ('e0000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u@rls.invalid','{"full_name":"Onaysız Uğur","account_type":"doctor"}', now(), now());
update public.profiles set doctor_verified = true where id = 'd0000000-0000-0000-0000-00000000000d';
insert into public.user_stores (user_id, store, data) values
 ('a0000000-0000-0000-0000-00000000000a','supplements','{"v":["D3"]}'), ('a0000000-0000-0000-0000-00000000000a','hydration','{"v":{"current":500}}'),
 ('b0000000-0000-0000-0000-00000000000b','supplements','{"v":["Onur gizli"]}');
insert into t select 1, 'kodlar: D ve U doktor kodu, hasta kodsuz', (select string_agg(coalesce(doctor_code,'-') || '/' || account_type || '/' || doctor_verified, ' ' order by full_name) from public.profiles);

-- ===== P (hasta) =====
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ declare c text; begin
  reset role; select doctor_code into c from public.profiles where id = 'e0000000-0000-0000-0000-00000000000e'; set local role authenticated;
  insert into t values (3, 'P onaysız doktor (U) kodu → not_verified', public.grant_doctor_access(c) ->> 'reason');
  insert into t values (4, 'P geçersiz kod → bad_code', public.grant_doctor_access('XYZ') ->> 'reason');
  insert into t values (5, 'P olmayan kod → not_found', public.grant_doctor_access('DR-0001') ->> 'reason');
  reset role; select doctor_code into c from public.profiles where id = 'd0000000-0000-0000-0000-00000000000d'; set local role authenticated;
  insert into t values (6, 'P onaylı doktora (küçük harf, tiresiz) izin verir', (public.grant_doctor_access(lower(replace(c,'-',''))) ->> 'full_name'));
end $$;
insert into t select 7, 'P my_doctors (beklenen 1: Dr. Deniz)', count(*) || ' ' || coalesce(max(full_name),'') from public.my_doctors();
do $$ begin insert into public.patient_doctor_links (patient_id, doctor_id) values ('a0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-00000000000e'); insert into t values (8,'P bağlantıyı doğrudan yazamaz','ACIK');
exception when others then insert into t values (8,'P bağlantıyı doğrudan yazamaz','engellendi'); end $$;
do $$ begin update public.profiles set doctor_verified = true where id = 'a0000000-0000-0000-0000-00000000000a'; insert into t values (9,'P onay sütununu değiştiremez','ACIK');
exception when others then insert into t values (9,'P onay sütununu değiştiremez','engellendi'); end $$;

-- ===== D (onaylı doktor) =====
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
insert into t select 10, 'D my_patients (beklenen 1: Hasta Pelin)', count(*) || ' ' || coalesce(max(full_name),'') from public.my_patients();
insert into t select 11, 'D P verisi: yalnız supplements (su takibi gizli)', string_agg(store, ',') from public.user_stores where user_id = 'a0000000-0000-0000-0000-00000000000a';
insert into t select 12, 'D O verisini göremez (beklenen 0)', count(*)::text from public.user_stores where user_id = 'b0000000-0000-0000-0000-00000000000b';
do $$ declare n int; begin update public.user_stores set data = '{"v":["ele"]}' where user_id = 'a0000000-0000-0000-0000-00000000000a'; get diagnostics n = row_count; insert into t values (13,'D P verisini değiştiremez (beklenen 0)', n::text); end $$;
do $$ begin insert into public.user_stores (user_id, store, data) values ('a0000000-0000-0000-0000-00000000000a','labs','{"v":{}}'); insert into t values (14,'D P adına veri yazamaz','ACIK');
exception when others then insert into t values (14,'D P adına veri yazamaz','engellendi'); end $$;
do $$ begin insert into public.doctor_notes (doctor_id, patient_id, body) values ('d0000000-0000-0000-0000-00000000000d','a0000000-0000-0000-0000-00000000000a','D3 dozunu kontrol edelim'); insert into t values (15,'D hastasına not yazar','OK');
exception when others then insert into t values (15,'D hastasına not yazar','HATA ' || sqlerrm); end $$;
do $$ begin insert into public.doctor_notes (doctor_id, patient_id, body) values ('d0000000-0000-0000-0000-00000000000d','b0000000-0000-0000-0000-00000000000b','izinsiz'); insert into t values (16,'D izin vermeyen hastaya not yazamaz','ACIK');
exception when others then insert into t values (16,'D izin vermeyen hastaya not yazamaz','engellendi'); end $$;
do $$ begin insert into public.doctor_notes (doctor_id, patient_id, body) values ('e0000000-0000-0000-0000-00000000000e','a0000000-0000-0000-0000-00000000000a','sahte'); insert into t values (17,'D başka doktor adına not yazamaz','ACIK');
exception when others then insert into t values (17,'D başka doktor adına not yazamaz','engellendi'); end $$;
insert into t select 18, 'D profil görünürlüğü: P görünür, O görünmez', string_agg(full_name, ',' order by full_name) from public.profiles where id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');

-- ===== O (başka hasta) =====
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into t select 19, 'O: P verisi + P notları + D profili (beklenen 0/0/0)', (select count(*) from public.user_stores where user_id='a0000000-0000-0000-0000-00000000000a') || '/' || (select count(*) from public.doctor_notes) || '/' || (select count(*) from public.profiles where id='d0000000-0000-0000-0000-00000000000d');

-- ===== U (onaysız doktor) =====
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
insert into t select 20, 'U (onaysız): hasta/veri yok (0/0)', (select count(*) from public.my_patients()) || '/' || (select count(*) from public.user_stores where user_id='a0000000-0000-0000-0000-00000000000a');

-- ===== P: not okur, düzenleyemez, izni geri alır, tekrar açamaz =====
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 21, 'P notu okur (yazan: Dr. Deniz)', count(*) || ' ' || coalesce(max(doctor_label),'') from public.doctor_notes;
do $$ declare n int; begin update public.doctor_notes set body='hasta değiştirdi'; get diagnostics n = row_count; insert into t values (22,'P notu değiştiremez (beklenen 0)', n::text); end $$;
insert into t select 23, 'P izni geri alır', public.revoke_doctor_access('d0000000-0000-0000-0000-00000000000d')::text;
do $$ begin update public.patient_doctor_links set status='active' where doctor_id='d0000000-0000-0000-0000-00000000000d'; insert into t values (24,'P izni doğrudan tekrar açamaz','ACIK');
exception when others then insert into t values (24,'P izni doğrudan tekrar açamaz','engellendi'); end $$;

-- ===== D: izin geri alındıktan sonra =====
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
insert into t select 25, 'İzin geri alındı: D hasta/veri/profil (0/0/0)', (select count(*) from public.my_patients()) || '/' || (select count(*) from public.user_stores where user_id='a0000000-0000-0000-0000-00000000000a') || '/' || (select count(*) from public.profiles where id='a0000000-0000-0000-0000-00000000000a');
do $$ begin insert into public.doctor_notes (doctor_id, patient_id, body) values ('d0000000-0000-0000-0000-00000000000d','a0000000-0000-0000-0000-00000000000a','izinden sonra'); insert into t values (26,'İzin geri alındı: D not yazamaz','ACIK');
exception when others then insert into t values (26,'İzin geri alındı: D not yazamaz','engellendi'); end $$;

-- ===== Hasta hesabı silinince not anonimleşir =====
reset role;
delete from auth.users where id = 'a0000000-0000-0000-0000-00000000000a';
insert into t select 27, 'P silindi: not kalır, hasta bağlantısı null', count(*) || ' not, patient_id=' || coalesce(max(patient_id::text),'null') from public.doctor_notes;

do $$ declare r text; begin
  select string_agg(n || ') ' || k || ' => ' || coalesce(s,'NULL'), ' | ' order by n) into r from t;
  raise exception 'TEST_SONUCU (islem geri alindi): %', r;
end $$;
