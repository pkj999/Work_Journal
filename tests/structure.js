// 5단계(구조) 규칙 감시: docs/DESIGN_RULES.md 7장(팝업 위치)·8장(공용 부품·둥글기·색)
// 소스 정적 검사(빠름) + 팝업이 어느 탭에서든 열리는지 실제 브라우저 확인
const fs = require('fs');
const path = require('path');
const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, goTab, settle, seed } = require('./lib');

const src = fs.readFileSync(process.env.INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').split('\n');
const funcs = src.map((l, i) => { const m = l.match(/^function (\w+)\(/); return m ? [i, m[1]] : null; }).filter(Boolean);
const ownerOf = i => { let o = '(top)'; for (const [j, n] of funcs) { if (j <= i) o = n; else break; } return o; };
// 주석 줄과 헤더 설명(200줄 이전)은 제외
const code = src.map((l, i) => [i, l]).filter(([i, l]) => i >= 200 && !/^\s*(\/\/|\/\*|\*)/.test(l));
const joined = code.map(([, l]) => l).join('\n');

console.log('\n[5단계: 소스 구조 규칙 — 정적 검사]');

(async () => {
  await test('둥글기는 정해진 값만: md(버튼·칩) / lg(입력·카드) / xl(컨테이너) / full(알약·원) / [2px](강조 막대)', async () => {
    const found = [...new Set(joined.match(/(?<![\w:-])rounded(?:-[a-z0-9]+|-\[[^\]]+\])?(?![\w-])/g) || [])];
    const allowed = new Set(['rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-full', 'rounded-[2px]', 'rounded-t-xl', 'rounded-t-2xl', 'rounded-t-lg', 'rounded-t']);
    const bad = found.filter(x => !allowed.has(x));
    assert.deepStrictEqual(bad, [], '허용되지 않은 둥글기: ' + bad.join(', '));
  });

  await test('색 계열은 slate + red(경고·삭제) + emerald(성공) + amber(주의)만 사용', async () => {
    const fam = [...new Set((joined.match(/(?<![\w-])(?:text|bg|border|ring|from|to|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/g) || []).map(x => x.match(/-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-/)[1]))];
    const bad = fam.filter(f => !['slate', 'red', 'emerald', 'amber'].includes(f));
    assert.deepStrictEqual(bad, [], '허용되지 않은 색 계열: ' + bad.join(', '));
  });

  await test('전체화면 팝업(fixed inset-0)은 앱 전체(App)에서만 띄움 — 탭 안에서 띄우면 다른 탭에서 열리지 않음', async () => {
    // 달력의 날짜별 시트(DayDetailSheet)는 업무일지 달력 안에서만 의미가 있어 예외
    const EXCEPT = new Set(['DayDetailSheet']);
    const overlays = new Set();
    code.forEach(([i, l]) => { if (/className="[^"]*\bfixed inset-0\b/.test(l) || /className=\{`[^`]*\bfixed inset-0\b/.test(l)) overlays.add(ownerOf(i)); });
    overlays.delete('(top)');
    assert.ok(overlays.size >= 5, '팝업 컴포넌트를 찾지 못함: ' + [...overlays].join(','));
    const bad = [];
    overlays.forEach(name => {
      if (EXCEPT.has(name)) return;
      code.forEach(([i, l]) => { if (new RegExp('<' + name + '[\\s/>]').test(l) && ownerOf(i) !== 'App') bad.push(`${name}가 ${ownerOf(i)}(줄 ${i + 1})에서 열림`); });
    });
    assert.deepStrictEqual(bad, []);
  });

  await test('아이콘 전용 버튼은 공용 IconButton으로만 만듦(밝은 글씨가 필요한 사진 확대 화면 제외)', async () => {
    const bad = [];
    const PAD = /className=(?:"|\{`)(?:[^"`]*\s)?p-[0-9.]+(?:\s[^"`]*)?(?:"|`\})/;
    code.forEach(([i, l]) => {
      if (!/<button\b/.test(l)) return;
      // 한 줄에 다 안 담긴 여는 태그(줄바꿈된 속성)도 보도록 이 줄부터 닫는 '>' 가 나올 때까지 최대 3줄을 이어서 봄
      let tag = l; let k = i + 1;
      while (!/(^|[^=])>\s*(<|\{|[^<{\s]|$)/.test(tag.replace(/=>/g, '')) && k < i + 4 && src[k] !== undefined) { tag += ' ' + src[k]; k++; }
      tag = tag.split('</button>')[0];
      if (/aria-label=/.test(tag) && PAD.test(tag)) { const o = ownerOf(i); if (o !== 'GlobalLightbox') bad.push(`${o}(줄 ${i + 1})`); }
    });
    assert.deepStrictEqual(bad, []);
  });

  await test('공용 부품(IconButton·TextAction·ToolbarRow·StampLine)이 정의되어 있고 실제로 여러 곳에서 쓰임', async () => {
    for (const [name, min] of [['IconButton', 20], ['TextAction', 6], ['ToolbarRow', 3], ['StampLine', 2]]) {
      assert.ok(src.some(l => l.startsWith('function ' + name + '(')), name + ' 정의 없음');
      const uses = code.filter(([, l]) => new RegExp('<' + name + '[\\s/>]').test(l)).length;
      assert.ok(uses >= min, `${name} 사용 ${uses}곳 (최소 ${min})`);
    }
  });

  await test('도구 줄·시각 줄을 직접 복사해 만들지 않음(ToolbarRow/StampLine 밖에서 같은 클래스 조합이 없음)', async () => {
    const dup = code.filter(([i, l]) => /text-\[12px\] text-slate-500 dark:text-slate-400 font-mono/.test(l) && ownerOf(i) !== 'ToolbarRow').map(([i]) => `${ownerOf(i)}(줄 ${i + 1})`);
    // 허용: 필터 결과 개수 같은 한 줄 설명(ToolbarRow가 아닌 곳)이 있을 수 있어 최대 3곳까지만 허용
    assert.ok(dup.length <= 3, '복사된 개수 글자: ' + dup.join(', '));
  });

  console.log('\n[5단계: 팝업이 어느 화면에서든 열림 — 실제 브라우저]');

  const rich = () => { const d = seed(); d['data/entries.json'][0].sourceNoteIds = ['n3']; d['data/quick-notes.json'][2].linkedEntryId = 'e1'; return d; };

  await test('빠른 기록 탭: [일지로 정리하기] → 일지 작성 창(개요에 원문)이 열림', async ({ page }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /일지로 정리하기/ }).first().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByRole('button', { name: '저장', exact: true }).count() === 1);
    assert.ok((await page.locator('form textarea').first().inputValue()).length > 0);
  }, { seed: rich });

  await test('빠른 기록 탭: [일지로 정리됨 · 보기] → 일지 미리보기 → 거기서 수정 → 일지 수정 창', async ({ page }) => {
    await gotoQuick(page);
    await page.getByRole('button', { name: /정리됨 \d+건/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /일지로 정리됨 · 보기/ }).first().click();
    await page.waitForTimeout(500);
    await page.locator('[aria-label="일지 수정"]').last().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByRole('button', { name: '수정 저장' }).count() === 1);
  }, { seed: rich });

  await test('업무일지 탭: 달력 날짜 시트 → 일지 수정 창, 원본 보기 → 빠른 기록 수정 창(탭 이동 없이)', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '달력' }).click();
    await page.waitForTimeout(400);
    const today = String(new Date().getDate());
    await page.locator('button', { hasText: new RegExp('^' + today + '(\\s|$)') }).first().click();
    await page.waitForTimeout(500);
    const edit = page.locator('[aria-label="일지 수정"], button:has-text("수정")').first();
    if (await edit.count()) { await edit.click(); await page.waitForTimeout(500); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '목록' }).first().click();
    await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').fill('프로젝트A'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: /원본 빠른 기록 보기/ }).click();
    await page.waitForTimeout(500);
    await page.locator('[aria-label="빠른 기록 수정"]').last().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByRole('button', { name: '수정 저장' }).count() === 1, '빠른 기록 수정 창이 열려야 함');
    assert.ok(await page.getByPlaceholder('업무명, 내용, 문제해결, 태그 검색…').count() === 1, '업무일지 탭에 머물러야 함');
  }, { seed: rich });

  await test('팝업이 열린 상태에서 Esc/뒤로가기로 닫히고, 닫은 뒤 탭 전환도 정상', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '새 일지 작성' }).click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.strictEqual(await page.getByRole('button', { name: '저장', exact: true }).count(), 0);
    await gotoQuick(page);
    await page.locator('[aria-label="빠른 기록 수정"]').first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.strictEqual(await page.getByRole('button', { name: '수정 저장' }).count(), 0);
    await gotoTodos(page);
    assert.ok(await page.getByPlaceholder('할 일 입력…').count() === 1);
  });

  await test('할 일·기억할 것 수정 줄의 저장/취소 버튼이 40px 이상이고 동작함', async ({ page, fake }) => {
    await gotoTodos(page);
    await page.locator('[aria-label="할 일 수정"]').first().click();
    await page.waitForTimeout(300);
    for (const l of ['할 일 수정 저장', '할 일 수정 취소']) {
      const b = await page.locator(`[aria-label="${l}"]`).boundingBox();
      assert.ok(b.width >= 40 && b.height >= 40, l + ' ' + JSON.stringify(b));
    }
    await page.keyboard.press('Control+a'); await page.keyboard.type('수정된 할일');
    await page.locator('[aria-label="할 일 수정 저장"]').click();
    await settle(page);
    assert.ok(fake.get('data/todos.json').some(t => t.text === '수정된 할일'));
    await page.getByRole('button', { name: /기억할 것/ }).click();
    await page.waitForTimeout(300);
    await page.locator('[aria-label="기억할 것 수정"]').first().click();
    const b2 = await page.locator('[aria-label="기억할 것 수정 취소"]').boundingBox();
    assert.ok(b2.width >= 40 && b2.height >= 40);
    await page.locator('[aria-label="기억할 것 수정 취소"]').click();
    assert.strictEqual(await page.locator('[aria-label="기억할 것 수정 저장"]').count(), 0);
  }, { viewport: { width: 390, height: 844 }, seed: () => { const d = seed(); d['data/memos.json'] = [{ id: 'm1', text: '기억', tags: [], createdAt: 1, updatedAt: 1 }]; return d; } });

  await test('수정 줄(390px)에서도 입력칸이 80px 이상 폭을 유지하고 가로 스크롤 없음', async ({ page }) => {
    await gotoTodos(page);
    await page.locator('[aria-label="할 일 수정"]').first().click();
    await page.waitForTimeout(300);
    const w = await page.locator('input:not([type=date])').first().evaluate(el => el.getBoundingClientRect().width);
    assert.ok(w >= 80, '입력칸 폭 ' + w);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  }, { viewport: { width: 390, height: 844 } });

  console.log('\n[5단계: 전수 측정 — 글자 없는 버튼은 모두 40×40 이상 + 접근성 이름]');

  const ALLOW = ['사진 제거']; // 사진 썸네일 모서리의 작은 제거 버튼(첨부 빼기 전용, 썸네일 안에 겹쳐 있어 예외)
  const audit = async (page, where) => {
    const bad = await page.evaluate(allow => [...document.querySelectorAll('button')].filter(b => {
      const r = b.getBoundingClientRect(); if (!r.width || !r.height) return false;
      if (b.textContent.trim()) return false;           // 글자가 있는 버튼은 제외(아이콘 전용만)
      if (b.closest('nav')) return false;               // 하단 탭 바는 글자 라벨이 따로 있음
      const l = b.getAttribute('aria-label') || '';
      if (allow.some(a => l.includes(a))) return false;
      if (b.getAttribute('role') === 'checkbox') return false; // 선택 모드의 카드 전체 오버레이
      return r.width < 39.5 || r.height < 39.5 || !(b.getAttribute('aria-label') || b.title); // 크기 미달 또는 접근성 이름(aria-label) 없음
    }).map(b => { const r = b.getBoundingClientRect(); return `${b.getAttribute('aria-label') || b.title || '(이름 없음)'} ${Math.round(r.width)}x${Math.round(r.height)}`; }), ALLOW);
    assert.deepStrictEqual(bad, [], `[${where}] ` + bad.join(', '));
  };
  const rich2 = () => { const d = seed(); d['data/memos.json'] = [{ id: 'm1', text: '기억', tags: ['a'], createdAt: 1, updatedAt: 2 }]; d['data/phrases.json'] = [{ id: 'p1', text: '확인 필요' }]; d['data/entries.json'][0].images = []; return d; };
  await test('모든 화면(탭·보기·창·선택 모드·설정)의 글자 없는 버튼이 40×40 이상', async ({ page }) => {
    await gotoQuick(page); await audit(page, '빠른 기록');
    await page.locator('[aria-label="빠른 기록 수정"]').first().click(); await page.waitForTimeout(400); await audit(page, '빠른 기록 수정창');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '선택', exact: true }).click(); await audit(page, '빠른 기록 선택 모드');
    await page.getByRole('button', { name: '선택 모드 종료' }).click(); await page.waitForTimeout(200);
    await gotoTodos(page); await audit(page, '할 일');
    await page.locator('[aria-label="할 일 수정"]').first().click(); await page.waitForTimeout(250); await audit(page, '할 일 수정 줄');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /기억할 것/ }).click(); await page.waitForTimeout(300); await audit(page, '기억할 것');
    await page.locator('[aria-label="기억할 것 수정"]').first().click(); await page.waitForTimeout(250); await audit(page, '기억할 것 수정 줄');
    await gotoEntries(page); await audit(page, '업무일지 목록');
    for (const v of ['달력', '모아보기', '하이라이트']) { await page.getByRole('button', { name: v }).click(); await page.waitForTimeout(300); await audit(page, v); }
    await page.getByRole('button', { name: '목록' }).first().click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '선택', exact: true }).click(); await page.getByRole('checkbox').first().click(); await audit(page, '업무일지 선택 모드');
    await page.getByRole('button', { name: '선택 모드 종료' }).click(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: /휴지통/ }).first().click(); await page.waitForTimeout(300); await audit(page, '일지 휴지통');
    await page.getByRole('button', { name: '목록으로' }).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: '항목 추가' }).click(); await page.getByRole('button', { name: '링크 추가' }).click(); await page.waitForTimeout(200);
    await audit(page, '일지 작성 창(항목·링크 삭제 포함)');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await goTab(page, '설정'); await page.waitForTimeout(400); await audit(page, '설정');
  }, { viewport: { width: 390, height: 844 }, seed: rich2 });

  await test('설정: 문구 삭제(X)가 실제로 동작하고, 색 선택 버튼 클릭으로 색이 바뀜(40px로 키운 뒤에도 기능 유지)', async ({ page, fake }) => {
    await goTab(page, '설정'); await page.waitForTimeout(500);
    await page.locator('[aria-label="문구 \\"확인 필요\\" 삭제"]').click();
    await settle(page);
    assert.ok(fake.get('data/phrases.json').every(p => p.text !== '확인 필요'), '문구가 삭제돼야 함');
    const sw = page.locator('[aria-label^="색상 "]');
    assert.ok(await sw.count() >= 6);
    await sw.nth(2).click();
    const ring = await sw.nth(2).locator('span').evaluate(e => e.className.includes('ring-2'));
    assert.ok(ring, '선택한 색에 표시(링)가 있어야 함');
  }, { viewport: { width: 390, height: 844 }, seed: rich2 });

  summary();
})();
