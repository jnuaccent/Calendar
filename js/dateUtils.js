// 순수 날짜 헬퍼. DOM 접근 없음, fetch 없음. 주는 항상 월요일 시작.
// 브라우저 로컬 타임존에 의존하는 Date 메서드(getDate/getMonth 등)는 쓰지 않고,
// 항상 TIME_ZONE을 명시한 Intl.DateTimeFormat으로 날짜 키를 뽑는다.

import { TIME_ZONE } from './config.js';

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Date -> "YYYY-MM-DD" (TIME_ZONE 기준) */
export function toDateKey(date) {
  return DATE_KEY_FORMATTER.format(date);
}

/** "YYYY-MM-DD" -> 그 날짜 정오(로컬 자정 경계 문제를 피하기 위해 정오로 고정)를 가리키는 Date */
export function parseDateKey(dateISO) {
  const [year, month, day] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDays(dateISO, days) {
  const d = parseDateKey(dateISO);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

/** ISO 요일: 월=1 ... 일=7 */
function isoWeekday(dateISO) {
  const jsDay = parseDateKey(dateISO).getUTCDay(); // 0=일 ... 6=토
  return jsDay === 0 ? 7 : jsDay;
}

/** dateISO가 속한 주(월요일)의 dateISO */
export function startOfWeek(dateISO) {
  return addDays(dateISO, -(isoWeekday(dateISO) - 1));
}

/** dateISO가 속한 주(일요일)의 dateISO */
export function endOfWeek(dateISO) {
  return addDays(dateISO, 7 - isoWeekday(dateISO));
}

/** startOfWeek(dateISO)부터 7일치 dateISO 배열 (월~일) */
export function weekDates(dateISO) {
  const start = startOfWeek(dateISO);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * 월간 그리드(월요일 시작, 6주 x 7일 = 42칸)에 필요한 dateISO 배열.
 * anyDateInMonthISO는 그 달 아무 날짜(YYYY-MM-DD)나 주면 된다.
 */
export function monthGridDates(anyDateInMonthISO) {
  const [year, month] = anyDateInMonthISO.split('-').map(Number);
  const firstOfMonth = toDateKey(new Date(Date.UTC(year, month - 1, 1, 12)));
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function monthKey(dateISO) {
  return dateISO.slice(0, 7); // "YYYY-MM"
}

export function isSameMonth(dateISO, anyDateInMonthISO) {
  return monthKey(dateISO) === monthKey(anyDateInMonthISO);
}

export function todayISO() {
  return toDateKey(new Date());
}

/**
 * Google Calendar 이벤트(all-day는 start.date, timed는 start.dateTime)에서
 * 이 이벤트가 걸쳐 있는 dateISO 목록을 뽑는다. 여러 날 종일 일정은 시작~종료(exclusive)를
 * 하루씩 전개한다.
 */
export function datesForEvent(event) {
  if (event.allDay) {
    const dates = [];
    let cursor = event.startDateISO;
    while (cursor < event.endDateISOExclusive) {
      dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates;
  }
  return [event.startDateISO];
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'long',
});

export function formatMonthLabel(dateISO) {
  return MONTH_LABEL_FORMATTER.format(parseDateKey(dateISO));
}

const TIME_LABEL_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Date 객체(시간 포함) -> "오후 7:00" 형식 */
export function formatTimeLabel(date) {
  return TIME_LABEL_FORMATTER.format(date);
}
