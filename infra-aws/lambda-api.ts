import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// API on AWS Lambda behind a function URL. Secrets are never in code or state: the function reads
// them from SSM Parameter Store at cold start (paths in SSM_SECRET_PARAMS); values are put there by hand.

const SECRET_ENV_KEYS = [
  "DATABASE_URL",
  "OPENROUTER_API_KEY",
  "API_SHARED_SECRET",
  "INNGEST_SIGNING_KEY",
  "INNGEST_EVENT_KEY",
] as const;

export function addLambdaApi(args: { webHostname: string }) {
  const config = new pulumi.Config();

  const memorySize = config.getNumber("lambdaApiMemoryMb") ?? 512;
  const timeout = config.getNumber("lambdaApiTimeoutSec") ?? 300;
  const reservedConcurrency = config.getNumber("lambdaApiReservedConcurrency") ?? 3;
  const logRetentionDays = config.getNumber("lambdaApiLogRetentionDays") ?? 14;
  const codePath = config.get("lambdaApiCodePath") ?? "../apps/api/dist-lambda";
  const handlerName = config.get("lambdaApiHandler") ?? "lambda-handler.handler";
  const ssmPrefix = (config.get("lambdaApiSsmPrefix") ?? "/post-anki/api").replace(/\/+$/, "");
  const webOrigins = config.get("lambdaApiWebOrigins");
  const dailyBudgetUsd = config.get("lambdaApiLlmDailyBudgetUsd");

  const secretPaths: Record<string, string> = {};

  for (const key of SECRET_ENV_KEYS) {
    secretPaths[key] = config.get(`lambdaApiSsm${key}`) ?? `${ssmPrefix}/${key}`;
  }

  const secretPathValues = Object.values(secretPaths);

  const role = new aws.iam.Role("api-lambda-role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
        },
      ],
    }),
  });

  new aws.iam.RolePolicyAttachment("api-lambda-basic-logs", {
    role: role.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  });

  const identity = aws.getCallerIdentityOutput();
  const region = aws.getRegionOutput();

  new aws.iam.RolePolicy("api-lambda-ssm-read", {
    role: role.id,
    policy: pulumi.all([identity.accountId, region.name]).apply(([account, regionName]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "ssm:GetParameter",
            Resource: secretPathValues.map(
              (p) => `arn:aws:ssm:${regionName}:${account}:parameter${p.startsWith("/") ? p : `/${p}`}`
            ),
          },
        ],
      })
    ),
  });

  const functionName = "post-anki-api";
  const logGroup = new aws.cloudwatch.LogGroup("api-lambda-logs", {
    name: `/aws/lambda/${functionName}`,
    retentionInDays: logRetentionDays,
  });

  const environment: Record<string, string> = {
    SSM_SECRET_PARAMS: JSON.stringify(secretPaths),
    WEB_ORIGIN: `https://${args.webHostname}`,
    ELECTRIC_AUTH_MODE: "none",
    DURABLE_EXTRACTION_ENGINE: "inngest",
  };

  if (webOrigins) {
    environment.WEB_ORIGINS = webOrigins;
  }

  if (dailyBudgetUsd) {
    environment.LLM_DAILY_BUDGET_USD = dailyBudgetUsd;
  }

  const fn = new aws.lambda.Function(
    "api-lambda",
    {
      name: functionName,
      runtime: aws.lambda.Runtime.NodeJS22dX,
      architectures: ["arm64"],
      handler: handlerName,
      role: role.arn,
      code: new pulumi.asset.FileArchive(codePath),
      memorySize,
      timeout,
      reservedConcurrentExecutions: reservedConcurrency,
      environment: { variables: environment },
      loggingConfig: { logFormat: "Text", logGroup: logGroup.name },
    },
    { dependsOn: [logGroup] }
  );

  const url = new aws.lambda.FunctionUrl("api-lambda-url", {
    functionName: fn.name,
    authorizationType: "NONE",
  });

  return { fn, url };
}
