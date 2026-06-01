import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const projectId = config.require("projectId");
const region = config.get("region") ?? "europe-west1";
const domain = config.get("domain") ?? "postanki.ilya.online";
const apiDomain = config.get("apiDomain") ?? "api.postanki.ilya.online";
const dailyPushSchedule = config.get("dailyPushSchedule") ?? "0 8 * * *";
const dailyPushTimeZone = config.get("dailyPushTimeZone") ?? "Europe/Warsaw";
const apiSharedSecret = config.getSecret("apiSharedSecret");

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
    description: "Docker images for post-anki bot",
  },
  { dependsOn: enabledApis },
);

const botSa = new gcp.serviceaccount.Account(
  "bot-sa",
  {
    project: projectId,
    accountId: "post-anki-bot",
    displayName: "post-anki Cloud Run SA",
  },
  { dependsOn: enabledApis },
);

const service = new gcp.cloudrun.Service(
  "bot",
  {
    project: projectId,
    location: region,
    name: "post-anki-bot",
    template: {
      spec: {
        serviceAccountName: botSa.email,
        containers: [
          {
            image: "us-docker.pkg.dev/cloudrun/container/hello:latest",
            ports: [{ containerPort: 8080 }],
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
  {
    dependsOn: [registry, botSa, ...enabledApis],
    ignoreChanges: ["template"],
  },
);

new gcp.cloudrun.IamMember("bot-public-invoker", {
  project: projectId,
  location: region,
  service: service.name,
  role: "roles/run.invoker",
  member: "allUsers",
});

const domainMapping = new gcp.cloudrun.DomainMapping(
  "bot-domain",
  {
    project: projectId,
    location: region,
    name: domain,
    metadata: { namespace: projectId },
    spec: { routeName: service.name },
  },
  { dependsOn: [service] },
);

const apiSa = new gcp.serviceaccount.Account(
  "api-sa",
  {
    project: projectId,
    accountId: "post-anki-api",
    displayName: "post-anki API Cloud Run SA",
  },
  { dependsOn: enabledApis },
);

const apiService = new gcp.cloudrun.Service(
  "api",
  {
    project: projectId,
    location: region,
    name: "post-anki-api",
    template: {
      spec: {
        serviceAccountName: apiSa.email,
        containers: [
          {
            image: "us-docker.pkg.dev/cloudrun/container/hello:latest",
            ports: [{ containerPort: 8030 }],
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
  {
    dependsOn: [registry, apiSa, ...enabledApis],
    ignoreChanges: ["template"],
  },
);

// The API is internet-facing but gates every route on the API_SHARED_SECRET
// bearer (see apps/api/src/server.ts); allUsers invoker + app-level auth.
new gcp.cloudrun.IamMember("api-public-invoker", {
  project: projectId,
  location: region,
  service: apiService.name,
  role: "roles/run.invoker",
  member: "allUsers",
});

const apiDomainMapping = new gcp.cloudrun.DomainMapping(
  "api-domain",
  {
    project: projectId,
    location: region,
    name: apiDomain,
    metadata: { namespace: projectId },
    spec: { routeName: apiService.name },
  },
  { dependsOn: [apiService] },
);

// Daily push: fire GET /daily-push once a day. The endpoint selects the day's
// gap across confirmed curricula (selectDailyPush); delivery to the client is a
// later concern. Auth = the same API_SHARED_SECRET bearer the app enforces.
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
      httpMethod: "GET",
      uri: pulumi.interpolate`https://${apiDomain}/daily-push`,
      headers: apiSharedSecret
        ? { Authorization: pulumi.interpolate`Bearer ${apiSharedSecret}` }
        : undefined,
    },
  },
  { dependsOn: [apiService, ...enabledApis] },
);

export const registryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${projectId}/${registry.repositoryId}`;
export const serviceUrl = service.statuses[0].url;
export const botSaEmail = botSa.email;
export const domainMappingRecords = domainMapping.statuses;
export const apiServiceUrl = apiService.statuses[0].url;
export const apiSaEmail = apiSa.email;
export const apiDomainMappingRecords = apiDomainMapping.statuses;
export const dailyPushJobName = dailyPushJob.name;
