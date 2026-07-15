// 공개 페이지의 단순 상태 저장소 — 프레임워크 없음.
// 상태 객체 + setter + "이미 가져온 날짜 범위" 메모리 캐시.
// 렌더링 트리거는 app.js가 직접 담당한다 (pub/sub 없음).

const state = {
  view: 'month', // 'month' | 'week'
  anchorKey: null, // 현재 보고 있는 기준 날짜 키 ("YYYY-MM-DD")
  selectedKey: null, // 상세 패널에 표시할 선택된 날짜 키
  loading: false,
  error: null, // string | null — 사용자에게 보여줄 메시지
  eventsById: new Map(),
  eventsByDateKey: new Map(), // dateKey -> 정렬된 이벤트 배열
  cachedRanges: [], // [{ start, end }] end는 exclusive, 겹침 없이 병합·정렬 유지
};

export function getState() {
  return state;
}

export function setView(view) {
  state.view = view;
}

export function setAnchorKey(key) {
  state.anchorKey = key;
}

export function setSelectedKey(key) {
  state.selectedKey = key;
}

export function setLoading(loading) {
  state.loading = loading;
}

export function setError(message) {
  state.error = message;
}

function compareEvents(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.allDay) {
    return a.startKey < b.startKey ? -1 : a.startKey > b.startKey ? 1 : a.title.localeCompare(b.title, 'ko');
  }
  const at = a.startLabel ?? '';
  const bt = b.startLabel ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.title.localeCompare(b.title, 'ko');
}

function rebuildDateIndex() {
  state.eventsByDateKey = new Map();
  for (const event of state.eventsById.values()) {
    for (const key of event.dateKeys) {
      let list = state.eventsByDateKey.get(key);
      if (!list) {
        list = [];
        state.eventsByDateKey.set(key, list);
      }
      list.push(event);
    }
  }
  for (const list of state.eventsByDateKey.values()) list.sort(compareEvents);
}

/** 새로 받아온 이벤트를 기존 캐시에 병합 (id 기준 중복 제거/갱신) */
export function mergeEvents(events) {
  for (const event of events) state.eventsById.set(event.id, event);
  rebuildDateIndex();
}

/** 해당 날짜의 이벤트 목록 (종일 우선, 시작 시각 순) */
export function eventsForKey(dateKey) {
  return state.eventsByDateKey.get(dateKey) ?? [];
}

/** [start, end)가 이미 캐시된 범위 하나에 완전히 포함되는가 */
export function isRangeCached(start, end) {
  return state.cachedRanges.some((r) => r.start <= start && end <= r.end);
}

/** 캐시 범위에 [start, end) 추가 — 겹치거나 맞닿는 범위는 병합 */
export function addCachedRange(start, end) {
  const merged = [];
  let cur = { start, end };
  for (const r of state.cachedRanges) {
    if (r.end < cur.start || cur.end < r.start) {
      merged.push(r);
    } else {
      cur = {
        start: r.start < cur.start ? r.start : cur.start,
        end: r.end > cur.end ? r.end : cur.end,
      };
    }
  }
  merged.push(cur);
  merged.sort((a, b) => (a.start < b.start ? -1 : 1));
  state.cachedRanges = merged;
}
