# Veritabanı davranış testleri (RLS)

Bu dosyalar Supabase SQL editöründe (veya MCP `execute_sql`) **olduğu gibi** çalıştırılır. Her test sahte kullanıcılar
oluşturur, rolleri (`set local role authenticated` + `request.jwt.claims`) değiştirerek izinleri dener ve **sonunda kasıtlı
bir hata fırlatır**: hata mesajı test sonuçlarını içerir ve Postgres tüm işlemi geri alır — veritabanında hiçbir şey kalmaz.

- `doktor_rls_test.sql` — doktor paneli: onaylı/onaysız doktor, hasta izni ver/geri al, doktorun yalnız okuması,
  seçili veri türleri (su takibi gizli), doktor notları, hasta silinince notun anonimleşmesi (27 kontrol).
