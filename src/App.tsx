import ThemeSwitch from './ThemeSwitch';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Copy,
  ExternalLink,
  History,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  examples,
  loadHistory,
  makeRequest,
  request,
  type Draft,
  type Health,
  type Mode,
  type Run,
} from './api';

type Page = 'playground' | 'history' | 'api';
type Theme = 'system' | 'light' | 'dark';
const modeNames = { choice: 'Choice', score: 'Score', noul: 'Yes / No' };
const clone = <T,>(value: T): T => structuredClone(value);
const readSetting = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? 'mark small' : 'mark'}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 12v9a11 11 0 0 0 22 0v-9M16 10v11a4 4 0 0 0 8 0V10"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('playground');
  const [draft, setDraft] = useState<Draft>(() => clone(examples[0].draft));
  const [theme, setTheme] = useState<Theme>(() => readSetting('laya-theme', 'system') as Theme);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
  const [history, setHistory] = useState<Run[]>(loadHistory);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [key, setKey] = useState('');
  const [resultTab, setResultTab] = useState<'decision' | 'json'>('decision');
  const [toast, setToast] = useState('');
  const [exampleMenu, setExampleMenu] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    try {
      localStorage.setItem('laya-theme', theme);
    } catch {
      /* Storage may be disabled. */
    }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const { data } = await request<Health>('/health', '', {
          signal: AbortSignal.timeout(5000),
        });
        if (active) setHealth(data);
      } catch {
        if (active) setHealth(null);
      } finally {
        if (active) setHealthChecked(true);
      }
    };
    void check();
    const timer = setInterval(check, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (settings) dialog.current?.showModal();
    else dialog.current?.close();
  }, [settings]);
  useEffect(() => {
    if (!busy) return;
    const start = performance.now();
    const timer = setInterval(() => setElapsed((performance.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => () => controller.current?.abort(), []);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError('');
  };
  const saveHistory = (runs: Run[]) => {
    setHistory(runs);
    try {
      localStorage.setItem('laya-history', JSON.stringify(runs));
    } catch {
      setToast('Browser storage is full. This session’s results are still available.');
    }
  };
  const loadExample = (index: number) => {
    setDraft(clone(examples[index].draft));
    setRun(null);
    setError('');
    setExampleMenu(false);
    setPage('playground');
  };
  const changeMode = (mode: Mode) => {
    update({
      mode,
      instructions:
        mode === 'choice'
          ? 'Which team should handle this customer request?'
          : mode === 'score'
            ? 'How urgent is this request?'
            : 'Is the customer requesting a refund?',
    });
    setRun(null);
  };

  async function decide() {
    if (running.current) return;
    let payload;
    try {
      payload = makeRequest(draft);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    running.current = true;
    setBusy(true);
    setError('');
    setRun(null);
    setElapsed(0);
    const snapshot = clone(draft);
    const start = performance.now();
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(
      () =>
        abort.abort(
          new DOMException(
            'The request timed out. Check the backend logs; the first model download may take several minutes.',
            'TimeoutError',
          ),
        ),
      600000,
    );
    try {
      const { data, inferenceMs } = await request<Run['result']>('/v1/systemone', key, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
      if (!data.answers?.decision || !data.usage)
        throw new Error(
          'The backend returned an unexpected response. Check that it is a compatible Laya server.',
        );
      const next: Run = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        draft: snapshot,
        result: data,
        elapsed: Math.round(performance.now() - start),
        inferenceMs,
      };
      setRun(next);
      setResultTab('decision');
      saveHistory([next, ...history].slice(0, 30));
      request<Health>('/health', '', { signal: AbortSignal.timeout(5000) })
        .then(({ data }) => setHealth(data))
        .catch(() => {});
    } catch (e) {
      setError(
        abort.signal.aborted
          ? abort.signal.reason?.name === 'TimeoutError'
            ? abort.signal.reason.message
            : 'Request cancelled. The server may finish its current inference in the background.'
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      running.current = false;
      setBusy(false);
      controller.current = null;
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast('Copied to clipboard');
    } catch {
      setToast('Clipboard unavailable in this browser. Select and copy the text.');
    }
  }
  const exportRun = (item: Run) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `laya-${item.id.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  let preview: string;
  try {
    preview = JSON.stringify(makeRequest(draft), null, 2);
  } catch {
    preview = 'Complete your decision in the playground to see the request.';
  }
  const answer = run?.result.answers.decision;
  const stale = run && JSON.stringify(run.draft) !== JSON.stringify(draft);
  const distribution = answer?.probabilities
    ? Object.entries(answer.probabilities)
    : answer?.type === 'noul'
      ? ([
          ['Yes', answer.noul ?? 0],
          ['No', 1 - (answer.noul ?? 0)],
        ] as [string, number][])
      : [];
  const bestProbability = Math.max(0, ...distribution.map(([, p]) => p));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('playground');
          }}
          aria-label="Laya Studio home"
        >
          <Mark />
          <span>
            laya<span className="brand-dot">.</span>
          </span>
          <span className="studio-tag">STUDIO</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={page === 'playground' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('playground')}
          >
            <SlidersHorizontal size={18} /> Playground <span className="nav-dot" />
          </button>
          <button
            className={page === 'history' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('history')}
          >
            <History size={18} /> Run history <span className="count">{history.length}</span>
          </button>
          <button
            className={page === 'api' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('api')}
          >
            <Code2 size={18} /> API access <ArrowUpRight className="nav-end" size={15} />
          </button>
        </nav>
        <div className="sidebar-note">
          <div className="note-icon">
            <Zap size={18} />
          </div>
          <strong>
            Small model.
            <br />
            Clear decisions.
          </strong>
          <p>
            One forward pass.
            <br />A little less uncertainty.
          </p>
          <a href="https://github.com/NandhaKishorM/laya" target="_blank" rel="noreferrer">
            Meet Laya <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <button className="connection" onClick={() => setSettings(true)}>
            <span className={`status-dot ${health ? 'online' : ''}`} />
            <span>
              <strong>
                {health
                  ? 'Laya is connected'
                  : healthChecked
                    ? 'Backend offline'
                    : 'Connecting to Laya'}
              </strong>
              <small>
                {health
                  ? `${health.device?.toUpperCase() || 'CPU'} · Local inference`
                  : 'Connection settings'}
              </small>
            </span>
            <Settings2 size={15} />
          </button>
          <ThemeSwitch value={theme} onChange={setTheme} />
          <div className="sidebar-footer">
            LOCAL BY DESIGN <span>v1.0</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            {page === 'playground'
              ? 'Playground'
              : page === 'history'
                ? 'Run history'
                : 'API access'}
          </div>
          <a
            href="https://github.com/NandhaKishorM/laya#decision-primitives"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={16} /> Documentation <ArrowUpRight size={14} />
          </a>
        </header>
        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> THE DECISION WORKSPACE
              </div>
              <h1>
                {page === 'playground'
                  ? 'A little context. A little clarity.'
                  : page === 'history'
                    ? 'Every decision, revisited.'
                    : 'Your next connection.'}
              </h1>
              <p>
                {page === 'playground'
                  ? 'Turn your context into a decision. No prompting gymnastics required.'
                  : page === 'history'
                    ? 'Your last 30 runs, saved only in this browser.'
                    : 'The same local engine, wherever your work happens.'}
              </p>
            </div>
            <div className="local-pill">
              <span /> Runs on your machine
            </div>
          </section>

          {page === 'playground' && (
            <>
              <div className="playground-toolbar">
                <div className="mode-tabs" role="group" aria-label="Decision type">
                  {(['choice', 'score', 'noul'] as Mode[]).map((m, i) => (
                    <button
                      disabled={busy}
                      key={m}
                      aria-pressed={draft.mode === m}
                      className={draft.mode === m ? 'selected' : ''}
                      onClick={() => changeMode(m)}
                    >
                      <span className="mode-symbol">{i === 0 ? '⑂' : i === 1 ? '▥' : '◐'}</span>
                      {modeNames[m]}
                      <span className="mode-description">
                        {i === 0
                          ? 'Pick the best fit'
                          : i === 1
                            ? 'Find the level'
                            : 'Check a statement'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="example-picker">
                  <button
                    className="subtle-button"
                    aria-expanded={exampleMenu}
                    onClick={() => setExampleMenu(!exampleMenu)}
                    disabled={busy}
                  >
                    <Sparkles size={15} /> Try an example <ChevronDown size={14} />
                  </button>
                  {exampleMenu && (
                    <div className="example-menu">
                      {examples.map((e, i) => (
                        <button key={e.name} onClick={() => loadExample(i)}>
                          <span>{e.name}</span>
                          <small>{e.category}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="playground-grid">
                <section className="panel input-panel">
                  <div className="panel-header">
                    <div>
                      <span className="step">01</span>
                      <h2>Set the scene</h2>
                    </div>
                    <button
                      className="icon-button"
                      title="Reset to example"
                      aria-label="Reset to example"
                      disabled={busy}
                      onClick={() =>
                        loadExample(draft.mode === 'choice' ? 0 : draft.mode === 'score' ? 1 : 2)
                      }
                    >
                      <RotateCcw size={15} />
                    </button>
                  </div>
                  <fieldset disabled={busy}>
                    <div className="field-heading">
                      <label htmlFor="context">Context</label>
                      <span>The text Laya will read</span>
                    </div>
                    <textarea
                      id="context"
                      className="context-input"
                      value={draft.state}
                      onChange={(e) => update({ state: e.target.value })}
                      maxLength={50000}
                      placeholder="Paste a message, a review, or anything you want to understand…"
                    />
                    <div className="input-meta">
                      <span>Plain text input</span>
                      <span>{draft.state.length.toLocaleString()} / 50,000</span>
                    </div>
                    <div className="field-heading question-label">
                      <label htmlFor="question">The decision</label>
                    </div>
                    <input
                      id="question"
                      className="question-input"
                      value={draft.instructions}
                      onChange={(e) => update({ instructions: e.target.value })}
                      placeholder="What would you like to decide?"
                    />
                    <div className="field-heading options-heading">
                      <label>
                        {draft.mode === 'choice'
                          ? 'Possible answers'
                          : draft.mode === 'score'
                            ? 'Your scale'
                            : 'Define the two outcomes'}
                      </label>
                      <span>
                        {draft.mode === 'choice'
                          ? `${draft.options.length} options`
                          : draft.mode === 'score'
                            ? 'Ordered from low to high'
                            : 'A little specificity helps'}
                      </span>
                    </div>
                    {draft.mode === 'choice' && (
                      <div className="options-list">
                        {draft.options.map((o, i) => (
                          <div className="option-row" key={i}>
                            <span className="option-index">{String.fromCharCode(65 + i)}</span>
                            <div>
                              <input
                                aria-label={`Option ${i + 1} name`}
                                value={o.label}
                                onChange={(e) =>
                                  update({
                                    options: draft.options.map((a, j) =>
                                      j === i ? { ...a, label: e.target.value } : a,
                                    ),
                                  })
                                }
                                placeholder="Option name"
                                maxLength={100}
                              />
                              <input
                                aria-label={`Option ${i + 1} description`}
                                value={o.description}
                                onChange={(e) =>
                                  update({
                                    options: draft.options.map((a, j) =>
                                      j === i ? { ...a, description: e.target.value } : a,
                                    ),
                                  })
                                }
                                placeholder="What does this option mean?"
                                maxLength={1000}
                              />
                            </div>
                            <button
                              className="icon-button remove-option"
                              disabled={draft.options.length <= 2}
                              onClick={() =>
                                update({ options: draft.options.filter((_, j) => j !== i) })
                              }
                              aria-label={`Remove option ${i + 1}`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="add-option"
                          disabled={draft.options.length >= 16}
                          onClick={() =>
                            update({ options: [...draft.options, { label: '', description: '' }] })
                          }
                        >
                          <Plus size={14} /> Add an option
                        </button>
                      </div>
                    )}
                    {draft.mode === 'score' && (
                      <div className="options-list">
                        {draft.levels.map((level, i) => (
                          <div className="option-row scale-row" key={i}>
                            <span className="option-index">{i}</span>
                            <input
                              aria-label={`Level ${i}`}
                              value={level}
                              onChange={(e) =>
                                update({
                                  levels: draft.levels.map((v, j) =>
                                    j === i ? e.target.value : v,
                                  ),
                                })
                              }
                            />
                            <button
                              className="icon-button"
                              aria-label={`Remove level ${i}`}
                              disabled={draft.levels.length <= 2}
                              onClick={() =>
                                update({ levels: draft.levels.filter((_, j) => i !== j) })
                              }
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="add-option"
                          disabled={draft.levels.length >= 10}
                          onClick={() => update({ levels: [...draft.levels, ''] })}
                        >
                          <Plus size={14} /> Add a level
                        </button>
                        <p className="field-note">
                          Returns an expected level, from 0 to {draft.levels.length - 1}.
                        </p>
                      </div>
                    )}
                    {draft.mode === 'noul' && (
                      <div className="options-list">
                        {(['yes', 'no'] as const).map((t) => (
                          <div className="outcome" key={t}>
                            <label htmlFor={t}>{t === 'yes' ? 'Yes' : 'No'}</label>
                            <textarea
                              id={t}
                              value={draft[t]}
                              onChange={(e) => update({ [t]: e.target.value })}
                              rows={2}
                            />
                          </div>
                        ))}
                        <p className="field-note">
                          Returns P(true), the probability that “Yes” applies.
                        </p>
                      </div>
                    )}
                  </fieldset>
                  <div className="run-controls">
                    <label className="model-select">
                      <Layers3 size={16} />
                      <select
                        aria-label="Model"
                        disabled={busy}
                        value={draft.model}
                        onChange={(e) => update({ model: e.target.value as Draft['model'] })}
                      >
                        <option value="auto">Auto-select model</option>
                        <option value="english">English</option>
                        <option value="multilingual">Multilingual</option>
                        <option value="typed-decisions">Typed decisions</option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                    <button
                      className="primary-button"
                      onClick={busy ? () => controller.current?.abort() : decide}
                    >
                      {busy ? (
                        <>
                          <LoaderCircle className="spin" size={15} /> Cancel
                        </>
                      ) : (
                        <>
                          <Play size={14} fill="currentColor" /> Run decision
                        </>
                      )}
                    </button>
                  </div>
                </section>

                <section className="panel result-panel" aria-label="Decision result">
                  <div className="panel-header">
                    <div>
                      <span className="step">02</span>
                      <h2>The clarity</h2>
                    </div>
                    <div className="result-tabs">
                      <button
                        className={resultTab === 'decision' ? 'selected' : ''}
                        onClick={() => setResultTab('decision')}
                      >
                        Result
                      </button>
                      <button
                        className={resultTab === 'json' ? 'selected' : ''}
                        onClick={() => setResultTab('json')}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <div className="result-body" aria-live="polite">
                    {busy ? (
                      <div className="empty-result">
                        <div className="orb working">
                          <Mark />
                        </div>
                        <h3>Finding the signal…</h3>
                        <p>
                          Laya is reading your context.
                          <br />
                          The first run may download a model.
                        </p>
                        <span className="waiting-time">{elapsed.toFixed(1)}s elapsed</span>
                      </div>
                    ) : error ? (
                      <div className="error-state" role="alert">
                        <div className="error-icon">!</div>
                        <h3>A small interruption.</h3>
                        <p>{error}</p>
                        <button className="subtle-button" onClick={() => setSettings(true)}>
                          <Settings2 size={15} /> Connection settings
                        </button>
                      </div>
                    ) : answer && run ? (
                      <>
                        {stale && (
                          <div className="stale-notice">
                            Inputs changed. Run again for a fresh decision.
                          </div>
                        )}
                        {resultTab === 'json' ? (
                          <div className="json-result">
                            <div className="code-toolbar">
                              <span>response.json</span>
                              <button
                                className="icon-button"
                                aria-label="Copy response JSON"
                                onClick={() => copy(JSON.stringify(run.result, null, 2))}
                              >
                                <Copy size={15} />
                              </button>
                            </div>
                            <pre>{JSON.stringify(run.result, null, 2)}</pre>
                          </div>
                        ) : (
                          <div className="decision-result">
                            <div className="result-eyebrow">
                              <span className="status-dot online" /> DECISION COMPLETE
                            </div>
                            <div className="answer-value">
                              {answer.type === 'choice' ? (
                                answer.choice
                              ) : answer.type === 'score' ? (
                                <>
                                  {answer.score?.toFixed(2)}
                                  <small> / {run.draft.levels.length - 1}</small>
                                </>
                              ) : (answer.noul ?? 0) >= 0.5 ? (
                                'Yes'
                              ) : (
                                'No'
                              )}
                              <span>
                                <Check size={20} />
                              </span>
                            </div>
                            <p className="answer-description">
                              {answer.type === 'choice'
                                ? run.draft.options.find((o) => o.label.trim() === answer.choice)
                                    ?.description
                                : answer.type === 'score'
                                  ? 'Expected level on your scale'
                                  : `${((answer.noul ?? 0) * 100).toFixed(1)}% probability of yes`}
                            </p>
                            <div className="distribution-heading">
                              {answer.type === 'score'
                                ? 'LEVEL DISTRIBUTION'
                                : 'HOW THE OPTIONS COMPARE'}
                              <span>PROBABILITY</span>
                            </div>
                            <div className="probabilities">
                              {distribution.map(([label, probability]) => (
                                <div
                                  className={`probability-row ${probability === bestProbability ? 'winner' : ''}`}
                                  key={label}
                                >
                                  <div>
                                    <span>{answer.legend?.[label] ?? label}</span>
                                    <strong>
                                      {(probability * 100).toFixed(1)}
                                      <small>%</small>
                                    </strong>
                                  </div>
                                  <div className="probability-track">
                                    <span
                                      style={{
                                        width: `${Math.max(0, Math.min(100, probability * 100))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="confidence-note">
                              <CircleHelp size={14} />
                              <span>
                                Model probabilities are signals, not guarantees. Validate decisions
                                for your use case.
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="result-metrics">
                          <div>
                            <span>ROUND TRIP</span>
                            <strong>
                              {run.elapsed < 1000
                                ? `${run.elapsed} ms`
                                : `${(run.elapsed / 1000).toFixed(2)} s`}
                            </strong>
                          </div>
                          <div>
                            <span>INPUT TOKENS</span>
                            <strong>{run.result.usage.input_tokens.toLocaleString()}</strong>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="Download result"
                            title="Download result"
                            onClick={() => exportRun(run)}
                          >
                            <ArrowDownToLine size={17} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="empty-result">
                        <div className="orb">
                          <span className="orbit-dot one" />
                          <span className="orbit-dot two" />
                          <Mark />
                        </div>
                        <h3>Let’s make a little sense of it.</h3>
                        <p>
                          Add your context, define the possibilities,
                          <br />
                          and let Laya find the best fit.
                        </p>
                        <div className="empty-hint">
                          <span>01</span> Context <ArrowRight size={13} />
                          <span>02</span> Clarity
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="result-footer">
                    <Zap size={14} />
                    <span>One forward pass. No generated text.</span>
                    <span className="private-tag">LOCAL & PRIVATE</span>
                  </div>
                </section>
              </div>
              <section className="starter-section">
                <div className="starter-heading">
                  <h2>A few places to start</h2>
                  <span>Small decisions. Real possibilities.</span>
                </div>
                <div className="starter-grid">
                  {examples.map((e, i) => (
                    <button
                      key={e.name}
                      disabled={busy}
                      onClick={() => loadExample(i)}
                      className="starter-card"
                    >
                      <span className={`starter-icon icon-${i}`}>
                        {i === 0 ? (
                          <Layers3 size={20} />
                        ) : i === 1 ? (
                          <SlidersHorizontal size={20} />
                        ) : (
                          <Check size={20} />
                        )}
                      </span>
                      <span>
                        <strong>{e.name}</strong>
                        <small>
                          {e.category} <span>·</span> {modeNames[e.draft.mode]}
                        </small>
                      </span>
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {page === 'history' && (
            <section className="panel history-panel">
              <div className="panel-header">
                <div>
                  <History size={18} />
                  <h2>
                    Recent runs <span className="count">{history.length}</span>
                  </h2>
                </div>
                <button
                  className="subtle-button"
                  disabled={!history.length || busy}
                  onClick={() => {
                    saveHistory([]);
                    setToast('Run history cleared');
                  }}
                >
                  <Trash2 size={14} /> Clear history
                </button>
              </div>
              {!history.length ? (
                <div className="empty-result history-empty">
                  <History size={34} />
                  <h3>A clean slate.</h3>
                  <p>Your completed decisions will appear here.</p>
                  <button className="primary-button" onClick={() => setPage('playground')}>
                    Open playground <ArrowRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="history-list">
                  {history.map((item) => (
                    <div className="history-row" key={item.id}>
                      <span className="history-type">{modeNames[item.draft.mode]}</span>
                      <button
                        className="history-load"
                        disabled={busy}
                        onClick={() => {
                          setDraft(clone(item.draft));
                          setRun(item);
                          setError('');
                          setPage('playground');
                        }}
                      >
                        <strong>{item.draft.instructions}</strong>
                        <span>{item.draft.state}</span>
                        <small>
                          {new Date(item.date).toLocaleString()} ·{' '}
                          {(item.elapsed / 1000).toFixed(2)} s
                        </small>
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Download saved run"
                        onClick={() => exportRun(item)}
                      >
                        <ArrowDownToLine size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Delete saved run"
                        disabled={busy}
                        onClick={() => saveHistory(history.filter((r) => r.id !== item.id))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {page === 'api' && (
            <div className="api-grid">
              <section className="panel api-info">
                <div className="panel-header">
                  <div>
                    <Code2 size={18} />
                    <h2>Made to connect</h2>
                  </div>
                  <span className="method-badge">Jev-compatible</span>
                </div>
                <div className="api-content">
                  <h3>One endpoint. Three primitives.</h3>
                  <p>
                    Send context and questions to your local Laya server. Use the request alongside
                    as a starting point.
                  </p>
                  <label>
                    FROM YOUR MAC <small>Default Compose port</small>
                  </label>
                  <code>http://localhost:8000/v1/systemone</code>
                  <label>FROM ANOTHER COMPOSE SERVICE</label>
                  <code>http://api:8000/v1/systemone</code>
                  <label>THROUGH THIS WEB UI</label>
                  <code>{location.origin}/api/v1/systemone</code>
                  <div className="api-note">
                    <CircleHelp size={17} />
                    <p>
                      Services must share the Compose network. For access from another machine,
                      configure the bind address and an API key in <strong>.env</strong>. The
                      default binds to localhost.
                    </p>
                  </div>
                  <button className="subtle-button" onClick={() => setSettings(true)}>
                    <Settings2 size={15} /> Connection settings
                  </button>
                </div>
              </section>
              <section className="panel api-code">
                <div className="panel-header">
                  <div>
                    <span className="method-badge">POST</span>
                    <h2>/v1/systemone</h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Copy API request"
                    onClick={() => copy(preview)}
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="code-toolbar">
                  <span>Request body · from your playground</span>
                  <span>JSON</span>
                </div>
                <pre>{preview}</pre>
                <div className="api-code-footer">
                  Content-Type: application/json
                  <br />
                  Authorization: Bearer &lt;your-key&gt; <span>(if configured)</span>
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Mark small /> A quieter way to decide.
            </span>
            <a href="https://github.com/NandhaKishorM/laya" target="_blank" rel="noreferrer">
              Powered by Laya <ExternalLink size={12} />
            </a>
          </footer>
        </div>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setSettings(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSettings(false);
        }}
      >
        <div className="settings-dialog">
          <div className="panel-header">
            <div>
              <Settings2 size={18} />
              <h2>Connection settings</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setSettings(false)}
              aria-label="Close settings"
            >
              <X size={18} />
            </button>
          </div>
          <div className="settings-content">
            <div className="settings-status">
              <span className={`status-dot ${health ? 'online' : ''}`} />
              <strong>{health ? 'Connected to Laya' : 'Backend not reachable'}</strong>
              <span>{health?.device?.toUpperCase()}</span>
            </div>
            <p>
              {health
                ? `Loaded checkpoints: ${health.loaded?.join(', ') || 'none yet — models load on the first request'}.`
                : 'Start the Compose stack with docker compose up --build -d. The web UI reaches Laya through /api on this same origin.'}
            </p>
            <label htmlFor="api-key">
              API key <small>Optional</small>
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your LAYA_API_KEY"
            />
            <p className="field-note">
              Only needed if you set LAYA_API_KEY on the server. Kept in memory for this tab; never
              saved to browser storage.
            </p>
            <div className="privacy-note">
              <strong>Your workspace stays here.</strong>
              <p>
                Inference runs on your backend. The last 30 runs are stored in this browser. Model
                files download from Hugging Face on first use.
              </p>
            </div>
            <button className="primary-button" onClick={() => setSettings(false)}>
              Done <Check size={15} />
            </button>
          </div>
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
