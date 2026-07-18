// 선택된 날짜의 상세 패널 렌더링. DOM만 그린다 — fetch/계산 없음.

import { colorForEvent, typeLabel } from './colorUtil.js';
import { eventsOnDate } from './state.js';
import { formatTimeLabel } from './dateUtils.js';

export function renderDayDetail(container, dateISO) {
  container.innerHTML = '';

  if (!dateISO) {
    container.classList.add('day-detail--empty');
    container.textContent = '날짜를 선택하면 상세 일정이 여기에 표시됩니다.';
    return;
  }
  container.classList.remove('day-detail--empty');

  const heading = document.createElement('h3');
  heading.className = 'day-detail__heading';
  heading.textContent = dateISO;
  container.appendChild(heading);

  const events = eventsOnDate(dateISO);
  if (events.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'day-detail__empty-message';
    empty.textContent = '이 날짜에는 일정이 없습니다.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'day-detail__list';
  for (const event of events) {
    list.appendChild(buildListItem(event));
  }
  container.appendChild(list);
}

function buildListItem(event) {
  const color = colorForEvent(event);
  const item = document.createElement('li');
  item.className = 'day-detail__item';
  item.dataset.eventType = event.eventType || 'unknown';
  item.style.setProperty('--event-bg', color.background);
  item.style.setProperty('--event-border', color.border);
  item.style.setProperty('--event-fg', color.textColor);

  const badge = document.createElement('span');
  badge.className = 'day-detail__badge';
  badge.textContent = color.badge;
  item.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'day-detail__body';

  const title = document.createElement('div');
  title.className = 'day-detail__title';
  title.textContent = event.title;
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'day-detail__meta';
  const parts = [typeLabel(event.eventType)];
  parts.push(event.allDay ? '종일' : `${formatTimeLabel(event.start)} – ${formatTimeLabel(event.end)}`);
  meta.textContent = parts.join(' · ');
  body.appendChild(meta);

  if (event.description) {
    const description = document.createElement('div');
    description.className = 'day-detail__description';
    description.textContent = event.description;
    body.appendChild(description);
  }

  item.appendChild(body);
  return item;
}
