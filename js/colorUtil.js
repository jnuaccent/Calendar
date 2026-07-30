// teamId/partId -> 색상 데이터. 순수 함수, DOM 접근 없음.
// 실제 화면에 적용하는 방식(칩 모양, 여백, 폰트 등)은 전부 css/styles.css의
// [data-event-type] 규칙이 담당한다 — 이 파일은 오직 "데이터"인 hue와, 그로부터 계산한
// 색 문자열/타입 배지만 돌려준다. 팀/파트 이름 자체를 식별 수단으로 쓰는 건 화면 계층에서
// 캡션 텍스트로 처리한다(색+배지는 보조 수단일 뿐).

const GOLDEN_ANGLE_DEG = 137.50776405003785;

function normalizeHue(hue) {
  return ((hue % 360) + 360) % 360;
}

/** 배경색(hsl)에 대해 흰 글자/검은 글자 중 상대 휘도 기준으로 대비가 더 큰 쪽을 고른다.
 * HSL의 lightness는 지각적 밝기가 아니라서(노란 계열이 남색 계열보다 훨씬 밝게 보임),
 * 고정된 흰 글자를 쓰면 일부 hue에서 안 보이는 문제가 생긴다 — 그래서 실제 RGB 상대
 * 휘도를 계산해서 고른다. */
function pickContrastTextColor(hue, saturation, lightness) {
  const { r, g, b } = hslToRgb(hue, saturation, lightness);
  const luminance = relativeLuminance(r, g, b);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#1a1a1a';
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

function channelLuminance(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r, g, b) {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function hashString(str) {
  let hash = 0;
  for (const ch of Array.from(str)) {
    hash = (hash * 31 + ch.codePointAt(0)) | 0;
  }
  return Math.abs(hash);
}

/** 밴드팀: 등록순번 teamId x 황금각. 꽉 찬 칩(solid fill) — 다만 채도/명도를 페일톤으로
 * 눌러서 진하고 칙칙한 원색 대신 옅은 색 블록이 되게 한다. */
export function colorForBandTeam(teamId) {
  const hue = normalizeHue(Number(teamId) * GOLDEN_ANGLE_DEG);
  const saturation = 60;
  const lightness = 82;
  return {
    hue,
    background: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    border: `hsl(${hue}, ${saturation}%, ${Math.max(lightness - 35, 30)}%)`,
    textColor: pickContrastTextColor(hue, saturation, lightness),
    badge: '합',
  };
}

/** 레슨파트: teamId와 같은 숫자라도 절대 안 겹치도록 +180도 위상 오프셋. 테두리만 있는 칩(outline). */
export function colorForLessonPart(partId) {
  const hue = normalizeHue(Number(partId) * GOLDEN_ANGLE_DEG + 180);
  return {
    hue,
    background: `hsla(${hue}, 65%, 55%, 0.18)`,
    border: `hsl(${hue}, 55%, 55%)`,
    textColor: `hsl(${hue}, 55%, 32%)`,
    badge: '레',
  };
}

/** 공통 일정: 생성된 hue 공간과 절대 겹치지 않는 고정 남색, 밴드/레슨과 다른 solid 스타일 —
 * 다만 이것도 진한 남색 블록 대신 옅은 남색 페일톤으로. */
export function colorForCommon() {
  const hue = 222;
  return {
    hue,
    background: `hsl(${hue}, 55%, 85%)`,
    border: `hsl(${hue}, 45%, 45%)`,
    textColor: `hsl(${hue}, 45%, 28%)`,
    badge: '공',
  };
}

const TYPE_LABELS = { band: '합주', lesson: '레슨', common: '공통' };

/** eventType -> 화면에 풀어 쓰는 한글 라벨. 알 수 없는 타입은 '미분류'. */
export function typeLabel(eventType) {
  return TYPE_LABELS[eventType] || '미분류';
}

/**
 * 정규화된 이벤트(googleCalendarApi.js가 만든 { eventType, teamId, partId, title } 형태) ->
 * 색상 데이터. 화면 계층은 이 함수 하나만 알면 되고, "어떤 타입이 어떤 색 함수로 가는지"는
 * 여기(데이터 계층)에서만 결정한다.
 */
export function colorForEvent(event) {
  if (event.eventType === 'band' && event.teamId != null) return colorForBandTeam(event.teamId);
  if (event.eventType === 'lesson' && event.partId != null) return colorForLessonPart(event.partId);
  if (event.eventType === 'common') return colorForCommon();
  return colorForUnknown(event.title);
}

/** extendedProperties가 없는(네이티브 캘린더에서 직접 만든) 레거시/예외 이벤트 폴백.
 * 제목을 해시해서 같은 제목=같은 색이 되게 하되, 점선 테두리로 "태그 없음"을 시각적으로 구분한다. */
export function colorForUnknown(title) {
  const hue = normalizeHue(hashString(title || ''));
  return {
    hue,
    background: `hsl(${hue}, 15%, 88%)`,
    border: `hsl(${hue}, 15%, 55%)`,
    textColor: `hsl(${hue}, 15%, 30%)`,
    badge: '?',
    dashed: true,
  };
}
