/**
 * Passerelle vers les fournisseurs de modèles de langage — exécutée UNIQUEMENT côté serveur.
 * Les clés viennent des variables d'environnement et ne sont jamais transmises aux clients.
 *
 * Optimisation des coûts :
 *  - le LLM ne sert qu'à reformuler des répliques déjà décidées (prompts de ~300 jetons) ;
 *  - budget d'appels par partie, puis repli automatique sur les gabarits locaux ;
 *  - au plus N appels simultanés, délai d'expiration, un nouvel essai sur erreur passagère ;
 *  - coupe-circuit : après plusieurs échecs, le fournisseur est mis en pause.
 */
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'compatible' | 'none';

export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
}

export interface LlmResult { ok: boolean; text?: string; error?: string; ms: number }

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-6-luna',
  gemini: 'gemini-3.5-flash-lite',
  compatible: 'llama3.1',
  none: '',
};

export const configFromEnv = (env: NodeJS.ProcessEnv = process.env): ProviderConfig => {
  const provider = (env.AI_PROVIDER || 'none') as ProviderId;
  const keys: Record<ProviderId, string | undefined> = {
    anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY, compatible: env.COMPAT_API_KEY, none: undefined,
  };
  return {
    provider,
    model: env.AI_MODEL || DEFAULT_MODELS[provider] || '',
    apiKey: keys[provider],
    baseUrl: provider === 'compatible' ? env.COMPAT_BASE_URL : undefined,
    timeoutMs: Number(env.AI_TIMEOUT_MS || 20000),
  };
};

export const isConfigured = (c: ProviderConfig) => c.provider !== 'none' && (c.provider === 'compatible' ? !!c.baseUrl : !!c.apiKey);

type Fetch = typeof fetch;

export class LlmGateway {
  private active = 0;
  private queue: Array<() => void> = [];
  private failures = 0;
  private pausedUntil = 0;
  calls = 0;
  errors = 0;
  totalMs = 0;
  lastError = '';

  constructor(public config: ProviderConfig, private maxParallel = 2, private fetchImpl: Fetch = fetch) {}

  get available() { return isConfigured(this.config) && Date.now() >= this.pausedUntil; }

  status() {
    return {
      provider: this.config.provider, model: this.config.model, configured: isConfigured(this.config),
      paused: Date.now() < this.pausedUntil, calls: this.calls, errors: this.errors,
      avgMs: this.calls ? Math.round(this.totalMs / this.calls) : 0, lastError: this.lastError,
    };
  }

  private async slot() {
    if (this.active < this.maxParallel) { this.active++; return; }
    await new Promise<void>(res => this.queue.push(res));
    this.active++;
  }
  private release() { this.active--; const n = this.queue.shift(); if (n) n(); }

  async complete(system: string, user: string, maxTokens = 160): Promise<LlmResult> {
    const t0 = Date.now();
    if (!this.available) return { ok: false, error: 'fournisseur indisponible', ms: 0 };
    await this.slot();
    try {
      let attempt = 0;
      for (;;) {
        try {
          const text = await this.once(system, user, maxTokens);
          this.calls++; this.totalMs += Date.now() - t0; this.failures = 0;
          return { ok: true, text, ms: Date.now() - t0 };
        } catch (e) {
          const msg = String((e as Error)?.message || e);
          const transient = /\b(429|500|502|503|529)\b|timeout|délai|overloaded|ECONNRESET/i.test(msg);
          if (transient && attempt++ < 1) { await new Promise(r => setTimeout(r, 1500)); continue; }
          throw e;
        }
      }
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 200);
      this.errors++; this.failures++; this.lastError = msg;
      const auth = /\b(401|403)\b/.test(msg);
      if (auth || this.failures >= 4) this.pausedUntil = Date.now() + (auth ? 10 * 60_000 : 60_000);
      return { ok: false, error: msg, ms: Date.now() - t0 };
    } finally { this.release(); }
  }

  private async post(url: string, headers: Record<string, string>, body: unknown) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.config.timeoutMs);
    try {
      const r = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`[${r.status}] ${(d as { error?: { message?: string } })?.error?.message || 'erreur'}`);
      return d as Record<string, unknown>;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw new Error('timeout');
      throw e;
    } finally { clearTimeout(timer); }
  }

  private async once(system: string, user: string, maxTokens: number): Promise<string> {
    const { provider, model, apiKey, baseUrl } = this.config;
    if (provider === 'anthropic') {
      const d = await this.post('https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey!, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
      return ((d.content as Array<{ text?: string }>) || []).map(c => c.text || '').join('').trim();
    }
    if (provider === 'gemini') {
      const d = await this.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': apiKey! },
        { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens } });
      const c = (d.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>)?.[0];
      return (c?.content?.parts || []).map(p => p.text || '').join('').trim();
    }
    const base = provider === 'openai' ? 'https://api.openai.com/v1' : String(baseUrl || '').replace(/\/$/, '');
    const body: Record<string, unknown> = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (provider === 'openai') body.max_completion_tokens = maxTokens; else body.max_tokens = maxTokens;
    const d = await this.post(`${base}/chat/completions`, apiKey ? { authorization: `Bearer ${apiKey}` } : {}, body);
    return (((d.choices as Array<{ message?: { content?: string } }>) || [])[0]?.message?.content || '').trim();
  }
}
