// 태그 이름 바꾸기·합치기(설정 > 태그 이름 바꾸기·합치기)
const { test, summary, assert, goTab, gotoEntries, settle, seed } = require('./lib');

const day = 86400000, now = Date.now();
const iso = d => new Date(d).toISOString().slice(0, 10);
const E = (id, daysAgo, title, tags, extra = {}) => ({
  id, date: iso(now - daysAgo * day), title, category: '개발', importance: '중', bullets: [`${id} 한 일`], overview: '', problem: '', solution: '', lesson: '',
  tags, links: [], images: [], createdAt: now - daysAgo * day, updatedAt: now - daysAgo * day - 5000, ...extra,
});
const scenario = () => {
  const d = seed();
  d['data/entries.json'] = [
    E('t1', 1, '작업1', ['A제품', '가공정']),
    E('t2', 2, '작업2', ['A제품', '가공정', '나공정']),
    E('t3', 3, '작업3', ['A 제품', 'a제품']),               // 같은 일지에 표기만 다른 같은 태그 2개
    E('t4', 4, '작업4', ['B제품', '가공정']),
    E('t5', 5, '삭제된 작업', ['A제품', 'B제품'], { deleted: true, deletedAt: now }), // 휴지통의 일지도 같이 바뀌어야 함
  ];
  return d;
};
const open = async page => { await goTab(page, '설정'); await page.waitForTimeout(500); };
const panel = page => page.locator('div.rounded-lg', { hasText: '태그 이름 바꾸기·합치기' }).filter({ has: page.getByRole('button', { name: /이름 바꾸기$/ }).first() }).last();
const startRename = (page, label) => page.getByRole('button', { name: `태그 ${label} 이름 바꾸기`, exact: true }).click();
const input = (page, label) => page.getByLabel(`태그 ${label} 새 이름`);
const saveBtn = (page, label) => page.getByRole('button', { name: `태그 ${label} 이름 저장` });
const tagsOf = (fake, id) => fake.get('data/entries.json').find(e => e.id === id).tags;

(async () => {
  console.log('\n[태그 관리: 목록]');

  await test('설정에 태그 목록(개수·표기 여러 가지 안내)과 보관 레포 안내가 보임, 휴지통 일지는 개수에서 제외', async ({ page }) => {
    await open(page);
    const t = await page.evaluate(() => document.body.innerText);
    assert.ok(t.includes('태그 이름 바꾸기·합치기') && t.includes('보관된 레포의 지난 일지는 바뀌지 않아요'));
    assert.ok(/A제품\s*3건/.test(t), 'A제품 3건(t1,t2,t3, 휴지통 제외): ' + t.slice(t.indexOf('태그 이름'), t.indexOf('태그 이름') + 500));
    assert.ok(/표기 3가지/.test(t), '표기 3가지 안내');
  }, { seed: scenario });

  await test('태그가 하나도 없으면 "아직 태그가 없어요."', async ({ page }) => {
    await open(page);
    assert.ok(await page.locator('text=아직 태그가 없어요.').count() >= 1);
  }, { seed: () => { const d = seed(); d['data/entries.json'].forEach(e => { e.tags = []; }); return d; } });

  console.log('\n[태그 관리: 이름 바꾸기·합치기]');

  await test('이름 바꾸기: 일지 3건의 태그가 서버에 한 번의 저장으로 바뀌고 위치·다른 태그는 그대로', async ({ page, fake }) => {
    await open(page);
    await startRename(page, '나공정');
    await input(page, '나공정').fill('두번째공정');
    await saveBtn(page, '나공정').click();
    await settle(page);
    assert.deepStrictEqual(tagsOf(fake, 't2'), ['A제품', '가공정', '두번째공정']);
    assert.strictEqual(fake.puts.length, 1, '저장은 한 번');
    assert.ok(await page.locator('text=태그 "나공정"을(를) "두번째공정"(으)로 바꿨어요').count() >= 1);
  }, { seed: scenario });

  await test('표기 통일(a제품 → A제품): 모든 표기가 "A제품"으로, 같은 일지의 중복 표기는 하나로 합쳐짐, 휴지통 일지도 바뀜', async ({ page, fake }) => {
    await open(page);
    await startRename(page, 'A제품');
    await input(page, 'A제품').fill('A제품');
    // 표기가 3가지라 같은 이름이어도 통일 저장 가능
    await saveBtn(page, 'A제품').click();
    await settle(page);
    assert.deepStrictEqual(tagsOf(fake, 't1'), ['A제품', '가공정']);
    assert.deepStrictEqual(tagsOf(fake, 't2'), ['A제품', '가공정', '나공정'], '이미 A제품이면 그대로');
    assert.deepStrictEqual(tagsOf(fake, 't3'), ['A제품'], '"A 제품","a제품" 두 개가 하나로');
    assert.deepStrictEqual(tagsOf(fake, 't5'), ['A제품', 'B제품'], '휴지통의 일지는 이미 A제품');
    assert.strictEqual(fake.puts.length, 1);
  }, { seed: scenario });

  await test('다른 태그로 합치기(B제품 → A제품): 합쳐진다는 안내가 미리 보이고, 일지의 태그가 A제품으로 바뀜(휴지통 포함, 중복 없음)', async ({ page, fake }) => {
    await open(page);
    await startRename(page, 'B제품');
    await input(page, 'B제품').fill('a 제품');
    const hint = await page.locator('[role=status]').innerText();
    assert.ok(hint.includes('합쳐져요') && hint.includes('A제품'), hint);
    await saveBtn(page, 'B제품').click();
    await settle(page);
    assert.deepStrictEqual(tagsOf(fake, 't4'), ['a 제품', '가공정']);
    assert.deepStrictEqual(tagsOf(fake, 't5'), ['a 제품'], '삭제된 일지는 A제품·B제품이 하나로');
  }, { seed: scenario });

  await test('합친 뒤 태그 목록의 개수가 합산되고 옛 이름은 사라짐', async ({ page }) => {
    await open(page);
    await startRename(page, 'B제품');
    await input(page, 'B제품').fill('A제품');
    await saveBtn(page, 'B제품').click();
    await settle(page);
    assert.strictEqual(await page.getByRole('button', { name: '태그 B제품 이름 바꾸기', exact: true }).count(), 0);
    const t = await page.evaluate(() => document.body.innerText);
    assert.ok(/A제품\s*4건/.test(t), t.slice(t.indexOf('태그 이름'), t.indexOf('태그 이름') + 400));
  }, { seed: scenario });

  console.log('\n[태그 관리: 실행취소]');

  await test('실행취소하면 태그와 수정 시각이 원래대로 돌아오고 저장은 한 번', async ({ page, fake }) => {
    const before = JSON.parse(JSON.stringify(seed()['data/entries.json']));
    await open(page);
    const orig = JSON.parse(JSON.stringify(fake.get('data/entries.json')));
    await startRename(page, 'A제품');
    await input(page, 'A제품').fill('통일제품');
    await saveBtn(page, 'A제품').click();
    await settle(page);
    assert.notDeepStrictEqual(tagsOf(fake, 't1'), orig.find(e => e.id === 't1').tags);
    await page.getByRole('button', { name: '실행취소' }).click();
    await settle(page);
    assert.deepStrictEqual(fake.get('data/entries.json'), orig, '완전히 원래대로(태그·updatedAt)');
    assert.strictEqual(fake.puts.length, 2, '바꾸기 1번 + 되돌리기 1번');
    assert.ok(await page.locator('text=건을 되돌렸어요').count() >= 1);
  }, { seed: scenario });

  await test('실행취소 전에 그 일지의 태그를 직접 고쳤다면 그 일지는 건드리지 않고 안내', async ({ page, fake }) => {
    await open(page);
    await startRename(page, '나공정');
    await input(page, '나공정').fill('새이름');
    await saveBtn(page, '나공정').click();
    await settle(page);
    // 다른 기기가 t2의 태그를 직접 고친 상황
    const cur = fake.get('data/entries.json'); cur.find(e => e.id === 't2').tags = ['직접수정'];
    fake.set('data/entries.json', cur);
    await page.getByRole('button', { name: '실행취소' }).click();
    await settle(page);
    assert.deepStrictEqual(tagsOf(fake, 't2'), ['직접수정'], '직접 고친 태그는 그대로');
    assert.ok(await page.locator('text=그 뒤에 직접 고쳐서 그대로 뒀어요').count() >= 1);
  }, { seed: scenario });

  console.log('\n[태그 관리: 입력 검사·오류]');

  await test('빈 이름·쉼표가 든 이름·지금과 같은 이름은 저장 버튼이 꺼지고 이유가 보임, 서버에 저장 없음', async ({ page, fake }) => {
    await open(page);
    await startRename(page, '나공정');
    await input(page, '나공정').fill('   ');
    assert.ok(await saveBtn(page, '나공정').isDisabled());
    assert.ok((await page.locator('[role=status]').innerText()).includes('새 이름을 입력'));
    await input(page, '나공정').fill('가,나');
    assert.ok(await saveBtn(page, '나공정').isDisabled());
    assert.ok((await page.locator('[role=status]').innerText()).includes('쉼표'));
    await input(page, '나공정').fill('나공정');
    assert.ok(await saveBtn(page, '나공정').isDisabled());
    assert.ok((await page.locator('[role=status]').innerText()).includes('지금과 같은 이름'));
    assert.strictEqual(fake.puts.length, 0);
  }, { seed: scenario });

  await test('앞뒤 공백은 잘라서 저장, Enter로 저장·Esc로 취소', async ({ page, fake }) => {
    await open(page);
    await startRename(page, '나공정');
    await input(page, '나공정').fill('  공백제거  ');
    await input(page, '나공정').press('Enter');
    await settle(page);
    assert.deepStrictEqual(tagsOf(fake, 't2'), ['A제품', '가공정', '공백제거']);
    await startRename(page, '공백제거');
    await input(page, '공백제거').press('Escape');
    assert.strictEqual(await input(page, '공백제거').count(), 0, 'Esc로 편집 줄이 닫혀야 함');
    assert.strictEqual(fake.puts.length, 1);
  }, { seed: scenario });

  await test('서버 오류(500): 데이터 그대로 + 실패 안내 + [다시 시도]로 성공', async ({ page, fake }) => {
    await open(page);
    await startRename(page, '나공정');
    await input(page, '나공정').fill('재시도이름');
    fake.failNext.push({ path: 'data/entries.json', status: 500 });
    await saveBtn(page, '나공정').click();
    await settle(page);
    assert.ok(await page.locator('text=태그 이름 바꾸기 실패').count() >= 1);
    assert.deepStrictEqual(tagsOf(fake, 't2'), ['A제품', '가공정', '나공정']);
    assert.ok(await input(page, '나공정').count() === 1, '실패하면 편집 줄이 남아 있어야 함(다시 시도 가능)');
    await page.getByRole('button', { name: '다시 시도' }).click();
    await settle(page);
    assert.deepStrictEqual(tagsOf(fake, 't2'), ['A제품', '가공정', '재시도이름']);
  }, { seed: scenario });

  await test('다른 기기가 먼저 일지를 추가(409 충돌)해도 그 일지까지 같이 바뀌고 추가분도 유지', async ({ page, fake }) => {
    await open(page);
    await startRename(page, '나공정');
    await input(page, '나공정').fill('충돌이름');
    fake.conflictNext.add('data/entries.json');
    fake.externalWrite['data/entries.json'] = cur => [...cur, E('ext', 0, '외부 추가', ['나공정', '외부태그'])];
    await saveBtn(page, '나공정').click();
    await settle(page);
    assert.deepStrictEqual(tagsOf(fake, 't2'), ['A제품', '가공정', '충돌이름']);
    assert.deepStrictEqual(tagsOf(fake, 'ext'), ['충돌이름', '외부태그'], '외부 추가분도 같이 바뀜');
  }, { seed: scenario });

  console.log('\n[태그 관리: 보관 레포 / 다른 화면 반영]');

  await test('보관 레포의 일지는 바뀌지 않고(저장 없음), 보관 레포에만 있는 태그는 목록에 없음', async ({ page, fake }) => {
    await open(page);
    await page.waitForTimeout(500);
    assert.strictEqual(await page.getByRole('button', { name: '태그 옛레포태그 이름 바꾸기', exact: true }).count(), 0);
    await startRename(page, '가공정');
    await input(page, '가공정').fill('가공');
    await saveBtn(page, '가공정').click();
    await settle(page);
    assert.ok(fake.puts.every(p => p.repo === 'r'), '보관 레포(r-old)에는 쓰면 안 됨: ' + JSON.stringify(fake.puts));
    assert.deepStrictEqual(fake.get('data/entries.json', 'r-old')[0].tags, ['가공정', '옛레포태그']);
  }, {
    seed: scenario,
    cfg: { archives: [{ owner: 'o', repo: 'r-old', branch: 'main', label: '옛날', archivedAt: 1 }] },
    extraRepos: { 'r-old': { 'data/entries.json': [E('a1', 400, '옛 일지', ['가공정', '옛레포태그'])], 'data/quick-notes.json': [] } },
  });

  await test('바꾼 이름이 모아보기 칩·최근 태그 칩·목록 필터에 바로 반영되고, 옛 이름은 사라짐', async ({ page }) => {
    await open(page);
    await startRename(page, '나공정');
    await input(page, '나공정').fill('두번째공정');
    await saveBtn(page, '나공정').click();
    await settle(page);
    await gotoEntries(page);
    await page.getByRole('button', { name: '모아보기' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('group', { name: '태그' }).getByRole('button', { name: /^두번째공정\s+\d+$/ }).count(), 1);
    assert.strictEqual(await page.getByRole('group', { name: '태그' }).getByRole('button', { name: /^나공정\s+\d+$/ }).count(), 0);
    await page.getByRole('button', { name: '새 일지 작성' }).click().catch(() => {});
  }, { seed: scenario });

  await test('모아보기에서 고른 태그를 설정에서 이름 바꾸면 선택이 자동으로 풀림(안 보이는 조건이 안 남음)', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '모아보기' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('group', { name: '태그' }).getByRole('button', { name: /^나공정\s+\d+$/ }).click();
    assert.strictEqual(await page.getByTestId('timeline-card').count(), 1);
    // 탭을 옮기면 상태가 초기화되므로(모아보기는 업무일지 탭 안), 같은 화면에서의 정리 로직은 collect 테스트가 보장. 여기서는 이름 변경 후 돌아와 깨끗하게 열리는지 확인
    await goTab(page, '설정');
    await startRename(page, '나공정');
    await input(page, '나공정').fill('바뀐이름');
    await saveBtn(page, '나공정').click();
    await settle(page);
    await gotoEntries(page);
    await page.getByRole('button', { name: '모아보기' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('[aria-pressed="true"]').count(), 0);
    assert.ok(await page.locator('text=위에서 프로젝트나 태그를 고르면').count() >= 1);
  }, { seed: scenario });

  console.log('\n[태그 관리: 화면]');

  await test('태그가 13개 이상이면 "태그 찾기"가 나타나 걸러 보임', async ({ page }) => {
    await open(page);
    assert.strictEqual(await page.getByLabel('태그 찾기').count(), 1);
    await page.getByLabel('태그 찾기').fill('태그07');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.getByRole('button', { name: /^태그 태그\d\d 이름 바꾸기$/ }).count(), 1);
    await page.getByLabel('태그 찾기').fill('없는이름');
    assert.ok(await page.locator('text=찾는 태그가 없어요.').count() >= 1);
  }, { seed: () => { const d = seed(); d['data/entries.json'] = Array.from({ length: 14 }, (_, i) => E('m' + i, i + 1, '작업' + i, ['태그' + String(i).padStart(2, '0')])); return d; } });

  await test('한 번에 한 태그만 편집: 다른 태그의 [이름 바꾸기]를 누르면 앞의 편집 줄은 닫힘', async ({ page }) => {
    await open(page);
    await startRename(page, '가공정');
    await startRename(page, '나공정');
    assert.strictEqual(await input(page, '가공정').count(), 0);
    assert.strictEqual(await input(page, '나공정').count(), 1);
  }, { seed: scenario });

  await test('모바일(390px): 버튼 40px 이상, 입력칸 80px 이상, 가로 스크롤 없음', async ({ page }) => {
    await open(page);
    const small = await page.getByRole('button', { name: /이름 바꾸기$/ }).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)).filter(h => h < 40));
    assert.deepStrictEqual(small, []);
    await startRename(page, '나공정');
    for (const l of ['태그 나공정 이름 저장', '태그 나공정 이름 바꾸기 취소']) {
      const b = await page.getByRole('button', { name: l }).boundingBox();
      assert.ok(b.width >= 40 && b.height >= 40, l + JSON.stringify(b));
    }
    const w = await input(page, '나공정').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(w >= 80, '입력칸 폭 ' + w);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  }, { viewport: { width: 390, height: 844 }, seed: scenario });

  summary();
})();
