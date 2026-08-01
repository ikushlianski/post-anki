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
const docScanSchedule = config.get("docScanSchedule") ?? "0 9 * * 1"; // Monday 09:00
const docScanTimeZone = config.get("docScanTimeZone") ?? "Europe/Warsaw";
// Secret the API's own auth check (server.ts's authorized()) verifies as a
// bearer token — must equal the API's API_SHARED_SECRET (today CI-owned only
// via PROD_API_SHARED_SECRET, not previously in Pulumi config). One-time
// human step: `pulumi config set --secret apiSharedSecret <same value>`.
//
// requireSecret, not getSecret: getSecret returns undefined when that step
// was skipped, and the scheduler job below would then deploy with no
// Authorization header at all — a job that 401s forever with no deploy-time
// signal, so the weekly scan silently never produces a suggestion. This
// fails `pulumi preview`/`up` instead.
const apiSharedSecret = config.requireSecret("apiSharedSecret");
// Neon DIRECT (non-pooled) connection string — Electric's logical-replication
// connection can't go through a connection pooler, unlike apps/api and apps/bot's
// pooled Neon connection. Set via `pulumi config set --secret electricDatabaseUrl <value>`.
const electricDatabaseUrl = config.getSecret("electricDatabaseUrl");

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

// Official electric-sql/electric sync engine image — unlike the other 3 services,
// Electric has no CI build/push step, so Pulumi owns its image directly instead of
// deferring to `gcloud run deploy` with a placeholder. See:
// https://hub.docker.com/r/electricsql/electric
const ELECTRIC_IMAGE = "electricsql/electric:1.7.7";

// Electric's own shape: minScale 1 (it must stay warm for its persistent Postgres
// logical-replication connection — the other services can scale to zero) and Pulumi
// sets its env vars directly (DATABASE_URL) since there's no CI deploy step for it.
// Structure otherwise mirrors runService()'s container/autoscaling shape.
function electricService(
  resource: string,
  name: string,
  saEmail: pulumi.Output<string>,
  port: number,
  databaseUrl: pulumi.Output<string> | undefined,
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
              image: ELECTRIC_IMAGE,
              ports: [{ containerPort: port }],
              resources: { limits: { memory: "512Mi", cpu: "1" } },
              envs: [
                ...(databaseUrl ? [{ name: "DATABASE_URL", value: databaseUrl }] : []),
                { name: "ELECTRIC_PORT", value: `${port}` },
                // Electric's shape API needs either ELECTRIC_SECRET or
                // ELECTRIC_INSECURE=true. We rely on Cloud Run IAM (only apiSa
                // can invoke, see electric-invoker below) rather than an
                // app-level secret — this matches Electric's own guidance to
                // only skip ELECTRIC_SECRET "in development or if you've
                // otherwise secured the Electric API":
                // https://electric.ax/docs/api/config
                { name: "ELECTRIC_INSECURE", value: "true" },
              ],
            },
          ],
        },
        metadata: {
          annotations: {
            "autoscaling.knative.dev/minScale": "1",
            "autoscaling.knative.dev/maxScale": "1",
            // Electric's replication connection does background WAL consumption
            // between HTTP requests — default Cloud Run CPU throttling would
            // starve that work even with minScale: 1, so CPU stays allocated.
            "run.googleapis.com/cpu-throttling": "false",
          },
        },
      },
    },
    { dependsOn: deps },
  );
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

// --- Electric (sync engine) — internal-only, no domain mapping, no public invoker. ---
const electricSa = new gcp.serviceaccount.Account(
  "electric-sa",
  {
    project: projectId,
    accountId: "post-anki-electric",
    displayName: "post-anki Electric Cloud Run SA",
  },
  { dependsOn: enabledApis },
);
const electricServiceInstance = electricService(
  "electric",
  "post-anki-electric",
  electricSa.email,
  3000,
  electricDatabaseUrl,
  [electricSa, ...enabledApis],
);
// Private: only apps/api's SA may invoke Electric directly (apps/api proxies
// shape requests to it with a GCP ID token — no allUsers invoker here).
new gcp.cloudrun.IamMember("electric-invoker", {
  project: projectId,
  location: region,
  service: electricServiceInstance.name,
  role: "roles/run.invoker",
  member: pulumi.interpolate`serviceAccount:${apiSa.email}`,
});

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

// doc-changelog-scan (issue #49) — weekly scan: fire the API's POST
// /doc-scans once a week. Mirrors dailyPushJob's exact shape, gated by the
// API's own API_SHARED_SECRET (sent as a bearer) rather than the bot's
// TELEGRAM_WEBHOOK_SECRET. attemptDeadline is longer than dailyPushJob's 60s
// (worst case: 4 tools x 8s fetch timeout + one LLM call).
const docScanJob = new gcp.cloudscheduler.Job(
  "doc-scan",
  {
    project: projectId,
    region,
    name: "post-anki-doc-scan",
    schedule: docScanSchedule,
    timeZone: docScanTimeZone,
    attemptDeadline: "300s",
    httpTarget: {
      httpMethod: "POST",
      uri: pulumi.interpolate`https://${apiDomain}/doc-scans`,
      headers: { Authorization: pulumi.interpolate`Bearer ${apiSharedSecret}` },
    },
  },
  { dependsOn: [apiService, ...enabledApis] },
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
// Internal Cloud Run URL — apps/api's deploy workflow wires this in as its own
// ELECTRIC_SERVICE_URL env var (that wiring happens in .github/workflows/deploy.yml,
// not here).
export const electricServiceUrl = electricServiceInstance.statuses[0].url;
export const electricSaEmail = electricSa.email;
export const dailyPushJobName = dailyPushJob.name;
export const docScanJobName = docScanJob.name;
