// 읽기 전용 fetch 레이어 — Google Calendar API v3, API 키 기반 익명 읽기.
// 공개 페이지(app.js)와 관리자 페이지(admin.js)가 함께 사용한다.
//
// 에러는 종류별로 구분된 클래스로 throw 하므로 호출측이 상황에 맞는
// 한국어 안내 문구를 고를 수 있다.

import { CALENDAR_ID, API_KEY, TIME_ZONE } from './config.js';
import {
  addDays,
  getDateKeyInTimeZone,
  isoStartOfDay,
  timeLabelInTimeZone,
  diffDays,
} from './dateUtils.js';

export class CalendarApiError extends Error {}

/** fetch 자체가 실패 (오프라인, DNS, CORS 등) */
export class CalendarNetworkError extends CalendarApiError {
  constructor(cause) {
    super('네트워크 요청에 실패했습니다.');
    this.name = 'CalendarNetworkError';
    this.cause = cause;
  }
}

/** HTTP 비정상 상태 코드 (403 키 제한, 404 캘린더 없음 등) */
export class CalendarHttpError extends CalendarApiError {
  constructor(status, statusText) {
    super(`Calendar API 오류 (HTTP ${status})`);
    this.name = 'CalendarHttpError';
    this.status = status;
    this.statusText = statusText;
  }
}

/** 응답 본문이 기대한 형태가 아님 */
export class CalendarDataError extends CalendarApiError {
  constructor(message) {
    super(message || 'Calendar API 응답 형식이 올바르지 않습니다.');
    this.name = 'CalendarDataError';
  }
}

const EVENTS_ENDPOINT = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
  CALENDAR_ID,
)}/events`;

const TEAM_BRACKET_RE = /^\s*\[([^\]]+)\]\s*/;

/**
 * 원본 이벤트 → 앱 내부 표현으로 정규화.
 * {
 *   id, title, description, allDay,
 *   start, end,          // 종일: "YYYY-MM-DD"(end는 exclusive) / 시간: ISO dateTime
 *   startKey, endKey,    // 이벤트가 걸치는 첫/마지막 날짜 키 (둘 다 inclusive)
 *   dateKeys,            // 걸치는 모든 날짜 키 (여러 날 종일 일정 전개 포함)
 *   startLabel, endLabel,// 시간 일정의 "HH:mm" (종일이면 null)
 *   teamId,              // extendedProperties의 teamId 또는 null(동아리 행사)
 *   teamName,            // 제목의 "[팀명]" 프리픽스에서 추출한 표시용 팀명 또는 null
 * }
 */
function normalizeEvent(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.start || !raw.end) return null;

  const title = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : '(제목 없음)';
  const description = typeof raw.description === 'string' ? raw.description : '';
  // 비인증(API 키) 읽기에서는 private 프로퍼티가 안 내려올 수 있으므로 shared도 함께 확인.
  const teamId =
    raw.extendedProperties?.private?.teamId ??
    raw.extendedProperties?.shared?.teamId ??
    null;
  const bracket = TEAM_BRACKET_RE.exec(title);
  const teamName = bracket ? bracket[1].trim() : null;

  const allDay = Boolean(raw.start.date);

  let startKey;
  let endKey;
  let startLabel = null;
  let endLabel = null;

  if (allDay) {
    if (!raw.end.date) return null;
    startKey = raw.start.date;
    // Calendar API의 종일 end.date는 exclusive → 마지막 표시일은 하루 전.
    endKey = addDays(raw.end.date, -1);
  } else {
    if (!raw.start.dateTime || !raw.end.dateTime) return null;
    const startDate = new Date(raw.start.dateTime);
    const endDate = new Date(raw.end.dateTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    startKey = getDateKeyInTimeZone(startDate, TIME_ZONE);
    endKey = getDateKeyInTimeZone(endDate, TIME_ZONE);
    startLabel = timeLabelInTimeZone(startDate, TIME_ZONE);
    endLabel = timeLabelInTimeZone(endDate, TIME_ZONE);
    // 자정 정각에 끝나는 일정은 다음 날 칸에는 표시하지 않는다.
    if (endKey !== startKey && endLabel === '00:00') endKey = addDays(endKey, -1);
  }

  if (diffDays(startKey, endKey) < 0) endKey = startKey;

  const dateKeys = [];
  const span = diffDays(startKey, endKey);
  for (let i = 0; i <= span; i += 1) dateKeys.push(addDays(startKey, i));

  return {
    id: raw.id,
    title,
    description,
    allDay,
    start: allDay ? raw.start.date : raw.start.dateTime,
    end: allDay ? raw.end.date : raw.end.dateTime,
    startKey,
    endKey,
    dateKeys,
    startLabel,
    endLabel,
    teamId,
    teamName,
  };
}

/**
 * [startKey, endKeyExclusive) 날짜 키 범위의 이벤트를 조회해 정규화된 배열로 반환.
 * 동아리 캘린더에는 반복 일정이 없다는 전제이므로 recurrence 전개 로직은 두지 않는다 —
 * singleEvents=true는 orderBy=startTime을 쓰기 위한 API 요구 조건으로만 지정한다.
 */
export async function fetchEvents(startKey, endKeyExclusive) {
  const params = new URLSearchParams({
    key: API_KEY,
    timeMin: isoStartOfDay(startKey, TIME_ZONE),
    timeMax: isoStartOfDay(endKeyExclusive, TIME_ZONE),
    timeZone: TIME_ZONE,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });

  let response;
  try {
    response = await fetch(`${EVENTS_ENDPOINT}?${params.toString()}`);
  } catch (cause) {
    throw new CalendarNetworkError(cause);
  }

  if (!response.ok) {
    throw new CalendarHttpError(response.status, response.statusText);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new CalendarDataError('Calendar API 응답을 JSON으로 해석할 수 없습니다.');
  }

  if (!body || !Array.isArray(body.items)) {
    throw new CalendarDataError('Calendar API 응답에 items 배열이 없습니다.');
  }

  const events = [];
  for (const raw of body.items) {
    if (raw && raw.status === 'cancelled') continue;
    const normalized = normalizeEvent(raw);
    if (normalized) events.push(normalized);
  }
  return events;
}

/** 에러 객체 → 사용자에게 보여줄 한국어 문구 */
export function describeCalendarError(error) {
  if (error instanceof CalendarNetworkError) {
    return '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
  }
  if (error instanceof CalendarHttpError) {
    if (error.status === 403 || error.status === 400) {
      return `일정 조회가 거부되었습니다 (HTTP ${error.status}). API 키 제한 설정을 확인해 주세요.`;
    }
    if (error.status === 404) {
      return '캘린더를 찾을 수 없습니다. 캘린더 ID와 공개 설정을 확인해 주세요.';
    }
    return `일정을 불러오지 못했습니다 (HTTP ${error.status}).`;
  }
  if (error instanceof CalendarDataError) {
    return '서버 응답을 해석할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }
  return '알 수 없는 오류로 일정을 불러오지 못했습니다.';
}
