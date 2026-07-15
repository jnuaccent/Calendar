// ⚠️ 이 파일의 API 키는 소스에 그대로 노출됩니다. 이는 정적 호스팅(GitHub Pages)
// 제약 하에서 의도적으로 보안을 완화한 선택입니다. 키 자체를 숨기는 대신
// Google Cloud Console에서 다음 제한이 걸려 있어야 합니다 (README 체크리스트 참고):
//   1. HTTP 리퍼러 허용 목록: 배포 Origin + http://localhost:*/*
//   2. API 제한: Google Calendar API만 허용
//   3. 대상 캘린더 공유 설정: "공개 사용 설정(모든 일정 세부정보 보기)"

// 대상 구글 캘린더 ID (캘린더 설정 → "캘린더 통합"에서 확인)
export const CALENDAR_ID =
  '8144725e8bc61e4646fbba93e828be0c30d7212cc8c3c8cc0b781bd948010a4b@group.calendar.google.com';

// Google Cloud Console → API 및 서비스 → 사용자 인증 정보에서 발급한 API 키
export const API_KEY = 'AIzaSyCbIvppet2WOyCIbB7REM2jpkOU8ppQkuA';

// 모든 날짜 계산의 기준 타임존 (브라우저 로컬 타임존에 의존하지 않음)
export const TIME_ZONE = 'Asia/Seoul';

// Apps Script Web App 배포 URL (배포 → 새 배포 → 웹 앱 → URL 복사)
// 형식: https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
export const APPS_SCRIPT_URL = 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE';

// 관리자 로그인용 OAuth 2.0 클라이언트 ID (웹 애플리케이션 유형)
// Google Cloud Console → 사용자 인증 정보 → OAuth 클라이언트 ID 만들기
// "승인된 자바스크립트 원본"에 배포 Origin과 http://localhost 포트를 등록
// 형식: xxxxxxxx.apps.googleusercontent.com
export const GOOGLE_OAUTH_CLIENT_ID = 'PASTE_OAUTH_CLIENT_ID_HERE';

// 팀당 주간 예약 소프트 상한 (경고용 — 서버가 강제로 막지 않음)
export const WEEKLY_CAP = 2;

// 월간 그리드 한 칸에 인라인으로 표시할 최대 이벤트 수 (초과분은 "외 N건")
export const MONTH_CELL_MAX_EVENTS = 2;

// 주간 뷰 한 칸에 표시할 최대 이벤트 수
export const WEEK_CELL_MAX_EVENTS = 8;
