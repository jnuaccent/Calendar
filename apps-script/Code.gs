/**
 * ============================================================================
 * ACal 관리자 백엔드 (Google Apps Script Web App)
 * ============================================================================
 *
 * 이 파일은 저장소의 참고용 사본입니다. 실제 배포는 이 내용을 통째로 복사해서
 * Apps Script 편집기(script.google.com)에 붙여넣는 방식으로 합니다.
 * (clasp 같은 도구는 쓰지 않습니다 — 아래 순서만 따라 하면 됩니다.)
 *
 * ── 운영 매뉴얼 (동아리 임원용 — 코드를 몰라도 됩니다) ──────────────────────
 *
 * [1] 설정 스프레드시트 만들기 (이미 있으면 형식만 확인)
 *   - 동아리 공용 Google 계정으로 스프레드시트를 하나 만든다.
 *   - 탭(시트) 두 개를 아래 이름 "그대로" 만든다:
 *
 *     탭 "팀 목록"  (1행은 제목 행 — 예: 팀ID | 팀 이름 | 활성. 데이터는 2행부터)
 *       A열: 팀ID   — 1, 2, 3 … 등록 순서대로 붙이는 정수. 한 번 정하면 절대 바꾸지 않는다!
 *                     새 팀 등록 시 "지금까지 마지막 팀ID + 1"을 쓴다.
 *       B열: 팀 이름 — 표시용. 언제든지 자유롭게 바꿔도 된다(팀ID만 그대로면 이력 유지됨).
 *       C열: 활성   — 체크박스 (삽입 메뉴 → 체크박스). 체크 해제 = 팀 숨김(소프트 삭제).
 *                     행을 삭제하지 말 것! 체크만 끄면 나중에 다시 켜서 복구할 수 있다.
 *
 *     탭 "관리자 이메일"  (제목 행 없음 — 1행부터 바로 데이터)
 *       A열: 관리자의 Google 이메일 주소를 한 줄에 하나씩.
 *             여기 있는 이메일만 관리자 페이지에서 일정을 등록/수정/삭제할 수 있다.
 *
 *   - 스프레드시트 URL 가운데의 ID(https://docs.google.com/spreadsheets/d/<이부분>/edit)를
 *     아래 SPREADSHEET_ID 상수에 붙여넣는다.
 *
 * [2] Apps Script 프로젝트 준비
 *   - 동아리 공용 계정으로 script.google.com → 새 프로젝트 → 이 파일 내용을 통째로 붙여넣기.
 *   - 왼쪽 사이드바 "서비스" 옆의 + 버튼 → 목록에서 "Google Calendar API" 선택 → 추가.
 *     (식별자는 기본값 "Calendar" 그대로. 이걸 켜지 않으면 일정 등록이 전부 실패한다!)
 *   - 아래 상수 4개를 채운다: SPREADSHEET_ID, CALENDAR_ID, OAUTH_CLIENT_ID (+ 필요 시 WEEKLY_CAP).
 *
 * [3] 배포하기
 *   - 우측 상단 "배포" → "새 배포" → 유형 선택(톱니바퀴) → "웹 앱"
 *       · 실행:   "나" (스크립트 소유자 = 동아리 공용 계정)
 *       · 액세스: "모든 사용자" (익명 포함 — 인증은 코드 안에서 ID 토큰으로 직접 검증한다)
 *   - 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/…/exec)을
 *     저장소의 js/config.js 안 APPS_SCRIPT_URL에 붙여넣는다.
 *
 * [4] ★ 코드를 수정한 뒤에는 반드시 "새 버전으로 배포" 해야 반영된다 ★
 *   - 저장만 하면 절대 반영되지 않는다.
 *   - "배포" → "배포 관리" → 연필(수정) 아이콘 → 버전: "새 버전" → "배포".
 *   - 이렇게 하면 URL은 그대로 유지되므로 config.js는 다시 고칠 필요 없다.
 *
 * [5] 자주 생기는 문제
 *   - 일정 등록이 전부 CALENDAR_ERROR로 실패 → [2]의 Calendar API 서비스 추가를 안 했거나,
 *     스크립트 소유 계정이 대상 캘린더의 "일정 변경" 권한을 갖고 있지 않은 경우.
 *   - 관리자인데 NOT_ADMIN이 나옴 → "관리자 이메일" 탭의 철자/공백 확인 (대소문자는 무시됨).
 *   - 수정했는데 동작이 그대로 → [4] 새 버전 배포를 안 한 것.
 *
 * ── 인증 방식 (요약) ─────────────────────────────────────────────────────────
 * admin.html이 Google 로그인(GIS)으로 받은 ID 토큰을 매 요청에 실어 보내고,
 * 이 스크립트가 매 요청마다 구글 tokeninfo로 토큰을 검증한 뒤(aud/만료/이메일 확인)
 * 이메일을 "관리자 이메일" 탭과 대조한다. 목록에 없으면 서버에서 실제로 거부된다.
 * 규약 상세는 저장소의 CONTRACT.md 참고.
 * ============================================================================
 */

// ───────────────────────── 설정 상수 (여기만 고치면 됨) ─────────────────────────

// 설정 스프레드시트 ID — URL의 /d/ 와 /edit 사이 문자열을 붙여넣는다.
var SPREADSHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';

// 대상 구글 캘린더 ID (js/config.js의 CALENDAR_ID와 동일해야 함)
var CALENDAR_ID =
  '8144725e8bc61e4646fbba93e828be0c30d7212cc8c3c8cc0b781bd948010a4b@group.calendar.google.com';

// 관리자 로그인용 OAuth 2.0 클라이언트 ID — js/config.js의 GOOGLE_OAUTH_CLIENT_ID와
// "반드시 같은 값"이어야 한다. 다르면 모든 요청이 INVALID_TOKEN으로 거부된다.
var OAUTH_CLIENT_ID = 'PASTE_OAUTH_CLIENT_ID_HERE';

// 모든 날짜/주간 계산의 기준 타임존
var TIME_ZONE = 'Asia/Seoul';

// 팀당 주간 예약 소프트 상한 — 서버는 이 값을 "강제"하지 않는다(경고 표시용 참고 값).
var WEEKLY_CAP = 2;

// 스프레드시트 탭 이름 (시트 탭 이름을 바꾸면 여기도 같이 바꿔야 한다)
var TEAM_SHEET_NAME = '팀 목록';
var ADMIN_SHEET_NAME = '관리자 이메일';

// "팀 목록" 탭: 1행은 제목 행이므로 데이터는 2행부터 읽는다.
var TEAM_SHEET_FIRST_DATA_ROW = 2;
// "관리자 이메일" 탭: 제목 행 없이 1행부터 바로 데이터.
var ADMIN_SHEET_FIRST_DATA_ROW = 1;

// Asia/Seoul 고정 UTC 오프셋 (한국은 서머타임이 없어 상수로 안전)
var KST_OFFSET = '+09:00';

// ───────────────────────────── 진입점 ─────────────────────────────

/**
 * 배포 URL을 브라우저 주소창에 직접 열었을 때 보이는 상태 확인용 응답.
 * (관리자 페이지가 쓰는 건 doPost 뿐이다.)
 */
function doGet() {
  return jsonOutput_({
    ok: true,
    service: 'ACal admin backend (Apps Script Web App)',
    time: new Date().toISOString(),
    note: 'POST + JSON 본문으로 호출하세요. 규약은 저장소의 CONTRACT.md 참고.',
  });
}

/**
 * 모든 관리자 요청의 단일 진입점.
 * 본문: { action, idToken, payload } (Content-Type: text/plain — CORS preflight 회피)
 * 응답: { ok:true, data } 또는 { ok:false, error:{ code, message } }
 * 어떤 예외가 나도 반드시 위 JSON 형태로 돌려준다.
 */
function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '');
    } catch (parseErr) {
      return errorOutput_('VALIDATION', '요청 본문을 JSON으로 해석할 수 없습니다.');
    }

    var action = body.action;
    var payload = body.payload || {};

    // 모든 액션(조회 포함)이 관리자 인증을 요구한다.
    var auth = verifyAdmin_(body.idToken);
    if (auth.error) {
      return errorOutput_(auth.error.code, auth.error.message);
    }

    var data;
    switch (action) {
      case 'listTeams':
        data = actionListTeams_(payload);
        break;
      case 'getWeeklyCount':
        data = actionGetWeeklyCount_(payload);
        break;
      case 'createEvent':
        data = actionCreateEvent_(payload);
        break;
      case 'updateEvent':
        data = actionUpdateEvent_(payload);
        break;
      case 'deleteEvent':
        data = actionDeleteEvent_(payload);
        break;
      default:
        return errorOutput_('VALIDATION', '알 수 없는 action 입니다: ' + String(action));
    }
    return jsonOutput_({ ok: true, data: data });
  } catch (err) {
    // 액션 함수가 던진 규약 에러 (throwApiError_ 참고)
    if (err && err.apiErrorCode) {
      return errorOutput_(err.apiErrorCode, err.message);
    }
    return errorOutput_('UNKNOWN', '서버 내부 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)));
  }
}

// ───────────────────────────── 인증 ─────────────────────────────

/**
 * GIS ID 토큰을 구글 tokeninfo로 검증하고, 이메일이 관리자 목록에 있는지 확인한다.
 * 성공: { email } / 실패: { error: { code, message } }
 */
function verifyAdmin_(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return authError_('INVALID_TOKEN', '로그인 토큰이 없습니다. 다시 로그인해 주세요.');
  }

  var response;
  try {
    response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
  } catch (fetchErr) {
    return authError_('INVALID_TOKEN', '토큰 검증 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (response.getResponseCode() !== 200) {
    return authError_('INVALID_TOKEN', '로그인 토큰이 유효하지 않거나 만료되었습니다. 다시 로그인해 주세요.');
  }

  var info;
  try {
    info = JSON.parse(response.getContentText());
  } catch (jsonErr) {
    return authError_('INVALID_TOKEN', '토큰 검증 응답을 해석할 수 없습니다.');
  }

  if (info.aud !== OAUTH_CLIENT_ID) {
    return authError_('INVALID_TOKEN', '토큰의 클라이언트 ID가 일치하지 않습니다. (config.js와 Code.gs의 OAuth 클라이언트 ID 확인)');
  }
  if (info.email_verified !== 'true') {
    return authError_('INVALID_TOKEN', '이메일이 확인되지 않은 Google 계정입니다.');
  }
  var expSeconds = parseInt(info.exp, 10);
  if (!expSeconds || expSeconds * 1000 <= Date.now()) {
    return authError_('INVALID_TOKEN', '로그인 토큰이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (!info.email) {
    return authError_('INVALID_TOKEN', '토큰에서 이메일을 확인할 수 없습니다.');
  }

  var email = String(info.email).trim().toLowerCase();
  if (!isAdminEmail_(email)) {
    return authError_('NOT_ADMIN', '관리자 목록에 없는 계정입니다: ' + info.email);
  }
  return { email: email };
}

function authError_(code, message) {
  return { error: { code: code, message: message } };
}

/** "관리자 이메일" 탭 A열과 대조 (앞뒤 공백 제거, 대소문자 무시) */
function isAdminEmail_(emailLower) {
  var sheet = getSheet_(ADMIN_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow < ADMIN_SHEET_FIRST_DATA_ROW) return false;
  var values = sheet
    .getRange(ADMIN_SHEET_FIRST_DATA_ROW, 1, lastRow - ADMIN_SHEET_FIRST_DATA_ROW + 1, 1)
    .getValues();
  for (var i = 0; i < values.length; i++) {
    var cell = String(values[i][0] || '').trim().toLowerCase();
    if (cell && cell === emailLower) return true;
  }
  return false;
}

// ───────────────────────────── 액션 구현 ─────────────────────────────

/** listTeams: 활성(체크 TRUE) 팀만, 팀ID 숫자 오름차순. teamId는 문자열로 반환. */
function actionListTeams_(payload) {
  var sheet = getSheet_(TEAM_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var teams = [];
  if (lastRow >= TEAM_SHEET_FIRST_DATA_ROW) {
    var values = sheet
      .getRange(TEAM_SHEET_FIRST_DATA_ROW, 1, lastRow - TEAM_SHEET_FIRST_DATA_ROW + 1, 3)
      .getValues();
    for (var i = 0; i < values.length; i++) {
      var rawId = values[i][0];
      var name = String(values[i][1] || '').trim();
      var active = values[i][2] === true || String(values[i][2]).toUpperCase() === 'TRUE';
      var idNum = parseInt(rawId, 10);
      // 팀ID가 정수가 아닌 행(빈 행/메모 행 등)은 건너뛴다.
      if (!isFinite(idNum) || String(idNum) !== String(rawId).trim()) continue;
      if (!active || !name) continue;
      teams.push({ idNum: idNum, teamId: String(idNum), name: name });
    }
  }
  teams.sort(function (a, b) { return a.idNum - b.idNum; });
  return {
    teams: teams.map(function (t) { return { teamId: t.teamId, name: t.name }; }),
  };
}

/**
 * getWeeklyCount: dateISO가 속한 주(월요일 시작, Asia/Seoul)의
 * extendedProperties.private.teamId == teamId 인 이벤트 수.
 */
function actionGetWeeklyCount_(payload) {
  var teamId = requireTeamId_(payload.teamId);
  var dateISO = requireDateISO_(payload.dateISO, 'dateISO');

  var week = mondayWeekOf_(dateISO); // { startISO, endISO } (end = 일요일, 포함)
  var timeMin = week.startISO + 'T00:00:00' + KST_OFFSET;
  var timeMax = addDaysISO_(week.endISO, 1) + 'T00:00:00' + KST_OFFSET;

  var count = 0;
  var pageToken = null;
  try {
    do {
      var params = {
        timeMin: timeMin,
        timeMax: timeMax,
        privateExtendedProperty: 'teamId=' + teamId,
        maxResults: 2500,
        showDeleted: false,
      };
      if (pageToken) params.pageToken = pageToken;
      var res = Calendar.Events.list(CALENDAR_ID, params);
      var items = res.items || [];
      for (var i = 0; i < items.length; i++) {
        var props = items[i].extendedProperties && items[i].extendedProperties.private;
        if (props && String(props.teamId) === teamId) count++;
      }
      pageToken = res.nextPageToken;
    } while (pageToken);
  } catch (err) {
    throwApiError_('CALENDAR_ERROR', '캘린더에서 주간 예약 수를 조회하지 못했습니다: ' + err.message);
  }

  return { count: count, weekStartISO: week.startISO, weekEndISO: week.endISO };
}

/** createEvent: 검증 후 Calendar 고급 서비스로 생성. teamId가 있으면 비공개 확장 속성에 태깅. */
function actionCreateEvent_(payload) {
  var fields = validateEventFields_(payload);
  var resource = buildEventResource_(fields);
  var created;
  try {
    created = Calendar.Events.insert(resource, CALENDAR_ID);
  } catch (err) {
    throwApiError_('CALENDAR_ERROR', '일정 생성에 실패했습니다: ' + err.message);
  }
  return { eventId: created.id };
}

/**
 * updateEvent: eventId 필수. 보낸 필드 전체로 이벤트를 덮어쓴다.
 * (patch가 아니라 update를 써서, teamId가 null로 바뀌면 태그도 실제로 제거되고
 *  종일↔시간 일정 전환 시 반대쪽 start/end 필드가 남지 않도록 한다.)
 */
function actionUpdateEvent_(payload) {
  var eventId = requireNonEmptyString_(payload.eventId, 'eventId');
  var fields = validateEventFields_(payload);

  // 존재 확인 → 없으면 NOT_FOUND
  try {
    var existing = Calendar.Events.get(CALENDAR_ID, eventId);
    if (existing && existing.status === 'cancelled') {
      throwApiError_('NOT_FOUND', '이미 삭제된 일정입니다: ' + eventId);
    }
  } catch (err) {
    if (err && err.apiErrorCode) throw err;
    if (isNotFoundError_(err)) {
      throwApiError_('NOT_FOUND', '해당 일정을 찾을 수 없습니다: ' + eventId);
    }
    throwApiError_('CALENDAR_ERROR', '일정 조회에 실패했습니다: ' + err.message);
  }

  var resource = buildEventResource_(fields);
  try {
    Calendar.Events.update(resource, CALENDAR_ID, eventId);
  } catch (err2) {
    if (isNotFoundError_(err2)) {
      throwApiError_('NOT_FOUND', '해당 일정을 찾을 수 없습니다: ' + eventId);
    }
    throwApiError_('CALENDAR_ERROR', '일정 수정에 실패했습니다: ' + err2.message);
  }
  return { eventId: eventId };
}

/** deleteEvent: eventId 필수. 없으면 NOT_FOUND. */
function actionDeleteEvent_(payload) {
  var eventId = requireNonEmptyString_(payload.eventId, 'eventId');
  try {
    Calendar.Events.remove(CALENDAR_ID, eventId);
  } catch (err) {
    if (isNotFoundError_(err)) {
      throwApiError_('NOT_FOUND', '해당 일정을 찾을 수 없습니다: ' + eventId);
    }
    throwApiError_('CALENDAR_ERROR', '일정 삭제에 실패했습니다: ' + err.message);
  }
  return { eventId: eventId };
}

// ───────────────────────────── 검증 헬퍼 ─────────────────────────────

/**
 * createEvent/updateEvent 공통 필드 검증.
 * 반환: { teamId(string|null), title, dateISO, allDay, startTime, endTime, description }
 */
function validateEventFields_(payload) {
  var title = requireNonEmptyString_(payload.title, 'title');
  var dateISO = requireDateISO_(payload.dateISO, 'dateISO');
  var allDay = payload.allDay === true;

  var teamId = null;
  if (payload.teamId !== null && payload.teamId !== undefined && payload.teamId !== '') {
    teamId = requireTeamId_(payload.teamId);
  }

  var startTime = null;
  var endTime = null;
  if (!allDay) {
    startTime = requireTime_(payload.startTime, 'startTime');
    endTime = requireTime_(payload.endTime, 'endTime');
    if (endTime <= startTime) {
      throwApiError_('VALIDATION', '종료 시각(endTime)은 시작 시각(startTime)보다 늦어야 합니다.');
    }
  }

  var description = '';
  if (payload.description !== null && payload.description !== undefined) {
    if (typeof payload.description !== 'string') {
      throwApiError_('VALIDATION', 'description은 문자열이어야 합니다.');
    }
    description = payload.description;
  }

  return {
    teamId: teamId,
    title: title,
    dateISO: dateISO,
    allDay: allDay,
    startTime: startTime,
    endTime: endTime,
    description: description,
  };
}

/** Calendar API 이벤트 리소스 생성 (insert/update 공용) */
function buildEventResource_(f) {
  var resource = {
    summary: f.title,
    description: f.description || '',
  };
  if (f.allDay) {
    // 종일 일정: end.date는 "다음 날"(exclusive)
    resource.start = { date: f.dateISO };
    resource.end = { date: addDaysISO_(f.dateISO, 1) };
  } else {
    resource.start = {
      dateTime: f.dateISO + 'T' + f.startTime + ':00' + KST_OFFSET,
      timeZone: TIME_ZONE,
    };
    resource.end = {
      dateTime: f.dateISO + 'T' + f.endTime + ':00' + KST_OFFSET,
      timeZone: TIME_ZONE,
    };
  }
  if (f.teamId !== null) {
    // 팀 이벤트만 태깅. 동아리 주최 행사(teamId 없음)는 extendedProperties 자체를 넣지 않는다.
    resource.extendedProperties = { private: { teamId: f.teamId } };
  }
  return resource;
}

function requireNonEmptyString_(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throwApiError_('VALIDATION', fieldName + ' 필드가 비어 있거나 잘못되었습니다.');
  }
  return value.trim();
}

/** teamId: 양의 정수를 나타내는 문자열(또는 숫자) → 정규화된 문자열 반환 */
function requireTeamId_(value) {
  var str = String(value === null || value === undefined ? '' : value).trim();
  var num = parseInt(str, 10);
  if (!/^\d+$/.test(str) || !isFinite(num) || num < 1) {
    throwApiError_('VALIDATION', 'teamId는 1 이상의 정수(문자열)여야 합니다: ' + str);
  }
  return String(num);
}

/** "YYYY-MM-DD" 형식 + 실제로 존재하는 날짜인지 검증 */
function requireDateISO_(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throwApiError_('VALIDATION', fieldName + '는 "YYYY-MM-DD" 형식이어야 합니다.');
  }
  var y = parseInt(value.slice(0, 4), 10);
  var m = parseInt(value.slice(5, 7), 10);
  var d = parseInt(value.slice(8, 10), 10);
  var check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throwApiError_('VALIDATION', fieldName + '가 존재하지 않는 날짜입니다: ' + value);
  }
  return value;
}

/** "HH:mm" 24시간제 검증 */
function requireTime_(value, fieldName) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throwApiError_('VALIDATION', fieldName + '은 "HH:mm"(24시간제) 형식이어야 합니다.');
  }
  return value;
}

// ───────────────────────────── 날짜 헬퍼 ─────────────────────────────
// dateISO 문자열끼리의 산술만 사용 — 스크립트/브라우저의 로컬 타임존에 의존하지 않는다.

/** dateISO가 속한 월요일 시작 주의 { startISO(월), endISO(일) } */
function mondayWeekOf_(dateISO) {
  var y = parseInt(dateISO.slice(0, 4), 10);
  var m = parseInt(dateISO.slice(5, 7), 10);
  var d = parseInt(dateISO.slice(8, 10), 10);
  var utc = new Date(Date.UTC(y, m - 1, d));
  var dowFromMonday = (utc.getUTCDay() + 6) % 7; // 월=0 … 일=6
  var startISO = addDaysISO_(dateISO, -dowFromMonday);
  var endISO = addDaysISO_(startISO, 6);
  return { startISO: startISO, endISO: endISO };
}

/** dateISO에 days(음수 가능)를 더한 "YYYY-MM-DD" */
function addDaysISO_(dateISO, days) {
  var y = parseInt(dateISO.slice(0, 4), 10);
  var m = parseInt(dateISO.slice(5, 7), 10);
  var d = parseInt(dateISO.slice(8, 10), 10);
  var utc = new Date(Date.UTC(y, m - 1, d + days));
  var yy = utc.getUTCFullYear();
  var mm = String(utc.getUTCMonth() + 1);
  var dd = String(utc.getUTCDate());
  if (mm.length < 2) mm = '0' + mm;
  if (dd.length < 2) dd = '0' + dd;
  return yy + '-' + mm + '-' + dd;
}

// ───────────────────────────── 공용 유틸 ─────────────────────────────

function getSheet_(name) {
  if (SPREADSHEET_ID === 'PASTE_SPREADSHEET_ID_HERE') {
    throwApiError_('UNKNOWN', 'Code.gs 상단의 SPREADSHEET_ID가 아직 설정되지 않았습니다.');
  }
  var ss;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    throwApiError_('UNKNOWN', '설정 스프레드시트를 열 수 없습니다. SPREADSHEET_ID와 공유 권한을 확인하세요.');
  }
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throwApiError_('UNKNOWN', '스프레드시트에 "' + name + '" 탭이 없습니다. 탭 이름을 확인하세요.');
  }
  return sheet;
}

/**
 * Calendar 고급 서비스 예외가 "대상 이벤트 없음"인지 판별.
 * 404(Not Found) 외에 410(Gone — 이미 삭제된 이벤트)도 NOT_FOUND로 취급한다.
 */
function isNotFoundError_(err) {
  var msg = err && err.message ? String(err.message) : '';
  var detailsCode =
    typeof err.details === 'object' && err.details ? err.details.code : null;
  return (
    detailsCode === 404 ||
    detailsCode === 410 ||
    msg.indexOf('Not Found') !== -1 ||
    msg.indexOf('404') !== -1 ||
    msg.indexOf('410') !== -1 ||
    msg.indexOf('deleted') !== -1
  );
}

/** 규약 에러 코드를 실은 예외를 던진다 (doPost에서 잡아 JSON으로 변환) */
function throwApiError_(code, message) {
  var err = new Error(message);
  err.apiErrorCode = code;
  throw err;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function errorOutput_(code, message) {
  return jsonOutput_({ ok: false, error: { code: code, message: message } });
}
