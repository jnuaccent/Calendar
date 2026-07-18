# CLAUDE.md

이 파일은 향후 세션(사람 또는 코딩 에이전트)이 이 저장소에서 작업할 때 빠르게 맥락을 잡기
위한 요약이다. 상세 설계 근거는 `C:\Users\sws18\.claude\plans\dreamy-nibbling-newt.md`
(승인된 구현 계획)를 참고.

## 이 앱이 뭔지

대학교 동아리(부원 ~200명, 캘린더 관리자 4명)의 공용 일정 캘린더. 조회는 완전 공개
(로그인 없음, 링크만으로 접속), 쓰기(등록/수정/삭제)는 관리자 4명만 별도 관리자 페이지에서.

세 가지 일정 종류가 있고 각각 규칙이 다르다(자세한 건 `CONTRACT.md`):
- **합주(band)** — 밴드팀 단위, 팀당 주 최대 2회(소프트 경고, 하드 블록 아님).
- **레슨(lesson)** — 파트(악기 단위, 밴드팀과 완전히 별개 명단) 단위, 횟수 제한 없음.
- **공통 일정(common)** — 팀/파트 태그 없음, 회장단(=관리자 4명 중 일부/전부)이 직접 등록.

## 아키텍처 (바꾸기 전에 이유를 먼저 이해할 것)

- **예산 0원, 개발자 없이도 유지보수 가능**해야 한다는 제약이 모든 기술 선택의 근거다.
- 정적 사이트(GitHub Pages) + Google Calendar API 읽기(공개, API 키) + Google Apps Script
  Web App 쓰기(무료, 서버 검증) + Google Sheet 기반 명단 관리(코드 없이 수정 가능).
- **읽기**: `js/googleCalendarApi.js`가 API 키로 브라우저에서 직접 Calendar API v3 호출.
  `index.html`/`admin.html` 둘 다 이걸 쓴다 — 관리자 전용 읽기 액션은 따로 없음.
- **쓰기**: `admin.html` → GIS(Google Identity Services) 로그인으로 ID 토큰 획득 →
  `js/adminApi.js`가 그 토큰을 매 요청에 실어 Apps Script Web App(`apps-script/Code.gs`) 호출
  → 서버가 토큰 재검증 + 관리자 이메일 시트 대조 후에만 허용. 통신 규약은 `CONTRACT.md`가
  단일 기준 — 한쪽만 고치면 안 됨.
- **명단**: Google Sheet 3개 탭(밴드팀 목록/파트 목록/관리자 이메일). ID는 등록 순번 정수로
  최초 1회만 부여, 이름 변경/비활성화해도 절대 안 바뀜(소프트 삭제만, 행 삭제 금지) —
  과거 이벤트·주간 카운트 이력이 끊기지 않게 하기 위함.
- **이벤트 태깅**: `extendedProperties.private`에 `eventType`/`teamId`/`partId` 저장. 모든
  카운트·색상 로직은 이 안정적 ID 기준이고, 제목(사람이 읽는 텍스트)은 로직에 안 쓰인다.

## 계층 분리 (UI를 나중에 다시 짤 예정 — 반드시 지킬 것)

- **데이터/상태 계층** — `js/googleCalendarApi.js`, `js/adminApi.js`, `js/dateUtils.js`,
  `js/colorUtil.js`, `js/state.js`. DOM 접근 전혀 없음, 순수 함수 + 평범한 데이터 객체만.
- **화면 계층** — `js/viewMonth.js`, `js/viewWeek.js`, `js/dayDetail.js`, `css/styles.css`.
  이미 정규화된 데이터를 받아 `createElement`/`textContent`/`classList`로 직접 DOM을 그린다.
  자체 템플릿 엔진/컴포넌트 프레임워크 없음 — 앞으로도 만들지 말 것.
- **조립 계층** — `js/app.js`(공개 페이지), `js/admin.js`(관리자 페이지)만 두 계층을 모두
  import한다. 다른 파일은 서로를 몰라도 되게 유지할 것.
- 색상은 hue만 데이터(`colorUtil.js`가 계산), 나머지 시각 요소(칩 모양/여백/다크모드)는
  전부 `styles.css`의 `[data-event-type]` 규칙이 담당 — 새 UI를 짤 때 이 두 파일과
  HTML 마크업만 건드리면 되도록 유지할 것.

## 파일 구조

`index.html`/`admin.html`(마크업) · `css/styles.css` · `js/config.js`(상수, 수동 설정 필요)
· `js/dateUtils.js` · `js/colorUtil.js` · `js/googleCalendarApi.js` · `js/adminApi.js` ·
`js/state.js` · `js/viewMonth.js`/`viewWeek.js`/`dayDetail.js` · `js/app.js`/`admin.js`
(조립) · `apps-script/Code.gs`(백엔드, Apps Script 편집기에 수동 복사 배포) · `CONTRACT.md`
(통신 규약) · `README.md`(수동 설정 체크리스트 + 운영 매뉴얼).

빌드 도구 없음(no npm/bundler). `type="module"`은 `file://`로 안 열리므로 로컬 확인 시
`npx serve .` 등 정적 서버 필요.

## 참고: 이전 시도

git 히스토리(`562c140`~`40a017d`)에 이 앱의 더 단순한 이전 버전(팀 구분 없이 단일 "팀"
개념, 합주/레슨/공통 3분류 없음)이 있었으나 커밋되지 않은 채 디스크에서 삭제된 상태다.
이번 구현은 사용자 결정에 따라 그 코드를 재사용하지 않고 처음부터 새로 설계한 것 — 데이터
모델이 다르므로(3분류 + 팀/파트 별도 명단) 재사용이 오히려 더 복잡했다. 그 파일들은 그대로
두고 이번 작업과 무관하게 취급한다.
