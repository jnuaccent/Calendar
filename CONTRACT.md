# 프론트엔드 ↔ 백엔드 계약 (wire protocol)

`admin.html`(정적 사이트) ↔ Apps Script Web App 사이의 통신 규약.
**양쪽 코드(`js/adminApi.js`, `apps-script/Code.gs`)는 반드시 이 문서를 기준으로 작성/수정한다.**
한쪽만 바꾸면 안 되고, 규약 변경 시 이 문서를 먼저 고친 뒤 양쪽을 맞춘다.

## 인증 방식 (GIS ID 토큰)

- Apps Script Web App은 **"액세스: 모든 사용자(익명 포함)"**로 배포한다.
  `Session.getActiveUser()`는 쓰지 않는다 — GitHub Pages 등 다른 출처에서 `fetch`로
  호출하면 브라우저가 Google 세션 쿠키를 붙이지 않아 이메일을 얻을 수 없기 때문.
- 대신 `admin.html`이 **Google Identity Services(GIS)**로 로그인해 **ID 토큰(JWT)**을 받고,
  모든 요청 본문에 `idToken`으로 실어 보낸다.
- 서버(Code.gs)는 매 요청마다:
  1. `https://oauth2.googleapis.com/tokeninfo?id_token=...`으로 토큰 검증
  2. 응답의 `aud`가 우리 OAuth 클라이언트 ID와 일치하는지 확인
  3. `email_verified`가 `"true"`인지 확인
  4. `email`이 스프레드시트 "관리자 이메일" 탭 목록에 있는지 확인
  하나라도 실패하면 쓰기/조회 요청을 거부한다. 프론트 숨김이 아니라 서버에서 실제로 막힘.
- ID 토큰 수명은 약 1시간. 만료 시 서버가 `INVALID_TOKEN`을 반환하고,
  `adminApi.js`는 세션을 지우고 재로그인을 유도한다.

## 전송 규약

- **요청**: `POST {APPS_SCRIPT_URL}`, 헤더 `Content-Type: text/plain;charset=utf-8`
  (CORS preflight 회피 — Apps Script는 OPTIONS에 응답하지 못함), 본문은 JSON 문자열.
- `fetch` 옵션: `redirect: 'follow'` (Apps Script는 googleusercontent.com으로 302 리디렉션함).
- **응답**: `ContentService`로 만든 JSON (`MimeType.JSON`).

### 요청 본문
```json
{ "action": "<액션명>", "idToken": "<GIS ID 토큰>", "payload": { } }
```

### 응답 본문
```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": { "code": "<에러코드>", "message": "<사람이 읽을 설명(한국어)>" } }
```

### 에러 코드
| code | 의미 |
|---|---|
| `INVALID_TOKEN` | 토큰 없음/만료/검증 실패/aud 불일치 → 프론트는 재로그인 유도 |
| `NOT_ADMIN` | 로그인은 됐지만 관리자 목록에 없는 이메일 |
| `VALIDATION` | payload 필드 누락/형식 오류 |
| `NOT_FOUND` | 대상 이벤트 없음 (update/delete) |
| `CALENDAR_ERROR` | Calendar 조작 실패 (서버측 예외) |
| `UNKNOWN` | 그 외 |

## 액션

날짜는 전부 `"YYYY-MM-DD"` 문자열(`dateISO`), 시각은 `"HH:mm"` 24시간제,
타임존은 항상 `Asia/Seoul` 기준. 주(週)는 월요일 시작.

### `listTeams` — 활성 팀 목록
- payload: `{}`
- data: `{ "teams": [ { "teamId": "1", "name": "밴드1" }, ... ] }`
- 활성(체크박스 TRUE) 팀만, teamId 숫자 오름차순. `teamId`는 정수 문자열(등록 순번, 불변).

### `getWeeklyCount` — 특정 팀의 해당 주 예약 수
- payload: `{ "teamId": "1", "dateISO": "2026-07-16" }` (dateISO가 속한 주를 계산)
- data: `{ "count": 2, "weekStartISO": "2026-07-13", "weekEndISO": "2026-07-19" }`
- count = 해당 주(월~일)에 `extendedProperties.private.teamId == teamId`인 이벤트 수.

### `createEvent` — 일정 생성
- payload:
```json
{
  "teamId": "1",            // null이면 동아리 주최 행사 (teamId 태깅 안 함)
  "title": "[밴드1] 합주",
  "dateISO": "2026-07-16",
  "allDay": false,
  "startTime": "19:00",      // allDay=true면 무시
  "endTime": "21:00",        // allDay=true면 무시
  "description": ""          // 선택
}
```
- data: `{ "eventId": "<구글 캘린더 이벤트 ID>" }`
- teamId가 있으면 서버가 `extendedProperties.private.teamId`에 저장.

### `updateEvent` — 일정 수정
- payload: `createEvent`와 동일 + `"eventId"` 필수. 보낸 필드 전체로 덮어씀.
- data: `{ "eventId": "..." }`

### `deleteEvent` — 일정 삭제
- payload: `{ "eventId": "..." }`
- data: `{ "eventId": "..." }`

이벤트 목록/상세 **읽기**는 액션에 없음 — 관리자 페이지도 공개 페이지와 동일하게
Calendar API(v3) + API 키로 직접 읽는다(`js/googleCalendarApi.js` 재사용).
이벤트 ID도 그 응답에서 얻는다.

## `js/adminApi.js`가 노출해야 하는 인터페이스 (ES 모듈)

```js
export class AdminApiError extends Error { code; message; }

// GIS 스크립트(https://accounts.google.com/gsi/client)를 동적 로드하고
// buttonEl에 로그인 버튼 렌더. 로그인/로그아웃/토큰만료 시 onChange(user|null) 호출.
// user = { email, name }
export function initSignIn({ buttonEl, onChange });

export function getUser();          // { email, name } | null
export function signOut();          // 세션(토큰) 폐기 + onChange(null)

// 아래 모두 Promise. 실패 시 AdminApiError(code는 위 에러 코드 표) throw.
// INVALID_TOKEN 수신 시: 내부에서 세션을 지우고 onChange(null) 호출 후 throw.
export function listTeams();                      // → [{ teamId, name }]
export function getWeeklyCount(teamId, dateISO);  // → { count, weekStartISO, weekEndISO }
export function createEvent(payload);             // → { eventId }
export function updateEvent(payload);             // → { eventId }
export function deleteEvent(eventId);             // → { eventId }
```

`config.js`에서 가져다 쓰는 값: `APPS_SCRIPT_URL`, `GOOGLE_OAUTH_CLIENT_ID`.

## 스프레드시트 스키마 (Code.gs가 읽는 형식)

스프레드시트 ID는 `Code.gs` 상단의 이름 붙은 상수 `SPREADSHEET_ID`로 둔다.
`WEEKLY_CAP` 등 규칙 값도 같은 위치에 이름 붙은 상수로.

```
탭 "팀 목록":      A열 팀ID(정수, 등록 순번, 불변) | B열 팀 이름 | C열 활성(체크박스)
탭 "관리자 이메일": A열 이메일 (1행부터, 헤더 없음 여부는 Code.gs 상수로 명시)
```
