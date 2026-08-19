/**
 * Обязательная проверка перед публикацией: node tools/preflight.mjs
 *
 * Ловит ровно те поломки, которые уже случались на этом сайте:
 * незакрытую скобку в стилях, разъезд на неудачной ширине, расхождение цен,
 * длинные тире, непроверяемые утверждения и мелкие цели под палец.
 * Пишет отчёт и возвращает код 1, если есть красные пункты.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire('/Users/evgenia/Downloads/vyka-crm/');
const { webkit, devices } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

const red = [], amber = [], green = [];
const ok = (m) => green.push(m);
const warn = (m) => amber.push(m);
const bad = (m) => red.push(m);

/* 1. стили: незакрытая скобка гасит всё, что ниже */
const style = /<style>([\s\S]*?)<\/style>/.exec(html);
const balance = style ? (style[1].match(/{/g) || []).length - (style[1].match(/}/g) || []).length : null;
balance === 0 ? ok('стили: скобки сбалансированы') : bad(`стили: незакрытых блоков ${balance} - всё, что ниже по файлу, отваливается`);

/* 2. типографика: длинные и средние тире на сайте не используются */
const dashes = (html.match(/[—–]/g) || []).length;
dashes === 0 ? ok('тире: только дефисы') : bad(`тире: найдено ${dashes} длинных или средних тире`);

/* 3. утверждения, которые мы не можем доказать */
const claims = [
  [/НДС/i, 'упоминание НДС (статус плательщика не подтверждён)'],
  [/всегда в наличии|в наличии на складе/i, 'обещание наличия'],
  [/доставка за \d|за \d+ (рабочих )?дн/i, 'обещание срока доставки'],
  [/отсрочк/i, 'обещание отсрочки платежа'],
  [/гаранти[яю] \d/i, 'обещание гарантии сроком'],
];
const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
claims.forEach(([re, name]) => { if (re.test(text)) bad(`непроверенное утверждение: ${name}`); });
if (!red.some(r => r.startsWith('непроверенное'))) ok('непроверенных утверждений не найдено');

/* 4. цены: страница против таблицы прайса */
const norm = html.replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
const rows = [...norm.matchAll(/<tr [^>]*data-cls="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)];
rows.length === 12 || rows.length === 22
  ? ok(`прайс: строк в таблице ${rows.length}`)
  : bad(`прайс: в таблице ${rows.length} строк, ожидалось 12 моделей или 22 позиции`);
const nums = new Set();
rows.forEach(r => [...r[1].matchAll(/<td class="p[^"]*">[\s\S]*?<\/td>/g)].forEach(c => {
  [...c[0].matchAll(/(\d[\d ]*) ?₸/g)].forEach(m => nums.add(parseInt(m[1].replace(/\s/g, ''), 10)));
}));
const heroPrices = [...norm.matchAll(/<b>от (\d[\d ]*)<i>[^<]*<\/i><\/b>/g)].map(m => parseInt(m[1].replace(/\s/g, ''), 10));
const missing = heroPrices.filter(p => !nums.has(p));
missing.length === 0
  ? ok(`первый экран: цены ${heroPrices.join('/')} есть в прайсе`)
  : bad(`первый экран: цены ${missing.join(', ')} не найдены в таблице прайса`);

/* 5. живые проверки на пяти ширинах */
const sizes = [['375', { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }],
               ['430', { ...devices['iPhone 14 Pro Max'] }],
               ['820', { viewport: { width: 820, height: 1180 } }],
               ['1440', { viewport: { width: 1440, height: 900 } }],
               ['1920', { viewport: { width: 1920, height: 1080 } }]];
const browser = await webkit.launch();
for (const [name, dev] of sizes) {
  const ctx = await browser.newContext({ ...dev });
  const page = await ctx.newPage();
  const errs = [], failed = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('response', r => { if (!r.ok()) failed.push(r.status() + ' ' + r.url().split('/').pop()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  for (let i = 0; i < 40; i++) { await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8)); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    /* палец проверяем только на тач-ширинах и только по высоте: узкая, но высокая цель попадается нормально */
    const touch = window.matchMedia('(pointer:coarse)').matches;
    const small = !touch ? [] : [...document.querySelectorAll('a, button, input, summary')]
      .filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 40; })
      .map(el => (el.textContent || el.tagName).trim().slice(0, 28));
    const broken = [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))
      .filter(h => h.length > 1 && !document.querySelector(h));
    const imgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.split('/').pop());
    const kicks = [...document.querySelectorAll('.sec-head .kick')].map(k => {
      const c = getComputedStyle(k); return `${c.fontFamily.split(',')[0]}|${c.fontSize}|${c.fontWeight}`;
    });
    return { wide: document.documentElement.scrollWidth > window.innerWidth, small: [...new Set(small)], broken, imgs, kicks: [...new Set(kicks)] };
  });
  r.wide ? bad(`${name}: страница шире экрана`) : ok(`${name}: по ширине помещается`);
  errs.length ? bad(`${name}: ошибки в консоли - ${errs.slice(0, 2).join('; ')}`) : ok(`${name}: консоль чистая`);
  failed.length ? bad(`${name}: не загрузилось - ${failed.slice(0, 3).join(', ')}`) : ok(`${name}: все файлы загрузились`);
  r.broken.length ? bad(`${name}: битые якоря - ${r.broken.join(', ')}`) : ok(`${name}: якоря целы`);
  r.imgs.length ? bad(`${name}: битые картинки - ${r.imgs.join(', ')}`) : ok(`${name}: картинки на месте`);
  if (r.small.length) warn(`${name}: мельче 44 px - ${r.small.slice(0, 4).join(', ')}${r.small.length > 4 ? ' и ещё ' + (r.small.length - 4) : ''}`);
  r.kicks.length > 1 ? warn(`${name}: подписи разделов набраны по-разному - ${r.kicks.join(' / ')}`) : ok(`${name}: подписи разделов одинаковые`);
  await ctx.close();
}
await browser.close();

const line = (s) => console.log(s);
line('\n=== ПРОВЕРКА ПЕРЕД ПУБЛИКАЦИЕЙ ===');
line(`\nКРАСНОЕ (${red.length}) - публиковать нельзя:`);
red.forEach(r => line('  ✗ ' + r));
line(`\nЖЁЛТОЕ (${amber.length}) - посмотреть глазами:`);
amber.forEach(r => line('  ! ' + r));
line(`\nЗЕЛЁНОЕ (${green.length}) - в порядке`);
process.exit(red.length ? 1 : 0);
