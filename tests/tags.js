// 태그 입력 편의: 태그 칸이 업무명 바로 아래, 최근 쓴 태그 칩을 눌러서 추가
const { test, summary, assert, gotoEntries, gotoQuick, settle, seed } = require('./lib');

const day = 86400000, now = Date.now();
const iso = d => new Date(d).toISOString().slice(0, 10);
const E = (id, daysAgo, title, tags, extra = {}) => ({
  id, date: iso(now - daysAgo * day), title, category: '개발', importance: '중', bullets: [`${id} 한 일`], overview: '', problem: '', solution: '', lesson: '',
  tags, links: [], images: [], createdAt: now - daysAgo * day - id.length, updatedAt: now - daysAgo * day, ...extra,
});
// 최근 일지들: A제품(3회, 표기 다름 포함)·가공정(2회)·나공정(1회) … 오래된 일지에만 있는 태그는 '옛태그'
const hist = () => {
  const d = seed();
  d['data/entries.json'] = [
    E('h1', 1, '작업1', ['A제품', '가공정']),
    E('h2', 2, '작업2', ['a제품', '가공정', '나공정']),
    E('h3', 3, '작업3', ['A 제품']),
    E('h4', 90, '아주 옛날 작업', ['옛태그']),
    E('h5', 4, '삭제된 작업', ['삭제태그'], { deleted: true, deletedAt: now }),
  ];
  return d;
};
const newForm = async page => { await gotoEntries(page); await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500); };
const form = page => page.locator('form').first();
const recent = page => form(page).getByRole('group', { name: '최근 태그' });
const recentNames = async page => (await recent(page).getByRole('button').allInnerTexts()).map(t => t.trim());

(async () => {
  console.log('\n[태그 입력: 위치]');

  await test('새 일지 폼에서 태그 칸이 업무명 바로 아래(핵심 내용·개요보다 위)에 있음', async ({ page }) => {
    await newForm(page);
    const y = async loc => (await loc.first().boundingBox()).y;
    const title = await y(form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응'));
    const tag = await y(form(page).getByPlaceholder('예: A제품, 가공정'));
    const bullet = await y(form(page).getByPlaceholder('한 일을 입력하세요'));
    const overview = await y(form(page).getByPlaceholder('예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등'));
    assert.ok(title < tag && tag < bullet && bullet < overview, JSON.stringify({ title, tag, bullet, overview }));
  }, { seed: hist });

  await test('일지 수정 폼에서도 같은 위치, 이미 달린 태그는 칩으로 보임', async ({ page }) => {
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('작업1');
    await page.waitForTimeout(350);
    await page.locator('[aria-label="일지 수정"]').first().click();
    await page.waitForTimeout(500);
    assert.ok(await form(page).getByRole('button', { name: '태그 A제품 삭제' }).count() === 1);
    assert.ok(await form(page).getByRole('button', { name: '태그 가공정 삭제' }).count() === 1);
  }, { seed: hist });

  console.log('\n[태그 입력: 최근 태그 칩]');

  await test('최근 쓴 태그가 칩으로 항상 보임(입력칸을 누르지 않아도), 많이 쓴 순', async ({ page }) => {
    await newForm(page);
    const n = await recentNames(page);
    assert.strictEqual(n[0], 'A제품', JSON.stringify(n));     // 표기 다른 3개를 합쳐 3회
    assert.strictEqual(n[1], '가공정', JSON.stringify(n));    // 2회
    assert.strictEqual(n[2], '나공정', JSON.stringify(n));    // 1회
  }, { seed: hist });

  await test('표기만 다른 태그(A제품/a제품/A 제품)는 칩 1개, 삭제된 일지의 태그는 안 보임', async ({ page }) => {
    await newForm(page);
    const n = (await recentNames(page)).join('|');
    assert.strictEqual((n.match(/A\s?제품|a제품/g) || []).length, 1, n);
    assert.ok(!n.includes('삭제태그'), n);
  }, { seed: hist });

  await test('칩을 누르면 태그로 추가되고 칩은 제자리에 남아 선택 표시, 저장하면 일지에 태그가 들어감', async ({ page, fake }) => {
    await newForm(page);
    const before = await recentNames(page);
    await recent(page).getByRole('button', { name: /A제품/ }).click();
    await recent(page).getByRole('button', { name: /가공정/ }).click();
    await page.waitForTimeout(200);
    assert.ok(await form(page).getByRole('button', { name: '태그 A제품 삭제' }).count() === 1);
    assert.ok(await form(page).getByRole('button', { name: '태그 가공정 삭제' }).count() === 1);
    assert.deepStrictEqual(await recentNames(page), before, '칩 순서·개수는 그대로여야 함(밀려 올라오지 않음)');
    assert.strictEqual(await recent(page).getByRole('button', { name: /A제품/ }).getAttribute('aria-pressed'), 'true');
    assert.strictEqual(await recent(page).getByRole('button', { name: /나공정/ }).getAttribute('aria-pressed'), 'false');
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('A제품 다공정 모니터링');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await settle(page);
    const e = fake.get('data/entries.json').find(x => x.title === 'A제품 다공정 모니터링');
    assert.deepStrictEqual(e.tags, ['A제품', '가공정']);
  }, { seed: hist });

  await test('선택된 칩을 다시 누르면 태그가 해제됨(칸의 태그 칩도 사라짐)', async ({ page }) => {
    await newForm(page);
    await recent(page).getByRole('button', { name: /A제품/ }).click();
    assert.ok(await form(page).getByRole('button', { name: '태그 A제품 삭제' }).count() === 1);
    await recent(page).getByRole('button', { name: /A제품/ }).click();
    await page.waitForTimeout(200);
    assert.strictEqual(await form(page).getByRole('button', { name: '태그 A제품 삭제' }).count(), 0);
    assert.strictEqual(await recent(page).getByRole('button', { name: /A제품/ }).getAttribute('aria-pressed'), 'false');
  }, { seed: hist });

  await test('실수로 칩을 두 번 연달아 눌러도 옆의 다른 태그가 딸려 오거나 중복 추가되지 않음', async ({ page, fake }) => {
    await newForm(page);
    await recent(page).getByRole('button', { name: /A제품/ }).dblclick({ delay: 10 }).catch(() => {});
    await page.waitForTimeout(250);
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('더블탭 확인');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await settle(page);
    const tags = fake.get('data/entries.json').find(x => x.title === '더블탭 확인').tags;
    assert.ok(!tags.includes('가공정') && !tags.includes('나공정'), '다른 태그가 딸려 옴: ' + JSON.stringify(tags));
    assert.ok(tags.length <= 1, '중복 추가: ' + JSON.stringify(tags));
  }, { seed: hist });

  await test('직접 입력해도 이미 있는 태그와 표기만 다르면(a제품) 중복으로 추가되지 않음', async ({ page }) => {
    await newForm(page);
    await recent(page).getByRole('button', { name: /A제품/ }).click();
    const input = form(page).getByPlaceholder(/A제품|가공정/).or(form(page).locator('input[class*="min-w-[100px]"]')).first();
    await form(page).locator('input[class*="min-w-[100px]"]').first().fill('a제품');
    await form(page).locator('input[class*="min-w-[100px]"]').first().press('Enter');
    await page.waitForTimeout(200);
    assert.strictEqual(await form(page).getByRole('button', { name: /^태그 .* 삭제$/ }).count(), 1);
  }, { seed: hist });

  await test('수정 폼: 이미 달린 태그는 최근 태그 칩에서 선택된 상태로 보임', async ({ page }) => {
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('작업1');
    await page.waitForTimeout(350);
    await page.locator('[aria-label="일지 수정"]').first().click();
    await page.waitForTimeout(500);
    assert.strictEqual(await recent(page).getByRole('button', { name: /A제품/ }).getAttribute('aria-pressed'), 'true');
    assert.strictEqual(await recent(page).getByRole('button', { name: /가공정/ }).getAttribute('aria-pressed'), 'true');
    assert.strictEqual(await recent(page).getByRole('button', { name: /나공정/ }).getAttribute('aria-pressed'), 'false');
  }, { seed: hist });

  await test('태그를 쓴 적이 없으면 최근 태그 영역이 안 보임', async ({ page }) => {
    await newForm(page);
    assert.strictEqual(await recent(page).count(), 0);
  }, { seed: () => { const d = seed(); d['data/entries.json'].forEach(e => { e.tags = []; }); return d; } });

  await test('모든 태그를 골라도 최근 태그 영역은 그대로(모두 선택 표시)', async ({ page }) => {
    await newForm(page);
    for (const l of ['A제품', '가공정', '나공정']) await recent(page).getByRole('button', { name: new RegExp(l) }).click();
    await page.waitForTimeout(200);
    assert.strictEqual(await recent(page).locator('[aria-pressed="true"]').count(), 3);
  }, { seed: hist });

  await test('최근 태그는 최대 8개까지만', async ({ page }) => {
    await newForm(page);
    assert.strictEqual((await recentNames(page)).length, 8);
  }, { seed: () => { const d = seed(); d['data/entries.json'] = Array.from({ length: 12 }, (_, i) => E('x' + i, i + 1, '작업' + i, ['태그' + String(i).padStart(2, '0')])); return d; } });

  await test('최근 일지 30개 안에서만 집계: 31번째 이후 일지의 태그는 제외', async ({ page }) => {
    await newForm(page);
    const n = (await recentNames(page)).join('|');
    assert.ok(n.includes('최근태그') && !n.includes('옛날태그'), n);
  }, { seed: () => { const d = seed(); d['data/entries.json'] = [...Array.from({ length: 30 }, (_, i) => E('r' + i, i + 1, '작업' + i, ['최근태그'])), E('old', 200, '옛날 작업', ['옛날태그', '옛날태그']) ]; return d; } });

  console.log('\n[태그 입력: 기존 입력 방식 유지 / 화면]');

  await test('직접 입력(Enter)과 Backspace 삭제, 자동완성 후보 선택이 그대로 동작', async ({ page, fake }) => {
    await newForm(page);
    const input = form(page).locator('input[class*="min-w-[100px]"]').first();
    await input.fill('새태그'); await input.press('Enter');
    await input.fill('두번째'); await input.press(',');
    assert.ok(await form(page).getByRole('button', { name: '태그 새태그 삭제' }).count() === 1);
    assert.ok(await form(page).getByRole('button', { name: '태그 두번째 삭제' }).count() === 1);
    await input.press('Backspace');
    assert.ok(await form(page).getByRole('button', { name: '태그 두번째 삭제' }).count() === 0, 'Backspace로 마지막 태그 삭제');
    await input.fill('옛');
    await page.waitForTimeout(200);
    await form(page).locator('div.absolute.z-20 button', { hasText: '옛태그' }).first().dispatchEvent('mousedown'); // 자동완성 후보 선택(최근 태그 칩과 이름이 같아도 후보 목록에서 고름)
    await page.waitForTimeout(200);
    assert.ok(await form(page).getByRole('button', { name: '태그 옛태그 삭제' }).count() === 1);
  }, { seed: hist });

  await test('작성 중 임시저장 복원 후에도 태그와 최근 태그 칩이 정상', async ({ page, setDialogAnswer }) => {
    await newForm(page);
    await recent(page).getByRole('button', { name: /A제품/ }).click();
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('임시저장 태그');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    setDialogAnswer(true);
    await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(600);
    assert.ok(await form(page).getByRole('button', { name: '태그 A제품 삭제' }).count() === 1);
    assert.strictEqual(await recent(page).getByRole('button', { name: /A제품/ }).getAttribute('aria-pressed'), 'true');
  }, { seed: hist });

  await test('빠른 기록 → 일지로 정리하기 폼에서도 최근 태그 칩이 보이고 추가됨', async ({ page, fake }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /일지로 정리하기/ }).first().click();
    await page.waitForTimeout(500);
    await recent(page).getByRole('button', { name: /가공정/ }).click();
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('정리한 일지');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await settle(page);
    assert.deepStrictEqual(fake.get('data/entries.json').find(e => e.title === '정리한 일지').tags, ['가공정']);
  }, { seed: hist });

  await test('모바일(390px): 칩 높이 36px 이상, 폼 가로 스크롤 없음, 태그 칸이 첫 화면에 보임', async ({ page }) => {
    await newForm(page);
    const h = await recent(page).getByRole('button').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    assert.ok(h.length >= 3 && h.every(x => x >= 36), JSON.stringify(h));
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    const y = (await form(page).getByPlaceholder('예: A제품, 가공정').boundingBox()).y;
    assert.ok(y < 844, '태그 칸이 스크롤 없이 보여야 함: y=' + y);
  }, { viewport: { width: 390, height: 844 }, seed: hist });

  await test('다크 모드에서도 최근 태그 칩이 보임(글자색 밝음)', async ({ page }) => {
    await newForm(page);
    const c = await recent(page).getByRole('button').first().evaluate(el => getComputedStyle(el).color);
    const m = c.startsWith('oklch') ? parseFloat(c.match(/oklch\(([\d.]+)/)[1]) > 0.55 : c.match(/\d+/g).map(Number)[0] > 120;
    assert.ok(m, c);
  }, { seed: hist, theme: 'dark' });

  summary();
})();
