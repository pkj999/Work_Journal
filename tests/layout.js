// 3단계(배치) 규칙 감시: docs/DESIGN_RULES.md 2장(카드 버튼)·4장(도구 줄)·토스트 위치
const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, goTab, settle, seed } = require('./lib');

const now = Date.now(), day = 86400000;
const rich = () => {
  const d = seed();
  d['data/memos.json'] = [{ id: 'm1', text: '기억할 메모', tags: ['a'], createdAt: now - day, updatedAt: now }];
  d['data/todos.json'][0].due = new Date(now + day).toISOString().slice(0, 10);
  d['data/todos.json'][0].text = '서버 점검 일정을 담당자와 협의하고 결과를 공유하기';
  return d;
};
const sizes = (page, sel) => page.locator(sel).evaluateAll(els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; }).map(e => { const r = e.getBoundingClientRect(); return { l: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) }; }));
const tooSmall = (list, min = 40) => list.filter(b => b.w < min || b.h < min);

(async () => {
  console.log('\n[3단계: 버튼 크기 — 모두 40×40 이상]');

  await test('일지 목록: 즐겨찾기·수정·삭제 버튼 40×40 이상', async ({ page }) => {
    await gotoEntries(page);
    const l = await sizes(page, '[aria-label="일지 수정"], [aria-label="일지 삭제"], [aria-label="즐겨찾기"], [aria-label="즐겨찾기 해제"]');
    assert.ok(l.length >= 9, '카드 3장 이상 × 버튼 3개: ' + l.length);
    assert.deepStrictEqual(tooSmall(l), [], JSON.stringify(tooSmall(l)));
  }, { viewport: { width: 390, height: 844 } });

  await test('빠른 기록 카드: 수정·삭제 40×40 이상', async ({ page }) => {
    await gotoQuick(page);
    const l = await sizes(page, '[aria-label="빠른 기록 수정"], [aria-label="빠른 기록 삭제"]');
    assert.ok(l.length >= 4);
    assert.deepStrictEqual(tooSmall(l), [], JSON.stringify(tooSmall(l)));
  }, { viewport: { width: 390, height: 844 } });

  await test('할 일 행: 완료·캘린더·수정·삭제 40×40 이상', async ({ page }) => {
    await gotoTodos(page);
    const l = await sizes(page, '[aria-label$="완료 처리"], [aria-label="캘린더에 추가"], [aria-label="할 일 수정"], [aria-label="할 일 삭제"]');
    assert.ok(l.length >= 7, '버튼 수 ' + l.length);
    assert.deepStrictEqual(tooSmall(l), [], JSON.stringify(tooSmall(l)));
  }, { viewport: { width: 390, height: 844 }, seed: rich });

  await test('완료된 할 일 행 / 기억할 것 행 / 휴지통 행 / 머리글 버튼 40×40 이상', async ({ page }) => {
    await gotoTodos(page);
    await page.getByRole('button', { name: /완료 \d+건/ }).click();
    await page.waitForTimeout(300);
    let l = await sizes(page, '[aria-label$="완료 취소"], [aria-label="할 일 삭제"]');
    assert.deepStrictEqual(tooSmall(l), [], JSON.stringify(tooSmall(l)));
    await page.getByRole('button', { name: /기억할 것/ }).click();
    await page.waitForTimeout(300);
    l = await sizes(page, '[aria-label="메모 수정"], [aria-label="메모 삭제"]');
    assert.ok(l.length >= 2); assert.deepStrictEqual(tooSmall(l), [], JSON.stringify(tooSmall(l)));
    l = await sizes(page, '[aria-label="새로고침"], [aria-label$="모드로 전환"]');
    assert.ok(l.length === 2); assert.deepStrictEqual(tooSmall(l), [], JSON.stringify(tooSmall(l)));
    await gotoEntries(page);
    await page.getByRole('button', { name: /휴지통/ }).first().click();
    await page.waitForTimeout(300);
    l = await sizes(page, '[aria-label="일지 복원"], [aria-label="일지 영구 삭제"]');
    assert.ok(l.length >= 2); assert.deepStrictEqual(tooSmall(l), [], JSON.stringify(tooSmall(l)));
  }, { viewport: { width: 390, height: 844 }, seed: () => { const d = rich(); d['data/memos.json'][0].text = '기억할 메모'; return d; } });

  await test('도구 줄·폼의 텍스트 버튼([선택][휴지통][+ 항목 추가])은 높이 40px 이상', async ({ page }) => {
    await gotoEntries(page);
    let l = await sizes(page, 'button:has-text("선택"), button:has-text("휴지통")');
    l = l.filter(b => b.l.includes('선택') || b.l.includes('휴지통'));
    assert.ok(l.length >= 2);
    assert.ok(l.every(b => b.h >= 40), JSON.stringify(l));
    await page.getByRole('button', { name: '새 일지 작성' }).click();
    await page.waitForTimeout(400);
    const add = await sizes(page, 'button:has-text("항목 추가"), button:has-text("링크 추가")');
    assert.ok(add.length === 2 && add.every(b => b.h >= 40), JSON.stringify(add));
  }, { viewport: { width: 390, height: 844 } });

  await test('폼 보조 버튼 [강조]는 높이 32px 이상(빠른 기록 입력창 포함), 라벨 표시', async ({ page }) => {
    await gotoQuick(page);
    const q = await sizes(page, '[aria-label="선택한 글자 강조"]');
    assert.ok(q.length === 1 && q[0].h >= 32, JSON.stringify(q));
    assert.ok((await page.getByRole('button', { name: '선택한 글자 강조' }).innerText()).includes('강조'), '라벨 "강조"가 보여야 함');
  }, { viewport: { width: 390, height: 844 } });

  await test('인접한 아이콘 버튼끼리 누르는 영역이 겹치지 않음(잘못 눌림 방지)', async ({ page }) => {
    for (const go of [gotoEntries, gotoQuick, gotoTodos]) {
      await go(page);
      const bad = await page.evaluate(() => {
        const groups = [...document.querySelectorAll('.wj-card-actions')];
        const out = [];
        groups.forEach(g => {
          const bs = [...g.querySelectorAll('button')].map(b => b.getBoundingClientRect()).filter(r => r.width);
          for (let i = 1; i < bs.length; i++) if (bs[i].left < bs[i - 1].right - 0.5) out.push([bs[i - 1].right, bs[i].left]);
        });
        return out;
      });
      assert.deepStrictEqual(bad, [], JSON.stringify(bad));
    }
  }, { viewport: { width: 390, height: 844 }, seed: rich });

  console.log('\n[3단계: 삭제 아이콘은 휴지통만 / 호버 전용 금지]');

  await test('이름에 "삭제"가 들어간 버튼(영구 삭제 포함)은 전부 휴지통 아이콘, X 아이콘이 아님', async ({ page }) => {
    await gotoEntries(page);
    const trashSvg = await page.locator('[aria-label="일지 삭제"] svg').first().evaluate(e => e.innerHTML);
    const xSvg = await page.evaluate(() => { const b = document.querySelector('[aria-label="사진 제거"] svg, [aria-label="닫기"] svg'); return b ? b.innerHTML : null; });
    for (const go of [gotoEntries, gotoQuick, gotoTodos]) {
      await go(page);
      const svgs = await page.locator('button[aria-label*="삭제"] svg').evaluateAll(els => els.map(e => e.innerHTML));
      assert.ok(svgs.length >= 2);
      svgs.forEach(h => assert.strictEqual(h, trashSvg, '삭제 버튼에 휴지통이 아닌 아이콘'));
    }
    await page.getByRole('button', { name: /기억할 것/ }).click();
    const memo = await page.locator('button[aria-label="메모 삭제"] svg').evaluateAll(els => els.map(e => e.innerHTML));
    assert.ok(memo.length >= 1 && memo.every(h => h === trashSvg), '메모 삭제는 휴지통 아이콘이어야 함');
  }, { seed: rich });

  await test('PC 화면에서도 일지 카드 버튼이 마우스를 올리지 않아도 보임(항상 보임)', async ({ page }) => {
    await gotoEntries(page);
    await page.mouse.move(5, 5);
    const op = await page.locator('[aria-label="일지 수정"]').first().evaluate(el => { let e = el, o = 1; while (e) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; } return o; });
    assert.ok(op >= 0.99, '불투명도 ' + op);
    const vis = await page.locator('[aria-label="일지 삭제"]').first().isVisible();
    assert.ok(vis);
  }, { viewport: { width: 1280, height: 900 } });

  await test('태블릿 폭(820px, 터치)에서도 일지 카드 버튼이 보임', async ({ page }) => {
    await gotoEntries(page);
    const op = await page.locator('[aria-label="즐겨찾기"], [aria-label="즐겨찾기 해제"]').first().evaluate(el => { let e = el, o = 1; while (e) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; } return o; });
    assert.ok(op >= 0.99, '불투명도 ' + op);
  }, { viewport: { width: 820, height: 1100 } });

  console.log('\n[3단계: 도구 줄 통일]');

  const rowOf = async (page, name) => {
    const b = page.getByRole('button', { name, exact: false }).first();
    return b.boundingBox();
  };
  await test('빠른 기록: [선택]이 [휴지통] 왼쪽, 같은 줄, 둘 다 개수 글자보다 오른쪽', async ({ page }) => {
    await gotoQuick(page);
    const sel = await page.getByRole('button', { name: '선택', exact: true }).boundingBox();
    const trash = await rowOf(page, '휴지통');
    const count = await page.locator('text=/^\\d+건$/').first().boundingBox();
    assert.ok(sel.x < trash.x, '선택이 휴지통보다 왼쪽');
    assert.ok(Math.abs((sel.y + sel.height / 2) - (trash.y + trash.height / 2)) < 4, '같은 줄');
    assert.ok(count.x + count.width < sel.x, '개수는 왼쪽');
  }, { viewport: { width: 390, height: 844 } });

  await test('업무일지: [선택][휴지통]이 같은 줄·같은 순서(빠른 기록과 동일 구조)', async ({ page }) => {
    await gotoEntries(page);
    const sel = await page.getByRole('button', { name: '선택', exact: true }).boundingBox();
    const trash = await rowOf(page, '휴지통');
    assert.ok(sel.x < trash.x, '선택이 휴지통보다 왼쪽');
    assert.ok(Math.abs((sel.y + sel.height / 2) - (trash.y + trash.height / 2)) < 4, '같은 줄');
    assert.ok(trash.x + trash.width > 390 - 40, '오른쪽 끝에 붙어야 함');
  }, { viewport: { width: 390, height: 844 } });

  await test('업무일지: [선택]은 목록 보기에서만(달력/프로젝트별에서는 없음), [휴지통]은 항상', async ({ page }) => {
    await gotoEntries(page);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 1);
    await page.getByRole('button', { name: '달력' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: /휴지통/ }).count() >= 1);
    await page.getByRole('button', { name: '프로젝트별' }).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 0);
    await page.getByRole('button', { name: '목록' }).first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 1);
  });

  await test('업무일지: 필터를 걸면 [필터 초기화]가 나오고(40px), 휴지통 보기에서는 [선택]이 사라짐', async ({ page }) => {
    await gotoEntries(page);
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('프로젝트A');
    await page.waitForTimeout(400);
    const reset = await sizes(page, 'button:has-text("필터 초기화")');
    assert.ok(reset.length === 1 && reset[0].h >= 40, JSON.stringify(reset));
    await page.getByRole('button', { name: /휴지통/ }).first().click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.getByRole('button', { name: '선택', exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: '목록으로' }).count() === 1);
  });

  await test('선택 모드에 들어가면 카드 버튼은 숨겨지고 나가면 다시 보임(기존 동작 유지)', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '선택', exact: true }).click();
    const hidden = await page.locator('[aria-label="일지 수정"]').first().evaluate(el => getComputedStyle(el.closest('.wj-card-actions')).visibility);
    assert.strictEqual(hidden, 'hidden');
    await page.getByRole('button', { name: '선택 모드 종료' }).click();
    await page.waitForTimeout(300);
    const shown = await page.locator('[aria-label="일지 수정"]').first().evaluate(el => getComputedStyle(el.closest('.wj-card-actions')).visibility);
    assert.strictEqual(shown, 'visible');
  });

  console.log('\n[3단계: 토스트 위치와 줄 레이아웃]');

  await test('토스트가 하단 탭 바와 겹치지 않음(폰 390px)', async ({ page }) => {
    await gotoEntries(page);
    await page.locator('[aria-label="일지 삭제"]').first().click();
    await page.waitForTimeout(700);
    const t = await page.locator('text=휴지통으로 이동했어요').first().evaluate(el => { const r = (el.closest('.wj-modal-pop') || el).getBoundingClientRect(); return { b: r.bottom, t: r.top }; });
    const nav = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '설정'); let e = b; while (e && e.getBoundingClientRect().width < 300) e = e.parentElement; return e.getBoundingClientRect().top; });
    assert.ok(t.b <= nav + 1, `토스트 아래 ${t.b} > 탭 바 위 ${nav}`);
  }, { viewport: { width: 390, height: 844 } });

  await test('토스트가 PC 화면에서도 하단 탭 바와 겹치지 않음', async ({ page }) => {
    await gotoEntries(page);
    await page.locator('[aria-label="일지 삭제"]').first().click();
    await page.waitForTimeout(700);
    const t = await page.locator('text=휴지통으로 이동했어요').first().evaluate(el => (el.closest('.wj-modal-pop') || el).getBoundingClientRect().bottom);
    const nav = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '설정'); let e = b; while (e && e.getBoundingClientRect().width < 300) e = e.parentElement; return e.getBoundingClientRect().top; });
    assert.ok(t <= nav + 1, `토스트 아래 ${t} > 탭 바 위 ${nav}`);
  });

  await test('할 일 행: 버튼이 커져도 긴 할 일 글자가 90px 이상 폭을 유지하고 가로 스크롤 없음(390px)', async ({ page }) => {
    await gotoTodos(page);
    const w = await page.locator('text=서버 점검 일정을 담당자와').first().evaluate(el => el.getBoundingClientRect().width);
    assert.ok(w >= 90, '글자 폭 ' + w);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  }, { viewport: { width: 390, height: 844 }, seed: rich });

  await test('일지 카드 머리줄: 버튼 3개(120px)가 있어도 카테고리·날짜 줄이 화면 안에 들어오고 가로 스크롤 없음', async ({ page }) => {
    await gotoEntries(page);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    const stamp = await page.getByTestId('entry-stamp').first().boundingBox();
    assert.ok(stamp.x >= 0 && stamp.x + stamp.width <= 390, JSON.stringify(stamp));
  }, { viewport: { width: 390, height: 844 } });

  await test('아이콘 버튼 조작: 수정 연필을 눌러 수정창이 열리고, 즐겨찾기 토글이 저장됨(기능 유지)', async ({ page, fake }) => {
    await gotoEntries(page);
    await page.locator('[aria-label="즐겨찾기"]').first().click();
    await settle(page);
    assert.strictEqual(fake.get('data/entries.json').filter(e => e.favorite).length, 2);
    await page.locator('[aria-label="일지 수정"]').first().click();
    await page.waitForTimeout(400);
    assert.ok(await page.getByRole('button', { name: '수정 저장' }).count() === 1);
  });

  summary();
})();
