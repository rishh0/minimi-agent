// The single source of "now" for the whole app. Every stored timestamp and every
// "today" the model sees goes through here, so time can be faked:
//   - NOW=2026-11-03T10:00:00Z npm run dev   → server starts at that moment and keeps ticking
//   - setNow(...) in eval scripts             → pin an exact moment to simulate several days in one run
const envOffsetMs = process.env.NOW ? new Date(process.env.NOW).getTime() - Date.now() : 0;
let pinned: Date | null = null;

export function now(): Date {
  return pinned ? new Date(pinned) : new Date(Date.now() + envOffsetMs);
}

export function setNow(date: Date | null) {
  pinned = date;
}
