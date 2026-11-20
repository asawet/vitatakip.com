# VitaTakip uçtan uca testleri

Gerçek Chrome ile (puppeteer-core) uygulamayı açıp kullanıcı gibi dener.

## Hazırlık
1. Node.js 20+ kurulu olsun, bu klasörde: `npm i puppeteer-core`
2. Siteyi yerelde sunun (depo kökünde): `npx serve -l 8080 .`
3. `lib.mjs` içindeki Chrome yolunu (`executablePath`) kendi makinenize göre düzenleyin.

## Testler
| Dosya | Ne doğrular |
|---|---|
| `smoke.mjs` | Tüm ekranlar/pencereler açılıyor, konsol hatası ve dış istek yok |
| `uygulama-tanilama.mjs` | Uygulamanın kendi 159 testi (`VitaTakipDiagnostics.run()`) |
| `veri-yasam-dongusu.mjs` | Tahlil silme, belirti kaldırma, yenileme sonrası diriliş yok |
| `tahlil-yasam-dongusu.mjs` | Yanlış tahlil → doğru tahlil, alan boşaltma, taslak kaydı temizliği |
| `analiz-5-senaryo.mjs` | Klinik Analiz'in 5 kullanım senaryosu |
| `hasta-guvenligi.mjs` | Acil uyarılar, 18 yaş altı, gebelik uyarısı, yanlış besin eşleşmesi yok |
| `geri-bildirim.mjs` | Geri bildirim: adres görünmez, ad profilden, cihaza kaydedilir, hiçbir sunucuya istek gitmez |
| `esik-hizalama.mjs` | Hb ve kreatinin eşikleri ekrandaki aralıkla aynı (sınır değerler, cinsiyet, gebelik, tüm parametrelerde tutarlılık) |
| `gebelik.mjs` | Gebelik referans seti: Hb (WHO/CDC), kreatinin, ALT, ferritin, eGFR kapatma, emzirme, uçtan uca |
| `neyimvar-son-adim.mjs` | "Sonuçları Gör" düğmesi yalnızca son adımda görünür |
| `yas-evresi.mjs` | Yaş/cinsiyete göre RDA tablosu, yaş notları, Klinik Analiz/Ayarlar/Rapor entegrasyonu |
| `belirti-kontrol.mjs` | Günlük "belirti hâlâ var mı" kartı |
| `gun-ai-anahtar.mjs` | İsteğe bağlı Gemini (sahte sunucuyla, Google'a gitmeden): anahtarsızken istek yok, geçersiz anahtar reddedilir, anahtar başlıkta gider, ilk soruda bir kez onay sorulur ve hesaba kaydedilir, genel soruda profil/tahlil/belirti bağlamı otomatik eklenir, hata/kotada yerel motora geçiş, kaldırılmış modelde otomatik model bulma, kutu fotoğrafı onaylı tanıma; gece sıfırlama, kompakt yerel yanıt |
| `rapor.mjs` | Kısa doktor özeti |
| `klinik-mantik.mjs` | Takviye adayı güvenlik değişmezleri (yüksek değerde aday yok, böbrek/hiperkalsemi kilidi, gebelik/çocuk, eGFR) |
| `guvenlik-xss.mjs` | Kullanıcı girdisinin kod olarak çalışmaması (XSS) |
| `ana-sayfa-grafik.mjs` | Ana sayfa karşılama kartı ve tahlil gelişim grafiği |
| `denetim-duzeltmeleri.mjs` | Denetim düzeltmeleri: içe aktarma doğrulaması, sahte fotoğraf tanıma yok, uydurma barkod yok, hesap silme (IndexedDB dahil), tahlil aralık kontrolü, eksik profil/eGFR, ALT, çoklu sekme |
| `hesap-kaliciligi.mjs` | Adında "Örnek", "Deneme", "Test", "Misafir" geçen gerçek hesaplar ve verileri sayfa yenilenince silinmez; yalnızca eski sabit kimlikli misafir hesabı temizlenir |
| `web-pwa.mjs` | PWA: service-worker.js, Chrome yüklenebilirlik denetimi, eksiksiz manifest, "Uygulamayı Cihaza Yükle" düğmesi ve iPhone yardımı, ./ göreceli yollar, tek CSS + en fazla 4 JS, telefonda taşma yok, APK/Android/Firebase/AI Studio ifadesi yok, kısayol adresi (#view-labs), çevrimdışı açılış, anahtarsız dış istek yok. Canlı site: `node web-pwa.mjs https://asawet05.github.io/VitaTakip-PWA/` |
| `tum-butonlar.mjs` | Tüm butonlar: sayfadaki her on* işleyicisinin çağırdığı fonksiyon tanımlı mı; 6 ekranda ve 15 pencerede görünür her buton/sekme/karta tek tek basılır, sayfa/konsol hatası veya yakalanmamış Promise hatası üreten öğe raporlanır |
| `cevrimdisi.mjs` | Çevrimdışı: service-worker.js önbellek listesi proje dosyalarıyla birebir (hepsi 200), tüm dosyalar önbelleğe alınır; internet kesikken tüm ekranlar açılır, tüm simgeler çizilir, PDF/grafik/barkod kütüphaneleri ve belirti görselleri yüklenir. Canlı: `node cevrimdisi.mjs https://asawet05.github.io/VitaTakip-PWA/` |
| `yerel-veri.mjs` | Local-first: profil, takviye, tahlil, belirti ve Gemini anahtarı yalnızca localStorage'da hesaba özel; yenilemede geri okunur; çerez yok, dış istek yok |
| `yedek-geri-yukleme.mjs` | JSON yedek ↔ localStorage tam döngüsü: veri gir → Yedek İndir → hesabı sil → yeni hesap → Yedekten Geri Yükle → profil, ilaçlar, takviyeler, sıvı, tahliller, geçmiş, belirti, hekim notu geri gelir ve yenilemeden sonra kalır |
| `acilis-hizi.mjs` | Açılış ekranının kapanma süresi, istek sayısı ve boyut (yavaş 4G + 4× yavaş işlemci; ilk ve tekrar ziyaret) |
| `sifre.mjs` | Yerel hesap şifresi: PBKDF2 + kullanıcı başına tuz, Türkçe karakter çakışması yok, eski kayıtların girişte taşınması, hesap silme onayında "sil"/"SİL" |
| `fotograf-barkod.mjs` | Fotoğraftan barkod okuma (BarcodeDetector yokken ZXing), 0 ile başlayan EAN-13/UPC-A eşleşmesi, kamera izni olmadan galeriden fotoğraf, barkodsuz fotoğrafta ürün uydurmama, anahtarsızken Gemini onayı sorulmaması ve yapay zekâ düğmelerinin "anahtar gerekli" işareti |
| `v3-ozellikler.mjs` | V3: açık/koyu/sistem tema (yazdırmada her zaman açık), tahlil kartlarında (i) kaynak penceresi ve eşik sürümü, eritrosit folatı + homosistein alanları, kaynaklı kalsiyum/MCV eşikleri, kontrol ölçümü hatırlatması (yerel + .ics; dosyada sonuç değeri yok), cihazda üretilen paylaşım kartı (PNG); dış istek yok |
| `v4-arayuz.mjs` | V4: cihaz testindeki 11 hatanın gerilemeleri (çıkış sonrası otomatik giriş yok + Hesabı Unut, Hb g/L↔g/dL, PDF önizleme eGFR, VitaAI rozeti, yazdırmada toast, tahlil PDF durum sütunu, Türkçe ilaç etiketleri, erkekte gebelik alanı, takviye tekrar koruması, halka notu, grafik etiketi) + orijinal sade düzen: üst bar (tema düğmesi yok), 3 katmanlı sol menü (üst sabit bildirim+profil, düz liste, alt sabit Yardım+Çıkış; VitaAI menünün altında), sabit 5 sekmeli alt bar + bilgi şeridi + tek VitaAI, Ana Sayfa tek akış |

Çalıştırma: `node smoke.mjs` (her biri bağımsızdır).
