// 원본 빠른 기록 팝업 / 줄바꿈 / 작성·수정 시각 / 할 일·기억할 것은 연필 아이콘으로만 수정
const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, goTab, settle, seed } = require('./lib');

const search = async (page, q) => { await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill(q); await page.waitForTimeout(400); };
const T = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
const dk = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// 프로젝트A(e1): 원본 빠른 기록 n1 연결 + 여러 줄 본문 + 작성/수정 시각
const rich = () => {
  const d = seed(); const E = d['data/entries.json'], N = d['data/quick-notes.json'];
  const c = T(2026, 9, 28, 14, 32), u = T(2026, 9, 30, 9, 5);
  Object.assign(E[0], { date: dk(c), createdAt: c, updatedAt: u, sourceNoteIds: ['n1'],
    overview: '첫째 줄\n둘째 줄\n셋째 줄', problem: '문제1\n문제2', solution: '해결1\n\n해결3', lesson: '교훈1\n교훈2' });
  Object.assign(N[0], { text: '원본 노트 내용\n두번째 줄', processed: true, linkedEntryId: 'e1' });
  // 프로젝트B: 수정 안 한 일지(작성=수정), 일지 날짜와 작성일이 다름
  const c2 = T(2026, 9, 29, 10, 0);
  Object.assign(E[1], { date: '2026-09-25', createdAt: c2, updatedAt: c2 });
  return d;
};

(async () => {
  console.log('\n[1. 원본 빠른 기록: 탭 이동 없이 팝업]');

  await test('업무일지 탭에서 [원본 빠른 기록 보기] → 업무일지 탭에 머문 채 원본 팝업이 뜸', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트A');
    await page.getByRole('button', { name: /원본 빠른 기록 보기/ }).click();
    await page.waitForTimeout(500);
    assert.ok(await page.locator('text=원본 노트 내용').count() >= 1, '원본 내용이 보여야 함');
    // 업무일지 탭 요소가 그대로 있어야 함(빠른 기록 탭으로 안 넘어감)
    assert.ok(await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').isVisible());
    assert.strictEqual(await page.getByPlaceholder('보고 들은 걸 바로 적어두세요…').count(), 0, '빠른 기록 탭으로 이동하면 안 됨');
  }, { seed: rich });

  await test('팝업을 닫으면 원래 보던 업무일지 화면(검색어 포함) 그대로', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트A');
    await page.getByRole('button', { name: /원본 빠른 기록 보기/ }).click();
    await page.getByRole('button', { name: '닫기' }).first().click();
    await page.waitForTimeout(400);
    assert.strictEqual(await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').inputValue(), '프로젝트A');
    assert.strictEqual(await page.locator('text=원본 노트 내용').count(), 0);
  }, { seed: rich });

  await test('팝업에서 수정 아이콘 → 빠른 기록 수정창이 같은 탭 위에 열림', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트A');
    await page.getByRole('button', { name: /원본 빠른 기록 보기/ }).click();
    await page.locator('[aria-label="빠른 기록 수정"]').first().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByRole('button', { name: '수정 저장' }).count() === 1);
    assert.ok(await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').count() === 1, '업무일지 탭 유지');
  }, { seed: rich });

  await test('일지 미리보기(달력/타임라인) 안의 [원본 보기]도 탭 이동 없이 동작', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '프로젝트별' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '프로젝트A', exact: true }).click(); // 프로젝트 칩 선택 → 타임라인
    await page.waitForTimeout(400);
    await page.locator('button.text-left').first().click(); // 타임라인 카드 → 일지 미리보기 팝업
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /원본 빠른 기록 보기/ }).last().click(); // 팝업 안의 버튼(뒤쪽 목록에도 같은 버튼이 있음)
    await page.waitForTimeout(500);
    assert.ok(await page.locator('text=원본 노트 내용').count() >= 1);
    assert.strictEqual(await page.getByPlaceholder('보고 들은 걸 바로 적어두세요…').count(), 0);
  }, { seed: rich });

  await test('원본이 삭제됐으면 탭 이동 없이 안내 문구만 뜸', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트A');
    await page.getByRole('button', { name: /원본 빠른 기록 보기/ }).click();
    await page.waitForTimeout(500);
    assert.ok(await page.locator('text=원본 빠른 기록을 찾을 수 없어요').count() >= 1);
    assert.ok(await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').isVisible());
  }, { seed: () => { const d = rich(); d['data/quick-notes.json'] = d['data/quick-notes.json'].filter(n => n.id !== 'n1'); return d; } });

  await test('빠른 기록 탭 → [일지로 정리됨 · 보기] → 일지 팝업 → [원본 보기]: 일지 탭에서 원본 팝업이 뜸', async ({ page }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /정리됨 \d+건/ }).click(); // 정리된 기록은 접혀 있음
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /일지로 정리됨 · 보기/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /원본 빠른 기록 보기/ }).last().click(); // 팝업 안의 버튼
    await page.waitForTimeout(500);
    assert.ok(await page.locator('text=원본 노트 내용').count() >= 1);
  }, { seed: rich });

  console.log('\n[2. 줄바꿈]');

  await test('개요/문제/해결/배운 점의 줄바꿈이 화면에서 줄로 나뉘어 보임(펼친 상태)', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트A');
    await page.getByRole('button', { name: '더보기' }).first().click();
    await page.waitForTimeout(300);
    const ov = page.locator('p', { hasText: '첫째 줄' }).first();
    const lines = await ov.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; });
    assert.ok(lines >= 3, '개요가 3줄로 보여야 함: ' + lines);
    for (const w of ['문제1', '해결1', '해결3', '교훈1', '교훈2']) assert.ok(await page.locator('text=' + w).count() >= 1, w);
    assert.strictEqual(await page.evaluate(() => getComputedStyle([...document.querySelectorAll('p')].find(p => p.textContent.includes('교훈1'))).whiteSpace), 'pre-wrap');
  }, { seed: rich });

  await test('접힌 상태에서도 2줄까지만 보이고, 3줄 이상(짧은 줄들)이면 [더보기]가 나타남', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트A');
    assert.ok(await page.getByRole('button', { name: '더보기' }).count() >= 1, '줄바꿈 3줄이라 더보기가 필요');
    const h = await page.locator('p', { hasText: '첫째 줄' }).first().evaluate(el => el.getBoundingClientRect().height);
    assert.ok(h < 3 * 22, '접힌 상태는 2줄 높이여야 함: ' + h);
  }, { seed: rich });

  await test('글자 수는 짧고 줄바꿈도 2줄 이하면 [더보기] 없음(불필요한 버튼 없음)', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트C');
    assert.strictEqual(await page.getByRole('button', { name: '더보기' }).count(), 0);
  }, { seed: () => { const d = seed(); Object.assign(d['data/entries.json'][2], { overview: '짧은 줄1\n짧은 줄2' }); return d; } });

  await test('줄바꿈이 있어도 검색어 표시(주황)와 강조(==)가 정상', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '둘째');
    assert.strictEqual(await page.locator('mark').count(), 1);
    assert.ok(!(await page.locator('body').innerText()).includes('=='));
  }, { seed: () => { const d = rich(); d['data/entries.json'][0].overview = '첫째 줄\n==둘째 줄==\n셋째 줄'; return d; } });

  console.log('\n[3. 작성·수정 시각]');

  await test('일지: 일지 날짜와 같은 날 작성이면 시간 표시 + 수정 일시 표시', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트A');
    const t = await page.getByTestId('entry-stamp').first().innerText();
    assert.ok(t.includes('2026.09.28') && t.includes('14:32'), t);
    assert.ok(/수정 09\.30 09:05/.test(t), t);
  }, { seed: rich });

  await test('일지: 수정한 적 없으면 "수정" 표시가 없음', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트B');
    const t = await page.getByTestId('entry-stamp').first().innerText();
    assert.ok(!t.includes('수정'), t);
  }, { seed: rich });

  await test('일지: 일지 날짜와 작성일이 다르면(나중에 몰아 쓴 경우) 작성 일시를 날짜까지 표시', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트B');
    const t = await page.getByTestId('entry-stamp').first().innerText();
    assert.ok(t.includes('2026.09.25') && /작성 09\.29 10:00/.test(t), t);
  }, { seed: rich });

  await test('일지를 실제로 수정·저장하면 "수정 …" 일시가 붙음(새로 만든 직후엔 없음)', async ({ page, fake }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '새 일지 작성' }).click();
    await page.getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('시각확인용');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await settle(page);
    await search(page, '시각확인용');
    let t = await page.getByTestId('entry-stamp').first().innerText();
    assert.ok(!t.includes('수정'), '새로 만든 직후엔 수정 표시 없음: ' + t);
    assert.ok(/\d\d:\d\d/.test(t), '작성 시간이 보여야 함: ' + t);
    await page.waitForTimeout(1100); // updatedAt이 달라지도록
    await page.locator('[aria-label="일지 수정"]').first().click();
    await page.getByPlaceholder('예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등').fill('고쳤음');
    await page.getByRole('button', { name: '수정 저장' }).click();
    await settle(page);
    t = await page.getByTestId('entry-stamp').first().innerText();
    assert.ok(/수정 \d\d\.\d\d \d\d:\d\d/.test(t), t);
  });

  await test('일지에 createdAt이 없는 오래된 데이터도 오류 없이 날짜만 표시', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '프로젝트D');
    const t = await page.getByTestId('entry-stamp').first().innerText();
    assert.ok(/\d{4}\.\d\d\.\d\d/.test(t) && !t.includes('수정') && !t.includes('NaN') && !t.includes('Invalid'), t);
  }, { seed: () => { const d = seed(); delete d['data/entries.json'][3].createdAt; delete d['data/entries.json'][3].updatedAt; return d; } });

  await test('빠른 기록: 작성 일시 + (수정했으면) 수정 일시, 안 했으면 수정 표시 없음', async ({ page }) => {
    await gotoQuick(page);
    const stamps = await page.getByTestId('note-stamp').allInnerTexts();
    assert.ok(stamps.length >= 2);
    assert.ok(stamps.some(t => t.includes('09.30 09:05') && t.includes('수정')), JSON.stringify(stamps));
    assert.ok(stamps.some(t => !t.includes('수정')), JSON.stringify(stamps));
    assert.ok(stamps.every(t => /\d\d:\d\d/.test(t)));
  }, { seed: () => { const d = seed(); Object.assign(d['data/quick-notes.json'][0], { createdAt: T(2026, 9, 29, 8, 0), updatedAt: T(2026, 9, 30, 9, 5), processed: false }); return d; } });

  await test('할 일: 작성 일시, 수정했으면 수정 일시도 표시', async ({ page }) => {
    await gotoTodos(page);
    const s = await page.getByTestId('todo-stamp').allInnerTexts();
    assert.ok(s.some(t => t.includes('작성 09.29 08:00') && t.includes('수정 09.30 09:05')), JSON.stringify(s));
    assert.ok(s.some(t => t.includes('작성') && !t.includes('수정')), JSON.stringify(s));
  }, { seed: () => { const d = seed(); const t = d['data/todos.json']; Object.assign(t[0], { createdAt: T(2026, 9, 29, 8, 0), updatedAt: T(2026, 9, 30, 9, 5) }); Object.assign(t[1], { createdAt: T(2026, 9, 29, 8, 1), updatedAt: T(2026, 9, 29, 8, 1) }); return d; } });

  await test('기억할 것(메모): 작성/수정 일시 표시', async ({ page }) => {
    await gotoTodos(page);
    await page.getByRole('button', { name: /기억할 것/ }).click();
    await page.waitForTimeout(400);
    const s = await page.getByTestId('memo-stamp').allInnerTexts();
    assert.ok(s.some(t => t.includes('작성 09.29 08:00') && t.includes('수정 09.30 09:05')), JSON.stringify(s));
  }, { seed: () => { const d = seed(); d['data/memos.json'] = [{ id: 'm1', text: '기억할 메모', tags: [], createdAt: T(2026, 9, 29, 8, 0), updatedAt: T(2026, 9, 30, 9, 5) }]; return d; } });

  await test('작년 기록은 연도까지 표시', async ({ page }) => {
    await gotoTodos(page);
    const s = await page.getByTestId('todo-stamp').allInnerTexts();
    assert.ok(s.some(t => /작성 2025\.12\.31 23:59/.test(t)), JSON.stringify(s));
  }, { seed: () => { const d = seed(); Object.assign(d['data/todos.json'][0], { createdAt: T(2025, 12, 31, 23, 59), updatedAt: T(2025, 12, 31, 23, 59) }); return d; } });

  await test('모바일(390px): 작성·수정 시각이 길어도 카드가 화면 밖으로 넘치지 않음(일지/빠른기록/할 일)', async ({ page }) => {
    for (const go of [gotoEntries, gotoQuick, gotoTodos]) {
      await go(page);
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 0, '가로 스크롤 ' + over);
    }
  }, { viewport: { width: 390, height: 844 }, seed: () => { const d = rich(); d['data/quick-notes.json'][1].updatedAt = T(2025, 12, 31, 23, 59); d['data/quick-notes.json'][1].createdAt = T(2025, 1, 1, 0, 1); d['data/todos.json'][0].createdAt = T(2025, 12, 31, 23, 58); d['data/todos.json'][0].updatedAt = T(2025, 12, 31, 23, 59); return d; } });

  console.log('\n[4. 할 일/기억할 것: 텍스트 눌러도 수정 안 됨, 연필 아이콘만]');

  await test('할 일 텍스트를 눌러도 수정 모드로 안 넘어감', async ({ page }) => {
    await gotoTodos(page);
    await page.locator('text=할일 하나').first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('[aria-label="할 일 수정 저장"]').count(), 0);
  });

  await test('할 일 연필 아이콘을 누르면 수정되고 저장이 서버에 반영됨', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.locator('[aria-label="할 일 수정"]').first().click();
    await page.waitForTimeout(300);
    const inp = page.locator('input').filter({ hasNot: page.locator('[type=date]') }).locator('visible=true');
    const edit = page.locator('[aria-label="할 일 수정 저장"]');
    assert.strictEqual(await edit.count(), 1);
    const box = page.locator('input[autofocus], input:focus').first();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('수정된 할일');
    await edit.click();
    await settle(page);
    assert.ok(fake.get('data/todos.json').some(t => t.text === '수정된 할일'));
  });

  await test('할 일 텍스트 커서가 손가락(pointer) 모양이 아님(눌러도 안 되는 걸 암시하지 않음)', async ({ page }) => {
    await gotoTodos(page);
    const cur = await page.locator('text=할일 하나').first().evaluate(el => getComputedStyle(el).cursor);
    assert.notStrictEqual(cur, 'pointer');
  });

  await test('기억할 것 텍스트를 눌러도 수정 안 됨, 연필 아이콘으로는 수정됨', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.getByRole('button', { name: /기억할 것/ }).click();
    await page.waitForTimeout(400);
    await page.locator('text=기억할 메모').first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('[aria-label="기억할 것 수정 저장"]').count(), 0);
    await page.locator('[aria-label="기억할 것 수정"]').first().click();
    assert.strictEqual(await page.locator('[aria-label="기억할 것 수정 저장"]').count(), 1);
  }, { seed: () => { const d = seed(); d['data/memos.json'] = [{ id: 'm1', text: '기억할 메모', tags: [], createdAt: 1, updatedAt: 1 }]; return d; } });

  await test('할 일 선택 모드에서는 텍스트 눌러도 선택만 되고 수정으로 안 넘어감(기존 동작 유지)', async ({ page }) => {
    await gotoTodos(page);
    await page.getByRole('button', { name: '선택', exact: true }).click();
    await page.getByRole('checkbox', { name: '할일 하나 선택' }).click();
    assert.strictEqual(await page.locator('[aria-label="할 일 수정 저장"]').count(), 0);
  });

  summary();
})();
