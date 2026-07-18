// 공개 페이지(app.js)가 쓰는 평범한 상태 객체 + setter + 세션 내 fetch 캐시.
// 렌더링 방식과 완전히 무관 — 나중에 화면 계층이 통째로 바뀌어도 이 파일은 안 바뀐다.

import { todayISO } from './dateUtils.js';

export const state = {
  view: 'month', // 'month' | 'week'
  viewDate: todayISO(), // 현재 보고 있는 월/주를 대표하는 아무 날짜
  selectedDate: null,
  loading: false,
  error: null,
  eventsById: new Map(),
  eventsByDateKey: new Map(), // dateISO -> sorted event[]
  cachedRanges: [], // { start, end } exclusive-end, 병합/정렬된 상태로 유지
};

export function setView(view) {
  state.view = view;
}

export function setViewDate(dateISO) {
  state.viewDate = dateISO;
}

export function setSelectedDate(dateISO) {
  state.selectedDate = dateISO;
}

export function setLoading(loading) {
  state.loading = loading;
}

export function setError(error) {
  state.error = error;
}

/** [start, end) 범위가 이미 캐시된 범위들로 완전히 덮이는지 확인. */
export function isRangeCached(start, end) {
  return state.cachedRanges.some((r) => r.start <= start && end <= r.end);
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = last.end > r.end ? last.end : r.end;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/** 새로 가져온 events를 캐시에 병합하고, [start, end) 범위를 캐시된 범위로 기록한다. */
export function mergeEvents(events, start, end) {
  for (const event of events) {
    state.eventsById.set(event.id, event);
  }
  rebuildDateIndex();
  state.cachedRanges = mergeRanges([...state.cachedRanges, { start, end }]);
}

function rebuildDateIndex() {
  state.eventsByDateKey.clear();
  for (const event of state.eventsById.values()) {
    for (const dateISO of datesForNormalizedEvent(event)) {
      const list = state.eventsByDateKey.get(dateISO) || [];
      list.push(event);
      state.eventsByDateKey.set(dateISO, list);
    }
  }
  for (const list of state.eventsByDateKey.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      if (a.allDay) return 0;
      return a.start - b.start;
    });
  }
}

function datesForNormalizedEvent(event) {
  if (!event.allDay) return [event.startDateISO];
  const dates = [];
  let cursor = event.startDateISO;
  while (cursor < event.endDateISOExclusive) {
    dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

function addDaysISO(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

export function eventsOnDate(dateISO) {
  return state.eventsByDateKey.get(dateISO) || [];
}
