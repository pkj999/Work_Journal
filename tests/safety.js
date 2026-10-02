// 1단계(안전): 모든 "삭제"는 되돌릴 수 있어야 함 — docs/DESIGN_RULES.md 1장
const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, settle, seed } = require('./lib');

// 카드 순서에 기대지 않으려고 이름으로 검색해 그 일지 한 장만 남긴 뒤 삭제 버튼을 누름 (프로젝트A = e1)
const searchBox = page => page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…');
async function delEntry(page, title = '프로젝트A') {
  await searchBox(page).fill(title);
  await page.waitForTimeout(400);
  assert.strictEqual(await page.locator('[aria-label="일지 삭제"]').count(), 1, title + ' 한 장만 남아야 함');
  await page.locator('[aria-label="일지 삭제"]').first().click();
}
const undoBtn = page => page.getByRole('button', { name: '실행취소' });
const memoSeed = () => { const d = seed(); d['data/memos.json'] = [
  { id: 'm1', text: '첫째 기억', tags: [], createdAt: 1, updatedAt: 1 },
  { id: 'm2', text: '둘째 기억', tags: ['t'], createdAt: 2, updatedAt: 2 }]; return d; };
const openMemos = async page => { await gotoTodos(page); await page.getByRole('button', { name: /기억할 것/ }).click(); await page.waitForTimeout(400); };

(async () => {
  console.log('\n[안전: 일지]');

  await test('일지 삭제 → 확인창 없음, 휴지통 저장, 토스트 문구 "휴지통으로 이동했어요"', async ({ page, fake, dialogs }) => {
    await gotoEntries(page);
    await delEntry(page);
    await settle(page);
    assert.strictEqual(dialogs.length, 0);
    assert.ok(await page.locator('text=휴지통으로 이동했어요').count() >= 1);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').deleted, true);
  });

  await test('일지 삭제 → [실행취소] → 서버에서도 복원되고 목록에 다시 보임', async ({ page, fake }) => {
    await gotoEntries(page);
    await delEntry(page);
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').deleted, true, '삭제가 먼저 저장돼야 함');
    assert.strictEqual(await page.locator('[aria-label="일지 삭제"]').count(), 0, '삭제 직후 목록에서 사라져야 함');
    await undoBtn(page).click();
    await settle(page);
    const e1 = fake.get('data/entries.json').find(e => e.id === 'e1');
    assert.strictEqual(!!e1.deleted, false);
    assert.strictEqual(await page.locator('[aria-label="일지 삭제"]').count(), 1, '복원되어 목록에 다시 보여야 함');
    assert.ok(await page.locator('text=복원했어요').count() >= 1);
  });

  await test('실행취소를 안 눌러도 휴지통에서 복원 가능(이중 안전망)', async ({ page, fake }) => {
    await gotoEntries(page);
    await delEntry(page);
    await page.waitForTimeout(6800); // 토스트 사라진 뒤
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').deleted, true);
    await searchBox(page).fill('');
    await page.getByRole('button', { name: /휴지통/ }).first().click();
    await page.waitForTimeout(300);
    const btns = page.locator('[aria-label="일지 복원"]');
    const idx = await btns.evaluateAll(els => els.findIndex(e => (e.closest('div.rounded-lg') || e.parentElement.parentElement).innerText.includes('프로젝트A')));
    assert.ok(idx >= 0, '휴지통에서 프로젝트A를 찾지 못함');
    await btns.nth(idx).click();
    await settle(page);
    assert.strictEqual(!!fake.get('data/entries.json').find(e => e.id === 'e1').deleted, false);
  });

  await test('삭제 중 서버 오류(500): 데이터 그대로 + "삭제 실패" + [다시 시도]로 성공', async ({ page, fake }) => {
    await gotoEntries(page);
    fake.failNext.push({ path: 'data/entries.json', status: 500 });
    await delEntry(page);
    await settle(page);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 1);
    await page.getByRole('button', { name: '다시 시도' }).click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').deleted, true);
  });

  await test('같은 일지 삭제를 연타해도 오류 없이 휴지통 1건, 실행취소로 복원', async ({ page, fake }) => {
    await gotoEntries(page);
    await searchBox(page).fill('프로젝트A');
    await page.waitForTimeout(400);
    await page.locator('[aria-label="일지 삭제"]').first().dblclick().catch(() => {});
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').deleted, true);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 2, '휴지통은 기존 1 + 새 1');
    await undoBtn(page).last().click();
    await settle(page);
    assert.strictEqual(!!fake.get('data/entries.json').find(e => e.id === 'e1').deleted, false);
  });

  await test('삭제 후 다른 기기가 먼저 수정(409)해도 두 변경 모두 살아남고 실행취소도 동작', async ({ page, fake }) => {
    await gotoEntries(page);
    fake.conflictNext.add('data/entries.json');
    fake.externalWrite['data/entries.json'] = cur => [...cur, { id: 'ext', date: '2026-09-01', title: '외부추가', category: '개발', importance: '중', bullets: [], tags: [], links: [], images: [], createdAt: 1, updatedAt: 1 }];
    await delEntry(page);
    await settle(page);
    let saved = fake.get('data/entries.json');
    assert.ok(saved.some(e => e.id === 'ext'));
    assert.strictEqual(saved.find(e => e.id === 'e1').deleted, true);
    await undoBtn(page).click();
    await settle(page);
    saved = fake.get('data/entries.json');
    assert.ok(saved.some(e => e.id === 'ext'));
    assert.strictEqual(!!saved.find(e => e.id === 'e1').deleted, false);
  });

  await test('보관 레포 일지 삭제만은 확인창 유지, 취소하면 아무것도 안 바뀜', async ({ page, fake, dialogs, setDialogAnswer }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: /보관된 레포의 지난 기록도 함께 보기/ }).click();
    await page.waitForTimeout(1200);
    setDialogAnswer(false);
    await page.locator('text=아카이브일지1').first().waitFor();
    const card = page.locator('div.group', { hasText: '아카이브일지1' }).first();
    await card.locator('[aria-label="일지 삭제"]').click();
    await settle(page);
    assert.ok(dialogs.some(d => d.includes('보관된 레포')), dialogs.join('|'));
    assert.strictEqual(fake.get('data/entries.json', 'r-old').filter(e => e.deleted).length, 0);
  }, {
    cfg: { archives: [{ owner: 'o', repo: 'r-old', branch: 'main', label: '옛날', archivedAt: 1 }] },
    extraRepos: { 'r-old': { 'data/entries.json': [
      { id: 'a1', date: '2025-01-01', title: '아카이브일지1', category: '개발', importance: '중', bullets: [], tags: [], links: [], images: [], createdAt: 1, updatedAt: 1 }], 'data/quick-notes.json': [] } },
  });

  await test('일지 미리보기 팝업에서 삭제해도 확인창 없이 이동 + 실행취소', async ({ page, fake, dialogs }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '달력' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^\d+$|.*/ }).first().waitFor();
    // 달력에서 오늘 칸을 눌러 일지 미리보기 열기
    const today = new Date().getDate();
    await page.locator('button', { hasText: new RegExp('^' + today + '$') }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    const del = page.locator('[aria-label="일지 삭제"]');
    if (await del.count()) { await del.first().click(); await settle(page); assert.strictEqual(dialogs.length, 0); assert.ok(await undoBtn(page).count() >= 1); }
  });

  console.log('\n[안전: 빠른 기록]');

  await test('미처리 빠른 기록 삭제 → 휴지통 + [실행취소]로 복원', async ({ page, fake, dialogs }) => {
    await gotoQuick(page);
    await page.locator('[aria-label="빠른 기록 삭제"]').first().click();
    await settle(page);
    assert.strictEqual(dialogs.length, 0);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 1);
    await undoBtn(page).click();
    await settle(page);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 0);
    assert.ok(await page.locator('text=노트 하나').count() + await page.locator('text=노트 둘').count() === 2);
  });

  await test('이미 일지로 정리된 빠른 기록 삭제: 확인창 없이 이동, 문구에 "일지는 그대로", 실행취소로 복원', async ({ page, fake, dialogs }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /정리됨 \d+건/ }).click();
    await page.waitForTimeout(300);
    await page.locator('[aria-label="빠른 기록 삭제"]').last().click();
    await settle(page);
    assert.strictEqual(dialogs.length, 0, '확인창 없음: ' + dialogs.join('|'));
    assert.ok(await page.locator('text=정리한 일지는 그대로 남아 있어요').count() >= 1);
    const del = fake.get('data/quick-notes.json').filter(n => n.deleted);
    assert.strictEqual(del.length, 1); assert.strictEqual(del[0].processed, true);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 1, '연결된 일지는 그대로(삭제표시된 건 원래 1건뿐)');
    await undoBtn(page).click();
    await settle(page);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 0);
  });

  await test('빠른 기록 삭제 서버 오류: 그대로 + [다시 시도]', async ({ page, fake }) => {
    await gotoQuick(page);
    fake.failNext.push({ path: 'data/quick-notes.json', status: 500 });
    await page.locator('[aria-label="빠른 기록 삭제"]').first().click();
    await settle(page);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 0);
    await page.getByRole('button', { name: '다시 시도' }).click();
    await settle(page);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 1);
  });

  console.log('\n[안전: 기억할 것(메모)]');

  await test('메모 삭제 → 화면에서 즉시 사라지고, 4.5초 전엔 서버가 그대로, [실행취소]하면 서버 변화 없음', async ({ page, fake }) => {
    await openMemos(page);
    await page.locator('[aria-label="메모 삭제"]').first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('text=둘째 기억').count() + await page.locator('text=첫째 기억').count(), 1);
    assert.strictEqual(fake.get('data/memos.json').length, 2, '4.5초 전엔 서버에서 지우면 안 됨');
    await undoBtn(page).click();
    await page.waitForTimeout(5200);
    assert.strictEqual(fake.get('data/memos.json').length, 2);
    assert.strictEqual(await page.locator('text=첫째 기억').count(), 1);
    assert.strictEqual(await page.locator('text=둘째 기억').count(), 1);
    assert.strictEqual(fake.puts.length, 0, '실행취소하면 서버에 아무것도 안 씀');
  }, { seed: memoSeed });

  await test('메모 삭제 후 실행취소 안 하면 4.5초 뒤 서버에서 삭제됨(1건만)', async ({ page, fake }) => {
    await openMemos(page);
    await page.locator('[aria-label="메모 삭제"]').first().click();
    await page.waitForTimeout(5600);
    const saved = fake.get('data/memos.json');
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(fake.puts.length, 1);
  }, { seed: memoSeed });

  await test('메모 두 개를 연달아 삭제: 각각 독립 처리, 하나만 실행취소하면 그것만 남음', async ({ page, fake }) => {
    await openMemos(page);
    await page.locator('[aria-label="메모 삭제"]').first().click();
    await page.waitForTimeout(250);
    await page.locator('[aria-label="메모 삭제"]').first().click();
    await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('[aria-label="메모 삭제"]').count(), 0);
    await undoBtn(page).click(); // 마지막(둘째로 지운) 것만 되돌림
    await page.waitForTimeout(5600);
    const saved = fake.get('data/memos.json');
    assert.strictEqual(saved.length, 1, JSON.stringify(saved));
    assert.strictEqual(await page.locator('[aria-label="메모 삭제"]').count(), 1);
  }, { seed: memoSeed });

  await test('메모 삭제 대기 중 새로고침하면 지워지지 않은 채로 다시 보임(데이터 안전 방향)', async ({ page, fake }) => {
    await openMemos(page);
    await page.locator('[aria-label="메모 삭제"]').first().click();
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('text=업무일지');
    await page.waitForTimeout(1200);
    assert.strictEqual(fake.get('data/memos.json').length, 2);
    await openMemos(page);
    assert.strictEqual(await page.locator('text=첫째 기억').count() + await page.locator('text=둘째 기억').count(), 2);
  }, { seed: memoSeed });

  await test('메모 삭제 저장 실패(500): 목록에 다시 나타나고 [다시 시도]로 삭제', async ({ page, fake }) => {
    await openMemos(page);
    fake.failNext.push({ path: 'data/memos.json', status: 500 });
    await page.locator('[aria-label="메모 삭제"]').first().click();
    await page.waitForTimeout(5800);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(fake.get('data/memos.json').length, 2);
    assert.strictEqual(await page.locator('[aria-label="메모 삭제"]').count(), 2, '실패하면 목록에 복귀해야 함');
    await page.getByRole('button', { name: '다시 시도' }).click();
    await page.waitForTimeout(5800);
    assert.strictEqual(fake.get('data/memos.json').length, 1);
  }, { seed: memoSeed });

  await test('메모 삭제 대기 중에도 "기억할 것 · N" 개수가 바로 줄어듦', async ({ page }) => {
    await openMemos(page);
    assert.ok(await page.getByRole('button', { name: /기억할 것 · 2/ }).count() === 1);
    await page.locator('[aria-label="메모 삭제"]').first().click();
    await page.waitForTimeout(300);
    assert.ok(await page.getByRole('button', { name: /기억할 것 · 1/ }).count() === 1);
  }, { seed: memoSeed });

  console.log('\n[안전: 용어·문구]');

  await test('영구 삭제 확인창: "영구 삭제" 표기, 취소하면 아무것도 안 바뀜', async ({ page, fake, dialogs, setDialogAnswer }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: /휴지통/ }).first().click();
    await page.waitForTimeout(300);
    setDialogAnswer(false);
    await page.locator('[aria-label="일지 영구 삭제"]').first().click();
    await settle(page);
    assert.ok(dialogs.some(d => d.includes('영구 삭제') && !d.includes('완전히')), dialogs.join('|'));
    assert.strictEqual(fake.get('data/entries.json').length, 5);
  });

  await test('일괄 휴지통(여러 건)은 확인창 유지', async ({ page, dialogs }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '선택', exact: true }).click();
    await page.getByRole('checkbox', { name: '프로젝트A 선택' }).click();
    await page.getByRole('toolbar', { name: '일괄 작업' }).getByRole('button', { name: '휴지통으로' }).click();
    await settle(page);
    assert.ok(dialogs.some(d => d.includes('휴지통')), dialogs.join('|'));
  });

  await test('모바일(390px): 실행취소 토스트가 하단 탭 바에 가려지지 않고 눌림', async ({ page, fake }) => {
    await gotoEntries(page);
    await delEntry(page);
    await page.waitForTimeout(700);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').deleted, true);
    const b = undoBtn(page).first();
    const box = await b.boundingBox();
    assert.ok(box, '실행취소 버튼이 보여야 함');
    const top = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? (el.closest('button') || el).textContent : ''; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    assert.ok(top.includes('실행취소'), '버튼 위에 다른 요소가 덮고 있음: ' + top);
    await b.click();
    await settle(page);
    assert.strictEqual(!!fake.get('data/entries.json').find(e => e.id === 'e1').deleted, false);
  }, { viewport: { width: 390, height: 844 } });

  summary();
})();
