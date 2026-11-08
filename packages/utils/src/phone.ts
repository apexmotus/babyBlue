/**
 * Phone numbers. People who sign up give BabyBlue a name, an email and a WhatsApp-compatible mobile number, and nothing
 * sensitive (no ID or passport numbers, no date of birth). Numbers are stored in international format (E.164) so WhatsApp
 * links and reminders always work. Plain functions only: the seed loads this file under plain Node, so no path aliases.
 */

export type PhoneResult = { ok: true; e164: string; mobile: boolean } | { ok: false; message: string };

const FORMAT_HINT = "Enter your WhatsApp number, for example 082 431 9087 or +27 82 431 9087.";
const NOT_MOBILE = "That doesn't look like a mobile number, and WhatsApp needs one. Use a number that starts with 06, 07 or 08, for example 082 431 9087.";

/** South African mobile numbers, without the leading 0: 06x, 07x and 081 to 085. Landlines start 01 to 05. */
const SA_MOBILE = /^(6\d{8}|7\d{8}|8[1-5]\d{7})$/;

/** Parses any well-formed phone number to international format. Landlines are fine here (a practice's switchboard). */
export function parsePhone(input: string): PhoneResult {
  const raw = String(input ?? "").trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return { ok: false, message: FORMAT_HINT };
  let digits = raw.replace(/\D/g, "");
  let international = raw.startsWith("+");
  if (!international && digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }
  if (!international) {
    const typedWithout27Plus = digits.startsWith("27") && digits.length === 11; // 27… typed without the +
    if (digits.startsWith("0")) digits = "27" + digits.slice(1); // national format: assume South Africa
    else if (!typedWithout27Plus) return { ok: false, message: FORMAT_HINT };
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return { ok: false, message: FORMAT_HINT };
  if (digits.startsWith("27")) {
    const national = digits.slice(2);
    if (national.length !== 9) return { ok: false, message: FORMAT_HINT };
    return { ok: true, e164: "+" + digits, mobile: SA_MOBILE.test(national) };
  }
  // Other countries: a well-formed international number is accepted; we cannot tell mobile from landline for them.
  return { ok: true, e164: "+" + digits, mobile: true };
}

/** For sign-up and booking: the number must work on WhatsApp, so South African numbers must be mobiles. */
export function parseWhatsApp(input: string): PhoneResult {
  const r = parsePhone(input);
  if (!r.ok) return r;
  return r.mobile ? r : { ok: false, message: NOT_MOBILE };
}

/** +27 82 431 9087 for South African numbers; other countries are shown as +digits. */
export function formatPhone(e164: string): string {
  const m = /^\+27(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+27 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Opens a WhatsApp chat with this number (wa.me wants digits only). */
export const whatsappLink = (e164: string) => `https://wa.me/${e164.replace(/\D/g, "")}`;

/** Convenience for trusted seed data: throws if the number is not valid. */
export function toE164(input: string): string {
  const r = parsePhone(input);
  if (!r.ok) throw new Error(`Invalid phone number: ${input}`);
  return r.e164;
}
