/* Kullanım rehberi: "Nasıl Kullanılır?" penceresi ile adım adım tur aynı listeden mi besleniyor,
   tur her adımda görünür bir hedefi mi vurguluyor (telefon ve masaüstü), ilerleme gerçek verilerle mi işaretleniyor? */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

// Yeni hesap: profil penceresi açık; kapanınca karşılama kartı gelmeli.
await p.evaluate(() => closeProfileModal());
await sleep(900);
const intro = await p.evaluate(() => ({
  visible: !document.getElementById('vitaSpotlightLayer').classList.contains('hidden'),
  centered: document.getElementById('vitaSpotlightLayer').classList.contains('is-centered'),
  title: document.getElementById('vitaTourTitle').textContent,
  next: document.getElementById('vitaTourNext').textContent.trim(),
  prev: document.getElementById('vitaTourPrevious').textContent.trim()
}));
log('İlk girişte karşılama kartı açılır (tur zorla başlamaz)', intro.visible && intro.centered && /tur/i.test(intro.title) && /Turu başlat/.test(intro.next) && /Şimdi değil/.test(intro.prev), JSON.stringify(intro));

const walk = async label => {
  const steps = await p.evaluate(() => VITA_GUIDE_STEPS.length);
  const bad = [];
  for (let i = 0; i < steps; i++) {
    await sleep(800);
    const r = await p.evaluate(i => {
      const hole = document.getElementById('vitaSpotlightHole').getBoundingClientRect();
      const tip = document.getElementById('vitaTourTooltip').getBoundingClientRect();
      const target = findVitaGuideTarget(VITA_GUIDE_STEPS[i]);
      const t = target ? target.getBoundingClientRect() : null;
      const covers = t && hole.left <= t.left + 1 && hole.top <= t.top + 1 && hole.right >= Math.min(t.right, innerWidth) - 1 && hole.bottom >= Math.min(t.bottom, innerHeight) - 1;
      const overlap = t && !(tip.bottom <= t.top || tip.top >= t.bottom || tip.right <= t.left || tip.left >= t.right);
      return {
        i, view: state.activeTab, want: VITA_GUIDE_STEPS[i].view, count: document.getElementById('vitaTourCount').textContent,
        title: document.getElementById('vitaTourTitle').textContent, target: Boolean(target), covers: Boolean(covers),
        tipInside: tip.left >= 0 && tip.top >= 0 && tip.right <= innerWidth && tip.bottom <= innerHeight, overlap: Boolean(overlap),
        dots: document.querySelectorAll('#vitaTourDots span').length, active: document.querySelectorAll('#vitaTourDots span.is-active').length
      };
    }, i);
    const ok = r.view === r.want && r.count === `${i + 1} / ${steps}` && r.title.startsWith(`${i + 1}. `) && r.target && r.covers && r.tipInside && !r.overlap && r.dots === steps && r.active === 1;
    if (!ok) bad.push(JSON.stringify(r));
    await p.evaluate(() => moveVitaSpotlightTour(1));
  }
  await sleep(500);
  const closed = await p.evaluate(() => document.getElementById('vitaSpotlightLayer').classList.contains('hidden'));
  log(`${label}: ${steps} adımın hepsinde hedef vurgulanır, kart ekranda ve hedefi örtmez`, bad.length === 0 && closed, bad.join(' | '));
};

await p.evaluate(() => moveVitaSpotlightTour(1)); // Turu başlat
await walk('Telefon (400px)');
const back = await p.evaluate(() => state.activeTab);
log('Tur bitince kullanıcı başladığı ekrana döner', back === 'view-home', back);
const seen = await p.evaluate(() => localStorage.getItem(`vitatakip_spotlight_seen_${activeUserId}`));
log('Tur görüldü olarak işaretlenir', seen === 'true');

// Tur kendi gösterdiği ekranları "tamamlandı" saymaz.
const afterTour = await p.evaluate(() => getVitaGuideStatus().done);
log('Turun gezdirdiği ekranlar ilerlemeye sayılmaz', afterTour[3] === false && afterTour[5] === false, JSON.stringify(afterTour));

await p.setViewport({ width: 1280, height: 800 });
await sleep(400);
await p.evaluate(() => startVitaSpotlightTour(true));
await walk('Masaüstü (1280px)');

// Tur sırasında klavye: → ileri, ← geri, Esc kapatır.
await p.evaluate(() => startVitaSpotlightTour(true));
await sleep(500);
await p.keyboard.press('ArrowRight'); await sleep(400);
const k1 = await p.evaluate(() => document.getElementById('vitaTourCount').textContent);
await p.keyboard.press('ArrowLeft'); await sleep(400);
const k2 = await p.evaluate(() => document.getElementById('vitaTourCount').textContent);
await p.keyboard.press('Escape'); await sleep(400);
const k3 = await p.evaluate(() => document.getElementById('vitaSpotlightLayer').classList.contains('hidden'));
log('Klavye: ← → adım değiştirir, Esc kapatır', k1 === '2 / 6' && k2 === '1 / 6' && k3, `${k1} ${k2} ${k3}`);

// Rehber penceresi: aynı adımlar, aynı başlıklar.
await p.evaluate(() => openOnboardingModal());
await sleep(300);
const modal = await p.evaluate(() => ({
  items: Array.from(document.querySelectorAll('#vitaGuideSteps strong')).map(e => e.childNodes[0].textContent),
  steps: VITA_GUIDE_STEPS.map(s => s.title),
  total: document.getElementById('vitaGuideStepTotal').textContent,
  label: document.getElementById('vitaGuideProgressLabel').textContent
}));
log('Pencere ve tur aynı adımları aynı sırayla gösterir', JSON.stringify(modal.items) === JSON.stringify(modal.steps) && modal.total === String(modal.steps.length), JSON.stringify(modal.items));
log('İlerleme başlangıçta 0', /^0 \/ 6/.test(modal.label), modal.label);

// Gerçek işlemler ilerlemeyi işaretler.
await p.evaluate(() => { closeOnboardingModal(); });
await p.evaluate(() => {
  state.user = { ...state.user, age: 41, height: 175, weight: 80, profileCompleted: true };
  const lab = document.getElementById('inputLabD3'); lab.value = '30';
  lab.dispatchEvent(new Event('input', { bubbles: true })); lab.dispatchEvent(new Event('change', { bubbles: true }));
  const box = document.querySelector('#view-neyim input[type=checkbox][data-symptom], #view-neyim [data-symptom-key]');
  state.selectedSymptoms.add(box ? (box.dataset.symptom || box.dataset.symptomKey) : 'yorgunluk');
  navigateToView('view-clinical-results');
  navigateToView('view-report');
  navigateToView('view-home');
  openOnboardingModal();
});
await sleep(300);
const prog = await p.evaluate(() => ({
  label: document.getElementById('vitaGuideProgressLabel').textContent,
  done: Array.from(document.querySelectorAll('#vitaGuideSteps li')).map(li => li.classList.contains('is-done')),
  next: Array.from(document.querySelectorAll('#vitaGuideSteps li')).findIndex(li => li.classList.contains('is-next')),
  start: document.getElementById('vitaGuideStartLabel').textContent,
  bar: document.getElementById('vitaGuideProgressBar').style.width
}));
log('Profil, tahlil, belirti ve ziyaret edilen ekranlar tamamlandı olarak işaretlenir', JSON.stringify(prog.done) === '[true,true,true,true,false,true]' && /^5 \/ 6/.test(prog.label) && prog.bar === '83%', JSON.stringify(prog));
log('Sıradaki adım vurgulanır ve tur oradan sürdürülebilir', prog.next === 4 && /5\. adımdan/.test(prog.start), prog.start);

await p.evaluate(() => document.getElementById('vitaGuideStartTour').click());
await sleep(700);
const resumed = await p.evaluate(() => ({ count: document.getElementById('vitaTourCount').textContent, status: document.getElementById('vitaTourStatus').textContent }));
log('"Sürdür" turu doğru adımdan açar ve durumunu gösterir', resumed.count === '5 / 6' && /Henüz/.test(resumed.status), JSON.stringify(resumed));
await p.evaluate(() => runVitaTourStepAction());
await sleep(400);
const act = await p.evaluate(() => ({ hidden: document.getElementById('vitaSpotlightLayer').classList.contains('hidden'), view: state.activeTab }));
log('Kart üzerindeki eylem düğmesi turu kapatıp o bölüme götürür', act.hidden && act.view === 'view-home', JSON.stringify(act));

// Pencerede bir adıma tıklamak o ekrana götürür.
await p.evaluate(() => { openOnboardingModal(); document.querySelector('#vitaGuideSteps [data-guide-step="1"]').click(); });
await sleep(400);
const jump = await p.evaluate(() => ({ view: state.activeTab, modalHidden: document.getElementById('onboardingModal').classList.contains('hidden') }));
log('Penceredeki adım düğmesi ilgili ekranı açar', jump.view === 'view-labs' && jump.modalHidden, JSON.stringify(jump));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama testleri (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
