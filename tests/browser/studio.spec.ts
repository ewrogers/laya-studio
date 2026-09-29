import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', device: 'cpu', loaded: ['english'] } }),
  );
});

test('makes a choice, persists history, flags stale results, and restores the run', async ({
  page,
}) => {
  await page.route('**/api/v1/systemone', async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.questions.decision.type).toBe('choice');
    expect(payload.questions.decision.criteria.Billing).toContain('refunds');
    await route.fulfill({
      json: {
        model: 'laya',
        answers: {
          decision: {
            type: 'choice',
            choice: 'Billing',
            confidence: 0.91,
            probabilities: { Billing: 0.94, Technical: 0.04, Sales: 0.02 },
          },
        },
        usage: { input_tokens: 85, output_tokens: 0 },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Run decision' }).click();
  await expect(page.getByText('DECISION COMPLETE')).toBeVisible();
  await expect(page.locator('.answer-value')).toContainText('Billing');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.json-result pre')).toContainText('0.94');
  await page.getByLabel('Context', { exact: true }).fill('A different request');
  await expect(page.getByText('Inputs changed.')).toBeVisible();
  await page.getByRole('button', { name: /Run history/ }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: /Run history/ }).click();
  await page.locator('.history-load').click();
  await expect(page.locator('.answer-value')).toContainText('Billing');
  await expect(page.getByLabel('Context', { exact: true })).toHaveValue(/charged twice/);
});

test('score and yes/no use their actual response types', async ({ page }) => {
  await page.route('**/api/v1/systemone', (route) => {
    const q = route.request().postDataJSON().questions.decision;
    return route.fulfill({
      json: {
        answers: {
          decision:
            q.type === 'score'
              ? {
                  type: 'score',
                  score: 1.8,
                  confidence: 0.8,
                  legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
                  probabilities: { '0': 0.05, '1': 0.1, '2': 0.85 },
                }
              : { type: 'noul', noul: 0.92, confidence: 0.92 },
        },
        usage: { input_tokens: 100, output_tokens: 0 },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Read the urgency/ }).click();
  await page.getByRole('button', { name: 'Run decision' }).click();
  await expect(page.locator('.answer-value')).toContainText('1.80');
  await page.getByRole('button', { name: /Spot a refund request/ }).click();
  await page.getByRole('button', { name: 'Run decision' }).click();
  await expect(page.locator('.answer-value')).toContainText('Yes');
  await expect(page.getByText('92.0% probability of yes')).toBeVisible();
});

test('auth failures are actionable and API keys stay out of storage', async ({ page }) => {
  await page.route('**/api/v1/systemone', (route) =>
    route.fulfill({ status: 401, json: { detail: 'invalid or missing bearer token' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Run decision' }).click();
  await expect(page.getByRole('alert')).toContainText('API key');
  await page.getByRole('button', { name: 'Connection settings', exact: true }).click();
  await page.getByLabel('API key').fill('my-secret');
  await page.getByRole('button', { name: 'Done' }).click();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('my-secret');
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('my-secret');
});

test('system appearance follows the OS; dark selection persists, including on mobile', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Run decision' })).toBeVisible();
});
