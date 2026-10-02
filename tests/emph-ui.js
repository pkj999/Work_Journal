// 강조(굵게+밑줄) 기능을 실제 브라우저로 확인: 입력 → 저장 → 카드 표시 → 검색과 겹침 → 빠른 기록 → 모바일/다크
const { test, summary, assert, gotoEntries, gotoQuick, settle, seed } = require('./lib');

const editBtn = page => page.locator('[aria-label="일지 수정"]');
// 입력칸 바로 위 제목줄의 [강조] 버튼 (칸마다 하나씩 있으므로, 칸의 부모 묶음 안에서 찾음)
const fieldBtn = (ta, name = /선택한 글자 강조/) => ta.locator('xpath=..').getByRole('button', { name });
const form = page => page.locator('form').first();
const ovTa = page => form(page).locator('textarea').first(); // 개요
const saveEdit = page => page.getByRole('button', { name: '수정 저장' }).click();

// 실제 사용자처럼 키보드로 글자 선택: 맨 앞으로 이동 → start만큼 오른쪽 → Shift+오른쪽으로 len만큼 선택
async function selectRange(loc, start, len) {
  await loc.focus();
  await loc.press('Control+Home');
  for (let i = 0; i < start; i++) await loc.press('ArrowRight');
  for (let i = 0; i < len; i++) await loc.press('Shift+ArrowRight');
}
// 글 안에서 sub 글자(nth번째)를 찾아 그 위치를 키보드로 선택
async function selectSub(loc, sub, nth = 0) {
  const v = await loc.inputValue();
  let i = -1;
  for (let k = 0; k <= nth; k++) i = v.indexOf(sub, i + 1);
  assert.ok(i >= 0, `선택할 글자 "${sub}"가 입력칸에 없음: ${JSON.stringify(v)}`);
  await selectRange(loc, i, sub.length);
}

// e1(프로젝트A)의 수정창 열기 — 개요는 '개요에만 있는 고유단어 zebra'. 카드 순서에 기대지 않으려고 이름으로 검색해 한 장만 남김
async function openEditE1(page) {
  await gotoEntries(page);
  await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('프로젝트A');
  await page.waitForTimeout(400);
  assert.strictEqual(await editBtn(page).count(), 1, '프로젝트A 한 장만 남아야 함');
  await editBtn(page).first().click();
  await page.waitForTimeout(500);
}

(async () => {
  console.log('\n[강조 기능 UI 테스트]');

  await test('입력창 옆 [강조] 버튼: 선택 전엔 비활성, 선택하면 활성', async ({ page }) => {
    await openEditE1(page);
    const btn = fieldBtn(ovTa(page));
    assert.ok(await btn.isDisabled(), '선택 전엔 비활성이어야 함');
    await selectSub(ovTa(page), '고유단어');
    await page.waitForTimeout(200);
    assert.ok(await fieldBtn(ovTa(page)).isEnabled(), '선택하면 활성이어야 함');
  });

  await test('글자 선택 → [강조] → ==가 입력칸에 들어가고 미리보기에 굵게+밑줄로 나옴', async ({ page }) => {
    await openEditE1(page);
    const v = await ovTa(page).inputValue();
    await selectSub(ovTa(page), '고유단어');
    await fieldBtn(ovTa(page)).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await ovTa(page).inputValue(), v.replace('고유단어', '==고유단어=='));
    const pv = form(page).locator('[data-testid=emph-preview]');
    assert.strictEqual(await pv.count(), 1);
    assert.strictEqual((await pv.locator('em.wj-emph').innerText()).trim(), '고유단어');
    assert.ok(!(await pv.innerText()).includes('=='), '미리보기에 ==가 보이면 안 됨');
    // 누른 뒤 선택이 유지돼서 버튼이 [강조 해제]로 바뀜
    assert.ok(await fieldBtn(ovTa(page), '선택한 글자 강조 해제').isEnabled());
  });

  await test('저장하면 서버 JSON에 ==가 그대로 저장되고, 카드에는 ==없이 굵게+밑줄로 표시', async ({ page, fake }) => {
    await openEditE1(page);
    await selectSub(ovTa(page), '고유단어');
    await fieldBtn(ovTa(page)).click();
    await saveEdit(page);
    await settle(page);
    const e1 = fake.get('data/entries.json').find(e => e.id === 'e1');
    assert.ok(e1.overview.includes('==고유단어=='), e1.overview);
    const em = page.locator('em.wj-emph', { hasText: '고유단어' });
    assert.strictEqual(await em.count(), 1);
    const style = await em.evaluate(el => { const c = getComputedStyle(el); return { w: c.fontWeight, u: c.textDecorationLine, t: c.textDecorationThickness }; });
    assert.ok(Number(style.w) >= 700, '굵게여야 함 ' + style.w);
    assert.ok(style.u.includes('underline'), '밑줄이어야 함');
    assert.ok(!(await page.locator('body').innerText()).includes('=='), '화면 어디에도 ==가 보이면 안 됨');
  });

  await test('강조 해제: 강조된 글자를 선택하면 [강조 해제], 누르면 ==가 사라짐', async ({ page }) => {
    await openEditE1(page);
    const ta = ovTa(page);
    await ta.fill('앞 ==중요== 뒤');
    await selectSub(ta, '중요');
    await page.waitForTimeout(200);
    const un = fieldBtn(ta, '선택한 글자 강조 해제');
    assert.ok(await un.isEnabled());
    await un.click();
    await page.waitForTimeout(200);
    assert.strictEqual(await ta.inputValue(), '앞 중요 뒤');
    assert.strictEqual(await form(page).locator('[data-testid=emph-preview]').count(), 0, '강조가 없으면 미리보기도 없음');
  });

  await test('Ctrl+B 로도 강조/해제', async ({ page }) => {
    await openEditE1(page);
    const ta = ovTa(page);
    await ta.fill('가나다 라마바');
    await selectSub(ta, '라마바');
    await ta.press('Control+b');
    await page.waitForTimeout(200);
    assert.strictEqual(await ta.inputValue(), '가나다 ==라마바==');
    await ta.press('Control+b'); // 선택이 유지되므로 다시 누르면 해제
    await page.waitForTimeout(200);
    assert.strictEqual(await ta.inputValue(), '가나다 라마바');
  });

  await test('선택 양끝 공백은 강조 밖으로 빠져서 올바르게 인식됨', async ({ page }) => {
    await openEditE1(page);
    const ta = ovTa(page);
    await ta.fill('가 나 다');
    await selectRange(ta, 1, 3); // ' 나 ' (양끝 공백 포함)
    await fieldBtn(ta).click();
    assert.strictEqual(await ta.inputValue(), '가 ==나== 다');
  });

  await test('여러 줄에 걸쳐 선택해도 강조되고 미리보기에서 줄바꿈 유지', async ({ page }) => {
    await openEditE1(page);
    const ta = ovTa(page);
    await ta.fill('첫줄\n둘째줄');
    await ta.focus(); await ta.press('Control+a');
    await fieldBtn(ta).click();
    assert.strictEqual(await ta.inputValue(), '==첫줄\n둘째줄==');
    const shown = await form(page).locator('[data-testid=emph-preview] em.wj-emph').evaluate(el => el.textContent);
    assert.strictEqual(shown, '첫줄\n둘째줄', '미리보기의 강조 글자에 줄바꿈이 보존돼야 함');
  });

  await test('비교식 "a == b"처럼 공백 붙은 ==는 강조로 오인되지 않고 그대로 보임', async ({ page, fake }) => {
    await openEditE1(page);
    await ovTa(page).fill('조건 a == b 일 때');
    assert.strictEqual(await form(page).locator('[data-testid=emph-preview]').count(), 0);
    await saveEdit(page); await settle(page);
    assert.strictEqual(await page.locator('em.wj-emph').count(), 0);
    assert.ok((await page.locator('body').innerText()).includes('a == b'));
  });

  await test('핵심 내용(불릿) 줄: 두 번째 줄만 선택해 강조하면 그 줄에만 적용', async ({ page, fake }) => {
    await openEditE1(page);
    await form(page).getByRole('button', { name: '항목 추가' }).click();
    const inputs = form(page).locator('input[placeholder="한 일을 입력하세요"]');
    await inputs.nth(1).fill('두번째 항목 중요함');
    await selectSub(inputs.nth(1), '중요');
    await form(page).getByRole('button', { name: '선택한 글자 강조' }).first().click(); // 핵심 내용 칸의 버튼(맨 위)
    assert.strictEqual(await inputs.nth(1).inputValue(), '두번째 항목 ==중요==함');
    assert.strictEqual(await inputs.nth(0).inputValue(), 'a1');
    await saveEdit(page); await settle(page);
    const e1 = fake.get('data/entries.json').find(e => e.id === 'e1');
    assert.deepStrictEqual(e1.bullets, ['a1', '두번째 항목 ==중요==함']);
  });

  await test('불릿 줄을 지운 뒤에도 [강조] 버튼이 엉뚱한 줄에 적용되지 않음(선택 초기화)', async ({ page }) => {
    await openEditE1(page);
    await form(page).getByRole('button', { name: '항목 추가' }).click();
    const inputs = form(page).locator('input[placeholder="한 일을 입력하세요"]');
    await inputs.nth(1).fill('둘째');
    await selectRange(inputs.nth(1), 0, 2);
    const bulletBtn = form(page).getByRole('button', { name: /선택한 글자 강조/ }).first();
    assert.ok(await bulletBtn.isEnabled(), '삭제 전엔 선택돼서 활성이어야 함');
    await form(page).getByRole('button', { name: '항목 삭제' }).nth(1).click();
    await page.waitForTimeout(200);
    assert.ok(await bulletBtn.isDisabled(), '삭제 후엔 비활성이어야 함');
    assert.strictEqual(await form(page).locator('input[placeholder="한 일을 입력하세요"]').nth(0).inputValue(), 'a1');
  });

  await test('문제/해결/배운 점 칸에도 각각 [강조] 버튼이 있고 서로 독립', async ({ page, fake }) => {
    await openEditE1(page);
    await form(page).getByRole('button', { name: /문제·해결·배운 점 추가/ }).click(); // 접혀 있으므로 펼침
    const tas = form(page).locator('textarea');
    assert.ok(await tas.count() >= 4, '개요/문제/해결/배운점 4칸');
    await tas.nth(1).fill('문제 내용입니다'); // 발생 문제
    await selectSub(tas.nth(1), '내용');
    // 문제 칸 제목줄의 버튼만 활성
    const btns = form(page).getByRole('button', { name: /선택한 글자 강조/ });
    const enabled = [];
    for (let i = 0; i < await btns.count(); i++) enabled.push(await btns.nth(i).isEnabled());
    assert.strictEqual(enabled.filter(Boolean).length, 1, JSON.stringify(enabled));
    await tas.nth(1).press('Control+b');
    await saveEdit(page); await settle(page);
    const e1 = fake.get('data/entries.json').find(e => e.id === 'e1');
    assert.strictEqual(e1.problem, '문제 ==내용==입니다');
    assert.ok(!e1.solution.includes('=='));
  });

  await test('수정창을 닫았다 다시 열면 [강조] 버튼은 비활성으로 초기화(이전 선택이 남지 않음)', async ({ page }) => {
    await openEditE1(page);
    await selectRange(ovTa(page), 0, 3);
    assert.ok(await fieldBtn(ovTa(page)).isEnabled());
    await page.getByRole('button', { name: '취소' }).click();
    await page.waitForTimeout(300);
    await editBtn(page).first().click();
    await page.waitForTimeout(400);
    await form(page).getByRole('button', { name: /문제·해결·배운 점 추가/ }).click();
    const all = form(page).getByRole('button', { name: /선택한 글자 강조/ });
    assert.ok(await all.count() >= 5, '버튼이 핵심내용+4칸이어야 함: ' + await all.count());
    for (let i = 0; i < await all.count(); i++) assert.ok(await all.nth(i).isDisabled(), i + '번째 버튼이 활성 상태');
  });

  // ---- 검색과의 관계 ----
  const withEmph = () => {
    const d = seed();
    d['data/entries.json'][0].overview = '서버 점검 전 ==반드시 백업을 먼저== 해야 한다. 정기 백업은 주 1회.';
    d['data/entries.json'][0].bullets = ['디스크 교체, ==반드시 백업 후 작업=='];
    return d;
  };
  const search = (page, q) => page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill(q);

  await test('평소 카드: ==는 보이지 않고 강조 구간이 굵게+밑줄', async ({ page }) => {
    await gotoEntries(page);
    const ems = page.locator('em.wj-emph');
    assert.strictEqual(await ems.count(), 2);
    assert.ok(!(await page.locator('body').innerText()).includes('=='));
  }, { seed: withEmph });

  await test('강조 안의 단어("백업") 검색: 일지가 검색되고, 강조 밖/안 모두 주황 표시, 강조는 유지', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '백업'); await settle(page);
    assert.ok(await page.locator('text=1건 표시 중').count() >= 1);
    assert.strictEqual(await page.locator('mark').count(), 3, '불릿1 + 개요2 = 3곳');
    const inside = await page.locator('em.wj-emph mark').count();
    assert.strictEqual(inside, 2, '강조 안의 검색 표시는 2곳');
    assert.ok(await page.locator('em.wj-emph').count() >= 2, '강조 모양이 유지돼야 함');
  }, { seed: withEmph });

  await test('마커 때문에 검색이 빗나가지 않음: "먼저 해야"(강조 끝 ==를 사이에 두고 이어지는 말)로도 찾아짐', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '먼저 해야'); await settle(page);
    assert.ok(await page.locator('text=1건 표시 중').count() >= 1);
    // 검색어가 강조 경계를 가로지름 → 표시가 두 조각(강조 안 '먼저' + 밖 ' 해야')으로 나뉘어도, 합치면 검색어와 같아야 함
    const txt = (await page.locator('mark').allInnerTexts()).join('');
    assert.strictEqual(txt, '먼저 해야');
    assert.strictEqual(await page.locator('em.wj-emph mark').count(), 1);
  }, { seed: withEmph });

  await test('"=="로 검색해도 마커 때문에 결과가 나오지 않음(마커는 검색 대상이 아님)', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '=='); await settle(page);
    assert.strictEqual(await page.locator('mark').count(), 0);
    assert.ok(await page.locator('text=0건').count() >= 1 || await page.locator('text=프로젝트A').count() === 0);
  }, { seed: withEmph });

  await test('검색을 지우면 주황 표시만 사라지고 강조는 그대로', async ({ page }) => {
    await gotoEntries(page);
    await search(page, '백업'); await settle(page);
    await search(page, ''); await settle(page);
    assert.strictEqual(await page.locator('mark').count(), 0);
    assert.strictEqual(await page.locator('em.wj-emph').count(), 2);
  }, { seed: withEmph });

  // ---- 빠른 기록 ----
  await test('빠른 기록 입력창: 선택→[강조]→기록하면 저장 JSON에 ==, 카드에 굵게+밑줄', async ({ page, fake }) => {
    await gotoQuick(page);
    const ta = page.getByPlaceholder('보고 들은 걸 바로 적어두세요…');
    await ta.fill('내일 회의 자료 꼭 챙기기');
    await selectSub(ta, '자료 꼭');
    const b = page.getByRole('button', { name: '선택한 글자 강조' });
    assert.ok(await b.isEnabled());
    await b.click();
    assert.strictEqual(await ta.inputValue(), '내일 회의 ==자료 꼭== 챙기기');
    await page.getByRole('button', { name: '기록', exact: true }).click();
    await settle(page);
    const saved = fake.get('data/quick-notes.json');
    assert.ok(saved.some(n => n.text === '내일 회의 ==자료 꼭== 챙기기'), JSON.stringify(saved.map(n => n.text)));
    assert.ok(await page.locator('em.wj-emph').count() >= 1);
    assert.ok(!(await page.locator('body').innerText()).includes('=='));
  });

  await test('빠른 기록 수정창에서도 강조/해제 가능', async ({ page, fake }) => {
    await gotoQuick(page);
    await page.locator('[aria-label="빠른 기록 수정"]').first().click();
    await page.waitForTimeout(400);
    const ta = page.locator('form textarea').first();
    const v = await ta.inputValue();
    await selectRange(ta, 0, 2);
    await page.locator('form').getByRole('button', { name: '선택한 글자 강조' }).click();
    assert.strictEqual(await ta.inputValue(), '==' + v.slice(0, 2) + '==' + v.slice(2));
    await page.getByRole('button', { name: '수정 저장' }).click();
    await settle(page);
    assert.ok(fake.get('data/quick-notes.json').some(n => n.text === '==' + v.slice(0, 2) + '==' + v.slice(2)));
  });

  await test('빠른 기록 → 일지로 승격해도 강조가 개요로 그대로 넘어가 굵게+밑줄로 보임', async ({ page, fake }) => {
    await gotoQuick(page);
    await page.getByText('승격할 ').first().click(); // 미리보기 열기
    await page.getByRole('button', { name: /일지로 정리하기/ }).last().click();
    await page.waitForTimeout(500);
    const ta = form(page).locator('textarea').first();
    assert.strictEqual(await ta.inputValue(), '승격할 ==핵심== 내용', '개요로 ==가 그대로 넘어가야 함');
    assert.strictEqual((await form(page).locator('[data-testid=emph-preview] em.wj-emph').innerText()).trim(), '핵심');
  }, { seed: () => { const d = seed(); d['data/quick-notes.json'][0].text = '승격할 ==핵심== 내용'; return d; } });

  await test('선택 모드의 접근성 이름에는 ==가 섞이지 않음', async ({ page }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: '선택', exact: true }).click();
    const names = await page.getByRole('checkbox').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    assert.ok(names.length >= 2);
    assert.ok(names.every(n => !n.includes('==')), JSON.stringify(names));
  }, { seed: () => { const d = seed(); d['data/quick-notes.json'][0].text = '==강조된== 노트'; return d; } });

  // ---- 화면 크기/테마 ----
  await test('모바일(390px): [강조] 버튼이 보이고 가로 스크롤 없음, 수정창이 화면 안에 들어옴', async ({ page }) => {
    await openEditE1(page);
    const b = fieldBtn(ovTa(page));
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
    assert.ok(box.height >= 20, '터치하기에 너무 작음 ' + box.height);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, '가로 스크롤 ' + over);
  }, { viewport: { width: 390, height: 844 } });

  await test('다크 모드: 강조 글자가 밝은 색으로 보임(어두운 배경에서 안 묻힘)', async ({ page }) => {
    await gotoEntries(page);
    const c = await page.locator('em.wj-emph').first().evaluate(el => getComputedStyle(el).color);
    const m = c.match(/\d+/g).map(Number);
    assert.ok(m[0] > 200 && m[1] > 200 && m[2] > 200, c);
  }, { seed: withEmph, theme: 'dark' });

  await test('라이트 모드: 강조 글자가 짙은 색', async ({ page }) => {
    await gotoEntries(page);
    const c = await page.locator('em.wj-emph').first().evaluate(el => getComputedStyle(el).color);
    const m = c.match(/\d+/g).map(Number);
    assert.ok(m[0] < 60 && m[1] < 60 && m[2] < 80, c);
  }, { seed: withEmph, theme: 'light' });

  await test('입력창을 열고 닫기를 반복해도 오류 없음(훅 순서/상태 문제 회귀)', async ({ page }) => {
    await gotoEntries(page);
    for (let i = 0; i < 4; i++) {
      await editBtn(page).first().click();
      await page.waitForTimeout(250);
      await page.getByRole('button', { name: '취소' }).click();
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: '새 일지 작성' }).click();
    await page.waitForTimeout(300);
    assert.ok(await page.locator('form').count() >= 1);
  });

  summary();
})();
