// The Kids profile: what's allowed, daily time and bedtime.
export const KIDS_PAGES = ["home", "livetv", "apps", "games", "prayer", "quran"];

export const today = (now = new Date()) => now.toDateString();

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

// Bedtime runs from `bedtime` until `wake` (across midnight).
export function isBedtime(now, kids) {
  const start = minutesOf(kids.bedtime);
  const end = minutesOf(kids.wake || "06:30");
  if (start == null) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return start <= end ? m >= start && m < end : m >= start || m < end;
}

export function minutesUsed(kids, now = new Date()) {
  return kids.usage?.date === today(now) ? kids.usage.minutes || 0 : 0;
}
export const minutesAllowed = (kids) => (kids.limit ? kids.limit : Infinity);

// Why the TV is locked right now (null = it isn't). A parent's "+30 minutes"
// (unlockUntil) lifts both the daily limit and bedtime for a while.
export function kidsLock(now, kids) {
  if (!kids?.active) return null;
  if (kids.unlockUntil && now.getTime() < kids.unlockUntil) return null;
  if (isBedtime(now, kids)) return "bedtime";
  if (minutesUsed(kids, now) >= minutesAllowed(kids)) return "time";
  return null;
}

export const kidsAllowsApp = (kids, app) => (kids.apps || []).includes(app.id);
