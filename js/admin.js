// 관리자 페이지 진입점. 로그인/폼/실시간 카운트/CRUD 배선을 전부 이 파일에서 직접 한다 —
// app.js와 마찬가지로 여러 계층을 조립하는 유일한 파일. 이벤트 목록 읽기는 공개 페이지와
// 동일하게 googleCalendarApi.js를 그대로 재사용한다(관리자 전용 읽기 액션은 규약에 없음).

import {
  initSignIn,
  getUser,
  signOut,
  listBandTeams,
  listLessonParts,
  getWeeklyBandCount,
  createEvent,
  updateEvent,
  deleteEvent,
  AdminApiError,
} from './adminApi.js';
import { fetchEvents, CalendarApiError } from './googleCalendarApi.js';
import { addDays, todayISO } from './dateUtils.js';
import { typeLabel } from './colorUtil.js';

const els = {
  signInButton: document.getElementById('sign-in-button'),
  signOutButton: document.getElementById('sign-out-button'),
  userLabel: document.getElementById('user-label'),
  authError: document.getElementById('auth-error'),
  adminPanel: document.getElementById('admin-panel'),

  form: document.getElementById('event-form'),
  eventTypeInputs: document.querySelectorAll('input[name="eventType"]'),
  teamField: document.getElementById('team-field'),
  teamSelect: document.getElementById('team-select'),
  partField: document.getElementById('part-field'),
  partSelect: document.getElementById('part-select'),
  weeklyCountLabel: document.getElementById('weekly-count-label'),
  titleInput: document.getElementById('title-input'),
  commonTitleField: document.getElementById('common-title-field'),
  dateInput: document.getElementById('date-input'),
  allDayInput: document.getElementById('all-day-input'),
  startTimeField: document.getElementById('start-time-field'),
  startTimeInput: document.getElementById('start-time-input'),
  endTimeField: document.getElementById('end-time-field'),
  endTimeInput: document.getElementById('end-time-input'),
  descriptionInput: document.getElementById('description-input'),
  submitButton: document.getElementById('submit-button'),
  cancelEditButton: document.getElementById('cancel-edit-button'),
  formError: document.getElementById('form-error'),
  formMode: document.getElementById('form-mode'),

  eventList: document.getElementById('event-list'),
};

let bandTeams = [];
let lessonParts = [];
let editingEventId = null;
let lastWeeklyCount = null; // { teamId, dateISO, count, cap, weekStartISO, weekEndISO } — refreshWeeklyCount()가 채움
let cachedEvents = []; // refreshEventList()가 채우는 현재 목록 범위 — 쓰기 후 재조회 대신 여기에 직접 반영
let listRange = null; // { start, end } — cachedEvents가 어떤 [start, end) 범위인지

function showAuthError(message) {
  els.authError.textContent = message || '';
  els.authError.hidden = !message;
}

function showFormError(message) {
  els.formError.textContent = message || '';
  els.formError.hidden = !message;
}

function currentEventType() {
  return Array.from(els.eventTypeInputs).find((input) => input.checked)?.value || 'band';
}

function updateFormFieldsForType() {
  const type = currentEventType();
  els.teamField.hidden = type !== 'band';
  els.partField.hidden = type !== 'lesson';
  els.commonTitleField.hidden = type !== 'common';
  els.weeklyCountLabel.hidden = type !== 'band';
  if (type === 'band') refreshWeeklyCount();
}

function updateAllDayFields() {
  const isAllDay = els.allDayInput.checked;
  els.startTimeField.hidden = isAllDay;
  els.endTimeField.hidden = isAllDay;
}

async function refreshWeeklyCount() {
  const teamId = els.teamSelect.value;
  const dateISO = els.dateInput.value;
  if (!teamId || !dateISO) {
    els.weeklyCountLabel.textContent = '';
    return;
  }
  try {
    const result = await getWeeklyBandCount(teamId, dateISO);
    lastWeeklyCount = { teamId, dateISO, ...result };
    els.weeklyCountLabel.textContent = `이번 주(${result.weekStartISO} ~ ${result.weekEndISO}) 예약 ${result.count}/${result.cap}건`;
    els.weeklyCountLabel.dataset.overCap = String(result.count >= result.cap);
  } catch (err) {
    lastWeeklyCount = null;
    els.weeklyCountLabel.textContent = '';
  }
}

function populateSelect(selectEl, items, idField) {
  selectEl.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '선택해 주세요';
  selectEl.appendChild(placeholder);
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item[idField];
    option.textContent = item.name;
    selectEl.appendChild(option);
  }
}

async function loadRosters() {
  [bandTeams, lessonParts] = await Promise.all([listBandTeams(), listLessonParts()]);
  populateSelect(els.teamSelect, bandTeams, 'teamId');
  populateSelect(els.partSelect, lessonParts, 'partId');
}

function resetForm() {
  els.form.reset();
  editingEventId = null;
  els.formMode.textContent = '새 일정 등록';
  els.cancelEditButton.hidden = true;
  els.dateInput.value = todayISO();
  updateFormFieldsForType();
  updateAllDayFields();
  showFormError(null);
}

function buildTitle(type) {
  if (type === 'band') {
    const name = els.teamSelect.selectedOptions[0]?.textContent || '';
    return `[${name}] 합주`;
  }
  if (type === 'lesson') {
    const name = els.partSelect.selectedOptions[0]?.textContent || '';
    return `[${name}] 레슨`;
  }
  return `[공통] ${els.titleInput.value.trim()}`;
}

function buildPayload() {
  const type = currentEventType();
  const payload = {
    eventType: type,
    title: buildTitle(type),
    dateISO: els.dateInput.value,
    allDay: els.allDayInput.checked,
    description: els.descriptionInput.value.trim(),
  };
  if (type === 'band') payload.teamId = els.teamSelect.value;
  if (type === 'lesson') payload.partId = els.partSelect.value;
  if (!payload.allDay) {
    payload.startTime = els.startTimeInput.value;
    payload.endTime = els.endTimeInput.value;
  }
  return payload;
}

async function confirmOverCapIfNeeded(payload) {
  if (payload.eventType !== 'band') return true;

  // 팀/날짜를 고를 때 이미 refreshWeeklyCount()로 받아둔 값이 있으면 재사용 — 폼에 표시된
  // 숫자와 같은 값이라 다시 물어볼 필요가 없고, 매 등록마다 왕복 하나를 줄여준다. 팀/날짜가
  // 바뀐 직후라 아직 값이 없거나 안 맞으면(레이스 컨디션) 그때만 새로 조회한다.
  const result =
    lastWeeklyCount && lastWeeklyCount.teamId === payload.teamId && lastWeeklyCount.dateISO === payload.dateISO
      ? lastWeeklyCount
      : await getWeeklyBandCount(payload.teamId, payload.dateISO);

  if (result.count < result.cap) return true;
  return window.confirm(
    `⚠️ 이 팀은 이번 주 이미 ${result.count}건 예약되어 있습니다. 그래도 등록하시겠습니까?`
  );
}

function setSubmitBusy(busy) {
  els.submitButton.disabled = busy;
  els.submitButton.textContent = busy ? '저장 중…' : '등록';
}

async function handleSubmit(e) {
  e.preventDefault();
  showFormError(null);

  const type = currentEventType();
  if (type === 'band' && !els.teamSelect.value) return showFormError('밴드팀을 선택해 주세요.');
  if (type === 'lesson' && !els.partSelect.value) return showFormError('파트를 선택해 주세요.');
  if (type === 'common' && !els.titleInput.value.trim()) return showFormError('일정 제목을 입력해 주세요.');

  const payload = buildPayload();

  setSubmitBusy(true);
  try {
    const proceed = await confirmOverCapIfNeeded(payload);
    if (!proceed) return;

    // 서버 응답(eventId)만 받으면 바로 목록에 반영한다 — 쓰기 직후 Calendar API를 다시 읽으면
    // 방금 쓴 내용이 아직 안 보일 수도 있고(전파 지연), 어차피 우리가 보낸 값 그대로이므로
    // 왕복 하나(목록 재조회)를 통째로 아낄 수 있다.
    if (editingEventId) {
      const { eventId } = await updateEvent({ ...payload, eventId: editingEventId });
      applyUpdatedEvent(payload, eventId);
    } else {
      const { eventId } = await createEvent(payload);
      applyCreatedEvent(payload, eventId);
    }
    resetForm();
  } catch (err) {
    if (err instanceof AdminApiError) {
      showFormError(err.message);
    } else {
      showFormError('알 수 없는 오류가 발생했습니다.');
    }
  } finally {
    setSubmitBusy(false);
  }
}

function startEdit(event) {
  editingEventId = event.id;
  els.formMode.textContent = '일정 수정';
  els.cancelEditButton.hidden = false;

  const type = event.eventType || 'common';
  const typeInput = Array.from(els.eventTypeInputs).find((input) => input.value === type);
  if (typeInput) typeInput.checked = true;
  updateFormFieldsForType();

  if (type === 'band') els.teamSelect.value = event.teamId || '';
  if (type === 'lesson') els.partSelect.value = event.partId || '';
  if (type === 'common') {
    els.titleInput.value = event.title.replace(/^\[공통\]\s*/, '');
  }

  els.dateInput.value = event.startDateISO;
  els.allDayInput.checked = event.allDay;
  updateAllDayFields();
  if (!event.allDay) {
    els.startTimeInput.value = formatHHmm(event.start);
    els.endTimeInput.value = formatHHmm(event.end);
  }
  els.descriptionInput.value = event.description || '';

  if (type === 'band') refreshWeeklyCount();
  window.scrollTo({ top: els.form.offsetTop, behavior: 'smooth' });
}

function formatHHmm(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

async function handleDelete(event, buttonEl) {
  if (!window.confirm(`"${event.title}" 일정을 삭제하시겠습니까?`)) return;
  buttonEl.disabled = true;
  try {
    await deleteEvent(event.id);
    applyDeletedEvent(event.id);
  } catch (err) {
    window.alert(err instanceof AdminApiError ? err.message : '삭제에 실패했습니다.');
    buttonEl.disabled = false;
  }
}

async function refreshEventList() {
  const start = todayISO();
  const end = addDays(start, 60);
  listRange = { start, end };
  let events;
  try {
    events = await fetchEvents(start, end);
  } catch (err) {
    cachedEvents = [];
    els.eventList.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = err instanceof CalendarApiError ? err.message : '일정 목록을 불러오지 못했습니다.';
    els.eventList.appendChild(li);
    return;
  }

  cachedEvents = events;
  renderEventList();
}

function renderEventList() {
  els.eventList.innerHTML = '';
  for (const event of cachedEvents) {
    els.eventList.appendChild(buildEventListItem(event));
  }
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (a.startDateISO !== b.startDateISO) return a.startDateISO < b.startDateISO ? -1 : 1;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.allDay ? 0 : a.start - b.start;
  });
}

function isWithinListRange(dateISO) {
  return Boolean(listRange) && dateISO >= listRange.start && dateISO < listRange.end;
}

/** payload + 서버가 돌려준 eventId로, fetchEvents()가 반환하는 것과 같은 모양의 이벤트를 만든다. */
function buildLocalEvent(payload, eventId) {
  const base = {
    id: eventId,
    title: payload.title,
    description: payload.description || '',
    allDay: payload.allDay,
    eventType: payload.eventType,
    teamId: payload.eventType === 'band' ? payload.teamId : null,
    partId: payload.eventType === 'lesson' ? payload.partId : null,
  };
  if (payload.allDay) {
    return { ...base, startDateISO: payload.dateISO, endDateISOExclusive: addDays(payload.dateISO, 1) };
  }
  return {
    ...base,
    start: new Date(`${payload.dateISO}T${payload.startTime}:00+09:00`),
    end: new Date(`${payload.dateISO}T${payload.endTime}:00+09:00`),
    startDateISO: payload.dateISO,
    endDateISOExclusive: payload.dateISO,
  };
}

function applyCreatedEvent(payload, eventId) {
  if (!isWithinListRange(payload.dateISO)) return;
  cachedEvents = sortEvents([...cachedEvents, buildLocalEvent(payload, eventId)]);
  renderEventList();
}

function applyUpdatedEvent(payload, eventId) {
  const withoutOld = cachedEvents.filter((e) => e.id !== eventId);
  cachedEvents = isWithinListRange(payload.dateISO)
    ? sortEvents([...withoutOld, buildLocalEvent(payload, eventId)])
    : withoutOld;
  renderEventList();
}

function applyDeletedEvent(eventId) {
  cachedEvents = cachedEvents.filter((e) => e.id !== eventId);
  renderEventList();
}

function buildEventListItem(event) {
  const item = document.createElement('li');
  item.className = 'admin-event-list__item';

  const label = document.createElement('span');
  label.textContent = `${event.startDateISO} · [${typeLabel(event.eventType)}] ${event.title}`;
  item.appendChild(label);

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = '수정';
  editButton.addEventListener('click', () => startEdit(event));
  item.appendChild(editButton);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = '삭제';
  deleteButton.addEventListener('click', () => handleDelete(event, deleteButton));
  item.appendChild(deleteButton);

  return item;
}

async function onAuthChange(user) {
  els.adminPanel.hidden = true; // NOT_ADMIN 등으로 검증에 실패하면 계속 숨김 상태로 둔다
  els.signOutButton.hidden = !user;
  els.userLabel.textContent = user ? `${user.name} (${user.email})` : '';

  if (!user) {
    showAuthError(null);
    return;
  }

  showAuthError(null);
  try {
    await loadRosters(); // 관리자 목록 대조는 서버가 이 호출에서 수행 — 실패하면 NOT_ADMIN
  } catch (err) {
    showAuthError(err instanceof AdminApiError ? err.message : '관리자 정보를 불러오지 못했습니다.');
    return;
  }

  els.adminPanel.hidden = false;
  resetForm();
  await refreshEventList();
}

function wireEvents() {
  for (const input of els.eventTypeInputs) {
    input.addEventListener('change', updateFormFieldsForType);
  }
  els.teamSelect.addEventListener('change', refreshWeeklyCount);
  els.dateInput.addEventListener('change', refreshWeeklyCount);
  els.allDayInput.addEventListener('change', updateAllDayFields);
  els.form.addEventListener('submit', handleSubmit);
  els.cancelEditButton.addEventListener('click', resetForm);
  els.signOutButton.addEventListener('click', signOut);
}

wireEvents();
initSignIn({ buttonEl: els.signInButton, onChange: onAuthChange });

const existingUser = getUser();
if (existingUser) onAuthChange(existingUser);
