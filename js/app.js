// 공개 조회 페이지 진입점: DOM 배선, 이벤트 리스너, fetch/render 오케스트레이션.

import { TIME_ZONE } from './config.js';
import { fetchEvents, describeCalendarError } from './googleCalendarApi.js';
import {
  getState,
  setView,
  setAnchorKey,
  setSelectedKey,
  setLoading,
  setError,
  mergeEvents,
  eventsForKey,
  isRangeCached,
  addCachedRange,
} from './state.js';
import {
  todayKey,
  keyToParts,
  partsToKey,
  addDays,
  daysInMonth,
  weekKeysFor,
  formatMonthTitle,
  formatWeekTitle,
} from './dateUtils.js';
import { renderMonthView } from './viewMonth.js';
import { renderWeekView } from './viewWeek.js';
import { renderDayDetail } from './dayDetail.js';

const el = {
  tabMonth: document.getElementById('tab-month'),
  tabWeek: document.getElementById('tab-week'),
  yearSelect: document.getElementById('year-select'),
  monthSelect: document.getElementById('month-select'),
  btnToday: document.getElementById('btn-today'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  calendarTitle: document.getElementById('calendar-title'),
  loading: document.getElementById('loading-indicator'),
  errorBanner: document.getElementById('error-banner'),
  errorMessage: document.getElementById('error-message'),
  btnRetry: document.getElementById('btn-retry'),
  grid: document.getElementById('grid-container'),
  detail: document.getElementById('day-detail'),
};

// ---------------------------------------------------------------------------
// 날짜 범위 계산
// ---------------------------------------------------------------------------

function shiftMonth(year, month, delta) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

/** 현재 뷰가 필요로 하는 fetch 범위 [start, end) — 날짜 키 기준 */
function neededRange() {
  const { view, anchorKey } = getState();
  if (view === 'month') {
    // 월간 뷰: 해당 월 ±1개월 (3개월치)
    const { year, month } = keyToParts(anchorKey);
    const prev = shiftMonth(year, month, -1);
    const next = shiftMonth(year, month, 2);
    return {
      start: partsToKey(prev.year, prev.month, 1),
      end: partsToKey(next.year, next.month, 1),
    };
  }
  // 주간 뷰: 그 주가 걸친 달(들)만
  const keys = weekKeysFor(anchorKey);
  const first = keyToParts(keys[0]);
  const last = keyToParts(keys[6]);
  const after = shiftMonth(last.year, last.month, 1);
  return {
    start: partsToKey(first.year, first.month, 1),
    end: partsToKey(after.year, after.month, 1),
  };
}

// ---------------------------------------------------------------------------
// 렌더링
// ---------------------------------------------------------------------------

function render() {
  const state = getState();
  const { view, anchorKey, selectedKey } = state;
  const anchor = keyToParts(anchorKey);
  const today = todayKey(TIME_ZONE);

  // 탭 상태
  // (두 탭 모두 Tab 키로 접근 가능하게 tabindex는 건드리지 않는다)
  el.tabMonth.setAttribute('aria-selected', view === 'month' ? 'true' : 'false');
  el.tabWeek.setAttribute('aria-selected', view === 'week' ? 'true' : 'false');

  // 연/월 드롭다운 (연도 목록은 기준 연도 ±4로 재생성)
  el.yearSelect.textContent = '';
  for (let y = anchor.year - 4; y <= anchor.year + 4; y += 1) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = `${y}년`;
    if (y === anchor.year) opt.selected = true;
    el.yearSelect.append(opt);
  }
  el.monthSelect.textContent = '';
  for (let m = 1; m <= 12; m += 1) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = `${m}월`;
    if (m === anchor.month) opt.selected = true;
    el.monthSelect.append(opt);
  }

  // 이전/다음 버튼 라벨 (뷰에 따라 의미가 다름)
  el.btnPrev.setAttribute('aria-label', view === 'month' ? '이전 달' : '이전 주');
  el.btnNext.setAttribute('aria-label', view === 'month' ? '다음 달' : '다음 주');

  // 제목 + 그리드
  if (view === 'month') {
    el.calendarTitle.textContent = formatMonthTitle(anchor.year, anchor.month);
    renderMonthView(el.grid, {
      year: anchor.year,
      month: anchor.month,
      todayKey: today,
      selectedKey,
      getEventsForKey: eventsForKey,
      onSelectDay: selectDay,
    });
  } else {
    const weekKeys = weekKeysFor(anchorKey);
    el.calendarTitle.textContent = formatWeekTitle(weekKeys);
    renderWeekView(el.grid, {
      weekKeys,
      todayKey: today,
      selectedKey,
      getEventsForKey: eventsForKey,
      onSelectDay: selectDay,
    });
  }
  applyRovingTabindex(today);

  // 상세 패널
  renderDayDetail(el.detail, {
    dateKey: selectedKey,
    events: selectedKey ? eventsForKey(selectedKey) : [],
  });

  // 로딩/에러 표시 — 에러가 나도 이미 캐시된 일정은 지우지 않고 그대로 둔다.
  el.loading.hidden = !state.loading;
  el.errorBanner.hidden = !state.error;
  if (state.error) el.errorMessage.textContent = state.error;
}

function applyRovingTabindex(today) {
  const cells = el.grid.querySelectorAll('[data-date-key]');
  if (cells.length === 0) return;
  const { selectedKey } = getState();
  let active =
    (selectedKey && el.grid.querySelector(`[data-date-key="${selectedKey}"]`)) ||
    el.grid.querySelector(`[data-date-key="${today}"]`) ||
    cells[0];
  active.tabIndex = 0;
}

function focusCell(key) {
  const cell = el.grid.querySelector(`[data-date-key="${key}"]`);
  if (!cell) return false;
  for (const c of el.grid.querySelectorAll('[data-date-key]')) c.tabIndex = -1;
  cell.tabIndex = 0;
  cell.focus();
  return true;
}

// ---------------------------------------------------------------------------
// 데이터 로딩
// ---------------------------------------------------------------------------

let fetchSeq = 0;

async function ensureData() {
  const { start, end } = neededRange();
  if (isRangeCached(start, end)) return;

  const seq = ++fetchSeq;
  setLoading(true);
  render();
  try {
    const events = await fetchEvents(start, end);
    if (seq !== fetchSeq) return; // 더 최신 요청이 진행 중이면 무시
    mergeEvents(events);
    addCachedRange(start, end);
    setError(null);
  } catch (error) {
    if (seq !== fetchSeq) return;
    // 재조회 실패: 에러 배너만 띄우고 기존 캐시 일정은 유지
    setError(describeCalendarError(error));
  } finally {
    if (seq === fetchSeq) {
      setLoading(false);
      render();
    }
  }
}

function update() {
  render();
  ensureData();
}

// ---------------------------------------------------------------------------
// 상호작용
// ---------------------------------------------------------------------------

function selectDay(key) {
  setSelectedKey(key);
  render();
}

function goToday() {
  const key = todayKey(TIME_ZONE);
  setAnchorKey(key);
  setSelectedKey(key);
  update();
}

function navigate(delta) {
  const { view, anchorKey } = getState();
  if (view === 'week') {
    setAnchorKey(addDays(anchorKey, delta * 7));
  } else {
    const { year, month, day } = keyToParts(anchorKey);
    const next = shiftMonth(year, month, delta);
    setAnchorKey(partsToKey(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month))));
  }
  update();
}

function changeMonthFromDropdowns() {
  const year = Number(el.yearSelect.value);
  const month = Number(el.monthSelect.value);
  const { day } = keyToParts(getState().anchorKey);
  setAnchorKey(partsToKey(year, month, Math.min(day, daysInMonth(year, month))));
  update();
}

function switchView(view) {
  if (getState().view === view) return;
  setView(view);
  update();
}

function onGridKeydown(event) {
  const cell = event.target.closest?.('[data-date-key]');
  if (!cell) return;
  const key = cell.dataset.dateKey;

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectDay(key);
    return;
  }

  const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const delta = deltas[event.key];
  if (delta === undefined) return;
  event.preventDefault();

  const targetKey = addDays(key, delta);
  if (focusCell(targetKey)) return;

  // 그리드 밖으로 나가면 그 날짜가 보이도록 뷰 자체를 이동
  setAnchorKey(targetKey);
  update();
  focusCell(targetKey);
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

function init() {
  const key = todayKey(TIME_ZONE);
  setAnchorKey(key);
  setSelectedKey(key);

  el.tabMonth.addEventListener('click', () => switchView('month'));
  el.tabWeek.addEventListener('click', () => switchView('week'));
  el.yearSelect.addEventListener('change', changeMonthFromDropdowns);
  el.monthSelect.addEventListener('change', changeMonthFromDropdowns);
  el.btnToday.addEventListener('click', goToday);
  el.btnPrev.addEventListener('click', () => navigate(-1));
  el.btnNext.addEventListener('click', () => navigate(1));
  el.btnRetry.addEventListener('click', () => {
    setError(null);
    update();
  });
  el.grid.addEventListener('keydown', onGridKeydown);

  update();
}

init();
