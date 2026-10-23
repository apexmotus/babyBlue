# COMPLIANCE

> **BabyBlue has not been independently certified or legally reviewed.** This document records design intent and open actions. Nothing here is legal advice, and nothing on the website may claim compliance certification.

## POPIA (Protection of Personal Information Act, 2013)

| Condition | Design response | Status |
|---|---|---|
| Accountability | Information Officer to be appointed and registered with the Information Regulator | **Open** |
| Processing limitation / minimality | Collect only what a booking, queue or waitlist needs; structured intake only (no free text); admin notes aren't clinical records | Designed |
| Purpose specification | Waitlist emails only for launch; stated on the form; consent captured | Built (waitlist/contact) |
| Further processing | Health information never reused for marketing or ad targeting; Growth uses public practice information only | Designed; enforced in operator RLS |
| Information quality / openness | Clients can ask to correct or delete; contact form has a "Privacy request" topic | Partly built |
| Security safeguards | RLS default-deny, tenant isolation, least privilege, audit log, headers, server-only secrets | Built + tested |
| Operator agreements | Practices are responsible parties; BabyBlue an operator under written agreement | **Open (legal)** |
| Data subject participation | Consent record per client; withdrawal flow in OS | Schema built, UI pending |
| Breach notification | Process to notify Regulator and data subjects | **Open (runbook)** |
| Cross-border transfers | Hosting region and sub-processors to be documented | **Open** |
| Direct marketing (s69) | Opt-in consent for waitlist emails; unsubscribe in every email | Consent built; email pending |

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
