# VitaTakip (PWA)

Vitamin, takviye, ilaç, tahlil ve belirti takibi için **tarayıcıda çalışan, cihaza yüklenebilen web uygulaması (PWA)**.
Site: https://vitatakip.com.tr

## Mimari: önce cihaz (local-first), isteğe bağlı bulut hesabı
- **Yerel hesap** (giriş ekranında "Bu cihazda yerel hesap"): hesap, profil, günlük takip, ilaç/takviye, tahliller ve belirtiler **yalnızca kullanıcının tarayıcısında** (localStorage + IndexedDB yedeği) tutulur; hiçbir sunucuya gönderilmez.
- **Bulut hesabı** (takma ad veya e-posta; KVKK açık rızasıyla): veriler yine **önce cihaza** yazılır, sonra Supabase'e (Frankfurt / AB) eşitlenir; telefon ve bilgisayarda aynı hesap. İnternet yokken uygulama çalışır, değişiklikler bağlantı gelince gönderilir.
  - `js/bulut.js` istemci (yalnız **herkese açık** anahtar; veriyi RLS korur: herkes yalnız kendi satırları), `js/bulut-giris.js` giriş ekranı, `js/bulut-esitleme.js` eşitleme (yalnız değişen veri türü; yeni cihazda ilk çekme bitmeden hiçbir şey gönderilmez), `js/bulut-tasima.js` yerel hesaptan buluta taşıma (yerel şifre gerekir).
  - Veritabanı şeması ve RLS: `supabase/migrations/`. Hesabı tamamen silme: `supabase/functions/hesap-sil` (Edge Function; yönetici anahtarı yalnız Supabase içinde).
  - Buluta gitmeyenler: e-Nabız PDF'leri, profil fotoğrafı, Gemini anahtarı, taslaklar.
  - **Doktor paneli:** doktor hesabı "onay bekliyor" açılır ve `DR-####` kodu alır; onayı yalnız yönetici verir — uygulama içinde **Yönetici Paneli**nden (`js/yonetici.js`: Özet · Kullanıcılar · Doktorlar · İşlem kaydı · Rehber; yönetici hesap bilgilerini görür, sağlık kayıtlarının içeriğini göremez; hesap silme `supabase/functions/yonetici-islem` ile, giriş bilgisi yazılarak onaylanır; her işlem `admin_audit`'e yazılır) ya da SQL ile (`update public.profiles set doctor_verified = true where doctor_code = 'DR-....';`). Yönetici hesabı yalnız SQL ile atanır: `update public.profiles set is_admin = true where id = '<kullanıcı uuid>';` (istemci bu alanı değiştiremez; `supabase/migrations/20261128190000_yonetici_paneli.sql`). Hasta, Doktorum'da **onaylı doktor listesinden** (yalnız ad + kod) seçerek de izin verebilir; onaylı doktor, hastayı takma adı / e-postasıyla **davet** eder, hasta kabul edene kadar hiçbir veri görünmez (`js/doktor-davet.js`; günde 30 istek, reddedilirse 7 gün yeni istek yok; `supabase/migrations/20261128200000_doktor_rehberi_davet.sql`). Hasta Ayarlar > Doktorum'dan kodla izin verir / geri alır (`js/doktorum.js`); doktor "Doktor Paneli" ekranında izin veren hastanın seçili kayıtlarını **yalnız okur** ve not yazar (`js/doktor-paneli.js`). Kurallar veritabanında (RLS): `supabase/migrations/*doktor_paneli*.sql`, davranış testi `supabase/tests/doktor_rls_test.sql`.
  - **Yapay zekâ proxy'si:** bulut hesabında kendi anahtarı olmayan kullanıcı için `supabase/functions/ai-proxy` (Gemini anahtarı Supabase Secret'ta; kullanıcı/uygulama günlük kotası; ad soyad ayıklanır; kota dolunca yerel motor).
  - **Şifre sıfırlama** (`js/bulut-sifre.js`): e-posta hesabında Supabase sıfırlama e-postası (SMTP: Resend, bölge İrlanda / eu-west-1); bağlantı uygulamaya `?type=recovery&token_hash=…` ile döner, yeni şifre kaydedilince doğrulanır. Takma ad hesabında kayıtta bir **kurtarma kodu** verilir (yalnız SHA-256 özeti `public.recovery_codes`'ta; Ayarlar > Veriler ve yedek'ten yenilenir); sıfırlamayı `supabase/functions/sifre-kurtar` yapar (deneme sınırı, kod tek kullanımlık, yenisi verilir). Testler: `tests/sifre-sifirlama.mjs`, gerçek sunucu `tests/manuel/sifre-gercek.mjs`.
    - **E-posta kurulumu (bir kez, Dashboard):**
      1. resend.com → Domains → `vitatakip.com.tr` ekle (bölge: AB / Ireland) → verilen DNS kayıtlarını (DKIM `resend._domainkey` TXT, `send` alt alanı MX + SPF TXT) Turhost DNS paneline gir → Verify.
      2. Resend → API Keys → yalnız bu alan için "Sending access" anahtarı oluştur (depoya/sohbete yazma).
      3. Supabase → Authentication → Emails → SMTP Settings: Enable custom SMTP; Sender `no-reply@vitatakip.com.tr`, ad `VitaTakip`; Host `smtp.resend.com`, Port `465`, Username `resend`, Password = Resend anahtarı.
      4. Supabase → Authentication → URL Configuration: Site URL `https://vitatakip.com.tr`; Redirect URLs `https://vitatakip.com.tr/**`, `https://www.vitatakip.com.tr/**`, `http://localhost:8090/**`.
      5. Supabase → Authentication → Emails → Templates → Reset Password: konu ve gövde `supabase/eposta-sablonlari/sifre-sifirlama.html`.
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
