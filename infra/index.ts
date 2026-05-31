import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const projectId = config.require("projectId");
const region = config.get("region") ?? "europe-west1";
const domain = config.get("domain") ?? "postanki.ilya.online";

const requiredApis = [
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "iamcredentials.googleapis.com",
  "sts.googleapis.com",
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

export const registryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${projectId}/${registry.repositoryId}`;
export const serviceUrl = service.statuses[0].url;
export const botSaEmail = botSa.email;
export const domainMappingRecords = domainMapping.statuses;
