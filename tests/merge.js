// 빠른 기록 합치기: 선택 모드에서 여러 건 → 새 일지 하나로 합치기 / 기존 일지 개요에 덧붙이기, 프로젝트 후보 추천, 원본 여러 건 보기
const { test, summary, assert, gotoEntries, gotoQuick, settle, seed } = require('./lib');

const day = 86400000, now = Date.now();
const at = (h, m, daysAgo = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); };
const ymd = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const dshort = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} (${'일월화수목금토'[d.getDay()]})`; };
const N = (id, text, ts, extra = {}) => ({ id, text, imageRefs: [], processed: false, linkedEntryId: null, createdAt: ts, ...extra });
const E = (id, title, tags, extra = {}) => ({ id, date: ymd(now - 3 * day), title, category: '개발', importance: '중', bullets: [], overview: '', problem: '', solution: '', lesson: '', tags, links: [], images: [], createdAt: now - 3 * day, updatedAt: now - 3 * day, ...extra });
const P = (id, name, status = '진행중') => ({ id, name, purpose: '', status, deadline: null, createdAt: now - 30 * day, updatedAt: now - 30 * day });

const scenario = () => {
  const d = seed();
  d['data/quick-notes.json'] = [
    N('a1', '지게차 구역 A제품 확인 필요', at(11, 5)),
    N('a3', '가공정 온도 상한 180', at(9, 40), { imageRefs: ['images/x1.jpg'] }),
    N('a2', '출입 전 무전 확인', at(9, 10), { imageRefs: ['images/x1.jpg', 'images/x2.jpg'] }),
    N('old', '이틀 전에 들은 것', at(16, 20, 2)),
    N('done', '이미 정리한 것', at(8, 0), { processed: true, linkedEntryId: 'e3' }),
  ];
  d['data/projects.json'] = [P('pa', 'A제품 생산'), P('pz', '무관한 프로젝트')];
  d['data/entries.json'] = [
    E('e1', 'A제품 가공정 점검', ['A제품'], { projectId: 'pa', overview: '기존 개요' }),
    E('e2', '지게차 구역', ['안전']),
    E('e3', '무관한 일', ['기타']),
    E('e4', '삭제된 일지', [], { deleted: true, deletedAt: now }),
  ];
  return d;
};
const openSelect = async page => { await gotoQuick(page); await page.getByRole('button', { name: '선택', exact: true }).click(); await page.waitForTimeout(200); };
const pick = (page, text) => page.getByRole('checkbox', { name: new RegExp('빠른 기록 선택: ' + text) }).click();
const mergeBtn = page => page.getByRole('button', { name: /일지로 합치기/ });
const putsOf = (fake, path) => fake.puts.filter(x => x.path === path);
const form = page => page.locator('form').first();
const OVERVIEW = '예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등';
const norm = s => s.replace(/\s+/g, ' ').trim();

(async () => {
  console.log('\n[합치기: 선택과 시트]');

  await test('아무것도 안 골랐으면 [일지로 합치기]는 비활성, 고르면 (N)건으로 활성', async ({ page }) => {
    await openSelect(page);
    assert.ok(await mergeBtn(page).isDisabled());
    await pick(page, '출입 전'); await pick(page, '가공정');
    assert.strictEqual((await mergeBtn(page).innerText()).replace(/\s+/g, ' ').trim(), '일지로 합치기 (2)');
    assert.ok(await mergeBtn(page).isEnabled());
  }, { seed: scenario });

  await test('이미 정리된 기록을 같이 골라도 합치기에서는 빠지고 안내가 보임(정리된 것만 고르면 비활성)', async ({ page }) => {
    await openSelect(page);
    await page.getByRole('button', { name: /정리됨 1건/ }).click();
    await pick(page, '이미 정리한 것');
    assert.ok(await mergeBtn(page).isDisabled());
    await pick(page, '출입 전');
    assert.ok((await mergeBtn(page).innerText()).includes('(1)'));
    assert.ok(await page.locator('text=이미 정리된 기록 1건은 합치기에서 빠져요').count() >= 1);
  }, { seed: scenario });

  await test('시트: 시간순(오래된 것 위) 미리보기, 오늘 것만이면 시각만 / 다른 날이 섞이면 날짜 포함, ISO 없음', async ({ page }) => {
    await openSelect(page);
    await pick(page, '지게차'); await pick(page, '가공정'); await pick(page, '출입 전');
    await mergeBtn(page).click();
    const t = norm(await page.getByTestId('merge-preview').innerText());
    assert.strictEqual(t, '09:10 출입 전 무전 확인 09:40 가공정 온도 상한 180 11:05 지게차 구역 A제품 확인 필요');
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(t));
    assert.ok((await page.locator('text=사진 2장도 함께 가져가요').count()) === 1, '같은 사진은 한 번만 셈');
    await page.getByRole('button', { name: '닫기' }).first().click();
    await pick(page, '이틀 전');
    await mergeBtn(page).click();
    const t2 = norm(await page.getByTestId('merge-preview').innerText());
    assert.ok(t2.startsWith(`${dshort(at(16, 20, 2))} 16:20 이틀 전에 들은 것`), t2);
    assert.ok(t2.includes(`${dshort(at(9, 10))} 09:10 출입 전 무전 확인`), t2);
  }, { seed: scenario });

  await test('시트를 닫으면 아무것도 바뀌지 않고 선택은 그대로 남음', async ({ page, fake }) => {
    await openSelect(page);
    await pick(page, '출입 전'); await pick(page, '가공정');
    await mergeBtn(page).click();
    await page.getByRole('button', { name: '닫기' }).first().click(); await page.waitForTimeout(200);
    assert.strictEqual(await page.getByTestId('merge-preview').count(), 0);
    assert.ok((await mergeBtn(page).innerText()).includes('(2)'));
    assert.strictEqual(fake.puts.length, 0);
  }, { seed: scenario });

  console.log('\n[합치기: 새 일지로]');

  await test('[새 일지로 만들기] → 폼이 열리고 개요에 합친 글, 사진 합침. 저장하면 일지 1건 + 기록 3건이 모두 정리됨으로 연결', async ({ page, fake }) => {
    await openSelect(page);
    await pick(page, '지게차'); await pick(page, '가공정'); await pick(page, '출입 전');
    await mergeBtn(page).click();
    await page.getByRole('button', { name: '새 일지로 만들기' }).click(); await page.waitForTimeout(600);
    assert.ok(await page.locator('text=빠른 기록 3건으로 일지 작성').count() === 1);
    assert.strictEqual(norm(await form(page).getByPlaceholder(OVERVIEW).inputValue()), '09:10 출입 전 무전 확인 09:40 가공정 온도 상한 180 11:05 지게차 구역 A제품 확인 필요');
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('현장 점검 모음');
    await page.getByRole('button', { name: '저장', exact: true }).click(); await settle(page);
    const es = fake.get('data/entries.json');
    const e = es.find(x => x.title === '현장 점검 모음');
    assert.deepStrictEqual([...e.sourceNoteIds].sort(), ['a1', 'a2', 'a3']);
    assert.strictEqual(e.images.length, 2, '같은 사진은 한 번만');
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 1);
    const ns = fake.get('data/quick-notes.json');
    for (const id of ['a1', 'a2', 'a3']) { const n = ns.find(x => x.id === id); assert.ok(n.processed && n.linkedEntryId === e.id, id); }
    assert.ok(!ns.find(x => x.id === 'old').processed, '고르지 않은 기록은 그대로');
    assert.strictEqual(putsOf(fake, 'data/quick-notes.json').length, 1, '기록 파일 저장도 1번');
  }, { seed: scenario });

  await test('저장 후 선택 모드가 끝나 있고 "정리됨 4건"으로 옮겨짐', async ({ page }) => {
    await openSelect(page);
    await pick(page, '출입 전'); await pick(page, '가공정');
    await mergeBtn(page).click();
    await page.getByRole('button', { name: '새 일지로 만들기' }).click(); await page.waitForTimeout(600);
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('두 건 합침');
    await page.getByRole('button', { name: '저장', exact: true }).click(); await settle(page);
    await gotoQuick(page);
    assert.strictEqual(await page.getByRole('toolbar', { name: '일괄 작업' }).count(), 0, '선택 모드 종료');
    assert.ok(await page.getByRole('button', { name: /정리됨 3건/ }).count() === 1);
  }, { seed: scenario });

  await test('폼을 저장하지 않고 닫으면 기록은 정리 안 됨 상태 그대로', async ({ page, fake }) => {
    await openSelect(page);
    await pick(page, '출입 전'); await pick(page, '가공정');
    await mergeBtn(page).click();
    await page.getByRole('button', { name: '새 일지로 만들기' }).click(); await page.waitForTimeout(600);
    await form(page).getByRole('button', { name: '닫기' }).click(); await page.waitForTimeout(300);
    assert.strictEqual(fake.puts.length, 0);
    await gotoQuick(page);
    assert.ok(!fake.get('data/quick-notes.json').some(n => n.processed && ['a2', 'a3'].includes(n.id)));
  }, { seed: scenario });

  await test('일지 카드의 [원본 빠른 기록 3건 보기] → 팝업에 3건이 시간순으로 모두 보임', async ({ page }) => {
    await openSelect(page);
    await pick(page, '지게차'); await pick(page, '가공정'); await pick(page, '출입 전');
    await mergeBtn(page).click();
    await page.getByRole('button', { name: '새 일지로 만들기' }).click(); await page.waitForTimeout(600);
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('원본 확인용');
    await page.getByRole('button', { name: '저장', exact: true }).click(); await settle(page);
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('원본 확인용'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: '원본 빠른 기록 3건 보기' }).click(); await page.waitForTimeout(300);
    const stamps = await page.getByTestId('note-stamp').allInnerTexts();
    assert.strictEqual(stamps.length, 3);
    assert.ok(stamps[0].includes('09:10') && stamps[2].includes('11:05'), stamps.join(' | '));
  }, { seed: scenario });

  console.log('\n[합치기: 기존 일지에 덧붙이기]');

  const toAppend = async page => {
    await openSelect(page);
    await pick(page, '지게차'); await pick(page, '가공정'); await pick(page, '출입 전');
    await mergeBtn(page).click();
    await page.getByRole('button', { name: '기존 일지에 덧붙이기' }).click(); await page.waitForTimeout(300);
  };
  const cand = (page, title) => page.getByTestId('append-candidate').filter({ hasText: title });

  await test('후보: 내용이 비슷한 일지(추천)가 먼저, 점수 높은 순. 삭제된 일지는 안 나옴', async ({ page }) => {
    await toAppend(page);
    const rows = (await page.getByTestId('append-candidate').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
    assert.ok(rows[0].startsWith('지게차 구역') && rows[0].includes('추천'), rows[0]);
    assert.ok(rows[1].startsWith('A제품 가공정 점검') && rows[1].includes('추천') && rows[1].includes('A제품 생산'), rows[1]);
    assert.ok(!rows.join('|').includes('삭제된 일지'));
    assert.ok(!rows[2].includes('추천'));
  }, { seed: scenario });

  await test('검색: 업무명·프로젝트·태그로 좁혀짐', async ({ page }) => {
    await toAppend(page);
    await page.getByLabel('일지 찾기').fill('A제품 생산');
    assert.strictEqual(await page.getByTestId('append-candidate').count(), 1);
    await page.getByLabel('일지 찾기').fill('없는검색어');
    assert.ok(await page.locator('text=찾는 일지가 없어요').count() === 1);
  }, { seed: scenario });

  await test('일지를 고르면 미리보기 → [덧붙이기]: 개요 뒤에 빈 줄을 두고 붙고 기존 내용·다른 필드는 그대로, 일지 저장 1번 + 기록 저장 1번', async ({ page, fake }) => {
    await toAppend(page);
    await cand(page, 'A제품 가공정 점검').click();
    assert.ok(norm(await page.getByTestId('append-preview').innerText()).startsWith('09:10 출입 전 무전 확인'));
    await page.getByRole('button', { name: '덧붙이기', exact: true }).click(); await settle(page);
    const e = fake.get('data/entries.json').find(x => x.id === 'e1');
    assert.ok(e.overview.startsWith('기존 개요\n\n09:10  출입 전 무전 확인\n09:40  가공정 온도 상한 180\n11:05  지게차 구역 A제품 확인 필요'), JSON.stringify(e.overview));
    assert.deepStrictEqual([...e.sourceNoteIds].sort(), ['a1', 'a2', 'a3']);
    assert.strictEqual(e.images.length, 2);
    assert.strictEqual(e.projectId, 'pa'); assert.strictEqual(e.title, 'A제품 가공정 점검'); assert.ok(e.updatedAt > now - 60000);
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 1);
    assert.strictEqual(putsOf(fake, 'data/quick-notes.json').length, 1);
    const ns = fake.get('data/quick-notes.json');
    assert.ok(['a1', 'a2', 'a3'].every(id => ns.find(n => n.id === id).processed && ns.find(n => n.id === id).linkedEntryId === 'e1'));
    assert.strictEqual(await page.getByRole('toolbar', { name: '일괄 작업' }).count(), 0, '선택 모드 종료');
  }, { seed: scenario });

  await test('개요가 비어 있던 일지에 덧붙이면 앞에 빈 줄 없이 시작', async ({ page, fake }) => {
    await toAppend(page);
    await cand(page, '지게차 구역').click();
    await page.getByRole('button', { name: '덧붙이기', exact: true }).click(); await settle(page);
    assert.ok(fake.get('data/entries.json').find(x => x.id === 'e2').overview.startsWith('09:10  출입 전 무전 확인'));
  }, { seed: scenario });

  await test('[다른 일지 고르기]로 돌아가 다른 일지를 고를 수 있음, [뒤로]는 합치기 시트로', async ({ page }) => {
    await toAppend(page);
    await cand(page, 'A제품 가공정 점검').click();
    await page.getByRole('button', { name: '다른 일지 고르기' }).click();
    assert.ok(await page.getByTestId('append-candidate').count() >= 3);
    await page.getByRole('button', { name: '뒤로' }).click();
    assert.strictEqual(await page.getByTestId('merge-preview').count(), 1);
  }, { seed: scenario });

  await test('연타해도 저장은 한 번', async ({ page, fake }) => {
    await toAppend(page);
    await cand(page, 'A제품 가공정 점검').click();
    await page.getByRole('button', { name: '덧붙이기', exact: true }).dblclick(); await settle(page);
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 1);
    assert.strictEqual((fake.get('data/entries.json').find(x => x.id === 'e1').overview.match(/출입 전 무전 확인/g) || []).length, 1);
  }, { seed: scenario });

  await test('일지는 저장됐는데 기록 표시 저장이 실패하면: 안내 + [다시 시도]로 이어가도 내용이 두 번 붙지 않음', async ({ page, fake }) => {
    await toAppend(page);
    await cand(page, 'A제품 가공정 점검').click();
    fake.failNext.push({ path: 'data/quick-notes.json', status: 500 });
    await page.getByRole('button', { name: '덧붙이기', exact: true }).click(); await settle(page);
    assert.ok(await page.locator('text=덧붙이기 실패').count() >= 1);
    assert.ok(!fake.get('data/quick-notes.json').find(n => n.id === 'a2').processed, '아직 정리됨 아님');
    await page.getByRole('button', { name: '다시 시도' }).click(); await settle(page); await settle(page);
    const e = fake.get('data/entries.json').find(x => x.id === 'e1');
    assert.strictEqual((e.overview.match(/출입 전 무전 확인/g) || []).length, 1, '두 번 붙으면 안 됨');
    assert.strictEqual(e.sourceNoteIds.filter(i => i === 'a2').length, 1);
    assert.ok(fake.get('data/quick-notes.json').find(n => n.id === 'a2').processed);
  }, { seed: scenario });

  await test('고른 일지가 그 사이 삭제됐으면 안내만 하고 기록은 그대로', async ({ page, fake }) => {
    await toAppend(page);
    await cand(page, 'A제품 가공정 점검').click();
    fake.set('data/entries.json', fake.get('data/entries.json').filter(e => e.id !== 'e1'));
    await page.getByRole('button', { name: '덧붙이기', exact: true }).click(); await settle(page);
    assert.ok(await page.locator('text=덧붙일 일지를 찾지 못했어요').count() >= 1);
    assert.ok(fake.get('data/quick-notes.json').every(n => n.id === 'done' || !n.processed));
    assert.strictEqual(putsOf(fake, 'data/quick-notes.json').length, 0);
  }, { seed: scenario });

  await test('다른 기기가 먼저 일지를 추가해 충돌(409)해도 덧붙인 내용과 상대 추가가 둘 다 남음', async ({ page, fake }) => {
    await toAppend(page);
    await cand(page, 'A제품 가공정 점검').click();
    fake.conflictNext.add('data/entries.json');
    fake.externalWrite['data/entries.json'] = cur => [E('ext', '다른 기기 일지', []), ...cur];
    await page.getByRole('button', { name: '덧붙이기', exact: true }).click(); await settle(page);
    const es = fake.get('data/entries.json');
    assert.ok(es.find(x => x.id === 'ext'));
    assert.ok(es.find(x => x.id === 'e1').overview.includes('출입 전 무전 확인'));
  }, { seed: scenario });

  await test('덧붙인 뒤 토스트의 [일지 보기]로 그 일지를 확인할 수 있음', async ({ page }) => {
    await toAppend(page);
    await cand(page, 'A제품 가공정 점검').click();
    await page.getByRole('button', { name: '덧붙이기', exact: true }).click(); await settle(page);
    await page.getByRole('button', { name: '일지 보기' }).click(); await page.waitForTimeout(400);
    assert.ok(await page.locator('text=출입 전 무전 확인').count() >= 1);
  }, { seed: scenario });

  console.log('\n[프로젝트 후보 추천]');

  const openNew = async page => { await gotoEntries(page); await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500); };

  await test('글 안에 프로젝트에 자주 쓰던 태그(A제품)가 있으면 그 프로젝트가 추천되고, 누르면 선택 + 업무명이 채워지며 추천은 사라짐', async ({ page }) => {
    await openNew(page);
    await form(page).getByPlaceholder(OVERVIEW).fill('A제품 온도 점검했음');
    const group = form(page).getByRole('group', { name: '추천 프로젝트' });
    assert.ok((await group.innerText()).includes('A제품 생산'));
    assert.ok(!(await group.innerText()).includes('무관한 프로젝트'));
    await group.getByRole('button', { name: 'A제품 생산' }).click();
    assert.strictEqual(await form(page).getByLabel(/^프로젝트/).inputValue(), 'pa');
    assert.strictEqual(await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').inputValue(), 'A제품 생산');
    assert.strictEqual(await form(page).getByRole('group', { name: '추천 프로젝트' }).count(), 0);
  }, { seed: scenario });

  await test('프로젝트 이름이 글에 그대로 들어 있어도 추천됨, 관련 없는 글이면 추천 없음', async ({ page }) => {
    await openNew(page);
    await form(page).getByPlaceholder(OVERVIEW).fill('무관한 프로젝트 관련 메모');
    assert.ok((await form(page).getByRole('group', { name: '추천 프로젝트' }).innerText()).includes('무관한 프로젝트'));
    await form(page).getByPlaceholder(OVERVIEW).fill('점심 메뉴 정함');
    assert.strictEqual(await form(page).getByRole('group', { name: '추천 프로젝트' }).count(), 0);
  }, { seed: scenario });

  await test('합치기로 연 새 일지 폼에서도 본문 내용으로 프로젝트가 추천됨', async ({ page }) => {
    await openSelect(page);
    await pick(page, '지게차'); await pick(page, '출입 전');
    await mergeBtn(page).click();
    await page.getByRole('button', { name: '새 일지로 만들기' }).click(); await page.waitForTimeout(600);
    assert.ok((await form(page).getByRole('group', { name: '추천 프로젝트' }).innerText()).includes('A제품 생산'));
  }, { seed: scenario });

  await test('이미 프로젝트를 골랐거나 새 프로젝트를 만드는 중이면 추천은 숨김', async ({ page }) => {
    await openNew(page);
    await form(page).getByPlaceholder(OVERVIEW).fill('A제품 온도 점검했음');
    await form(page).getByLabel(/^프로젝트/).selectOption('__new__');
    assert.strictEqual(await form(page).getByRole('group', { name: '추천 프로젝트' }).count(), 0);
  }, { seed: scenario });

  console.log('\n[합치기: 화면]');

  await test('모바일(390px): 시트가 화면 안에 들어오고 버튼 높이 44px 이상, 가로 스크롤 없음', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openSelect(page);
    await pick(page, '지게차'); await pick(page, '출입 전');
    await mergeBtn(page).click(); await page.waitForTimeout(500); // 열리는 애니메이션(크기 97%에서 시작)이 끝난 뒤에 잼
    for (const n of ['새 일지로 만들기', '기존 일지에 덧붙이기']) {
      const b = await page.getByRole('button', { name: n }).boundingBox();
      assert.ok(b.height >= 44 && b.x >= 0 && b.x + b.width <= 390, `${n} ${JSON.stringify(b)}`);
    }
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(w.sw <= w.cw);
    await page.getByRole('button', { name: '기존 일지에 덧붙이기' }).click(); await page.waitForTimeout(600);
    const r = await page.getByTestId('append-candidate').first().boundingBox();
    assert.ok(r.x >= 0 && r.x + r.width <= 390 && r.height >= 44, JSON.stringify(r));
  }, { seed: scenario });

  summary();
})();
