import { describe, expect, it } from "vitest";
import { validateLead } from "@/server/leads";
import { checkRsaId, estimate, makeDemoId } from "@/lib/util";

describe("validateLead (server-side form validation)", () => {
  const ok = { name: "Naledi Mokoena", email: "Naledi@Example.co.za", topic: "general", message: "Hello, I have a question.", consent: true };

  it("accepts a valid contact message and normalises it", () => {
    const { lead, errors } = validateLead({ ...ok, name: "  Naledi   Mokoena " });
    expect(errors).toBeUndefined();
    expect(lead).toMatchObject({ kind: "contact", name: "Naledi Mokoena", email: "naledi@example.co.za" });
  });

  it("ignores a client-supplied kind: everything is a contact message", () => {
    expect(validateLead({ ...ok, kind: "waitlist" }).lead?.kind).toBe("contact");
  });

  it("requires name, a real email, a topic, a message and explicit consent", () => {
    const { errors } = validateLead({ name: "A", email: "nope", consent: false });
    expect(Object.keys(errors ?? {}).sort()).toEqual(["consent", "email", "message", "name", "topic"]);
  });

  it("refuses non-boolean consent", () => {
    expect(validateLead({ ...ok, consent: "true" }).errors).toHaveProperty("consent");
  });

  it("validates contact messages and topics", () => {
    const base = { kind: "contact", name: "Test", email: "t@example.com", consent: true };
    expect(validateLead({ ...base, topic: "press", message: "Hello, I have a question about launch." }).lead).toBeDefined();
    expect(validateLead({ ...base, topic: "press", message: "short" }).errors).toHaveProperty("message");
    expect(validateLead({ ...base, topic: "made-up", message: "A long enough message here." }).errors).toHaveProperty("topic");
  });

  it("copes with garbage input without throwing", () => {
    for (const bad of [null, undefined, 42, "str", [], {}]) expect(() => validateLead(bad)).not.toThrow();
    expect(validateLead(null).errors).toBeDefined();
  });

  it("truncates oversized fields instead of trusting them", () => {
    const { lead } = validateLead({ ...ok, name: "x".repeat(500), message: "y".repeat(9000) });
    expect(lead!.name.length).toBeLessThanOrEqual(120);
    expect(lead!.message!.length).toBeLessThanOrEqual(4000);
  });
});

describe("Flow demo utilities", () => {
  it("validates South African ID numbers including the check digit", () => {
    const id = makeDemoId("890412");
    expect(checkRsaId(id)).toMatchObject({ ok: true, dob: "1989-04-12" });
    expect(checkRsaId(id.slice(0, 12) + ((Number(id[12]) + 1) % 10)).ok).toBe(false);
    expect(checkRsaId("123").ok).toBe(false);
    expect(checkRsaId("8913405800087").ok).toBe(false); // month 13
  });

  it("shows waiting estimates as ranges, never promises", () => {
    expect(estimate(1, 15)).toBe("Under 10 min");
    expect(estimate(3, 15)).toBe("20–35 min");
    expect(estimate(4, 15)).toBe("30–45 min");
  });
});
