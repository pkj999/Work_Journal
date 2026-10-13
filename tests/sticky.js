// 스티커 창: PC에 띄워 두는 작은 현황 창. 별도 창(팝업 / Document Picture-in-Picture)에 메인 앱 상태를 그대로 그림
const { test, summary, assert, settle, seed } = require('./lib');

const day = 86400000, now = Date.now();
const ymd = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const T = (id, text, dueDays, extra = {}) => ({ id, text, due: dueDays == null ? null : ymd(now + dueDays * day), done: false, createdAt: now - 1000, updatedAt: now - 1000, ...extra });
const P = (id, name, status, deadlineDays) => ({ id, name, purpose: '', status, deadline: deadlineDays == null ? null : ymd(now + deadlineDays * day), createdAt: now - 30 * day, updatedAt: now - 30 * day });
const M = (id, text, tags, ago) => ({ id, text, tags, createdAt: now - ago, updatedAt: now - ago });

const scenario = () => {
  const d = seed();
  d['data/todos.json'] = [
    T('d1', '오늘 A', 0), T('d2', '오늘 B', 0),
    T('o1', '지난 보고서', -2), T('o2', '더 오래된 것', -5),
    T('n1', '기한 없는 것', null),
    T('f1', '모레 이후 것', 3),
    T('dn1', '오늘 끝낸 것', 0, { done: true, completedAt: now }),
    T('dn2', '예전에 끝낸 것', -5, { done: true, completedAt: now - 5 * day }),
  ];
  d['data/projects.json'] = [
    P('pa', 'A제품 생산', '진행중', 2), P('pb', 'B설비 교체', '진행중', -2),
    P('pc', 'C보류 건', '보류', -1), P('pd', 'D끝난 건', '완료', -1), P('pe', 'E먼 마감', '진행중', 10), P('pf', 'F마감 없음', '진행중', null),
  ];
  d['data/memos.json'] = [M('m1', '지게차 구역 출입 전 무전 확인', ['안전'], 1000), M('m2', 'A제품 가공정 온도 상한 180도', ['A제품'], 2000), M('m3', '세 번째 메모', [], 3000)];
  return d;
};
const open = async page => {
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '스티커 창 띄우기' }).click()]);
  await pop.waitForSelector('[data-testid=sticky-root]');
  return pop;
};
const rows = async pop => (await pop.getByTestId('sticky-todo').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
const txt = async pop => (await pop.getByTestId('sticky-root').innerText()).replace(/\s+/g, ' ');

(async () => {
  console.log('\n[스티커 창: 열고 닫기]');

  await test('헤더의 [스티커 창 띄우기]를 누르면 별도 창이 열리고 오늘 날짜가 `2026.10.13 (화)` 형식으로 보임(ISO 아님)', async ({ page }) => {
    const pop = await open(page);
    const date = await pop.getByTestId('sticky-date').innerText();
    assert.ok(/^\d{4}\.\d{2}\.\d{2} \([월화수목금토일]\)$/.test(date), date);
    assert.strictEqual(await page.getByRole('button', { name: '스티커 창 닫기' }).count(), 1, '버튼이 [닫기]로 바뀜');
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(await txt(pop)));
  }, { seed: scenario });

  await test('다시 누르면 창이 닫히고, 창을 직접 닫아도 버튼이 원래대로 돌아와 다시 열 수 있음', async ({ page }) => {
    let pop = await open(page);
    await page.getByRole('button', { name: '스티커 창 닫기' }).click();
    await page.waitForFunction(() => true); await page.waitForTimeout(300);
    assert.ok(pop.isClosed(), '버튼으로 닫힘');
    assert.strictEqual(await page.getByRole('button', { name: '스티커 창 띄우기' }).count(), 1);
    pop = await open(page);
    await pop.close();
    await page.getByRole('button', { name: '스티커 창 띄우기' }).waitFor({ timeout: 5000 });
    pop = await open(page);
    assert.strictEqual(await pop.getByTestId('sticky-root').count(), 1);
  }, { seed: scenario });

  await test('연타해도 창은 하나, 화면 내용도 하나', async ({ page, context }) => {
    let n = 0; page.on('popup', () => n++);
    await page.getByRole('button', { name: '스티커 창 띄우기' }).dblclick();
    await page.waitForTimeout(800);
    assert.ok(n >= 1);
    const pop = context.pages().find(p => p !== page);
    assert.strictEqual(await pop.getByTestId('sticky-root').count(), 1);
  }, { seed: scenario });

  await test('팝업이 막혀 창을 못 열면 안내가 뜨고 버튼은 [띄우기] 그대로', async ({ page }) => {
    await page.evaluate(() => { window.open = () => null; });
    await page.getByRole('button', { name: '스티커 창 띄우기' }).click(); await settle(page);
    assert.ok(await page.locator('text=스티커 창을 열지 못했어요').count() >= 1);
    assert.strictEqual(await page.getByRole('button', { name: '스티커 창 띄우기' }).count(), 1);
  }, { seed: scenario });

  await test('Picture-in-Picture를 지원하면 그걸로 열림(요청 크기 전달), 지원 안 하면 일반 팝업', async ({ page }) => {
    await page.evaluate(() => {
      window.documentPictureInPicture = { requestWindow: async opts => { window.__pipOpts = opts; return window.open('', 'wj-pip-test', 'popup=yes,width=300,height=400'); } };
    });
    const pop = await open(page);
    const opts = await page.evaluate(() => window.__pipOpts);
    assert.deepStrictEqual(opts, { width: 340, height: 560 });
    assert.ok(await pop.getByTestId('sticky-date').count() === 1);
  }, { seed: scenario });

  await test('Picture-in-Picture 요청이 실패하면 팝업으로 대신 열림', async ({ page }) => {
    await page.evaluate(() => { window.documentPictureInPicture = { requestWindow: async () => { throw new Error('denied'); } }; });
    const pop = await open(page);
    assert.strictEqual(await pop.getByTestId('sticky-root').count(), 1);
  }, { seed: scenario });

  await test('창을 닫을 때 크기를 기억하고 다음에 그 크기로 요청', async ({ page }) => {
    const pop = await open(page);
    await pop.setViewportSize({ width: 410, height: 630 });
    await pop.close();
    await page.getByRole('button', { name: '스티커 창 띄우기' }).waitFor({ timeout: 5000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('workjournal.sticky.size.v1') || 'null'));
    assert.ok(saved && Math.abs(saved.width - 410) <= 20 && Math.abs(saved.height - 630) <= 20, JSON.stringify(saved));
  }, { seed: scenario });

  await test('좁은 화면(390px, 폰)에서는 스티커 버튼이 보이지 않음', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('button', { name: '스티커 창 띄우기' }).isVisible(), false);
  }, { seed: scenario });

  console.log('\n[스티커 창: 무엇을 보여주나]');

  await test('할 일: 지난 것(오래된 순) → 오늘 → 기한 없음 → 오늘 끝낸 것. 모레 이후·예전에 끝낸 건 안 나옴', async ({ page }) => {
    const pop = await open(page);
    const r = await rows(pop);
    assert.deepStrictEqual(r.map(x => x.split(' ')[0] + ' ' + x.split(' ')[1]), ['더 오래된 것 5일', '지난 보고서 2일', '오늘 A 오늘', '오늘 B 오늘', '기한 없는 것 기한', '오늘 끝낸 것 완료']);
    assert.ok(!(await txt(pop)).includes('모레 이후 것') && !(await txt(pop)).includes('예전에 끝낸 것'));
    assert.ok(r[0].includes('5일 지남') && r[1].includes('2일 지남'));
    assert.strictEqual(await pop.getByTestId('sticky-todo').nth(5).locator('input').isChecked(), true);
    assert.ok((await txt(pop)).includes('4건 남음') || (await txt(pop)).includes('5건 남음'));
  }, { seed: scenario });

  await test('요약 칩: 지난 것 2 · 오늘 2 · 프로젝트 마감 2', async ({ page }) => {
    const pop = await open(page);
    const t = await txt(pop);
    assert.ok(t.includes('지난 것 2') && t.includes('오늘 2') && t.includes('프로젝트 마감 2'), t);
  }, { seed: scenario });

  await test('프로젝트: 진행중이고 마감 3일 이내이거나 지난 것만, 마감 빠른 순. 보류·완료·먼 마감·마감 없음은 안 나옴', async ({ page }) => {
    const pop = await open(page);
    const ps = (await pop.getByTestId('sticky-project').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
    assert.strictEqual(ps.length, 2);
    assert.ok(ps[0].startsWith('B설비 교체') && ps[0].includes('2일 지남') && ps[0].includes('아직 기록 없음'), ps[0]);
    assert.ok(ps[1].startsWith('A제품 생산') && ps[1].includes('D-2'), ps[1]);
    const t = await txt(pop);
    for (const n of ['C보류 건', 'D끝난 건', 'E먼 마감', 'F마감 없음']) assert.ok(!t.includes(n), n);
  }, { seed: scenario });

  await test('프로젝트 카드의 마지막 기록 날짜가 보임', async ({ page }) => {
    const pop = await open(page);
    assert.ok((await pop.getByTestId('sticky-project').first().innerText()).includes('아직 기록 없음'));
  }, { seed: () => { const d = scenario(); d['data/entries.json'] = [{ id: 'e1', date: ymd(now - day), title: 'A', category: '개발', importance: '중', bullets: ['x'], overview: '', problem: '', solution: '', lesson: '', tags: [], links: [], images: [], projectId: 'pa', createdAt: now, updatedAt: now }]; return d; } });

  await test('기억할 것: 최근 2개만, 첫 태그가 #로 붙음', async ({ page }) => {
    const pop = await open(page);
    const ms = (await pop.getByTestId('sticky-memo').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
    assert.deepStrictEqual(ms, ['#안전 지게차 구역 출입 전 무전 확인', '#A제품 A제품 가공정 온도 상한 180도']);
  }, { seed: scenario });

  await test('할 일이 8개를 넘으면 8개만 보이고 "외 N건"으로 알림(지난 것·오늘이 먼저 보임)', async ({ page }) => {
    const pop = await open(page);
    assert.strictEqual((await rows(pop)).length, 8);
    assert.ok((await txt(pop)).includes('외 5건이 더 있어요'));
    assert.ok((await rows(pop))[0].includes('긴급'));
  }, { seed: () => { const d = seed(); d['data/todos.json'] = [T('u', '긴급', -1), ...Array.from({ length: 12 }, (_, i) => T('n' + i, '메모 ' + i, null))]; return d; } });

  await test('아무것도 없으면 안내 문구만, 프로젝트·기억할 것·요약 칩은 숨김', async ({ page }) => {
    const pop = await open(page);
    const t = await txt(pop);
    assert.ok(t.includes('남은 할 일이 없어요.'));
    assert.ok(!t.includes('마감이 가까운 프로젝트') && !t.includes('기억할 것') && !t.includes('지난 것'));
  }, { seed: () => { const d = seed(); d['data/todos.json'] = []; return d; } });

  await test('오늘 것을 다 끝냈으면 "모두 끝냈어요"', async ({ page }) => {
    const pop = await open(page);
    assert.ok((await txt(pop)).includes('오늘 할 일을 모두 끝냈어요.'));
  }, { seed: () => { const d = seed(); d['data/todos.json'] = [T('x', '끝낸 일', 0, { done: true, completedAt: now })]; return d; } });

  console.log('\n[스티커 창: 조작]');

  await test('할 일 체크 → 저장 1번, 바로 체크 표시, 메인 앱 할 일도 같이 바뀜', async ({ page, fake }) => {
    const pop = await open(page);
    const before = fake.puts.filter(x => x.path === 'data/todos.json').length;
    await pop.getByLabel('오늘 A').check(); await settle(page);
    assert.strictEqual(fake.puts.filter(x => x.path === 'data/todos.json').length, before + 1);
    const saved = fake.get('data/todos.json').find(t => t.id === 'd1');
    assert.strictEqual(saved.done, true); assert.ok(saved.completedAt);
    assert.strictEqual(await pop.getByLabel('오늘 A').isChecked(), true);
  }, { seed: scenario });

  await test('체크 해제도 됨(오늘 끝낸 것을 다시 열기)', async ({ page, fake }) => {
    const pop = await open(page);
    await pop.getByLabel('오늘 끝낸 것').uncheck(); await settle(page);
    assert.strictEqual(fake.get('data/todos.json').find(t => t.id === 'dn1').done, false);
  }, { seed: scenario });

  await test('체크 저장이 실패하면 체크가 원래대로 돌아오고 창에 실패 안내', async ({ page, fake }) => {
    const pop = await open(page);
    fake.failNext.push({ path: 'data/todos.json', status: 500 });
    await pop.getByLabel('오늘 A').check(); await settle(page);
    assert.strictEqual(await pop.getByLabel('오늘 A').isChecked(), false);
    assert.ok((await pop.getByTestId('sticky-status').innerText()).includes('저장하지 못했어요'));
    assert.strictEqual(fake.get('data/todos.json').find(t => t.id === 'd1').done, false);
  }, { seed: scenario });

  await test('빠른 기록: 입력 후 Enter → 저장 1번, 입력칸 비워지고 "기록했어요."', async ({ page, fake }) => {
    const pop = await open(page);
    await pop.getByLabel('빠른 기록 한 줄').fill('  현장에서 본 것  ');
    await pop.getByLabel('빠른 기록 한 줄').press('Enter'); await settle(page);
    const notes = fake.get('data/quick-notes.json');
    assert.strictEqual(notes[0].text, '현장에서 본 것');
    assert.strictEqual(await pop.getByLabel('빠른 기록 한 줄').inputValue(), '');
    assert.ok((await pop.getByTestId('sticky-status').innerText()).includes('기록했어요'));
  }, { seed: scenario });

  await test('한글 입력 중 Enter(조합 확정)는 저장하지 않음, [추가] 버튼은 빈 입력이면 비활성', async ({ page, fake }) => {
    const pop = await open(page);
    const before = (fake.get('data/quick-notes.json') || []).length;
    assert.ok(await pop.getByRole('button', { name: '추가' }).isDisabled());
    await pop.getByLabel('빠른 기록 한 줄').fill('조합 중');
    await pop.evaluate(() => document.getElementById('sticky-quick').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true })));
    await settle(page);
    assert.strictEqual((fake.get('data/quick-notes.json') || []).length, before);
    await pop.getByLabel('빠른 기록 한 줄').fill('   ');
    assert.ok(await pop.getByRole('button', { name: '추가' }).isDisabled());
  }, { seed: scenario });

  await test('빠른 기록 저장 실패 → 입력 내용 유지 + 창에 실패 안내, 메인에 "다시 시도" 버튼은 안 뜸(이중 저장 방지)', async ({ page, fake }) => {
    const pop = await open(page);
    fake.failNext.push({ path: 'data/quick-notes.json', status: 500 });
    await pop.getByLabel('빠른 기록 한 줄').fill('실패할 글');
    await pop.getByRole('button', { name: '추가' }).click(); await settle(page);
    assert.strictEqual(await pop.getByLabel('빠른 기록 한 줄').inputValue(), '실패할 글');
    assert.ok((await pop.getByTestId('sticky-status').innerText()).includes('저장하지 못했어요'));
    assert.strictEqual(await page.getByRole('button', { name: '다시 시도' }).count(), 0);
    await pop.getByRole('button', { name: '추가' }).click(); await settle(page);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.text === '실패할 글').length, 1);
  }, { seed: scenario });

  await test('창의 [새로고침]: 다른 기기에서 바뀐 내용이 반영됨', async ({ page, fake }) => {
    const pop = await open(page);
    fake.set('data/todos.json', [...fake.get('data/todos.json'), T('new1', '다른 기기에서 넣은 일', 0)]);
    await pop.getByRole('button', { name: '새로고침' }).click(); await settle(page);
    assert.ok((await txt(pop)).includes('다른 기기에서 넣은 일'));
  }, { seed: scenario });

  await test('메인 앱에서 할 일을 추가하면 열려 있는 스티커에도 바로 나타남', async ({ page }) => {
    const pop = await open(page);
    await page.locator('nav button, button').filter({ hasText: '할 일' }).last().click(); await page.waitForTimeout(400);
    await page.getByPlaceholder(/할 일/).first().fill('메인에서 추가'); await page.keyboard.press('Enter'); await settle(page);
    assert.ok((await txt(pop)).includes('메인에서 추가'));
  }, { seed: scenario });

  console.log('\n[스티커 창: 모양]');

  await test('다크 모드를 바꾸면 스티커 창도 같이 바뀜', async ({ page }) => {
    const pop = await open(page);
    const isDark = () => pop.getByTestId('sticky-root').evaluate(el => el.classList.contains('dark'));
    const first = await isDark();
    await page.getByRole('button', { name: /모드로 전환/ }).click(); await page.waitForTimeout(300);
    assert.notStrictEqual(await isDark(), first);
  }, { seed: scenario });

  await test('글자·배지 대비(라이트/다크 모두): 일반 글자 4.5 이상, 11px 이상', async ({ page }) => {
    const pop = await open(page);
    const measure = () => pop.evaluate(() => {
      const rgba = c => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d'); x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data); };
      const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bg = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] === 255) break; } } let base = [255, 255, 255]; for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; const al = a / 255; base = [r * al + base[0] * (1 - al), g * al + base[1] * (1 - al), b * al + base[2] * (1 - al)]; } return base; };
      const bad = [];
      document.querySelectorAll('.wjs *').forEach(el => {
        if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
        const cs = getComputedStyle(el); const fg = rgba(cs.color);
        const a = L(fg), b = L(bg(el)); const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        if (ratio < 4.5) bad.push(`${el.textContent.trim().slice(0, 12)} ${ratio.toFixed(2)}`);
        if (parseFloat(cs.fontSize) < 11) bad.push(`작은 글자 ${el.textContent.trim().slice(0, 12)} ${cs.fontSize}`);
      });
      return bad;
    });
    assert.deepStrictEqual(await measure(), [], '라이트/현재 테마');
    await page.getByRole('button', { name: /모드로 전환/ }).click(); await page.waitForTimeout(300);
    assert.deepStrictEqual(await measure(), [], '반대 테마');
  }, { seed: scenario });

  await test('아이콘만 있는 버튼에는 이름이 있고 (새로고침) 입력칸에도 이름이 있음', async ({ page }) => {
    const pop = await open(page);
    const unnamed = await pop.evaluate(() => [...document.querySelectorAll('.wjs button, .wjs input')].filter(el => !(el.getAttribute('aria-label') || el.textContent.trim() || (el.id && document.querySelector(`label[for="${el.id}"]`)))).length);
    assert.strictEqual(unnamed, 0);
  }, { seed: scenario });

  summary();
})();
