import { describe, expect, it } from "vitest";
import { formatPhone, parsePhone, parseWhatsApp, toE164, whatsappLink } from "@/lib/phone";

describe("WhatsApp-compatible numbers (sign-up)", () => {
  it.each([
    ["082 431 9087", "+27824319087"],
    ["0824319087", "+27824319087"],
    ["+27 82 431 9087", "+27824319087"],
    ["27824319087", "+27824319087"],
    ["0027824319087", "+27824319087"],
    ["(082) 431-9087", "+27824319087"],
    ["061 234 5678", "+27612345678"],
    ["072.555.0142", "+27725550142"],
    ["084 111 2222", "+27841112222"],
  ])("accepts the South African mobile %s", (input, e164) => {
    expect(parseWhatsApp(input)).toEqual({ ok: true, e164, mobile: true });
  });

  it.each(["011 555 0100", "021 555 0203", "031 555 0206", "012 555 0207", "051 444 1234", "0800 123 456", "086 123 4567"])("refuses the landline or service number %s with a helpful message", (input) => {
    const r = parseWhatsApp(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/mobile/i);
  });

  it.each(["", "   ", "abc", "082 431", "08243190871234", "+0 123 456 789", "082 431 9087 ext 2", "<script>", "++27824319087", "12345"])("refuses the malformed input %j", (input) => {
    expect(parseWhatsApp(input).ok).toBe(false);
  });

  it("accepts other countries in international format (Southern Africa expansion)", () => {
    expect(parseWhatsApp("+267 71 234 567")).toEqual({ ok: true, e164: "+26771234567", mobile: true });
    expect(parseWhatsApp("00264 81 234 5678").ok).toBe(true);
    expect(parseWhatsApp("+44 7700 900123")).toMatchObject({ ok: true, e164: "+447700900123" });
  });

  it("keeps landlines acceptable for a practice's own switchboard", () => {
    expect(parsePhone("011 555 0100")).toEqual({ ok: true, e164: "+27115550100", mobile: false });
    expect(parsePhone("+27 21 555 0203")).toMatchObject({ ok: true, e164: "+27215550203" });
  });

  it("formats and links numbers", () => {
    expect(formatPhone("+27824319087")).toBe("+27 82 431 9087");
    expect(formatPhone("+26771234567")).toBe("+26771234567");
    expect(whatsappLink("+27824319087")).toBe("https://wa.me/27824319087");
  });

  it("toE164 is for trusted seed data and throws on rubbish", () => {
    expect(toE164("082 555 0142")).toBe("+27825550142");
    expect(() => toE164("nope")).toThrow();
  });
});
