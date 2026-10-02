// 규칙 감시(가독성): docs/DESIGN_RULES.md 3장 — 글자 최소 11px, 회색 보조 글자·아이콘의 최소 대비.
// 회색 계열만 검사(카테고리색·즐겨찾기 별·알림 배지 같은 브랜드 색은 제외). 라이트/다크 × 주요 화면 전체를 실제로 측정함.
// 기준값에 여유를 둔 이유: 이 테스트는 Tailwind v4 팔레트로 돌아서 운영(v3)과 색이 아주 조금 다름.
//   텍스트 4.0 이상(slate-500 수준), 아이콘 3.0 이상. slate-400(2.6)/slate-300(1.5)이 다시 들어오면 실패함.
const assert = require('assert');
const results = [];
const { launch } = require('./harness');
const { seed } = require('./seed');
const INDEX = process.env.INDEX || require('path').join(__dirname, '..', 'index.html');
const now = Date.now(), day = 86400000;
function data() { const d = seed(); const E = d['data/entries.json'];
  E[0].overview = '개요\n둘째 줄'; E[0].problem = '문제'; E[0].solution = '해결'; E[0].lesson = '교훈'; E[0].tags = ['태그']; E[0].links = [{ label: '링크', url: 'https://a.b' }]; E[0].sourceNoteIds = ['n3']; E[0].createdAt = now - 3600e3; E[0].updatedAt = now;
  d['data/memos.json'] = [{ id: 'm1', text: '기억', tags: ['배포'], createdAt: now - day, updatedAt: now }];
  d['data/todos.json'][0].due = new Date(now + day).toISOString().slice(0, 10); d['data/phrases.json'] = [{ id: 'p1', text: '확인 필요' }]; return d; }
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
async function run(theme) {
  const app = await launch(INDEX, data(), { viewport: { width: 390, height: 844 }, theme });
  const { page } = app; await page.waitForTimeout(900);
  const all = [];
  const grab = async name => {
    const r = await page.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const bgOf = el => { let e = el; while (e) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0.9) return c.slice(0, 3); e = e.parentElement; } return getComputedStyle(document.body).backgroundColor ? rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3) : [255, 255, 255]; };
      const out = [];
      document.querySelectorAll('button, a').forEach(b => { const r = b.getBoundingClientRect(); if (!r.width || !r.height) return; if (b.textContent.trim() && !b.getAttribute('aria-label')) return; if (b.disabled) return; out.push({ k: 'icon', t: b.getAttribute('aria-label') || b.title || '?', fg: rgba(getComputedStyle(b).color).slice(0, 3), bg: bgOf(b), fs: 0 }); });
      document.querySelectorAll('span,p,div,label,button,h1,h2,h3').forEach(e => { if (e.children.length) return; const t = e.textContent.trim(); if (!t) return; const r = e.getBoundingClientRect(); if (!r.width) return; if (e.disabled || e.closest('button[disabled]')) return; const cs = getComputedStyle(e); out.push({ k: 'text', t: t.slice(0, 16), fg: rgba(cs.color).slice(0, 3), bg: bgOf(e), fs: parseFloat(cs.fontSize), inl: !!(e.style && e.style.color) || !!(e.parentElement && e.parentElement.style && e.parentElement.style.color) }); });
      return out;
    });
    r.forEach(x => all.push({ ...x, screen: name, cr: ratio(x.fg, x.bg) }));
  };
  const go = async l => { await page.locator('button', { hasText: l }).last().click(); await page.waitForTimeout(350); };
  await go('빠른 기록'); await grab('빠른 기록');
  await go('할 일'); await grab('할 일'); await page.getByRole('button', { name: /기억할 것/ }).click(); await page.waitForTimeout(300); await grab('기억할 것');
  await go('업무일지'); await grab('업무일지'); await page.getByRole('button', { name: '달력' }).click(); await page.waitForTimeout(300); await grab('달력');
  await page.getByRole('button', { name: '목록' }).first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500); await grab('일지 작성'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await go('설정'); await grab('설정');
  await app.close();
  const gray = c => Math.max(...c) - Math.min(...c) < 40; // 회색 계열만(채도 낮음)
  const badText = all.filter(x => x.k === 'text' && !x.inl && x.fs >= 11 && gray(x.fg) && gray(x.bg) && x.cr < 4.0);
  const badIcon = all.filter(x => x.k === 'icon' && gray(x.fg) && gray(x.bg) && x.cr < 3.0);
  const small = all.filter(x => x.k === 'text' && x.fs > 0 && x.fs < 11);
  const fmt = l => l.slice(0, 8).map(x => `${x.screen}:${x.t}(${x.cr.toFixed(2)})`).join(', ');
  const ok = !badText.length && !badIcon.length && !small.length;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [${theme}] 화면 ${new Set(all.map(x => x.screen)).size}개, 검사 ${all.length}개 — 글자 대비 미달 ${badText.length}, 아이콘 대비 미달 ${badIcon.length}, 11px 미만 ${small.length}`);
  if (!ok) { if (badText.length) console.log('    글자:', fmt(badText)); if (badIcon.length) console.log('    아이콘:', fmt(badIcon)); if (small.length) console.log('    작은 글자:', small.slice(0, 5).map(x => `${x.screen}:${x.t}(${x.fs}px)`).join(', ')); process.exitCode = 1; }
  results.push(ok);
}
console.log('\n[가독성 규칙 감시]');
(async () => { await run('light'); await run('dark'); console.log(`\n결과: ${results.filter(Boolean).length}/${results.length} 통과`); })().catch(e => { console.error(e); process.exit(1); });
