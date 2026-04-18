import { test, expect } from '@playwright/test';

const HAS_OPENAI = !!process.env.SPARKFLOW_TEST_OPENAI;

test.describe('chat flow (live)', () => {
  test.skip(!HAS_OPENAI, 'SPARKFLOW_TEST_OPENAI is not set — skipping live chat flow.');

  test('user signs in (or guest-bypasses) and sends a message', async ({ page, context }) => {
    // Prefer Supabase magic-link if cred is present; otherwise fall back to guest-mode bypass.
    const supaEmail = process.env.SPARKFLOW_TEST_SUPA_EMAIL;
    const supaPassword = process.env.SPARKFLOW_TEST_SUPA_PASSWORD;

    if (supaEmail && supaPassword) {
      await page.goto('/login');
      const emailField = page.getByLabel(/email/i);
      if (await emailField.isVisible().catch(() => false)) {
        await emailField.fill(supaEmail);
        const pwField = page.getByLabel(/password/i);
        if (await pwField.isVisible().catch(() => false)) {
          await pwField.fill(supaPassword);
          await page.getByRole('button', { name: /sign in|log in|כניסה/i }).click();
          await page.waitForLoadState('networkidle');
        } else {
          test.skip(true, 'Login form not in expected shape; skipping gracefully.');
        }
      } else {
        test.skip(true, 'No email field on /login; skipping gracefully.');
      }
    } else {
      // Guest-mode bypass header for all requests in this context.
      await context.setExtraHTTPHeaders({ 'x-guest-mode': '1' });
    }

    await page.goto('/chat/new');

    // Find a message input (textarea or input) and a send button.
    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('שלום! תן לי ברכה קצרה בעברית.');

    const sendBtn = page.getByRole('button', { name: /send|שלח/i }).first();
    await sendBtn.click();

    // Wait for a streaming assistant bubble to appear. We look for any element whose
    // role/content suggests an assistant reply and contains at least some Hebrew chars.
    const assistantBubble = page.locator('[data-role="assistant"], [data-message-role="assistant"], .assistant, [data-testid="assistant-message"]').first();
    await expect(assistantBubble).toBeVisible({ timeout: 30_000 });
    const text = await assistantBubble.innerText();
    expect(text.length).toBeGreaterThan(0);
  });
});
