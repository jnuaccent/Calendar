// Apps Script Web App 호출 레이어 (관리자 페이지 전용).
// 규약은 저장소의 CONTRACT.md가 단일 기준 — 요청/응답 JSON, 에러 코드, 이 파일의
// export 시그니처를 바꿀 때는 반드시 CONTRACT.md와 apps-script/Code.gs를 함께 맞춘다.
//
// 인증 흐름:
//   1. initSignIn()이 GIS(https://accounts.google.com/gsi/client)를 동적 로드하고
//      buttonEl에 Google 로그인 버튼을 렌더링.
//   2. 로그인하면 ID 토큰(JWT)을 모듈 메모리에만 보관 (localStorage 등 영속 저장 안 함 —
//      탭을 닫으면 세션 끝. 토큰 수명도 약 1시간이라 영속화 의미가 없음).
//   3. 모든 요청 본문에 idToken을 실어 보내고, 실제 검증은 서버(Code.gs)가 한다.
//      이 파일에서 JWT payload를 디코드하는 건 화면 표시용(email/name)일 뿐이다.
//   4. 토큰 만료(INVALID_TOKEN — 로컬 판정 포함) 시 세션을 지우고 onChange(null) 호출.

import { APPS_SCRIPT_URL, GOOGLE_OAUTH_CLIENT_ID } from './config.js';

export class AdminApiError extends Error {
  /**
   * @param {string} code CONTRACT.md의 에러 코드 표 + 'NETWORK'(전송/파싱 실패)
   * @param {string} message 사람이 읽을 한국어 설명
   */
  constructor(code, message) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
  }
}

// ── 모듈 상태 (메모리 전용) ──────────────────────────────────────────────
let idToken = null; // 원본 GIS ID 토큰(JWT 문자열)
let tokenExpMs = 0; // 토큰 만료 시각 (epoch ms)
let currentUser = null; // { email, name } | null
let onChangeCallback = null; // initSignIn에서 등록
let gsiLoadPromise = null; // GIS 스크립트 로드는 1회만

const GSI_SRC = 'https://accounts.google.com/gsi/client';

// ── 설정 확인 ────────────────────────────────────────────────────────────

function assertConfigured() {
  if (
    typeof APPS_SCRIPT_URL !== 'string' ||
    APPS_SCRIPT_URL.indexOf('PASTE_') === 0 ||
    typeof GOOGLE_OAUTH_CLIENT_ID !== 'string' ||
    GOOGLE_OAUTH_CLIENT_ID.indexOf('PASTE_') === 0
  ) {
    throw new AdminApiError(
      'UNKNOWN',
      '설정이 완료되지 않았습니다: js/config.js의 APPS_SCRIPT_URL과 ' +
        'GOOGLE_OAUTH_CLIENT_ID를 실제 값으로 채워야 관리자 기능을 쓸 수 있습니다. ' +
        '(README의 배포 절차 참고)'
    );
  }
}

// ── GIS 로그인 ───────────────────────────────────────────────────────────

/** GIS 스크립트를 1회만 동적 주입하고 window.google.accounts.id 준비를 기다린다. */
function loadGsiScript() {
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiLoadPromise = null; // 다음 initSignIn 호출에서 재시도 가능하게
      reject(
        new AdminApiError(
          'NETWORK',
          'Google 로그인 스크립트를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.'
        )
      );
    };
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

/** JWT의 payload(base64url 두 번째 조각)를 UTF-8 안전하게 디코드 */
function decodeJwtPayload(jwt) {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('malformed JWT');
  let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

/** 세션 폐기 + onChange(null) 통지 (이미 로그아웃 상태면 중복 통지 안 함) */
function clearSession(notify) {
  const wasSignedIn = idToken !== null || currentUser !== null;
  idToken = null;
  tokenExpMs = 0;
  currentUser = null;
  if (notify && wasSignedIn && typeof onChangeCallback === 'function') {
    onChangeCallback(null);
  }
}

/**
 * GIS 로그인 버튼을 buttonEl에 렌더링한다.
 * 로그인/로그아웃/토큰 만료 시 onChange(user|null) 호출. user = { email, name }.
 * @param {{ buttonEl: HTMLElement, onChange: (user: {email:string,name:string}|null) => void }} options
 * @returns {Promise<void>} GIS 로드/버튼 렌더 완료 시 resolve
 */
export async function initSignIn({ buttonEl, onChange }) {
  assertConfigured();
  if (!buttonEl) {
    throw new AdminApiError('UNKNOWN', 'initSignIn: buttonEl이 필요합니다.');
  }
  onChangeCallback = onChange;

  await loadGsiScript();

  window.google.accounts.id.initialize({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    callback: (credentialResponse) => {
      try {
        const payload = decodeJwtPayload(credentialResponse.credential);
        idToken = credentialResponse.credential;
        tokenExpMs = (Number(payload.exp) || 0) * 1000;
        currentUser = {
          email: payload.email || '',
          name: payload.name || payload.email || '',
        };
        if (typeof onChangeCallback === 'function') {
          onChangeCallback({ ...currentUser });
        }
      } catch (err) {
        clearSession(true);
      }
    },
  });

  window.google.accounts.id.renderButton(buttonEl, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
  });
}

/** 현재 로그인 사용자 { email, name } | null (표시용 — 검증은 서버가 함) */
export function getUser() {
  return currentUser ? { ...currentUser } : null;
}

/** 세션(토큰) 폐기 + onChange(null) */
export function signOut() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  clearSession(true);
}

// ── 요청 헬퍼 ────────────────────────────────────────────────────────────

/**
 * Apps Script Web App 호출. CONTRACT.md의 전송 규약을 그대로 구현:
 *  - POST, Content-Type: text/plain;charset=utf-8 (CORS preflight 회피)
 *  - redirect: 'follow' (Apps Script는 googleusercontent.com으로 302함)
 *  - 본문 { action, idToken, payload }
 * 실패 시 AdminApiError throw. INVALID_TOKEN이면 세션을 지우고 onChange(null) 후 throw.
 */
async function request(action, payload) {
  assertConfigured();

  // 보내기 전에 로컬에서 토큰 유무/만료를 먼저 확인 (만료가 뻔한 요청을 아끼고,
  // 서버 왕복 없이도 즉시 재로그인 유도)
  if (!idToken || (tokenExpMs && tokenExpMs <= Date.now())) {
    clearSession(true);
    throw new AdminApiError(
      'INVALID_TOKEN',
      '로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인해 주세요.'
    );
  }

  let json;
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ action, idToken, payload }),
    });
    json = await response.json();
  } catch (err) {
    throw new AdminApiError(
      'NETWORK',
      '서버와 통신하지 못했습니다. 네트워크 연결과 APPS_SCRIPT_URL 설정을 확인해 주세요.'
    );
  }

  if (json && json.ok === true) {
    return json.data;
  }

  const code =
    json && json.error && typeof json.error.code === 'string'
      ? json.error.code
      : 'UNKNOWN';
  const message =
    json && json.error && json.error.message
      ? json.error.message
      : '알 수 없는 서버 응답입니다.';

  if (code === 'INVALID_TOKEN') {
    clearSession(true);
  }
  throw new AdminApiError(code, message);
}

// ── 액션 함수 (모두 Promise, 실패 시 AdminApiError throw) ────────────────

/** 활성 팀 목록 → [{ teamId, name }] (teamId 숫자 오름차순, teamId는 문자열) */
export async function listTeams() {
  const data = await request('listTeams', {});
  return data.teams;
}

/**
 * 특정 팀의 해당 주(dateISO가 속한 월요일 시작 주, Asia/Seoul) 예약 수
 * → { count, weekStartISO, weekEndISO }
 */
export function getWeeklyCount(teamId, dateISO) {
  return request('getWeeklyCount', { teamId, dateISO });
}

/**
 * 일정 생성 → { eventId }
 * payload: { teamId|null, title, dateISO, allDay, startTime, endTime, description }
 */
export function createEvent(payload) {
  return request('createEvent', payload);
}

/** 일정 수정 (createEvent payload + eventId 필수, 보낸 필드 전체로 덮어씀) → { eventId } */
export function updateEvent(payload) {
  return request('updateEvent', payload);
}

/** 일정 삭제 → { eventId } */
export function deleteEvent(eventId) {
  return request('deleteEvent', { eventId });
}
