import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('GET /api/health returns 200 JSON with ok: true', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  test('homepage loads (rtl or landing CTA)', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const dir = await html.getAttribute('dir');

    if (dir === 'rtl') {
      expect(dir).toBe('rtl');
      return;
    }

    // Otherwise expect the landing CTA.
    await expect(page.getByText(/Start chatting/i)).toBeVisible();
  });

  test('POST /api/chat with Hebrew prompt returns 200 JSON with assistant message', async ({
    request,
  }) => {
    const res = await request.post('/api/chat', {
      data: {
        messages: [{ role: 'user', content: 'שלום, מה שלומך?' }],
      },
      headers: {
        'content-type': 'application/json',
        'x-guest-mode': '1',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json().catch(() => null);
    expect(body).not.toBeNull();
    // Accept either { message }, { content }, { choices: [...] }, or { role, content } shape.
    const hasAssistant =
      (body && (body.role === 'assistant' || body.message || body.content || body.choices)) ??
      false;
    expect(hasAssistant).toBeTruthy();
  });

  test('Navigate to /chat/new (allow redirect to /login or direct render)', async ({ page }) => {
    const response = await page.goto('/chat/new');
    const finalUrl = page.url();
    // Either: we landed at /chat/new directly (rendered), or redirected to /login, or 401/302.
    const okStatus = !response || response.status() < 500;
    expect(okStatus).toBeTruthy();
    expect(finalUrl.includes('/chat/new') || finalUrl.includes('/login')).toBeTruthy();
  });
});
