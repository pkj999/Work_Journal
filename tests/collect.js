// 모아보기(프로젝트·태그로 날짜와 무관하게 모아서 날짜순으로 보기) 테스트
const { test, summary, assert, gotoEntries, settle, seed } = require('./lib');

const day = 86400000, now = Date.now();
const iso = d => new Date(d).toISOString().slice(0, 10);
const E = (id, daysAgo, title, tags, extra = {}) => ({
  id, date: iso(now - daysAgo * day), title, category: '개발', importance: '중', bullets: [`${id} 한 일`], overview: '', problem: '', solution: '', lesson: '',
  tags, links: [], images: [], createdAt: now - daysAgo * day, updatedAt: now - daysAgo * day, ...extra,
});
// A제품이 여러 날에 걸쳐 가·나·다 공정으로 진행되는 시나리오 (+ 표기가 다른 태그, 다른 제품, 삭제된 일지)
const scenario = () => {
  const d = seed();
  d['data/entries.json'] = [
    E('p1', 10, 'A제품 공정 모니터링', ['A제품', '가공정', '나공정'], { bullets: ['가·나 공정 모니터링', '온도 이상 없음'], overview: '첫째 줄\n둘째 줄' }),
    E('p2', 7, 'A제품 공정 모니터링', ['a제품', '다공정']),            // 소문자 표기
    E('p3', 5, '다공정 이슈 대응', ['A 제품', '다공정', '라공정']),    // 띄어쓰기 표기 + 제목이 다름
    E('p4', 3, 'B제품 점검', ['B제품', '가공정']),
    E('p5', 1, 'A제품 최종 확인', ['A제품', '라공정']),
    E('p6', 2, 'A제품 삭제됨', ['A제품'], { deleted: true, deletedAt: now - day }),
    E('p7', 0, '태그 없는 일', []),
  ];
  return d;
};
const open = async page => { await gotoEntries(page); await page.getByRole('button', { name: '모아보기' }).click(); await page.waitForTimeout(400); };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 프로젝트 칩과 태그 칩은 이름이 겹칠 수 있어서(예: 프로젝트 "다공정 이슈 대응" / 태그 "다공정") 그룹(프로젝트/태그) 안에서 찾음
const projChip = (page, label) => page.getByRole('group', { name: '프로젝트' }).getByRole('button', { name: new RegExp('^' + esc(label) + '\\s+\\d+$') });
const tagChip = (page, label) => page.getByRole('group', { name: '태그' }).getByRole('button', { name: new RegExp('^' + esc(label) + '\\s+\\d+$') });
const cards = page => page.getByTestId('timeline-card');
const cardTexts = async page => (await cards(page).allInnerTexts()).map(t => t.replace(/\s+/g, ' '));

(async () => {
  console.log('\n[모아보기: 기본 동작]');

  await test('처음 열면 아무것도 선택되지 않고 안내 문구 + 프로젝트·태그 칩이 보임', async ({ page }) => {
    await open(page);
    assert.strictEqual(await cards(page).count(), 0);
    assert.ok(await page.locator('text=위에서 프로젝트나 태그를 고르면').count() >= 1);
    assert.ok(await projChip(page, 'A제품 공정 모니터링').count() === 1);
    assert.ok(await tagChip(page, '가공정').count() === 1);
    assert.strictEqual(await page.locator('[aria-pressed="true"]').count(), 0);
  }, { seed: scenario });

  await test('프로젝트 칩 선택 → 같은 업무명의 일지만 날짜순(오래된 것 위), 다시 누르면 해제', async ({ page }) => {
    await open(page);
    await projChip(page, 'A제품 공정 모니터링').click();
    await page.waitForTimeout(300);
    const t = await cardTexts(page);
    assert.strictEqual(t.length, 2, JSON.stringify(t));
    assert.ok(t[0].includes('p1 한 일') || t[0].includes('가·나 공정 모니터링'));
    assert.ok(await projChip(page, 'A제품 공정 모니터링').getAttribute('aria-pressed') === 'true');
    await projChip(page, 'A제품 공정 모니터링').click();
    await page.waitForTimeout(300);
    assert.strictEqual(await cards(page).count(), 0);
  }, { seed: scenario });

  await test('태그 칩 선택 → 제목이 달라도 그 태그가 달린 일지를 날짜순으로 모음, 업무명(제목)도 카드에 표시', async ({ page }) => {
    await open(page);
    await tagChip(page, '다공정').click();
    await page.waitForTimeout(300);
    const t = await cardTexts(page);
    assert.strictEqual(t.length, 2, JSON.stringify(t));
    assert.ok(t[0].includes('A제품 공정 모니터링') && t[1].includes('다공정 이슈 대응'), '날짜순(7일 전 → 5일 전) + 제목 표시: ' + JSON.stringify(t));
  }, { seed: scenario });

  await test('표기만 다른 태그(A제품 / a제품 / A 제품)는 칩 1개로 합쳐지고 개수 합산, 선택하면 모두 포함', async ({ page }) => {
    await open(page);
    const variants = page.getByRole('group', { name: '태그' }).getByRole('button', { name: /^(A제품|a제품|A 제품)\s+\d+$/ });
    assert.strictEqual(await variants.count(), 1, JSON.stringify(await variants.allInnerTexts()));
    assert.ok(/^A제품\s+4$/.test((await variants.first().innerText()).replace(/\s+/g, ' ').trim()), '가장 많이 쓴 표기 "A제품", 삭제된 일지는 제외한 4건');
    await variants.first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await cards(page).count(), 4);
  }, { seed: scenario });

  await test('태그 여러 개 선택 = 모두 달린 일지만(A제품 + 라공정 → 2건), 하나 더 고르면 더 좁혀짐', async ({ page }) => {
    await open(page);
    await tagChip(page, 'A제품').click();
    await tagChip(page, '라공정').click();
    await page.waitForTimeout(300);
    assert.strictEqual(await cards(page).count(), 2);
    await tagChip(page, '다공정').click();
    await page.waitForTimeout(300);
    const t = await cardTexts(page);
    assert.strictEqual(t.length, 1, JSON.stringify(t));
    assert.ok(t[0].includes('다공정 이슈 대응'));
  }, { seed: scenario });

  await test('조건에 맞는 일지가 없으면 안내 문구, [모두 해제]로 초기화', async ({ page }) => {
    await open(page);
    await tagChip(page, 'B제품').click();
    await tagChip(page, '나공정').click();
    await page.waitForTimeout(300);
    assert.strictEqual(await cards(page).count(), 0);
    assert.ok(await page.locator('text=조건에 모두 맞는 일지가 없어요').count() >= 1);
    await page.getByRole('button', { name: '모두 해제' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('[aria-pressed="true"]').count(), 0);
    assert.ok(await page.locator('text=위에서 프로젝트나 태그를 고르면').count() >= 1);
  }, { seed: scenario });

  await test('프로젝트 + 태그를 같이 고르면 둘 다 맞는 일지만', async ({ page }) => {
    await open(page);
    await projChip(page, 'A제품 공정 모니터링').click();
    await tagChip(page, '다공정').click();
    await page.waitForTimeout(300);
    const t = await cardTexts(page);
    assert.strictEqual(t.length, 1, JSON.stringify(t));
  }, { seed: scenario });

  await test('결과 줄: "시작 날짜 → 끝 날짜 · N건", 휴지통의 일지는 제외', async ({ page }) => {
    await open(page);
    await tagChip(page, 'A제품').click();
    await page.waitForTimeout(300);
    const body = await page.evaluate(() => document.body.innerText);
    assert.ok(/\d{4}\.\d{2}\.\d{2} \([월화수목금토일]\) → \d{4}\.\d{2}\.\d{2} \([월화수목금토일]\) · 4건/.test(body), body.slice(0, 500));
  }, { seed: scenario });

  console.log('\n[모아보기: 카드 내용]');

  await test('타임라인 카드에 한 일(불릿)·개요(줄바꿈 유지)·태그가 보임', async ({ page }) => {
    await open(page);
    await tagChip(page, '가공정').click();
    await page.waitForTimeout(300);
    const first = cards(page).first();
    const t = (await first.innerText());
    assert.ok(t.includes('가·나 공정 모니터링') && t.includes('온도 이상 없음'), t);
    assert.ok(t.includes('첫째 줄') && t.includes('둘째 줄'));
    assert.ok(t.includes('A제품') && t.includes('나공정'), '태그 칩: ' + t);
    const ws = await first.locator('p', { hasText: '첫째 줄' }).evaluate(el => getComputedStyle(el).whiteSpace);
    assert.strictEqual(ws, 'pre-wrap');
  }, { seed: scenario });

  await test('불릿이 4개 이상이면 3개만 보이고 "외 N개"', async ({ page }) => {
    await open(page);
    await tagChip(page, '가공정').click();
    await page.waitForTimeout(300);
    const t = (await cards(page).first().innerText());
    assert.ok(t.includes('외 2개'), t);
  }, { seed: () => { const d = scenario(); d['data/entries.json'][0].bullets = ['하나', '둘', '셋', '넷', '다섯']; return d; } });

  await test('카드를 누르면 일지 미리보기, 거기서 수정·저장하면 타임라인에 반영', async ({ page, fake }) => {
    await open(page);
    await tagChip(page, '가공정').click();
    await page.waitForTimeout(300);
    await cards(page).first().click();
    await page.waitForTimeout(500);
    await page.locator('[aria-label="일지 수정"]').last().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('A제품 이름 바꿈');
    await page.getByRole('button', { name: '수정 저장' }).click();
    await settle(page);
    assert.ok(fake.get('data/entries.json').some(e => e.title === 'A제품 이름 바꿈'));
    assert.ok((await cardTexts(page)).some(t => t.includes('A제품 이름 바꿈')));
  }, { seed: scenario });

  console.log('\n[모아보기: 데이터가 바뀔 때]');

  await test('선택한 태그의 일지를 모두 삭제하면 선택이 자동으로 풀리고 칩도 사라짐(안 보이는 조건이 남지 않음)', async ({ page }) => {
    await open(page);
    await tagChip(page, '라공정').click();
    await page.waitForTimeout(300);
    assert.strictEqual(await cards(page).count(), 2);
    // 목록에서 두 일지를 삭제
    await page.getByRole('button', { name: '목록' }).first().click();
    for (const title of ['다공정 이슈 대응', 'A제품 최종 확인']) {
      await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill(title);
      await page.waitForTimeout(350);
      await page.locator('[aria-label="일지 삭제"]').first().click();
      await settle(page);
    }
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('');
    await page.getByRole('button', { name: '모아보기' }).click();
    await page.waitForTimeout(400);
    assert.strictEqual(await tagChip(page, '라공정').count(), 0, '일지가 없는 태그 칩은 사라져야 함');
    assert.strictEqual(await page.locator('[aria-pressed="true"]').count(), 0, '선택도 풀려야 함');
    assert.ok(await page.locator('text=위에서 프로젝트나 태그를 고르면').count() >= 1);
  }, { seed: scenario });

  await test('일지 삭제 후 실행취소하면 모아보기에 다시 나타남(개수도 복구)', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '목록' }).first().click();
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('A제품 최종 확인');
    await page.waitForTimeout(350);
    await page.locator('[aria-label="일지 삭제"]').first().click();
    await settle(page);
    await page.getByRole('button', { name: '실행취소' }).click();
    await settle(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('');
    await page.getByRole('button', { name: '모아보기' }).click();
    await page.waitForTimeout(400);
    assert.ok(await tagChip(page, 'A제품').count() === 1);
  }, { seed: scenario });

  await test('태그가 하나도 없는 일지뿐이면 태그 영역은 숨기고 프로젝트 칩만 보임', async ({ page }) => {
    await open(page);
    assert.strictEqual(await page.locator('text=여러 개 고르면 모두 달린 기록만').count(), 0);
    assert.ok(await projChip(page, '프로젝트A').count() === 1);
  }, { seed: () => { const d = seed(); d['data/entries.json'].forEach(e => { e.tags = []; }); return d; } });

  await test('일지가 하나도 없으면 "아직 모아볼 일지가 없어요."', async ({ page }) => {
    await open(page);
    assert.ok(await page.locator('text=아직 모아볼 일지가 없어요.').count() >= 1);
  }, { seed: () => { const d = seed(); d['data/entries.json'] = []; return d; } });

  console.log('\n[모아보기: 태그가 아주 많을 때 / 화면 크기]');

  const many = () => {
    const d = seed(); const tags = Array.from({ length: 30 }, (_, i) => `태그${String(i).padStart(2, '0')}`);
    d['data/entries.json'] = tags.map((t, i) => E('m' + i, 30 - i, '많은 태그 ' + i, [t, '공통'], { updatedAt: now - i }));
    return d;
  };
  await test('태그가 17개 이상이면 16개만 먼저 보이고 [N개 더 보기]로 펼침/접음', async ({ page }) => {
    await open(page);
    const before = await page.locator('button[aria-pressed]').count();
    assert.ok(await page.getByRole('button', { name: /태그 \d+개 더 보기/ }).count() === 1);
    await page.getByRole('button', { name: /태그 \d+개 더 보기/ }).click();
    const after = await page.locator('button[aria-pressed]').count();
    assert.ok(after > before, `${before} → ${after}`);
    await page.getByRole('button', { name: '태그 접기' }).click();
    assert.strictEqual(await page.locator('button[aria-pressed]').count(), before);
  }, { seed: many });

  await test('접힌 상태에서도 고른 태그는 계속 보이고 해제할 수 있음', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /태그 \d+개 더 보기/ }).click();
    await tagChip(page, '태그29').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '태그 접기' }).click();
    assert.ok(await tagChip(page, '태그29').count() === 1, '접어도 선택한 태그 칩은 보여야 함');
    assert.strictEqual(await tagChip(page, '태그29').getAttribute('aria-pressed'), 'true');
  }, { seed: many });

  await test('모바일(390px): 칩 높이 36px 이상, 가로 스크롤 없음, 카드가 화면 안에 들어옴', async ({ page }) => {
    await open(page);
    await tagChip(page, '가공정').click();
    await page.waitForTimeout(300);
    const h = await page.locator('button[aria-pressed]').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    assert.ok(h.length >= 5 && h.every(x => x >= 36), JSON.stringify(h));
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    const box = await cards(page).first().boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  }, { viewport: { width: 390, height: 844 }, seed: scenario });

  await test('다크 모드: 선택한 칩과 선택 안 한 칩이 모두 읽힘(글자색 밝음/어두움 구분)', async ({ page }) => {
    await open(page);
    await tagChip(page, '가공정').click();
    await page.waitForTimeout(300);
    const sel = await tagChip(page, '가공정').evaluate(el => getComputedStyle(el).backgroundColor);
    const un = await tagChip(page, '나공정').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notStrictEqual(sel, un, '선택 상태가 색으로 구분돼야 함');
  }, { seed: scenario, theme: 'dark' });

  await test('목록 보기의 "전체 태그" 필터도 표기가 다른 태그를 하나로 보고 모두 찾아줌', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: /필터/ }).first().click();
    const opts = await page.locator('select option').allInnerTexts();
    const a = opts.filter(o => /^(A제품|a제품|A 제품)$/.test(o.trim()));
    assert.strictEqual(a.length, 1, JSON.stringify(opts));
    await page.locator('select').nth(3).selectOption({ label: a[0].trim() });
    await page.waitForTimeout(400);
    assert.ok((await page.locator('text=4건 표시 중').count()) >= 1, '표기가 다른 일지까지 4건');
  }, { seed: scenario });

  summary();
})();
