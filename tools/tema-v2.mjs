/* VitaTakip V2 görsel katmanı üreticisi → css/tema-v2.css
   Palet DEĞİŞMEZ (turkuaz #0d9488/#14b8a6, lacivert #0f172a, çivit #4f46e5); yalnızca derinlik, kontrast,
   gölge, odak halkası ve boş durum çizimleri eklenir. Belirteçler Figma "VitaTakip — Tasarım Sistemi V2"
   dosyasındaki değişkenlerle birebir aynıdır. Çalıştırma: node tools/tema-v2.mjs && node tools/build.mjs */
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

/* Boş durum çizimleri (yerel, ağ isteği yok). Kaynak: design/bos-durum/*.svg */
const svgDir = path.join(root, 'design/bos-durum');
const svg = name => {
  const s = fs.readFileSync(path.join(svgDir, name + '.svg'), 'utf8').replace(/\s*\n\s*/g, '').replace(/"/g, "'");
  return `url("data:image/svg+xml,${s.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
};

const css = `/* VitaTakip V2 — görsel katman (üretildi: node tools/tema-v2.mjs). Elle düzenlemeyin. */
:root{
  color-scheme: light;
  /* Renk (mevcut palet) */
  --vt-teal-50:#f0fdfa;--vt-teal-100:#ccfbf1;--vt-teal-200:#99f6e4;--vt-teal-300:#5eead4;--vt-teal-400:#2dd4bf;
  --vt-teal-500:#14b8a6;--vt-teal-600:#0d9488;--vt-teal-700:#0f766e;--vt-teal-800:#115e59;
  --vt-navy-950:#020617;--vt-navy-900:#0f172a;--vt-navy-800:#1e293b;
  --vt-indigo-500:#6366f1;--vt-indigo-600:#4f46e5;
  --vt-slate-50:#f8fafc;--vt-slate-100:#f1f5f9;--vt-slate-200:#e2e8f0;--vt-slate-300:#cbd5e1;--vt-slate-500:#64748b;--vt-slate-600:#475569;
  /* Anlamsal */
  --vt-bg:#f3f6f9;--vt-surface:#ffffff;--vt-surface-tint:var(--vt-teal-50);
  --vt-border:rgba(148,163,184,.32);--vt-border-strong:var(--vt-slate-300);
  --vt-text:var(--vt-navy-900);--vt-text-muted:var(--vt-slate-600);
  --vt-primary:var(--vt-teal-600);--vt-primary-strong:var(--vt-teal-700);--vt-accent:var(--vt-indigo-600);
  --vt-focus:rgba(20,184,166,.55);
  /* Gradyanlar */
  --vt-grad-primary:linear-gradient(135deg,#14b8a6 0%,#0d9488 52%,#0f766e 100%);
  --vt-grad-primary-hover:linear-gradient(135deg,#2dd4bf 0%,#0d9488 48%,#115e59 100%);
  --vt-grad-surface:linear-gradient(180deg,#ffffff 0%,#fbfdfd 100%);
  /* Gölgeler: lacivert tonlu katmanlı + turkuaz ışıma */
  --vt-shadow-1:0 1px 2px rgba(15,23,42,.06),0 1px 1px rgba(15,23,42,.03);
  --vt-shadow-2:0 1px 2px rgba(15,23,42,.05),0 4px 12px -2px rgba(15,23,42,.07),0 14px 28px -14px rgba(13,148,136,.18);
  --vt-shadow-3:0 2px 4px rgba(15,23,42,.06),0 12px 28px -6px rgba(15,23,42,.14),0 24px 48px -18px rgba(13,148,136,.26);
  --vt-shadow-primary:inset 0 1px 0 rgba(255,255,255,.22),0 6px 16px -6px rgba(13,148,136,.65),0 2px 4px rgba(15,118,110,.18);
  /* 8 pt ızgara ve köşe yarıçapları */
  --vt-space-1:4px;--vt-space-2:8px;--vt-space-3:12px;--vt-space-4:16px;--vt-space-5:24px;--vt-space-6:32px;--vt-space-7:48px;
  --vt-radius-sm:8px;--vt-radius-md:12px;--vt-radius-lg:16px;--vt-radius-xl:20px;--vt-radius-full:999px;
}

/* Zemin: düz gri yerine çok hafif turkuaz/çivit ışımalı katman (kartlar öne çıkar) */
body.bg-slate-50{
  background-color:var(--vt-bg);
  background-image:radial-gradient(900px 420px at 100% -10%,rgba(20,184,166,.10),transparent 60%),
                   radial-gradient(700px 380px at -10% 30%,rgba(99,102,241,.06),transparent 60%);
  background-attachment:fixed;
}
body > header{box-shadow:0 1px 0 rgba(45,212,191,.22),0 10px 28px -14px rgba(2,6,23,.75)!important}

/* Kart hiyerarşisi: 1. düzey kart = gölge-2, iç içe kart = gölge-1 */
main .bg-white.rounded-2xl:not(.shadow-2xl):not(.shadow-xl):not(.shadow-lg),
main .bg-white.rounded-3xl:not(.shadow-2xl):not(.shadow-xl),
main .vsd,main .vsp-card,main .vsp-page .vsa-find{
  box-shadow:var(--vt-shadow-2);border-color:var(--vt-border);
}
main .bg-white .bg-white.rounded-2xl,main .bg-white .bg-white.rounded-xl,main .vsd .vsp-card{box-shadow:var(--vt-shadow-1)}
@media (hover:hover){
  main .vsp-card:hover,main .anamnesis-card:hover{box-shadow:var(--vt-shadow-3);transform:translateY(-1px)}
}

/* Birincil düğmeler: canlı turkuaz gradyan + renkli gölge */
button.bg-teal-600,button.bg-medTeal-600,button.bg-gradient-to-r.from-teal-600,.vcard-add,.vsa-btn-main,.vsa-submit{
  background-image:var(--vt-grad-primary)!important;box-shadow:var(--vt-shadow-primary);border-color:transparent!important;
}
button.bg-teal-600:hover,button.bg-medTeal-600:hover,button.bg-gradient-to-r.from-teal-600:hover,.vcard-add:hover,.vsa-btn-main:hover,.vsa-submit:hover{
  background-image:var(--vt-grad-primary-hover)!important;
}
button.bg-teal-600:active,button.bg-medTeal-600:active,.vcard-add:active,.vsa-btn-main:active{transform:translateY(1px);box-shadow:inset 0 2px 4px rgba(2,6,23,.18)}

/* Klavye odak halkası (WCAG 2.4.7) — fareyle tıklamada görünmez */
button:focus-visible,a:focus-visible,[role="button"]:focus-visible,[role="tab"]:focus-visible,summary:focus-visible,label:focus-visible{
  outline:3px solid var(--vt-focus)!important;outline-offset:2px;
}
main input:not([type=checkbox]):not([type=radio]):not([type=range]):focus,main select:focus,main textarea:focus{
  border-color:var(--vt-teal-500)!important;box-shadow:0 0 0 4px rgba(20,184,166,.16)!important;outline:none;
}

/* Kontrast: beyaz/açık zeminde küçük yardımcı metin slate-400 (2,6:1) → slate-500 (4,8:1) */
main .bg-white .text-slate-400,main .bg-slate-50 .text-slate-400,main .vsp-card .text-slate-400{color:var(--vt-slate-500)}

/* Alt gezinme: etkin sekmede gradyan hap + üst gösterge + yumuşak ışıma */
@media (max-width:767px){
  .vita-mobile-nav{background:rgba(255,255,255,.9)!important;box-shadow:0 -1px 0 rgba(148,163,184,.25),0 -12px 32px -12px rgba(15,23,42,.18)!important}
  .vita-mobile-nav button{position:relative}
  .vita-mobile-nav button[aria-current="page"]{
    color:var(--vt-teal-700);background:linear-gradient(180deg,#f0fdfa 0%,#ccfbf1 100%);
    box-shadow:inset 0 0 0 1px var(--vt-teal-200),0 6px 14px -8px rgba(13,148,136,.7);
  }
  .vita-mobile-nav button[aria-current="page"]::before{
    content:"";position:absolute;top:3px;left:50%;width:22px;height:3px;margin-left:-11px;border-radius:3px;background:var(--vt-grad-primary);
  }
}

/* Grafikler: yumuşak yüzey + ince ızgara tonu */
.lt-row{background:var(--vt-grad-surface);box-shadow:var(--vt-shadow-1);border-color:var(--vt-border)}
.lt-row[open]{box-shadow:var(--vt-shadow-2);border-color:var(--vt-teal-200)}
.lt-chartwrap{border-radius:var(--vt-radius-md)}
.lt-val small{color:var(--vt-slate-500)}
.recharts-cartesian-grid line{stroke:#e2e8f0}
.recharts-tooltip-wrapper .recharts-default-tooltip{border-radius:12px!important;border-color:var(--vt-border)!important;box-shadow:var(--vt-shadow-3)}

/* Boş durumlar: çizim + açıklama (ikon tekrarını gizler) */
.vt-empty,.vtm-empty,.lt-empty{
  background-color:var(--vt-surface-tint)!important;border:1px dashed var(--vt-teal-200)!important;border-radius:var(--vt-radius-lg)!important;
  color:var(--vt-text-muted)!important;
}
.vt-empty,.vtm-empty{display:flex;flex-direction:column;align-items:center;gap:var(--vt-space-2);padding:var(--vt-space-4)!important;text-align:center}
.vt-empty::before,.vtm-empty::before,.lt-empty::before{
  content:"";flex:0 0 auto;width:96px;height:70px;background:center/contain no-repeat;
}
.vt-empty > i,.vtm-empty > i,.lt-empty > i{display:none!important}
.vt-empty--sup::before{background-image:${svg('takviye')}}
.vtm-empty::before{background-image:${svg('ilac')}}
.lt-empty::before{background-image:${svg('tahlil')};width:84px;height:62px}
.vtm-empty{border-color:#c7d2fe!important;background-color:#f5f7ff!important}

/* Taşma düzeltmesi: 320 px'te tarih satırındaki "Aralıkları Özelleştir" alt satıra geçer */
#view-labs div:has(> .vita-range-settings-trigger){flex-wrap:wrap;row-gap:var(--vt-space-2)}

/* ---- V3: kaynak (i) düğmesi ve sade kaynak penceresi ---- */
.vkb-card{position:relative}
.vkb-card > label{padding-right:26px}
.vkb-card > .vkb-i{position:absolute;top:8px;right:8px}
.vkb-i{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:4px;border:0;border-radius:999px;background:transparent;color:var(--vt-teal-700);font-size:13px;line-height:1;cursor:pointer;vertical-align:middle;flex:0 0 auto}
.vkb-i:hover{background:var(--vt-teal-50)}
.vkb-link{border:0;background:none;padding:0;color:var(--vt-teal-700);font-weight:700;text-decoration:underline;cursor:pointer;font-size:inherit}
.vkb-overlay{position:fixed;inset:0;z-index:9990;display:flex;align-items:flex-end;justify-content:center;padding:12px;background:rgba(2,6,23,.55);backdrop-filter:blur(3px)}
.vkb-overlay.hidden{display:none}
@media (min-width:640px){.vkb-overlay{align-items:center}}
.vkb-panel{width:min(100%,560px);max-height:86dvh;display:flex;flex-direction:column;background:var(--vt-surface);color:var(--vt-text);border-radius:var(--vt-radius-xl);box-shadow:var(--vt-shadow-3);overflow:hidden}
.vkb-head{display:flex;align-items:center;justify-content:space-between;gap:var(--vt-space-3);padding:var(--vt-space-4) var(--vt-space-4) var(--vt-space-2)}
.vkb-head h2{font-size:15px;font-weight:900;margin:0}
.vkb-x{width:36px;height:36px;border:0;border-radius:999px;background:var(--vt-slate-100);color:var(--vt-slate-600);cursor:pointer}
.vkb-body{padding:0 var(--vt-space-4) var(--vt-space-3);overflow:auto;font-size:12.5px;line-height:1.5}
.vkb-ref{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:12px;background:var(--vt-surface-tint);margin:0 0 8px}
.vkb-ref span{color:var(--vt-text-muted);font-weight:700}
.vkb-sum{color:var(--vt-text-muted);margin:0 0 10px}
.vkb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vkb-src{padding:10px 12px;border:1px solid var(--vt-border);border-radius:12px}
.vkb-src b{display:block;font-size:12px;line-height:1.4}
.vkb-src p{margin:4px 0;color:var(--vt-text-muted)}
.vkb-src a{color:var(--vt-teal-700);font-weight:700;text-decoration:none}
.vkb-badge{display:inline-block;margin-bottom:4px;padding:1px 8px;border-radius:999px;font-size:10px;font-weight:800}
.vkb-ok{background:#ccfbf1;color:#115e59}.vkb-mid{background:#e0e7ff;color:#3730a3}.vkb-no{background:#ffe4e6;color:#9f1239}
.vkb-foot{margin:0;padding:10px var(--vt-space-4) max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--vt-border);font-size:11px;color:var(--vt-text-muted)}

/* ---- V3: kontrol ölçümü hatırlatması ---- */
.vrc-text,.vrc-note{font-size:12.5px;line-height:1.5;color:var(--vt-text-muted);margin:6px 0}
.vrc-note{font-size:11px}
.vrc-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}
.vrc-row label{font-size:12px;font-weight:800}
.vrc-row select{min-height:40px;border:1px solid var(--vt-border-strong);border-radius:12px;padding:0 10px;font-size:12.5px;background:var(--vt-surface);color:var(--vt-text);max-width:100%}
.vrc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.vrc-btn{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:12px;border:1px solid var(--vt-teal-200);background:var(--vt-surface-tint);color:var(--vt-teal-800);font-size:12.5px;font-weight:800;cursor:pointer}
.vrc-btn.vrc-main{border-color:transparent;color:#fff;background-image:var(--vt-grad-primary);box-shadow:var(--vt-shadow-primary)}
.vrc-home{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 12px;padding:12px 14px;border-radius:var(--vt-radius-lg);background:var(--vt-surface);border:1px solid var(--vt-teal-200);box-shadow:var(--vt-shadow-2)}
.vrc-home > i{color:var(--vt-teal-600);font-size:20px}
.vrc-home > div{flex:1 1 160px;min-width:0}
.vrc-home b{display:block;font-size:13px}
.vrc-home span{font-size:12px;color:var(--vt-text-muted)}

/* ---- V3: paylaşım kartı penceresi ---- */
.vpk-panel{width:min(100%,720px)}
.vpk-grid{display:grid;grid-template-columns:1fr;gap:12px}
@media (min-width:640px){.vpk-grid{grid-template-columns:1fr 270px}}
.vpk-h{font-size:12px;font-weight:800;margin:0 0 6px}
.vpk-params{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.vpk-opt{display:flex;align-items:center;gap:8px;min-height:36px;font-size:12.5px}
.vpk-opt input{width:18px;height:18px;accent-color:var(--vt-teal-600)}
.vpk-opt small{color:var(--vt-text-muted)}
.vpk-prev img{display:block;width:100%;max-width:270px;height:auto;margin:0 auto;border-radius:14px;box-shadow:var(--vt-shadow-2)}
.vpk-actions{display:flex;flex-wrap:wrap;gap:8px;padding:12px var(--vt-space-4) max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--vt-border)}

/* ---- V3: tema seçici ---- */
.vt-seg{display:inline-flex;padding:4px;gap:4px;border-radius:14px;background:var(--vt-slate-100)}
.vt-seg button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--vt-slate-600);font-size:12px;font-weight:800;cursor:pointer}
.vt-seg button[aria-pressed="true"]{background:var(--vt-surface);color:var(--vt-teal-700);box-shadow:var(--vt-shadow-1)}

@media (prefers-reduced-motion:reduce){main .vsp-card:hover,main .anamnesis-card:hover{transform:none}}
@media print{body.bg-slate-50{background:#fff!important}.vt-empty::before,.vtm-empty::before,.lt-empty::before{display:none}}
`;

/* ===================== KOYU TEMA (yalnızca ekran) =====================
   Kaynak CSS dosyaları taranır; açık zeminler koyuya, koyu yazılar açığa, açık kenarlıklar yarı saydama eşlenir.
   Seçicilerin başına html[data-theme="dark"] eklenir. Beyaz yazı, koyu bantlar ve yarı saydam (alfa < 0,5) katmanlar
   olduğu gibi kalır. Yazdırma bağlamları (print-mode, @media print) atlanır. */
const hex2 = h => { h = h.toLowerCase(); if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return h; };
const BG = {
  '#ffffff': '#0f172a', '#f8fafc': '#111c31', '#f1f5f9': '#18233a', '#e2e8f0': '#233047', '#f3f6f9': '#020617', '#f9fafb': '#111c31', '#f3f4f6': '#18233a',
  '#f0fdfa': 'rgba(20,184,166,.10)', '#ccfbf1': 'rgba(20,184,166,.18)', '#99f6e4': 'rgba(20,184,166,.28)',
  '#fffbeb': 'rgba(245,158,11,.12)', '#fef3c7': 'rgba(245,158,11,.18)', '#fde68a': 'rgba(245,158,11,.28)', '#fff8e7': '#1c1708', '#fff3d6': '#262009',
  '#fff1f2': 'rgba(244,63,94,.12)', '#ffe4e6': 'rgba(244,63,94,.18)', '#fef2f2': 'rgba(239,68,68,.12)', '#fee2e2': 'rgba(239,68,68,.18)',
  '#eef2ff': 'rgba(99,102,241,.14)', '#e0e7ff': 'rgba(99,102,241,.20)', '#f5f7ff': 'rgba(99,102,241,.10)', '#f5f3ff': 'rgba(139,92,246,.14)', '#ede9fe': 'rgba(139,92,246,.20)',
  '#f0f9ff': 'rgba(14,165,233,.12)', '#e0f2fe': 'rgba(14,165,233,.18)', '#eff6ff': 'rgba(59,130,246,.12)', '#dbeafe': 'rgba(59,130,246,.18)',
  '#ecfdf5': 'rgba(16,185,129,.12)', '#d1fae5': 'rgba(16,185,129,.18)', '#f0fdf4': 'rgba(34,197,94,.12)', '#dcfce7': 'rgba(34,197,94,.18)',
  '#fff7ed': 'rgba(249,115,22,.12)', '#ffedd5': 'rgba(249,115,22,.18)', '#fefce8': 'rgba(234,179,8,.12)', '#fef9c3': 'rgba(234,179,8,.18)',
  '#faf5ff': 'rgba(168,85,247,.12)', '#f3e8ff': 'rgba(168,85,247,.18)', '#fdf2f8': 'rgba(236,72,153,.12)', '#fce7f3': 'rgba(236,72,153,.18)'
};
const TX = {};
[['#f1f5f9', '#0f172a #020617 #1e293b #111827 #1f2937 #030712 #0b1f3a'], ['#e2e8f0', '#334155 #374151'], ['#cbd5e1', '#475569 #4b5563'], ['#94a3b8', '#64748b #6b7280'],
 ['#5eead4', '#134e4a #115e59 #0f766e #042f2e'], ['#2dd4bf', '#0d9488'], ['#fcd34d', '#451a03 #78350f #92400e #b45309 #7c4a03'], ['#fbbf24', '#d97706'],
 ['#fda4af', '#881337 #9f1239 #be123c #e11d48 #4c0519'], ['#fca5a5', '#7f1d1d #991b1b #b91c1c #dc2626 #450a0a'], ['#a5b4fc', '#312e81 #3730a3 #4338ca #4f46e5 #1e1b4b'],
 ['#7dd3fc', '#0c4a6e #075985 #0369a1 #0284c7 #082f49'], ['#93c5fd', '#1e3a8a #1e40af #1d4ed8 #2563eb'], ['#6ee7b7', '#064e3b #065f46 #047857 #059669 #022c22'],
 ['#86efac', '#14532d #166534 #15803d #16a34a'], ['#fdba74', '#7c2d12 #9a3412 #c2410c #ea580c'], ['#c4b5fd', '#4c1d95 #5b21b6 #6d28d9 #7c3aed #581c87 #6b21a8 #7e22ce #9333ea'],
 ['#fde047', '#713f12 #854d0e #a16207 #ca8a04'], ['#f9a8d4', '#831843 #9d174d #be185d']].forEach(([to, from]) => from.split(' ').forEach(f => { TX[f] = to; }));
const BD = {};
[['rgba(148,163,184,.22)', '#e2e8f0 #f1f5f9 #e5e7eb #f3f4f6 #ffffff #f8fafc'], ['rgba(148,163,184,.32)', '#cbd5e1 #d1d5db'], ['rgba(45,212,191,.35)', '#ccfbf1 #99f6e4 #5eead4 #f0fdfa'],
 ['rgba(245,158,11,.40)', '#fde68a #fcd34d #fef3c7 #f5deb3'], ['rgba(244,63,94,.35)', '#fecdd3 #fda4af #ffe4e6'], ['rgba(129,140,248,.40)', '#c7d2fe #a5b4fc #e0e7ff'],
 ['rgba(56,189,248,.35)', '#bae6fd #7dd3fc #e0f2fe'], ['rgba(52,211,153,.35)', '#a7f3d0 #6ee7b7 #d1fae5'], ['rgba(74,222,128,.35)', '#bbf7d0 #86efac'],
 ['rgba(248,113,113,.35)', '#fecaca #fca5a5'], ['rgba(167,139,250,.35)', '#ddd6fe #e9d5ff'], ['rgba(251,146,60,.35)', '#fed7aa #fdba74'], ['rgba(250,204,21,.35)', '#fef08a #fde047']]
  .forEach(([to, from]) => from.split(' ').forEach(f => { BD[f] = to; }));

const COLOR_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+\s*(?:[,/]\s*[^)]+)?\)|\bwhite\b/g;
function toHex(c) {
  if (c === 'white') return { hex: '#ffffff', a: 1 };
  if (c[0] === '#') return { hex: hex2(c), a: 1 };
  const m = c.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([^)]+))?\)/);
  if (!m) return null;
  let a = 1; if (m[4] && !/var\(/.test(m[4])) a = parseFloat(m[4]); if (/%$/.test((m[4] || '').trim())) a = parseFloat(m[4]) / 100;
  return { hex: '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join(''), a };
}
/* Tailwind v4 renkleri CSS değişkenidir (var(--color-slate-50)); standart palet onaltılık karşılıklarıyla çözülür. */
const TW = { white: { '': '#ffffff' }, navy: { 800: '#1e293b', 900: '#0f172a', 950: '#020617' }, medTeal: { 600: '#0d9488', 700: '#0f766e' } };
const PAL = {
  slate: 'f8fafc f1f5f9 e2e8f0 cbd5e1 94a3b8 64748b 475569 334155 1e293b 0f172a 020617', teal: 'f0fdfa ccfbf1 99f6e4 5eead4 2dd4bf 14b8a6 0d9488 0f766e 115e59 134e4a 042f2e',
  amber: 'fffbeb fef3c7 fde68a fcd34d fbbf24 f59e0b d97706 b45309 92400e 78350f 451a03', emerald: 'ecfdf5 d1fae5 a7f3d0 6ee7b7 34d399 10b981 059669 047857 065f46 064e3b 022c22',
  indigo: 'eef2ff e0e7ff c7d2fe a5b4fc 818cf8 6366f1 4f46e5 4338ca 3730a3 312e81 1e1b4b', orange: 'fff7ed ffedd5 fed7aa fdba74 fb923c f97316 ea580c c2410c 9a3412 7c2d12 431407',
  purple: 'faf5ff f3e8ff e9d5ff d8b4fe c084fc a855f7 9333ea 7e22ce 6b21a8 581c87 3b0764', rose: 'fff1f2 ffe4e6 fecdd3 fda4af fb7185 f43f5e e11d48 be123c 9f1239 881337 4c0519',
  sky: 'f0f9ff e0f2fe bae6fd 7dd3fc 38bdf8 0ea5e9 0284c7 0369a1 075985 0c4a6e 082f49'
};
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
for (const [n, list] of Object.entries(PAL)) { TW[n] = {}; list.split(' ').forEach((h, i) => { TW[n][SHADES[i]] = '#' + h; }); }
const resolveVars = v => v.replace(/var\(--color-([a-zA-Z]+)(?:-(\d+))?\)/g, (m, n, s) => (TW[n] && TW[n][s || '']) || m);
function mapValue(v, table) {
  let hit = false;
  v = resolveVars(v);
  /* color-mix(..., renk N%, transparent): %50 altı yarı saydam katmandır, olduğu gibi kalır */
  if (/color-mix\(/.test(v)) {
    const pct = parseFloat((v.match(/(\d+(?:\.\d+)?)%/) || [])[1]);
    if (!(pct >= 50)) return null;
    v = v.replace(/color-mix\([^)]*?(#[0-9a-fA-F]{3,6})[^)]*\)/g, '$1');
  }
  const out = v.replace(COLOR_RE, c => { const h = toHex(c); if (!h || h.a < 0.5) return c; const t = table[h.hex]; if (!t) return c; hit = true; return t; });
  return hit ? out : null;
}
function darkDecls(body) {
  const out = [];
  body.split(';').forEach(d => {
    const i = d.indexOf(':'); if (i < 0) return;
    const prop = d.slice(0, i).trim().toLowerCase(); let val = d.slice(i + 1).trim(); if (!val || /url\(/.test(val)) return;
    const imp = /!important/.test(val); val = val.replace(/!important/, '').trim();
    let table = null;
    if (prop === 'background' || prop === 'background-color' || prop === 'background-image' || /^--tw-gradient-(from|to|stops|via)/.test(prop)) table = BG;
    else if (prop === 'color' || prop === 'fill' || prop === '-webkit-text-fill-color') table = TX;
    else if (/^border(-(top|right|bottom|left))?(-color)?$/.test(prop) || prop === 'outline-color' || prop === '--tw-ring-color' || prop === 'stroke') table = prop === 'stroke' ? TX : BD;
    if (!table) return;
    const mv = mapValue(val, table);
    if (mv) out.push(`${prop}:${mv}${imp ? '!important' : ''}`);
  });
  return out;
}
function splitTop(sel) { const parts = []; let depth = 0, cur = ''; for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; } parts.push(cur); return parts.map(s => s.trim()).filter(Boolean); }
function prefix(sel) {
  return splitTop(sel).filter(s => !/print-mode|:root|:host|@/.test(s)).map(s => {
    if (/^html\b/.test(s)) return s.replace(/^html/, 'html[data-theme="dark"]');
    return 'html[data-theme="dark"] ' + s;
  }).join(',');
}
/* İç içe (CSS nesting) seçiciyi üst seçiciyle birleştir */
function resolveSel(child, parent) {
  if (!parent) return child;
  const ps = splitTop(parent), cs = splitTop(child), out = [];
  for (const c of cs) for (const p of ps) out.push(c.includes('&') ? c.replace(/&/g, p) : `${p} ${c}`);
  return out.join(',');
}
/* Bir bloğun üst düzey bildirimlerini ve iç içe bloklarını ayır */
function splitBlock(inner) {
  const blocks = []; let decl = '', i = 0, segStart = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === '{') {
      const prelude = inner.slice(segStart, i).trim();
      let depth = 1, j = i + 1;
      while (j < inner.length && depth) { if (inner[j] === '{') depth++; else if (inner[j] === '}') depth--; j++; }
      blocks.push({ prelude, inner: inner.slice(i + 1, j - 1) });
      i = j; segStart = j; continue;
    }
    if (ch === ';') { decl += inner.slice(segStart, i + 1); segStart = i + 1; }
    i++;
  }
  decl += inner.slice(segStart).includes(':') && !inner.slice(segStart).includes('{') ? inner.slice(segStart) : '';
  return { decl, blocks };
}
function walk(css, ctx, out) {
  const { decl, blocks } = splitBlock(css);
  if (ctx.sel && decl.trim()) {
    const decls = darkDecls(decl), sel = prefix(ctx.sel);
    if (decls.length && sel) out.push({ wrap: ctx.wrap.join('|'), rule: `${sel}{${decls.join(';')}}` });
  }
  for (const b of blocks) {
    const p = b.prelude;
    if (/^@media/.test(p)) { if (!/print/.test(p)) walk(b.inner, { sel: ctx.sel, wrap: [...ctx.wrap, p] }, out); }
    else if (/^@(layer|supports)/.test(p)) walk(b.inner, ctx, out);
    else if (/^@/.test(p)) { /* keyframes, font-face, property: atla */ }
    else walk(b.inner, { sel: resolveSel(p, ctx.sel), wrap: ctx.wrap }, out);
  }
}
const SRC = ['tailwind', 'style', 'auth', 'clinical', 'report', 'compact', 'home', 'overrides', 'food-alternatives', 'tools'];
const rules = [];
for (const n of SRC) walk(fs.readFileSync(path.join(root, `css/${n}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), { sel: '', wrap: [] }, rules);
walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), { sel: '', wrap: [] }, rules);
/* JS içinden enjekte edilen stiller (yasal uyarı şeridi/çekmecesi, ilk açılış onayı): dizi içindeki CSS dizgileri birleştirilir */
for (const f of ['js/medical-drawer.js', 'js/legal-onboarding.js']) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const parts = [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(m => m[1]).filter(s => /[{}]/.test(s) && /[:;}]/.test(s) && !/<|class=/.test(s));
  walk(parts.join('\n').replace(/\/\*[\s\S]*?\*\//g, ''), { sel: '', wrap: [] }, rules);
}
const groups = new Map();
for (const r of rules) { if (!groups.has(r.wrap)) groups.set(r.wrap, []); groups.get(r.wrap).push(r.rule); }
let dark = '\n/* ===== Koyu tema (otomatik üretildi; yalnızca ekran) ===== */\n@media screen{\n';
dark += `html[data-theme="dark"]{color-scheme:dark;--vt-bg:#020617;--vt-surface:#0f172a;--vt-surface-tint:rgba(20,184,166,.10);--vt-border:rgba(148,163,184,.22);--vt-border-strong:rgba(148,163,184,.34);
  --vt-text:#f1f5f9;--vt-text-muted:#94a3b8;--vt-slate-100:#1e293b;--vt-slate-600:#cbd5e1;--vt-teal-700:#5eead4;--vt-teal-800:#99f6e4;--vt-teal-50:rgba(20,184,166,.12);--vt-teal-200:rgba(45,212,191,.35);
  --vt-shadow-1:0 1px 2px rgba(0,0,0,.4);--vt-shadow-2:0 1px 2px rgba(0,0,0,.35),0 8px 24px -8px rgba(0,0,0,.6),0 14px 28px -16px rgba(13,148,136,.25);
  --vt-shadow-3:0 2px 6px rgba(0,0,0,.45),0 18px 40px -10px rgba(0,0,0,.7),0 24px 48px -20px rgba(13,148,136,.3)}
html[data-theme="dark"] body.bg-slate-50{background-color:#020617;color:#e2e8f0;background-image:radial-gradient(900px 420px at 100% -10%,rgba(20,184,166,.14),transparent 60%),radial-gradient(700px 380px at -10% 30%,rgba(99,102,241,.10),transparent 60%)}
html[data-theme="dark"] main input:not([type=checkbox]):not([type=radio]):not([type=range]),html[data-theme="dark"] main select,html[data-theme="dark"] main textarea,
html[data-theme="dark"] .vkb-overlay input,html[data-theme="dark"] .vkb-overlay select{background-color:#0b1324;color:#e2e8f0;border-color:rgba(148,163,184,.3)}
html[data-theme="dark"] ::placeholder{color:#64748b}
html[data-theme="dark"] .vkb-ok{background:rgba(20,184,166,.18);color:#5eead4}html[data-theme="dark"] .vkb-mid{background:rgba(99,102,241,.2);color:#c7d2fe}html[data-theme="dark"] .vkb-no{background:rgba(244,63,94,.18);color:#fda4af}
html[data-theme="dark"] .vita-mobile-nav{background:rgba(15,23,42,.92)!important}
html[data-theme="dark"] .vita-mobile-nav button[aria-current="page"]{background:linear-gradient(180deg,rgba(20,184,166,.22),rgba(20,184,166,.10));color:#5eead4}
html[data-theme="dark"] img.vt-keep-light,html[data-theme="dark"] .vpk-prev img{filter:none}
html[data-theme="dark"] #vitaSimpleHost button.vs-btn:not(.vs-btn-ghost){color:#042f2e}
html[data-theme="dark"] .vds-badge{color:#042f2e!important}
`;
for (const [wrap, list] of groups) {
  const ws = wrap ? wrap.split('|') : [];
  dark += ws.map(w => `${w}{`).join('') + '\n' + list.join('\n') + '\n' + ws.map(() => '}').join('') + '\n';
}
dark += '}\n';
fs.writeFileSync(path.join(root, 'css/tema-v2.css'), css + dark);
console.log('css/tema-v2.css yazıldı:', ((css + dark).length / 1024).toFixed(1), 'KB · koyu kural:', rules.length);
