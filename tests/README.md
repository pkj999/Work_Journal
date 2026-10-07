# 테스트

`index.html`(실제 앱 코드)을 그대로 브라우저에서 띄워서 동작을 확인합니다.

- React/Babel/Tailwind는 CDN 대신 npm에서 받은 로컬 파일로 대체합니다(CDN이 막힌 환경에서도 돌아가게).
- GitHub API는 `harness.js`의 메모리 기반 가짜 서버로 대체합니다 (sha 충돌(409), 서버 오류(500), 느린 응답을 흉내 낼 수 있음).
- Tailwind는 v4 브라우저 빌드라 실제 배포(v3 CDN)와 미세한 스타일 차이는 있을 수 있어요. **기능·동작 검증용**입니다.

## 실행

```
cd tests
npm install
npm test            # 전체 (약 5~6분)
node baseline.js    # 기존 기능 회귀만 (약 1분)
```

Chromium 경로가 기본(`/opt/pw-browsers/chromium`)과 다르면 `CHROMIUM_PATH=...` 로 지정하세요.
`npm install`이 브라우저를 새로 받지 않도록 필요하면 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

## 파일

- `harness.js` — 서버/가짜 GitHub/브라우저 실행
- `seed.js` — 테스트용 기본 데이터
- `baseline.js` — 기존 기능(검색, 단건 삭제, 즐겨찾기, 빠른 기록, 할 일, 409 충돌) 회귀
- `bulk.js`, `bulk2.js` — 일괄 선택(선택 모드) 기능 + 엣지 케이스
- `emph-unit.js` — 강조(==) 파싱/토글 로직 단위 테스트(index.html의 실제 코드를 꺼내서 실행, 무작위 3000회 포함)
- `emph-ui.js` — 강조 기능 UI: 입력 → 저장 → 카드 표시 → 검색과 겹침 → 빠른 기록 → 모바일/다크
- `collect.js` — 모아보기(프로젝트·태그 필터, 여러 태그 AND, 표기 다른 태그 합치기, 삭제 후 선택 정리)
- `tags.js` — 태그 입력: 태그 칸 위치, 최근 태그 칩(순서·표기 합치기·30개 집계·8개 제한·토글), 직접 입력·자동완성 유지
