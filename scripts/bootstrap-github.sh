#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_STACK_NAME="${SITE_STACK_NAME:-city-pop-guide}"
OIDC_STACK_NAME="${OIDC_STACK_NAME:-${SITE_STACK_NAME}-github}"
AWS_REGION="${AWS_REGION:-sa-east-1}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
GITHUB_ENVIRONMENT="${GITHUB_ENVIRONMENT:-production}"
ROLE_NAME="${ROLE_NAME:-city-pop-github-deploy}"
EXISTING_OIDC_PROVIDER_ARN="${EXISTING_OIDC_PROVIDER_ARN:-}"
CONFIGURE_GITHUB_VARIABLES="${CONFIGURE_GITHUB_VARIABLES:-false}"

usage() {
  cat <<'EOF'
Usage:
  scripts/bootstrap-github.sh OWNER REPOSITORY

Optional environment variables:
  AWS_REGION=sa-east-1
  SITE_STACK_NAME=city-pop-guide
  OIDC_STACK_NAME=city-pop-guide-github
  GITHUB_BRANCH=main
  GITHUB_ENVIRONMENT=production
  ROLE_NAME=city-pop-github-deploy
  EXISTING_OIDC_PROVIDER_ARN=arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com
  CONFIGURE_GITHUB_VARIABLES=true

Exact OIDC subject override:
  GITHUB_OIDC_SUBJECT="repo:owner@ORG_ID/repository@REPO_ID:environment:production"
EOF
}

[[ $# -eq 2 ]] || {
  usage
  exit 2
}

OWNER="$1"
REPOSITORY="$2"
REPOSITORY_SLUG="${OWNER}/${REPOSITORY}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Erro: comando obrigatório não encontrado: %s\n' "$1" >&2
    exit 1
  }
}

require_command aws

cd "$PROJECT_ROOT"
aws sts get-caller-identity >/dev/null

read_site_output() {
  aws cloudformation describe-stacks \
    --stack-name "$SITE_STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

SITE_BUCKET_NAME="$(read_site_output BucketName)"
DISTRIBUTION_ID="$(read_site_output DistributionId)"
SITE_URL="$(read_site_output WebsiteUrl)"

[[ -n "$SITE_BUCKET_NAME" && "$SITE_BUCKET_NAME" != "None" ]] || {
  echo "Erro: BucketName não encontrado na stack $SITE_STACK_NAME." >&2
  exit 1
}

[[ -n "$DISTRIBUTION_ID" && "$DISTRIBUTION_ID" != "None" ]] || {
  echo "Erro: DistributionId não encontrado na stack $SITE_STACK_NAME." >&2
  exit 1
}

resolve_github_subject() {
  if [[ -n "${GITHUB_OIDC_SUBJECT:-}" ]]; then
    printf '%s' "$GITHUB_OIDC_SUBJECT"
    return
  fi

  if command -v gh >/dev/null 2>&1; then
    local repository_json owner_id repository_id

    if repository_json="$(gh api "repos/${REPOSITORY_SLUG}" 2>/dev/null)"; then
      owner_id="$(
        gh api "repos/${REPOSITORY_SLUG}" --jq '.owner.id'
      )"
      repository_id="$(
        gh api "repos/${REPOSITORY_SLUG}" --jq '.id'
      )"

      if [[ -n "$owner_id" && -n "$repository_id" ]]; then
        printf 'repo:%s@%s/%s@%s:environment:%s' \
          "$OWNER" \
          "$owner_id" \
          "$REPOSITORY" \
          "$repository_id" \
          "$GITHUB_ENVIRONMENT"
        return
      fi
    fi
  fi

  printf 'repo:%s/%s:environment:%s' \
    "$OWNER" \
    "$REPOSITORY" \
    "$GITHUB_ENVIRONMENT"
}

GITHUB_SUBJECT="$(resolve_github_subject)"

PARAMETERS=(
  "GitHubSubject=${GITHUB_SUBJECT}"
  "SiteBucketName=${SITE_BUCKET_NAME}"
  "DistributionId=${DISTRIBUTION_ID}"
  "RoleName=${ROLE_NAME}"
)

if [[ -n "$EXISTING_OIDC_PROVIDER_ARN" ]]; then
  PARAMETERS+=(
    "ExistingOidcProviderArn=${EXISTING_OIDC_PROVIDER_ARN}"
  )
fi

aws cloudformation deploy \
  --template-file infra/github-deploy-role.yml \
  --stack-name "$OIDC_STACK_NAME" \
  --region "$AWS_REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "${PARAMETERS[@]}" \
  --no-fail-on-empty-changeset

ROLE_ARN="$(
  aws cloudformation describe-stacks \
    --stack-name "$OIDC_STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" \
    --output text
)"

configure_repository_variables() {
  gh variable set AWS_REGION \
    --repo "$REPOSITORY_SLUG" \
    --body "$AWS_REGION"

  gh variable set AWS_ROLE_ARN \
    --repo "$REPOSITORY_SLUG" \
    --body "$ROLE_ARN"

  gh variable set SITE_BUCKET_NAME \
    --repo "$REPOSITORY_SLUG" \
    --body "$SITE_BUCKET_NAME"

  gh variable set CLOUDFRONT_DISTRIBUTION_ID \
    --repo "$REPOSITORY_SLUG" \
    --body "$DISTRIBUTION_ID"

  if [[ -n "$SITE_URL" && "$SITE_URL" != "None" ]]; then
    gh variable set SITE_URL \
      --repo "$REPOSITORY_SLUG" \
      --body "$SITE_URL"
  fi

  gh api \
    --method PUT \
    "repos/${REPOSITORY_SLUG}/environments/production" \
    >/dev/null
}

cat <<EOF

Bootstrap concluído.

GitHub repository variables:
  AWS_REGION=${AWS_REGION}
  AWS_ROLE_ARN=${ROLE_ARN}
  SITE_BUCKET_NAME=${SITE_BUCKET_NAME}
  CLOUDFRONT_DISTRIBUTION_ID=${DISTRIBUTION_ID}
  SITE_URL=${SITE_URL}

OIDC subject:
  ${GITHUB_SUBJECT}
EOF

if [[ "$CONFIGURE_GITHUB_VARIABLES" == "true" ]]; then
  require_command gh
  configure_repository_variables

  cat <<EOF

Variáveis e environment production configurados via GitHub CLI.
EOF
elif command -v gh >/dev/null 2>&1; then
  cat <<EOF

Para configurar automaticamente:

  CONFIGURE_GITHUB_VARIABLES=true \
  scripts/bootstrap-github.sh "${OWNER}" "${REPOSITORY}"
EOF
else
  cat <<EOF

Configure os valores em:
  Repository > Settings > Secrets and variables > Actions > Variables

Crie também:
  Repository > Settings > Environments > production
EOF
fi

if [[ "$GITHUB_SUBJECT" == "repo:${OWNER}/${REPOSITORY}:"* ]]; then
  cat <<'EOF'

Atenção:
  O GitHub CLI não estava disponível ou não conseguiu ler o repositório.
  Foi usado o subject legado baseado no nome. Caso o repositório emita subject
  imutável, execute novamente com GITHUB_OIDC_SUBJECT explícito ou autentique
  o GitHub CLI com `gh auth login`.
EOF
fi
