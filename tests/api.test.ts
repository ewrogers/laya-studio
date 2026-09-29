import { describe, expect, it, vi, afterEach } from 'vitest';
import { examples, makeRequest, request } from '../src/api';

describe('Jev request contract', () => {
  it('sends named choice criteria and leaves auto routing to Laya', () => {
    const payload = makeRequest(examples[0].draft);
    expect(payload).not.toHaveProperty('model');
    expect(payload.questions.decision).toEqual({
      type: 'choice',
      instructions: examples[0].draft.instructions,
      criteria: {
        Billing: 'Payments, invoices, subscriptions, and refunds',
        Technical: 'Bugs, errors, and help using the product',
        Sales: 'Pricing, plans, and new business enquiries',
      },
    });
  });
  it('preserves the order of score levels and explicit model selection', () => {
    const payload = makeRequest(examples[1].draft);
    expect(payload.model).toBe('typed-decisions');
    expect(payload.questions.decision.criteria).toEqual(examples[1].draft.levels);
  });
  it('uses semantic true/false criteria for noul', () => {
    const payload = makeRequest(examples[2].draft);
    expect(payload.questions.decision.criteria).toEqual({
      true: examples[2].draft.yes,
      false: examples[2].draft.no,
    });
  });
  it('rejects duplicate choice labels before they are lost to object serialization', () => {
    expect(() =>
      makeRequest({
        ...examples[0].draft,
        options: [
          { label: ' Billing ', description: '' },
          { label: 'Billing', description: '' },
        ],
      }),
    ).toThrow('unique');
  });
  it.each([
    { state: ' ' },
    { state: 'x'.repeat(50001) },
    { instructions: '' },
    { mode: 'score' as const, levels: ['Low', ''] },
    { mode: 'noul' as const, yes: '' },
  ])('rejects incomplete or oversized input %j', (patch) => {
    expect(() => makeRequest({ ...examples[0].draft, ...patch })).toThrow();
  });
});

describe('HTTP integration', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('passes auth, payload and inference timing through the same-origin proxy', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response('{"answers":{}}', { headers: { 'X-Inference-Time-Ms': '123.4' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await request('/v1/systemone', 'secret', { method: 'POST', body: '{}' })).toEqual({
      data: { answers: {} },
      inferenceMs: 123.4,
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/systemone',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
  });
  it.each([
    [401, 'API key'],
    [503, 'busy'],
    [422, 'invalid criteria'],
  ])('shows an actionable HTTP %s error', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"detail":"invalid criteria"}', { status: Number(status) }),
        ),
    );
    await expect(request('/v1/systemone', '')).rejects.toThrow(String(message));
  });
  it('handles proxy HTML errors without presenting HTML to users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })),
    );
    await expect(request('/health', '')).rejects.toThrow('backend is unavailable');
  });
});
