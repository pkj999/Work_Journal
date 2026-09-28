# 업무일지 (Work Journal)

빌드 도구 없이 브라우저에서 바로 Babel로 변환되는 단일 HTML 파일 앱입니다.
데이터는 파일 안이 아니라 사용자의 GitHub 비공개 저장소에 JSON으로 저장되고,
`index.html`은 그 저장소를 읽고 쓰는 화면일 뿐입니다. 구조 지도는 `index.html` 상단 주석 참고.

## 작업 지침

- `index.html`을 수정할 때마다, 수정이 끝난 뒤 **최신 `index.html` 내용을 Artifact로 발행**해서
  사용자가 Claude 안에서 바로 열어보고 이어서 수정할 수 있게 할 것. 파일 경로만 알려주고 끝내지 않는다.
- `index.html`/`sw.js`를 의미 있게 바꾸면 `index.html`의 `APP_VERSION`과 `sw.js`의 `CACHE_NAME` 버전도 같이 올린다(기존 관례).
- 커밋은 사용자가 명시적으로 요청했을 때만 한다.
