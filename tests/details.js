// 문제·해결·배운 점 칸 접기: 처음엔 접혀 있고, 내용이 있으면 열린 채로 시작하며, 저장 데이터는 달라지지 않음
const { test, summary, assert, gotoEntries, gotoQuick, settle, seed } = require('./lib');

const form = page => page.locator('form').first();
const expandBtn = page => form(page).getByRole('button', { name: /문제·해결·배운 점 추가/ });
const openNew = async page => { await gotoEntries(page); await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500); };
const search = async (page, q) => { await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill(q); await page.waitForTimeout(400); };
const openEdit = async (page, title) => { await gotoEntries(page); await search(page, title); await page.locator('[aria-label="일지 수정"]').first().click(); await page.waitForTimeout(500); };
const PROB = 'textarea[placeholder="어떤 문제가 있었나요?"]';
const LESSON = 'textarea[placeholder="이 경험에서 얻은 인사이트를 적어보세요"]';
const withDetails = () => {
  const d = seed(); const E = d['data/entries.json'];
  E[1].problem = 'p'; E[1].solution = 's';           // 프로젝트B: 문제/해결 있음
  E[2].lesson = '교훈만 있음';                          // 프로젝트C: 배운 점만 있음
  return d;
};

(async () => {
  console.log('\n[문제·해결·배운 점 접기]');

  await test('새 일지: 문제/해결/배운 점 칸은 접혀 있고 [추가] 버튼만 보임, 개요·핵심내용은 그대로 보임', async ({ page }) => {
    await openNew(page);
    assert.strictEqual(await form(page).locator(PROB).count(), 0);
    assert.strictEqual(await form(page).locator(LESSON).count(), 0);
    assert.strictEqual(await expandBtn(page).count(), 1);
    assert.ok(await form(page).getByPlaceholder('한 일을 입력하세요').count() >= 1);
    assert.ok(await form(page).getByPlaceholder('예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등').count() === 1);
  });

  await test('접힌 채로 업무명+개요만 쓰고 저장 → 저장됨, 문제/해결/배운 점은 빈 값(기존과 같은 형식)', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('단발성 일');
    await form(page).getByPlaceholder('예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등').fill('그냥 개요만');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await settle(page);
    const e = fake.get('data/entries.json').find(x => x.title === '단발성 일');
    assert.ok(e, '저장돼야 함');
    assert.strictEqual(e.overview, '그냥 개요만');
    assert.strictEqual(e.problem, ''); assert.strictEqual(e.solution, ''); assert.strictEqual(e.lesson, '');
    for (const k of ['problem', 'solution', 'lesson']) assert.ok(k in e, k + ' 키가 있어야 함(저장 형식 유지)');
  });

  await test('[추가]를 누르면 세 칸이 나타나고 버튼은 사라짐, 쓴 내용이 그대로 저장됨', async ({ page, fake }) => {
    await openNew(page);
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('문제 있는 일');
    await expandBtn(page).click();
    assert.strictEqual(await expandBtn(page).count(), 0);
    await form(page).locator(PROB).fill('장비가 멈춤');
    await form(page).getByPlaceholder('어떻게 해결했나요?').fill('재부팅');
    await form(page).locator(LESSON).fill('로그부터 보자');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await settle(page);
    const e = fake.get('data/entries.json').find(x => x.title === '문제 있는 일');
    assert.strictEqual(e.problem, '장비가 멈춤'); assert.strictEqual(e.solution, '재부팅'); assert.strictEqual(e.lesson, '로그부터 보자');
  });

  await test('문제/해결이 있는 기존 일지를 수정으로 열면 펼쳐진 채로 내용이 보임(숨겨지지 않음)', async ({ page }) => {
    await openEdit(page, '프로젝트B');
    assert.strictEqual(await expandBtn(page).count(), 0);
    assert.strictEqual(await form(page).locator(PROB).inputValue(), 'p');
    assert.strictEqual(await form(page).getByPlaceholder('어떻게 해결했나요?').inputValue(), 's');
  }, { seed: withDetails });

  await test('배운 점만 있는 기존 일지도 펼쳐진 채로 열림', async ({ page }) => {
    await openEdit(page, '프로젝트C');
    assert.strictEqual(await expandBtn(page).count(), 0);
    assert.strictEqual(await form(page).locator(LESSON).inputValue(), '교훈만 있음');
  }, { seed: withDetails });

  await test('내용 없는 기존 일지를 수정으로 열면 접힌 채로, 저장해도 데이터 변화 없음', async ({ page, fake }) => {
    await openEdit(page, '프로젝트D');
    assert.strictEqual(await expandBtn(page).count(), 1);
    await page.getByRole('button', { name: '수정 저장' }).click();
    await settle(page);
    const e = fake.get('data/entries.json').find(x => x.id === 'e4');
    assert.strictEqual(e.problem, ''); assert.strictEqual(e.solution, ''); assert.strictEqual(e.lesson, '');
  });

  await test('프로젝트B 수정 → 문제 칸을 지워도 칸은 계속 열려 있음(쓰는 중에 접히지 않음)', async ({ page }) => {
    await openEdit(page, '프로젝트B');
    await form(page).locator(PROB).fill('');
    await form(page).getByPlaceholder('어떻게 해결했나요?').fill('');
    await page.waitForTimeout(300);
    assert.strictEqual(await form(page).locator(PROB).count(), 1, '쓰는 중에 칸이 사라지면 안 됨');
  }, { seed: withDetails });

  await test('A(내용 있음) 수정을 닫고 D(내용 없음)를 열면 접힘 상태가 D 기준으로 다시 정해짐', async ({ page }) => {
    await openEdit(page, '프로젝트B');
    assert.strictEqual(await expandBtn(page).count(), 0);
    await page.getByRole('button', { name: '취소' }).click();
    await page.waitForTimeout(300);
    await search(page, '프로젝트D');
    await page.locator('[aria-label="일지 수정"]').first().click();
    await page.waitForTimeout(500);
    assert.strictEqual(await expandBtn(page).count(), 1);
  }, { seed: withDetails });

  await test('임시저장(작성 중 내용) 복원: 문제를 쓰다 닫았다 "이어서"를 누르면 펼쳐진 채로 복원', async ({ page, dialogs, setDialogAnswer }) => {
    await openNew(page);
    await form(page).getByPlaceholder('예: ○○ 설비 트러블슈팅 대응').fill('임시저장 확인');
    await expandBtn(page).click();
    await form(page).locator(PROB).fill('쓰다 만 문제');
    await page.waitForTimeout(1200); // 0.8초 자동 임시저장
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    setDialogAnswer(true);
    await page.getByRole('button', { name: '새 일지 작성' }).click();
    await page.waitForTimeout(600);
    assert.ok(dialogs.some(d => d.includes('작성 중이던')), '이어쓰기 확인창이 떠야 함');
    assert.strictEqual(await expandBtn(page).count(), 0);
    assert.strictEqual(await form(page).locator(PROB).inputValue(), '쓰다 만 문제');
  });

  await test('빠른 기록 → 일지로 정리하기: 개요에 들어가고 문제/해결/배운 점은 접혀 있음', async ({ page }) => {
    await gotoQuick(page);
    await page.getByText('노트 하나').first().click();
    await page.getByRole('button', { name: /일지로 정리하기/ }).last().click();
    await page.waitForTimeout(500);
    assert.strictEqual(await form(page).getByPlaceholder('예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등').inputValue(), '노트 하나');
    assert.strictEqual(await expandBtn(page).count(), 1);
  });

  await test('접힌 상태에서도 강조(개요) 기능과 Ctrl+B가 정상 동작', async ({ page }) => {
    await openNew(page);
    const ta = form(page).getByPlaceholder('예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등');
    await ta.fill('가나다 라마바');
    await ta.focus(); await ta.press('Control+Home');
    for (let i = 0; i < 4; i++) await ta.press('ArrowRight');
    for (let i = 0; i < 3; i++) await ta.press('Shift+ArrowRight');
    await ta.press('Control+b');
    assert.strictEqual(await ta.inputValue(), '가나다 ==라마바==');
  });

  await test('모바일(390px): [추가] 버튼이 화면 안에 들어오고 가로 스크롤 없음, 누르면 칸이 펼쳐져 저장 버튼은 계속 보임', async ({ page }) => {
    await openNew(page);
    const b = expandBtn(page);
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
    assert.ok(box.height >= 30, '터치 영역이 너무 작음 ' + box.height);
    await b.click();
    assert.ok(await page.getByRole('button', { name: '저장', exact: true }).isVisible());
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  }, { viewport: { width: 390, height: 844 } });

  await test('다크 모드에서도 [추가] 버튼이 보임(테두리/글자 대비)', async ({ page }) => {
    await openNew(page);
    const c = await expandBtn(page).evaluate(el => getComputedStyle(el).color);
    const light = c.startsWith('oklch') ? parseFloat(c.match(/oklch\(([\d.]+)/)[1]) > 0.55 : c.match(/\d+/g).map(Number)[0] > 120;
    assert.ok(light, '다크 배경에서 글자가 너무 어두움: ' + c);
  }, { theme: 'dark' });

  summary();
})();
