-- Doktor notlarına yanıt (basit yazışma): hasta ve notu yazan doktor, not altına kısa yanıt yazabilir.
--  * Görme: yalnız notun hastası ve doktoru.
--  * Yazma: yalnız izin (patient_doctor_links 'active') sürerken; doktor ayrıca ONAYLI olmalı. İzin geri alınınca yazışma
--    salt okunur kalır. Herkes yalnız kendi yanıtını siler. Not silinince yanıtları da silinir (cascade).
--  * Tüm kurallar RLS (SECURITY INVOKER): çağıranın kendi bağlantı/profil satırlarını görme yetkisiyle denetlenir.

create table public.note_replies (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.doctor_notes (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_role text not null check (author_role in ('patient', 'doctor')),
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index note_replies_note on public.note_replies (note_id, created_at);
alter table public.note_replies enable row level security;

create policy "yanıt: notun hastası ve doktoru görür" on public.note_replies
  for select to authenticated
  using (exists (select 1 from public.doctor_notes n where n.id = note_id and (select auth.uid()) in (n.patient_id, n.doctor_id)));

create policy "yanıt: izin sürerken hasta ya da onaylı doktor yazar" on public.note_replies
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.doctor_notes n
      join public.patient_doctor_links l on l.patient_id = n.patient_id and l.doctor_id = n.doctor_id and l.status = 'active'
      where n.id = note_id
        and (
          (author_role = 'patient' and n.patient_id = (select auth.uid()))
          or (author_role = 'doctor' and n.doctor_id = (select auth.uid())
              and exists (select 1 from public.profiles p where p.id = n.doctor_id and p.account_type = 'doctor' and p.doctor_verified))
        )
    )
  );

create policy "yanıt: yazan siler" on public.note_replies
  for delete to authenticated
  using (author_id = (select auth.uid()));

revoke all on public.note_replies from anon, authenticated;
grant select, insert, delete on public.note_replies to authenticated;
grant all on public.note_replies to service_role;
