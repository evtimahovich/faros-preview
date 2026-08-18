/**
 * Сборка прайса в PDF (assets/faros-price.pdf).
 *
 * Цифры НЕ дублируются руками: скрипт читает таблицу прайса прямо из index.html,
 * поэтому файл на кнопке «Скачать прайс PDF» физически не может разойтись со страницей.
 *
 * Запуск:  node tools/price-pdf.mjs
 * Нужен playwright (chromium). Если его нет в проекте, берём из соседнего:
 *   node --experimental-default-type=module tools/price-pdf.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire('/Users/evgenia/Downloads/vyka-crm/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
const n = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);

// ---------- данные: строки прайса и группы из самой страницы
const rows = [];
for (const m of html.matchAll(/<tr [^>]*data-cls="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)) {
  const b = m[1];
  const cells = [...b.matchAll(/<td class="p[^"]*">([^<]*)<span class="pu">/g)].map((c) => n(c[1]));
  rows.push({
    idx: /<td class="idx">(\d+)/.exec(b)[1],
    model: /<td class="mdl">([^<]+)/.exec(b)[1].trim(),
    cls: /<td class="cl">[\s\S]*?<\/i>\s*([^<]+)/.exec(b)[1].trim(),
    grade: /<td class="gr">([^<]+)/.exec(b)[1].trim(),
    pack: /<td class="pk">([^<]+)/.exec(b)[1].trim(),
    retail: cells[0], small: cells[1], opt: cells[2],
  });
}
if (rows.length !== 22) throw new Error(`в index.html найдено ${rows.length} строк прайса, ожидалось 22`);

const groups = [
  { title: 'FR 4000 — складные', test: (r) => r.model.startsWith('FR 4') },
  { title: 'FR 3000 — чашеобразные', test: (r) => r.model.startsWith('FR 3') && !['FR 3220', 'FR 3230'].includes(r.model) },
  { title: 'Спец-линия с угольным слоем', test: (r) => ['FR 3220', 'FR 3230'].includes(r.model) },
];
const fmt = (v) => v.toLocaleString('ru-RU').replace(/ /g, ' ');
const min = (k) => Math.min(...rows.map((r) => r[k]));

const tiers = [
  { k: 'розница · любой объём', v: min('retail') },
  { k: 'малый опт · партия от 110 000 ₸', v: min('small') },
  { k: 'опт · партия от 1 100 000 ₸', v: min('opt'), best: true },
];

const body = groups.map((g) => {
  const rs = rows.filter(g.test);
  return `<tr class="grp"><td colspan="8">${g.title}</td></tr>` + rs.map((r) => `
    <tr>
      <td class="idx">${r.idx}</td>
      <td class="mdl">${r.model.replace(/ /g, '&nbsp;')}</td>
      <td class="mono">${r.cls}</td>
      <td class="mono">${r.grade}</td>
      <td class="mono">${r.pack.replace(/ /g, '&nbsp;')}</td>
      <td class="p">${fmt(r.retail)}&nbsp;₸</td>
      <td class="p">${fmt(r.small)}&nbsp;₸</td>
      <td class="p p--best">${fmt(r.opt)}&nbsp;₸</td>
    </tr>`).join('');
}).join('');

const doc = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,700;125,800;125,900&family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --ink:#111315; --soft:#5B6067; --mute:#767C82;
    --brand:#326450; --line:#E3E7E6; --band:#EEF2F0;
  }
  body{
    width:794px; height:1123px; padding:38px 40px 30px;
    font-family:'Manrope',sans-serif; color:var(--ink);
    -webkit-font-smoothing:antialiased; display:flex; flex-direction:column;
  }
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
  .h-l h1{font-family:'Archivo',sans-serif;font-stretch:125%;font-weight:900;font-size:27px;line-height:1.02;letter-spacing:-.01em;text-transform:uppercase}
  .h-l h1 span{color:var(--brand);display:block}
  .h-l .sub{margin-top:9px;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--mute)}
  .h-r{text-align:right;line-height:1.5}
  .h-r b{font-family:'Archivo',sans-serif;font-stretch:125%;font-weight:900;font-size:14px;letter-spacing:.02em}
  .h-r span{display:block;font-size:8.5px;color:var(--mute)}
  .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px}
  .t{border:1px solid var(--line);border-radius:8px;padding:12px 14px 13px}
  .t .k{font-family:'IBM Plex Mono',monospace;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);display:block;min-height:20px}
  .t .v{display:block;margin-top:6px;font-family:'Archivo',sans-serif;font-stretch:125%;font-weight:900;font-size:22px;letter-spacing:-.01em}
  .t .v i{font-style:normal;font-size:.55em;font-weight:800;margin-right:4px;color:var(--mute)}
  .t--best{background:var(--brand);border-color:var(--brand);color:#fff}
  .t--best .k{color:rgba(255,255,255,.72)}
  .t--best .v i{color:rgba(255,255,255,.72)}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-variant-numeric:tabular-nums}
  thead th{
    font-family:'IBM Plex Mono',monospace;font-size:7.5px;font-weight:500;letter-spacing:.12em;
    text-transform:uppercase;color:var(--mute);text-align:left;padding:0 6px 7px;border-bottom:1px solid var(--line);
  }
  thead th.p{text-align:right}
  td{padding:5.5px 6px;border-bottom:1px solid #F1F3F2;font-size:9.5px}
  tr.grp td{
    background:var(--band);border-bottom:0;padding:6px;
    font-family:'Archivo',sans-serif;font-stretch:125%;font-weight:800;
    font-size:9px;letter-spacing:.08em;text-transform:uppercase;
  }
  td.idx{font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--mute);width:26px}
  td.mdl{font-family:'Archivo',sans-serif;font-stretch:125%;font-weight:800;font-size:10.5px;letter-spacing:.03em;white-space:nowrap}
  td.mono{font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--soft);letter-spacing:.04em;white-space:nowrap}
  td.p{text-align:right;font-size:10px;white-space:nowrap}
  td.p--best{color:var(--brand);font-weight:700}
  .notes{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px;padding-top:14px;border-top:1px solid var(--line)}
  .notes p{font-size:8.5px;line-height:1.55;color:var(--soft)}
  .notes b{color:var(--ink);font-weight:700}
</style></head><body>
  <div class="head">
    <div class="h-l">
      <h1>Прайс на респираторы<span>FAROS</span></h1>
      <div class="sub">22 позиции · FFP1–FFP3 · цена за штуку</div>
    </div>
    <div class="h-r">
      <b>ALLTRADE-LTD</b>
      <span>официальная дистрибуция FAROS PROTECTION</span>
      <span>+7 771 051 94 49 · sale@alltrade-ltd.kz</span>
      <span>farospro.kz</span>
    </div>
  </div>

  <div class="tiers">
    ${tiers.map((t) => `<div class="t${t.best ? ' t--best' : ''}"><span class="k">${t.k}</span><span class="v"><i>от</i>${fmt(t.v)}&nbsp;₸</span></div>`).join('')}
  </div>

  <table>
    <thead><tr>
      <th>№</th><th>Модель</th><th>Класс</th><th>Исполнение</th><th>Упаковка</th>
      <th class="p">Розница</th><th class="p">Малый опт</th><th class="p">Опт</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>

  <div class="notes">
    <p><b>Как читать.</b> Цена зависит от класса защиты и наличия клапана выдоха. STANDART — без носового обтюратора, PREMIUM — с обтюратором. FR 3220 и FR 3230 выпускаются только в исполнении PREMIUM.</p>
    <p><b>Упаковка.</b> Групповая — 10 шт. Короб серии FR 4000 — 400 шт, серии FR 3000 — 300 шт. Отгрузка по Казахстану. Актуальность цен и сроки отгрузки уточняйте у менеджера.</p>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(doc, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const pdf = await page.pdf({ width: '794px', height: '1123px', printBackground: true, pageRanges: '1' });
await browser.close();
writeFileSync(join(ROOT, 'assets/faros-price.pdf'), pdf);
console.log(`готово: ${rows.length} позиций, ${(pdf.length / 1024).toFixed(0)} КБ`);
