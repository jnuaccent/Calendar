// 순수 날짜 헬퍼 — DOM 접근 없음.
//
// 이 앱의 모든 "날짜"는 "YYYY-MM-DD" 문자열 키(date key)로 다룬다.
// 날짜 키 <-> 요일/증감 계산은 Date.UTC 기반으로만 수행하고,
// "지금 이 순간이 무슨 날짜인가" 같은 타임존 의존 판단은 전부
// Intl.DateTimeFormat(TIME_ZONE)으로 계산한다.
// 브라우저 로컬 타임존에 의존하는 Date의 로컬 getter(getFullYear 등)는 쓰지 않는다.

export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function keyToParts(key) {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`잘못된 날짜 키: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function partsToKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function keyToUtcMillis(key) {
  const { year, month, day } = keyToParts(key);
  return Date.UTC(year, month - 1, day);
}

function utcMillisToKey(ms) {
  const d = new Date(ms);
  return partsToKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 날짜 키에 일수를 더한다 (음수 가능). 타임존 무관한 순수 달력 연산. */
export function addDays(key, days) {
  return utcMillisToKey(keyToUtcMillis(key) + days * 86400000);
}

/** 월요일=0 … 일요일=6 */
export function weekdayIndex(key) {
  return (new Date(keyToUtcMillis(key)).getUTCDay() + 6) % 7;
}

/** 두 키의 차이(일 수). b - a. */
export function diffDays(a, b) {
  return Math.round((keyToUtcMillis(b) - keyToUtcMillis(a)) / 86400000);
}

/** 해당 월의 일수 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// 타임존 기반 계산 (Intl)
// ---------------------------------------------------------------------------

const partsFormatterCache = new Map();

function zonedFormatter(timeZone) {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

function zonedParts(date, timeZone) {
  const out = {};
  for (const p of zonedFormatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  // 일부 엔진이 h24로 "24"를 내놓는 경우 방어
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Date(순간) → 해당 타임존 기준 날짜 키 */
export function getDateKeyInTimeZone(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return partsToKey(p.year, p.month, p.day);
}

/** 오늘(해당 타임존 기준) 날짜 키 */
export function todayKey(timeZone) {
  return getDateKeyInTimeZone(new Date(), timeZone);
}

/** Date(순간) → 해당 타임존 기준 "HH:mm" */
export function timeLabelInTimeZone(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * 해당 타임존에서 dateKey의 자정(00:00)에 해당하는 UTC 순간(ms).
 * 고정 오프셋이 아닌 타임존도 처리할 수 있도록 2회 보정 반복.
 */
export function zonedMidnightUtcMillis(dateKey, timeZone) {
  const { year, month, day } = keyToParts(dateKey);
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess -= asUtc - target;
  }
  return guess;
}

/** 해당 타임존에서 dateKey 자정의 RFC3339 문자열 (Calendar API timeMin/timeMax용) */
export function isoStartOfDay(dateKey, timeZone) {
  return new Date(zonedMidnightUtcMillis(dateKey, timeZone)).toISOString();
}

// ---------------------------------------------------------------------------
// 그리드/주간 계산 (월요일 시작)
// ---------------------------------------------------------------------------

/** 월간 7x6 그리드의 42개 날짜 키. month는 1~12. 첫 칸은 1일이 속한 주의 월요일. */
export function monthGridKeys(year, month) {
  const first = partsToKey(year, month, 1);
  const start = addDays(first, -weekdayIndex(first));
  const keys = [];
  for (let i = 0; i < 42; i += 1) keys.push(addDays(start, i));
  return keys;
}

/** dateKey가 속한 주(월~일)의 7개 날짜 키 */
export function weekKeysFor(dateKey) {
  const start = addDays(dateKey, -weekdayIndex(dateKey));
  const keys = [];
  for (let i = 0; i < 7; i += 1) keys.push(addDays(start, i));
  return keys;
}

// ---------------------------------------------------------------------------
// 표시용 포맷 (한국어)
// ---------------------------------------------------------------------------

/** "2026년 7월" */
export function formatMonthTitle(year, month) {
  return `${year}년 ${month}월`;
}

/** "7월 16일" */
export function formatMonthDay(key) {
  const { month, day } = keyToParts(key);
  return `${month}월 ${day}일`;
}

/** "2026년 7월 16일 (목)" */
export function formatKoreanDate(key) {
  const { year, month, day } = keyToParts(key);
  return `${year}년 ${month}월 ${day}일 (${WEEKDAY_LABELS[weekdayIndex(key)]})`;
}

/** "2026년 7월 16일 목요일" — aria-label용 */
export function formatKoreanDateLong(key) {
  const { year, month, day } = keyToParts(key);
  return `${year}년 ${month}월 ${day}일 ${WEEKDAY_LABELS[weekdayIndex(key)]}요일`;
}

/** 주간 뷰 제목: "7월 13일 – 7월 19일" (연도가 걸치면 연도 포함) */
export function formatWeekTitle(weekKeys) {
  const first = keyToParts(weekKeys[0]);
  const last = keyToParts(weekKeys[6]);
  const left = `${first.year}년 ${first.month}월 ${first.day}일`;
  const right =
    first.year === last.year
      ? `${last.month}월 ${last.day}일`
      : `${last.year}년 ${last.month}월 ${last.day}일`;
  return `${left} – ${right}`;
}
