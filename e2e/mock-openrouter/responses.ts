export interface ChatRequestBody {
  response_format?: {
    json_schema?: { schema?: { properties?: Record<string, unknown> } }
  }
  tools?: { type?: string }[]
}

export interface MockContext {
  schemaProps: string[]
  hasWebSearch: boolean
  isDocResearchPlan: boolean
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

  // The doc-research plan schema is the only one whose per-module shape
  // tags a level (basic/medium/advanced) — distinguishing it from the
  // pasted-material curriculum schema, which also has a top-level
  // "modules" property but no level field.
  const schemaJson = schema ? JSON.stringify(schema) : ''
  const isDocResearchPlan =
    schemaProps.includes('modules') &&
    schemaJson.includes('"level"') &&
    schemaJson.includes('advanced')

  return { schemaProps, hasWebSearch, isDocResearchPlan }
}

export function resolveContent(body: ChatRequestBody): string {
  const ctx = extractContext(body)
  const responder = responders.find((r) => r.matches(ctx))

  return responder ? responder.content(ctx) : '{}'
}
