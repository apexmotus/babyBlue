# COMPLIANCE

> **BabyBlue has not been independently certified or legally reviewed.** This document records design intent and open actions. Nothing here is legal advice, and nothing on the website may claim compliance certification.

## POPIA (Protection of Personal Information Act, 2013)

| Condition | Design response | Status |
|---|---|---|
| Accountability | Information Officer to be appointed and registered with the Information Regulator | **Open** |
| Processing limitation / minimality | Collect only what a booking or queue needs; structured intake only (no free text); admin notes aren't clinical records | Designed |
| Purpose specification | Contact details used only to reply; stated on the form; consent captured | Built (contact) |
| Further processing | Health information never reused for marketing or ad targeting; Growth uses public practice information only | Designed; enforced in operator RLS |
| Information quality / openness | Clients can ask to correct or delete; contact form has a "Privacy request" topic | Partly built |
| Security safeguards | RLS default-deny, tenant isolation, least privilege, audit log, headers, server-only secrets | Built + tested |
| Operator agreements | Practices are responsible parties; BabyBlue an operator under written agreement | **Open (legal)** |
| Data subject participation | Consent record per client; withdrawal flow in OS | Schema built, UI pending |
| Breach notification | Process to notify Regulator and data subjects | **Open (runbook)** |
| Cross-border transfers | Hosting region and sub-processors to be documented | **Open** |
| Direct marketing (s69) | No marketing emails are sent; any future mailing needs opt-in consent and unsubscribe | Not applicable yet |

## What the public is asked for (data minimisation)
Sign-up asks for a **name, an email address and a WhatsApp-compatible mobile number**, plus a password. The number is stored in international format and the database refuses anything else. Nothing more is asked: no ID or passport number, no date of birth, no home address, no health details. The public queue-join form (`/c/…/join`) likewise asks only for a name and a WhatsApp-compatible number. A practice sees a patient's name, email and WhatsApp number only on bookings that patient made with it. **Open:** reception screens in the legacy Flow demo (`/staff`) still have optional ID fields for staff to fill in; the public is never shown them. Decide whether to remove those too.

## Practice directory (real practices from OpenStreetMap)
Shown so people can find and call a practice. Name, kind, address and location, and a phone number and website **only where the practice's own OpenStreetMap entry publishes them**. Never kept: email addresses, personal or WhatsApp mobile tags, reviews or ratings (none exist in the source, and copying them from Google or others is not allowed), pharmacies and laboratories. Every record keeps its OpenStreetMap id and the date retrieved, and every page carries the required attribution (ODbL) and says the details are unverified and the practice is not on BabyBlue.

| Concern | Position | Status |
|---|---|---|
| Licence | ODbL: attribution shown everywhere; the raw dataset is not published and there is no API returning full records (share-alike would otherwise reach BabyBlue's database) | Designed |
| POPIA, solo practitioners | A practice named after one person is personal information. Only business tags are used and the data is already published openly, but this has not been reviewed by an attorney | **Open (legal)** |
| Removal and correction | Each page links to the practice's OpenStreetMap entry (fix it at the source) and asks for removal through the contact form, "Privacy request (POPIA)", quoting the id | **Open: the contact form cannot store messages until storage is connected and a monitored address is published (NEXT_PUBLIC_CONTACT_EMAIL). Do not let the site into search engines before this works** |
| Direct marketing (s69) | No email addresses are held and the details are never used for outreach | Designed |
| Accuracy | OpenStreetMap contributors make mistakes (a handful of entries mix up two places). Every page says the details are unverified | Accepted, disclosed |

## Professional advertising rules
Practitioners are regulated by statutory councils (e.g. HPCSA, SANC, SAPC). Each has rules on advertising and use of testimonials. BabyBlue Growth is designed to: build creative to the relevant regulator's rules, require practitioner approval of every item, never target using sensitive health data, never fabricate reviews or results, and state that responsibility for regulatory compliance remains with the practitioner. **Open:** attorney/regulator review of the advertising rule set per profession before Growth launches; reviews/ratings policy before any are displayed.

## Verification
A "verified" badge requires a platform admin to check registration against the relevant council's public register (`set_verification`, audited). Until then profiles say "not verified". **Open:** written verification SOP, evidence retention, re-verification cadence.

## Other South African law to review
Consumer Protection Act (cooling-off, cancellation), ECTA (electronic transactions), National Health Act confidentiality, Cybercrimes Act, payment/PCI scope when payments are added.

## Pre-launch checklist
- [ ] Attorney review of Privacy Policy, Terms, operator agreement, Growth terms
- [ ] Information Officer registered; PAIA manual
- [ ] Sub-processor and data-location register
- [ ] Breach response runbook and test
- [ ] Verification SOP
- [ ] Advertising-rules review by profession
- [ ] Penetration test and RLS audit by a third party
- [ ] DPIA for health-adjacent processing
