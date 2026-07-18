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
    els.weeklyCountLabel.textContent = `이번 주(${result.weekStartISO} ~ ${result.weekEndISO}) 예약 ${result.count}/${result.cap}건`;
    els.weeklyCountLabel.dataset.overCap = String(result.count >= result.cap);
  } catch (err) {
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
  const result = await getWeeklyBandCount(payload.teamId, payload.dateISO);
  if (result.count < result.cap) return true;
  return window.confirm(
    `⚠️ 이 팀은 이번 주 이미 ${result.count}건 예약되어 있습니다. 그래도 등록하시겠습니까?`
  );
}

async function handleSubmit(e) {
  e.preventDefault();
  showFormError(null);

  const type = currentEventType();
  if (type === 'band' && !els.teamSelect.value) return showFormError('밴드팀을 선택해 주세요.');
  if (type === 'lesson' && !els.partSelect.value) return showFormError('파트를 선택해 주세요.');
  if (type === 'common' && !els.titleInput.value.trim()) return showFormError('일정 제목을 입력해 주세요.');

  const payload = buildPayload();

  try {
    const proceed = await confirmOverCapIfNeeded(payload);
    if (!proceed) return;

    if (editingEventId) {
      await updateEvent({ ...payload, eventId: editingEventId });
    } else {
      await createEvent(payload);
    }
    resetForm();
    await refreshEventList();
  } catch (err) {
    if (err instanceof AdminApiError) {
      showFormError(err.message);
    } else {
      showFormError('알 수 없는 오류가 발생했습니다.');
    }
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

async function handleDelete(event) {
  if (!window.confirm(`"${event.title}" 일정을 삭제하시겠습니까?`)) return;
  try {
    await deleteEvent(event.id);
    await refreshEventList();
  } catch (err) {
    window.alert(err instanceof AdminApiError ? err.message : '삭제에 실패했습니다.');
  }
}

async function refreshEventList() {
  const start = todayISO();
  const end = addDays(start, 60);
  let events;
  try {
    events = await fetchEvents(start, end);
  } catch (err) {
    els.eventList.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = err instanceof CalendarApiError ? err.message : '일정 목록을 불러오지 못했습니다.';
    els.eventList.appendChild(li);
    return;
  }

  els.eventList.innerHTML = '';
  for (const event of events) {
    els.eventList.appendChild(buildEventListItem(event));
  }
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
  deleteButton.addEventListener('click', () => handleDelete(event));
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
