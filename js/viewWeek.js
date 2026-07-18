// 주간 그리드 렌더링. 월간 뷰와 달리 셀 공간이 넓으므로 더 많은 이벤트를 보여주고,
// 타입 전체 단어 + 팀/파트 이름 캡션까지 표시한다. DOM만 그린다 — fetch/계산 없음.

import { weekDates, todayISO, formatTimeLabel } from './dateUtils.js';
import { colorForEvent, typeLabel } from './colorUtil.js';
import { state, eventsOnDate } from './state.js';

const MAX_CHIPS_PER_CELL = 8;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' });

export function renderWeek(container, { onSelectDate }) {
  container.innerHTML = '';
  container.setAttribute('role', 'grid');

  const dates = weekDates(state.viewDate);
  const today = todayISO();

  const grid = document.createElement('div');
  grid.className = 'week-grid';

  for (const dateISO of dates) {
    grid.appendChild(buildDayColumn(dateISO, today, onSelectDate));
  }

  container.appendChild(grid);
}

function buildDayColumn(dateISO, today, onSelectDate) {
  const column = document.createElement('div');
  column.className = 'week-grid__column';
  if (dateISO === today) column.classList.add('week-grid__column--today');
  if (dateISO === state.selectedDate) column.classList.add('week-grid__column--selected');

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'week-grid__day-header';
  header.dataset.date = dateISO;
  if (dateISO === today) header.setAttribute('aria-current', 'date');
  header.textContent = `${WEEKDAY_FORMATTER.format(new Date(dateISO + 'T12:00:00'))} ${Number(dateISO.slice(8, 10))}`;
  header.addEventListener('click', () => onSelectDate(dateISO));
  column.appendChild(header);

  const events = eventsOnDate(dateISO);
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay);

  if (allDayEvents.length > 0) {
    const allDayList = document.createElement('div');
    allDayList.className = 'week-grid__all-day';
    for (const event of allDayEvents) {
      allDayList.appendChild(buildChip(event));
    }
    column.appendChild(allDayList);
  }

  const timedList = document.createElement('div');
  timedList.className = 'week-grid__timed';
  const visible = timedEvents.slice(0, MAX_CHIPS_PER_CELL);
  for (const event of visible) {
    timedList.appendChild(buildChip(event));
  }
  if (timedEvents.length > MAX_CHIPS_PER_CELL) {
    const overflow = document.createElement('span');
    overflow.className = 'week-grid__overflow';
    overflow.textContent = `외 ${timedEvents.length - MAX_CHIPS_PER_CELL}건`;
    timedList.appendChild(overflow);
  }
  column.appendChild(timedList);

  return column;
}

function buildChip(event) {
  const color = colorForEvent(event);
  const chip = document.createElement('div');
  chip.className = 'event-chip event-chip--week';
  chip.dataset.eventType = event.eventType || 'unknown';
  chip.style.setProperty('--event-bg', color.background);
  chip.style.setProperty('--event-border', color.border);
  chip.style.setProperty('--event-fg', color.textColor);

  const line1 = document.createElement('div');
  line1.className = 'event-chip__line1';
  const badge = document.createElement('span');
  badge.className = 'event-chip__badge';
  badge.textContent = color.badge;
  line1.appendChild(badge);
  const title = document.createElement('span');
  title.className = 'event-chip__title';
  title.textContent = event.title;
  line1.appendChild(title);
  chip.appendChild(line1);

  const caption = document.createElement('div');
  caption.className = 'event-chip__caption';
  const parts = [typeLabel(event.eventType)];
  if (!event.allDay) {
    parts.push(`${formatTimeLabel(event.start)}–${formatTimeLabel(event.end)}`);
  }
  caption.textContent = parts.join(' · ');
  chip.appendChild(caption);

  return chip;
}
