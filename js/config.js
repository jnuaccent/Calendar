// 이 파일의 모든 값은 README.md "수동 설정" 절의 단계별 안내를 따라 실제 값으로
// 채워야 한다. 코드 수정만으로는 채울 수 없는 값들(캘린더 ID, API 키, Apps Script 배포 URL,
// OAuth 클라이언트 ID)이므로 새 저장소를 만들 때마다 이 파일을 다시 채워야 한다.

// Google Calendar 설정(공유 설정 > "통합 캘린더")에서 확인하는 캘린더 ID.
export const CALENDAR_ID = '8144725e8bc61e4646fbba93e828be0c30d7212cc8c3c8cc0b781bd948010a4b@group.calendar.google.com';

// Google Cloud Console에서 발급한 API 키. 반드시 HTTP 리퍼러 허용 목록(배포 Origin +
// http://localhost:*/*) + API 제한(Google Calendar API 전용)을 걸어둔 뒤 사용한다.
// 정적 사이트 특성상 이 키는 브라우저 소스에 그대로 노출된다 — 이것은 은닉이 아니라
// "리퍼러 제한"으로 대응하기로 한 의도적인 선택이다(README.md 참고).
export const API_KEY = 'AIzaSyCXGl6GQsFqDRdPBp1EcPOlOR4Bz0fWg8w';

// 모든 날짜/시간 계산과 표시에 사용하는 고정 타임존.
export const TIME_ZONE = 'Asia/Seoul';

// Apps Script 배포(Deploy > Manage deployments)에서 나오는 /exec URL.
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyMdcUCgCZgZCcy5brIdq34B318OhHSdaktS5TNimEBJNvUlkI0_LNAE8Fy1rIwIuNN/exec';

// Google Cloud Console에서 발급한 OAuth 2.0 클라이언트 ID(웹 애플리케이션).
// Code.gs 상단의 OAUTH_CLIENT_ID 상수와 반드시 동일한 값이어야 한다 — 다르면 모든 관리자
// 요청이 INVALID_TOKEN으로 거부된다.
export const GOOGLE_OAUTH_CLIENT_ID = '122837880255-bjj9fnut159a7ru83t9niicq9t5nstn9.apps.googleusercontent.com';

// 서버(getWeeklyBandCount)가 매 응답마다 실제 cap 값을 함께 내려주므로 이 값은 그 응답이
// 오기 전 잠깐 보여주는 표시용 폴백일 뿐이다. 규칙을 바꿀 때는 이 값이 아니라
// Code.gs의 WEEKLY_BAND_CAP 상수를 고친다.
export const DEFAULT_WEEKLY_BAND_CAP = 2;
