export interface ChatRequestBody {
  response_format?: {
    json_schema?: { schema?: { properties?: Record<string, unknown> } }
  }
  tools?: { type?: string }[]
  messages?: { role?: string; content?: string }[]
}

export interface MockContext {
  schemaProps: string[]
  hasWebSearch: boolean
  isDocResearchPlan: boolean
  lastUserMessage: string
}

export interface MockResponder {
  name: string
  matches: (ctx: MockContext) => boolean
  content: (ctx: MockContext) => string
}

export const CURRICULUM_STUB_PLAN = {
  modules: [
    {
      title: 'Stubbed Module — Foundations',
      topics: [
        {
          title: 'Stubbed Topic — Module Boundaries',
          summary: 'Why clear module boundaries shape later decisions.',
          suggestedDepth: 'working',
        },
      ],
    },
    {
      title: 'Stubbed Module — Tradeoffs',
      topics: [],
    },
  ],
}

export const DOC_RESEARCH_STUB_PLAN = {
  modules: [
    {
      title: 'Stubbed Doc-Research Module — Basics',
      level: 'basic',
      topics: [
        {
          title: 'Stubbed Basic Topic — Getting Started',
          summary: 'What a newcomer needs on day one.',
          suggestedDepth: 'working',
        },
      ],
    },
    {
      title: 'Stubbed Doc-Research Module — Everyday Tradeoffs',
      level: 'medium',
      topics: [
        {
          title: 'Stubbed Medium Topic — Common Patterns',
          summary: 'Real-world tradeoffs beyond the basics.',
          suggestedDepth: 'working',
        },
      ],
    },
    {
      title: 'Stubbed Doc-Research Module — Internals',
      level: 'advanced',
      topics: [
        {
          title: 'Stubbed Advanced Topic — Edge Cases',
          summary: 'Non-obvious design decisions.',
          suggestedDepth: 'deep',
        },
      ],
    },
  ],
}

// Batch quiz generation (packages/shared's generatedProbeBatchSchema, called
// from apps/api/src/probe-session/probe-session.generate.ts). One single- and
// one multi-select question, deterministic so quiz e2e tests can assert on
// exact prompt/option text and on the persisted question `type`.
export const PROBE_QUIZ_STUB_BATCH = {
  questions: [
    {
      prompt: 'Stubbed Question — Is caching always safe to apply blindly?',
      options: ['True', 'False'],
      correctAnswerIndex: 1,
      correctAnswerIndexes: null,
      type: 'single',
      difficulty: 'easy',
      format: 'true_false',
      gapLabel: null,
      topicTitle: null,
    },
    {
      prompt: 'Stubbed Question — Select every statement that is true about idempotency keys.',
      options: [
        'Stub Option A — safe to retry',
        'Stub Option B — always slower',
        'Stub Option C — deduplicates side effects',
        'Stub Option D — requires no storage',
      ],
      correctAnswerIndex: 0,
      correctAnswerIndexes: [0, 2],
      type: 'multi',
      difficulty: 'medium',
      format: 'mcq',
      gapLabel: null,
      topicTitle: null,
    },
  ],
}

// Socratic turn evaluation (packages/shared's socraticEvalSchema, called from
// apps/api/src/socratic/socratic.service.ts). Deterministic "correct" by
// default so the happy-path chat test (advance + next-turn) doesn't depend on
// real LLM judgment; the learner's answer text can opt into the other two
// degrees via a magic marker, for tests that want a specific escalation path.
export const SOCRATIC_EVAL_STUB_CORRECT = {
  degree: 'correct',
  whatWasRight: 'the whole explanation holds up',
  pointOut: '',
  explanation: '',
  correctAnswer: 'Stubbed correct-answer text.',
}

export const SOCRATIC_EVAL_STUB_SLIGHTLY_WRONG = {
  degree: 'slightly_wrong',
  whatWasRight: 'the core mechanism is right',
  pointOut: 'the detail about timing is off',
  explanation: '',
  correctAnswer: 'Stubbed correct-answer text.',
}

export const SOCRATIC_EVAL_STUB_MOSTLY_WRONG = {
  degree: 'mostly_wrong',
  whatWasRight: '',
  pointOut: '',
  explanation: 'Stubbed hint text pointing toward the right idea.',
  correctAnswer: 'Stubbed correct-answer text.',
}

const SOCRATIC_MARKER_SLIGHTLY_WRONG = 'STUB_DEGREE_SLIGHTLY_WRONG'
const SOCRATIC_MARKER_MOSTLY_WRONG = 'STUB_DEGREE_MOSTLY_WRONG'

// Single-question generation (apps/api/src/probe/probe-question.ts's
// generatedQuestionSchema — {prompt, options, correctAnswerIndex} only, no
// "questions" wrapper). Used both by the old quick_test opener flow and by
// every new Socratic turn's prompt (buildProbeQuestionForGap → mentor-ask
// agent). Without a responder here the mock falls through to '{}', which
// fails strict schema validation and forces several retries before the
// app's own fallback kicks in — turning every Socratic turn open into a
// multi-second (sometimes 30s+) stall. A direct stub avoids that entirely.
export const SINGLE_QUESTION_STUB = {
  prompt: 'Stubbed Socratic prompt — explain this concept in your own words.',
  options: ['Stub Option A', 'Stub Option B'],
  correctAnswerIndex: 0,
}

const responders: MockResponder[] = [
  {
    name: 'doc-research-plan',
    matches: (ctx) => ctx.isDocResearchPlan,
    content: () => JSON.stringify(DOC_RESEARCH_STUB_PLAN),
  },
  {
    name: 'curriculum',
    matches: (ctx) => ctx.schemaProps.includes('modules'),
    content: () => JSON.stringify(CURRICULUM_STUB_PLAN),
  },
  {
    name: 'probe-quiz-batch',
    matches: (ctx) => ctx.schemaProps.includes('questions'),
    content: () => JSON.stringify(PROBE_QUIZ_STUB_BATCH),
  },
  {
    name: 'socratic-eval',
    matches: (ctx) => ctx.schemaProps.includes('whatWasRight'),
    content: (ctx) => {
      if (ctx.lastUserMessage.includes(SOCRATIC_MARKER_SLIGHTLY_WRONG)) {
        return JSON.stringify(SOCRATIC_EVAL_STUB_SLIGHTLY_WRONG)
      }

      if (ctx.lastUserMessage.includes(SOCRATIC_MARKER_MOSTLY_WRONG)) {
        return JSON.stringify(SOCRATIC_EVAL_STUB_MOSTLY_WRONG)
      }

      return JSON.stringify(SOCRATIC_EVAL_STUB_CORRECT)
    },
  },
  {
    name: 'single-question-ask',
    matches: (ctx) =>
      ctx.schemaProps.includes('correctAnswerIndex') &&
      ctx.schemaProps.includes('prompt') &&
      !ctx.schemaProps.includes('questions') &&
      !ctx.schemaProps.includes('gapLabel'),
    content: () => JSON.stringify(SINGLE_QUESTION_STUB),
  },
  {
    name: 'web-grounding',
    matches: (ctx) => ctx.hasWebSearch,
    content: () => 'Stubbed grounding notes for a senior architecture probe.',
  },
]

export function extractContext(body: ChatRequestBody): MockContext {
  const schema = body.response_format?.json_schema?.schema
  const properties = schema?.properties
  const schemaProps = properties ? Object.keys(properties) : []
  const tools = Array.isArray(body.tools) ? body.tools : []
  const hasWebSearch = tools.some(
    (tool) => typeof tool?.type === 'string' && tool.type.includes('web_search'),
  )
  const messages = Array.isArray(body.messages) ? body.messages : []
  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  // The doc-research plan schema is the only one whose per-module shape
  // tags a level (basic/medium/advanced) — distinguishing it from the
  // pasted-material curriculum schema, which also has a top-level
  // "modules" property but no level field.
  const schemaJson = schema ? JSON.stringify(schema) : ''
  const isDocResearchPlan =
    schemaProps.includes('modules') &&
    schemaJson.includes('"level"') &&
    schemaJson.includes('advanced')

  return { schemaProps, hasWebSearch, isDocResearchPlan, lastUserMessage }
}

export function resolveContent(body: ChatRequestBody): string {
  const ctx = extractContext(body)
  const responder = responders.find((r) => r.matches(ctx))

  return responder ? responder.content(ctx) : '{}'
}
