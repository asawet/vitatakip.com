-- Doktor notu hem hastadan hem doktordan koparsa (iki hesap da silindi) kimse okuyamaz (RLS) ama sağlık bilgisi içerir:
-- böyle notlar otomatik silinir. Yalnız hasta silinince not doktor için anonim kalır; yalnız doktor silinince hasta için
-- (doktor adıyla) kalır. Yabancı anahtarın "on delete set null" eylemi satırı UPDATE eder; tetikleyici o anda çalışır.

create or replace function private.doctor_note_purge_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.patient_id is null and new.doctor_id is null then
    delete from public.doctor_notes where id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function private.doctor_note_purge_orphan() from public, anon, authenticated;

create trigger doctor_notes_purge_orphan
  after update of patient_id, doctor_id on public.doctor_notes
  for each row execute function private.doctor_note_purge_orphan();

-- Mevcut sahipsiz notlar (test sırasında oluşan) temizlenir
delete from public.doctor_notes where patient_id is null and doctor_id is null;
