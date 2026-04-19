/**
 * Usage-alert email — fires at 80% / 100% of a plan's metered limit.
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

export type UsageAlertEmailProps = {
  name?: string | null;
  metric: string;
  used: number;
  limit: number;
  /** 0-100; pre-computed so the template does not do math. */
  percent: number;
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
  meter: {
    backgroundColor: "#1f2937",
    borderRadius: "6px",
    height: "10px",
    margin: "16px 0",
    overflow: "hidden" as const,
  },
  meterFill: {
    backgroundColor: "#f59e0b",
    height: "100%",
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

export function UsageAlertEmail({
  name,
  metric,
  used,
  limit,
  percent,
  billingUrl,
}: UsageAlertEmailProps): ReactElement {
  const salutation = name ? `Hi ${name},` : "Hi there,";
  const clamped = Math.max(0, Math.min(100, percent));
  const headline =
    clamped >= 100
      ? `You have hit your ${metric} limit`
      : `You are at ${clamped}% of your ${metric} limit`;
  return (
    <Html lang="en">
      <Head />
      <Preview>{headline}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>{headline}</Heading>
          <Text style={styles.text}>{salutation}</Text>
          <Text style={styles.text}>
            You have used {used.toLocaleString()} of{" "}
            {limit.toLocaleString()} {metric} this billing period.
          </Text>
          <Section>
            <div style={styles.meter}>
              <div
                style={{ ...styles.meterFill, width: `${clamped}%` }}
              />
            </div>
          </Section>
          <Text style={styles.text}>
            Upgrade your plan to raise limits, or wait for the next
            billing period to reset.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Link href={billingUrl} style={styles.cta}>
              Review plan -&gt;
            </Link>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            You can mute usage alerts in Settings -&gt; Notifications.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default UsageAlertEmail;
