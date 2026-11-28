# VitaTakip (PWA)

Vitamin, takviye, ilaç, tahlil ve belirti takibi için **tarayıcıda çalışan, cihaza yüklenebilen web uygulaması (PWA)**.
Site: https://vitatakip.com.tr

## Mimari: önce cihaz (local-first), isteğe bağlı bulut hesabı
- **Yerel hesap** (giriş ekranında "Bu cihazda yerel hesap"): hesap, profil, günlük takip, ilaç/takviye, tahliller ve belirtiler **yalnızca kullanıcının tarayıcısında** (localStorage + IndexedDB yedeği) tutulur; hiçbir sunucuya gönderilmez.
- **Bulut hesabı** (takma ad veya e-posta; KVKK açık rızasıyla): veriler yine **önce cihaza** yazılır, sonra Supabase'e (Frankfurt / AB) eşitlenir; telefon ve bilgisayarda aynı hesap. İnternet yokken uygulama çalışır, değişiklikler bağlantı gelince gönderilir.
  - `js/bulut.js` istemci (yalnız **herkese açık** anahtar; veriyi RLS korur: herkes yalnız kendi satırları), `js/bulut-giris.js` giriş ekranı, `js/bulut-esitleme.js` eşitleme (yalnız değişen veri türü; yeni cihazda ilk çekme bitmeden hiçbir şey gönderilmez), `js/bulut-tasima.js` yerel hesaptan buluta taşıma (yerel şifre gerekir).
  - Veritabanı şeması ve RLS: `supabase/migrations/`. Hesabı tamamen silme: `supabase/functions/hesap-sil` (Edge Function; yönetici anahtarı yalnız Supabase içinde).
  - Buluta gitmeyenler: e-Nabız PDF'leri, profil fotoğrafı, Gemini anahtarı, taslaklar.
  - **Doktor paneli:** doktor hesabı "onay bekliyor" açılır ve `DR-####` kodu alır; onayı yalnız yönetici verir (`update public.profiles set doctor_verified = true where doctor_code = 'DR-....';`). Hasta Ayarlar > Doktorum'dan kodla izin verir / geri alır (`js/doktorum.js`); doktor "Doktor Paneli" ekranında izin veren hastanın seçili kayıtlarını **yalnız okur** ve not yazar (`js/doktor-paneli.js`). Kurallar veritabanında (RLS): `supabase/migrations/*doktor_paneli*.sql`, davranış testi `supabase/tests/doktor_rls_test.sql`.
  - **Yapay zekâ proxy'si:** bulut hesabında kendi anahtarı olmayan kullanıcı için `supabase/functions/ai-proxy` (Gemini anahtarı Supabase Secret'ta; kullanıcı/uygulama günlük kotası; ad soyad ayıklanır; kota dolunca yerel motor).
  - Ücretsiz plan 7 gün etkinlik olmazsa projeyi duraklatır: `.github/workflows/supabase-keepalive.yml` günde bir kez çağırır.
  - **Gizli anahtarlar depoya girmez**: Supabase gizli anahtarı yalnız Edge Function ortamında, keepalive bilgileri GitHub Secrets'ta. `.env` dosyaları `.gitignore`'da.
- **Yedekleme:** Ayarlar > "Yedek İndir" bütün kayıtları JSON dosyası olarak verir; başka cihazda/tarayıcıda "Yedekten Geri Yükle" ile aynen geri gelir (`tests/yedek-geri-yukleme.mjs`). Bulut için otomatik yedek yoktur.

## Cihaza yükleme (APK yok)
- `manifest.json` + `service-worker.js`: telefona ve bilgisayara "Uygulamayı Yükle / Ana Ekrana Ekle" ile kurulur, **internetsiz açılır**.
- Uygulama içinde "Uygulamayı Cihaza Yükle" düğmesi (üst menü, giriş ekranı, Ayarlar > Araçlar). iPhone/iPad'de Safari "Paylaş → Ana Ekrana Ekle" yardımı gösterilir.
- Ana ekran kısayolları: Takviyeler, Tahliller, NeyimVar?

## Yapay zekâ asistanı (isteğe bağlı, sunucusuz)
- Ayarlar > Yapay zekâ: kullanıcı kendi **Gemini API anahtarını** girer; anahtar yalnızca kendi tarayıcısında, hesabına özel saklanır ve kaydederken Google ile doğrulanır.
- Vita AI, sorulara yanıt verirken tarayıcıdaki **profil, tahliller, seçili belirtiler ve ilaç/takviyeleri** otomatik bağlam olarak ekler. Sağlık verisi dışarı gittiği için ilk soruda bir kez onay istenir; onay hesaba kaydedilir ve sohbetten geri alınabilir.
- İstekler tarayıcıdan doğrudan Google'a gider (anahtar adres satırında değil `x-goog-api-key` başlığında). Anahtar yoksa, onay verilmezse veya Gemini yanıt veremezse cihazdaki yerel motor yanıtlar.
- Sayfanın bağlanabildiği dış adresler (CSP `connect-src`): VitaTakip Supabase projesi (bulut hesabı), `generativelanguage.googleapis.com` (Gemini), ürün katalogları (Open Food/Products Facts).

## Hız
- 11 CSS → `css/app.css`, 43 JS → 4 parça (`js/app.1-4.js`, `defer`, sırası korunur). Servis çalışanı dosyaları önbellekten anında verir, arkada günceller.
- Ölçüm (`tests/acilis-hizi.mjs`): tekrar açılış ~0,76 sn → ~0,3 sn (yavaş 4G + 4× yavaş işlemci); normal bağlantıda ilk açılış ~0,47 sn → ~0,17 sn.

## Geliştirme
- Kaynak dosyalar `css/*.css` ve `js/**/*.js`. Değişiklikten sonra **`node tools/build.mjs`** çalıştırın: paketleri, `index.html` bağlantılarını ve `service-worker.js` önbellek sürümünü/listesini günceller (küçültme için esbuild'i npx ile kullanır; internet yoksa küçültmeden derler).
- Tüm yollar `./` ile göreceli: GitHub Pages alt klasöründe de, özel alan adında da aynı şekilde çalışır.
- Yerelde: `npx serve -l 8080 .` → http://localhost:8080 . Testler: `tests/README.md`.

Tıbbi tanı koymaz; kararlar için hekiminize danışın.
