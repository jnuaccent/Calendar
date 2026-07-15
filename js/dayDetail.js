// 선택된 날짜의 하단 상세 패널 렌더러.
// 그리드 칸과 달리 공간이 넉넉하므로 팀 일정에는 모노그램 배지를 사용한다.

import { getEventColor, monogramFor } from './colorUtil.js';
import { formatKoreanDate, formatMonthDay, diffDays } from './dateUtils.js';

function buildTimeText(event) {
  if (!event.allDay) return `${event.startLabel} – ${event.endLabel}`;
  if (diffDays(event.startKey, event.endKey) > 0) {
    return `${formatMonthDay(event.startKey)} – ${formatMonthDay(event.endKey)} (종일)`;
  }
  return '종일';
}

function buildItem(event) {
  const item = document.createElement('li');
  item.className = 'detail-item';
  const color = getEventColor(event);
  item.style.borderLeftColor = color.solid;
  item.style.backgroundColor = color.translucentBg;

  if (event.teamId) {
    const badge = document.createElement('span');
    badge.className = 'monogram-badge';
    badge.style.backgroundColor = color.solid;
    badge.style.color = color.monogramText;
    badge.textContent = monogramFor(event.teamName ?? event.title);
    badge.setAttribute('aria-hidden', 'true');
    item.append(badge);
  } else {
    const dot = document.createElement('span');
    dot.className = 'event-dot detail-dot';
    dot.style.backgroundColor = color.solid;
    dot.setAttribute('aria-hidden', 'true');
    item.append(dot);
  }

  const body = document.createElement('div');
  body.className = 'detail-item-body';

  const title = document.createElement('span');
  title.className = 'detail-item-title';
  title.textContent = event.title;
  body.append(title);

  const time = document.createElement('span');
  time.className = 'detail-item-time';
  time.textContent = buildTimeText(event);
  body.append(time);

  if (event.description) {
    const desc = document.createElement('p');
    desc.className = 'detail-item-desc';
    desc.textContent = event.description;
    body.append(desc);
  }

  item.append(body);
  return item;
}

/**
 * @param {HTMLElement} container
 * @param {{ dateKey: string|null, events: Array }} props
 */
export function renderDayDetail(container, props) {
  const { dateKey, events } = props;
  container.textContent = '';

  const heading = document.createElement('h2');
  heading.className = 'detail-heading';
  heading.id = 'day-detail-heading';
  heading.textContent = dateKey ? `${formatKoreanDate(dateKey)} 일정` : '날짜를 선택하세요';
  container.append(heading);

  if (!dateKey) return;

  if (events.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = '이 날에는 일정이 없습니다.';
    container.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'detail-list';
  list.setAttribute('aria-labelledby', 'day-detail-heading');
  for (const event of events) list.append(buildItem(event));
  container.append(list);
}
