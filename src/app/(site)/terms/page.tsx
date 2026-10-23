import { Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("Terms of use", "The terms for using the BabyBlue website: acceptable use, demonstrations, liability and governing South African law. Draft for legal review.", "/terms");

export default function Terms() {
  return (
    <Section>
      <div className="x-narrow x-prose">
        <span className="x-eyebrow">Legal</span>
        <h1 className="x-h1" style={{ fontSize: "clamp(2.2rem,4.5vw,3.4rem)", margin: "16px 0 12px" }}>Terms of use</h1>
        <div className="x-notice warn" style={{ margin: "20px 0" }}>
          <div><strong>Draft for legal review.</strong> These terms cover the BabyBlue marketing website only. Separate terms will apply to the BabyBlue App, OS, Growth and Flow before they launch, and all of them must be reviewed by a South African attorney.</div>
        </div>
        <h2>1. About this website</h2>
        <p>This website describes BabyBlue and lets you join the waitlist or contact us. Products described here may still be in development. Where something isn&apos;t available, we say so.</p>
        <h2>2. Not medical advice</h2>
        <p>BabyBlue connects people with independent practitioners and does not provide medical advice, diagnosis or treatment. Practitioners are independent and responsible for the care they provide. In an emergency call 10177 (ambulance) or 112 from a mobile phone.</p>
        <h2>3. Demonstrations</h2>
        <p>Interface illustrations and the BabyBlue Flow demonstration use fictional names, times and figures. They do not represent real practitioners, patients, availability or results.</p>
        <h2>4. Acceptable use</h2>
        <p>Don&apos;t misuse the website, attempt to gain unauthorised access, submit false information, or send automated or abusive requests.</p>
        <h2>5. Intellectual property</h2>
        <p>The BabyBlue name, branding and site content belong to BabyBlue or its licensors. You may not copy or reuse them without permission.</p>
        <h2>6. Liability</h2>
        <p>The website is provided as is. To the extent permitted by South African law, BabyBlue is not liable for losses arising from your use of the website. Nothing here limits rights you have under the Consumer Protection Act or other law that cannot be excluded.</p>
        <h2>7. Governing law</h2>
        <p>These terms are governed by the laws of the Republic of South Africa.</p>
        <h2>8. Contact</h2>
        <p>Questions about these terms? Use the <a href="/contact">contact page</a>.</p>
        <p className="x-small">Last updated: draft, not yet in force.</p>
      </div>
    </Section>
  );
}
