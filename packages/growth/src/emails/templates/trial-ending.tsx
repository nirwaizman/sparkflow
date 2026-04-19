/**
 * Trial-ending email — nudges users to upgrade before their trial
 * credits lapse.
 */
import type { ReactElement } from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type TrialEndingEmailProps = {
  name?: string | null;
  daysRemaining: number;
  billingUrl: string;
};

const styles = {
  body: {
    backgroundColor: "#0b0b10",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#e5e7eb",
    margin: 0,
    padding: "24px 0",
  },
  container: {
    backgroundColor: "#111118",
    border: "1px solid #1f2937",
    borderRadius: "12px",
    maxWidth: "560px",
    margin: "0 auto",
    padding: "32px",
  },
  heading: {
    color: "#ffffff",
    fontSize: "24px",
    fontWeight: 600,
    margin: "0 0 16px 0",
  },
  text: { color: "#d1d5db", fontSize: "15px", lineHeight: 1.6 },
  cta: {
    color: "#60a5fa",
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
  },
  hr: { borderColor: "#1f2937", margin: "24px 0" },
  footer: { color: "#6b7280", fontSize: "12px" },
};

export function TrialEndingEmail({
  name,
  daysRemaining,
  billingUrl,
}: TrialEndingEmailProps): ReactElement {
  const salutation = name ? `Hi ${name},` : "Hi there,";
  const window =
    daysRemaining <= 0
      ? "today"
      : daysRemaining === 1
        ? "in 1 day"
        : `in ${daysRemaining} days`;
  return (
    <Html lang="en">
      <Head />
      <Preview>Your SparkFlow trial is ending {window}.</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Your trial ends {window}</Heading>
          <Text style={styles.text}>{salutation}</Text>
          <Text style={styles.text}>
            You have been building with SparkFlow on the free trial. To
            keep your agents, workflows, and usage limits active, pick a
            plan before the trial lapses.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Link href={billingUrl} style={styles.cta}>
              Choose a plan -&gt;
            </Link>
          </Section>
          <Text style={styles.text}>
            Questions about pricing or usage? Reply to this email and a
            human will get back to you.
          </Text>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            You can manage billing and cancel at any time from Settings -&gt;
            Billing.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default TrialEndingEmail;
