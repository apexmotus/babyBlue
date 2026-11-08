export const TODAY = "2026-10-14";
export const START_MINUTES = 9 * 60 + 56; // demo clock starts at 09:56
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
export const toMins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
/** 0 = Monday … 6 = Sunday */
export function dayIndex(iso: string) {
  return (parseDay(iso).getUTCDay() + 6) % 7;
}
export function addDays(iso: string, n: number) {
  const d = parseDay(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function shortDate(iso: string) {
  const d = parseDay(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}
export function longDate(iso: string) {
  const d = parseDay(iso);
  return `${DAYS[dayIndex(iso)]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function weekdayShort(iso: string) {
  const d = parseDay(iso);
  return `${DAYS[dayIndex(iso)].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

/** Estimated wait for a position in the waiting list. Always a range, never a promise. */
export function estimate(pos: number, avg: number) {
  if (pos <= 1) return "Under 10 min";
  const lo = Math.round(((pos - 1) * avg * 2) / 3 / 5) * 5;
  const hi = lo + (pos === 2 ? 10 : 15);
  return `${lo}–${hi} min`;
}

export function fmtPhone(p: string) {
  const d = p.replace(/\D/g, "");
  const n = d.startsWith("27") && d.length === 11 ? "0" + d.slice(2) : d;
  if (n.length === 10) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  return p;
}
export const validPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return (d.length === 10 && d.startsWith("0")) || (d.length === 11 && d.startsWith("27"));
};
export const initials = (first: string, last: string) => ((first[0] || "") + (last[0] || "")).toUpperCase();

function luhn(d12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let n = Number(d12[11 - i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return (10 - (sum % 10)) % 10;
}
export function makeDemoId(dob = "890412") {
  const base = dob + "5800" + "0" + "8";
  return base + luhn(base);
}
/** Validate a South African ID number; returns date of birth (ISO) when valid. */
export function checkRsaId(id: string): { ok: boolean; dob?: string; msg?: string } {
  const d = id.replace(/\s/g, "");
  if (!/^\d{13}$/.test(d)) return { ok: false, msg: "13 digits" };
  const yy = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const dd = Number(d.slice(4, 6));
  const year = yy > 26 ? 1900 + yy : 2000 + yy;
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return { ok: false, msg: "That date of birth is not valid" };
  if (luhn(d.slice(0, 12)) !== Number(d[12])) return { ok: false, msg: "That ID number does not check out" };
  return { ok: true, dob: `${year}-${pad(mm)}-${pad(dd)}` };
}
export const ageFrom = (dobIso: string) => {
  const d = parseDay(dobIso);
  const t = parseDay(TODAY);
  let a = t.getUTCFullYear() - d.getUTCFullYear();
  if (t.getUTCMonth() < d.getUTCMonth() || (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate())) a--;
  return a;
};
export const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
export const uid = (p: string, n: number) => `${p}${n.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
