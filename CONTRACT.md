# 프론트엔드 ↔ 백엔드 계약 (wire protocol)

`admin.html`(정적 사이트) ↔ Apps Script Web App(`apps-script/Code.gs`) 사이의 통신 규약.
**양쪽 코드(`js/adminApi.js`, `apps-script/Code.gs`)는 반드시 이 문서를 기준으로 작성/수정한다.**
한쪽만 바꾸면 안 되고, 규약을 바꿀 때는 이 문서를 먼저 고친 뒤 양쪽을 맞춘다.

이벤트 목록/상세를 **읽는** 것은 이 규약에 없다 — 공개 페이지(`index.html`)와 관리자 페이지
(`admin.html`) 둘 다 `js/googleCalendarApi.js`를 통해 Google Calendar API v3를 API 키로 직접
읽는다. 이 문서는 오직 **쓰기(생성/수정/삭제)** 와 **주간 카운트 조회**만 다룬다.

## 인증 방식 (Google Identity Services ID 토큰)

- Apps Script Web App은 **배포 시 "실행: 나(스크립트 소유자)" / "액세스: 모든 사용자(익명 포함)"**로
  배포한다. `Session.getActiveUser()`는 쓰지 않는다 — GitHub Pages 등 다른 출처에서 `fetch`로
  호출하면 브라우저가 Google 세션 쿠키를 붙이지 않아 이메일을 얻을 수 없기 때문이다. 바로 이
  제약 때문에 서버가 직접 신원을 검증해야 한다.
- 대신 `admin.html`이 **Google Identity Services(GIS)**로 로그인해 **ID 토큰(JWT)**을 받고,
  모든 요청 본문에 `idToken`으로 실어 보낸다.
- `adminApi.js`는 이 토큰을 **모듈 스코프 변수에만** 보관한다(`localStorage`/`sessionStorage`
  금지 — 토큰 수명이 짧고, 탭을 닫으면 세션도 끝나는 게 맞다). 요청 전송 전, 디코딩한 `exp`가
  이미 지났으면 네트워크 호출 없이 즉시 세션을 지우고 `onChange(null)`을 호출한다 — 다만 이건
  UX 최적화일 뿐, 서버는 매 요청마다 독립적으로 토큰을 재검증한다.
- 서버(`Code.gs`)는 **모든 액션에서 (읽기 성격의 액션 포함)** 요청마다 `verifyAdmin_(idToken)`을
  거친다:
  1. `idToken`이 없거나 문자열이 아니면 즉시 `INVALID_TOKEN`.
  2. `https://oauth2.googleapis.com/tokeninfo?id_token=...`으로 토큰 검증(`UrlFetchApp.fetch`).
  3. 응답이 200이 아니거나 JSON 파싱이 안 되면 `INVALID_TOKEN`.
  4. 응답의 `aud`가 `Code.gs`의 `OAUTH_CLIENT_ID` 상수와 **정확히 일치**하는지 확인 — `config.js`의
     `GOOGLE_OAUTH_CLIENT_ID`와 같은 값이어야 한다. 다르면 `INVALID_TOKEN`.
  5. `email_verified`가 `"true"`인지 확인. 아니면 `INVALID_TOKEN`.
  6. `exp`가 이미 지나지 않았는지 확인. 지났으면 `INVALID_TOKEN`.
  7. 이메일을 소문자/trim한 뒤 스프레드시트 "관리자 이메일" 탭 목록과 대조. 없으면 `NOT_ADMIN`.
  8. 통과하면 `{ email }` 반환, 이후 로직 진행.
- ID 토큰 수명은 약 1시간. 만료 시 서버가 `INVALID_TOKEN`을 반환하고, `adminApi.js`는 세션을
  지우고 재로그인을 유도한다.

## 전송 규약

- **요청**: `POST {APPS_SCRIPT_URL}`, 헤더 `Content-Type: text/plain;charset=utf-8`
  (CORS preflight 회피 — Apps Script는 `OPTIONS` 요청에 응답하지 못한다), 본문은 JSON 문자열.
- `fetch` 옵션: `redirect: 'follow'` (Apps Script는 `googleusercontent.com`으로 302 리디렉션한다).
- **응답**: `ContentService`로 만든 JSON(`MimeType.JSON`). `doPost`의 모든 코드 경로(예상치 못한
  예외 포함)는 반드시 아래 두 형태 중 하나로 귀결되어야 한다 — 원본 스택 트레이스가 그대로
  새어나가면 안 된다.

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
| code | 의미 | 클라이언트 동작 |
|---|---|---|
| `INVALID_TOKEN` | 토큰 없음/만료/검증 실패/`aud` 불일치/이메일 미검증 | 세션 삭제, 재로그인 유도 |
| `NOT_ADMIN` | 로그인은 됐지만 관리자 목록에 없는 이메일 | "관리자 권한이 없습니다" 배너, 재로그인 유도 안 함(구글 로그인 자체는 유지) |
| `VALIDATION` | payload 필드 누락/형식 오류, 또는 `eventType`과 `teamId`/`partId` 조합 불일치 | 폼 근처에 서버 메시지 그대로 표시 |
| `NOT_FOUND` | 대상 이벤트 없음(update/delete) | 메시지 표시 후 이벤트 목록 새로고침 |
| `CALENDAR_ERROR` | Calendar 조작 중 서버측 예외 | 일반 재시도 안내 |
| `UNKNOWN` | 그 외 | 일반 재시도 안내 |
| `NETWORK` | *(서버가 절대 보내지 않는 클라이언트 전용 코드)* — `fetch` 자체 실패 또는 응답이 JSON이 아님 | "네트워크 연결을 확인해 주세요" |

## 액션

날짜는 전부 `"YYYY-MM-DD"` 문자열(`dateISO`), 시각은 `"HH:mm"` 24시간제, 타임존은 항상
`Asia/Seoul` 기준. 주(週)는 월요일 시작(월~일).

### `listBandTeams` — 활성 밴드팀 목록
- payload: `{}`
- data: `{ "teams": [ { "teamId": "1", "name": "델타" }, ... ] }`
- "밴드팀 목록" 탭에서 활성(C열 체크박스 TRUE)인 행만, `teamId` 숫자 오름차순.

### `listLessonParts` — 활성 레슨 파트 목록
- payload: `{}`
- data: `{ "parts": [ { "partId": "1", "name": "보컬" }, ... ] }`
- "파트 목록" 탭에서 활성인 행만, `partId` 숫자 오름차순. `밴드팀 목록`과는 완전히 별개 시트/ID
  체계 — 두 목록을 절대 합치지 않는다.

### `getWeeklyBandCount` — 특정 밴드팀의 해당 주 합주 예약 수
- payload: `{ "teamId": "1", "dateISO": "2026-07-16" }` (`dateISO`가 속한 월~일 주를 계산)
- data: `{ "count": 2, "cap": 2, "weekStartISO": "2026-07-13", "weekEndISO": "2026-07-19" }`
- `count` = 해당 주(월~일)에 `extendedProperties.private.eventType == "band"` **이고**
  `extendedProperties.private.teamId == teamId`인 이벤트 수.
- `cap`은 서버(`Code.gs`의 `WEEKLY_BAND_CAP` 상수)가 항상 정답 — 향후 규칙 값이 바뀌어도
  `Code.gs` 상수만 고치면 되고 프론트 재배포가 필요 없다. `config.js`의
  `DEFAULT_WEEKLY_BAND_CAP`는 첫 응답이 오기 전 잠깐 보여주는 표시용 폴백일 뿐이다.
- **이 액션은 레슨/공통 일정에는 절대 호출하지 않는다** — `admin.js`는 폼의 일정 종류가
  "합주"일 때만 이 액션을 부른다.

### `createEvent` — 일정 생성
- payload:
```json
{
  "eventType": "band",       // "band" | "lesson" | "common"
  "teamId": "1",               // eventType == "band"일 때만 존재(그 외엔 아예 없어야 함)
  "partId": null,              // eventType == "lesson"일 때만 존재(그 외엔 아예 없어야 함)
  "title": "[델타] 합주",       // 사람이 읽는 표시용 제목. 카운트/색상 로직에는 전혀 안 쓰임
  "dateISO": "2026-07-16",
  "allDay": false,
  "startTime": "19:00",        // allDay=true면 생략/무시
  "endTime": "21:00",          // allDay=true면 생략/무시
  "description": ""            // 선택
}
```
- data: `{ "eventId": "<구글 캘린더 이벤트 ID>" }`
- 서버 검증(위반 시 `VALIDATION`):
  - `eventType`이 `"band"`/`"lesson"`/`"common"` 중 정확히 하나가 아니면 거부.
  - `eventType=="band"`인데 `teamId`가 없거나, `teamId`가 있는데 `eventType!="band"`이면 거부.
  - `eventType=="lesson"`인데 `partId`가 없거나, `partId`가 있는데 `eventType!="lesson"`이면 거부.
  - `teamId`/`partId`가 있다면, 해당 시트 탭에 **그 ID를 가진 행이 존재하는지**만 확인한다
    (활성 여부는 확인하지 않음 — 비활성화된 팀/파트로도 과거 보강 일정 등록/수정이 계속
    가능해야 하기 때문). 존재하지 않는 ID면 거부.
- 서버가 `extendedProperties.private`에 `eventType`(+ 있다면 `teamId`/`partId`)을 저장한다.

### `updateEvent` — 일정 수정
- payload: `createEvent`와 동일한 필드 + `"eventId"` 필수.
- 서버는 `Calendar.Events.update`(전체 치환, `patch` 아님)를 사용한다 — `eventType`/`teamId`/
  `partId`를 바꾸거나 지우는 경우, 또는 종일↔시간 일정 전환 시 이전 `extendedProperties`나
  `start`/`end` 잔재가 남지 않도록.
- data: `{ "eventId": "..." }`

### `deleteEvent` — 일정 삭제
- payload: `{ "eventId": "..." }`
- data: `{ "eventId": "..." }`

## `js/adminApi.js`가 노출해야 하는 인터페이스 (ES 모듈)

```js
export class AdminApiError extends Error { code; message; }

// GIS 스크립트(https://accounts.google.com/gsi/client)를 동적 로드하고
// buttonEl에 로그인 버튼을 렌더링한다. 로그인/로그아웃/토큰만료 시 onChange(user|null) 호출.
// user = { email, name }
export function initSignIn({ buttonEl, onChange });

export function getUser();          // { email, name } | null
export function signOut();          // 세션(토큰) 폐기 + onChange(null)

// 아래 전부 Promise. 실패 시 AdminApiError(code는 위 에러 코드 표) throw.
// INVALID_TOKEN 수신 시: 내부에서 세션을 지우고 onChange(null) 호출한 뒤 throw.
export function listBandTeams();                    // → [{ teamId, name }]
export function listLessonParts();                  // → [{ partId, name }]
export function getWeeklyBandCount(teamId, dateISO); // → { count, cap, weekStartISO, weekEndISO }
export function createEvent(payload);                // → { eventId }
export function updateEvent(payload);                // → { eventId }
export function deleteEvent(eventId);                // → { eventId }
```

`config.js`에서 가져다 쓰는 값: `APPS_SCRIPT_URL`, `GOOGLE_OAUTH_CLIENT_ID`.

## 스프레드시트 스키마 (`Code.gs`가 읽는 형식)

스프레드시트 ID는 `Code.gs` 상단의 이름 붙은 상수 `SPREADSHEET_ID`로 둔다. `WEEKLY_BAND_CAP` 등
규칙 값도 같은 위치에 이름 붙은 상수로 둔다. 자세한 내용은 `README.md`의 시트 스키마 절 참고.

```
탭 "밴드팀 목록":   A열 팀ID(정수, 등록 순번, 불변) | B열 팀 이름 | C열 활성(체크박스)
탭 "파트 목록":     A열 파트ID(정수, 등록 순번, 불변) | B열 파트 이름 | C열 활성(체크박스)
탭 "관리자 이메일": A열 이메일 (1행부터, 헤더 없음)
```

밴드팀과 레슨파트는 **완전히 별개의 ID 공간**이다 — 같은 숫자 `teamId="1"`과 `partId="1"`이
서로 다른 실체를 가리켜도 전혀 문제없다(`colorUtil.js`가 이미 서로 다른 위상 오프셋으로 색을
분리하기 때문).
