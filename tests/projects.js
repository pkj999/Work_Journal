// 프로젝트 기능: 프로젝트(목적·상태·마감일)를 따로 만들고, 일지를 선택적으로 연결. 연결 안 한 일지는 "현장 기록".
const { test, summary, assert, gotoEntries, goTab, settle, seed } = require('./lib');

const day = 86400000, now = Date.now();
const ymd = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const E = (id, daysAgo, title, tags, extra = {}) => ({
  id, date: ymd(now - daysAgo * day), title, category: '개발', importance: '중', bullets: [`${id} 한 일`], overview: '', problem: '', solution: '', lesson: '',
  tags, links: [], images: [], createdAt: now - daysAgo * day, updatedAt: now - daysAgo * day, ...extra,
});
const P = (id, name, status, deadlineDays, extra = {}) => ({
  id, name, purpose: '', status, deadline: deadlineDays == null ? null : ymd(now + deadlineDays * day), createdAt: now - 30 * day, updatedAt: now - 30 * day, ...extra,
});
// 진행중 2(마감 임박/지남), 보류 1, 완료 1 + 연결된 일지·현장 기록
const scenario = () => {
  const d = seed();
  d['data/projects.json'] = [
    P('pa', 'A제품 생산', '진행중', 10, { purpose: 'A제품 수율 95% 이상' }),
    P('pb', 'B설비 교체', '진행중', -2),
    P('pc', 'C라인 정리', '보류', null),
    P('pd', 'D검수 끝난 건', '완료', -20),
  ];
  d['data/entries.json'] = [
    E('a1', 10, 'A제품 가공정', ['A제품', '가공정'], { projectId: 'pa' }),
    E('a2', 5, 'A제품 나공정', ['A제품', '나공정'], { projectId: 'pa' }),
    E('a3', 1, 'A제품 다공정', ['A제품', '가공정'], { projectId: 'pa' }),
    E('b1', 3, 'B설비 점검', ['B설비'], { projectId: 'pb' }),
    E('d1', 40, 'D 마무리', [], { projectId: 'pd' }),
    E('f1', 2, '현장 둘러본 것', ['현장']),            // 프로젝트 없음 = 현장 기록
    E('x1', 4, '옛 업무명 기록', [], { projectId: 'ghost' }), // 없는 프로젝트를 가리킴 → 프로젝트 없는 기록으로 취급
    E('t1', 6, '삭제된 연결 기록', ['A제품'], { projectId: 'pa', deleted: true, deletedAt: now - day }),
  ];
  return d;
};
const openMore = async page => { await gotoEntries(page); await page.getByRole('button', { name: '모아보기' }).click(); await page.waitForTimeout(400); };
const cards = page => page.getByTestId('project-card');
const cardText = async (page, name) => (await cards(page).filter({ hasText: name }).first().innerText()).replace(/\s+/g, ' ');
const timeline = page => page.getByTestId('timeline-card');
const putsOf = (fake, path) => fake.puts.filter(x => x.path === path);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const T = (name, fn, opts = {}) => test(name, fn, { seed: scenario, ...opts }); // 기본 데이터 = 프로젝트 4개 + 연결된 일지
(async () => {
  console.log('\n[프로젝트: 만들기·목록]');

  await test('프로젝트가 없으면 안내 문구, 옛 업무명 칩은 그대로 보임(기존 사용 방식 유지)', async ({ page }) => {
    await openMore(page);
    assert.ok(await page.locator('text=아직 프로젝트가 없어요').count() === 1);
    assert.strictEqual(await cards(page).count(), 0);
    assert.ok(await page.getByRole('group', { name: '업무명' }).count() === 1);
  });

  await test('[새 프로젝트] → 이름 입력 → 만들기: 진행중으로 1번만 저장, 카드가 생기고 바로 선택됨', async ({ page, fake }) => {
    await openMore(page);
    await page.getByRole('button', { name: '새 프로젝트' }).click();
    await page.getByLabel('새 프로젝트 이름').fill('  신규 라인 구축  ');
    await page.getByRole('button', { name: '만들기' }).click();
    await settle(page);
    const saved = fake.get('data/projects.json');
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].name, '신규 라인 구축');
    assert.strictEqual(saved[0].status, '진행중'); assert.strictEqual(saved[0].deadline, null);
    assert.strictEqual(putsOf(fake, 'data/projects.json').length, 1);
    assert.strictEqual(await cards(page).count(), 1);
    assert.strictEqual(await page.getByTestId('project-detail').count(), 1);
  });

  await test('이름을 연타해서 만들거나 같은 이름을 또 만들어도 프로젝트는 1개', async ({ page, fake }) => {
    await openMore(page);
    await page.getByRole('button', { name: '새 프로젝트' }).click();
    await page.getByLabel('새 프로젝트 이름').fill('중복 테스트');
    const btn = page.getByRole('button', { name: '만들기' });
    await btn.dblclick(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').length, 1);
    await page.getByRole('button', { name: '새 프로젝트' }).click();
    await page.getByLabel('새 프로젝트 이름').fill('중복 테스트');
    await page.getByRole('button', { name: '만들기' }).click(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').length, 1, '같은 이름은 새로 만들지 않음');
    assert.strictEqual(putsOf(fake, 'data/projects.json').length, 1, '같은 이름이면 저장도 안 함(내용이 같은 저장을 또 하지 않음)');
    assert.strictEqual(await cards(page).count(), 1);
  });

  await test('저장 실패하면 카드가 생기지 않고 안내가 뜸, 입력한 이름은 남아 있어 다시 시도 가능', async ({ page, fake }) => {
    await openMore(page);
    fake.failNext.push({ path: 'data/projects.json', status: 500 });
    await page.getByRole('button', { name: '새 프로젝트' }).click();
    await page.getByLabel('새 프로젝트 이름').fill('실패 테스트');
    await page.getByRole('button', { name: '만들기' }).click(); await settle(page);
    assert.strictEqual(await cards(page).count(), 0);
    assert.ok(await page.locator('text=프로젝트 저장 실패').count() >= 1);
    assert.strictEqual(await page.getByLabel('새 프로젝트 이름').inputValue(), '실패 테스트');
    await page.getByRole('button', { name: '만들기' }).click(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').length, 1);
  });

  await test('빈 이름(공백)은 만들기 버튼이 눌리지 않음', async ({ page, fake }) => {
    await openMore(page);
    await page.getByRole('button', { name: '새 프로젝트' }).click();
    await page.getByLabel('새 프로젝트 이름').fill('   ');
    assert.ok(await page.getByRole('button', { name: '만들기' }).isDisabled());
    assert.strictEqual(fake.get('data/projects.json'), null);
  });

  console.log('\n[프로젝트: 카드 목록]');

  await T('정렬: 진행중(마감 빠른 순) → 보류, 완료는 접혀 있고 펼치면 보임', async ({ page }) => {
    await openMore(page);
    const names = (await cards(page).allInnerTexts()).map(t => t.split('\n')[0]);
    assert.deepStrictEqual(names, ['B설비 교체', 'A제품 생산', 'C라인 정리']);
    assert.ok(await page.getByRole('button', { name: /완료한 프로젝트/ }).count() === 1);
    await page.getByRole('button', { name: /완료한 프로젝트/ }).click();
    assert.strictEqual(await cards(page).count(), 4);
    assert.ok((await cards(page).last().innerText()).includes('D검수 끝난 건'));
  });

  await T('카드에 상태·마감(D-n / n일 지남)·기록 수·마지막 기록 날짜가 보이고 ISO 날짜는 안 보임', async ({ page }) => {
    await openMore(page);
    const a = await cardText(page, 'A제품 생산');
    assert.ok(a.includes('진행중') && a.includes('D-10'), a);
    assert.ok(a.includes('기록 3건'), '삭제된 기록은 세지 않음: ' + a);
    assert.ok(/마지막 \d{4}\.\d{2}\.\d{2} \([월화수목금토일]\)/.test(a), a);
    assert.ok(a.includes('A제품 수율 95% 이상'), '목적 한 줄');
    const b = await cardText(page, 'B설비 교체');
    assert.ok(b.includes('2일 지남'), b);
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(await page.locator('body').innerText()), '화면에 ISO 날짜가 보이면 안 됨');
  });

  await T('마감 경고색은 진행중일 때만: 지남=빨강, 보류·완료는 회색(경고 안 함)', async ({ page }) => {
    await openMore(page);
    await page.getByRole('button', { name: /완료한 프로젝트/ }).click();
    // Tailwind v4는 oklch 색을 쓰므로 canvas에 칠해서 rgb로 바꿔 읽음
    const col = async name => cards(page).filter({ hasText: name }).first().getByTestId('project-deadline').evaluate(el => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.fillStyle = getComputedStyle(el).color; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3); });
    const isRed = ([r, g, b]) => r > g + 60 && r > b + 60;
    assert.ok(isRed(await col('B설비 교체')), '진행중+지남은 빨강');
    assert.ok(!isRed(await col('D검수 끝난 건')), '완료는 빨강 아님');
    await cards(page).filter({ hasText: 'D검수 끝난 건' }).click();
    assert.ok(!(await cards(page).filter({ hasText: 'D검수 끝난 건' }).innerText()).includes('오늘 마감'));
  });

  await T('마감이 없는 프로젝트(보류)는 마감 표시 없음', async ({ page }) => {
    await openMore(page);
    assert.strictEqual(await cards(page).filter({ hasText: 'C라인 정리' }).getByTestId('project-deadline').count(), 0);
  });

  console.log('\n[프로젝트: 선택 → 기록 모아보기]');

  await T('프로젝트 카드 선택 → 그 프로젝트에 연결된 기록만 날짜순(오래된 것 위), 다시 누르면 해제', async ({ page }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    const t = (await timeline(page).allInnerTexts()).map(x => x.replace(/\s+/g, ' '));
    assert.strictEqual(t.length, 3);
    assert.ok(t[0].includes('a1 한 일') && t[1].includes('a2 한 일') && t[2].includes('a3 한 일'), t.join(' | '));
    assert.ok(await cards(page).filter({ hasText: 'A제품 생산' }).getAttribute('aria-pressed') === 'true');
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    assert.strictEqual(await timeline(page).count(), 0);
  });

  await T('프로젝트 + 태그 선택 = 둘 다 맞는 기록만(AND)', async ({ page }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    await page.getByRole('group', { name: '태그' }).getByRole('button', { name: /^가공정/ }).click();
    assert.strictEqual(await timeline(page).count(), 2);
    await page.getByRole('group', { name: '태그' }).getByRole('button', { name: /^나공정/ }).click();
    assert.strictEqual(await timeline(page).count(), 0, '가공정+나공정 모두 달린 A 기록은 없음');
  });

  await T('제목이 프로젝트 이름과 다르면 타임라인 카드에 제목도 보임', async ({ page }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    assert.ok((await timeline(page).first().innerText()).includes('A제품 가공정'));
  });

  await T('프로젝트 없는 기록(현장 기록·없는 프로젝트를 가리키는 기록)은 "연결 안 된 기록"의 업무명 칩으로만 모임', async ({ page }) => {
    await openMore(page);
    assert.strictEqual(await page.getByRole('group', { name: '업무명' }).count(), 0, '프로젝트가 있으면 접혀 있음');
    await page.getByRole('button', { name: /프로젝트에 연결 안 된 기록/ }).click();
    const g = page.getByRole('group', { name: '업무명' });
    const txt = (await g.innerText()).replace(/\s+/g, ' ');
    assert.ok(txt.includes('현장 둘러본 것') && txt.includes('옛 업무명 기록'), txt);
    assert.ok(!txt.includes('A제품 가공정'), '프로젝트에 연결된 기록은 여기 없음');
    await g.getByRole('button', { name: /^현장 둘러본 것/ }).click();
    assert.strictEqual(await timeline(page).count(), 1);
  });

  await T('프로젝트 선택과 업무명 선택은 동시에 걸리지 않음(하나 고르면 다른 쪽 해제)', async ({ page }) => {
    await openMore(page);
    await page.getByRole('button', { name: /프로젝트에 연결 안 된 기록/ }).click();
    await page.getByRole('group', { name: '업무명' }).getByRole('button', { name: /^현장 둘러본 것/ }).click();
    await cards(page).filter({ hasText: 'B설비 교체' }).click();
    assert.strictEqual(await timeline(page).count(), 1);
    assert.ok((await timeline(page).first().innerText()).includes('b1 한 일'));
    assert.strictEqual(await page.getByRole('group', { name: '업무명' }).getByRole('button', { name: /^현장/ }).getAttribute('aria-pressed'), 'false');
  });

  await T('프로젝트에 기록이 하나도 없어도 카드가 보이고 "아직 기록 없음"', async ({ page }) => {
    await openMore(page);
    assert.ok((await cardText(page, 'C라인 정리')).includes('기록 0건 · 아직 기록 없음'));
    await cards(page).filter({ hasText: 'C라인 정리' }).click();
    assert.strictEqual(await timeline(page).count(), 0);
    assert.ok(await page.locator('text=조건에 모두 맞는 일지가 없어요').count() >= 1);
  });

  await T('일지가 하나도 없어도 프로젝트 카드가 보이고 새 프로젝트도 만들 수 있음(빈 상태 문구에 막히지 않음)', async ({ page, fake }) => {
    await openMore(page);
    assert.strictEqual(await cards(page).count(), 1);
    assert.strictEqual(await page.locator('text=아직 모아볼 일지가 없어요').count(), 0);
    await page.getByRole('button', { name: '새 프로젝트' }).click();
    await page.getByLabel('새 프로젝트 이름').fill('두 번째'); await page.getByRole('button', { name: '만들기' }).click(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').length, 2);
  }, { seed: () => { const d = seed(); d['data/entries.json'] = []; d['data/projects.json'] = [P('pz', '기록 없는 프로젝트', '진행중', null)]; return d; } });

  console.log('\n[프로젝트: 상세 편집]');

  await T('상태 바꾸기: 한 번 누르면 파일에 1번만 저장, 카드 배지·정렬이 바뀜', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    await page.getByRole('group', { name: '상태' }).getByRole('button', { name: '보류' }).click(); await settle(page);
    assert.strictEqual(putsOf(fake, 'data/projects.json').length, 1);
    assert.strictEqual(fake.get('data/projects.json').find(x => x.id === 'pa').status, '보류');
    const names = (await cards(page).allInnerTexts()).map(t => t.split('\n')[0]);
    assert.deepStrictEqual(names, ['B설비 교체', 'A제품 생산', 'C라인 정리'], '진행중 B 다음에 보류 둘(마감 있는 A가 먼저)');
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 0, '일지 파일은 건드리지 않음');
  });

  await T('같은 상태를 다시 눌러도 저장하지 않음', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    await page.getByRole('group', { name: '상태' }).getByRole('button', { name: '진행중' }).click(); await settle(page);
    assert.strictEqual(putsOf(fake, 'data/projects.json').length, 0);
  });

  await T('완료로 바꾸면 완료 목록으로 이동하지만 선택·상세는 유지됨', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    await page.getByRole('group', { name: '상태' }).getByRole('button', { name: '완료' }).click(); await settle(page);
    assert.strictEqual(await page.getByTestId('project-detail').count(), 1);
    assert.strictEqual(await timeline(page).count(), 3);
    assert.strictEqual(fake.get('data/projects.json').find(x => x.id === 'pa').status, '완료');
    assert.ok((await cardText(page, 'A제품 생산')).includes('완료'), '카드 배지가 완료로 바뀜');
  });

  await T('목적: 입력칸을 벗어나면 저장, 바뀐 게 없으면 저장 안 함', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'B설비 교체' }).click();
    const box = page.getByLabel(/^목적/);
    await box.click(); await page.getByLabel('프로젝트 이름').click(); await settle(page);
    assert.strictEqual(putsOf(fake, 'data/projects.json').length, 0, '안 바꾸고 벗어나면 저장 없음');
    await box.fill('노후 설비 교체로 가동 중단 줄이기');
    await page.getByLabel('프로젝트 이름').click(); await settle(page);
    assert.strictEqual(putsOf(fake, 'data/projects.json').length, 1);
    assert.strictEqual(fake.get('data/projects.json').find(x => x.id === 'pb').purpose, '노후 설비 교체로 가동 중단 줄이기');
  });

  await T('마감일 지정 → D-n 표시, [마감 지우기] → 마감 표시 사라짐', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'C라인 정리' }).click();
    await page.getByLabel(/^마감일/).fill(ymd(now + 3 * day)); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').find(x => x.id === 'pc').deadline, ymd(now + 3 * day));
    assert.ok((await cardText(page, 'C라인 정리')).includes('D-3'));
    await page.getByRole('button', { name: '마감 지우기' }).click(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').find(x => x.id === 'pc').deadline, null);
    assert.strictEqual(await cards(page).filter({ hasText: 'C라인 정리' }).getByTestId('project-deadline').count(), 0);
  });

  await T('마감일이 오늘이면 "오늘 마감"(경고색 노랑)', async ({ page }) => {
    await openMore(page);
    assert.ok((await cardText(page, '오늘 끝낼 일')).includes('오늘 마감'));
  }, { seed: () => { const d = seed(); d['data/projects.json'] = [P('pt', '오늘 끝낼 일', '진행중', 0)]; return d; } });

  await T('이름 바꾸기: 새 이름 저장, 일지의 연결은 그대로(프로젝트 이름만 바뀜)', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    const nm = page.getByLabel('프로젝트 이름');
    await nm.fill('A제품 양산'); await page.getByLabel(/^목적/).click(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').find(x => x.id === 'pa').name, 'A제품 양산');
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 0);
    assert.strictEqual(await timeline(page).count(), 3, '이름을 바꿔도 같은 기록이 모임');
  });

  await T('이름을 비우거나 다른 프로젝트와 같게 바꾸면 되돌리고 안내, 저장 안 함', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    const nm = page.getByLabel('프로젝트 이름');
    await nm.fill('B설비 교체'); await page.getByLabel(/^목적/).click(); await settle(page);
    assert.strictEqual(await nm.inputValue(), 'A제품 생산');
    assert.ok(await page.locator('text=같은 이름의 프로젝트가 이미 있어요').count() === 1);
    await nm.fill('   '); await page.getByLabel(/^목적/).click(); await settle(page);
    assert.strictEqual(await nm.inputValue(), 'A제품 생산');
    assert.ok(await page.locator('text=이름은 비울 수 없어요').count() === 1);
    assert.strictEqual(putsOf(fake, 'data/projects.json').length, 0);
  });

  await T('프로젝트를 바꿔 선택하면 상세 입력칸이 그 프로젝트 내용으로 바뀜(이전 입력이 안 남음)', async ({ page }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    assert.strictEqual(await page.getByLabel('프로젝트 이름').inputValue(), 'A제품 생산');
    await cards(page).filter({ hasText: 'B설비 교체' }).click();
    assert.strictEqual(await page.getByLabel('프로젝트 이름').inputValue(), 'B설비 교체');
    assert.strictEqual(await page.getByLabel(/^목적/).inputValue(), '');
  });

  console.log('\n[프로젝트: 삭제·되돌리기·충돌]');

  await T('삭제 → 카드 사라짐 + [실행취소] 토스트, 기록은 그대로(현장 기록처럼 보임), 일지 파일은 안 건드림', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    await page.getByRole('button', { name: '프로젝트 삭제' }).click(); await settle(page);
    assert.strictEqual(await cards(page).filter({ hasText: 'A제품 생산' }).count(), 0);
    assert.strictEqual(await page.getByTestId('project-detail').count(), 0);
    const saved = fake.get('data/projects.json').find(x => x.id === 'pa');
    assert.ok(saved.deleted === true && saved.deletedAt, '지운 게 아니라 deleted 표시');
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.projectId === 'pa').length, 4, '기록의 연결 정보는 그대로(삭제된 기록 1건 포함)');
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 0);
    await page.getByRole('button', { name: /연결 안 된 기록/ }).click();
    assert.ok((await page.getByRole('group', { name: '업무명' }).innerText()).includes('A제품 가공정'), '연결이 끊어진 기록은 업무명 칩으로 모임');
    await page.getByRole('button', { name: '실행취소' }).click(); await settle(page);
    assert.strictEqual(await cards(page).filter({ hasText: 'A제품 생산' }).count(), 1);
    assert.ok(!fake.get('data/projects.json').find(x => x.id === 'pa').deleted);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    assert.strictEqual(await timeline(page).count(), 3, '되돌리면 기록이 다시 프로젝트에 모임');
  });

  await T('삭제 저장에 실패하면 카드가 그대로 남고 "삭제했어요" 안내는 안 나옴', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    fake.failNext.push({ path: 'data/projects.json', status: 500 });
    await page.getByRole('button', { name: '프로젝트 삭제' }).click(); await settle(page);
    assert.strictEqual(await cards(page).filter({ hasText: 'A제품 생산' }).count(), 1);
    assert.strictEqual(await page.locator('text=를 삭제했어요').count(), 0);
  });

  await T('다른 기기가 먼저 프로젝트를 추가해서 충돌(409)해도 내 수정과 상대 추가가 둘 다 남음', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'B설비 교체' }).click();
    fake.conflictNext.add('data/projects.json');
    fake.externalWrite['data/projects.json'] = cur => [P('px', '다른 기기에서 만든 것', '진행중', null), ...cur];
    await page.getByRole('group', { name: '상태' }).getByRole('button', { name: '보류' }).click(); await settle(page);
    const saved = fake.get('data/projects.json');
    assert.ok(saved.find(x => x.id === 'px'), '상대 추가가 살아있어야 함');
    assert.strictEqual(saved.find(x => x.id === 'pb').status, '보류');
    assert.strictEqual(saved.length, 5);
  });

  await T('연달아 두 가지(상태+마감)를 바꿔도 둘 다 저장됨(순서대로 저장, 서로 덮어쓰지 않음)', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'C라인 정리' }).click();
    await page.getByRole('group', { name: '상태' }).getByRole('button', { name: '진행중' }).click();
    await page.getByLabel(/^마감일/).fill(ymd(now + 5 * day));
    await settle(page); await settle(page);
    const c = fake.get('data/projects.json').find(x => x.id === 'pc');
    assert.strictEqual(c.status, '진행중'); assert.strictEqual(c.deadline, ymd(now + 5 * day));
  });

  console.log('\n[프로젝트: 일지 작성 폼]');

  const openNew = async page => { await gotoEntries(page); await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500); };
  const form = page => page.locator('form').first();
  const save = async page => { await page.getByRole('button', { name: '저장', exact: true }).click(); await settle(page); };
  const TITLE = '예: ○○ 설비 트러블슈팅 대응';

  await T('폼에 "프로젝트" 선택칸이 있고 기본은 "프로젝트 없음 · 현장 기록", 진행중·보류가 목록에 있음(완료는 맨 뒤 표기)', async ({ page }) => {
    await openNew(page);
    const sel = form(page).getByLabel(/^프로젝트/);
    assert.strictEqual(await sel.inputValue(), '');
    const opts = await sel.locator('option').allInnerTexts();
    assert.strictEqual(opts[0], '프로젝트 없음 · 현장 기록');
    assert.ok(opts.includes('A제품 생산') && opts.includes('C라인 정리 (보류)') && opts.includes('D검수 끝난 건 (완료)'), opts.join(' | '));
    assert.strictEqual(opts[opts.length - 1], '+ 새 프로젝트 만들기…');
    assert.ok(opts.indexOf('D검수 끝난 건 (완료)') > opts.indexOf('C라인 정리 (보류)'));
  });

  await T('프로젝트를 고르면 업무명이 비어 있을 때만 프로젝트 이름이 채워짐, 저장하면 projectId가 들어감', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByLabel(/^프로젝트/).selectOption('pa');
    assert.strictEqual(await form(page).getByPlaceholder(TITLE).inputValue(), 'A제품 생산');
    await form(page).getByPlaceholder(TITLE).fill('A제품 라공정');
    await form(page).getByLabel(/^프로젝트/).selectOption('pb');
    assert.strictEqual(await form(page).getByPlaceholder(TITLE).inputValue(), 'A제품 라공정', '쓴 업무명은 덮어쓰지 않음');
    await form(page).getByLabel(/^프로젝트/).selectOption('pa');
    await save(page);
    const e = fake.get('data/entries.json').find(x => x.title === 'A제품 라공정');
    assert.strictEqual(e.projectId, 'pa');
  });

  await T('프로젝트 없이 저장하면 현장 기록(projectId 빈 값), 모든 기존 필드는 그대로', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByPlaceholder(TITLE).fill('그냥 본 것');
    await save(page);
    const e = fake.get('data/entries.json').find(x => x.title === '그냥 본 것');
    assert.ok(!e.projectId, 'projectId 없음');
    for (const k of ['date', 'title', 'category', 'importance', 'bullets', 'overview', 'problem', 'solution', 'lesson', 'tags', 'links']) assert.ok(k in e, k);
  });

  await T('폼에서 [+ 새 프로젝트 만들기…] → 이름 → 만들기: 프로젝트가 저장되고 자동 선택, 일지에 연결', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByLabel(/^프로젝트/).selectOption('__new__');
    await form(page).getByLabel('새 프로젝트 이름').fill('폼에서 만든 프로젝트');
    await form(page).getByRole('button', { name: '만들기' }).click(); await settle(page);
    const pr = fake.get('data/projects.json').find(x => x.name === '폼에서 만든 프로젝트');
    assert.ok(pr && pr.status === '진행중');
    assert.strictEqual(await form(page).getByLabel(/^프로젝트/).inputValue(), pr.id);
    assert.strictEqual(await form(page).getByPlaceholder(TITLE).inputValue(), '폼에서 만든 프로젝트');
    await save(page);
    assert.strictEqual(fake.get('data/entries.json').find(x => x.title === '폼에서 만든 프로젝트').projectId, pr.id);
  });

  await T('폼에서 이미 있는 이름으로 새 프로젝트를 만들면 기존 프로젝트가 선택됨(중복 안 생김)', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByLabel(/^프로젝트/).selectOption('__new__');
    await form(page).getByLabel('새 프로젝트 이름').fill('B설비 교체');
    await form(page).getByRole('button', { name: '만들기' }).click(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').length, 4);
    assert.strictEqual(await form(page).getByLabel(/^프로젝트/).inputValue(), 'pb');
  });

  await T('폼에서 프로젝트 만들기가 실패하면 선택은 그대로, 일지 저장은 영향 없음', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByLabel(/^프로젝트/).selectOption('__new__');
    await form(page).getByLabel('새 프로젝트 이름').fill('실패할 것');
    fake.failNext.push({ path: 'data/projects.json', status: 500 });
    await form(page).getByRole('button', { name: '만들기' }).click(); await settle(page);
    assert.ok(!fake.get('data/projects.json').find(x => x.name === '실패할 것'));
    await form(page).getByLabel(/^프로젝트/).selectOption('');
    await form(page).getByPlaceholder(TITLE).fill('프로젝트 없이');
    await save(page);
    assert.ok(fake.get('data/entries.json').find(x => x.title === '프로젝트 없이'));
  });

  await T('일지 수정: 연결된 프로젝트가 미리 선택돼 있고, 현장 기록으로 바꾸면 projectId가 사라짐', async ({ page, fake }) => {
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('A제품 다공정'); await page.waitForTimeout(400);
    await page.locator('[aria-label="일지 수정"]').first().click(); await page.waitForTimeout(500);
    assert.strictEqual(await form(page).getByLabel(/^프로젝트/).inputValue(), 'pa');
    await form(page).getByLabel(/^프로젝트/).selectOption('');
    await page.getByRole('button', { name: '수정 저장', exact: true }).click(); await settle(page);
    assert.ok(!fake.get('data/entries.json').find(x => x.id === 'a3').projectId);
    assert.strictEqual(fake.get('data/entries.json').find(x => x.id === 'a3').title, 'A제품 다공정', '업무명은 그대로');
  });

  await T('없는 프로젝트(ghost)를 가리키는 일지를 수정해도 선택칸은 "없음", 저장하면 projectId가 정리됨', async ({ page, fake }) => {
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('옛 업무명 기록'); await page.waitForTimeout(400);
    await page.locator('[aria-label="일지 수정"]').first().click(); await page.waitForTimeout(500);
    assert.strictEqual(await form(page).getByLabel(/^프로젝트/).inputValue(), '');
    await form(page).getByLabel(/^프로젝트/).selectOption('pb');
    await page.getByRole('button', { name: '수정 저장', exact: true }).click(); await settle(page);
    assert.strictEqual(fake.get('data/entries.json').find(x => x.id === 'x1').projectId, 'pb');
  });

  await T('일지 카드에 프로젝트 이름이 보임(현장 기록·없는 프로젝트 기록에는 안 보임)', async ({ page }) => {
    await gotoEntries(page);
    const card = t => page.locator('[data-testid="entry-project"]').filter({ hasText: t });
    assert.ok(await card('A제품 생산').count() >= 3, 'A 기록 3건');
    assert.strictEqual(await page.locator('[data-testid="entry-project"]').filter({ hasText: 'ghost' }).count(), 0);
    const total = await page.locator('[data-testid="entry-project"]').count();
    assert.strictEqual(total, 5, 'a1 a2 a3 b1 d1 만(현장 기록 f1·없는 프로젝트 x1 제외)');
  });

  await T('같은 이름의 프로젝트가 삭제된 상태면 그 이름으로 새로 만들 수 있음', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByLabel(/^프로젝트/).selectOption('__new__');
    await form(page).getByLabel('새 프로젝트 이름').fill('옛날 프로젝트');
    await form(page).getByRole('button', { name: '만들기' }).click(); await settle(page);
    const live = fake.get('data/projects.json').filter(x => x.name === '옛날 프로젝트' && !x.deleted);
    assert.strictEqual(live.length, 1);
    assert.notStrictEqual(live[0].id, 'old');
  }, { seed: () => { const d = seed(); d['data/projects.json'] = [P('old', '옛날 프로젝트', '진행중', null, { deleted: true, deletedAt: now })]; return d; } });


  console.log('\n[프로젝트: 옛 기록 묶기·이어쓰기]');

  const legacyScenario = () => {
    const d = seed();
    d['data/entries.json'] = [
      E('l1', 9, 'Z제품 시험', ['Z']), E('l2', 6, 'Z제품 시험', []), E('l3', 3, 'Z제품 시험', []),
      E('l4', 2, 'Z제품 시험', [], { deleted: true, deletedAt: now - day }),
      E('l5', 1, '다른 업무', []),
      E('l6', 4, 'Z제품 시험', [], { projectId: 'pa' }), // 이미 다른 프로젝트에 연결된 건 건드리지 않음
    ];
    d['data/projects.json'] = [P('pa', '이미 있는 프로젝트', '진행중', null)];
    return d;
  };
  const openLegacy = async page => { await openMore(page); await page.getByRole('button', { name: /프로젝트에 연결 안 된 기록/ }).click(); await page.getByRole('group', { name: '업무명' }).getByRole('button', { name: /^Z제품 시험/ }).click(); };

  await T('업무명을 고르면 [프로젝트로 만들기]가 보이고, 누르면 같은 업무명의 연결 안 된 일지만 1번 저장으로 묶임(삭제됨·다른 프로젝트 일지는 그대로)', async ({ page, fake }) => {
    await openLegacy(page);
    await page.getByRole('button', { name: /프로젝트로 만들기/ }).click(); await settle(page);
    const ps = fake.get('data/projects.json'); const pr = ps.find(x => x.name === 'Z제품 시험');
    assert.ok(pr && pr.status === '진행중');
    const es = fake.get('data/entries.json');
    assert.deepStrictEqual(['l1', 'l2', 'l3'].map(id => es.find(e => e.id === id).projectId), [pr.id, pr.id, pr.id]);
    assert.ok(!es.find(e => e.id === 'l4').projectId, '휴지통 일지는 그대로');
    assert.strictEqual(es.find(e => e.id === 'l6').projectId, 'pa');
    assert.ok(!es.find(e => e.id === 'l5').projectId);
    assert.strictEqual(putsOf(fake, 'data/entries.json').length, 1, '일지 파일 저장 1번');
    assert.strictEqual(es.find(e => e.id === 'l1').updatedAt, now - 9 * day, '수정 시각은 바뀌지 않음');
    assert.strictEqual(await timeline(page).count(), 3, '새 프로젝트가 선택돼 3건이 모임');
    assert.strictEqual(await page.getByTestId('project-detail').count(), 1);
  }, { seed: legacyScenario });

  await T('묶은 뒤 [실행취소] → 일지 연결이 원래대로, 새로 만든 프로젝트는 삭제 표시', async ({ page, fake }) => {
    await openLegacy(page);
    await page.getByRole('button', { name: /프로젝트로 만들기/ }).click(); await settle(page);
    await page.getByRole('button', { name: '실행취소' }).click(); await settle(page); await settle(page);
    const es = fake.get('data/entries.json');
    assert.ok(['l1', 'l2', 'l3'].every(id => !es.find(e => e.id === id).projectId));
    assert.strictEqual(es.find(e => e.id === 'l6').projectId, 'pa');
    assert.ok(fake.get('data/projects.json').find(x => x.name === 'Z제품 시험').deleted);
    assert.strictEqual(await cards(page).filter({ hasText: 'Z제품 시험' }).count(), 0);
  }, { seed: legacyScenario });

  await T('같은 이름의 프로젝트가 이미 있으면 새로 만들지 않고 거기로 묶음(되돌려도 그 프로젝트는 남음)', async ({ page, fake }) => {
    await openLegacy(page);
    await page.getByRole('button', { name: /프로젝트로 만들기/ }).click(); await settle(page);
    assert.strictEqual(fake.get('data/projects.json').filter(x => x.name === 'Z제품 시험').length, 1);
    await page.getByRole('button', { name: '실행취소' }).click(); await settle(page); await settle(page);
    assert.ok(!fake.get('data/projects.json').find(x => x.name === 'Z제품 시험').deleted);
  }, { seed: () => { const d = legacyScenario(); d['data/projects.json'].push(P('pz', 'Z제품 시험', '진행중', null)); return d; } });

  await T('묶기 저장이 실패하면 일지는 그대로이고 안내가 뜸', async ({ page, fake }) => {
    await openLegacy(page);
    fake.failNext.push({ path: 'data/entries.json', status: 500 });
    await page.getByRole('button', { name: /프로젝트로 만들기/ }).click(); await settle(page);
    assert.ok(['l1', 'l2', 'l3'].every(id => !fake.get('data/entries.json').find(e => e.id === id).projectId), '일지 연결이 하나도 안 바뀜');
    assert.ok(await page.locator('text=묶기 실패').count() >= 1);
  }, { seed: legacyScenario });

  await T('프로젝트 상세의 [이 프로젝트에 기록 쓰기] → 폼이 그 프로젝트·이름으로 채워져 열리고 저장하면 연결됨', async ({ page, fake }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    await page.getByRole('button', { name: '이 프로젝트에 기록 쓰기' }).click(); await page.waitForTimeout(500);
    assert.strictEqual(await form(page).getByLabel(/^프로젝트/).inputValue(), 'pa');
    assert.strictEqual(await form(page).getByPlaceholder(TITLE).inputValue(), 'A제품 생산');
    await form(page).getByPlaceholder(TITLE).fill('A제품 마무리');
    await save(page);
    assert.strictEqual(fake.get('data/entries.json').find(x => x.title === 'A제품 마무리').projectId, 'pa');
    await page.getByRole('button', { name: '새 일지 작성' }).click().catch(() => {});
  }, { seed: scenario });

  await T('이어쓰기로 열었다 닫은 뒤 [새 일지 작성]을 누르면 프로젝트 선택이 비어 있음(이전 값이 안 남음)', async ({ page }) => {
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    await page.getByRole('button', { name: '이 프로젝트에 기록 쓰기' }).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /닫기|취소/ }).first().click().catch(() => {});
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    if (await form(page).count()) { await page.getByRole('button', { name: /닫기|취소/ }).first().click(); await page.waitForTimeout(300); }
    await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500);
    assert.strictEqual(await form(page).getByLabel(/^프로젝트/).inputValue(), '');
    assert.strictEqual(await form(page).getByPlaceholder(TITLE).inputValue(), '');
  }, { seed: scenario });

  console.log('\n[프로젝트: 백업·내보내기]');

  const gotoSettings = async page => { await goTab(page, '설정'); };
  const importJson = async (page, payload) => {
    await page.locator('input[type=file][accept=".json"]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await settle(page); await settle(page);
  };

  await T('JSON 백업 파일에 프로젝트 4개와 일지의 projectId가 들어감', async ({ page, fake }) => {
    await gotoSettings(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSON 백업', exact: true }).click()]);
    const body = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
    assert.strictEqual(body.projects.length, 4);
    assert.strictEqual(body.entries.find(e => e.id === 'a1').projectId, 'pa');
  }, { seed: scenario });

  await T('JSON 가져오기: 프로젝트 새로 추가 + 일지 projectId 연결 유지, 같은 이름 프로젝트는 합쳐서 연결', async ({ page, fake }) => {
    await gotoSettings(page);
    await importJson(page, {
      projects: [
        { id: 'new1', name: '가져온 프로젝트', status: '보류', deadline: null, purpose: '목적', createdAt: 1, updatedAt: 1 },
        { id: 'zz', name: 'A제품 생산', status: '진행중', deadline: null, createdAt: 1, updatedAt: 1 },   // 이미 있는 이름
      ],
      entries: [
        E('i1', 9, '가져온 기록 1', [], { projectId: 'new1' }),
        E('i2', 8, '가져온 기록 2', [], { projectId: 'zz' }),
        E('i3', 7, '가져온 기록 3', [], { projectId: 'nonexistent' }),
      ],
    });
    const ps = fake.get('data/projects.json');
    assert.strictEqual(ps.filter(x => x.name === '가져온 프로젝트').length, 1);
    assert.strictEqual(ps.filter(x => x.name === 'A제품 생산').length, 1, '같은 이름은 새로 만들지 않음');
    assert.strictEqual(ps.find(x => x.name === '가져온 프로젝트').status, '보류');
    const es = fake.get('data/entries.json');
    assert.strictEqual(es.find(x => x.id === 'i1').projectId, 'new1');
    assert.strictEqual(es.find(x => x.id === 'i2').projectId, 'pa', '이미 있는 프로젝트로 연결');
    assert.ok(!es.find(x => x.id === 'i3').projectId, '없는 프로젝트는 연결 안 함');
  }, { seed: scenario });

  await T('JSON 가져오기: 프로젝트만 들어 있는 백업도 가져와짐', async ({ page, fake }) => {
    await gotoSettings(page);
    await importJson(page, { projects: [{ id: 'only', name: '프로젝트만', status: '진행중', deadline: null, createdAt: 1, updatedAt: 1 }] });
    assert.ok(fake.get('data/projects.json').find(x => x.name === '프로젝트만'));
  });

  await T('JSON 가져오기: 삭제된 프로젝트는 가져오지 않고, 잘못된 상태값은 진행중으로', async ({ page, fake }) => {
    await gotoSettings(page);
    await importJson(page, { projects: [
      { id: 'd', name: '지운 것', status: '진행중', deleted: true, createdAt: 1, updatedAt: 1 },
      { id: 'w', name: '이상한 상태', status: '???', createdAt: 1, updatedAt: 1 },
    ] });
    const ps = fake.get('data/projects.json') || [];
    assert.ok(!ps.find(x => x.name === '지운 것'));
    assert.strictEqual(ps.find(x => x.name === '이상한 상태').status, '진행중');
  });

  await T('엑셀 내보내기: 업무일지 시트에 프로젝트·업무명 칸, 프로젝트 시트가 따로 생김', async ({ page, fake }) => {
    await gotoSettings(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /엑셀\(\.xlsx\)/ }).click()]);
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(await dl.path());
    assert.deepStrictEqual(wb.SheetNames.slice(0, 2), ['업무일지', '프로젝트']);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['업무일지']);
    const r = rows.find(x => x['업무명'] === 'A제품 가공정');
    assert.strictEqual(r['프로젝트'], 'A제품 생산');
    const prs = XLSX.utils.sheet_to_json(wb.Sheets['프로젝트']);
    assert.strictEqual(prs.length, 4);
    assert.strictEqual(prs.find(x => x['프로젝트'] === 'A제품 생산')['기록수'], 3);
  }, { seed: scenario });

  console.log('\n[프로젝트: 오프라인·화면]');

  await test('프로젝트 파일이 아직 없는 저장소(기존 사용자)도 오류 없이 열림', async ({ page, errors }) => {
    await openMore(page);
    assert.strictEqual(await cards(page).count(), 0);
  });

  await T('모바일(390px): 가로 스크롤 없음, 카드·버튼 높이 충분(칩 36px / 텍스트 버튼 40px), 입력칸 폰트 가독', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openMore(page);
    await cards(page).filter({ hasText: 'A제품 생산' }).click();
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(w.sw <= w.cw, `가로 스크롤 ${w.sw} > ${w.cw}`);
    for (const n of ['진행중', '보류', '완료']) {
      const h = (await page.getByRole('group', { name: '상태' }).getByRole('button', { name: n }).boundingBox()).height;
      assert.ok(h >= 36, `${n} 칩 높이 ${h}`);
    }
    for (const n of ['프로젝트 삭제', '새 프로젝트']) {
      const h = (await page.getByRole('button', { name: n }).boundingBox()).height;
      assert.ok(h >= 40, `${n} 높이 ${h}`);
    }
    const box = await page.getByTestId('project-detail').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, '상세 패널이 화면 안');
  }, { seed: scenario });

  await T('다크 모드: 카드 상태 배지와 마감 배지 글자가 읽힘(배경과 대비 3:1 이상)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await openMore(page);
    const res = await page.evaluate(() => {
      const rgba = c => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d'); x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data); };
      const lumRGB = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      // 배경은 투명도가 있는 색(예: emerald-500/10)을 아래 레이어 위에 합성해서 실제로 보이는 색으로 계산
      const effBg = el => {
        const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] === 255) break; } }
        let base = [11, 14, 19]; // 페이지 배경(다크)
        for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; const al = a / 255; base = [r * al + base[0] * (1 - al), g * al + base[1] * (1 - al), b * al + base[2] * (1 - al)]; }
        return base;
      };
      const out = [];
      document.querySelectorAll('[data-testid="project-card"] span').forEach(el => {
        if (!el.className.includes('rounded-md')) return;
        const fg = lumRGB(rgba(getComputedStyle(el).color)), bg = lumRGB(effBg(el));
        const [a, b] = fg > bg ? [fg, bg] : [bg, fg];
        out.push([el.innerText, (a + 0.05) / (b + 0.05)]);
      });
      return out;
    });
    assert.ok(res.length >= 4, '배지 수: ' + res.length);
    res.forEach(([t, r]) => assert.ok(r >= 3, `${t} 대비 ${r.toFixed(2)}`));
  }, { seed: scenario });

  summary();
})();
