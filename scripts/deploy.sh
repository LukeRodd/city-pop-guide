#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${STACK_NAME:-city-pop-guide}"
PROJECT_NAME="${PROJECT_NAME:-city-pop-guide}"
AWS_REGION="${AWS_REGION:-sa-east-1}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Erro: comando obrigatório não encontrado: %s\n' "$1" >&2
    exit 1
  }
}

require_command aws
require_command node
require_command npm

cd "$PROJECT_ROOT"

aws sts get-caller-identity >/dev/null
npm run check

aws cloudformation deploy \
  --template-file infra/cloudformation.yml \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --parameter-overrides "ProjectName=$PROJECT_NAME" \
  --no-fail-on-empty-changeset

read_stack_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

BUCKET_NAME="$(read_stack_output BucketName)"
DISTRIBUTION_ID="$(read_stack_output DistributionId)"
WEBSITE_URL="$(read_stack_output WebsiteUrl)"

[[ -n "$BUCKET_NAME" && "$BUCKET_NAME" != "None" ]] || {
  echo "Erro: o bucket não foi retornado pelo CloudFormation." >&2
  exit 1
}

aws s3 sync dist "s3://$BUCKET_NAME" \
  --delete \
  --exclude "assets/*" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --only-show-errors

aws s3 sync dist/assets "s3://$BUCKET_NAME/assets" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --only-show-errors

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  >/dev/null

printf '\nDeploy concluído.\nURL: %s\n' "$WEBSITE_URL"
