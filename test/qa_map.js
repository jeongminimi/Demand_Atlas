// Exercise the three map code paths against stubs, since the real CDN is
// unreachable from this container. Mode A: the documented series+scale path
// colours the regions. Mode B: series is inert, so fallbackPaint must run.
// Mode C: nothing works, so the page must show the honest fallback note.
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'research.html');

const CODES = ['KR','TW','JP','HK','SG','MY','TH','VN','ID','PH','US','GB','DE','FR','CA','AU','BR','MX',
  'SA','KZ','AE','EG','ZA','NG','MA','TR','IN','PK','NZ','IT','ES','PL','SE','NO','FI','DK','NL','BE',
  'AT','CH','CZ','HU','RO','BG','GR','PT','IE','IS','EE','LV','LT','LU','SK','UA','AR','CL','CO','PE',
  'BO','PY','UY','VE','EC','CR','DO','GT','HN','NI','PA','SV'];

const stub = mode => `
window.jsVectorMap = function (opts) {
  const host = document.querySelector(opts.selector);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 900 450');
  host.appendChild(svg);
  const init = (opts.regionStyle && opts.regionStyle.initial) || {};
  const codes = ${JSON.stringify(CODES)};
  this.regions = {};
  codes.forEach((c, i) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + (i % 20) * 45 + ' ' + Math.floor(i / 20) * 45 + 'h40v40h-40z');
    p.setAttribute('fill', init.fill || '#ccc');
    ${mode === 'C' ? '' : "p.setAttribute('data-code', c);"}
    svg.appendChild(p);
    this.regions[c] = { element: {
      shape: p,
      setStyle: (k, v) => { ${mode === 'C' ? '' : 'p.setAttribute(k, v);'} },
    } };
  });
  ${mode === 'A' ? `
  // documented behaviour: values map a code to a scale key, scale maps key->colour
  const s = (opts.series && opts.series.regions && opts.series.regions[0]) || null;
  if (s && s.values && s.scale) {
    Object.keys(s.values).forEach(code => {
      const col = s.scale[s.values[code]];
      const r = this.regions[code];
      if (col && r) r.element.shape.setAttribute(s.attribute || 'fill', col);
    });
  }` : '// series intentionally inert'}
  this.destroy = function () {};
};
`;

(async () => {
  const browser = await chromium.launch();
  for (const mode of ['A', 'B', 'C']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/jsvectormap.min.js', r => r.fulfill({ contentType: 'application/javascript', body: stub(mode) }));
    await page.route('**/maps/world.js', r => r.fulfill({ contentType: 'application/javascript', body: '/* map data */' }));
    await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const look = () => page.evaluate(() => {
      const host = document.querySelector('#map');
      const ramp = ['q1','q2','q3','q4','q5','q6']
        .map(k => getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim().toLowerCase());
      const paths = [...host.querySelectorAll('svg path')];
      const painted = paths.filter(p => ramp.includes((p.getAttribute('fill') || '').toLowerCase()));
      const tally = {};
      painted.forEach(p => { const f = p.getAttribute('fill').toLowerCase(); tally[f] = (tally[f] || 0) + 1; });
      return {
        off: host.classList.contains('off'),
        text: (host.textContent || '').trim().slice(0, 40),
        paths: paths.length,
        painted: painted.length,
        distinct: Object.keys(tally).length,
        ramp,
      };
    });

    const before = await look();
    await page.click('#theme');
    await page.waitForTimeout(400);
    const after = await look();

    const pass = mode === 'C'
      ? (before.off && after.off && before.text.startsWith('지도를'))
      : (!before.off && before.painted === 70 && before.distinct >= 4
         && !after.off && after.painted === 70
         && before.ramp[0] !== after.ramp[0]);

    console.log('mode ' + mode + '  ' + (pass ? 'PASS' : 'FAIL'));
    console.log('  light:', JSON.stringify({ off: before.off, paths: before.paths, painted: before.painted, distinct: before.distinct }));
    console.log('  dark :', JSON.stringify({ off: after.off, paths: after.paths, painted: after.painted, distinct: after.distinct }));
    if (mode === 'C') console.log('  note :', before.text);
    if (errs.length) console.log('  ERRORS:', errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close();
})();
