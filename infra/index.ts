import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const projectId = config.require("projectId");
const region = config.get("region") ?? "europe-west1";
const domain = config.get("domain") ?? "postanki.ilya.online";
const botDomain = config.get("botDomain") ?? "bot.postanki.ilya.online";
const apiDomain = config.get("apiDomain") ?? "api.postanki.ilya.online";
const dailyPushSchedule = config.get("dailyPushSchedule") ?? "0 8 * * *";
const dailyPushTimeZone = config.get("dailyPushTimeZone") ?? "Europe/Warsaw";
// Secret the bot's POST /push checks (must equal the bot's TELEGRAM_WEBHOOK_SECRET).
const telegramWebhookSecret = config.getSecret("telegramWebhookSecret");

const requiredApis = [
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "iamcredentials.googleapis.com",
  "sts.googleapis.com",
  "cloudscheduler.googleapis.com",
];

const enabledApis = requiredApis.map(
  (service) =>
    new gcp.projects.Service(service.replace(/\./g, "-"), {
      project: projectId,
      service,
      disableOnDestroy: false,
    }),
);

const registry = new gcp.artifactregistry.Repository(
  "bot-images",
  {
    project: projectId,
    location: region,
    repositoryId: "post-anki",
    format: "DOCKER",
    description: "Docker images for post-anki services",
    cleanupPolicies: [
      {
        id: "keep-recent",
        action: "KEEP",
        mostRecentVersions: { keepCount: 2 },
      },
      {
        id: "delete-old",
        action: "DELETE",
        condition: { olderThan: "14d" },
      },
    ],
  },
  { dependsOn: enabledApis },
);

const PLACEHOLDER_IMAGE = "us-docker.pkg.dev/cloudrun/container/hello:latest";

// Each Cloud Run service is a shell: Pulumi owns the service/SA/domain/invoker,
// while `gcloud run deploy` (CI) owns the real image + env vars. Hence the
// placeholder image and ignoreChanges: ["template"].
function runService(
  resource: string,
  name: string,
  saEmail: pulumi.Output<string>,
  port: number,
  deps: pulumi.Resource[],
): gcp.cloudrun.Service {
  return new gcp.cloudrun.Service(
    resource,
    {
      project: projectId,
      location: region,
      name,
      template: {
        spec: {
          serviceAccountName: saEmail,
          containers: [
            {
              image: PLACEHOLDER_IMAGE,
              ports: [{ containerPort: port }],
              resources: { limits: { memory: "512Mi", cpu: "1" } },
            },
          ],
        },
        metadata: {
          annotations: {
            "autoscaling.knative.dev/minScale": "0",
            "autoscaling.knative.dev/maxScale": "1",
          },
        },
      },
    },
    { dependsOn: deps, ignoreChanges: ["template"] },
  );
}

function publicInvoker(resource: string, service: gcp.cloudrun.Service): void {
  new gcp.cloudrun.IamMember(resource, {
    project: projectId,
    location: region,
    service: service.name,
    role: "roles/run.invoker",
    member: "allUsers",
  });
}

function domainMapping(
  resource: string,
  host: string,
  service: gcp.cloudrun.Service,
): gcp.cloudrun.DomainMapping {
  return new gcp.cloudrun.DomainMapping(
    resource,
    {
      project: projectId,
      location: region,
      name: host,
      metadata: { namespace: projectId },
      spec: { routeName: service.name },
    },
    { dependsOn: [service] },
  );
}

// --- Web (TanStack Start SSR) — the primary face, at the root domain. ---
const webSa = new gcp.serviceaccount.Account(
  "web-sa",
  { project: projectId, accountId: "post-anki-web", displayName: "post-anki Web Cloud Run SA" },
  { dependsOn: enabledApis },
);
const webService = runService("web", "post-anki-web", webSa.email, 8080, [
  registry,
  webSa,
  ...enabledApis,
]);
publicInvoker("web-public-invoker", webService);
const webDomainMapping = domainMapping("web-domain", domain, webService);

// --- Bot (Telegram webhook + daily /push), at the bot subdomain. ---
const botSa = new gcp.serviceaccount.Account(
  "bot-sa",
  { project: projectId, accountId: "post-anki-bot", displayName: "post-anki Bot Cloud Run SA" },
  { dependsOn: enabledApis },
);
const botService = runService("bot", "post-anki-bot", botSa.email, 8080, [
  registry,
  botSa,
  ...enabledApis,
]);
publicInvoker("bot-public-invoker", botService);
const botDomainMapping = domainMapping("bot-domain", botDomain, botService);

// --- API (domain service), at the api subdomain. ---
const apiSa = new gcp.serviceaccount.Account(
  "api-sa",
  { project: projectId, accountId: "post-anki-api", displayName: "post-anki API Cloud Run SA" },
  { dependsOn: enabledApis },
);
const apiService = runService("api", "post-anki-api", apiSa.email, 8030, [
  registry,
  apiSa,
  ...enabledApis,
]);
// Internet-facing but every route is gated on the API_SHARED_SECRET bearer
// (apps/api/src/server.ts): allUsers invoker + app-level auth.
publicInvoker("api-public-invoker", apiService);
const apiDomainMapping = domainMapping("api-domain", apiDomain, apiService);

// Daily push: fire the BOT's POST /push once a day. The bot fetches the day's
// question from the API and sends it to the owner on Telegram. Gated by the
// bot's TELEGRAM_WEBHOOK_SECRET (sent as a bearer).
const dailyPushJob = new gcp.cloudscheduler.Job(
  "daily-push",
  {
    project: projectId,
    region,
    name: "post-anki-daily-push",
    schedule: dailyPushSchedule,
    timeZone: dailyPushTimeZone,
    attemptDeadline: "60s",
    httpTarget: {
      httpMethod: "POST",
      uri: pulumi.interpolate`https://${botDomain}/push`,
      headers: telegramWebhookSecret
        ? { Authorization: pulumi.interpolate`Bearer ${telegramWebhookSecret}` }
        : undefined,
    },
  },
  { dependsOn: [botService, ...enabledApis] },
);

export const registryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${projectId}/${registry.repositoryId}`;
export const webServiceUrl = webService.statuses[0].url;
export const webSaEmail = webSa.email;
export const webDomainMappingRecords = webDomainMapping.statuses;
export const botServiceUrl = botService.statuses[0].url;
export const botSaEmail = botSa.email;
export const botDomainMappingRecords = botDomainMapping.statuses;
export const apiServiceUrl = apiService.statuses[0].url;
export const apiSaEmail = apiSa.email;
export const apiDomainMappingRecords = apiDomainMapping.statuses;
export const dailyPushJobName = dailyPushJob.name;
