#!/usr/bin/env bash
# Builds one app's image from the repo root and pushes it to the ECR repo this
# stack provisions for it, then forces that service to redeploy with it.
# Usage: scripts/build-and-push.sh <api|web|bot>
# Run after `pulumi up` has created the ECR repos at least once.
set -euo pipefail

APP="${1:?usage: build-and-push.sh <api|web|bot>}"
case "$APP" in
  api|web|bot) ;;
  *) echo "unknown app: $APP (expected api, web, or bot)" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/../.."

REPO_URL=$(cd infra-aws && pulumi stack output "${APP}RepoUrl")
CLUSTER_ARN=$(cd infra-aws && pulumi stack output clusterArn)
SERVICE_NAME=$(cd infra-aws && pulumi stack output "${APP}ServiceName")
REGION=$(cd infra-aws && pulumi config get aws:region)

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${REPO_URL%%/*}"

BUILD_ARGS=()
if [ "$APP" = "web" ]; then
  API_HOSTNAME=$(cd infra-aws && pulumi config get post-anki-infra-aws:apiHostname 2>/dev/null || echo "api.postanki.ilya.online")
  BUILD_ARGS=(--build-arg "API_BASE_URL=https://${API_HOSTNAME}")
fi

docker build -f "apps/$APP/Dockerfile" "${BUILD_ARGS[@]}" -t "$REPO_URL:latest" .
docker push "$REPO_URL:latest"

aws ecs update-service \
  --cluster "$CLUSTER_ARN" \
  --service "$SERVICE_NAME" \
  --force-new-deployment \
  --region "$REGION" \
  --query "service.serviceName"
