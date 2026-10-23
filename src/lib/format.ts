export const TZ = "Africa/Johannesburg";

export const money = (cents: number | null | undefined) =>
  cents == null ? "" : "R" + Math.round(cents / 100).toLocaleString("en-ZA").replace(/,/g, " ").replace(/ /g, " ");

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, ...o });
const F = {
  time: fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
  weekdayShort: fmt({ weekday: "short" }),
  weekdayLong: fmt({ weekday: "long" }),
  dayMonth: fmt({ day: "numeric", month: "short" }),
  dayMonthLong: fmt({ day: "numeric", month: "long" }),
  monthYear: fmt({ month: "long", year: "numeric" }),
  month: fmt({ month: "short" }),
  year: fmt({ year: "numeric" }),
  parts: fmt({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }),
};

export const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
export const fmtTime = (v: Date | string) => F.time.format(toDate(v)).replace(/^24:/, "00:");
export const fmtWeekday = (v: Date | string) => F.weekdayShort.format(toDate(v));
export const fmtDayMonth = (v: Date | string) => F.dayMonth.format(toDate(v));
export const fmtMonthYear = (v: Date | string) => F.monthYear.format(toDate(v));
export const fmtLongDate = (v: Date | string) => `${F.weekdayLong.format(toDate(v))}, ${F.dayMonthLong.format(toDate(v))}`;
export const fmtMonthShort = (v: Date | string) => F.month.format(toDate(v));

/** YYYY-MM-DD for the given instant in South African time. */
export function dayKey(v: Date | string): string {
  const d = toDate(v);
  const p = Object.fromEntries(fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export const todayKey = () => dayKey(new Date());
/** Midnight (SAST) at the start of a YYYY-MM-DD day, as a Date. */
export const dayStart = (key: string) => new Date(`${key}T00:00:00+02:00`);
export const addDaysKey = (key: string, n: number) => dayKey(new Date(dayStart(key).getTime() + n * 86400000 + 3600000));
export const minutesOfDay = (v: Date | string) => {
  const [h, m] = fmtTime(v).split(":").map(Number);
  return h * 60 + m;
};
/** 0 = Monday … 6 = Sunday */
export const weekdayIndex = (key: string) => (new Date(`${key}T12:00:00+02:00`).getUTCDay() + 6) % 7;
export const startOfWeekKey = (key: string) => addDaysKey(key, -weekdayIndex(key));
export const atTime = (key: string, hhmm: string) => new Date(`${key}T${hhmm}:00+02:00`);
export const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

export function relativeDay(v: Date | string): string {
  const k = dayKey(v);
  const t = todayKey();
  if (k === t) return "Today";
  if (k === addDaysKey(t, 1)) return "Tomorrow";
  if (k === addDaysKey(t, -1)) return "Yesterday";
  return `${fmtWeekday(v)} ${fmtDayMonth(v)}`;
}

export function dayLabelFromKey(key: string, opts: { long?: boolean } = {}) {
  const d = dayStart(key);
  return opts.long ? fmtLongDate(new Date(d.getTime() + 3600000)) : `${fmtWeekday(new Date(d.getTime() + 3600000))} ${fmtDayMonth(new Date(d.getTime() + 3600000))}`;
}

export function untilText(v: Date | string): string {
  const ms = toDate(v).getTime() - Date.now();
  const m = Math.round(ms / 60000);
  if (m < -1) return "started";
  if (m <= 1) return "starting now";
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

export const initials = (name: string) =>
  name
    .replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** .ics (iCalendar) text for "add to calendar". */
export function icsFor(a: { id: string; title: string; start: Date; end: Date; location?: string; description?: string }) {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BabyBlue//Demo//EN", "BEGIN:VEVENT",
    `UID:${a.id}@babyblue`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(a.start)}`, `DTEND:${z(a.end)}`,
    `SUMMARY:${esc(a.title)}`, a.location ? `LOCATION:${esc(a.location)}` : "", a.description ? `DESCRIPTION:${esc(a.description)}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
export function downloadText(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
