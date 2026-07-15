const GOLDEN_ANGLE_DEG = 137.50776405003785;

const TEAM_SATURATION = 68;
const TEAM_LIGHTNESS = 46;

const CLUB_EVENT_HUE = 210;
const CLUB_EVENT_SATURATION = 55;
const CLUB_EVENT_LIGHTNESS = 36;

const UNKNOWN_LIGHTNESS = 55;

const MONOGRAM_DARK_TEXT = '#12140f';
const MONOGRAM_LIGHT_TEXT = '#fbfdfb';

function normalizeHue(hue) {
  return ((hue % 360) + 360) % 360;
}

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => v * 255);
}

function relativeLuminance([r, g, b]) {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

// WCAG contrast ratio of a color against white/black, used to pick readable
// monogram-badge text instead of assuming white text works on every hue
// (HSL "lightness" isn't perceptual — yellow hues read much brighter than
// blue/purple hues at the same L, so a fixed text color breaks on some hues).
function readableTextFor(hue, saturation, lightness) {
  const luminance = relativeLuminance(hslToRgb(hue, saturation, lightness));
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithBlack > contrastWithWhite ? MONOGRAM_DARK_TEXT : MONOGRAM_LIGHT_TEXT;
}

function buildColorSet(hue, saturation, lightness) {
  const h = Math.round(normalizeHue(hue));
  return {
    hue: h,
    solid: `hsl(${h}, ${saturation}%, ${lightness}%)`,
    translucentBg: `hsla(${h}, ${saturation}%, ${lightness}%, 0.14)`,
    border: `hsla(${h}, ${saturation}%, ${lightness}%, 0.5)`,
    monogramText: readableTextFor(h, saturation, lightness),
  };
}

/**
 * Spaces team hues by the golden angle so each newly registered team's color
 * lands maximally far from every color already assigned, regardless of how
 * many teams exist so far. Depends on teamId being the team's registration
 * order as a plain integer ("1", "2", "3", ...) — assigned once when the team
 * is first added to the roster sheet and never reused or reassigned.
 */
export function hueForTeamOrder(order) {
  return normalizeHue(order * GOLDEN_ANGLE_DEG);
}

export function colorForTeamId(teamId) {
  const order = Number.parseInt(teamId, 10);
  if (!Number.isInteger(order) || order < 1) {
    return buildColorSet(0, 0, UNKNOWN_LIGHTNESS);
  }
  return buildColorSet(hueForTeamOrder(order), TEAM_SATURATION, TEAM_LIGHTNESS);
}

export function colorForClubEvent() {
  return buildColorSet(CLUB_EVENT_HUE, CLUB_EVENT_SATURATION, CLUB_EVENT_LIGHTNESS);
}

export function getEventColor({ teamId } = {}) {
  return teamId ? colorForTeamId(teamId) : colorForClubEvent();
}

/**
 * First character of a team's display name for the monogram badge shown in
 * roomier layouts (week-view chips, day-detail panel) — never the compact
 * month grid, where there isn't room and it would just add clutter on top of
 * the already-truncated label.
 *
 * Uses Array.from (code-point aware) rather than name[0]/name.charAt(0),
 * which can split a surrogate pair in half and render a broken glyph for
 * emoji or other characters outside the BMP. Latin letters are uppercased
 * for consistency; Hangul and other scripts are already single units.
 */
export function monogramFor(teamName) {
  const trimmed = (teamName ?? '').trim();
  if (!trimmed) return '?';
  const first = Array.from(trimmed)[0];
  return /[a-z]/.test(first) ? first.toUpperCase() : first;
}
