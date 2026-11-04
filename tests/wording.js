// 4단계(표기) 규칙 감시: docs/DESIGN_RULES.md 5장(날짜·시각)·6장(용어)·9장(문구 톤)
const fs = require('fs');
const path = require('path');
const { test, summary, assert, gotoEntries, gotoQuick, gotoTodos, goTab, settle, seed } = require('./lib');

const now = Date.now(), day = 86400000;
const iso = d => new Date(d).toISOString().slice(0, 10);
const ISO_RE = /\b(19|20)\d\d-\d\d-\d\d\b/;
const html = fs.readFileSync(process.env.INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').split('\n');
// 코드 주석을 뺀 "화면에 나가는 코드" 줄만 검사
const codeLines = html.map((l, i) => [i + 1, l]).filter(([n, l]) => n > 200 && !/^\s*(\/\/|\/\*|\*)/.test(l));

const rich = () => {
  const d = seed(); const E = d['data/entries.json'], N = d['data/quick-notes.json'];
  E[0].sourceNoteIds = ['n3']; E[0].createdAt = now - 3600e3; E[0].updatedAt = now;
  E[1].date = iso(now - 40 * day); E[1].title = '프로젝트A'; // 같은 프로젝트에 날짜가 다른 일지 → 타임라인에 범위 표시
  E[4].deletedAt = now - 1000; N[1].deleted = true; N[1].deletedAt = now - 2000;
  d['data/memos.json'] = [{ id: 'm1', text: '기억', tags: [], createdAt: now - day, updatedAt: now }];
  d['data/todos.json'][0].due = iso(now + day);
  return d;
};
const bodyText = page => page.evaluate(() => document.body.innerText);
const attrText = page => page.evaluate(() => [...document.querySelectorAll('[aria-label],[title],[placeholder]')].map(e => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('placeholder')].filter(Boolean).join(' ')).join('\n'));

(async () => {
  console.log('\n[4단계: 문구 톤·용어 — 소스 정적 검사]');

  await test('화면 문구에 합니다체("~습니다")가 없음(해요체 통일)', async () => {
    const bad = codeLines.filter(([, l]) => l.includes('습니다'));
    assert.deepStrictEqual(bad.map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`), []);
  });

  await test('화면 문구에 "개요"가 없음 — 일지 본문 칸 이름은 "내용"(엑셀 가져오기가 옛 파일의 \'개요\' 칸을 읽는 코드만 예외)', async () => {
    const bad = codeLines.filter(([, l]) => l.includes('개요') && !l.includes("row['개요']"));
    assert.deepStrictEqual(bad.map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`), []);
  });

  await test('금지 용어 없음: "완전히 삭제", "메모"(화면·접근성 이름), "미처리", "아카이브"', async () => {
    const forbidden = [/완전히 삭제/, /label="메모/, /aria-label=\{?[`'"]메모/, /미처리 빠른/, /아카이브(?!일지)/];
    const bad = [];
    codeLines.forEach(([n, l]) => forbidden.forEach(re => { if (re.test(l)) bad.push(`${n}: ${l.trim().slice(0, 80)}`); }));
    assert.deepStrictEqual(bad, []);
  });

  console.log('\n[일지 본문 칸 이름: "내용"]');

  await test('일지 작성 폼의 칸 이름은 "내용"(예전 "개요"와 배경 설명 문구 없음)', async ({ page }) => {
    await gotoEntries(page);
    await page.getByRole('button', { name: '새 일지 작성' }).click(); await page.waitForTimeout(500);
    const f = page.locator('form').first();
    const txt = await f.innerText();
    assert.ok(await f.getByText('내용', { exact: true }).count() >= 1, '내용 라벨');
    assert.ok(!txt.includes('개요') && !txt.includes('어떤 배경'), txt.slice(0, 300));
  });

  await test('일지 카드(접힘/펼침)와 미리보기에도 "개요"가 없고 "내용" 제목이 보임', async ({ page }) => {
    await gotoEntries(page);
    const body = await bodyText(page);
    assert.ok(!body.includes('개요'));
    assert.ok(body.includes('내용'), '카드에 내용 제목');
  }, { seed: () => { const d = seed(); d['data/entries.json'][0].overview = '본문 글입니다'; return d; } });

  await test('엑셀: 내보내면 칸 이름이 "내용"이고, 옛 파일("개요" 칸)과 새 파일("내용" 칸)을 모두 가져옴', async ({ page, fake }) => {
    const XLSX = require('xlsx');
    await goTab(page, '설정');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /엑셀\(\.xlsx\)/ }).click()]);
    const wb = XLSX.readFile(await dl.path());
    const head = Object.keys(XLSX.utils.sheet_to_json(wb.Sheets['업무일지'])[0]);
    assert.ok(head.includes('내용') && !head.includes('개요'), head.join(','));
    const mk = rows => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.json_to_sheet(rows), '업무일지'); return Buffer.from(XLSX.write(w, { type: 'buffer', bookType: 'xlsx' })); };
    const send = async (name, buf) => { await page.locator('input[type=file][accept=".xlsx"]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: buf }); await settle(page); await settle(page); };
    await send('old.xlsx', mk([{ 날짜: '2026-09-01', 프로젝트: '옛 파일 업무', 개요: '옛 개요 칸 내용' }]));
    await send('new.xlsx', mk([{ 날짜: '2026-09-02', 프로젝트: '', 업무명: '새 파일 업무', 내용: '새 내용 칸 내용' }]));
    const es = fake.get('data/entries.json');
    assert.strictEqual(es.find(e => e.title === '옛 파일 업무').overview, '옛 개요 칸 내용');
    assert.strictEqual(es.find(e => e.title === '새 파일 업무').overview, '새 내용 칸 내용');
  });

  console.log('\n[4단계: 날짜·시각 표기 — 화면에 ISO(2026-10-02) 노출 금지]');

  const screens = [
    ['업무일지 목록', async p => { await gotoEntries(p); }],
    ['업무일지 달력', async p => { await gotoEntries(p); await p.getByRole('button', { name: '달력' }).click(); await p.waitForTimeout(300); }],
    ['모아보기 타임라인', async p => { await gotoEntries(p); await p.getByRole('button', { name: '모아보기' }).click(); await p.waitForTimeout(300); await p.getByRole('button', { name: /^프로젝트A/ }).click(); await p.waitForTimeout(300); }],
    ['하이라이트', async p => { await gotoEntries(p); await p.getByRole('button', { name: '하이라이트' }).click(); await p.waitForTimeout(300); }],
    ['일지 휴지통', async p => { await gotoEntries(p); await p.getByRole('button', { name: /휴지통/ }).first().click(); await p.waitForTimeout(300); }],
    ['빠른 기록', async p => { await gotoQuick(p); }],
    ['빠른 기록 휴지통', async p => { await gotoQuick(p); await p.getByRole('button', { name: /휴지통/ }).first().click(); await p.waitForTimeout(300); }],
    ['할 일', async p => { await gotoTodos(p); }],
    ['기억할 것', async p => { await gotoTodos(p); await p.getByRole('button', { name: /기억할 것/ }).click(); await p.waitForTimeout(300); }],
    ['설정', async p => { await goTab(p, '설정'); }],
  ];
  for (const [name, go] of screens) {
    await test(`${name}: 화면 글자에 ISO 날짜가 없음`, async ({ page }) => {
      await go(page);
      const t = await bodyText(page);
      const m = t.match(ISO_RE);
      assert.ok(!m, 'ISO 날짜 노출: ' + (m && m[0]));
    }, { seed: rich });
  }

  await test('타임라인 범위와 날짜 형식: `2026.08.23 (일) → 2026.10.02 (금)` 형태', async ({ page }) => {
    await screens[2][1](page);
    const t = await bodyText(page);
    assert.ok(/\d{4}\.\d{2}\.\d{2} \([월화수목금토일]\) → \d{4}\.\d{2}\.\d{2} \([월화수목금토일]\)/.test(t), t.slice(0, 600));
  }, { seed: rich });

  await test('일지·빠른 기록 휴지통의 "삭제됨"에 날짜와 함께 시각(HH:mm)이 표시됨', async ({ page }) => {
    await screens[4][1](page);
    let t = await bodyText(page);
    assert.ok(/삭제됨 · \d{4}\.\d{2}\.\d{2} \([월화수목금토일]\) \d{2}:\d{2}/.test(t), t.slice(0, 400));
    await screens[6][1](page);
    t = await bodyText(page);
    assert.ok(/삭제됨 · \d{4}\.\d{2}\.\d{2} \([월화수목금토일]\) \d{2}:\d{2}/.test(t), t.slice(0, 400));
  }, { seed: rich });

  await test('일지 카드 날짜는 `2026.10.02 (금)` 형식, 시각은 24시간 `14:32` 형식', async ({ page }) => {
    await gotoEntries(page);
    const t = await page.getByTestId('entry-stamp').first().innerText();
    assert.ok(/\d{4}\.\d{2}\.\d{2} \([월화수목금토일]\)/.test(t), t);
    assert.ok(/\b([01]\d|2[0-3]):[0-5]\d\b/.test(t) && !/오전|오후|AM|PM/i.test(t), t);
  }, { seed: rich });

  console.log('\n[4단계: 용어]');

  await test('기억할 것: 화면·접근성 이름 어디에도 "메모"가 없고 "기억할 것"으로 통일', async ({ page }) => {
    await screens[8][1](page);
    const all = (await bodyText(page)) + '\n' + (await attrText(page));
    assert.ok(!all.includes('메모'), '"메모"가 남아 있음: ' + all.split('\n').filter(l => l.includes('메모')).join(' | '));
    assert.ok(all.includes('기억할 것 수정') && all.includes('기억할 것 삭제'));
  }, { seed: rich });

  await test('기억할 것이 비었을 때 안내 문구도 용어·해요체를 따름', async ({ page }) => {
    await gotoTodos(page);
    await page.getByRole('button', { name: /기억할 것/ }).click();
    await page.waitForTimeout(300);
    const t = await bodyText(page);
    assert.ok(t.includes('아직 기억할 것이 없어요.'), t.slice(0, 300));
  });

  await test('업무일지 통계 이름은 "전체 일지"("전체 기록" 아님)', async ({ page }) => {
    await gotoEntries(page);
    const t = await bodyText(page);
    assert.ok(t.includes('전체 일지') && !t.includes('전체 기록'));
  });

  await test('미처리 빠른 기록이 없을 때: "정리할 빠른 기록이 없어요."', async ({ page }) => {
    await gotoQuick(page);
    const t = await bodyText(page);
    assert.ok(t.includes('정리할 빠른 기록이 없어요.'), t.slice(0, 400));
  }, { seed: () => { const d = seed(); d['data/quick-notes.json'].forEach(n => { n.processed = true; n.linkedEntryId = 'e1'; }); return d; } });

  await test('"강조"와 "하이라이트"가 섞이지 않음: 하이라이트 탭 이름은 그대로, 글자 서식 버튼은 "강조"', async ({ page }) => {
    await gotoQuick(page);
    assert.ok((await page.getByRole('button', { name: '선택한 글자 강조' }).innerText()).includes('강조'));
    await gotoEntries(page);
    assert.ok(await page.getByRole('button', { name: '하이라이트' }).count() === 1);
  });

  summary();
})();
