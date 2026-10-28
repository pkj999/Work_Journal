// 휴지통 일괄 선택: 빠른 기록·일지 휴지통에서 여러 건을 골라 복원 / 영구 삭제
const { test, summary, assert, gotoEntries, gotoQuick, settle, seed } = require('./lib');

const now = Date.now();
const N = (id, text, extra = {}) => ({ id, text, imageRefs: [], processed: false, linkedEntryId: null, createdAt: now - 5000, ...extra });
const E = (id, title, extra = {}) => ({ id, date: '2026-10-01', title, category: '개발', importance: '중', bullets: [], overview: '', problem: '', solution: '', lesson: '', tags: [], links: [], images: [], createdAt: now - 9000, updatedAt: now - 9000, ...extra });
const del = { deleted: true, deletedAt: now - 1000 };

const scenario = () => {
  const d = seed();
  d['data/quick-notes.json'] = [
    N('n-live', '살아있는 기록', { imageRefs: ['images/shared.jpg'] }),
    N('t1', '휴지통 기록 1', { ...del, imageRefs: ['images/t1.jpg'] }),
    N('t2', '휴지통 기록 2', { ...del, imageRefs: ['images/shared.jpg'] }), // 살아있는 기록도 쓰는 사진
    N('t3', '휴지통 기록 3', { ...del }),
  ];
  d['data/entries.json'] = [
    E('e-live', '살아있는 일지', { images: ['images/e-shared.jpg'] }),
    E('x1', '휴지통 일지 1', { ...del, images: ['images/x1.jpg'] }),
    E('x2', '휴지통 일지 2', { ...del, images: ['images/e-shared.jpg'] }),
    E('x3', '휴지통 일지 3', { ...del }),
  ];
  for (const f of ['t1', 'shared', 'x1', 'e-shared']) d[`images/${f}.jpg`] = { img: f };
  return d;
};
const bar = page => page.getByRole('toolbar', { name: '일괄 작업' });
const barBtn = (page, name) => bar(page).getByRole('button', { name });
const selected = async page => (await bar(page).locator('[aria-live=polite]').innerText()).trim();
const openNoteTrash = async page => { await gotoQuick(page); await page.getByRole('button', { name: /^휴지통/ }).click(); await page.waitForTimeout(200); await page.getByRole('button', { name: '선택', exact: true }).click(); await page.waitForTimeout(200); };
const openEntryTrash = async page => { await gotoEntries(page); await page.getByRole('button', { name: /^휴지통/ }).click(); await page.waitForTimeout(200); await page.getByRole('button', { name: '선택', exact: true }).click(); await page.waitForTimeout(200); };
const putsOf = (fake, path) => fake.puts.filter(x => x.path === path);

(async () => {
  console.log('\n[휴지통 일괄: 빠른 기록]');

  await test('휴지통에 [선택] 버튼이 있고, 전체 선택 → [복원]/[영구 삭제] 버튼이 보임(활성 기록은 선택 대상이 아님)', async ({ page }) => {
    await openNoteTrash(page);
    assert.strictEqual(await page.getByRole('checkbox').count(), 3, '휴지통 3건만');
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selected(page), '3개 선택됨');
    assert.ok(await barBtn(page, '복원').isEnabled() && await barBtn(page, '영구 삭제').isEnabled());
    assert.strictEqual(await barBtn(page, '휴지통으로').count(), 0, '휴지통 화면엔 [휴지통으로]가 없음');
  }, { seed: scenario });

  await test('아무것도 안 골랐으면 [복원]/[영구 삭제]는 비활성', async ({ page }) => {
    await openNoteTrash(page);
    assert.ok(await barBtn(page, '복원').isDisabled() && await barBtn(page, '영구 삭제').isDisabled());
  }, { seed: scenario });

  await test('두 건 선택 → [복원]: 저장 1번, 그 기록들이 목록으로 돌아오고 선택 모드 종료', async ({ page, fake }) => {
    await openNoteTrash(page);
    await page.getByRole('checkbox', { name: /휴지통 기록 선택: 휴지통 기록 1/ }).click();
    await page.getByRole('checkbox', { name: /휴지통 기록 선택: 휴지통 기록 3/ }).click();
    await barBtn(page, '복원').click(); await settle(page);
    const ns = fake.get('data/quick-notes.json');
    assert.ok(!ns.find(n => n.id === 't1').deleted && !ns.find(n => n.id === 't3').deleted);
    assert.ok(ns.find(n => n.id === 't2').deleted, '고르지 않은 것은 그대로');
    assert.strictEqual(putsOf(fake, 'data/quick-notes.json').length, 1);
    assert.strictEqual(await bar(page).count(), 0);
    assert.ok((await page.locator('body').innerText()).includes('휴지통 기록 2'), '휴지통에는 남은 것만');
    assert.ok(!(await page.locator('body').innerText()).includes('휴지통 기록 1'));
  }, { seed: scenario });

  await test('[영구 삭제]: 확인창(건수·사진 안내) → 저장 1번으로 지워지고, 다른 곳에서 안 쓰는 사진만 삭제됨', async ({ page, fake, dialogs }) => {
    await openNoteTrash(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    await barBtn(page, '영구 삭제').click(); await settle(page); await settle(page);
    const d = dialogs.find(x => x.includes('영구 삭제할까요'));
    assert.ok(d && d.includes('3건') && d.includes('사진 2장') && d.includes('되돌릴 수 없어요'), d);
    const ns = fake.get('data/quick-notes.json');
    assert.deepStrictEqual(ns.map(n => n.id), ['n-live']);
    assert.strictEqual(putsOf(fake, 'data/quick-notes.json').length, 1);
    const gone = fake.deletes.map(x => x.path);
    assert.ok(gone.includes('images/t1.jpg'), '쓰는 곳이 없는 사진은 삭제');
    assert.ok(!gone.includes('images/shared.jpg'), '살아있는 기록이 쓰는 사진은 남김');
  }, { seed: scenario });

  await test('확인창에서 취소하면 아무것도 지워지지 않고 선택 상태가 유지됨', async ({ page, fake, setDialogAnswer }) => {
    await openNoteTrash(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    setDialogAnswer(false);
    await barBtn(page, '영구 삭제').click(); await settle(page);
    assert.strictEqual(fake.puts.length, 0); assert.strictEqual(fake.deletes.length, 0);
    assert.strictEqual(await selected(page), '3개 선택됨');
  }, { seed: scenario });

  await test('영구 삭제 저장이 실패하면 그대로 두고 안내(사진도 안 지움)', async ({ page, fake }) => {
    await openNoteTrash(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    fake.failNext.push({ path: 'data/quick-notes.json', status: 500 });
    await barBtn(page, '영구 삭제').click(); await settle(page);
    assert.strictEqual(fake.get('data/quick-notes.json').length, 4);
    assert.strictEqual(fake.deletes.length, 0);
    assert.ok(await page.locator('text=삭제 실패').count() >= 1);
    assert.strictEqual(await selected(page), '3개 선택됨');
  }, { seed: scenario });

  await test('다른 기기가 그 사이 복원해 둔 기록은 영구 삭제에서 빠짐(충돌 재시도에서도 보호)', async ({ page, fake }) => {
    await openNoteTrash(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    fake.conflictNext.add('data/quick-notes.json');
    fake.externalWrite['data/quick-notes.json'] = cur => cur.map(n => (n.id === 't3' ? { ...n, deleted: false, deletedAt: null } : n));
    await barBtn(page, '영구 삭제').click(); await settle(page); await settle(page);
    const ids = fake.get('data/quick-notes.json').map(n => n.id).sort();
    assert.deepStrictEqual(ids, ['n-live', 't3'], '복원된 t3은 남아야 함');
  }, { seed: scenario });

  await test('휴지통 ↔ 목록을 오가면 선택 모드가 끝남(서로 섞이지 않음)', async ({ page }) => {
    await openNoteTrash(page);
    await page.getByRole('checkbox', { name: /휴지통 기록 선택: 휴지통 기록 1/ }).click();
    await page.getByRole('button', { name: '목록으로' }).click(); await page.waitForTimeout(300);
    assert.strictEqual(await bar(page).count(), 0);
    await page.getByRole('button', { name: '선택', exact: true }).click();
    assert.strictEqual(await selected(page), '항목을 선택하세요');
  }, { seed: scenario });

  console.log('\n[휴지통 일괄: 일지]');

  await test('일지 휴지통도 선택 → [복원]: 저장 1번', async ({ page, fake }) => {
    await openEntryTrash(page);
    assert.strictEqual(await page.getByRole('checkbox').count(), 3);
    await page.getByRole('checkbox', { name: /휴지통 일지 선택: 휴지통 일지 1/ }).click();
    await page.getByRole('checkbox', { name: /휴지통 일지 선택: 휴지통 일지 2/ }).click();
    await barBtn(page, '복원').click(); await settle(page);
    const es = fake.get('data/entries.json');
    assert.ok(!es.find(e => e.id === 'x1').deleted && !es.find(e => e.id === 'x2').deleted && es.find(e => e.id === 'x3').deleted);
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 1);
  }, { seed: scenario });

  await test('일지 [영구 삭제]: 확인창 → 지워지고 쓰는 곳 없는 사진만 삭제, 살아있는 일지의 사진은 남김', async ({ page, fake, dialogs }) => {
    await openEntryTrash(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    await barBtn(page, '영구 삭제').click(); await settle(page); await settle(page);
    const d = dialogs.find(x => x.includes('영구 삭제할까요'));
    assert.ok(d.includes('일지 3건') && d.includes('사진 2장'), d);
    assert.deepStrictEqual(fake.get('data/entries.json').map(e => e.id), ['e-live']);
    const gone = fake.deletes.map(x => x.path);
    assert.ok(gone.includes('images/x1.jpg') && !gone.includes('images/e-shared.jpg'), gone.join(','));
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 1);
  }, { seed: scenario });

  await test('일지를 영구 삭제해도 빠른 기록이 쓰는 사진은 남김(교차 확인)', async ({ page, fake }) => {
    await openEntryTrash(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    await barBtn(page, '영구 삭제').click(); await settle(page); await settle(page);
    assert.ok(!fake.deletes.map(x => x.path).includes('images/shared.jpg'));
  }, { seed: () => { const d = scenario(); d['data/entries.json'].find(e => e.id === 'x2').images = ['images/shared.jpg']; return d; } });

  await test('보관 레포의 휴지통 일지는 선택 대상에서 빠지고 안내가 보이며 보관 레포에는 아무것도 쓰지 않음', async ({ page, fake }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '보관된 레포의 지난 기록도 함께 보기' }).click(); await settle(page);
    await page.getByRole('button', { name: /^휴지통/ }).click(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: '선택', exact: true }).click();
    assert.ok(await page.locator('text=보관 레포 일지 1건은 선택할 수 없어요').count() >= 1);
    await bar(page).getByRole('button', { name: '전체 선택' }).click();
    assert.strictEqual(await selected(page), '3개 선택됨', '활성 3건만');
    await barBtn(page, '복원').click(); await settle(page);
    assert.ok(fake.puts.every(p => p.repo === 'r'));
    assert.ok(fake.get('data/entries.json', 'r-old').find(e => e.id === 'a1').deleted, '보관 레포 것은 그대로');
  }, {
    seed: scenario,
    cfg: { archives: [{ owner: 'o', repo: 'r-old', branch: 'main', label: '옛날', archivedAt: 1 }] },
    extraRepos: { 'r-old': { 'data/entries.json': [E('a1', '보관 휴지통 일지', { ...del })], 'data/quick-notes.json': [] } },
  });

  await test('모바일(390px): 휴지통 선택 바가 화면 안에 들어오고 가로 스크롤 없음', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openNoteTrash(page);
    await bar(page).getByRole('button', { name: '전체 선택' }).click(); await page.waitForTimeout(500);
    const b = await bar(page).boundingBox();
    assert.ok(b.x >= 0 && b.x + b.width <= 390, JSON.stringify(b));
    for (const n of ['복원', '영구 삭제']) { const r = await barBtn(page, n).boundingBox(); assert.ok(r.x >= 0 && r.x + r.width <= 390, n); }
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(w.sw <= w.cw);
  }, { seed: scenario });

  summary();
})();
