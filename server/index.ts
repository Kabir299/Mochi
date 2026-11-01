// Small HTTP server that runs the app's AI features. The API key stays here,
// never in the app. Uses Claude when ANTHROPIC_API_KEY is set. Otherwise it uses
// the free tiers: Groq (fast) when GROQ_API_KEY is set, then Google Gemini when
// GEMINI_API_KEY is set; with both, Gemini is the backup when Groq is busy.
//
//   cd server && npm start         (reads keys from env or server/.env)
//
//   POST /analyze     habit stats            -> review, tips and goal adjustments
//   POST /plan-day    today's tasks + now    -> start times for unscheduled tasks
//   POST /chat        conversation + stats   -> coach reply
//   POST /brain-dump  free text              -> structured tasks
//   POST /estimate-food  meal description    -> calories and protein
//   POST /onboard-plan   first-launch answers -> a starting set of habits
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 200_000;

const HAS_ANTHROPIC = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const GEMINI_KEY = process.env.GEMINI_API_KEY;
// Tried in order; the first that answers wins. GEMINI_MODEL puts one first.
const GEMINI_MODELS = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
];
// Logs never include what users sent or what the AI wrote back, only error codes and
// field paths, so nothing personal is kept once a request finishes.
function errorText(data: unknown) {
  const error = (data as { error?: { message?: unknown } } | null)?.error;
  return typeof error?.message === 'string' ? error.message.slice(0, 200) : '';
}

function issuePaths(error: z.ZodError) {
  return error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
}

const GEMINI_TIMEOUT_MS = 45_000;
// Overloaded models are skipped for a while instead of retried every request.
const GEMINI_BUSY_MS = 5 * 60_000;
const geminiBusyUntil = new Map<string, number>();

const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 30_000;

const PROVIDER = HAS_ANTHROPIC ? 'claude' : GROQ_KEY ? 'groq' : GEMINI_KEY ? 'gemini' : null;

const client = new Anthropic();

// Errors from the Groq and Gemini paths that should reach the app with a status code.
class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const COACH = `You are a supportive, practical habit coach inside a habit tracker app.
Ground every statement in the data you were given; never invent numbers. Be warm but
direct and keep things short. Suggestions should be small, specific and doable this
week (habit stacking, shrinking the habit, changing the time of day, preparing the
environment). Nutrition feedback is general wellness guidance, not medical advice.

Tone: honest but encouraging, like a good friend who is also a coach.
- Be truthful. If something is slipping, say so plainly with the number (e.g. "Reading
  dropped to 30% this month, from 70%"). Never call a weak result good or hide a decline.
- Never shame, guilt or lecture. No "you failed", "you should have", "disappointing".
  Treat a miss as information about the plan, not about the person.
- Pair every problem with a reason for hope and a next step: what is still working,
  or how small the fix is.
- Find genuine wins even in a hard month (showing up at all, one habit holding, a good
  streak last week). Don't invent praise; if there is little to praise, praise the effort
  of checking in.
- End on something motivating and specific about the coming week.`;

const Time = z.string().describe('24-hour local time, "HH:MM"');

const Analysis = z.object({
  summary: z.string().describe('Two or three sentences on overall progress and trend: honest about the numbers, encouraging in tone.'),
  wins: z.array(z.string()).describe('Specific things going well, citing numbers.'),
  improvements: z
    .array(
      z.object({
        habit: z.string(),
        issue: z.string(),
        suggestion: z.string().describe('One concrete, small action to take this week.'),
      }),
    )
    .describe('The habits that most need help, worst first. At most three.'),
  goal_adjustments: z
    .array(
      z.object({
        habit: z.string().describe('Exact habit name from the data.'),
        change: z.enum(['easier', 'harder']),
        reason: z.string(),
        new_target: z
          .number()
          .int()
          .nullable()
          .describe('New daily count for counted habits, otherwise null.'),
      }),
    )
    .describe(
      'Goals to retune: easier when completion is consistently under ~50%, harder when it is ~100% for weeks. Empty if none.',
    ),
  weekly_focus: z.string().describe('The single most important thing to focus on this week.'),
  nutrition: z
    .string()
    .describe(
      'Feedback on water, calories and protein against the goals and the body goal in about_me. If nutrition was sent but little is logged, say so and suggest logging meals. Empty string only if no nutrition data was sent.',
    ),
});

const DayPlan = z.object({
  plan: z.array(
    z.object({
      id: z.number().int().describe('The task id from the input.'),
      start_time: Time,
      duration_min: z.number().int(),
      reason: z.string().describe('A few words on why this slot.'),
    }),
  ),
  summary: z.string().describe('One sentence describing the shape of the day.'),
});

const ChatReply = z.object({
  reply: z.string().describe('The coach reply, a few short paragraphs at most.'),
});

const BrainDump = z.object({
  tasks: z.array(
    z.object({
      name: z.string().describe('Short task name, 2–6 words, sentence case.'),
      icon: z.string().describe('One icon name from the allowed list.'),
      start_time: Time.nullable().describe('Only if a time was mentioned or clearly implied.'),
      duration_min: z.number().int().nullable(),
      repeat: z.enum(['once', 'daily']).describe('daily only if the user wants it every day.'),
      weight: z.number().int().describe('1 small, 2 normal, 3 big or important.'),
      target: z.number().int().describe('Times per day, 1 for a simple task.'),
      unit: z.string().nullable().describe('Unit for counted tasks, e.g. "glasses".'),
    }),
  ),
  note: z.string().describe('One short sentence summarising what was captured.'),
});

const FoodEstimate = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      portion: z.string().describe('The amount eaten, e.g. "2 pieces", "1 bowl", "200 g".'),
      calories: z.number(),
      protein_g: z.number(),
    }),
  ),
  total_calories: z.number(),
  total_protein_g: z.number(),
});

const OnboardPlan = z.object({
  summary: z.string().describe('Two short sentences on how this plan fits the person.'),
  habits: z.array(
    z.object({
      name: z.string().describe('Short habit name, 2–6 words, sentence case.'),
      icon: z.string().describe('One icon name from the allowed list.'),
      days: z
        .array(z.number().int())
        .describe('Weekdays it repeats on, 0 = Sunday … 6 = Saturday. Empty for every day.'),
      start_time: Time.nullable().describe('null for habits done any time of day.'),
      duration_min: z.number().int().nullable(),
      weight: z.number().int().describe('1 small, 2 normal, 3 big or important.'),
      target: z.number().int().describe('Times per day, 1 for a simple habit.'),
      unit: z.string().nullable().describe('Unit for counted habits, e.g. "glasses".'),
      why: z.string().describe('One short sentence on why this habit, at this time.'),
    }),
  ),
});

type Route = {
  schema: z.ZodType;
  system: string;
  prompt: (body: Record<string, unknown>) => string;
};

const ROUTES: Record<string, Route> = {
  '/analyze': {
    schema: Analysis,
    system: COACH,
    prompt: (body) =>
      `Here is my tracking data. Analyze it, tell me how to improve, and suggest any goals to make easier or harder.\n\n${JSON.stringify(body)}`,
  },
  '/plan-day': {
    schema: DayPlan,
    system: `${COACH}

You plan a day. Fixed tasks already have a start_time and must not move. Give every
flexible task (start_time null) a start time after "now", avoiding overlaps with fixed
tasks and with each other. Use the given duration, or estimate a sensible one. Put
demanding tasks earlier, leave short breaks, and keep everything before 23:00.`,
    prompt: (body) => `Plan my day.\n\n${JSON.stringify(body)}`,
  },
  '/chat': {
    schema: ChatReply,
    system: `${COACH}

You are chatting with the user about their habits. Their latest stats are included with
each message. Answer the question they asked; ask a short follow-up question only when it
would really help.`,
    prompt: (body) => JSON.stringify(body),
  },
  '/estimate-food': {
    schema: FoodEstimate,
    system: `You estimate calories and protein for a meal someone describes in a food
tracker. Assume typical home or restaurant portions when no amount is given, and the
user's local cuisine when a dish is ambiguous (for example Indian home cooking for "dal").
Give realistic everyday estimates, not ranges.`,
    prompt: (body) => `Estimate this meal.\n\n${JSON.stringify(body)}`,
  },
  '/brain-dump': {
    schema: BrainDump,
    system: `You turn a rambling, dictated brain dump into a clean list of tasks for a habit
tracker. The text usually comes from phone speech-to-text, so expect no punctuation, run-on
sentences, filler ("um", "like", "basically"), self-corrections ("at 5, no, 6" means 6),
repeated words, misheard words and a mix of English and Hindi (Hinglish). Work out what the
person actually means.

Rules:
- One task per action. Split "gym and then groceries" into two. Merge duplicates.
- Names: 2–6 words, start with a verb, sentence case, fix spelling ("Call mum", "Finish
  the report"). Drop filler and feelings that aren't tasks ("I'm so tired").
- Times: use start_time only when a time is said or clearly implied. Turn phrases into
  times: "morning" 08:00, "before lunch" 11:30, "after lunch" 14:00, "afternoon" 15:00,
  "evening" 18:30, "tonight"/"after dinner" 21:00, "in an hour" = now + 60 minutes,
  "half past six in the evening" 18:30. Read "6" as 06:00 or 18:00 from context (gym at
  6 after work = 18:00). Never put a task for today before "now"; if the stated time has
  passed, leave start_time null.
- duration_min: from "for 30 minutes", "an hour", "quick" (15) or a sensible estimate for
  timed tasks; null for untimed ones.
- repeat "daily" only for "every day", "daily", "each morning" and similar.
- Counted tasks ("8 glasses of water", "3 sets") use target and unit.
- weight 3 for deadlines, exams, work or anything said to be important or urgent; 1 for
  small errands; otherwise 2.
- Skip anything already in the existing list. Keep timed tasks from overlapping.
- note: one short friendly sentence, e.g. "Got 5 tasks; 3 have times."`,
    prompt: (body) => `Turn this into tasks.\n\n${JSON.stringify(body)}`,
  },
  '/onboard-plan': {
    schema: OnboardPlan,
    system: `${COACH}

You design someone's first set of habits from their onboarding answers: the habits they
want, their body goal, wake-up time, the part of the day they focus best (prime time),
how many hours of focused work they want, and their pace. A draft made by simple rules is
included; improve on it rather than starting over. Put focused work in their prime time
and split it into blocks of 60–120 minutes with breaks. Keep timed habits from
overlapping, all between their wake-up time and 23:30. Match the pace: "easy" means about
4 small habits, "steady" about 6, "all_in" up to 9 (work blocks not counted). Cover the
free-text request if there is one. Workouts and other body habits should suit the body goal.`,
    prompt: (body) => `Build my starting plan.\n\n${JSON.stringify(body)}`,
  },
};

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-key, x-install-token, x-user-id',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ProviderError(413, 'That request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Gemini has no SDK here: plain REST, JSON-only replies, and the same zod schemas
// to check the result, so the app gets identical shapes from either provider.
async function runGemini(route: Route, body: Record<string, unknown>) {
  const schema = JSON.stringify(z.toJSONSchema(route.schema));
  const request = JSON.stringify({
    systemInstruction: {
      parts: [
        {
          text: `${route.system}\n\nReply with only a JSON object that matches this JSON Schema:\n${schema}`,
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: route.prompt(body) }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });

  // Free-tier models are often busy, so fall through to the next one when a
  // model is overloaded, rate-limited, unavailable, or too slow.
  let response: Response | null = null;
  let data: any = null;
  const now = Date.now();
  const available = GEMINI_MODELS.filter((m) => (geminiBusyUntil.get(m) ?? 0) < now);
  // If everything is marked busy, try them all again rather than give up.
  for (const model of available.length > 0 ? available : GEMINI_MODELS) {
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY! },
          body: request,
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      );
    } catch {
      console.error(`Gemini ${model}: no response in time, trying the next model`);
      geminiBusyUntil.set(model, Date.now() + GEMINI_BUSY_MS);
      response = null;
      continue;
    }
    data = await response.json().catch(() => null);
    if (response.ok || ![404, 429, 500, 503].includes(response.status)) break;
    console.error(`Gemini ${model}: ${response.status}, trying the next model`);
    geminiBusyUntil.set(model, Date.now() + GEMINI_BUSY_MS);
  }

  if (!response) throw new ProviderError(504, 'Gemini is busy right now. Try again in a minute.');
  if (!response.ok) {
    console.error('Gemini error', response.status, errorText(data));
    if (response.status === 429) {
      throw new ProviderError(429, 'Free Gemini limit reached for now. Try again in a minute.');
    }
    if (response.status === 503 || response.status === 500) {
      throw new ProviderError(503, 'Gemini is busy right now. Try again in a minute.');
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new ProviderError(500, 'The AI server has no valid GEMINI_API_KEY.');
    }
    throw new ProviderError(502, `Gemini returned an error (${response.status}).`);
  }
  if (data?.promptFeedback?.blockReason) {
    throw new ProviderError(422, "Couldn't help with that one. Try rephrasing.");
  }

  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? '')
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, '');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderError(502, 'The answer came back incomplete. Try again.');
  }
  const parsed = route.schema.safeParse(json);
  if (!parsed.success) {
    console.error('Gemini reply did not match the schema at', issuePaths(parsed.error));
    throw new ProviderError(502, 'The answer came back in the wrong shape. Try again.');
  }
  return parsed.data;
}

// Groq speaks the OpenAI chat format. The JSON Schema guides the reply and zod
// checks it, same as the other providers.
async function runGroq(route: Route, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: route.system },
          { role: 'user', content: route.prompt(body) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'reply', strict: false, schema: z.toJSONSchema(route.schema) },
        },
      }),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
  } catch {
    throw new ProviderError(504, 'Groq took too long to answer. Try again.');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('Groq error', response.status, errorText(data));
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(500, 'The AI server has no valid GROQ_API_KEY.');
    }
    if (response.status === 429) {
      throw new ProviderError(429, 'Free Groq limit reached for now. Try again in a minute.');
    }
    throw new ProviderError(502, `Groq returned an error (${response.status}).`);
  }

  const text: string = data?.choices?.[0]?.message?.content ?? '';
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderError(502, 'The answer came back incomplete. Try again.');
  }
  const parsed = route.schema.safeParse(json);
  if (!parsed.success) {
    console.error('Groq reply did not match the schema at', issuePaths(parsed.error));
    throw new ProviderError(502, 'The answer came back in the wrong shape. Try again.');
  }
  return parsed.data;
}

async function run(route: Route, body: Record<string, unknown>) {
  if (PROVIDER === 'groq') {
    try {
      return await runGroq(route, body);
    } catch (error) {
      // A bad key should surface; anything else falls back to Gemini if it's set up.
      if (!GEMINI_KEY || (error instanceof ProviderError && error.status === 500)) throw error;
      console.error('Groq failed, falling back to Gemini:', error);
      return runGemini(route, body);
    }
  }
  if (PROVIDER === 'gemini') return runGemini(route, body);

  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // Re-runs a declined request on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: zodOutputFormat(route.schema) },
    system: route.system,
    messages: [{ role: 'user', content: route.prompt(body) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error("Couldn't help with that one. Try rephrasing.");
  }
  if (!response.parsed_output) {
    throw new Error('The answer came back incomplete. Try again.');
  }
  return response.parsed_output;
}

// Shared secret the app sends as x-app-key; unset means open (fine on home Wi-Fi).
const APP_KEY = process.env.APP_KEY;
// Per-install limit so one user (or a script) can't run up the AI bill.
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 40);
// Per-address limit, looser because many phones on mobile data share one address.
const IP_RATE_LIMIT = Number(process.env.IP_RATE_LIMIT ?? 300);
// New installs per address per hour; stops a script from minting endless passes.
const REGISTER_LIMIT = Number(process.env.REGISTER_LIMIT ?? 10);
const RATE_WINDOW_MS = 10 * 60_000;
const HOUR_MS = 60 * 60_000;
const recent = new Map<string, number[]>();

// Each install gets its own signed pass from /register, so limits apply per install
// and a pass can be revoked without touching the app. Signed with TOKEN_SECRET.
const TOKEN_SECRET = process.env.TOKEN_SECRET;
const sign = (id: string) =>
  createHmac('sha256', TOKEN_SECRET!).update(id).digest('base64url');

function newInstallToken() {
  const id = randomUUID();
  return `${id}.${sign(id)}`;
}

// Returns the install id if the pass is genuine, otherwise null.
function installFrom(token: string | string[] | undefined) {
  if (typeof token !== 'string') return null;
  const [id, signature] = token.split('.');
  if (!id || !signature) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

// Paid AI features. With REVENUECAT_SECRET_KEY set, the server asks RevenueCat whether
// the caller really has Pro, so a modified app can't fake it.
const PRO_ROUTES = new Set(['/analyze', '/plan-day', '/chat', '/estimate-food', '/brain-dump']);
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;
const PRO_CACHE_MS = 10 * 60_000;
const proCache = new Map<string, { pro: boolean; until: number }>();

async function hasPro(userId: string) {
  const cached = proCache.get(userId);
  if (cached && cached.until > Date.now()) return cached.pro;
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    {
      headers: { Authorization: `Bearer ${REVENUECAT_SECRET_KEY}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new ProviderError(503, 'Couldn’t check your Pro status. Try again.');
  const data = (await response.json()) as {
    subscriber?: { entitlements?: Record<string, { expires_date: string | null }> };
  };
  const entitlement = data.subscriber?.entitlements?.pro;
  // No expiry date means a lifetime purchase.
  const pro =
    entitlement !== undefined &&
    (entitlement.expires_date === null || Date.parse(entitlement.expires_date) > Date.now());
  proCache.set(userId, { pro, until: Date.now() + PRO_CACHE_MS });
  if (proCache.size > 50_000) proCache.clear();
  return pro;
}
// Total AI calls per day across everyone, so a bug or attack can't run up a big bill.
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT ?? 5000);
let today = '';
let todayCount = 0;

function withinDailyBudget() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== today) {
    today = day;
    todayCount = 0;
  }
  return ++todayCount <= DAILY_LIMIT;
}

// Compares hashes so the check takes the same time however much of the key is right.
function keyMatches(sent: string | string[] | undefined) {
  if (typeof sent !== 'string') return false;
  const hash = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(hash(sent), hash(APP_KEY!));
}

// A public host must have both secrets, or anyone could use (and pay for) the AI.
if (process.env.NODE_ENV === 'production' && (!APP_KEY || !TOKEN_SECRET)) {
  console.error('APP_KEY and TOKEN_SECRET must be set. Refusing to start in production.');
  process.exit(1);
}

function allowRequest(bucket: string, limit: number, windowMs = RATE_WINDOW_MS) {
  const now = Date.now();
  const hits = (recent.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    recent.set(bucket, hits);
    return false;
  }
  hits.push(now);
  recent.set(bucket, hits);
  if (recent.size > 10_000) recent.clear();
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  const isRegister = req.method === 'POST' && req.url === '/register';
  const route = req.method === 'POST' && req.url ? ROUTES[req.url] : undefined;
  if (!route && !isRegister) return send(res, 404, { error: 'Not found' });

  // Once hosted, only the app (which knows APP_KEY) may use the server.
  if (APP_KEY && !keyMatches(req.headers['x-app-key'])) {
    return send(res, 401, { error: 'This app version can’t use the AI server. Update the app.' });
  }
  // The host's proxy appends the real address last; earlier entries can be faked.
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
    .split(',')
    .pop()!
    .trim();

  if (isRegister) {
    if (!TOKEN_SECRET) return send(res, 200, { token: null });
    if (!allowRequest(`register:${ip}`, REGISTER_LIMIT, HOUR_MS)) {
      return send(res, 429, { error: 'Too many new installs from this network. Try later.' });
    }
    return send(res, 200, { token: newInstallToken() });
  }

  let install = 'local';
  if (TOKEN_SECRET) {
    const id = installFrom(req.headers['x-install-token']);
    if (!id) return send(res, 401, { error: 'Please try again.', code: 'register' });
    install = id;
  }
  if (!allowRequest(`install:${install}`, RATE_LIMIT) || !allowRequest(`ip:${ip}`, IP_RATE_LIMIT)) {
    return send(res, 429, { error: 'Too many AI requests. Try again in a few minutes.' });
  }
  if (REVENUECAT_SECRET_KEY && PRO_ROUTES.has(req.url!)) {
    const userId = req.headers['x-user-id'];
    try {
      if (typeof userId !== 'string' || !(await hasPro(userId))) {
        return send(res, 402, { error: 'This feature needs Mochi Pro.' });
      }
    } catch {
      return send(res, 503, { error: 'Couldn’t check your Pro status. Try again.' });
    }
  }
  if (!withinDailyBudget()) {
    return send(res, 503, { error: 'Mochi’s AI is very busy today. Try again tomorrow.' });
  }

  if (!PROVIDER) {
    return send(res, 500, {
      error:
        'The AI server needs an API key. Add GROQ_API_KEY or GEMINI_API_KEY (both free), or ANTHROPIC_API_KEY, to server/.env and restart it.',
    });
  }

  try {
    send(res, 200, await run(route!, await readJson(req)));
  } catch (error) {
    if (error instanceof ProviderError) {
      send(res, error.status, { error: error.message });
    } else if (error instanceof Anthropic.AuthenticationError) {
      send(res, 500, { error: 'The AI server has no valid ANTHROPIC_API_KEY.' });
    } else if (error instanceof Anthropic.RateLimitError) {
      send(res, 429, { error: 'Too many requests right now. Try again in a minute.' });
    } else if (error instanceof Anthropic.APIConnectionError) {
      send(res, 502, { error: "The AI server couldn't reach Claude." });
    } else if (error instanceof Anthropic.APIError) {
      console.error(error);
      send(res, 502, { error: `Claude returned an error (${error.status}).` });
    } else if (error instanceof SyntaxError) {
      send(res, 400, { error: 'Invalid JSON.' });
    } else {
      console.error(error);
      send(res, 500, { error: 'Something went wrong on the AI server. Try again.' });
    }
  }
});

// 0.0.0.0 so phones on the same Wi-Fi can reach it.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI server listening on http://0.0.0.0:${PORT}`);
  if (PROVIDER === 'claude') console.log('Using Claude (claude-opus-5-5).');
  else if (PROVIDER === 'groq')
    console.log(`Using Groq (${GROQ_MODEL})${GEMINI_KEY ? ', with Gemini as backup' : ''}.`);
  else if (PROVIDER === 'gemini') console.log(`Using Google Gemini (${GEMINI_MODELS.join(', then ')}).`);
  else console.warn('No API key set. Add GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY to server/.env.');
});
