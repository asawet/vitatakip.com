/* VitaTakip derleme: CSS ve JS kaynaklarını sırayla TEK dosyada birleştirir, index.html'yi ve
   service-worker.js önbellek listesini günceller. Sunucu/bağımlılık gerekmez: `node tools/build.mjs`
   Kaynak dosyalar css/ ve js/ altında düzenlenir; tarayıcı yalnızca css/app.css ve js/app.bundle.js yükler. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const wr = (f, s) => fs.writeFileSync(path.join(root, f), s);

/* Yükleme sırası önemlidir (önceki dosyadaki genel fonksiyonları sonrakiler kullanır). */
const CSS = ['fontawesome', 'tailwind', 'style', 'auth', 'clinical', 'report', 'compact', 'home', 'overrides', 'food-alternatives', 'tools', 'tema-v2']
  .map(n => `css/${n}.css`);
const JS = [
  'js/sw-register.js', 'js/lazy-icon-fonts.js',
  'js/app/01-hash-ses-tts.js', 'js/app/02-navigation.js', 'js/app/03-global-search.js', 'js/app/04-anamnesis-tabs.js',
  'js/app/05-clinical-rules.js', 'js/app/06-state-lab-reference.js', 'js/app/07-session-backup-fhir.js',
  'js/prescription_drugs_db.js', 'js/app/08-pdf-onboarding-conflicts.js', 'js/app/09-symptom-review-storage.js',
  'js/supplement_db.js', 'js/app/10-daily-tracking-deprescribing.js', 'js/app/11-cdss-analysis.js',
  'js/app/12-report-notifications-ai-chat.js', 'js/app/13-ai-summary-barcode.js', 'js/app/14-spotlight-tour.js',
  'js/app/15-fridge-schedule.js', 'js/app/16-lab-evidence.js', 'js/app/17-lab-insights.js', 'js/app/18-food-alternatives.js', 'js/app/18a-urun-modulleri.js',
  'js/lab-trend.js', 'js/recharts-lab-dashboard.js', 'js/app/19-app-startup.js',
  'js/legal-onboarding.js', 'js/medical-drawer.js', 'js/doctor-tests.js', 'js/clinical-simple.js', 'js/report-simple.js',
  'js/age-stage.js', 'js/day-compact.js', 'js/add-sup-simple.js', 'js/scanner-simple.js', 'js/ui-enhancements.js',
  'js/compact-labs-neyim.js', 'js/neyimvar-final-tidy.js', 'js/simplify-ui.js', 'js/ayarlar-akordeon.js', 'js/evidence-guide.js',
  'js/neyim-wizard.js', 'js/visual-reference.js', 'js/egfr-calculator.js', 'js/pwa-install.js', 'js/gorsel-coz.js', 'js/profil-foto.js', 'js/takviye-sayfa.js', 'js/ilac-sayfa.js', 'js/izin-merkezi.js', 'js/ana-sekmeler.js', 'js/profil-adimlar.js', 'js/tema.js', 'js/kaynak-bilgi.js', 'js/kontrol-hatirlatma.js', 'js/paylasim-karti.js'
];

const banner = f => `\n/* ===== ${f} ===== */\n`;
const css = CSS.map(f => banner(f) + rd(f)).join('\n');
// Her dosya kendi satırında biter; ";" bir önceki dosyanın son ifadesinin sonrakiyle birleşmesini önler.
const js = JS.map(f => banner(f) + rd(f) + '\n;').join('\n');

// Sözdizimi denetimi: aynı adlı let/const çakışması vb. paketi bozuyorsa derleme durur.
try { new vm.Script(js, { filename: 'js/app.bundle.js' }); }
catch (e) { console.error('PAKET SÖZDİZİMİ HATASI:', e.message); process.exit(1); }

/* Küçültme: JS'de yalnızca boşluk/yorum (kod yapısı ve adlar KORUNUR; uygulamanın kendi tanılama testleri kaynak metnini okur) — dosyalar birbirinin genel adlarını kullanır.
   esbuild yalnızca derleme sırasında npx ile çalışır, siteye eklenmez. Çalışmazsa küçültülmemiş paket yazılır. */
function minify(code, ext) {
  if (process.env.VITA_NO_MINIFY) return null;
  const tmp = path.join(os.tmpdir(), `vita-build-${process.pid}.${ext}`);
  fs.writeFileSync(tmp, code);
  try {
    const args = ['--yes', 'esbuild@0.24.2', tmp, '--legal-comments=none', '--charset=utf8', '--log-level=error',
      ...(ext === 'css' ? ['--minify'] : ['--minify-whitespace'])];
    const win = process.platform === 'win32';
    return execFileSync(win ? 'npx.cmd' : 'npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: win, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.warn('Uyarı: küçültme atlandı (esbuild çalışmadı):', String(e.message).split('\n')[0]);
    return null;
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
}
const cssOut = minify(css, 'css') || css;

/* JS: sırası korunmuş PARÇALARA bölünür (dosya ortadan bölünmez). Parçalar <head> içinden `defer` ile paralel iner,
   belge sırasıyla çalışır: bir parça çalışırken sonrakiler inmeye devam eder (tek dev pakete göre ilk açılış daha hızlı). */
const CHUNKS = 4;
const sizes = JS.map(f => Buffer.byteLength(rd(f)));
const target = sizes.reduce((a, b) => a + b, 0) / CHUNKS;
const groups = [[]]; let acc = 0;
JS.forEach((f, i) => {
  if (acc >= target && groups.length < CHUNKS) { groups.push([]); acc = 0; }
  groups[groups.length - 1].push(f); acc += sizes[i];
});
const chunkOut = groups.map((files, i) => {
  const src = files.map(f => banner(f) + rd(f) + '\n;').join('\n');
  const out = minify(src, 'js') || src;
  try { new vm.Script(out, { filename: `js/app.${i + 1}.js` }); }
  catch (e) { console.error(`KÜÇÜLTÜLMÜŞ PARÇA HATASI (app.${i + 1}.js):`, e.message); process.exit(1); }
  return out;
});
const hash = crypto.createHash('sha256').update(cssOut).update(chunkOut.join('\n'))
  .update(rd('index.html').replace(/\?v=[0-9a-f]{10}/g, '')).update(rd('manifest.json')).digest('hex').slice(0, 10);

wr('css/app.css', '/* VitaTakip — derlenmiş stil. Elle düzenlemeyin; kaynak: css/*.css, derleme: node tools/build.mjs */\n' + cssOut);
for (const f of fs.readdirSync(path.join(root, 'js'))) if (/^app\.(\d+|bundle)\.js$/.test(f)) fs.unlinkSync(path.join(root, 'js', f));
const jsFiles = chunkOut.map((out, i) => {
  const name = `js/app.${i + 1}.js`;
  wr(name, `/* VitaTakip — derlenmiş paket ${i + 1}/${chunkOut.length} (${groups[i].length} dosya). Elle düzenlemeyin; kaynak: js/, derleme: node tools/build.mjs */\n` + out);
  return `./${name}?v=${hash}`;
});

/* index.html: işaretler arasını güncelle */
let html = rd('index.html');
const swap = (name, tag) => {
  const re = new RegExp(`<!-- build:${name} -->[\\s\\S]*?<!-- /build:${name} -->`);
  if (!re.test(html)) throw new Error(`index.html içinde <!-- build:${name} --> işareti yok`);
  html = html.replace(re, `<!-- build:${name} -->\n${tag}\n<!-- /build:${name} -->`);
};
swap('css', [`<link rel="stylesheet" href="./css/app.css?v=${hash}">`, ...jsFiles.map(u => `<script defer src="${u}"></script>`)].join('\n'));
swap('js', '<!-- Betikler <head> içinde defer ile yüklenir (yukarıdaki build:css bloğu). -->');
wr('index.html', html);

/* service-worker.js: önbellek sürümü ve çevrimdışı dosya listesi */
/* Çevrimdışı tam çalışma: kodda (index.html, kaynak JS, manifest) geçen TÜM yerel dosyalar önbelleğe alınır —
   ihtiyaç anında yüklenen PDF okuyucu, grafik, barkod kütüphaneleri ve belirti görselleri dahil. */
const icons = fs.readdirSync(path.join(root, 'icons')).map(f => `./icons/${f}`);
const fonts = fs.readdirSync(path.join(root, 'vendor/fontawesome/webfonts')).map(f => `./vendor/fontawesome/webfonts/${f}`);
const referenced = new Set();
for (const f of ['index.html', 'manifest.json', ...JS]) {
  // data/*.json: takviye ve ilaç katalogları da çevrimdışı önbelleğe alınır.
  for (const m of rd(f).matchAll(/["'`(]\.?\/?((?:vendor|img|icons|data)\/[A-Za-z0-9_./-]+\.(?:js|json|png|jpe?g|webp|svg|woff2))["'`)]/g)) referenced.add(`./${m[1]}`);
}
const core = [...new Set(['./', './index.html', './manifest.json', `./css/app.css?v=${hash}`, ...jsFiles, ...icons, ...fonts, ...[...referenced].sort()])];
const missing = core.filter(u => u !== './' && !fs.existsSync(path.join(root, u.replace(/^\.\//, '').replace(/\?.*$/, ''))));
if (missing.length) { console.error('ÖNBELLEK LİSTESİNDE OLUP DİSKTE OLMAYAN DOSYA:', missing.join(', ')); process.exit(1); }
let sw = rd('service-worker.js');
sw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = 'vitatakip-${hash}';`)
       .replace(/const CORE_FILES = \[[\s\S]*?\];/, `const CORE_FILES = ${JSON.stringify(core, null, 2)};`);
wr('service-worker.js', sw);

const kb = s => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`Derlendi (${hash}): css/app.css ${kb(cssOut)} (${CSS.length} dosya); JS ${JS.length} dosya → ${chunkOut.map((c, i) => `app.${i + 1}.js ${kb(c)}`).join(', ')}; önbellek ${core.length} dosya`);
