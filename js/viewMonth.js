// 월간 7x6 그리드 렌더러.
// 팀 식별: 칸이 좁으므로 모노그램 배지 없이 "색 점 + 잘린 텍스트 라벨"만 사용,
// 초과분은 "외 N건" 배지 (plan의 "팀 식별 UI" 절).

import { MONTH_CELL_MAX_EVENTS } from './config.js';
import { getEventColor } from './colorUtil.js';
import {
  WEEKDAY_LABELS,
  monthGridKeys,
  keyToParts,
  formatKoreanDateLong,
} from './dateUtils.js';

function buildEventRow(event) {
  const color = getEventColor(event);
  const row = document.createElement('div');
  row.className = 'month-event';
  row.style.backgroundColor = color.translucentBg;

  const dot = document.createElement('span');
  dot.className = 'event-dot';
  dot.style.backgroundColor = color.solid;
  dot.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'month-event-label';
  if (!event.allDay && event.startLabel) {
    const time = document.createElement('span');
    time.className = 'month-event-time';
    time.textContent = event.startLabel;
    label.append(time, ` ${event.title}`);
  } else {
    label.textContent = event.title;
  }

  row.append(dot, label);
  return row;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   year: number, month: number,
 *   todayKey: string, selectedKey: string|null,
 *   getEventsForKey: (key: string) => Array,
 *   onSelectDay: (key: string) => void,
 * }} props
 */
export function renderMonthView(container, props) {
  const { year, month, todayKey, selectedKey, getEventsForKey, onSelectDay } = props;

  container.textContent = '';
  container.dataset.cols = '7';

  const grid = document.createElement('div');
  grid.className = 'month-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', `${year}년 ${month}월 월간 달력`);

  const headRow = document.createElement('div');
  headRow.className = 'grid-head-row';
  headRow.setAttribute('role', 'row');
  for (const [i, name] of WEEKDAY_LABELS.entries()) {
    const head = document.createElement('div');
    head.className = 'grid-head-cell';
    if (i === 5) head.classList.add('is-saturday');
    if (i === 6) head.classList.add('is-sunday');
    head.setAttribute('role', 'columnheader');
    head.textContent = name;
    headRow.append(head);
  }
  grid.append(headRow);

  const keys = monthGridKeys(year, month);
  for (let rowIdx = 0; rowIdx < 6; rowIdx += 1) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.setAttribute('role', 'row');

    for (let colIdx = 0; colIdx < 7; colIdx += 1) {
      const key = keys[rowIdx * 7 + colIdx];
      const parts = keyToParts(key);
      const events = getEventsForKey(key);

      const cell = document.createElement('div');
      cell.className = 'day-cell month-cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.dateKey = key;
      cell.tabIndex = -1;
      if (parts.month !== month) cell.classList.add('is-outside');
      if (colIdx === 5) cell.classList.add('is-saturday');
      if (colIdx === 6) cell.classList.add('is-sunday');
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

      const dayNum = document.createElement('span');
      dayNum.className = 'day-number';
      dayNum.textContent = String(parts.day);
      cell.append(dayNum);

      const list = document.createElement('div');
      list.className = 'month-event-list';
      for (const event of events.slice(0, MONTH_CELL_MAX_EVENTS)) {
        list.append(buildEventRow(event));
      }
      if (events.length > MONTH_CELL_MAX_EVENTS) {
        const more = document.createElement('span');
        more.className = 'more-badge';
        more.textContent = `외 ${events.length - MONTH_CELL_MAX_EVENTS}건`;
        list.append(more);
      }
      cell.append(list);

      cell.addEventListener('click', () => onSelectDay(key));
      row.append(cell);
    }
    grid.append(row);
  }

  container.append(grid);
}
