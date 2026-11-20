/* Synthetic e-Nabız-style lab PDFs for parser + clinical-rule tests (fake patient, no real data).
   Layout mirrors real e-Nabız exports: Tarih | Tahlil | Sonuç | Sonuç Birimi | Referans Değeri, multi-page,
   urine and blood-gas sections, and the distractor rows that real reports contain (RDW-SD, MPV, NRBC,
   urine glucose/erythrocyte, spot-urine creatinine, IFCC HbA1c, tHb, Ca++).
   Regenerate:  node tests/fixtures/make-enabiz-fixtures.mjs   (needs the local server on :8080 not required) */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* Each row: [name, result, unit, reference]. A row of [title] starts a section with a timestamp. */
export const FIXTURES = {
  'ornek-enabiz-A.pdf': {
    date: '02.10.2026',
    rows: [
      ['02.10.2026 08:40', 'Tam Kan (Hemogram)'],
      ['HCT', '37.2', '%', '43.2 - 54.5'],
      ['HGB', '12.1', 'g/dL', '13.2 - 16.6'],
      ['MCH', '34.9', 'pg', '26.5 - 31.4'],
      ['MCHC', '33.0', 'g/dL', '31.9 - 34.8'],
      ['MCV', '104.2', 'fL', '80.0 - 93.6'],
      ['MPV', '10.4', 'fL', '9.7 - 11.9'],
      ['NRBC#', '0.00', '10^9/L', '0 - 0.014'],
      ['PDW', '11.0', 'fL', '9 - 12.4'],
      ['PLT', '182', '10*9/L', '151 - 400'],
      ['RBC', '3.55', '10 *12/L', '4.18 - 5.48'],
      ['RDW-CV', '15.9', '%', '11.7 - 14.4'],
      ['RDW-SD', '58.1', 'fL', '35 - 56'],
      ['WBC', '5.10', '10^9/L', '3.91 - 8.77'],
      ['02.10.2026 09:10', 'İdrar tetkiki'],
      ['Eritrosit', '<1', '/hpf', '0 - 3'],
      ['Glukoz', 'Neg', '', ''],
      ['Lökosit', '2', '/hpf', '0 - 4'],
      ['Albumin/Kreat.(Spot idrar)', '12', 'mg/g Kreatinin', '0 - 30'],
      ['Kreatinin (Spot İdrar)', '160', 'mg/dl', '24 - 392'],
      ['02.10.2026 10:05', 'Biyokimya'],
      ['25-Hidroksi Vitamin D', '14.2', 'ng/mL', '30 - 100'],
      ['Alanin aminotransferaz (ALT)', '62', 'U/L', '8 - 41'],
      ['CRP,türbidimetrik', '12.4', 'mg/L', '0 - 5'],
      ['Ferritin', '19', 'µg/L', '30 - 400'],
      ['Folat', '2.6', 'ug/L', '3.89 - 26.8'],
      ['Glukoz', '96', 'mg/dL', '74 - 106'],
      ['HbA1c (IFCC)', '43', 'mmol/mol', '20 - 42'],
      ['HbA1c', '6.1', '%', '4.5 - 6'],
      ['Homosistein', '21.5', 'µmol/L', '5 - 15'],
      ['Kalsiyum (Ca)', '8.9', 'mg/dL', '8.6 - 10.2'],
      ['Kreatinin', '0.92', 'mg/dL', '0.7 - 1.2'],
      ['Magnezyum', '1.52', 'mg/dL', '1.7 - 2.2'],
      ['Serbest T4', '0.81', 'ng/dL', '0.72 - 1.89'],
      ['TSH', '7.85', 'mlU/mL', '0.3 - 5.4'],
      ['Vitamin B12', '168', 'ng/L', '197 - 771'],
      ['Çinko', '58', 'µg/dL', '70 - 120'],
      ['02.10.2026 10:30', 'Kan gazları'],
      ['Ca++', '1.18', 'mmol/L', '1.15 - 1.29'],
      ['Glu', '101', 'mg/dL', '70 - 110'],
      ['tHb', '7.5', 'mmol/L', '7.4 - 10.9']
    ],
    expect: { hb: 12.1, hct: 37.2, mcv: 104.2, plt: 182, rbc: 3.55, rdw: 15.9, wbc: 5.1, d3: 14.2, alt: 62, crp: 12.4, ferritin: 19, folate: 2.6, glucose: 96, hba1c: 6.1, hcy: 21.5, ca: 8.9, creatinine: 0.92, mg: 1.52, tsh: 7.85, b12: 168, zinc: 58 }
  },
  'ornek-enabiz-B.pdf': {
    date: '25.09.2026',
    rows: [
      ['25.09.2026 08:15', 'Tam Kan (Hemogram)'],
      ['HCT', '53.6', '%', '43.2 - 54.5'],
      ['HGB', '17.9', 'g/dL', '13.2 - 16.6'],
      ['MCV', '86.0', 'fL', '80.0 - 93.6'],
      ['MPV', '8.1', '', '9.7 - 11.9'],
      ['PLT', '412', '10^3/uL', '151 - 400'],
      ['RBC', '6.12', '10^9/L', '4.18 - 5.48'],
      ['RDW-CV', '15.6', '%', '11.7 - 14.4'],
      ['RDW-SD', '44.0', '', ''],
      ['WBC', '12.40', '10^9/L', '3.91 - 8.77'],
      ['25.09.2026 09:00', 'Biyokimya'],
      ['25-Hidroksi Vitamin D', '17.5', 'ng/mL', '30 - 100'],
      ['CRP,türbidimetrik', '2.1', 'mg/L', '0 - 5'],
      ['Ferritin', '24', 'µg/L', '30 - 400'],
      ['Glukoz', '131', 'mg/dL', '74 - 106'],
      ['Magnezyum', '2.05', 'mg/dL', '1.7 - 2.2'],
      ['TSH', '0.21', 'mIU/L', '0.38 - 5.33'],
      ['Vitamin B12', '512', 'ng/L', '197 - 771']
    ],
    expect: { hct: 53.6, hb: 17.9, mcv: 86, plt: 412, rbc: 6.12, rdw: 15.6, wbc: 12.4, d3: 17.5, crp: 2.1, ferritin: 24, glucose: 131, mg: 2.05, tsh: 0.21, b12: 512 }
  },
  /* Missing metadata: rows without unit and/or lab range, as real e-Nabız exports sometimes print them */
  'ornek-enabiz-C.pdf': {
    date: '10.11.2026',
    rows: [
      ['10.11.2026 08:30', 'Tam Kan (Hemogram)'],
      ['HGB', '15.1', 'g/dL', '13.2 - 16.6'],
      ['RBC', '6.30', '10^9/L', '4.18 - 5.48'],
      ['RDW-SD', '36.9', '', ''],
      ['10.11.2026 09:15', 'Biyokimya'],
      ['25-Hidroksi Vitamin D', '24.8', '', ''],
      ['Ferritin', '71', 'µg/L', ''],
      /* real 19.08.2025 layout: range on the next line, followed by decision-limit commentary */
      ['Glukoz (Açlık Kan Şekeri)', '91', 'mg/dL', ''],
      ['74 - 106 * Karar Sınırları : <70 mg/dL Hipoglisemi 100-125 mg/dL Bozulmuş açlık glukozu >125 mg/dL Diyabet'],
      ['TSH', '2.93', '', ''],
      ['Vitamin B12', '350', 'ng/L', '197 - 771']
    ],
    expect: { hb: 15.1, rbc: 6.3, d3: 24.8, ferritin: 71, glucose: 91, tsh: 2.93, b12: 350 },
    /* which metadata the report actually printed */
    metadata: { hb: { unit: true, ref: true }, rbc: { unit: true, ref: true }, glucose: { unit: true, ref: true }, ferritin: { unit: true, ref: false }, d3: { unit: false, ref: false }, tsh: { unit: false, ref: false }, b12: { unit: true, ref: true } }
  }
};

function html(fx) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const body = fx.rows.map(r => r.length === 1
    ? `<tr class="note"><td colspan="5" style="font-size:10.5px">${esc(r[0])}</td></tr>`
    : r.length === 2
    ? `<tr class="sec"><td>${esc(r[0].split(' ')[0])}<br>${esc(r[0].split(' ')[1])}</td><td colspan="4">${esc(r[1])}</td></tr>`
    : `<tr><td class="ok">✓</td><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;margin:28px;color:#111}
    h1{font-size:18px;text-align:center;margin:0 0 4px} .sub{text-align:center;font-size:12px;color:#555;margin-bottom:16px}
    .meta{font-size:13px;margin-bottom:12px;display:grid;grid-template-columns:1fr auto;gap:2px}
    table{width:100%;border-collapse:separate;border-spacing:0 4px;font-size:12.5px}
    th{background:#5b78b0;color:#fff;text-align:left;padding:8px} td{background:#f1f2f2;padding:6px 8px}
    tr.sec td{background:#e3e7f0} td.ok{text-align:center;color:#2a9d8f;width:70px}
  </style></head><body>
    <h1>TEST LABORATUVARI</h1><div class="sub">e-Nabız biçiminde sentetik test raporu — gerçek hasta verisi değildir</div>
    <div class="meta"><span>Adı/Soyadı: TEST HASTA</span><span>Cinsiyet: Erkek</span><span>Tarih: ${fx.date}</span><span>Doğum Tarihi: 01.01.1990</span></div>
    <table><thead><tr><th>Tarih</th><th>Tahlil</th><th>Sonuç</th><th>Sonuç Birimi</th><th>Referans Değeri</th></tr></thead><tbody>${body}</tbody></table>
  </body></html>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const p = await b.newPage();
  for (const [name, fx] of Object.entries(FIXTURES)) {
    await p.setContent(html(fx), { waitUntil: 'load' });
    await p.pdf({ path: path.join(here, name), format: 'A4', printBackground: true });
    console.log('yazıldı', name);
  }
  await b.close();
}
