import http from "node:http";
import { loadEnv } from "./shared/env.js";
import { log } from "./shared/log.js";
import { sendError, sendJson } from "./shared/http.js";
import {
  handleCreateSubject,
  handleDeleteSubject,
  handleListSubjects,
} from "./subject/subject.controller.js";
import {
  handleAddSources,
  handleConfirmCurriculum,
  handleCreateCurriculum,
  handleDeleteCurriculum,
  handleGetCurriculum,
  handleListCurricula,
  handleReparse,
  handleUpdateCurriculum,
} from "./curriculum/curriculum.controller.js";
import {
  handleCreateModule,
  handleDeleteModule,
  handleReorderModules,
  handleUpdateModule,
} from "./module/module.controller.js";
import {
  handleCreateTopic,
  handleDeleteTopic,
  handleListTopicGaps,
  handleReorderTopics,
  handleUpdateTopic,
} from "./topic/topic.controller.js";
import {
  handleStartProbe,
  handleSubmitProbe,
} from "./probe/probe.controller.js";
import { handleCurateGap, handleDeclareGap } from "./gap/gap.controller.js";
import { handleDailyPush } from "./push/push.controller.js";
import { handleDecide } from "./decide/decide.controller.js";
import { handleCrossCutting } from "./concern/concern.controller.js";

const env = loadEnv();

function authorized(req: http.IncomingMessage): boolean {
  if (!env.API_SHARED_SECRET) {
    return true;
  }

  return req.headers.authorization === `Bearer ${env.API_SHARED_SECRET}`;
}

const server = http.createServer((req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (method === "GET" && path === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!authorized(req)) {
    sendError(res, 401, "unauthorized");
    return;
  }

  void route(req, res, method, path, url).catch((err) => {
    log.error({ err, method, path }, "request_failed");

    if (!res.headersSent) {
      sendError(res, 500, "internal_error");
    }
  });
});

async function route(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  path: string,
  url: URL,
): Promise<void> {
  if (method === "GET" && path === "/subjects") {
    return handleListSubjects(res);
  }

  if (method === "POST" && path === "/subjects") {
    return handleCreateSubject(req, res);
  }

  const subjectMatch = path.match(/^\/subjects\/([^/]+)$/);

  if (method === "DELETE" && subjectMatch) {
    return handleDeleteSubject(res, subjectMatch[1]!);
  }

  if (method === "GET" && path === "/curricula") {
    return handleListCurricula(res, url.searchParams.get("subjectId"));
  }

  if (method === "POST" && path === "/curricula") {
    return handleCreateCurriculum(req, res);
  }

  const detailMatch = path.match(/^\/curricula\/([^/]+)$/);

  if (method === "GET" && detailMatch) {
    return handleGetCurriculum(res, detailMatch[1]!);
  }

  if (method === "PATCH" && detailMatch) {
    return handleUpdateCurriculum(req, res, detailMatch[1]!);
  }

  if (method === "DELETE" && detailMatch) {
    return handleDeleteCurriculum(res, detailMatch[1]!);
  }

  const confirmMatch = path.match(/^\/curricula\/([^/]+)\/confirm$/);

  if (method === "POST" && confirmMatch) {
    return handleConfirmCurriculum(res, confirmMatch[1]!);
  }

  const sourcesMatch = path.match(/^\/curricula\/([^/]+)\/sources$/);

  if (method === "POST" && sourcesMatch) {
    return handleAddSources(req, res, sourcesMatch[1]!);
  }

  const reparseMatch = path.match(/^\/curricula\/([^/]+)\/reparse$/);

  if (method === "POST" && reparseMatch) {
    return handleReparse(res, reparseMatch[1]!);
  }

  const modulesReorderMatch = path.match(/^\/curricula\/([^/]+)\/modules\/order$/);

  if (method === "PATCH" && modulesReorderMatch) {
    return handleReorderModules(req, res);
  }

  const modulesMatch = path.match(/^\/curricula\/([^/]+)\/modules$/);

  if (method === "POST" && modulesMatch) {
    return handleCreateModule(req, res, modulesMatch[1]!);
  }

  const topicsReorderMatch = path.match(/^\/modules\/([^/]+)\/topics\/order$/);

  if (method === "PATCH" && topicsReorderMatch) {
    return handleReorderTopics(req, res);
  }

  const topicsCreateMatch = path.match(/^\/modules\/([^/]+)\/topics$/);

  if (method === "POST" && topicsCreateMatch) {
    return handleCreateTopic(req, res, topicsCreateMatch[1]!);
  }

  const moduleMatch = path.match(/^\/modules\/([^/]+)$/);

  if (method === "PATCH" && moduleMatch) {
    return handleUpdateModule(req, res, moduleMatch[1]!);
  }

  if (method === "DELETE" && moduleMatch) {
    return handleDeleteModule(res, moduleMatch[1]!);
  }

  const topicMatch = path.match(/^\/topics\/([^/]+)$/);

  if (method === "PATCH" && topicMatch) {
    return handleUpdateTopic(req, res, topicMatch[1]!);
  }

  if (method === "DELETE" && topicMatch) {
    return handleDeleteTopic(res, topicMatch[1]!);
  }

  const gapsListMatch = path.match(/^\/topics\/([^/]+)\/gaps$/);

  if (method === "GET" && gapsListMatch) {
    return handleListTopicGaps(res, gapsListMatch[1]!);
  }

  const probeMatch = path.match(/^\/topics\/([^/]+)\/probe$/);

  if (method === "POST" && probeMatch) {
    return handleStartProbe(req, res, probeMatch[1]!);
  }

  const answerMatch = path.match(/^\/topics\/([^/]+)\/probe\/answer$/);

  if (method === "POST" && answerMatch) {
    return handleSubmitProbe(req, res, answerMatch[1]!);
  }

  if (method === "POST" && path === "/gaps") {
    return handleDeclareGap(req, res);
  }

  const gapMatch = path.match(/^\/gaps\/([^/]+)$/);

  if (method === "PATCH" && gapMatch) {
    return handleCurateGap(req, res, gapMatch[1]!);
  }

  if (method === "GET" && path === "/daily-push") {
    return handleDailyPush(res, url.searchParams.get("mode"));
  }

  if (method === "POST" && path === "/decide") {
    return handleDecide(req, res);
  }

  if (method === "GET" && path === "/cross-cutting") {
    return handleCrossCutting(res);
  }

  sendError(res, 404, "not_found");
}

server.listen(env.PORT, () => {
  log.info({ port: env.PORT }, "api_listening");
});
