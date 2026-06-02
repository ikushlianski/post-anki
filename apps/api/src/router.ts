export type RouteName =
  | "listSubjects"
  | "createSubject"
  | "deleteSubject"
  | "listCurricula"
  | "createCurriculum"
  | "getCurriculum"
  | "updateCurriculum"
  | "deleteCurriculum"
  | "confirmCurriculum"
  | "addSources"
  | "reparse"
  | "reorderModules"
  | "createModule"
  | "reorderTopics"
  | "createTopic"
  | "updateModule"
  | "deleteModule"
  | "updateTopic"
  | "deleteTopic"
  | "listTopicGaps"
  | "startProbe"
  | "submitProbe"
  | "declareGap"
  | "curateGap"
  | "dailyPush"
  | "decide"
  | "crossCutting";

export interface ResolvedRoute {
  name: RouteName;
  params: Record<string, string>;
}

interface RouteDef {
  method: string;
  pattern: string | RegExp;
  name: RouteName;
  param?: string;
}

const ROUTES: RouteDef[] = [
  { method: "GET", pattern: "/subjects", name: "listSubjects" },
  { method: "POST", pattern: "/subjects", name: "createSubject" },
  { method: "DELETE", pattern: /^\/subjects\/([^/]+)$/, name: "deleteSubject", param: "id" },
  { method: "GET", pattern: "/curricula", name: "listCurricula" },
  { method: "POST", pattern: "/curricula", name: "createCurriculum" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/confirm$/, name: "confirmCurriculum", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/sources$/, name: "addSources", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/reparse$/, name: "reparse", param: "id" },
  { method: "PATCH", pattern: /^\/curricula\/([^/]+)\/modules\/order$/, name: "reorderModules", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/modules$/, name: "createModule", param: "id" },
  { method: "GET", pattern: /^\/curricula\/([^/]+)$/, name: "getCurriculum", param: "id" },
  { method: "PATCH", pattern: /^\/curricula\/([^/]+)$/, name: "updateCurriculum", param: "id" },
  { method: "DELETE", pattern: /^\/curricula\/([^/]+)$/, name: "deleteCurriculum", param: "id" },
  { method: "PATCH", pattern: /^\/modules\/([^/]+)\/topics\/order$/, name: "reorderTopics", param: "id" },
  { method: "POST", pattern: /^\/modules\/([^/]+)\/topics$/, name: "createTopic", param: "id" },
  { method: "PATCH", pattern: /^\/modules\/([^/]+)$/, name: "updateModule", param: "id" },
  { method: "DELETE", pattern: /^\/modules\/([^/]+)$/, name: "deleteModule", param: "id" },
  { method: "GET", pattern: /^\/topics\/([^/]+)\/gaps$/, name: "listTopicGaps", param: "id" },
  { method: "POST", pattern: /^\/topics\/([^/]+)\/probe\/answer$/, name: "submitProbe", param: "id" },
  { method: "POST", pattern: /^\/topics\/([^/]+)\/probe$/, name: "startProbe", param: "id" },
  { method: "PATCH", pattern: /^\/topics\/([^/]+)$/, name: "updateTopic", param: "id" },
  { method: "DELETE", pattern: /^\/topics\/([^/]+)$/, name: "deleteTopic", param: "id" },
  { method: "POST", pattern: "/gaps", name: "declareGap" },
  { method: "PATCH", pattern: /^\/gaps\/([^/]+)$/, name: "curateGap", param: "id" },
  { method: "GET", pattern: "/daily-push", name: "dailyPush" },
  { method: "POST", pattern: "/decide", name: "decide" },
  { method: "GET", pattern: "/cross-cutting", name: "crossCutting" },
];

export function resolveRoute(method: string, path: string): ResolvedRoute | null {
  for (const def of ROUTES) {
    if (def.method !== method) {
      continue;
    }

    if (typeof def.pattern === "string") {
      if (def.pattern === path) {
        return { name: def.name, params: {} };
      }

      continue;
    }

    const match = path.match(def.pattern);

    if (match) {
      return { name: def.name, params: { [def.param!]: match[1]! } };
    }
  }

  return null;
}
