// Scripted interaction QA for research.html — checks behaviour, not pixels.
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'research.html');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; } else { fail++; console.log('  FAIL  ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  const D = await page.evaluate(() => window.DATA || null);
  const raw = await page.evaluate(() => {
    const j = document.querySelector('script').textContent;
    return null;
  });

  // ---- 1. data integrity echoed into the DOM -------------------------------
  const facts = await page.evaluate(() => {
    const t = s => (document.querySelector(s) || {}).textContent || '';
    const rows = [...document.querySelectorAll('#tb tr')].map(tr =>
      [...tr.children].map(td => td.textContent.trim()));
    return {
      prov: t('#prov'),
      cnote: t('#cnote'),
      westnote: t('#westnote'),
      dvnote: t('#dvnote'),
      smaxis: t('#smaxis'),
      smcount: t('#smcount'),
      tbRows: rows,
      topFirst: t('#top .row b'),
      topFirstVal: t('#top .row s'),
      statTexts: [...document.querySelectorAll('#crossstats .stat')].map(s => s.textContent.trim()),
      gapTexts: [...document.querySelectorAll('#gap .gapcell .n')].map(s => s.textContent.trim()),
      yrVals: [...document.querySelectorAll('#yrs .yr em')].map(s => s.textContent.trim()),
      yrHeights: [...document.querySelectorAll('#yrs .yr i')].map(i => i.getBoundingClientRect().height),
      dvRows: [...document.querySelectorAll('#dvall .dvrow')].map(r =>
        [r.querySelector('b').textContent, r.querySelector('s').textContent,
         r.querySelector('i').getAttribute('style')]),
      cells: [...document.querySelectorAll('#sm .cell')].map(c => c.dataset.c),
      crossLabels: [...document.querySelectorAll('#cross text')].map(t => t.textContent)
        .filter(x => /동/.test(x)),
    };
  });

  console.log('— data integrity');
  ok('prov names 70 countries + 107 cohort', /70개국/.test(facts.prov) && /107팀/.test(facts.prov), facts.prov);
  ok('prov names source + license', /Spotify Charts/.test(facts.prov) && /CC BY-SA 4\.0/.test(facts.prov));
  ok('table has 70 rows', facts.tbRows.length === 70, facts.tbRows.length);
  ok('small multiples have 70 cells', facts.cells.length === 70, facts.cells.length);
  ok('no duplicate country in table', new Set(facts.tbRows.map(r => r[0])).size === 70);
  ok('diverging has 20 rows', facts.dvRows.length === 20, facts.dvRows.length);
  ok('diverging first is positive', facts.dvRows[0][1].startsWith('+'), facts.dvRows[0]);
  ok('diverging last is negative', facts.dvRows[19][1].startsWith('−'), facts.dvRows[19]);
  ok('diverging sorted desc', facts.dvRows.every((r, i, a) => {
    if (!i) return true;
    const v = s => parseFloat(s.replace('−', '-').replace('p', ''));
    return v(a[i - 1][1]) >= v(r[1]);
  }));
  ok('positive bars anchor left:50%', facts.dvRows.filter(r => r[1][0] === '+').every(r => /left:50%/.test(r[2])));
  ok('negative bars anchor right:50%', facts.dvRows.filter(r => r[1][0] !== '+').every(r => /right:50%/.test(r[2])));
  ok('top rank leads with 한국', facts.topFirst === '한국', facts.topFirst);

  // year bars must be proportional to their values (the flex-shrink bug)
  const yv = facts.yrVals.map(v => parseFloat(v));
  const yh = facts.yrHeights;
  const ratioOk = yv.every((v, i) => {
    const expect = v / Math.max(...yv);
    const actual = yh[i] / Math.max(...yh);
    return Math.abs(expect - actual) < 0.03;
  });
  ok('year bar heights proportional to values', ratioOk, { yv, yh: yh.map(h => Math.round(h)) });
  ok('year peak is 2023', yv.indexOf(Math.max(...yv)) === 2, yv);

  // cross-chart end labels must both be last-month values
  console.log('— internal consistency');
  ok('cross end labels present', facts.crossLabels.length === 2, facts.crossLabels);
  ok('cnote explains last-month vs 12m avg', /마지막 달/.test(facts.cnote) && /12개월 평균/.test(facts.cnote));
  const eaLabel = parseFloat((facts.crossLabels[0] || '').replace(/[^\d.]/g, ''));
  const eaStat = parseFloat((facts.statTexts[0] || '').match(/→\s*([\d.]+)%/) ? RegExp.$1 : 'NaN');
  ok('end label differs from 12m avg (so the note is needed, not wrong)', eaLabel !== eaStat, { eaLabel, eaStat });

  // the western-market claim must match the rendered numbers
  const westVals = await page.evaluate(() =>
    [...document.querySelectorAll('#west .row')].map(r =>
      [r.querySelector('b').textContent, parseFloat(r.querySelector('s').textContent)]));
  const over1 = westVals.filter(([, v]) => v >= 1).map(([n]) => n);
  ok('westnote names exactly the markets at/over 1%',
    over1.every(n => facts.westnote.includes(n))
    && westVals.filter(([, v]) => v < 1).every(([n]) => !new RegExp(n + '[^\\d]*뿐').test(facts.westnote)),
    { over1, note: facts.westnote });
  ok('westnote does not claim US/UK/DE/FR are all above 1%', !/미국·영국·독일·프랑스/.test(facts.westnote));

  // gap section numbers must come from the data, not be hardcoded stale
  const naChart = await page.evaluate(() => {
    const g = window.DATA && window.DATA.groups;
    return g ? g['북미'].last.toFixed(2) + '%' : null;
  });
  ok('gap tile 1 equals computed 북미 share', naChart === null || facts.gapTexts[0] === naChart,
    { tile: facts.gapTexts[0], computed: naChart });
  ok('gap cites the external resale figure', facts.gapTexts.includes('51.7%'));

  // ---- 2. region chips ------------------------------------------------------
  console.log('— interaction: region chips');
  const chips = await page.$$('#chips button');
  ok('11 chips (전체 + 10 regions)', chips.length === 11, chips.length);
  for (const label of ['동아시아', '동남아', '유럽', '북미']) {
    await page.click('#chips button[data-r="' + label + '"]');
    await page.waitForTimeout(120);
    const st = await page.evaluate(() => ({
      n: document.querySelectorAll('#sm .cell').length,
      count: document.querySelector('#smcount').textContent,
      axis: document.querySelector('#smaxis').textContent,
      pressed: [...document.querySelectorAll('#chips button')].filter(b => b.getAttribute('aria-pressed') === 'true').length,
      first: (document.querySelector('#sm .cell .nm') || {}).textContent,
      vals: [...document.querySelectorAll('#sm .cell .vv')].map(v => parseFloat(v.textContent)),
    }));
    ok(label + ': exactly one chip pressed', st.pressed === 1, st.pressed);
    ok(label + ': label in count line', st.count.includes(label), st.count);
    ok(label + ': cells match chip count', st.n === parseInt(/\d+/.exec(st.count)[0], 10), st);
    ok(label + ': cells sorted by share desc', st.vals.every((v, i, a) => !i || a[i - 1] >= v), st.vals);
    const axisMax = parseFloat(/0 – ([\d.]+)%/.exec(st.axis) ? RegExp.$1 : 'NaN');
    ok(label + ': axis max >= largest visible share', axisMax >= st.vals[0] - 0.005, { axisMax, top: st.vals[0] });
  }
  // axis must actually rescale between regions
  await page.click('#chips button[data-r="동아시아"]'); await page.waitForTimeout(100);
  const axEA = await page.evaluate(() => document.querySelector('#smaxis').textContent);
  await page.click('#chips button[data-r="유럽"]'); await page.waitForTimeout(100);
  const axEU = await page.evaluate(() => document.querySelector('#smaxis').textContent);
  ok('axis rescales per region', axEA !== axEU, { axEA, axEU });
  await page.click('#chips button[data-r="전체"]'); await page.waitForTimeout(100);
  ok('전체 restores 70 cells', (await page.$$('#sm .cell')).length === 70);

  // ---- 3. table toggle + sorting --------------------------------------------
  console.log('— interaction: table');
  ok('table hidden initially', await page.evaluate(() => document.querySelector('#tbwrap').classList.contains('hid')));
  await page.click('#tbtoggle'); await page.waitForTimeout(100);
  const tOpen = await page.evaluate(() => ({
    hid: document.querySelector('#tbwrap').classList.contains('hid'),
    pressed: document.querySelector('#tbtoggle').getAttribute('aria-pressed'),
    expanded: document.querySelector('#tbtoggle').getAttribute('aria-expanded'),
    txt: document.querySelector('#tbtoggle').textContent,
  }));
  ok('table opens', !tOpen.hid && tOpen.pressed === 'true' && tOpen.expanded === 'true' && tOpen.txt === '표 닫기', tOpen);

  const col = async i => page.evaluate(n =>
    [...document.querySelectorAll('#tb tr')].map(tr => tr.children[n].textContent.trim()), i);
  await page.click('th[data-k="delta"]'); await page.waitForTimeout(80);
  const d1 = (await col(4)).map(s => parseFloat(s.replace('−', '-')));
  ok('sort by delta desc', d1.every((v, i, a) => !i || a[i - 1] >= v), d1.slice(0, 4));
  await page.click('th[data-k="delta"]'); await page.waitForTimeout(80);
  const d2 = (await col(4)).map(s => parseFloat(s.replace('−', '-')));
  ok('second click flips to asc', d2.every((v, i, a) => !i || a[i - 1] <= v), d2.slice(0, 4));
  await page.click('th[data-k="last"]'); await page.waitForTimeout(80);
  const d3 = (await col(3)).map(parseFloat);
  ok('sort by last desc', d3.every((v, i, a) => !i || a[i - 1] >= v), d3.slice(0, 4));
  await page.click('th[data-k="ko"]'); await page.waitForTimeout(80);
  ok('sort by name does not drop rows', (await col(0)).length === 70);

  await page.click('#tbtoggle'); await page.waitForTimeout(80);
  ok('table closes', await page.evaluate(() =>
    document.querySelector('#tbwrap').classList.contains('hid')
    && document.querySelector('#tbtoggle').textContent === '표 보기'));

  // ---- 4. tooltips ----------------------------------------------------------
  console.log('— interaction: tooltips');
  const cb = await page.$('#cbox');
  await cb.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const bb = await cb.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await page.waitForTimeout(140);
  const ct = await page.evaluate(() => ({
    on: document.querySelector('#ctip').classList.contains('on'),
    html: document.querySelector('#ctip').innerHTML,
    cx: document.querySelector('#cx').getAttribute('opacity'),
  }));
  ok('cross tooltip shows on hover', ct.on, ct);
  ok('cross tooltip names both series + a month', /동아시아/.test(ct.html) && /동남아/.test(ct.html) && /20\d\d-\d\d/.test(ct.html), ct.html);
  ok('crosshair visible', ct.cx === '1', ct.cx);
  await page.mouse.move(5, 5); await page.waitForTimeout(120);
  ok('cross tooltip hides on leave', !(await page.evaluate(() => document.querySelector('#ctip').classList.contains('on'))));

  const cell = await page.$('#sm .cell');
  await cell.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const cbb = await cell.boundingBox();
  await page.mouse.move(cbb.x + cbb.width * 0.6, cbb.y + cbb.height * 0.75);
  await page.waitForTimeout(140);
  const st2 = await page.evaluate(() => ({
    on: document.querySelector('#stip').classList.contains('on'),
    html: document.querySelector('#stip').innerHTML,
  }));
  ok('sparkline tooltip shows', st2.on, st2);
  ok('sparkline tooltip has country + month + value', /20\d\d-\d\d/.test(st2.html) && /%/.test(st2.html), st2.html);

  // ---- 5. theme -------------------------------------------------------------
  console.log('— interaction: theme');
  const t0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click('#theme'); await page.waitForTimeout(200);
  const t1 = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    attr: document.documentElement.getAttribute('data-theme'),
    btn: document.querySelector('#theme').textContent,
    cells: document.querySelectorAll('#sm .cell').length,
  }));
  ok('theme toggle changes background', t0 !== t1.bg, { t0, t1: t1.bg });
  ok('theme attr set to dark', t1.attr === 'dark', t1.attr);
  ok('button label flips', t1.btn === '라이트', t1.btn);
  ok('small multiples survive theme toggle', t1.cells === 70, t1.cells);
  await page.click('#theme'); await page.waitForTimeout(200);
  ok('toggle back to light', await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light'));

  // ---- 6. a11y / structure ---------------------------------------------------
  console.log('— accessibility');
  const a11y = await page.evaluate(() => ({
    svgNoLabel: [...document.querySelectorAll('svg')].filter(s => !s.getAttribute('aria-label') && s.getAttribute('role') === 'img').length,
    svgWithRole: document.querySelectorAll('svg[role=img]').length,
    h1: document.querySelectorAll('h1').length,
    sections: document.querySelectorAll('section').length,
    btnType: [...document.querySelectorAll('button')].every(b => b.type === 'button'),
    legendItems: document.querySelectorAll('.legend span').length,
    limits: document.querySelectorAll('#tbwrap, .warn').length,
    warnLis: [...document.querySelectorAll('.warn li')].length,
  }));
  ok('every role=img svg has a label', a11y.svgNoLabel === 0, a11y.svgNoLabel);
  ok('one h1', a11y.h1 === 1);
  ok('8 sections', a11y.sections === 8, a11y.sections);
  ok('all buttons type=button', a11y.btnType);
  ok('2-series chart has a legend', a11y.legendItems === 2, a11y.legendItems);
  ok('limitation list present', a11y.warnLis >= 8, a11y.warnLis);

  console.log('\nno page errors: ' + (errs.length === 0));
  if (errs.length) console.log(errs);
  console.log('PASS ' + pass + '  FAIL ' + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
