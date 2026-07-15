// 주간 뷰 렌더러 — 월간 뷰의 "2건 + 뱃지" 재사용이 아니라 자체 레이아웃.
// 각 요일 칸: 종일 일정 칩을 상단에, 시간 일정을 그 아래 목록으로 분리.
// 칩 = 모노그램 배지(팀 일정) 또는 색 점(동아리 행사) + 전체 라벨 + 시각.
// 모바일에서는 CSS가 7열 그리드를 세로 아젠다 리스트로 전환한다 (DOM은 동일).

import { WEEK_CELL_MAX_EVENTS } from './config.js';
import { getEventColor, monogramFor } from './colorUtil.js';
import { WEEKDAY_LABELS, keyToParts, formatKoreanDateLong } from './dateUtils.js';

function buildChip(event) {
  const color = getEventColor(event);
  const chip = document.createElement('div');
  chip.className = event.allDay ? 'week-chip is-allday' : 'week-chip';
  chip.style.backgroundColor = color.translucentBg;
  chip.style.borderColor = color.border;

  if (event.teamId) {
    // 팀 일정: 팀명 첫 글자 모노그램 배지 (배경 대비로 흑/백 글자 자동 선택)
    const badge = document.createElement('span');
    badge.className = 'monogram-badge';
    badge.style.backgroundColor = color.solid;
    badge.style.color = color.monogramText;
    badge.textContent = monogramFor(event.teamName ?? event.title);
    badge.setAttribute('aria-hidden', 'true');
    chip.append(badge);
  } else {
    // 동아리 행사(팀 없음): 요약할 팀명이 없으므로 모노그램 대신 색 점만
    const dot = document.createElement('span');
    dot.className = 'event-dot';
    dot.style.backgroundColor = color.solid;
    dot.setAttribute('aria-hidden', 'true');
    chip.append(dot);
  }

  const body = document.createElement('span');
  body.className = 'week-chip-body';

  const label = document.createElement('span');
  label.className = 'week-chip-label';
  label.textContent = event.title;
  body.append(label);

  const time = document.createElement('span');
  time.className = 'week-chip-time';
  time.textContent = event.allDay ? '종일' : `${event.startLabel} – ${event.endLabel}`;
  body.append(time);

  chip.append(body);
  return chip;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   weekKeys: string[],
 *   todayKey: string, selectedKey: string|null,
 *   getEventsForKey: (key: string) => Array,
 *   onSelectDay: (key: string) => void,
 * }} props
 */
export function renderWeekView(container, props) {
  const { weekKeys, todayKey, selectedKey, getEventsForKey, onSelectDay } = props;

  container.textContent = '';
  container.dataset.cols = '7';

  const grid = document.createElement('div');
  grid.className = 'week-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', '주간 달력');

  const row = document.createElement('div');
  row.className = 'week-row';
  row.setAttribute('role', 'row');

  for (const [i, key] of weekKeys.entries()) {
    const parts = keyToParts(key);
    const events = getEventsForKey(key);

    const cell = document.createElement('div');
    cell.className = 'day-cell week-cell';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.dateKey = key;
    cell.tabIndex = -1;
    if (i === 5) cell.classList.add('is-saturday');
    if (i === 6) cell.classList.add('is-sunday');
    if (key === todayKey) {
      cell.classList.add('is-today');
      cell.setAttribute('aria-current', 'date');
    }
    if (key === selectedKey) {
      cell.classList.add('is-selected');
      cell.setAttribute('aria-selected', 'true');
    } else {
      cell.setAttribute('aria-selected', 'false');
    }
    const countText = events.length > 0 ? `, 일정 ${events.length}건` : ', 일정 없음';
    cell.setAttribute('aria-label', `${formatKoreanDateLong(key)}${countText}`);

    const head = document.createElement('div');
    head.className = 'week-cell-head';
    const dayName = document.createElement('span');
    dayName.className = 'week-day-name';
    dayName.textContent = WEEKDAY_LABELS[i];
    const dayNum = document.createElement('span');
    dayNum.className = 'day-number';
    dayNum.textContent = String(parts.day);
    head.append(dayName, dayNum);
    cell.append(head);

    const visible = events.slice(0, WEEK_CELL_MAX_EVENTS);
    const allDayEvents = visible.filter((e) => e.allDay);
    const timedEvents = visible.filter((e) => !e.allDay);

    if (allDayEvents.length > 0) {
      const allDayBox = document.createElement('div');
      allDayBox.className = 'week-allday-list';
      for (const event of allDayEvents) allDayBox.append(buildChip(event));
      cell.append(allDayBox);
    }

    if (timedEvents.length > 0) {
      const timedBox = document.createElement('div');
      timedBox.className = 'week-timed-list';
      for (const event of timedEvents) timedBox.append(buildChip(event));
      cell.append(timedBox);
    }

    if (events.length > WEEK_CELL_MAX_EVENTS) {
      const more = document.createElement('span');
      more.className = 'more-badge';
      more.textContent = `외 ${events.length - WEEK_CELL_MAX_EVENTS}건`;
      cell.append(more);
    }

    if (events.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'week-empty';
      empty.textContent = '일정 없음';
      cell.append(empty);
    }

    cell.addEventListener('click', () => onSelectDay(key));
    row.append(cell);
  }

  grid.append(row);
  container.append(grid);
}
