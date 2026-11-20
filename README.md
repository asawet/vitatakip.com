# VitaTakip (PWA)

Vitamin, takviye, ilaç, tahlil ve belirti takibi için **tarayıcıda çalışan, cihaza yüklenebilen web uygulaması (PWA)**.
Site: https://asawet05.github.io/VitaTakip-PWA/

## Mimari: önce cihaz (local-first), sunucu yok
- Hesaplar, profil, günlük sıvı/takviye takibi, ilaç listesi, tahliller ve tahlil geçmişi, belirti seçimleri **yalnızca kullanıcının tarayıcısında** (localStorage + IndexedDB yedeği) tutulur. Firebase, bulut eşitleme, uzak veritabanı veya sunucu tabanlı giriş yoktur.
- **Yedekleme:** Ayarlar > "Yedek İndir" bütün kayıtları JSON dosyası olarak verir; başka cihazda/tarayıcıda "Yedekten Geri Yükle" ile aynen geri gelir (`tests/yedek-geri-yukleme.mjs`).

## Cihaza yükleme (APK yok)
- `manifest.json` + `service-worker.js`: telefona ve bilgisayara "Uygulamayı Yükle / Ana Ekrana Ekle" ile kurulur, **internetsiz açılır**.
- Uygulama içinde "Uygulamayı Cihaza Yükle" düğmesi (üst menü, giriş ekranı, Ayarlar > Araçlar). iPhone/iPad'de Safari "Paylaş → Ana Ekrana Ekle" yardımı gösterilir.
- Ana ekran kısayolları: Takviyeler, Tahliller, NeyimVar?

## Yapay zekâ asistanı (isteğe bağlı, sunucusuz)
- Ayarlar > Yapay zekâ: kullanıcı kendi **Gemini API anahtarını** girer; anahtar yalnızca kendi tarayıcısında, hesabına özel saklanır ve kaydederken Google ile doğrulanır.
- Vita AI, sorulara yanıt verirken tarayıcıdaki **profil, tahliller, seçili belirtiler ve ilaç/takviyeleri** otomatik bağlam olarak ekler. Sağlık verisi dışarı gittiği için ilk soruda bir kez onay istenir; onay hesaba kaydedilir ve sohbetten geri alınabilir.
- İstekler tarayıcıdan doğrudan Google'a gider (anahtar adres satırında değil `x-goog-api-key` başlığında). Anahtar yoksa, onay verilmezse veya Gemini yanıt veremezse cihazdaki yerel motor yanıtlar.
- Sayfanın bağlanabildiği tek dış adres: `generativelanguage.googleapis.com` (CSP `connect-src`).

## Hız
- 11 CSS → `css/app.css`, 43 JS → 4 parça (`js/app.1-4.js`, `defer`, sırası korunur). Servis çalışanı dosyaları önbellekten anında verir, arkada günceller.
- Ölçüm (`tests/acilis-hizi.mjs`): tekrar açılış ~0,76 sn → ~0,3 sn (yavaş 4G + 4× yavaş işlemci); normal bağlantıda ilk açılış ~0,47 sn → ~0,17 sn.

## Geliştirme
- Kaynak dosyalar `css/*.css` ve `js/**/*.js`. Değişiklikten sonra **`node tools/build.mjs`** çalıştırın: paketleri, `index.html` bağlantılarını ve `service-worker.js` önbellek sürümünü/listesini günceller (küçültme için esbuild'i npx ile kullanır; internet yoksa küçültmeden derler).
- Tüm yollar `./` ile göreceli: GitHub Pages alt klasöründe de, özel alan adında da aynı şekilde çalışır.
- Yerelde: `npx serve -l 8080 .` → http://localhost:8080 . Testler: `tests/README.md`.

Tıbbi tanı koymaz; kararlar için hekiminize danışın.
