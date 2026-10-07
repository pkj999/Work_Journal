// 임시저장(이어쓰기) 질문: 아무것도 안 쓴 채 닫았을 땐 다음에 열 때 "작성 중이던 내용이 남아있어요" 질문이 뜨면 안 됨
const { test, summary, assert, gotoEntries, settle, seed } = require('./lib');

const form = page => page.locator('form').first();
const TITLE = '예: ○○ 설비 트러블슈팅 대응';
const openNew = async page => { await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500); };
const closeForm = async page => { await form(page).getByRole('button', { name: '닫기' }).click(); await page.waitForTimeout(300); };
const asked = dialogs => dialogs.filter(d => d.includes('작성 중이던 내용이 남아있어요')).length;
const draftKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('wj-draft-entry:')));

(async () => {
  console.log('\n[임시저장: 빈 상태는 묻지 않음]');

  await test('아무것도 안 쓰고 열었다 닫기를 여러 번 해도 질문이 뜨지 않고 임시저장도 안 남음', async ({ page, dialogs }) => {
    await gotoEntries(page);
    for (let i = 0; i < 3; i++) { await openNew(page); await page.waitForTimeout(1200); await closeForm(page); }
    await openNew(page);
    assert.strictEqual(asked(dialogs), 0, dialogs.join(' | '));
    assert.deepStrictEqual(await draftKeys(page), []);
  });

  await test('쓰다가 전부 지우고 닫아도 질문이 뜨지 않음(있던 임시저장도 지워짐)', async ({ page, dialogs }) => {
    await gotoEntries(page); await openNew(page);
    await form(page).getByPlaceholder(TITLE).fill('임시로 쓴 글'); await page.waitForTimeout(1200);
    assert.strictEqual((await draftKeys(page)).length, 1, '쓰는 중엔 임시저장이 생김');
    await form(page).getByPlaceholder(TITLE).fill(''); await page.waitForTimeout(1200);
    assert.deepStrictEqual(await draftKeys(page), [], '다 지우면 임시저장도 지워짐');
    await closeForm(page); await openNew(page);
    assert.strictEqual(asked(dialogs), 0);
  });

  await test('예전 버전이 남긴 빈 임시저장(날짜만 다름·프로젝트 칸 없음)은 묻지 않고 버림', async ({ page, dialogs }) => {
    await gotoEntries(page);
    await page.evaluate(() => localStorage.setItem('wj-draft-entry:new', JSON.stringify({ ts: 1, keepImages: [], form: { date: '2020-01-01', title: '', category: '개발', importance: '중', bullets: [''], overview: '', problem: '', solution: '', lesson: '', tags: [], links: [], dataPath: '' } })));
    await openNew(page);
    assert.strictEqual(asked(dialogs), 0);
    assert.deepStrictEqual(await draftKeys(page), []);
  });

  await test('수정 화면을 열고 아무것도 안 바꾸고 닫으면 다시 열어도 질문 없음', async ({ page, dialogs }) => {
    await gotoEntries(page);
    for (let i = 0; i < 2; i++) {
      await page.locator('[aria-label="일지 수정"]').first().click(); await page.waitForTimeout(1200);
      await closeForm(page);
    }
    assert.strictEqual(asked(dialogs), 0);
    assert.deepStrictEqual(await draftKeys(page), []);
  });

  await test('저장하고 나서 새 일지를 열어도 질문 없음', async ({ page, dialogs }) => {
    await gotoEntries(page); await openNew(page);
    await form(page).getByPlaceholder(TITLE).fill('저장할 글');
    await page.getByRole('button', { name: '저장', exact: true }).click(); await settle(page);
    await openNew(page);
    assert.strictEqual(asked(dialogs), 0);
  });

  console.log('\n[임시저장: 쓴 내용이 있으면 그대로 물어봄]');

  await test('제목을 쓰고 닫으면 다음에 열 때 질문이 뜨고, 이어서를 누르면 복원', async ({ page, dialogs }) => {
    await gotoEntries(page); await openNew(page);
    await form(page).getByPlaceholder(TITLE).fill('이어 쓸 글'); await page.waitForTimeout(1200);
    await closeForm(page); await openNew(page);
    assert.strictEqual(asked(dialogs), 1);
    assert.strictEqual(await form(page).getByPlaceholder(TITLE).inputValue(), '이어 쓸 글');
  });

  await test('태그나 개요만 쓴 경우에도 질문이 뜸(내용 있음으로 판단)', async ({ page, dialogs }) => {
    await gotoEntries(page); await openNew(page);
    await form(page).getByPlaceholder('예: 사외에서 접수된 불량 건, ○○팀 요청으로 시작됨 등').fill('개요만'); await page.waitForTimeout(1200);
    await closeForm(page); await openNew(page);
    assert.strictEqual(asked(dialogs), 1);
  });

  await test('"취소"(새로 시작)를 고르면 임시저장이 지워져 그 다음엔 질문이 안 뜸', async ({ page, dialogs, setDialogAnswer }) => {
    await gotoEntries(page); await openNew(page);
    await form(page).getByPlaceholder(TITLE).fill('버릴 글'); await page.waitForTimeout(1200);
    await closeForm(page);
    setDialogAnswer(false); await openNew(page);
    assert.strictEqual(asked(dialogs), 1);
    assert.strictEqual(await form(page).getByPlaceholder(TITLE).inputValue(), '');
    await closeForm(page); setDialogAnswer(true); await openNew(page);
    assert.strictEqual(asked(dialogs), 1, '두 번째부터는 안 물어봄');
  });

  summary();
})();
