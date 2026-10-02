import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Shared, reusable ECS Fargate cluster + ALB for every personal, single-user app on this AWS
// account — not just post-anki. One cluster, one ALB, one wildcard cert, host-header routing.
// Adding a second app means one more `addFargateHttpService(...)` call below, reusing every
// shared resource in this file. Electric itself still stays one service per Postgres database
// (Electric's own documented limit) — a future app on a *different* database adds its own
// electric-sync service the same way `electric-sync` is added here, not a new cluster/ALB.
// This stack owns AWS only — the live GCP Cloud Run deployment (infra/) is being retired, but is
// left running untouched here; decommissioning it is a separate, manual step once this stack is
// deployed and verified.

const config = new pulumi.Config();

const domain = config.require("domain"); // e.g. ilya.online — the shared Route53 zone every app's hostname lives under
const apiHostname = config.get("apiHostname") ?? `api.postanki.${domain}`;
const webHostname = config.get("webHostname") ?? `postanki.${domain}`;
const botHostname = config.get("botHostname") ?? `bot.postanki.${domain}`;

const databaseUrl = config.requireSecret("databaseUrl"); // Neon pooled — for the api service
const electricDatabaseUrl = config.requireSecret("electricDatabaseUrl"); // Neon direct — logical replication
const openrouterApiKey = config.requireSecret("openrouterApiKey");
const apiSharedSecret = config.requireSecret("apiSharedSecret");
const telegramBotToken = config.requireSecret("telegramBotToken");
const telegramWebhookSecret = config.requireSecret("telegramWebhookSecret");
const ownerTelegramChatId = config.requireSecret("ownerTelegramChatId");

const ELECTRIC_IMAGE = "electricsql/electric:1.7.7";
const ELECTRIC_PORT = 3000;

// --- Networking: reuse the account's default VPC and public subnets, no NAT gateway ---

const defaultVpc = aws.ec2.getVpcOutput({ default: true });
const publicSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [defaultVpc.id] }],
});

const zone = aws.route53.getZoneOutput({ name: domain });

// --- Security groups: ALB public, every app service reachable only from the ALB ---

const albSg = new aws.ec2.SecurityGroup("alb-sg", {
  vpcId: defaultVpc.id,
  description: "shared ALB — public ingress on 80/443, fronts every app on this account",
  ingress: [
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
  ],
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
});

// Electric is never public and never reachable from the ALB — only the api service may reach it.
const electricSg = new aws.ec2.SecurityGroup("electric-sg", {
  vpcId: defaultVpc.id,
  description: "post-anki electric-sync service — reachable only from the api service",
  ingress: [], // populated below once the api service's own SG exists
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
});

// --- ECS cluster (shared by every service this stack provisions, now and later) ---

const cluster = new aws.ecs.Cluster("shared-cluster", {});

// --- Cloud Map namespace for service discovery (api -> electric-sync, by internal DNS) ---

const serviceDiscoveryNamespace = new aws.servicediscovery.PrivateDnsNamespace(
  "post-anki-namespace",
  { vpc: defaultVpc.id, name: "post-anki.internal" }
);

const electricDiscoveryService = new aws.servicediscovery.Service("electric-sync-discovery", {
  name: "electric-sync",
  dnsConfig: {
    namespaceId: serviceDiscoveryNamespace.id,
    dnsRecords: [{ type: "A", ttl: 10 }],
    routingPolicy: "MULTIVALUE",
  },
});

// --- Shared ALB, one wildcard cert covering any hostname under the shared zone ---

const alb = new aws.lb.LoadBalancer("shared-alb", {
  loadBalancerType: "application",
  securityGroups: [albSg.id],
  subnets: publicSubnets.ids,
});

const cert = new aws.acm.Certificate("shared-wildcard-cert", {
  domainName: `*.${domain}`,
  subjectAlternativeNames: [domain],
  validationMethod: "DNS",
});

const certValidationRecords = cert.domainValidationOptions.apply((opts) =>
  opts.map(
    (opt, i) =>
      new aws.route53.Record(`cert-validation-${i}`, {
        zoneId: zone.zoneId,
        name: opt.resourceRecordName,
        type: opt.resourceRecordType,
        records: [opt.resourceRecordValue],
        ttl: 300,
        allowOverwrite: true,
      })
  )
);

const certValidation = new aws.acm.CertificateValidation("shared-wildcard-cert-validation", {
  certificateArn: cert.arn,
  validationRecordFqdns: certValidationRecords.apply((records) => records.map((r) => r.fqdn)),
});

// Plain HTTP just redirects to HTTPS — every real listener rule lives on 443.
new aws.lb.Listener("http-listener", {
  loadBalancerArn: alb.arn,
  port: 80,
  protocol: "HTTP",
  defaultActions: [
    {
      type: "redirect",
      redirect: { protocol: "HTTPS", port: "443", statusCode: "HTTP_301" },
    },
  ],
});

const httpsListener = new aws.lb.Listener("https-listener", {
  loadBalancerArn: alb.arn,
  port: 443,
  protocol: "HTTPS",
  certificateArn: certValidation.certificateArn,
  defaultActions: [
    {
      type: "fixed-response",
      fixedResponse: { contentType: "text/plain", statusCode: "404", messageBody: "not found" },
    },
  ],
});

// --- IAM: one shared task execution role (pull image, write logs, read SSM secrets) ---

const executionRole = new aws.iam.Role("shared-task-execution-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
      },
    ],
  }),
});

new aws.iam.RolePolicyAttachment("shared-task-execution-role-policy", {
  role: executionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// --- Secrets: SSM SecureString params, resolved by ECS at task launch (never in plain env) ---

const databaseUrlParam = new aws.ssm.Parameter("database-url", { type: "SecureString", value: databaseUrl });
const electricDatabaseUrlParam = new aws.ssm.Parameter("electric-database-url", {
  type: "SecureString",
  value: electricDatabaseUrl,
});
const openrouterApiKeyParam = new aws.ssm.Parameter("openrouter-api-key", {
  type: "SecureString",
  value: openrouterApiKey,
});
const apiSharedSecretParam = new aws.ssm.Parameter("api-shared-secret", {
  type: "SecureString",
  value: apiSharedSecret,
});
const telegramBotTokenParam = new aws.ssm.Parameter("telegram-bot-token", {
  type: "SecureString",
  value: telegramBotToken,
});
const telegramWebhookSecretParam = new aws.ssm.Parameter("telegram-webhook-secret", {
  type: "SecureString",
  value: telegramWebhookSecret,
});
const ownerTelegramChatIdParam = new aws.ssm.Parameter("owner-telegram-chat-id", {
  type: "SecureString",
  value: ownerTelegramChatId,
});

const allSsmParamArns = [
  databaseUrlParam.arn,
  electricDatabaseUrlParam.arn,
  openrouterApiKeyParam.arn,
  apiSharedSecretParam.arn,
  telegramBotTokenParam.arn,
  telegramWebhookSecretParam.arn,
  ownerTelegramChatIdParam.arn,
];

new aws.iam.RolePolicy("shared-task-execution-role-ssm-read", {
  role: executionRole.id,
  policy: pulumi
    .all(allSsmParamArns)
    .apply((arns) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: "ssm:GetParameters", Resource: arns }],
      })
    ),
});

// --- electric-sync service (shared, reusable — any future app on this same DB reuses it) ---
//
// No GCP IAM equivalent exists on AWS, and the api's electric-proxy.service.ts only knows how to
// authenticate via Google's IAM identity tokens or skip auth entirely (ELECTRIC_AUTH_MODE=none).
// Security here comes from the security groups alone (electric-sg only accepts traffic from
// api-sg) — the same trust model GCP's own Electric Cloud Run service already used
// (ELECTRIC_INSECURE=true, gated on Cloud Run IAM instead of a security group).

const electricLogGroup = new aws.cloudwatch.LogGroup("electric-sync-logs", { retentionInDays: 14 });

const electricTaskDefinition = new aws.ecs.TaskDefinition("electric-sync-task", {
  family: "post-anki-electric-sync",
  cpu: "256",
  memory: "512",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: executionRole.arn,
  containerDefinitions: pulumi.jsonStringify([
    {
      name: "electric-sync",
      image: ELECTRIC_IMAGE,
      portMappings: [{ containerPort: ELECTRIC_PORT }],
      environment: [
        { name: "ELECTRIC_PORT", value: `${ELECTRIC_PORT}` },
        { name: "ELECTRIC_INSECURE", value: "true" },
      ],
      secrets: [{ name: "DATABASE_URL", valueFrom: electricDatabaseUrlParam.arn }],
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": electricLogGroup.name,
          "awslogs-region": aws.getRegionOutput().name,
          "awslogs-stream-prefix": "electric-sync",
        },
      },
    },
  ]),
});

const electricService = new aws.ecs.Service("electric-sync-service", {
  cluster: cluster.arn,
  desiredCount: 1,
  launchType: "FARGATE",
  taskDefinition: electricTaskDefinition.arn,
  networkConfiguration: {
    subnets: publicSubnets.ids,
    securityGroups: [electricSg.id],
    assignPublicIp: true,
  },
  serviceRegistries: { registryArn: electricDiscoveryService.arn },
});

// --- Reusable helper: one HTTP-facing Fargate service, its own ECR repo, SG, target group, ---
// --- and ALB host-header rule. Every app (this one's api/web/bot, or a future app) is just a ---
// --- call to this function — nothing shared above needs to change to add another one.        ---

let nextListenerPriority = 100;

function addFargateHttpService(appArgs: {
  name: string;
  hostname: string;
  containerPort: number;
  healthCheckPath: string;
  environment: { name: string; value: string }[];
  secrets: { name: string; valueFrom: pulumi.Input<string> }[];
  extraIngressFromSg?: aws.ec2.SecurityGroup;
}) {
  const sg = new aws.ec2.SecurityGroup(`${appArgs.name}-sg`, {
    vpcId: defaultVpc.id,
    description: `${appArgs.name} service — reachable only from the shared ALB`,
    ingress: [
      {
        protocol: "tcp",
        fromPort: appArgs.containerPort,
        toPort: appArgs.containerPort,
        securityGroups: [albSg.id],
      },
    ],
    egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
  });

  const repo = new aws.ecr.Repository(`${appArgs.name}-repo`, {
    name: `post-anki-${appArgs.name}`,
    forceDelete: true,
  });

  const logGroup = new aws.cloudwatch.LogGroup(`${appArgs.name}-logs`, { retentionInDays: 14 });

  const targetGroup = new aws.lb.TargetGroup(`${appArgs.name}-tg`, {
    port: appArgs.containerPort,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: defaultVpc.id,
    healthCheck: { path: appArgs.healthCheckPath, matcher: "200" },
  });

  new aws.lb.ListenerRule(`${appArgs.name}-rule`, {
    listenerArn: httpsListener.arn,
    priority: nextListenerPriority++,
    actions: [{ type: "forward", targetGroupArn: targetGroup.arn }],
    conditions: [{ hostHeader: { values: [appArgs.hostname] } }],
  });

  new aws.route53.Record(`${appArgs.name}-dns`, {
    zoneId: zone.zoneId,
    name: appArgs.hostname,
    type: "A",
    aliases: [{ name: alb.dnsName, zoneId: alb.zoneId, evaluateTargetHealth: true }],
  });

  const taskDefinition = new aws.ecs.TaskDefinition(`${appArgs.name}-task`, {
    family: `post-anki-${appArgs.name}`,
    cpu: "256",
    memory: "512",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    executionRoleArn: executionRole.arn,
    containerDefinitions: pulumi.jsonStringify([
      {
        name: appArgs.name,
        image: pulumi.interpolate`${repo.repositoryUrl}:latest`,
        portMappings: [{ containerPort: appArgs.containerPort }],
        environment: appArgs.environment,
        secrets: appArgs.secrets,
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroup.name,
            "awslogs-region": aws.getRegionOutput().name,
            "awslogs-stream-prefix": appArgs.name,
          },
        },
      },
    ]),
  });

  const service = new aws.ecs.Service(`${appArgs.name}-service`, {
    cluster: cluster.arn,
    desiredCount: 1,
    launchType: "FARGATE",
    taskDefinition: taskDefinition.arn,
    networkConfiguration: {
      subnets: publicSubnets.ids,
      securityGroups: [sg.id],
      assignPublicIp: true,
    },
    loadBalancers: [{ targetGroupArn: targetGroup.arn, containerName: appArgs.name, containerPort: appArgs.containerPort }],
  });

  return { sg, repo, service };
}

// --- api service ---

const API_PORT = 8030;

const apiFargateService = addFargateHttpService({
  name: "api",
  hostname: apiHostname,
  containerPort: API_PORT,
  healthCheckPath: "/_healthz",
  environment: [
    { name: "PORT", value: `${API_PORT}` },
    { name: "ELECTRIC_SERVICE_URL", value: `http://electric-sync.post-anki.internal:${ELECTRIC_PORT}` },
    { name: "ELECTRIC_AUTH_MODE", value: "none" },
  ],
  secrets: [
    { name: "DATABASE_URL", valueFrom: databaseUrlParam.arn },
    { name: "OPENROUTER_API_KEY", valueFrom: openrouterApiKeyParam.arn },
    { name: "API_SHARED_SECRET", valueFrom: apiSharedSecretParam.arn },
  ],
});

// Electric only accepts traffic from the api service's own SG, created above.
new aws.ec2.SecurityGroupRule("electric-ingress-from-api", {
  type: "ingress",
  securityGroupId: electricSg.id,
  protocol: "tcp",
  fromPort: ELECTRIC_PORT,
  toPort: ELECTRIC_PORT,
  sourceSecurityGroupId: apiFargateService.sg.id,
});

// --- web service (TanStack Start SSR, Nitro node-server) ---

const WEB_PORT = 8080;

const webFargateService = addFargateHttpService({
  name: "web",
  hostname: webHostname,
  containerPort: WEB_PORT,
  healthCheckPath: "/",
  environment: [
    { name: "PORT", value: `${WEB_PORT}` },
    { name: "API_BASE_URL", value: `https://${apiHostname}` },
  ],
  secrets: [],
});

// --- bot service (Telegram webhook + scheduled routes) ---

const BOT_PORT = 8080;

const botFargateService = addFargateHttpService({
  name: "bot",
  hostname: botHostname,
  containerPort: BOT_PORT,
  healthCheckPath: "/_healthz",
  environment: [{ name: "PORT", value: `${BOT_PORT}` }],
  secrets: [
    { name: "TELEGRAM_BOT_TOKEN", valueFrom: telegramBotTokenParam.arn },
    { name: "TELEGRAM_WEBHOOK_SECRET", valueFrom: telegramWebhookSecretParam.arn },
    { name: "OWNER_TELEGRAM_CHAT_ID", valueFrom: ownerTelegramChatIdParam.arn },
  ],
});

export const albDnsName = alb.dnsName;
export const clusterArn = cluster.arn;
export const apiServiceName = apiFargateService.service.name;
export const webServiceName = webFargateService.service.name;
export const botServiceName = botFargateService.service.name;
export const electricServiceName = electricService.name;
export const apiRepoUrl = apiFargateService.repo.repositoryUrl;
export const webRepoUrl = webFargateService.repo.repositoryUrl;
export const botRepoUrl = botFargateService.repo.repositoryUrl;
