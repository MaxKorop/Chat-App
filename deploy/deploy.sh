#!/usr/bin/env sh
# Deploys one image tag on the EC2 instance. Run by the CD workflow through SSM:
#   sh /opt/chat-app/deploy.sh <image-tag>
# To roll back, run it again with an older tag (a commit sha).
set -eu

cd "${APP_DIR:-/opt/chat-app}"
IMAGE_TAG="${1:?usage: deploy.sh <image-tag>}"
export IMAGE_TAG
. ./.env

# Secrets: SSM Parameter Store -> .env.secrets (readable by its owner only; never in an image or in git).
umask 077
params=$(aws ssm get-parameters-by-path --path /chat-app/prod/ --with-decryption --region "$S3_REGION" \
  --query 'Parameters[].[Name,Value]' --output text)
printf '%s\n' "$params" \
  | while IFS="$(printf '\t')" read -r name value; do [ -n "$name" ] && echo "${name##*/}=$value"; done > .env.secrets
for name in JWT_SECRET MESSAGE_KEYS POSTGRES_PASSWORD DATABASE_URL; do
  grep -q "^$name=" .env.secrets || { echo "missing secret $name in SSM /chat-app/prod/" >&2; exit 1; }
done

COMPOSE="docker compose --env-file .env --env-file .env.secrets -f docker-compose.prod.yml"
aws ecr get-login-password --region "$S3_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
$COMPOSE pull
$COMPOSE up -d
docker image prune -f
