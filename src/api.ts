export type Mode = 'choice' | 'score' | 'noul';
export type Model = 'auto' | 'english' | 'multilingual' | 'typed-decisions';
export type Option = { label: string; description: string };
export type Draft = {
  state: string;
  instructions: string;
  mode: Mode;
  model: Model;
  options: Option[];
  levels: string[];
  yes: string;
  no: string;
};
export type Answer = {
  type: Mode;
  choice?: string;
  score?: number;
  noul?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
  confidence: number;
  answer_confidence?: number;
};
export type Result = {
  model?: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
};
export type Health = {
  status: string;
  device: string;
  loaded: string[];
  device_is_preference?: boolean;
};
export type Run = {
  id: string;
  date: string;
  draft: Draft;
  result: Result;
  elapsed: number;
  inferenceMs?: number;
};

export function makeRequest(draft: Draft) {
  if (!draft.state.trim()) throw new Error('Add some context for Laya to read.');
  if (draft.state.length > 50000) throw new Error('Keep context under 50,000 characters.');
  if (!draft.instructions.trim()) throw new Error('Tell Laya what to decide.');
  let criteria: Record<string, string> | string[];
  if (draft.mode === 'choice') {
    const labels = draft.options.map((o) => o.label.trim());
    if (labels.length < 2 || labels.length > 16 || labels.some((l) => !l))
      throw new Error('Add 2–16 options, each with a name.');
    if (new Set(labels).size !== labels.length) throw new Error('Give every option a unique name.');
    criteria = Object.fromEntries(
      draft.options.map((o) => [o.label.trim(), o.description.trim() || o.label.trim()]),
    );
  } else if (draft.mode === 'score') {
    if (draft.levels.length < 2 || draft.levels.some((l) => !l.trim()))
      throw new Error('Describe each level on the scale.');
    criteria = draft.levels.map((l) => l.trim());
  } else {
    if (!draft.yes.trim() || !draft.no.trim())
      throw new Error('Describe what yes and no mean for this decision.');
    criteria = { true: draft.yes.trim(), false: draft.no.trim() };
  }
  return {
    state: draft.state,
    ...(draft.model === 'auto' ? {} : { model: draft.model }),
    questions: {
      decision: { type: draft.mode, instructions: draft.instructions.trim(), criteria },
    },
  };
}

export async function request<T>(
  path: string,
  key: string,
  init: RequestInit = {},
): Promise<{ data: T; inferenceMs?: number }> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The Laya backend is unavailable. Check that the API container is running.');
  }
  if (!response.ok) {
    const detail =
      typeof data.detail === 'string' ? data.detail : `Request failed (${response.status}).`;
    throw new Error(
      response.status === 401
        ? 'An API key is required. Add it in Connection settings.'
        : response.status === 503
          ? 'Laya is busy. Wait a moment and try again.'
          : detail,
    );
  }
  const timing = response.headers.get('X-Inference-Time-Ms');
  return { data, inferenceMs: timing ? Number(timing) : undefined };
}

export const examples: { name: string; category: string; draft: Draft }[] = [
  {
    name: 'Route a support ticket',
    category: 'Customer experience',
    draft: {
      mode: 'choice',
      model: 'auto',
      state:
        'Hi there! I just noticed that I was charged twice for my monthly subscription. Could you help me get a refund for the duplicate payment? Thanks so much.',
      instructions: 'Which team should handle this customer request?',
      options: [
        { label: 'Billing', description: 'Payments, invoices, subscriptions, and refunds' },
        { label: 'Technical', description: 'Bugs, errors, and help using the product' },
        { label: 'Sales', description: 'Pricing, plans, and new business enquiries' },
      ],
      levels: ['Not urgent', 'Needs attention soon', 'Critical or blocking'],
      yes: 'The customer explicitly asks for a refund',
      no: 'The customer does not ask for a refund',
    },
  },
  {
    name: 'Read the urgency',
    category: 'Prioritization',
    draft: {
      mode: 'score',
      model: 'typed-decisions',
      state:
        'Our checkout has been down for the past 30 minutes. No customers can complete a purchase and our biggest sale of the year starts in an hour.',
      instructions: 'How urgent is this issue?',
      options: [
        { label: 'Urgent', description: '' },
        { label: 'Routine', description: '' },
      ],
      levels: [
        'Low: can wait for a routine review',
        'Medium: needs attention today',
        'High: service disruption, act now',
      ],
      yes: 'There is an immediate service disruption',
      no: 'The service is working normally',
    },
  },
  {
    name: 'Spot a refund request',
    category: 'Intent detection',
    draft: {
      mode: 'noul',
      model: 'typed-decisions',
      state:
        'The headphones arrived yesterday, but the left side doesn’t work. I’d like to return them and get my money back, please.',
      instructions: 'Is the customer requesting a refund?',
      options: [
        { label: 'Refund', description: '' },
        { label: 'Other', description: '' },
      ],
      levels: ['Low', 'Medium', 'High'],
      yes: 'The customer wants their money back or a refund',
      no: 'The customer does not request money back or a refund',
    },
  },
];

export function loadHistory(): Run[] {
  try {
    const saved = JSON.parse(localStorage.getItem('laya-history') || '[]');
    return Array.isArray(saved)
      ? saved
          .filter(
            (r) =>
              r &&
              typeof r.id === 'string' &&
              r.draft?.state &&
              r.result?.answers?.decision &&
              r.result?.usage,
          )
          .slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
