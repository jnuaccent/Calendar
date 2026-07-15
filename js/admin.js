// 관리자 페이지 진입점: 로그인 UI, 팀 드롭다운, 실시간 주간 카운트, 경고 팝업, CRUD 배선.
//
// 쓰기(생성/수정/삭제)와 팀/카운트 조회는 adminApi.js(Apps Script Web App)를 통해,
// 날짜별 이벤트 목록 "읽기"는 공개 페이지와 동일하게 googleCalendarApi.js(API 키)로 한다
// (CONTRACT.md: 읽기 액션은 계약에 없음).

import { WEEKLY_CAP, TIME_ZONE } from './config.js';
import {
  AdminApiError,
  initSignIn,
  getUser,
  signOut,
  listTeams,
  getWeeklyCount,
  createEvent,
  updateEvent,
  deleteEvent,
} from './adminApi.js';
import {
  fetchEvents,
  describeCalendarError,
  CalendarApiError,
} from './googleCalendarApi.js';
import { getEventColor, monogramFor } from './colorUtil.js';
import { todayKey, addDays, formatKoreanDate, keyToParts } from './dateUtils.js';

const el = {
  signinSection: document.getElementById('signin-section'),
  signinButton: document.getElementById('signin-button'),
  signinNotice: document.getElementById('signin-notice'),
  adminMain: document.getElementById('admin-main'),
  userEmail: document.getElementById('user-email'),
  btnSignout: document.getElementById('btn-signout'),
  errorBanner: document.getElementById('admin-error'),
  errorMessage: document.getElementById('admin-error-message'),
  btnErrorDismiss: document.getElementById('btn-error-dismiss'),
  form: document.getElementById('event-form'),
  formHeading: document.getElementById('form-heading'),
  teamSelect: document.getElementById('team-select'),
  titleInput: document.getElementById('title-input'),
  dateInput: document.getElementById('date-input'),
  alldayCheckbox: document.getElementById('allday-checkbox'),
  timeFields: document.getElementById('time-fields'),
  startTimeInput: document.getElementById('start-time-input'),
  endTimeInput: document.getElementById('end-time-input'),
  descriptionInput: document.getElementById('description-input'),
  weeklyCount: document.getElementById('weekly-count'),
  btnSubmit: document.getElementById('btn-submit'),
  btnCancelEdit: document.getElementById('btn-cancel-edit'),
  listHeading: document.getElementById('event-list-heading'),
  listStatus: document.getElementById('event-list-status'),
  eventList: document.getElementById('event-list'),
};

let teams = []; // [{ teamId, name }]
let editingEventId = null;
let lastWeeklyCount = null; // 마지막으로 조회된 { teamId, dateISO, count }
let expectSignOut = false; // 명시적 로그아웃과 토큰 만료를 구분
let wasSignedIn = false;

// ---------------------------------------------------------------------------
// 에러/알림 표시
// ---------------------------------------------------------------------------

function showError(message) {
  el.errorMessage.textContent = message;
  el.errorBanner.hidden = false;
}

function clearError() {
  el.errorBanner.hidden = true;
  el.errorMessage.textContent = '';
}

function handleAdminError(error) {
  if (error instanceof AdminApiError) {
    if (error.code === 'INVALID_TOKEN') {
      // adminApi가 이미 세션을 지우고 onChange(null)를 호출한 상태 —
      // 로그인 화면의 안내 문구는 handleAuthChange에서 표시된다.
      return;
    }
    if (error.code === 'NOT_ADMIN') {
      showError('관리자 권한이 없는 계정입니다. 관리자 이메일 목록에 등록된 계정으로 로그인해 주세요.');
      return;
    }
    showError(error.message || `요청이 실패했습니다 (${error.code}).`);
    return;
  }
  if (error instanceof CalendarApiError) {
    showError(describeCalendarError(error));
    return;
  }
  showError('알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
}

// ---------------------------------------------------------------------------
// 로그인 상태 전환
// ---------------------------------------------------------------------------

function handleAuthChange(user) {
  clearError();
  if (user) {
    wasSignedIn = true;
    expectSignOut = false;
    el.signinNotice.textContent = '';
    el.signinSection.hidden = true;
    el.adminMain.hidden = false;
    el.userEmail.textContent = user.email;
    void bootstrapSignedIn();
  } else {
    el.adminMain.hidden = true;
    el.signinSection.hidden = false;
    if (wasSignedIn && !expectSignOut) {
      el.signinNotice.textContent = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
    } else {
      el.signinNotice.textContent = '';
    }
    wasSignedIn = false;
    expectSignOut = false;
    resetForm();
  }
}

async function bootstrapSignedIn() {
  if (!el.dateInput.value) el.dateInput.value = todayKey(TIME_ZONE);
  await loadTeams();
  await Promise.all([refreshWeeklyCount(), refreshEventList()]);
}

async function loadTeams() {
  el.teamSelect.textContent = '';
  const clubOption = document.createElement('option');
  clubOption.value = '';
  clubOption.textContent = '동아리 행사 (팀 없음)';
  el.teamSelect.append(clubOption);
  try {
    teams = await listTeams();
    for (const team of teams) {
      const opt = document.createElement('option');
      opt.value = team.teamId;
      opt.textContent = team.name;
      el.teamSelect.append(opt);
    }
  } catch (error) {
    teams = [];
    handleAdminError(error);
  }
}

// ---------------------------------------------------------------------------
// 주간 카운트
// ---------------------------------------------------------------------------

let countSeq = 0;

async function refreshWeeklyCount() {
  const teamId = el.teamSelect.value;
  const dateISO = el.dateInput.value;
  lastWeeklyCount = null;
  el.weeklyCount.classList.remove('is-over-cap');

  if (!teamId) {
    el.weeklyCount.textContent = '동아리 행사는 주간 예약 제한 대상이 아닙니다.';
    return;
  }
  if (!dateISO) {
    el.weeklyCount.textContent = '날짜를 선택하면 이번 주 예약 수를 표시합니다.';
    return;
  }

  const seq = ++countSeq;
  el.weeklyCount.textContent = '이번 주 예약 수 확인 중…';
  try {
    const result = await getWeeklyCount(teamId, dateISO);
    if (seq !== countSeq) return;
    lastWeeklyCount = { teamId, dateISO, count: result.count };
    const s = keyToParts(result.weekStartISO);
    const e = keyToParts(result.weekEndISO);
    el.weeklyCount.textContent =
      `이번 주(${s.month}/${s.day}~${e.month}/${e.day}) 예약 ${result.count}/${WEEKLY_CAP}건`;
    if (result.count >= WEEKLY_CAP) el.weeklyCount.classList.add('is-over-cap');
  } catch (error) {
    if (seq !== countSeq) return;
    el.weeklyCount.textContent = '주간 예약 수를 불러오지 못했습니다.';
    handleAdminError(error);
  }
}

// ---------------------------------------------------------------------------
// 이벤트 폼
// ---------------------------------------------------------------------------

function syncTimeFieldVisibility() {
  const allDay = el.alldayCheckbox.checked;
  el.timeFields.hidden = allDay;
  el.startTimeInput.disabled = allDay;
  el.endTimeInput.disabled = allDay;
  el.startTimeInput.required = !allDay;
  el.endTimeInput.required = !allDay;
}

function resetForm() {
  editingEventId = null;
  el.form.reset();
  el.dateInput.value = todayKey(TIME_ZONE);
  el.formHeading.textContent = '일정 등록';
  el.btnSubmit.textContent = '등록';
  el.btnCancelEdit.hidden = true;
  syncTimeFieldVisibility();
  lastWeeklyCount = null;
  el.weeklyCount.classList.remove('is-over-cap');
  el.weeklyCount.textContent = '';
}

function startEdit(event) {
  editingEventId = event.id;
  el.formHeading.textContent = '일정 수정';
  el.btnSubmit.textContent = '수정 저장';
  el.btnCancelEdit.hidden = false;

  // 팀: teamId가 활성 팀 목록에 있으면 선택, 없으면(비활성/레거시) 동아리 행사로 폴백
  const hasTeam = event.teamId && teams.some((t) => t.teamId === event.teamId);
  el.teamSelect.value = hasTeam ? event.teamId : '';
  el.titleInput.value = event.title;
  el.dateInput.value = event.startKey;
  el.alldayCheckbox.checked = event.allDay;
  syncTimeFieldVisibility();
  if (!event.allDay) {
    el.startTimeInput.value = event.startLabel ?? '';
    el.endTimeInput.value = event.endLabel ?? '';
  } else {
    el.startTimeInput.value = '';
    el.endTimeInput.value = '';
  }
  el.descriptionInput.value = event.description ?? '';

  void refreshWeeklyCount();
  el.titleInput.focus();
}

function buildTitle(rawTitle, teamId) {
  const title = rawTitle.trim();
  if (!teamId) return title;
  if (title.startsWith('[')) return title; // 이미 "[팀명]" 프리픽스가 있음
  const team = teams.find((t) => t.teamId === teamId);
  return team ? `[${team.name}] ${title}` : title;
}

function validateForm() {
  if (!el.titleInput.value.trim()) return '제목을 입력해 주세요.';
  if (!el.dateInput.value) return '날짜를 선택해 주세요.';
  if (!el.alldayCheckbox.checked) {
    if (!el.startTimeInput.value || !el.endTimeInput.value) {
      return '시작/종료 시각을 입력하거나 종일 일정으로 체크해 주세요.';
    }
    if (el.endTimeInput.value <= el.startTimeInput.value) {
      return '종료 시각은 시작 시각보다 늦어야 합니다.';
    }
  }
  return null;
}

async function onSubmit(e) {
  e.preventDefault();
  clearError();

  const problem = validateForm();
  if (problem) {
    showError(problem);
    return;
  }

  const teamId = el.teamSelect.value || null;
  const dateISO = el.dateInput.value;

  // 소프트 경고: 주 2건 이상이면 확인 팝업 (하드 블록 아님 — 확인하면 그대로 진행)
  if (
    teamId &&
    lastWeeklyCount &&
    lastWeeklyCount.teamId === teamId &&
    lastWeeklyCount.dateISO === dateISO &&
    lastWeeklyCount.count >= WEEKLY_CAP
  ) {
    const proceed = window.confirm(
      `⚠️ 이 팀은 이번 주 이미 ${lastWeeklyCount.count}건 예약되어 있습니다. 그래도 등록하시겠습니까?`,
    );
    if (!proceed) return;
  }

  const payload = {
    teamId,
    title: buildTitle(el.titleInput.value, teamId),
    dateISO,
    allDay: el.alldayCheckbox.checked,
    startTime: el.alldayCheckbox.checked ? null : el.startTimeInput.value,
    endTime: el.alldayCheckbox.checked ? null : el.endTimeInput.value,
    description: el.descriptionInput.value.trim(),
  };

  el.btnSubmit.disabled = true;
  try {
    if (editingEventId) {
      await updateEvent({ ...payload, eventId: editingEventId });
    } else {
      await createEvent(payload);
    }
    resetForm();
    el.dateInput.value = dateISO; // 같은 날짜에 연속 작업하기 편하게 유지
    await Promise.all([refreshWeeklyCount(), refreshEventList()]);
  } catch (error) {
    handleAdminError(error);
  } finally {
    el.btnSubmit.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// 선택한 날짜의 이벤트 목록 (읽기: 공개 read 경로 재사용)
// ---------------------------------------------------------------------------

let listSeq = 0;

async function refreshEventList() {
  const dateISO = el.dateInput.value;
  el.eventList.textContent = '';
  if (!dateISO) {
    el.listHeading.textContent = '해당 날짜의 일정';
    el.listStatus.textContent = '날짜를 선택하면 그 날의 일정을 표시합니다.';
    return;
  }

  el.listHeading.textContent = `${formatKoreanDate(dateISO)} 일정`;
  el.listStatus.textContent = '일정을 불러오는 중…';

  const seq = ++listSeq;
  try {
    const events = await fetchEvents(dateISO, addDays(dateISO, 1));
    if (seq !== listSeq) return;
    const dayEvents = events.filter((ev) => ev.dateKeys.includes(dateISO));
    el.listStatus.textContent = dayEvents.length === 0 ? '이 날에는 일정이 없습니다.' : '';
    for (const event of dayEvents) el.eventList.append(buildListItem(event));
  } catch (error) {
    if (seq !== listSeq) return;
    el.listStatus.textContent = '일정 목록을 불러오지 못했습니다.';
    handleAdminError(error);
  }
}

function buildListItem(event) {
  const item = document.createElement('li');
  item.className = 'admin-event-item';
  const color = getEventColor(event);
  item.style.borderLeftColor = color.solid;

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
    dot.className = 'event-dot';
    dot.style.backgroundColor = color.solid;
    dot.setAttribute('aria-hidden', 'true');
    item.append(dot);
  }

  const body = document.createElement('div');
  body.className = 'admin-event-body';
  const title = document.createElement('span');
  title.className = 'admin-event-title';
  title.textContent = event.title;
  const time = document.createElement('span');
  time.className = 'admin-event-time';
  time.textContent = event.allDay ? '종일' : `${event.startLabel} – ${event.endLabel}`;
  body.append(title, time);
  item.append(body);

  const actions = document.createElement('div');
  actions.className = 'admin-event-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-small';
  editBtn.textContent = '수정';
  editBtn.addEventListener('click', () => startEdit(event));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-small btn-danger';
  deleteBtn.textContent = '삭제';
  deleteBtn.addEventListener('click', () => onDelete(event, deleteBtn));

  actions.append(editBtn, deleteBtn);
  item.append(actions);
  return item;
}

async function onDelete(event, button) {
  const proceed = window.confirm(`'${event.title}' 일정을 삭제하시겠습니까? 되돌릴 수 없습니다.`);
  if (!proceed) return;
  clearError();
  button.disabled = true;
  try {
    await deleteEvent(event.id);
    if (editingEventId === event.id) resetForm();
    await Promise.all([refreshWeeklyCount(), refreshEventList()]);
  } catch (error) {
    button.disabled = false;
    handleAdminError(error);
  }
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

function init() {
  syncTimeFieldVisibility();

  el.btnSignout.addEventListener('click', () => {
    expectSignOut = true;
    signOut();
  });
  el.btnErrorDismiss.addEventListener('click', clearError);
  el.alldayCheckbox.addEventListener('change', syncTimeFieldVisibility);
  el.teamSelect.addEventListener('change', refreshWeeklyCount);
  el.dateInput.addEventListener('change', () => {
    void refreshWeeklyCount();
    void refreshEventList();
  });
  el.form.addEventListener('submit', onSubmit);
  el.btnCancelEdit.addEventListener('click', () => {
    const keepDate = el.dateInput.value;
    resetForm();
    if (keepDate) el.dateInput.value = keepDate;
    void refreshWeeklyCount();
  });

  // 실패(설정 미기입, GIS 스크립트 로드 실패)를 로그인 화면 안내로 노출 —
  // 그러지 않으면 unhandled rejection으로 조용히 죽어 빈 화면만 남는다.
  initSignIn({ buttonEl: el.signinButton, onChange: handleAuthChange }).catch((error) => {
    el.signinNotice.textContent =
      error instanceof AdminApiError
        ? error.message
        : '로그인 버튼을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침해 주세요.';
  });
  // 페이지 로드 시점에 이미 세션이 있으면 반영
  handleAuthChange(getUser());
}

init();
