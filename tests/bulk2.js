// 추가 엣지 케이스: 연속 작업, 느린 네트워크, 화면 전환 중 저장, 커스텀 카테고리, 빈 결과 등
const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, settle } = require('./lib');
const { seed } = require('./seed');
const bar = page => page.getByRole('toolbar', { name: '일괄 작업' });
const startSelect = page => page.getByRole('button', { name: '선택', exact: true }).click();
const pick = (page, label) => page.getByRole('checkbox', { name: label });
const barBtn = (page, name) => bar(page).getByRole('button', { name });
const selectedText = async page => (await bar(page).locator('[aria-live]').innerText()).trim();

(async () => {
  console.log('\n[엣지 케이스]');

  await test('연속 일괄 작업 2번: 두 번째도 오래된 sha를 쓰지 않음(409 없이 저장), 결과 모두 반영', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pick(page, '프로젝트A 선택').click();
    await barBtn(page, '즐겨찾기').click();
    await settle(page);
    await startSelect(page);
    await pick(page, '프로젝트C 선택').click();
    await bar(page).locator('select[aria-label="카테고리 변경"]').selectOption('기타');
    await settle(page);
    const saved = fake.get('data/entries.json');
    assert.strictEqual(saved.find(e => e.id === 'e1').favorite, true);
    assert.strictEqual(saved.find(e => e.id === 'e3').category, '기타');
    assert.strictEqual(fake.puts.length, 2);
    assert.strictEqual(fake.conflicts, 0, '오래된 sha로 저장을 시도해 충돌이 났음');
  });

  await test('저장 중(느린 네트워크)에는 버튼/닫기/전체선택이 잠기고, 끝나면 정상 종료', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pick(page, '프로젝트A 선택').click();
    fake.delayMs = 1500;
    await barBtn(page, '휴지통으로').click();
    await page.waitForTimeout(300);
    assert.ok(await barBtn(page, '휴지통으로').isDisabled(), '저장 중 삭제 버튼 잠김');
    assert.ok(await barBtn(page, '선택 모드 종료').isDisabled(), '저장 중 닫기 잠김');
    assert.ok(await barBtn(page, '전체 선택').isDisabled(), '저장 중 전체선택 잠김');
    await page.waitForTimeout(2200);
    assert.strictEqual(await bar(page).count(), 0);
    assert.strictEqual(fake.puts.length, 1);
  });

  await test('저장 중에 다른 탭으로 이동해도 오류 없이 저장 완료', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pick(page, '프로젝트A 선택').click();
    fake.delayMs = 1200;
    await barBtn(page, '휴지통으로').click();
    await page.waitForTimeout(200);
    await gotoTodos(page);
    await page.waitForTimeout(2200);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 2);
    await gotoEntries(page);
    assert.strictEqual(await page.locator('text=프로젝트A').count(), 0);
  });

  await test('검색 결과가 0건이 되면 선택은 0, 전체 선택/작업 버튼 비활성', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    await barBtn(page, '전체 선택').click();
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('없는단어없는단어');
    await settle(page);
    assert.strictEqual(await selectedText(page), '항목을 선택하세요');
    assert.ok(await barBtn(page, '전체 선택').isDisabled());
    assert.ok(await barBtn(page, '휴지통으로').isDisabled());
  });

  await test('사용자가 만든 카테고리도 일괄 변경 목록에 나오고 적용됨', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pick(page, '프로젝트A 선택').click();
    const opts = await bar(page).locator('select[aria-label="카테고리 변경"] option').allInnerTexts();
    assert.ok(opts.includes('내카테고리'), '커스텀 카테고리 표시: ' + opts);
    await bar(page).locator('select[aria-label="카테고리 변경"]').selectOption({ label: '내카테고리' });
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').category, '내카테고리');
  }, { seed: () => { const s = seed(); s['data/categories.json'] = [{ label: '내카테고리', color: '#45C4B0' }]; return s; } });

  await test('할 일 일괄 삭제 두 번 연속(4.5초 안에): 각각 독립적으로 처리되어 최종 결과 정확', async ({ page, fake }) => {
    await gotoTodos(page);
    await startSelect(page);
    await pick(page, '할일 하나 선택').click();
    await barBtn(page, '삭제').click();
    await page.waitForTimeout(500);
    await startSelect(page);
    await pick(page, '할일 둘 선택').click();
    await barBtn(page, '삭제').click();
    await page.waitForTimeout(6000);
    assert.deepStrictEqual(fake.get('data/todos.json').map(t => t.id), ['t3']);
    assert.strictEqual(await page.locator('text=할일 하나').count() + await page.locator('text=할일 둘').count(), 0);
  });

  await test('할 일 일괄 삭제 후 새로고침(서버 데이터 재로딩)해도 삭제 대기 중인 항목은 되살아나지 않음', async ({ page, fake }) => {
    await gotoTodos(page);
    await startSelect(page);
    await barBtn(page, '전체 선택').click();
    await barBtn(page, '삭제').click();
    await page.waitForTimeout(400);
    await page.locator('button[aria-label="새로고침"]').first().click();
    await page.waitForTimeout(800);
    assert.strictEqual(await page.locator('text=할일 하나').count(), 0, '삭제 대기 중인 항목이 새로고침으로 다시 보임');
    await page.waitForTimeout(5000);
    assert.strictEqual(fake.get('data/todos.json').length, 1);
  });

  await test('빠른 기록: 보관 레포 기록은 제외, 활성 기록만 일괄 삭제', async ({ page, fake }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /보관된 레포의 지난 기록도 함께 보기/ }).click();
    await page.waitForTimeout(1200);
    assert.ok(await page.locator('text=보관메모').count() >= 1);
    await startSelect(page);
    assert.strictEqual(await page.getByRole('checkbox').count(), 2);
    assert.ok(await page.locator('text=보관 레포 기록 1건은 선택할 수 없어요').count() >= 1);
    await barBtn(page, '전체 선택').click();
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.ok(fake.puts.every(p => p.repo === 'r'));
    assert.strictEqual(fake.get('data/quick-notes.json', 'r-old').filter(n => n.deleted).length, 0);
  }, {
    cfg: { archives: [{ owner: 'o', repo: 'r-old', branch: 'main', label: '옛날', archivedAt: 1 }] },
    extraRepos: { 'r-old': { 'data/entries.json': [], 'data/quick-notes.json': [{ id: 'an1', text: '보관메모', imageRefs: [], processed: false, createdAt: 5, updatedAt: 5 }] } },
  });

  await test('선택 모드 진입 전후 화면 구조가 같음: 비선택 상태에서 체크박스/바/inert가 전혀 없음', async ({ page }) => {
    await gotoEntries(page);
    assert.strictEqual(await page.getByRole('checkbox').count(), 0);
    assert.strictEqual(await page.locator('[inert]').count(), 0);
    assert.strictEqual(await bar(page).count(), 0);
    await startSelect(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('[inert]').count(), 0, '종료 후 inert가 남으면 카드가 영영 안 눌림');
    assert.ok(await page.locator('[aria-label="일지 삭제"]').first().isVisible(), '종료 후 카드 버튼이 다시 보여야 함');
  });

  await test('선택 모드 종료 후 카드의 즐겨찾기/삭제 버튼이 다시 정상 동작', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('[aria-label="즐겨찾기"]').first().click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.favorite).length, 2);
  });

  await test('하이라이트/모아보기 화면에는 "선택" 버튼이 없음(목록 보기에서만 제공)', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '하이라이트' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 0);
    await page.getByRole('button', { name: '모아보기' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 0);
  });

  summary();
})();
