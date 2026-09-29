// 기존(변경 전) 동작이 그대로 유지되는지 확인하는 회귀 테스트
const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, settle } = require('./lib');

(async () => {
  console.log('기본 동작 회귀 테스트');

  await test('일지 목록: 삭제(휴지통) 항목은 안 보이고 나머지 4건이 보임', async ({ page }) => {
    await gotoEntries(page);
    assert.strictEqual(await page.locator('text=프로젝트A').count(), 1);
    assert.strictEqual(await page.locator('text=삭제된일지').count(), 0);
    assert.ok(await page.locator('text=4건 표시 중').count() >= 1);
  });

  await test('검색: 개요에만 있는 단어로 찾을 수 있음(이전 버그 회귀)', async ({ page }) => {
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('zebra');
    await settle(page);
    assert.ok(await page.locator('text=1건 표시 중').count() >= 1);
    assert.strictEqual(await page.locator('text=프로젝트A').count(), 1);
    assert.strictEqual(await page.locator('text=프로젝트B').count(), 0);
  });

  await test('일지 단건 삭제: 확인창 → 휴지통 이동이 서버에 저장됨', async ({ page, fake, dialogs }) => {
    await gotoEntries(page);
    await page.locator('[aria-label="일지 삭제"]').first().click();
    await settle(page);
    assert.ok(dialogs.some(d => d.includes('휴지통으로 이동')), '확인창이 떠야 함');
    const saved = fake.get('data/entries.json');
    assert.strictEqual(saved.filter(e => e.deleted).length, 2);
    assert.strictEqual(fake.puts.length, 1);
  });

  await test('일지 단건 삭제: 확인창 취소하면 아무 것도 안 바뀜', async ({ page, fake, setDialogAnswer }) => {
    await gotoEntries(page);
    setDialogAnswer(false);
    await page.locator('[aria-label="일지 삭제"]').first().click();
    await settle(page);
    assert.strictEqual(fake.puts.length, 0);
  });

  await test('즐겨찾기 토글이 저장됨', async ({ page, fake }) => {
    await gotoEntries(page);
    await page.locator('[aria-label="즐겨찾기"]').first().click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.favorite).length, 2);
  });

  await test('일지 단건 삭제: 서버 오류(500) 시 실패 안내가 뜨고 데이터는 그대로', async ({ page, fake }) => {
    await gotoEntries(page);
    fake.failNext.push({ path: 'data/entries.json', status: 500 });
    await page.locator('[aria-label="일지 삭제"]').first().click();
    await settle(page);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 1);
  });

  await test('빠른 기록: 추가하면 목록과 서버에 반영', async ({ page, fake }) => {
    await gotoQuick(page);
    await page.getByPlaceholder('보고 들은 걸 바로 적어두세요…').fill('새 메모');
    await page.getByRole('button', { name: '기록', exact: true }).click();
    await settle(page);
    assert.strictEqual(fake.get('data/quick-notes.json').length, 4);
    assert.ok(await page.locator('text=새 메모').count() >= 1);
  });

  await test('빠른 기록: 미처리 2건이 보이고 정리됨은 접혀 있음', async ({ page }) => {
    await gotoQuick(page);
    assert.strictEqual(await page.locator('text=노트 하나').count(), 1);
    assert.strictEqual(await page.locator('text=노트 셋(정리됨)').count(), 0);
  });

  await test('빠른 기록 단건 삭제(미처리)는 확인창 없이 휴지통 이동', async ({ page, fake, dialogs }) => {
    await gotoQuick(page);
    await page.locator('[aria-label="빠른 기록 삭제"]').first().click();
    await page.waitForTimeout(900);
    assert.strictEqual(dialogs.length, 0);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 1);
  });

  await test('할 일: 완료 토글 저장', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.locator('[aria-label*="완료 처리"]').first().click();
    await page.waitForTimeout(1200);
    assert.strictEqual(fake.get('data/todos.json').filter(t => t.done).length, 2);
  });

  await test('할 일 삭제: 실행취소하면 서버에 아무 것도 안 씀', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.locator('[aria-label="할 일 삭제"]').first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '실행취소' }).click();
    await page.waitForTimeout(5200);
    assert.strictEqual(fake.puts.length, 0);
    assert.strictEqual(await page.locator('text=할일 하나').count(), 1);
  });

  await test('할 일 삭제: 4.5초 뒤 실제 삭제됨', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.locator('[aria-label="할 일 삭제"]').first().click();
    await page.waitForTimeout(5500);
    assert.strictEqual(fake.get('data/todos.json').length, 2);
  });

  await test('409 충돌: 다른 기기가 먼저 수정해도 두 변경 모두 살아남음', async ({ page, fake }) => {
    await gotoEntries(page);
    fake.conflictNext.add('data/entries.json');
    fake.externalWrite['data/entries.json'] = cur => [...cur, { id: 'ext', date: '2026-09-01', title: '외부추가', category: '개발', importance: '중', bullets: [], tags: [], links: [], images: [], createdAt: 1, updatedAt: 1 }];
    await page.locator('[aria-label="즐겨찾기"]').first().click();
    await settle(page);
    const saved = fake.get('data/entries.json');
    assert.ok(saved.some(e => e.id === 'ext'), '외부 추가분이 사라지면 안 됨');
    assert.strictEqual(saved.filter(e => e.favorite).length, 2);
  });

  summary();
})();
