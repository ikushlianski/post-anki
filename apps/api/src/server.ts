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
import {
  handleGetAdminSettings,
  handleUpdateAdminSettings,
} from "./admin-settings/admin-settings.controller.js";
import { resolveRoute } from "./router.js";

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
  const resolved = resolveRoute(method, path);

  if (!resolved) {
    sendError(res, 404, "not_found");
    return;
  }

  const id = resolved.params.id ?? "";

  switch (resolved.name) {
    case "listSubjects":
      return handleListSubjects(res);
    case "createSubject":
      return handleCreateSubject(req, res);
    case "deleteSubject":
      return handleDeleteSubject(res, id);
    case "listCurricula":
      return handleListCurricula(res, url.searchParams.get("subjectId"));
    case "createCurriculum":
      return handleCreateCurriculum(req, res);
    case "getCurriculum":
      return handleGetCurriculum(res, id);
    case "updateCurriculum":
      return handleUpdateCurriculum(req, res, id);
    case "deleteCurriculum":
      return handleDeleteCurriculum(res, id);
    case "confirmCurriculum":
      return handleConfirmCurriculum(res, id);
    case "addSources":
      return handleAddSources(req, res, id);
    case "reparse":
      return handleReparse(res, id);
    case "reorderModules":
      return handleReorderModules(req, res);
    case "createModule":
      return handleCreateModule(req, res, id);
    case "reorderTopics":
      return handleReorderTopics(req, res);
    case "createTopic":
      return handleCreateTopic(req, res, id);
    case "updateModule":
      return handleUpdateModule(req, res, id);
    case "deleteModule":
      return handleDeleteModule(res, id);
    case "updateTopic":
      return handleUpdateTopic(req, res, id);
    case "deleteTopic":
      return handleDeleteTopic(res, id);
    case "listTopicGaps":
      return handleListTopicGaps(res, id);
    case "startProbe":
      return handleStartProbe(req, res, id);
    case "submitProbe":
      return handleSubmitProbe(req, res, id);
    case "declareGap":
      return handleDeclareGap(req, res);
    case "curateGap":
      return handleCurateGap(req, res, id);
    case "dailyPush":
      return handleDailyPush(res, url.searchParams.get("mode"));
    case "decide":
      return handleDecide(req, res);
    case "crossCutting":
      return handleCrossCutting(res);
    case "getAdminSettings":
      return handleGetAdminSettings(res);
    case "updateAdminSettings":
      return handleUpdateAdminSettings(req, res);
  }
}

server.listen(env.PORT, () => {
  log.info({ port: env.PORT }, "api_listening");
});
