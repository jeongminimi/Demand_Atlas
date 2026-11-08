const {chromium} = require('playwright');
const fail=[], note=[];
const ck=(c,m)=>{ (c?note:fail).push((c?'PASS ':'FAIL ')+m); };
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1200},deviceScaleFactor:1});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{ if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('CONSOLE '+m.text()); });
await p.goto('file://'+require('path').join(__dirname,'..','index.html'));
await p.waitForTimeout(900);

const names = await p.$$eval('#artist option', os=>os.map(o=>({v:o.value,t:o.textContent})));
ck(names.length===24, `아티스트 ${names.length}팀 (기대 24)`);

const snap = async () => p.evaluate(()=>{
  const n = s => parseInt(($(s).textContent||'0').replace(/[^0-9]/g,''))||0;
  const rows=[...document.querySelectorAll('#rows tr')];
  const reg=[...document.querySelectorAll('#regrows tr')];
  return {
    total:n('htotal'), auto:n('hauto'), man:n('hman'),
    nCountry:rows.length, nReg:reg.length,
    manualRows: rows.filter(r=>/수동/.test(r.innerHTML)).length,
    guardReg: reg.filter(r=>/표본 부족/.test(r.innerHTML)).length,
    sku: [...document.querySelectorAll('#skurows tr')].length,
    pen: document.querySelectorAll('#pen .pen').length,
    members: +document.getElementById('members').value,
    regSum: reg.reduce((s,r)=>s+(parseInt((r.children[2].textContent||'').replace(/[^0-9]/g,''))||0),0)
  };
});

for (const target of ['BTS','Jin','i-dle','SEVENTEEN','ATEEZ','TAEYANG','TWICE']) {
  const opt = names.find(o=>o.t.startsWith(target+' ·'));
  if(!opt){ fail.push('FAIL 옵션 없음: '+target); continue; }
  await p.selectOption('#artist', opt.v); await p.waitForTimeout(250);
  const s = await snap();
  ck(s.total===10000, `${target}: 총합 ${s.total} == 10000`);
  ck(s.auto+s.man===s.total, `${target}: 자동(${s.auto})+수동(${s.man}) == 총합`);
  ck(s.regSum===s.total, `${target}: 권역표 합계 ${s.regSum} == 총합`);
  ck(s.sku===s.nReg, `${target}: SKU행 ${s.sku} == 권역행 ${s.nReg}`);
  ck(s.pen>0, `${target}: 침투도 막대 ${s.pen}개`);
  if(['Jin','i-dle','TAEYANG'].includes(target)) ck(s.guardReg>0, `${target}: 표본부족 권역 ${s.guardReg}개 감지`);
  if(target==='BTS') ck(s.guardReg===0 && s.members===7, `BTS: 가드 0, 멤버 ${s.members}`);
  if(target==='SEVENTEEN') ck(s.members===13, `SEVENTEEN: 멤버 ${s.members}`);
  if(target==='TWICE') ck(s.members===9, `TWICE: 멤버 ${s.members}`);
}

// KR toggle
await p.selectOption('#artist', names.find(o=>o.t.startsWith('TWICE ·')).v); await p.waitForTimeout(200);
const a1=await snap(); await p.check('#inckr'); await p.waitForTimeout(250); const a2=await snap();
ck(a2.nCountry===a1.nCountry+1, `KR 포함 시 국가 ${a1.nCountry}→${a2.nCountry}`);
ck(a2.total===10000, `KR 포함 후에도 총합 ${a2.total}`);
await p.uncheck('#inckr'); await p.waitForTimeout(200);

// weights
await p.fill('#w_북미','0'); await p.waitForTimeout(250); const w1=await snap();
ck(w1.total===10000, `북미 0% 후 총합 ${w1.total}`);
const naQty = await p.evaluate(()=>{const r=[...document.querySelectorAll('#regrows tr')].find(x=>/북미/.test(x.children[0].textContent)); return r?parseInt(r.children[2].textContent.replace(/[^0-9]/g,'')):-1;});
ck(naQty===0||naQty===-1, `북미 가중치 0 → 북미 배분 ${naQty}`);
await p.click('#reset'); await p.waitForTimeout(250);

// total change
await p.fill('#total','7777'); await p.waitForTimeout(250); const t1=await snap();
ck(t1.total===7777, `총수량 변경 → ${t1.total}`);
ck(t1.auto+t1.man===7777, `변경 후 자동+수동 == 7777`);
await p.fill('#total','10000'); await p.waitForTimeout(200);

// members change affects SKU
await p.fill('#members','4'); await p.waitForTimeout(250);
const sku4 = await p.evaluate(()=>document.querySelector('#skurows tr').children[2].textContent);
await p.fill('#members','8'); await p.waitForTimeout(250);
const sku8 = await p.evaluate(()=>document.querySelector('#skurows tr').children[2].textContent);
ck(sku4!==sku8, `멤버 4→8 시 1종당 수량 변화 (${sku4} → ${sku8})`);

// copy button present & TSV built
const tsvOk = await p.evaluate(()=>typeof TSV==='string'&&TSV.split('\n').length>10&&TSV.includes('권역'));
ck(tsvOk, 'TSV 복사 데이터 생성됨');

// overflow at phone
const ph=await ctx.newPage(); await ph.setViewportSize({width:400,height:900});
await ph.goto('file://'+require('path').join(__dirname,'..','index.html')); await ph.waitForTimeout(800);
ck(!(await ph.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)), '400px 가로 넘침 없음');

ck(errs.length===0, 'JS 에러 '+(errs.length?errs.join(' | '):'없음'));
await b.close();
console.log(note.join('\n'));
console.log('\n================ 실패 '+fail.length+'건 ================');
console.log(fail.length?fail.join('\n'):'없음');
})();
