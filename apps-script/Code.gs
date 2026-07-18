/**
 * ACal 관리자 쓰기 백엔드. Apps Script 편집기(script.google.com)에 이 파일 내용을 그대로
 * 복사/붙여넣기 해서 배포한다 (clasp 등 빌드 도구 없음). 배포 시:
 *   - 실행: 나(스크립트 소유자)
 *   - 액세스: 모든 사용자(익명 포함)
 * 이 두 설정이어야만 GitHub Pages 등 외부 origin에서의 fetch가 도달할 수 있고, 바로 그 이유로
 * Session.getActiveUser()를 쓰지 않고 매 요청마다 ID 토큰을 직접 검증한다. 통신 규약 전체는
 * 저장소 루트의 CONTRACT.md가 단일 기준이다 — 이 파일과 CONTRACT.md가 어긋나면 안 된다.
 *
 * 왼쪽 사이드바 "서비스"에 Google Calendar API(고급 서비스, 식별자 기본값 Calendar)를
 * 반드시 추가해야 한다 — 안 하면 Calendar.Events.* 호출이 전부 실패한다.
 */

// ---- 설정 상수 (여기만 채우면 됨) ----
const SPREADSHEET_ID = '1D971m_cq-H6oLCHtcyEmg7KNMnvyux0MRiRysp7mOJY';
const CALENDAR_ID = '8144725e8bc61e4646fbba93e828be0c30d7212cc8c3c8cc0b781bd948010a4b@group.calendar.google.com';
const OAUTH_CLIENT_ID = '122837880255-bjj9fnut159a7ru83t9niicq9t5nstn9.apps.googleusercontent.com';
const WEEKLY_BAND_CAP = 2; // "팀당 주 최대 2회" 규칙값. 여기만 고치면 프론트 재배포 불필요.
const TIME_ZONE = 'Asia/Seoul';

const SHEET_BAND_TEAMS = '밴드팀 목록';
const SHEET_LESSON_PARTS = '파트 목록';
const SHEET_ADMIN_EMAILS = '관리자 이메일';

// ---- 진입점 ----

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: { code: 'VALIDATION', message: '요청 본문을 해석하지 못했습니다.' } });
  }

  try {
    verifyAdmin_(body.idToken);
    const data = dispatchAction_(body.action, body.payload || {});
    return jsonResponse({ ok: true, data });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonResponse({ ok: false, error: { code: err.code, message: err.message } });
    }
    return jsonResponse({ ok: false, error: { code: 'UNKNOWN', message: '알 수 없는 오류: ' + err.message } });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function dispatchAction_(action, payload) {
  switch (action) {
    case 'listBandTeams':
      return { teams: readRoster_(SHEET_BAND_TEAMS, 'teamId').filter((r) => r.active).map(toIdNamePair_('teamId')) };
    case 'listLessonParts':
      return { parts: readRoster_(SHEET_LESSON_PARTS, 'partId').filter((r) => r.active).map(toIdNamePair_('partId')) };
    case 'getWeeklyBandCount':
      return getWeeklyBandCount_(payload);
    case 'createEvent':
      return createEvent_(payload);
    case 'updateEvent':
      return updateEvent_(payload);
    case 'deleteEvent':
      return deleteEvent_(payload);
    default:
      throw new ApiError('VALIDATION', '알 수 없는 action입니다: ' + action);
  }
}

function toIdNamePair_(idField) {
  return (row) => {
    const pair = { name: row.name };
    pair[idField] = String(row.id);
    return pair;
  };
}

// ---- 인증 ----

function verifyAdmin_(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new ApiError('INVALID_TOKEN', '로그인이 필요합니다.');
  }

  let response;
  try {
    response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
      muteHttpExceptions: true,
    });
  } catch (err) {
    throw new ApiError('INVALID_TOKEN', '토큰 검증에 실패했습니다.');
  }

  if (response.getResponseCode() !== 200) {
    throw new ApiError('INVALID_TOKEN', '토큰이 유효하지 않거나 만료되었습니다.');
  }

  let info;
  try {
    info = JSON.parse(response.getContentText());
  } catch (err) {
    throw new ApiError('INVALID_TOKEN', '토큰 검증 응답을 해석하지 못했습니다.');
  }

  if (info.aud !== OAUTH_CLIENT_ID) {
    throw new ApiError('INVALID_TOKEN', '토큰 대상이 이 앱과 일치하지 않습니다.');
  }
  if (info.email_verified !== 'true') {
    throw new ApiError('INVALID_TOKEN', '이메일이 확인되지 않은 계정입니다.');
  }
  if (!info.exp || Number(info.exp) * 1000 <= Date.now()) {
    throw new ApiError('INVALID_TOKEN', '토큰이 만료되었습니다.');
  }

  const email = String(info.email).trim().toLowerCase();
  const adminEmails = readAdminEmails_();
  if (adminEmails.indexOf(email) === -1) {
    throw new ApiError('NOT_ADMIN', '관리자 권한이 없는 계정입니다.');
  }

  return { email };
}

function readAdminEmails_() {
  const sheet = getSheet_(SHEET_ADMIN_EMAILS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  return sheet
    .getRange(1, 1, lastRow, 1)
    .getValues()
    .map((row) => String(row[0]).trim().toLowerCase())
    .filter((email) => email.length > 0);
}

// ---- 시트 읽기 ----

function getSheet_(tabName) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    throw new ApiError('UNKNOWN', '시트 탭을 찾을 수 없습니다: ' + tabName + ' (이름이 바뀌었는지 확인해 주세요)');
  }
  return sheet;
}

/** 헤더 1행, 데이터는 2행부터. A열 ID(정수) | B열 이름 | C열 활성(체크박스). */
function readRoster_(tabName) {
  const sheet = getSheet_(tabName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const rows = [];
  for (const [idRaw, nameRaw, activeRaw] of values) {
    const id = parseInt(idRaw, 10);
    const name = String(nameRaw || '').trim();
    if (!Number.isInteger(id) || name.length === 0) continue; // 빈 줄/메모 행은 조용히 건너뜀
    const active = activeRaw === true || String(activeRaw).toUpperCase() === 'TRUE';
    rows.push({ id, name, active });
  }
  return rows;
}

function rosterIdExists_(tabName, id) {
  return readRoster_(tabName).some((row) => String(row.id) === String(id));
}

// ---- 주간 카운트 ----

function mondayOf_(dateISO) {
  const parts = dateISO.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
  const isoWeekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (isoWeekday - 1));
  return d;
}

function toISODate_(date) {
  return Utilities.formatDate(date, TIME_ZONE, 'yyyy-MM-dd');
}

function getWeeklyBandCount_(payload) {
  const teamId = requireField_(payload, 'teamId');
  const dateISO = requireField_(payload, 'dateISO');

  const weekStart = mondayOf_(dateISO);
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);
  const weekEnd = new Date(weekEndExclusive);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 1);

  // CalendarApp.getEvents()로는 extendedProperties.private를 읽을 수 없으므로,
  // 고급 서비스(Calendar.Events.list)를 사용한다.
  const advancedEvents = Calendar.Events.list(CALENDAR_ID, {
    timeMin: weekStart.toISOString(),
    timeMax: weekEndExclusive.toISOString(),
    singleEvents: true,
  });
  const count = (advancedEvents.items || []).filter((event) => {
    const props = (event.extendedProperties && event.extendedProperties.private) || {};
    return props.eventType === 'band' && String(props.teamId) === String(teamId);
  }).length;

  return {
    count,
    cap: WEEKLY_BAND_CAP,
    weekStartISO: toISODate_(weekStart),
    weekEndISO: toISODate_(weekEnd),
  };
}

// ---- CRUD ----

function requireField_(payload, field) {
  const value = payload[field];
  if (value === undefined || value === null || value === '') {
    throw new ApiError('VALIDATION', '필수 항목이 비어 있습니다: ' + field);
  }
  return value;
}

function validateEventPayload_(payload) {
  const eventType = payload.eventType;
  if (['band', 'lesson', 'common'].indexOf(eventType) === -1) {
    throw new ApiError('VALIDATION', 'eventType은 band/lesson/common 중 하나여야 합니다.');
  }

  const hasTeamId = payload.teamId !== undefined && payload.teamId !== null && payload.teamId !== '';
  const hasPartId = payload.partId !== undefined && payload.partId !== null && payload.partId !== '';

  if (eventType === 'band') {
    if (!hasTeamId) throw new ApiError('VALIDATION', '합주 일정에는 teamId가 필요합니다.');
    if (hasPartId) throw new ApiError('VALIDATION', '합주 일정에는 partId를 보내면 안 됩니다.');
    if (!rosterIdExists_(SHEET_BAND_TEAMS, payload.teamId)) {
      throw new ApiError('VALIDATION', '존재하지 않는 밴드팀 ID입니다: ' + payload.teamId);
    }
  } else if (eventType === 'lesson') {
    if (!hasPartId) throw new ApiError('VALIDATION', '레슨 일정에는 partId가 필요합니다.');
    if (hasTeamId) throw new ApiError('VALIDATION', '레슨 일정에는 teamId를 보내면 안 됩니다.');
    if (!rosterIdExists_(SHEET_LESSON_PARTS, payload.partId)) {
      throw new ApiError('VALIDATION', '존재하지 않는 파트 ID입니다: ' + payload.partId);
    }
  } else {
    if (hasTeamId || hasPartId) {
      throw new ApiError('VALIDATION', '공통 일정에는 teamId/partId를 보내면 안 됩니다.');
    }
  }

  requireField_(payload, 'title');
  requireField_(payload, 'dateISO');
  if (!payload.allDay) {
    requireField_(payload, 'startTime');
    requireField_(payload, 'endTime');
  }
}

function buildExtendedProperties_(payload) {
  const props = { eventType: payload.eventType };
  if (payload.eventType === 'band') props.teamId = String(payload.teamId);
  if (payload.eventType === 'lesson') props.partId = String(payload.partId);
  return { private: props };
}

function buildEventResource_(payload) {
  const resource = {
    summary: payload.title,
    description: payload.description || '',
    extendedProperties: buildExtendedProperties_(payload),
  };

  if (payload.allDay) {
    const nextDayMillis = new Date(payload.dateISO + 'T12:00:00Z').getTime() + 24 * 60 * 60 * 1000;
    const nextDay = Utilities.formatDate(new Date(nextDayMillis), 'UTC', 'yyyy-MM-dd');
    resource.start = { date: payload.dateISO };
    resource.end = { date: nextDay };
  } else {
    resource.start = { dateTime: `${payload.dateISO}T${payload.startTime}:00`, timeZone: TIME_ZONE };
    resource.end = { dateTime: `${payload.dateISO}T${payload.endTime}:00`, timeZone: TIME_ZONE };
  }

  return resource;
}

function createEvent_(payload) {
  validateEventPayload_(payload);
  const resource = buildEventResource_(payload);
  try {
    const created = Calendar.Events.insert(resource, CALENDAR_ID);
    return { eventId: created.id };
  } catch (err) {
    throw new ApiError('CALENDAR_ERROR', '일정 생성에 실패했습니다: ' + err.message);
  }
}

function updateEvent_(payload) {
  const eventId = requireField_(payload, 'eventId');
  validateEventPayload_(payload);
  const resource = buildEventResource_(payload);
  try {
    const updated = Calendar.Events.update(resource, CALENDAR_ID, eventId);
    return { eventId: updated.id };
  } catch (err) {
    if (String(err.message).indexOf('Not Found') !== -1) {
      throw new ApiError('NOT_FOUND', '대상 일정을 찾을 수 없습니다.');
    }
    throw new ApiError('CALENDAR_ERROR', '일정 수정에 실패했습니다: ' + err.message);
  }
}

function deleteEvent_(payload) {
  const eventId = requireField_(payload, 'eventId');
  try {
    Calendar.Events.remove(CALENDAR_ID, eventId);
    return { eventId };
  } catch (err) {
    if (String(err.message).indexOf('Not Found') !== -1) {
      throw new ApiError('NOT_FOUND', '대상 일정을 찾을 수 없습니다.');
    }
    throw new ApiError('CALENDAR_ERROR', '일정 삭제에 실패했습니다: ' + err.message);
  }
}
