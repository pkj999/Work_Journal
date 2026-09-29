const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, settle } = require('./lib');
const { seed } = require('./seed');

const bar = page => page.getByRole('toolbar', { name: '일괄 작업' });
const startSelect = page => page.getByRole('button', { name: '선택', exact: true }).click();
const checks = page => page.getByRole('checkbox');
const pickByLabel = (page, label) => page.getByRole('checkbox', { name: label });
const barBtn = (page, name) => bar(page).getByRole('button', { name });
const selectedText = async page => (await bar(page).locator('[aria-live]').innerText()).trim();

(async () => {
  console.log('\n[일지] 일괄 작업');

  await test('진입: 체크박스 4개, 바 표시, 작업 버튼은 비활성, 새 일지 버튼(FAB) 숨김', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    assert.strictEqual(await checks(page).count(), 4);
    assert.strictEqual(await selectedText(page), '항목을 선택하세요');
    assert.ok(await barBtn(page, '휴지통으로').isDisabled());
    assert.ok(await barBtn(page, '즐겨찾기').isDisabled());
    assert.strictEqual(await page.locator('[aria-label="새 일지 작성"]').count(), 0);
  });

  await test('카드 클릭으로 선택/해제, 개수 표시, 편집창은 열리지 않고 저장도 없음', async ({ page, fake, dialogs }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await pickByLabel(page, '프로젝트B 선택').click();
    assert.strictEqual(await selectedText(page), '2개 선택됨');
    await pickByLabel(page, '프로젝트B 선택').click();
    assert.strictEqual(await selectedText(page), '1개 선택됨');
    assert.strictEqual(await pickByLabel(page, '프로젝트A 선택').getAttribute('aria-checked'), 'true');
    assert.strictEqual(await pickByLabel(page, '프로젝트B 선택').getAttribute('aria-checked'), 'false');
    assert.strictEqual(await page.locator('text=일지 수정').count(), 0);
    assert.strictEqual(fake.puts.length, 0);
    assert.strictEqual(dialogs.length, 0);
  });

  await test('전체 선택/해제 토글', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '4개 선택됨');
    await bar(page).getByRole('button', { name: '선택 해제' }).click();
    assert.strictEqual(await selectedText(page), '항목을 선택하세요');
  });

  await test('일괄 휴지통: 확인창(건수 표시) → 한 번의 저장 → 모드 종료 → 나머지만 표시', async ({ page, fake, dialogs }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await pickByLabel(page, '프로젝트C 선택').click();
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.ok(dialogs.some(d => d.includes('2건')), '건수가 확인창에 표시돼야 함: ' + dialogs);
    const saved = fake.get('data/entries.json');
    assert.deepStrictEqual(saved.filter(e => e.deleted).map(e => e.id).sort(), ['e1', 'e3', 'e5']);
    assert.strictEqual(fake.puts.length, 1, '한 번의 저장이어야 함');
    assert.strictEqual(await bar(page).count(), 0, '선택 모드가 끝나야 함');
    assert.ok(await page.locator('text=2건 표시 중').count() >= 1);
    assert.ok(await page.locator('text=일지 2건을 휴지통으로 이동했습니다').count() >= 1);
  });

  await test('확인창을 취소하면 저장 없음 + 선택/모드 유지', async ({ page, fake, setDialogAnswer }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    setDialogAnswer(false);
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.strictEqual(fake.puts.length, 0);
    assert.strictEqual(await selectedText(page), '1개 선택됨');
  });

  await test('즐겨찾기 일괄: 선택한 것만 추가, 이미 즐겨찾기인 것과 섞여도 "추가"로 통일', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click(); // 즐겨찾기 아님
    await pickByLabel(page, '프로젝트B 선택').click(); // 이미 즐겨찾기
    assert.ok(await barBtn(page, '즐겨찾기').count() === 1, '혼합이면 "즐겨찾기"(추가) 라벨');
    await barBtn(page, '즐겨찾기').click();
    await settle(page);
    const saved = fake.get('data/entries.json');
    assert.deepStrictEqual(saved.filter(e => e.favorite).map(e => e.id).sort(), ['e1', 'e2']);
    assert.strictEqual(fake.puts.length, 1);
  });

  await test('즐겨찾기 일괄: 전부 즐겨찾기면 "해제" 라벨/동작', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트B 선택').click();
    await barBtn(page, '즐겨찾기 해제').click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.favorite).length, 0);
  });

  await test('카테고리 일괄 변경: 선택한 것만 바뀌고 수정시각 갱신', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await pickByLabel(page, '프로젝트D 선택').click();
    await bar(page).locator('select[aria-label="카테고리 변경"]').selectOption('제안');
    await settle(page);
    const saved = fake.get('data/entries.json');
    const byId = Object.fromEntries(saved.map(e => [e.id, e]));
    assert.strictEqual(byId.e1.category, '제안');
    assert.strictEqual(byId.e4.category, '제안');
    assert.strictEqual(byId.e2.category, '사내issue', '선택 안 한 건은 그대로');
    assert.ok(byId.e1.updatedAt > 1e12 && byId.e1.updatedAt !== byId.e3.updatedAt);
    assert.strictEqual(fake.puts.length, 1);
    assert.strictEqual(await bar(page).count(), 0);
  });

  await test('중요도 일괄 변경 + 이미 모두 같은 값이면 저장하지 않고 안내(선택 유지)', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click(); // 상
    await bar(page).locator('select[aria-label="중요도 변경"]').selectOption('상');
    await settle(page);
    assert.strictEqual(fake.puts.length, 0, '변화가 없으면 저장하지 않아야 함');
    assert.ok(await page.locator('text=이미 모두 같은 중요도').count() >= 1);
    assert.strictEqual(await selectedText(page), '1개 선택됨');
    await bar(page).locator('select[aria-label="중요도 변경"]').selectOption('하');
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').importance, '하');
  });

  await test('검색으로 좁힌 상태의 "전체 선택"은 보이는 항목만 — 삭제도 그것만', async ({ page, fake }) => {
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('zebra');
    await settle(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '1개 선택됨');
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.deepStrictEqual(fake.get('data/entries.json').filter(e => e.deleted).map(e => e.id).sort(), ['e1', 'e5']);
  });

  await test('선택 후 검색어를 바꾸면 안 보이게 된 항목은 선택에서 빠짐(보이지 않는 선택 방지)', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '4개 선택됨');
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('zebra');
    await settle(page);
    assert.strictEqual(await selectedText(page), '1개 선택됨');
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('');
    await settle(page);
    assert.strictEqual(await selectedText(page), '1개 선택됨', '검색어를 지워도 이전 선택이 되살아나면 안 됨');
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 2, '나머지 3건이 같이 지워지면 안 됨');
  });

  await test('서버 오류(500): 실패 안내, 데이터/선택/모드 유지, 이후 다시 시도하면 성공', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await pickByLabel(page, '프로젝트B 선택').click();
    fake.failNext.push({ path: 'data/entries.json', status: 500 });
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 1);
    assert.strictEqual(await selectedText(page), '2개 선택됨');
    assert.ok(await bar(page).count() === 1);
    assert.ok(await barBtn(page, '휴지통으로').isEnabled(), '실패 후 다시 누를 수 있어야 함');
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 3);
  });

  await test('409 충돌: 다른 기기가 그사이 항목을 추가/삭제해도 내 일괄 변경이 얹히고 남의 변경도 유지', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await pickByLabel(page, '프로젝트B 선택').click();
    fake.conflictNext.add('data/entries.json');
    // 다른 기기: 새 일지 추가 + e2를 영구 삭제
    fake.externalWrite['data/entries.json'] = cur => [...cur.filter(e => e.id !== 'e2'), { id: 'ext', date: '2026-09-01', title: '외부추가', category: '개발', importance: '중', bullets: [], tags: [], links: [], images: [], createdAt: 1, updatedAt: 1 }];
    await barBtn(page, '즐겨찾기').click();
    await settle(page);
    const saved = fake.get('data/entries.json');
    assert.ok(saved.some(e => e.id === 'ext'), '외부 추가분 유지');
    assert.ok(!saved.some(e => e.id === 'e2'), '외부에서 지운 건 되살아나면 안 됨');
    assert.strictEqual(saved.find(e => e.id === 'e1').favorite, true);
    assert.ok(await page.locator('text=일지 1건을 즐겨찾기에 추가했습니다').count() >= 1, '실제로 바뀐 건수(1)로 안내해야 함');
  });

  await test('연타 방지: 같은 순간 두 번 눌러도 저장은 한 번', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await page.evaluate(() => { const b = [...document.querySelectorAll('[role=toolbar] button')].find(x => x.textContent.includes('휴지통으로')); b.click(); b.click(); });
    await settle(page);
    assert.strictEqual(fake.puts.length, 1);
  });

  await test('Esc로 선택 모드 종료', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.strictEqual(await bar(page).count(), 0);
    assert.strictEqual(await checks(page).count(), 0);
  });

  await test('달력으로 화면을 바꾸면 선택 모드 종료, 목록으로 돌아와도 선택 없음', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await page.getByRole('button', { name: '달력' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await bar(page).count(), 0);
    await page.getByRole('button', { name: '목록' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await checks(page).count(), 0);
    assert.ok(await page.getByRole('button', { name: '선택', exact: true }).count() === 1);
  });

  await test('휴지통 화면으로 가면 선택 모드 종료 + 휴지통에는 "선택" 버튼 없음', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    await page.getByRole('button', { name: /휴지통/ }).first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await bar(page).count(), 0);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 0);
  });

  await test('다른 탭에 갔다 오면 선택 모드는 꺼져 있음', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await gotoQuick(page);
    await gotoEntries(page);
    assert.strictEqual(await bar(page).count(), 0);
    assert.strictEqual(await checks(page).count(), 0);
  });

  await test('선택 모드에서 카드 안의 버튼(삭제/즐겨찾기)은 눌리지 않음 — 저장·확인창 없음', async ({ page, fake, dialogs }) => {
    await gotoEntries(page);
    await startSelect(page);
    // 카드 우상단(원래 삭제 버튼 자리)을 눌러도 선택 토글만 일어남
    const card = pickByLabel(page, '프로젝트A 선택');
    const box = await card.boundingBox();
    await page.mouse.click(box.x + box.width - 20, box.y + 24);
    await settle(page);
    assert.strictEqual(fake.puts.length, 0);
    assert.strictEqual(dialogs.length, 0);
    assert.strictEqual(await selectedText(page), '1개 선택됨');
    const inertCount = await page.locator('[inert]').count();
    assert.strictEqual(inertCount, 4, '카드 4개의 내용이 모두 inert여야 함');
  });

  await test('키보드: 체크박스에 포커스 후 Space/Enter로 토글', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    const cb = pickByLabel(page, '프로젝트A 선택');
    await cb.focus();
    await page.keyboard.press('Space');
    assert.strictEqual(await cb.getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Enter');
    assert.strictEqual(await cb.getAttribute('aria-checked'), 'false');
  });

  await test('선택 모드 진입/종료가 카드의 "더보기" 펼침 상태를 리셋하지 않음', async ({ page }) => {
    const s = seed();
    s['data/entries.json'][0].overview = '가'.repeat(200);
    await gotoEntries(page);
    await page.locator('button', { hasText: '더보기' }).first().click();
    assert.ok(await page.locator('button', { hasText: '접기' }).count() >= 1);
    await startSelect(page);
    assert.ok(await page.locator('button', { hasText: '접기' }).count() >= 1, '펼침 상태 유지');
  }, { seed: () => { const s = seed(); s['data/entries.json'][0].overview = '가'.repeat(200); return s; } });

  await test('새로고침 중 다른 기기에서 지워진 항목이 있으면 선택에서 정리됨', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '4개 선택됨');
    fake.set('data/entries.json', fake.get('data/entries.json').filter(e => e.id !== 'e2'));
    await page.locator('button[aria-label="새로고침"]').first().click();
    await page.waitForTimeout(1200);
    assert.strictEqual(await selectedText(page), '3개 선택됨');
  });

  await test('삭제한 일지는 휴지통에서 복원 가능', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    await page.getByRole('button', { name: /휴지통/ }).first().click();
    await page.waitForTimeout(300);
    await page.locator('[aria-label="일지 복원"]').first().click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').find(e => e.id === 'e1').deleted, false);
  });

  await test('보관 레포(읽기 전용) 기록은 선택 대상에서 제외되고 저장소도 건드리지 않음', async ({ page, fake, dialogs }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: /보관된 레포의 지난 기록도 함께 보기/ }).click();
    await page.waitForTimeout(1200);
    assert.ok(await page.locator('text=아카이브일지1').count() >= 1, '보관 기록이 불러와져야 함');
    await startSelect(page);
    assert.strictEqual(await checks(page).count(), 4, '활성 4건만 체크박스');
    assert.ok(await page.locator('text=보관 레포 기록 2건은 선택할 수 없어요').count() >= 1);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '4개 선택됨');
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.ok(fake.puts.every(p => p.repo === 'r'), '보관 레포 저장소에는 쓰면 안 됨: ' + JSON.stringify(fake.puts));
    assert.strictEqual(fake.get('data/entries.json', 'r-old').filter(e => e.deleted).length, 0);
  }, {
    cfg: { archives: [{ owner: 'o', repo: 'r-old', branch: 'main', label: '옛날', archivedAt: 1 }] },
    extraRepos: { 'r-old': { 'data/entries.json': [
      { id: 'a1', date: '2025-01-01', title: '아카이브일지1', category: '개발', importance: '중', bullets: [], tags: [], links: [], images: [], createdAt: 1, updatedAt: 1 },
      { id: 'a2', date: '2025-01-02', title: '아카이브일지2', category: '개발', importance: '중', bullets: [], tags: [], links: [], images: [], createdAt: 2, updatedAt: 2 },
    ], 'data/quick-notes.json': [] } },
  });

  await test('대량(200건) 전체 선택 → 일괄 삭제가 저장 1회, 5초 이내', async ({ page, fake }) => {
    await gotoEntries(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '200개 선택됨');
    const t0 = Date.now();
    await barBtn(page, '휴지통으로').click();
    await page.waitForSelector('text=200건을 휴지통으로 이동', { timeout: 8000 });
    assert.ok(Date.now() - t0 < 5000, '너무 느림: ' + (Date.now() - t0));
    assert.strictEqual(fake.puts.length, 1);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.deleted).length, 200);
  }, { seed: () => { const s = seed(); s['data/entries.json'] = Array.from({ length: 200 }, (_, i) => ({ id: 'x' + i, date: '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), title: '대량' + i, category: '개발', importance: '중', bullets: [], tags: [], links: [], images: [], createdAt: i, updatedAt: i })); return s; } });

  // ---------------- 빠른 기록 ----------------
  console.log('\n[빠른 기록] 일괄 작업');

  await test('진입: 미처리 2건만 선택 대상(접힌 "정리됨"은 제외), 펼치면 3건', async ({ page }) => {
    await gotoQuick(page);
    await startSelect(page);
    assert.strictEqual(await checks(page).count(), 2);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^정리됨 \d+건/ }).click();
    await startSelect(page);
    assert.strictEqual(await checks(page).count(), 3);
  });

  await test('일괄 삭제: 확인창(건수) → 서버 1회 저장 → 모드 종료', async ({ page, fake, dialogs }) => {
    await gotoQuick(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.ok(dialogs.some(d => d.includes('2건') && !d.includes('이미 업무일지로')), dialogs.join('|'));
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 2);
    assert.strictEqual(fake.puts.length, 1);
    assert.strictEqual(await bar(page).count(), 0);
  });

  await test('이미 일지로 정리된 기록이 섞이면 확인창에서 알려줌', async ({ page, fake, dialogs }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /^정리됨 \d+건/ }).click();
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.ok(dialogs.some(d => d.includes('3건') && d.includes('1건은 이미 업무일지로')), dialogs.join('|'));
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 3);
  });

  await test('"정리됨"을 다시 접으면 그 항목은 선택에서 빠짐', async ({ page }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /^정리됨 \d+건/ }).click();
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '3개 선택됨');
    await page.getByRole('button', { name: /^정리됨 \d+건/ }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await selectedText(page), '2개 선택됨');
  });

  await test('카드 안 버튼("일지로 정리하기")과 스와이프는 선택 모드에서 동작하지 않음', async ({ page, fake, dialogs }) => {
    await gotoQuick(page);
    await startSelect(page);
    assert.strictEqual(await page.locator('text=일지로 정리하기').first().isVisible(), true);
    const cb = page.getByRole('checkbox').first();
    const box = await cb.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 16); // "일지로 정리하기" 링크 위치
    await settle(page);
    assert.strictEqual(await page.locator('text=빠른 기록에서 일지 작성').count(), 0, '작성 창이 열리면 안 됨');
    assert.strictEqual(fake.puts.length, 0);
    assert.strictEqual(await selectedText(page), '1개 선택됨');
  });

  await test('서버 오류: 실패 안내 + 데이터/선택 유지', async ({ page, fake }) => {
    await gotoQuick(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    fake.failNext.push({ path: 'data/quick-notes.json', status: 500 });
    await barBtn(page, '휴지통으로').click();
    await settle(page);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(fake.get('data/quick-notes.json').filter(n => n.deleted).length, 0);
    assert.strictEqual(await selectedText(page), '2개 선택됨');
  });

  await test('휴지통 화면으로 가면 선택 모드 종료', async ({ page }) => {
    await gotoQuick(page);
    await startSelect(page);
    await page.getByRole('button', { name: /휴지통/ }).first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await bar(page).count(), 0);
  });

  await test('선택 중에 새 기록을 추가해도 기존 선택은 유지되고 새 카드는 선택 안 된 상태', async ({ page }) => {
    await gotoQuick(page);
    await startSelect(page);
    await pickByLabel(page, /노트 하나/).click();
    await page.getByPlaceholder('보고 들은 걸 바로 적어두세요…').fill('추가된 메모');
    await page.getByRole('button', { name: '기록', exact: true }).click();
    await settle(page);
    assert.strictEqual(await checks(page).count(), 3);
    assert.strictEqual(await selectedText(page), '1개 선택됨');
  });

  // ---------------- 할 일 ----------------
  console.log('\n[할 일] 일괄 작업');

  await test('진입: 미완료 2건만 대상(완료 목록은 접혀 있음)', async ({ page }) => {
    await gotoTodos(page);
    await startSelect(page);
    assert.strictEqual(await checks(page).count(), 2);
    assert.ok(await barBtn(page, '완료 처리').isDisabled());
  });

  await test('일괄 완료 처리: 서버 1회 저장, 선택한 것만, 모드 종료', async ({ page, fake }) => {
    await gotoTodos(page);
    await startSelect(page);
    await pickByLabel(page, '할일 하나 선택').click();
    await pickByLabel(page, '할일 둘 선택').click();
    await barBtn(page, '완료 처리').click();
    await settle(page);
    const saved = fake.get('data/todos.json');
    assert.strictEqual(saved.filter(t => t.done).length, 3);
    assert.ok(saved.filter(t => t.done).every(t => t.completedAt), '완료 시각 기록');
    assert.strictEqual(fake.puts.length, 1);
    assert.strictEqual(await bar(page).count(), 0);
  });

  await test('완료 목록에서 고르면 "완료 취소" 라벨 → 미완료로 되돌림', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.locator('button', { hasText: '완료 1건' }).click();
    await startSelect(page);
    await pickByLabel(page, '할일 셋(완료) 선택').click();
    await barBtn(page, '완료 취소').click();
    await settle(page);
    const t3 = fake.get('data/todos.json').find(t => t.id === 't3');
    assert.strictEqual(t3.done, false);
    assert.strictEqual(t3.completedAt, null);
  });

  await test('완료/미완료가 섞이면 "완료 처리" — 이미 완료된 건 그대로 두고 나머지만', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.locator('button', { hasText: '완료 1건' }).click();
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selectedText(page), '3개 선택됨');
    await barBtn(page, '완료 처리').click();
    await settle(page);
    const saved = fake.get('data/todos.json');
    assert.strictEqual(saved.filter(t => t.done).length, 3);
    assert.strictEqual(saved.find(t => t.id === 't3').completedAt > 0, true);
    assert.ok(await page.locator('text=할 일 2건을 완료 처리했습니다').count() >= 1, '실제 바뀐 건수(2)로 안내');
  });

  await test('일괄 삭제: 즉시 화면에서 사라지고 서버는 4.5초 뒤 — 실행취소하면 저장 없이 복원', async ({ page, fake }) => {
    await gotoTodos(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    await barBtn(page, '삭제').click();
    await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('text=할일 하나').count(), 0);
    assert.strictEqual(fake.puts.length, 0, '아직 저장 전이어야 함');
    await page.getByRole('button', { name: '실행취소' }).click();
    await page.waitForTimeout(5200);
    assert.strictEqual(fake.puts.length, 0);
    assert.strictEqual(await page.locator('text=할일 하나').count(), 1);
    assert.strictEqual(await page.locator('text=할일 둘').count(), 1);
  });

  await test('일괄 삭제: 4.5초 뒤 선택한 것만 서버에서 삭제(1회 저장)', async ({ page, fake }) => {
    await gotoTodos(page);
    await startSelect(page);
    await pickByLabel(page, '할일 하나 선택').click();
    await barBtn(page, '삭제').click();
    await page.waitForTimeout(5600);
    const saved = fake.get('data/todos.json');
    assert.deepStrictEqual(saved.map(t => t.id).sort(), ['t2', 't3']);
    assert.strictEqual(fake.puts.length, 1);
  });

  await test('일괄 삭제 실패(서버 500): 안내 후 항목이 다시 나타남', async ({ page, fake }) => {
    await gotoTodos(page);
    await startSelect(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    fake.failNext.push({ path: 'data/todos.json', status: 500 });
    await barBtn(page, '삭제').click();
    await page.waitForTimeout(5600);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(fake.get('data/todos.json').length, 3);
    assert.strictEqual(await page.locator('text=할일 하나').count(), 1);
  });

  await test('수정 중이던 행이 있으면 선택 시작 시 수정 모드를 먼저 닫음', async ({ page }) => {
    await gotoTodos(page);
    await page.locator('text=할일 하나').first().click(); // 수정 모드 진입
    assert.ok(await page.locator('[aria-label="할 일 수정 저장"]').count() === 1);
    await startSelect(page);
    assert.strictEqual(await page.locator('[aria-label="할 일 수정 저장"]').count(), 0);
    assert.strictEqual(await checks(page).count(), 2);
  });

  await test('"기억할 것" 탭으로 넘어가면 선택 모드 종료', async ({ page }) => {
    await gotoTodos(page);
    await startSelect(page);
    await page.getByRole('button', { name: /기억할 것/ }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await bar(page).count(), 0);
  });

  await test('선택 모드에서 완료 원 버튼/삭제 X 버튼은 눌리지 않음', async ({ page, fake }) => {
    await gotoTodos(page);
    await startSelect(page);
    const cb = pickByLabel(page, '할일 하나 선택');
    const box = await cb.boundingBox();
    await page.mouse.click(box.x + box.width - 14, box.y + box.height / 2); // 삭제 X 자리
    await page.mouse.click(box.x + 22, box.y + box.height / 2);            // 완료 원 자리
    await page.waitForTimeout(800);
    assert.strictEqual(fake.puts.length, 0);
    assert.strictEqual(await page.locator('text=할 일을 삭제했어요').count(), 0);
  });

  // ---------------- 화면 ----------------
  console.log('\n[화면] 모바일/다크 레이아웃');

  await test('모바일(390px): 가로 스크롤 없음, 하단 바가 화면 안이고 탭 바와 겹치지 않음', async ({ page }) => {
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await page.waitForTimeout(600); // 바가 올라오는 애니메이션이 끝난 뒤 측정
    const m = await page.evaluate(() => {
      const b = document.querySelector('[role=toolbar]').getBoundingClientRect();
      const navBtn = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === '설정').pop();
      const nav = navBtn.parentElement.getBoundingClientRect(); // 탭 바(둥근 카드) 전체
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, barLeft: b.left, barRight: b.right, barBottom: b.bottom, navTop: nav.top, ih: window.innerHeight };
    });
    assert.ok(m.sw <= m.iw, `가로 스크롤 발생 ${m.sw} > ${m.iw}`);
    assert.ok(m.barLeft >= 0 && m.barRight <= m.iw, '바가 화면 밖으로 나감');
    assert.ok(m.barBottom <= m.navTop + 1, `바(${m.barBottom})가 탭 바(${m.navTop})와 겹침`);
    await page.screenshot({ path: 'mobile-select.png' });
  }, { viewport: { width: 390, height: 844 } });

  await test('다크 모드에서도 선택 표시/바가 렌더링됨(스크린샷)', async ({ page }) => {
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), '다크 모드가 적용돼야 함');
    await gotoEntries(page);
    await startSelect(page);
    await pickByLabel(page, '프로젝트A 선택').click();
    await pickByLabel(page, '프로젝트C 선택').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'dark-select.png' });
    assert.strictEqual(await selectedText(page), '2개 선택됨');
  }, { theme: 'dark' });

  summary();
})();
