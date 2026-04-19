/**
 * Welcome email — sent on the user's first successful sign-in.
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

export type WelcomeEmailProps = {
  name?: string | null;
  workspaceUrl: string;
  docsUrl?: string;
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

export function WelcomeEmail({
  name,
  workspaceUrl,
  docsUrl,
}: WelcomeEmailProps): ReactElement {
  const greet = name ? `Welcome, ${name}` : "Welcome to SparkFlow";
  return (
    <Html lang="en">
      <Head />
      <Preview>Your SparkFlow workspace is ready.</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>{greet}</Heading>
          <Text style={styles.text}>
            Your workspace is ready. SparkFlow bundles chat, agents,
            workflows, and your own files into a single place you can
            automate end-to-end.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Link href={workspaceUrl} style={styles.cta}>
              Open your workspace -&gt;
            </Link>
          </Section>
          <Text style={styles.text}>
            A few good first moves:
          </Text>
          <Text style={styles.text}>
            - Ask a question in the composer on the home screen.
            <br />
            - Clone an agent from the gallery.
            <br />
            - Upload a file to ground answers in your data.
          </Text>
          {docsUrl ? (
            <Text style={styles.text}>
              New to this? The{" "}
              <Link href={docsUrl} style={styles.cta}>
                quick-start guide
              </Link>{" "}
              takes about five minutes.
            </Text>
          ) : null}
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            You are receiving this because you signed up for SparkFlow.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;
