/**
 * @sparkflow/growth — onboarding, referrals, and lifecycle email.
 *
 * Import from the barrel for most cases; subpaths exist in the
 * `exports` map for tree-shakable edge bundles and React Email CLI
 * tooling.
 */

export {
  ONBOARDING_STEPS,
  getStep,
  nextStep,
  progressPercent,
} from "./onboarding/steps";
export type {
  OnboardingStep,
  OnboardingStepId,
  OnboardingContext,
} from "./onboarding/steps";

export {
  generateReferralCode,
  attributeReferral,
  ownerOfCode,
  attributionFor,
} from "./referrals/codes";
export type { Attribution, AttributeResult } from "./referrals/codes";

export { sendEmail } from "./emails/send";
export type { SendEmailInput, SendEmailResult } from "./emails/send";

export { WelcomeEmail } from "./emails/templates/welcome";
export type { WelcomeEmailProps } from "./emails/templates/welcome";
export { TrialEndingEmail } from "./emails/templates/trial-ending";
export type { TrialEndingEmailProps } from "./emails/templates/trial-ending";
export { UsageAlertEmail } from "./emails/templates/usage-alert";
export type { UsageAlertEmailProps } from "./emails/templates/usage-alert";
export { ReferralRewardEmail } from "./emails/templates/referral-reward";
export type { ReferralRewardEmailProps } from "./emails/templates/referral-reward";
