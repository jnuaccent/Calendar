// Apps Script Web App 호출 레이어 + Google Identity Services(GIS) 로그인.
// CONTRACT.md가 이 파일과 apps-script/Code.gs 양쪽의 단일 기준 문서다 — 규약을 바꿀 때는
// 그 문서를 먼저 고치고 양쪽을 맞춘다. DOM 접근은 GIS가 로그인 버튼을 그릴 buttonEl을
// 넘겨받는 것뿐이고, 그 외에는 데이터만 주고받는다.

import { APPS_SCRIPT_URL, GOOGLE_OAUTH_CLIENT_ID } from './config.js';

export class AdminApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

let idToken = null; // 모듈 스코프에만 보관 — localStorage/sessionStorage 금지(짧은 세션이 의도된 동작)
let currentUser = null; // { email, name }
let onChangeCallback = null;
let gisInitialized = false;

function decodeJwtPayload(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
  return JSON.parse(json);
}

function isExpired(payload) {
  return !payload.exp || Date.now() >= payload.exp * 1000;
}

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
}

function handleCredential(credentialResponse) {
  const payload = decodeJwtPayload(credentialResponse.credential);
  if (isExpired(payload)) {
    clearSession();
    return;
  }
  idToken = credentialResponse.credential;
  currentUser = { email: payload.email, name: payload.name };
  if (onChangeCallback) onChangeCallback(currentUser);
}

function clearSession() {
  idToken = null;
  currentUser = null;
  if (onChangeCallback) onChangeCallback(null);
}

/**
 * GIS를 동적 로드하고 buttonEl에 로그인 버튼을 렌더링한다.
 * 로그인/로그아웃/토큰만료 시 onChange(user|null)을 호출한다.
 */
export async function initSignIn({ buttonEl, onChange }) {
  onChangeCallback = onChange;
  await loadGisScript();
  if (!gisInitialized) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      callback: handleCredential,
    });
    gisInitialized = true;
  }
  window.google.accounts.id.renderButton(buttonEl, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
  });
}

export function getUser() {
  return currentUser;
}

export function signOut() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  clearSession();
}

async function callAction(action, payload) {
  if (!idToken) {
    throw new AdminApiError('INVALID_TOKEN', '로그인이 필요합니다.');
  }

  let payloadCheck;
  try {
    payloadCheck = decodeJwtPayload(idToken);
  } catch (err) {
    clearSession();
    throw new AdminApiError('INVALID_TOKEN', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (isExpired(payloadCheck)) {
    clearSession();
    throw new AdminApiError('INVALID_TOKEN', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }

  let response;
  try {
    response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ action, idToken, payload }),
    });
  } catch (err) {
    throw new AdminApiError('NETWORK', '네트워크 연결을 확인해 주세요.');
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new AdminApiError('NETWORK', '서버 응답을 해석하지 못했습니다.');
  }

  if (!json.ok) {
    const code = (json.error && json.error.code) || 'UNKNOWN';
    const message = (json.error && json.error.message) || '알 수 없는 오류가 발생했습니다.';
    if (code === 'INVALID_TOKEN') {
      clearSession();
    }
    throw new AdminApiError(code, message);
  }

  return json.data;
}

export function listBandTeams() {
  return callAction('listBandTeams', {}).then((data) => data.teams);
}

export function listLessonParts() {
  return callAction('listLessonParts', {}).then((data) => data.parts);
}

export function getWeeklyBandCount(teamId, dateISO) {
  return callAction('getWeeklyBandCount', { teamId, dateISO });
}

export function createEvent(payload) {
  return callAction('createEvent', payload);
}

export function updateEvent(payload) {
  return callAction('updateEvent', payload);
}

export function deleteEvent(eventId) {
  return callAction('deleteEvent', { eventId });
}
