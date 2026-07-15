# ACCENT 스마트 캘린더 — 코드 분석 및 가이드

## 개요
Google Calendar API v3를 이용해 특정 캘린더의 일정을 가져와 월간/주간 뷰로 보여주는
단일 HTML 파일 기반 캘린더 앱. 별도 빌드 과정 없이 브라우저에서 바로 실행 가능.

**스택**: 순수 JS + Tailwind CSS(CDN) + Google Calendar API (API Key 인증, 읽기 전용)

## 파일 구조
전체가 `index.html` 한 파일 안에 `<style>`(CSS), `<body>`(마크업), `<script>`(로직)로 구성됨.

## 동작 흐름
1. `init()` → 연/월 드롭다운 세팅 → `updateAll()` 호출
2. `updateAll()`
   - `viewDate` 기준 전월~익월(3개월 범위)의 일정을 Google Calendar API로 가져와 `allEvents`에 저장
   - 실패 시 `console.error`만 출력 (사용자에게는 아무 피드백 없음)
3. `render()` → 현재 뷰(`month`/`week`)에 따라 `renderMonth()` 또는 `renderWeek()` 호출 후 `renderList()`로 하단 상세 목록 갱신
4. `appendDay()` — 각 날짜 셀 렌더링 담당 (월간/주간 공용)
   - 해당 날짜의 일정을 최대 2개까지 표시, 초과 시 "외 N건" 뱃지
5. `selectDay()` — 날짜 클릭 시 하단 상세 섹션으로 스크롤 이동
6. `getColorByTitle()` — 일정 제목을 해시하여 HSL 색상 생성 → 같은 제목의 일정은 항상 같은 색

## 주요 UI 요소
| 요소 | 기능 |
|---|---|
| 월/주 토글 | `switchView()` — 그리드 레이아웃과 이벤트 표시 방식 전환 |
| 연/월 드롭다운 | `handleDropdownChange()` — 특정 연월로 즉시 이동 |
| 오늘 버튼 | `goToday()` — 오늘 날짜 기준으로 리셋 |
| 주간 이동 화살표 | `moveWeek()` — 7일 단위 이동, 월이 바뀌면 데이터 재조회 |

## 발견된 이슈 / 개선 포인트

### 1. API 키 노출 (보안, 우선순위 높음)
```js
const KEY = 'AIzaSyCbIvppet2WOyCIbB7REM2jpkOU8ppQkuA';
```
클라이언트 코드에 하드코딩되어 있어 누구나 페이지 소스에서 볼 수 있음.
Google Cloud Console에서 **HTTP 리퍼러 제한 + Calendar API 전용 범위 제한**이
걸려 있는지 반드시 확인할 것. 제한이 없다면 키가 도용되어 쿼터를 소모당할 수 있음.

### 2. 구식 Tailwind CDN
`cdnjs.../tailwind.min.css`는 Tailwind v2 빌드(JIT 미지원, 유틸리티 제한적).
프로토타입 단계에서는 무방하나 실제 서비스라면 로컬 빌드로 교체 권장.

### 3. 에러 처리 부재
API 호출 실패 시 화면에는 아무 표시 없이 빈 캘린더만 보임.
사용자에게 "일정을 불러오지 못했습니다" 같은 안내 UI 추가 필요.

### 4. 색상 문자열 치환의 취약성
```js
c.replace('hsl', 'hsla').replace(')', ', 0.1)')
```
문자열 치환 방식이라 `getColorByTitle()`의 출력 포맷이 바뀌면 쉽게 깨짐.
템플릿 리터럴로 `hsla(${hue}, 75%, 45%, 0.1)`처럼 직접 생성하는 것이 더 안전.

### 5. 월간/주간 뷰 공용 셀 렌더링
`appendDay()`가 두 뷰에서 동일하게 동작해 주간 뷰(칸이 훨씬 큼)에서도
이벤트가 2개까지만 보이고 나머지는 "외 N건"으로 뭉개짐. 주간 뷰에서는
더 많은 이벤트를 보여주도록 분기 처리하면 UX 개선 가능.

## 향후 작업 제안
- [ ] API 키 리퍼러 제한 확인/설정
- [ ] 데이터 로드 실패 시 사용자 알림 UI 추가
- [ ] 주간 뷰 전용 이벤트 표시 개수 분리
- [ ] Tailwind 로컬 빌드로 전환 (배포 시)
