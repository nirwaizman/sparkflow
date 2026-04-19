/**
 * Referral-reward email — sent to a user when one of their invitees
 * completes the attribution milestone.
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

export type ReferralRewardEmailProps = {
  name?: string | null;
  /** Display name / email of the person who signed up. */
  referredName?: string | null;
  creditsAwarded: number;
  workspaceUrl: string;
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
  pill: {
    display: "inline-block",
    backgroundColor: "#064e3b",
    color: "#6ee7b7",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 600,
  },
  cta: {
    color: "#60a5fa",
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
  },
  hr: { borderColor: "#1f2937", margin: "24px 0" },
  footer: { color: "#6b7280", fontSize: "12px" },
};

export function ReferralRewardEmail({
  name,
  referredName,
  creditsAwarded,
  workspaceUrl,
}: ReferralRewardEmailProps): ReactElement {
  const salutation = name ? `Hi ${name},` : "Hi there,";
  const whom = referredName ?? "A friend you invited";
  return (
    <Html lang="en">
      <Head />
      <Preview>
        You earned {creditsAwarded} credits from a referral.
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Nice referral.</Heading>
          <Text style={styles.text}>{salutation}</Text>
          <Text style={styles.text}>
            {whom} just joined SparkFlow with your invite link.
          </Text>
          <Section style={{ margin: "16px 0" }}>
            <span style={styles.pill}>
              +{creditsAwarded.toLocaleString()} credits
            </span>
          </Section>
          <Text style={styles.text}>
            Credits are already on your balance and apply automatically
            to agent, workflow, and chat usage.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Link href={workspaceUrl} style={styles.cta}>
              Open your workspace -&gt;
            </Link>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            Keep sharing your referral code from the banner on your
            workspace home.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReferralRewardEmail;
