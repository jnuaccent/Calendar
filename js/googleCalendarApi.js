// 읽기 전용 fetch 레이어. Google Calendar API v3를 API 키로 직접 호출한다(공개 페이지/
// 관리자 페이지 공용). DOM 접근 없음 — 정규화된 평범한 객체 배열만 돌려주거나, 구분 가능한
// 에러를 던진다.

import { CALENDAR_ID, API_KEY, TIME_ZONE } from './config.js';
import { toDateKey } from './dateUtils.js';

export class CalendarApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'NETWORK' | 'HTTP_ERROR' | 'PARSE_ERROR'
  }
}

const START_TIME_FORMATTER_CACHE = new Map();

function timeFormatter() {
  const key = TIME_ZONE;
  if (!START_TIME_FORMATTER_CACHE.has(key)) {
    START_TIME_FORMATTER_CACHE.set(
      key,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    );
  }
  return START_TIME_FORMATTER_CACHE.get(key);
}

function dateKeyFromInstant(date) {
  return timeFormatter().format(date);
}

/**
 * raw Google Calendar API 이벤트를 정규화한다.
 * 반환 형태:
 * {
 *   id, title, description,
 *   allDay, startDateISO, endDateISOExclusive, // allDay일 때
 *   start, end,                                 // !allDay일 때 (Date 객체)
 *   eventType: 'band' | 'lesson' | 'common' | null, // extendedProperties 없으면 null
 *   teamId: string | null,
 *   partId: string | null,
 * }
 */
function normalizeEvent(raw) {
  const props = (raw.extendedProperties && raw.extendedProperties.private) || {};
  const eventType = ['band', 'lesson', 'common'].includes(props.eventType) ? props.eventType : null;

  const allDay = Boolean(raw.start && raw.start.date);
  const base = {
    id: raw.id,
    title: raw.summary || '',
    description: raw.description || '',
    allDay,
    eventType,
    teamId: eventType === 'band' ? props.teamId ?? null : null,
    partId: eventType === 'lesson' ? props.partId ?? null : null,
  };

  if (allDay) {
    return {
      ...base,
      startDateISO: raw.start.date,
      endDateISOExclusive: raw.end.date,
    };
  }

  const start = new Date(raw.start.dateTime);
  const end = new Date(raw.end.dateTime);
  return {
    ...base,
    start,
    end,
    startDateISO: dateKeyFromInstant(start),
    endDateISOExclusive: dateKeyFromInstant(end),
  };
}

/**
 * [startISO, endISOExclusive) 범위의 이벤트를 가져온다. singleEvents=true 필수
 * (orderBy=startTime의 API 요구사항) — 반복 일정 전개 로직은 두지 않는다(club에 반복 일정 없음).
 */
export async function fetchEvents(startISO, endISOExclusive) {
  const timeMin = `${startISO}T00:00:00+09:00`;
  const timeMax = `${endISOExclusive}T00:00:00+09:00`;
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
  );
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('timeZone', TIME_ZONE);
  url.searchParams.set('maxResults', '2500');

  let response;
  try {
    response = await fetch(url.toString());
  } catch (err) {
    throw new CalendarApiError('NETWORK', '네트워크 연결을 확인해 주세요.');
  }

  if (!response.ok) {
    throw new CalendarApiError(
      'HTTP_ERROR',
      `일정을 불러오지 못했습니다. (HTTP ${response.status})`
    );
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new CalendarApiError('PARSE_ERROR', '일정 응답을 해석하지 못했습니다.');
  }

  return (json.items || []).map(normalizeEvent);
}

export { toDateKey };
