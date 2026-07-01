export interface ChatRequestBody {
  response_format?: {
    json_schema?: { schema?: { properties?: Record<string, unknown> } }
  }
  tools?: { type?: string }[]
}

export interface MockContext {
  schemaProps: string[]
  hasWebSearch: boolean
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

const responders: MockResponder[] = [
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
  const properties = body.response_format?.json_schema?.schema?.properties
  const schemaProps = properties ? Object.keys(properties) : []
  const tools = Array.isArray(body.tools) ? body.tools : []
  const hasWebSearch = tools.some(
    (tool) => typeof tool?.type === 'string' && tool.type.includes('web_search'),
  )

  return { schemaProps, hasWebSearch }
}

export function resolveContent(body: ChatRequestBody): string {
  const ctx = extractContext(body)
  const responder = responders.find((r) => r.matches(ctx))

  return responder ? responder.content(ctx) : '{}'
}
