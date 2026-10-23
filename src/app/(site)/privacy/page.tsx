import { Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("Privacy policy", "How BabyBlue collects, uses and protects personal information, and your rights under POPIA.", "/privacy");

export default function Privacy() {
  return (
    <Section>
      <div className="x-narrow x-prose">
        <span className="x-eyebrow">Legal</span>
        <h1 className="x-h1" style={{ fontSize: "clamp(2.2rem,4.5vw,3.4rem)", margin: "16px 0 12px" }}>Privacy policy</h1>
        <div className="x-notice warn" style={{ margin: "20px 0" }}>
          <div><strong>Draft for legal review.</strong> This policy describes what the BabyBlue website does today. It must be reviewed by a South African attorney and updated before the platform processes health-related information or launches publicly. The Information Officer details below are placeholders.</div>
        </div>

        <h2>1. Who we are</h2>
        <p>BabyBlue (&ldquo;we&rdquo;) provides an online platform connecting people with practitioners and tools for practitioners to run their practices. For personal information collected through this website (waitlist and contact forms) BabyBlue is the responsible party under the Protection of Personal Information Act, 2013 (POPIA).</p>
        <p><strong>Information Officer:</strong> [to be appointed and registered with the Information Regulator before launch]</p>

        <h2>2. What we collect on this website</h2>
        <ul>
          <li><strong>Waitlist:</strong> name, email address, your role, optional speciality or practice type, optional province, and which BabyBlue products interest you.</li>
          <li><strong>Contact form:</strong> name, email address, topic and your message. Please do not include health information.</li>
          <li><strong>Technical data:</strong> basic server logs (such as IP address and browser) used for security and reliability.</li>
        </ul>

        <h2>3. Why we use it</h2>
        <ul>
          <li>To email you about BabyBlue&apos;s launch and early access, where you&apos;ve agreed.</li>
          <li>To respond to your message.</li>
          <li>To keep the website secure and working.</li>
        </ul>
        <p>We do not sell personal information, and we never use health information to target advertising or marketing.</p>

        <h2>4. Who we share it with</h2>
        <p>Only service providers who help us run the website and email, under agreements that require them to protect your information. We will list them here before launch.</p>

        <h2>5. How long we keep it</h2>
        <p>Waitlist details are kept until you withdraw or we complete the launch process, and then deleted or anonymised. Contact messages are kept only as long as needed to resolve them.</p>

        <h2>6. Your rights</h2>
        <p>You may ask us to confirm what we hold about you, correct it, or delete it, and you may withdraw consent at any time or object to processing. Use the <a href="/contact">contact form</a> and choose &ldquo;Privacy request (POPIA)&rdquo;. You may also complain to the Information Regulator of South Africa.</p>

        <h2>7. Security</h2>
        <p>We use access controls, encryption in transit and server-side validation, and keep credentials out of client code. No system is perfectly secure, and we will notify you and the Regulator of any qualifying breach as the law requires.</p>

        <h2>8. The BabyBlue platform</h2>
        <p>When the booking app and practice tools launch, practices will be the responsible party for their clients&apos; information and BabyBlue will act as an operator under written agreements. A full platform privacy notice will be published before that happens.</p>

        <h2>9. Changes</h2>
        <p>We will update this policy as BabyBlue changes and show the date of the latest version here.</p>
        <p className="x-small">Last updated: draft, not yet in force.</p>
      </div>
    </Section>
  );
}
