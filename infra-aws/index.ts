import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Shared, reusable ECS Fargate cluster + ALB for post-anki's AWS footprint. Additive to the
// existing GCP deployment (infra/) — nothing here touches that stack. A future second app shares
// this same cluster/ALB by adding its own service + target group; Electric itself stays one
// service per Postgres database (Electric's own documented limit), so a future app on a
// *different* database needs its own electric-sync service added the same way.

const config = new pulumi.Config();

const databaseUrl = config.requireSecret("databaseUrl"); // Neon pooled — for the api service
const electricDatabaseUrl = config.requireSecret("electricDatabaseUrl"); // Neon direct — logical replication
const openrouterApiKey = config.requireSecret("openrouterApiKey");
const apiSharedSecret = config.requireSecret("apiSharedSecret");

const API_IMAGE_PORT = 8030;
const ELECTRIC_IMAGE = "electricsql/electric:1.7.7";
const ELECTRIC_PORT = 3000;

// --- Networking: reuse the account's default VPC and public subnets, no NAT gateway ---

const defaultVpc = aws.ec2.getVpcOutput({ default: true });
const publicSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [defaultVpc.id] }],
});

// --- Security groups ---

const albSg = new aws.ec2.SecurityGroup("alb-sg", {
  vpcId: defaultVpc.id,
  description: "post-anki AWS ALB — public ingress on 80/443",
  ingress: [
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
  ],
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
});

const apiSg = new aws.ec2.SecurityGroup("api-sg", {
  vpcId: defaultVpc.id,
  description: "post-anki api service — reachable only from the ALB",
  ingress: [
    {
      protocol: "tcp",
      fromPort: API_IMAGE_PORT,
      toPort: API_IMAGE_PORT,
      securityGroups: [albSg.id],
    },
  ],
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
});

// Electric is never public and never reachable from the ALB — only the api service may reach it.
const electricSg = new aws.ec2.SecurityGroup("electric-sg", {
  vpcId: defaultVpc.id,
  description: "post-anki electric-sync service — reachable only from the api service",
  ingress: [
    {
      protocol: "tcp",
      fromPort: ELECTRIC_PORT,
      toPort: ELECTRIC_PORT,
      securityGroups: [apiSg.id],
    },
  ],
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
});

// --- ECS cluster (shared by every service this stack provisions, now and later) ---

const cluster = new aws.ecs.Cluster("post-anki-cluster", {});

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

// --- ALB (shared — host/path-based routing lets future services share it) ---

const alb = new aws.lb.LoadBalancer("post-anki-alb", {
  loadBalancerType: "application",
  securityGroups: [albSg.id],
  subnets: publicSubnets.ids,
});

const apiTargetGroup = new aws.lb.TargetGroup("api-tg", {
  port: API_IMAGE_PORT,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: defaultVpc.id,
  healthCheck: { path: "/_healthz", matcher: "200" },
});

const apiListener = new aws.lb.Listener("api-listener", {
  loadBalancerArn: alb.arn,
  port: 80,
  protocol: "HTTP",
  defaultActions: [{ type: "forward", targetGroupArn: apiTargetGroup.arn }],
});

// --- IAM: task execution role (pull image, write logs) ---

const executionRole = new aws.iam.Role("post-anki-task-execution-role", {
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

new aws.iam.RolePolicyAttachment("post-anki-task-execution-role-policy", {
  role: executionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

const apiLogGroup = new aws.cloudwatch.LogGroup("api-logs", { retentionInDays: 14 });
const electricLogGroup = new aws.cloudwatch.LogGroup("electric-sync-logs", { retentionInDays: 14 });

// --- Secrets: SSM SecureString params, resolved by ECS at task launch (never in plain env) ---

const databaseUrlParam = new aws.ssm.Parameter("database-url", {
  type: "SecureString",
  value: databaseUrl,
});
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

new aws.iam.RolePolicy("post-anki-task-execution-role-ssm-read", {
  role: executionRole.id,
  policy: pulumi.all([
    databaseUrlParam.arn,
    electricDatabaseUrlParam.arn,
    openrouterApiKeyParam.arn,
    apiSharedSecretParam.arn,
  ]).apply(([a, b, c, d]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "ssm:GetParameters", Resource: [a, b, c, d] }],
    })
  ),
});

// --- electric-sync service (shared, reusable — any future app on this same DB reuses it) ---
//
// No GCP IAM equivalent exists on AWS, and the api's electric-proxy.service.ts only knows how to
// authenticate via Google's IAM identity tokens or skip auth entirely (ELECTRIC_AUTH_MODE=none).
// Security here comes from the security groups alone (electric-sg only accepts traffic from
// api-sg) — the same trust model GCP's own Electric Cloud Run service already uses
// (ELECTRIC_INSECURE=true, gated on Cloud Run IAM instead of a security group).

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

// --- api service ---

const apiTaskDefinition = new aws.ecs.TaskDefinition("api-task", {
  family: "post-anki-api",
  cpu: "256",
  memory: "512",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: executionRole.arn,
  containerDefinitions: pulumi.jsonStringify([
    {
      name: "api",
      image: "REPLACE_ME_WITH_ECR_IMAGE_URI", // set by the deploy step once an ECR repo exists
      portMappings: [{ containerPort: API_IMAGE_PORT }],
      environment: [
        { name: "PORT", value: `${API_IMAGE_PORT}` },
        { name: "ELECTRIC_SERVICE_URL", value: `http://electric-sync.post-anki.internal:${ELECTRIC_PORT}` },
        { name: "ELECTRIC_AUTH_MODE", value: "none" },
      ],
      secrets: [
        { name: "DATABASE_URL", valueFrom: databaseUrlParam.arn },
        { name: "OPENROUTER_API_KEY", valueFrom: openrouterApiKeyParam.arn },
        { name: "API_SHARED_SECRET", valueFrom: apiSharedSecretParam.arn },
      ],
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": apiLogGroup.name,
          "awslogs-region": aws.getRegionOutput().name,
          "awslogs-stream-prefix": "api",
        },
      },
    },
  ]),
});

const apiService = new aws.ecs.Service("api-service", {
  cluster: cluster.arn,
  desiredCount: 1,
  launchType: "FARGATE",
  taskDefinition: apiTaskDefinition.arn,
  networkConfiguration: {
    subnets: publicSubnets.ids,
    securityGroups: [apiSg.id],
    assignPublicIp: true,
  },
  loadBalancers: [{ targetGroupArn: apiTargetGroup.arn, containerName: "api", containerPort: API_IMAGE_PORT }],
});

export const albDnsName = alb.dnsName;
export const clusterArn = cluster.arn;
export const apiServiceName = apiService.name;
export const electricServiceName = electricService.name;
