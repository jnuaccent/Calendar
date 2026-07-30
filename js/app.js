// 공개 페이지 진입점. 데이터 계층(googleCalendarApi, dateUtils)과 상태(state), 화면 계층
// (viewMonth/viewWeek/dayDetail)을 조립하는 유일한 파일 — 다른 파일은 서로를 몰라도 된다.

import { fetchEvents, CalendarApiError } from './googleCalendarApi.js';
import {
  monthGridDates,
  weekDates,
  addDays,
  monthKey,
  todayISO,
  formatMonthLabel,
} from './dateUtils.js';
import {
  state,
  setView,
  setViewDate,
  setSelectedDate,
  setLoading,
  setError,
  isRangeCached,
  mergeEvents,
} from './state.js';
import { renderMonth } from './viewMonth.js';
import { renderWeek } from './viewWeek.js';
import { renderDayDetail } from './dayDetail.js';

const els = {
  monthGrid: document.getElementById('month-grid'),
  weekGrid: document.getElementById('week-grid'),
  dayDetail: document.getElementById('day-detail'),
  viewLabel: document.getElementById('view-label'),
  statusRegion: document.getElementById('status-region'),
  errorRegion: document.getElementById('error-region'),
  retryButton: document.getElementById('retry-button'),
  monthTabButton: document.getElementById('tab-month'),
  weekTabButton: document.getElementById('tab-week'),
  todayButton: document.getElementById('today-button'),
  prevButton: document.getElementById('prev-button'),
  nextButton: document.getElementById('next-button'),
};

function currentRange() {
  if (state.view === 'month') {
    const dates = monthGridDates(state.viewDate);
    return { start: dates[0], end: addDays(dates[dates.length - 1], 1) };
  }
  const dates = weekDates(state.viewDate);
  return { start: dates[0], end: addDays(dates[dates.length - 1], 1) };
}

async function ensureRangeLoaded() {
  const { start, end } = currentRange();
  if (isRangeCached(start, end)) {
    render();
    return;
  }

  setLoading(true);
  setError(null);
  render();

  try {
    const events = await fetchEvents(start, end);
    mergeEvents(events, start, end);
    setLoading(false);
    render();
  } catch (err) {
    setLoading(false);
    setError(err instanceof CalendarApiError ? err.message : '알 수 없는 오류가 발생했습니다.');
    render();
  }
}

function render() {
  els.statusRegion.textContent = state.loading ? '일정을 불러오는 중입니다…' : '';
  els.statusRegion.hidden = !state.loading;

  els.errorRegion.hidden = !state.error;
  if (state.error) {
    els.errorRegion.querySelector('.error-region__message').textContent = state.error;
  }

  els.viewLabel.textContent = formatMonthLabel(state.viewDate);

  els.monthTabButton.setAttribute('aria-selected', String(state.view === 'month'));
  els.weekTabButton.setAttribute('aria-selected', String(state.view === 'week'));
  els.monthGrid.hidden = state.view !== 'month';
  els.weekGrid.hidden = state.view !== 'week';

  if (state.view === 'month') {
    renderMonth(els.monthGrid, { onSelectDate: selectDate });
  } else {
    renderWeek(els.weekGrid, { onSelectDate: selectDate });
  }

  renderDayDetail(els.dayDetail, state.selectedDate);
}

function selectDate(dateISO) {
  setSelectedDate(dateISO);
  render();
}

function switchView(view) {
  if (state.view === view) return;
  setView(view);
  ensureRangeLoaded().then(scrollTodayIntoView);
}

function navigate(deltaUnits) {
  if (state.view === 'month') {
    const [year, month] = monthKey(state.viewDate).split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + deltaUnits, 1, 12));
    setViewDate(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`);
  } else {
    setViewDate(addDays(state.viewDate, deltaUnits * 7));
  }
  ensureRangeLoaded();
}

function goToday() {
  setViewDate(todayISO());
  setSelectedDate(todayISO());
  ensureRangeLoaded().then(scrollTodayIntoView);
}

// 주간 뷰는 모바일 폭에서 7일이 세로로 쌓이므로, '오늘'로 이동해도 실제로 스크롤해주지
// 않으면 화면이 그대로인 것처럼 보인다. prev/next 탐색 시에는 부르지 않는다 — 사용자가
// 보고 있던 위치를 임의로 오늘로 되돌리면 오히려 방해가 된다.
function scrollTodayIntoView() {
  if (state.view !== 'week') return;
  els.weekGrid.querySelector('.week-grid__column--today')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireEvents() {
  els.monthTabButton.addEventListener('click', () => switchView('month'));
  els.weekTabButton.addEventListener('click', () => switchView('week'));
  els.todayButton.addEventListener('click', goToday);
  els.prevButton.addEventListener('click', () => navigate(-1));
  els.nextButton.addEventListener('click', () => navigate(1));
  els.retryButton.addEventListener('click', ensureRangeLoaded);
}

wireEvents();
ensureRangeLoaded();
