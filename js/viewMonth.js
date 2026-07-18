// 월간 그리드 렌더링. state에서 이미 정규화된 데이터를 읽어 DOM만 만든다 — fetch/계산 없음.
// 자체 템플릿 엔진 없이 직접 createElement/textContent/classList를 쓴다.

import { monthGridDates, isSameMonth, todayISO, formatMonthLabel } from './dateUtils.js';
import { colorForEvent } from './colorUtil.js';
import { state, eventsOnDate } from './state.js';

const MAX_CHIPS_PER_CELL = 2;
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export function monthLabel() {
  return formatMonthLabel(state.viewDate);
}

/**
 * container(월 그리드 루트 엘리먼트)를 비우고 다시 그린다.
 * onSelectDate(dateISO)는 날짜 셀 클릭/키보드 선택 시 호출된다.
 */
export function renderMonth(container, { onSelectDate }) {
  container.innerHTML = '';
  container.setAttribute('role', 'grid');
  container.setAttribute('aria-label', monthLabel());

  const header = document.createElement('div');
  header.className = 'month-grid__weekdays';
  for (const label of WEEKDAY_LABELS) {
    const cell = document.createElement('div');
    cell.className = 'month-grid__weekday';
    cell.textContent = label;
    header.appendChild(cell);
  }
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'month-grid__body';

  const today = todayISO();
  const dates = monthGridDates(state.viewDate);

  for (const dateISO of dates) {
    body.appendChild(buildDayCell(dateISO, today, onSelectDate));
  }

  container.appendChild(body);
}

function buildDayCell(dateISO, today, onSelectDate) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'month-grid__cell';
  cell.setAttribute('role', 'gridcell');
  cell.dataset.date = dateISO;

  if (!isSameMonth(dateISO, state.viewDate)) {
    cell.classList.add('month-grid__cell--outside');
  }
  if (dateISO === today) {
    cell.classList.add('month-grid__cell--today');
    cell.setAttribute('aria-current', 'date');
  }
  if (dateISO === state.selectedDate) {
    cell.classList.add('month-grid__cell--selected');
  }

  const dayNumber = document.createElement('span');
  dayNumber.className = 'month-grid__day-number';
  dayNumber.textContent = String(Number(dateISO.slice(8, 10)));
  cell.appendChild(dayNumber);

  const events = eventsOnDate(dateISO);
  const chipList = document.createElement('div');
  chipList.className = 'month-grid__chips';

  const visible = events.slice(0, MAX_CHIPS_PER_CELL);
  for (const event of visible) {
    chipList.appendChild(buildChip(event));
  }
  if (events.length > MAX_CHIPS_PER_CELL) {
    const overflow = document.createElement('span');
    overflow.className = 'month-grid__overflow';
    overflow.textContent = `외 ${events.length - MAX_CHIPS_PER_CELL}건`;
    chipList.appendChild(overflow);
  }
  cell.appendChild(chipList);

  cell.setAttribute('aria-label', `${dateISO}, 일정 ${events.length}건`);
  cell.addEventListener('click', () => onSelectDate(dateISO));

  return cell;
}

function buildChip(event) {
  const color = colorForEvent(event);
  const chip = document.createElement('span');
  chip.className = 'event-chip event-chip--month';
  chip.dataset.eventType = event.eventType || 'unknown';
  chip.style.setProperty('--event-bg', color.background);
  chip.style.setProperty('--event-border', color.border);
  chip.style.setProperty('--event-fg', color.textColor);

  const badge = document.createElement('span');
  badge.className = 'event-chip__badge';
  badge.textContent = color.badge;
  chip.appendChild(badge);

  const title = document.createElement('span');
  title.className = 'event-chip__title';
  title.textContent = event.title;
  chip.appendChild(title);

  return chip;
}
