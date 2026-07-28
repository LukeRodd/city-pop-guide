#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_REGION="${AWS_REGION:-sa-east-1}"
STACK_NAME="${STACK_NAME:-city-pop-guide}"
PROJECT_NAME="${PROJECT_NAME:-city-pop-guide}"
SITE_BUCKET_NAME="${SITE_BUCKET_NAME:-}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"
SITE_URL="${SITE_URL:-}"
SKIP_INFRA="${SKIP_INFRA:-0}"
WAIT_INVALIDATION="${WAIT_INVALIDATION:-1}"
SMOKE_TEST="${SMOKE_TEST:-1}"
DRY_RUN="${DRY_RUN:-0}"

usage() {
  cat <<'EOF'
Uso: ./scripts/deploy-auto.sh [opções]

Opções:
  --skip-infra             Não atualiza o CloudFormation; usa variáveis/outputs existentes
  --no-wait                Não aguarda a invalidação do CloudFront
  --no-smoke-test          Não testa a URL após o deploy
  --dry-run                Mostra o que seria enviado ao S3 sem publicar
  --region REGIÃO          Região AWS (padrão: sa-east-1)
  --stack NOME             Stack CloudFormation (padrão: city-pop-guide)
  --project NOME           Valor do parâmetro ProjectName
  --bucket NOME            Bucket S3, dispensando a leitura do output da stack
  --distribution ID        ID da distribuição CloudFront
  --url URL                URL utilizada no smoke test
  -h, --help               Exibe esta ajuda

Variáveis equivalentes:
  AWS_REGION, STACK_NAME, PROJECT_NAME, SITE_BUCKET_NAME,
  CLOUDFRONT_DISTRIBUTION_ID, SITE_URL, SKIP_INFRA,
  WAIT_INVALIDATION, SMOKE_TEST e DRY_RUN.
EOF
}

while (($#)); do
  case "$1" in
    --skip-infra) SKIP_INFRA=1 ;;
    --no-wait) WAIT_INVALIDATION=0 ;;
    --no-smoke-test) SMOKE_TEST=0 ;;
    --dry-run) DRY_RUN=1 ;;
    --region) AWS_REGION="${2:?Informe a região}"; shift ;;
    --stack) STACK_NAME="${2:?Informe o nome da stack}"; shift ;;
    --project) PROJECT_NAME="${2:?Informe o nome do projeto}"; shift ;;
    --bucket) SITE_BUCKET_NAME="${2:?Informe o bucket}"; shift ;;
    --distribution) CLOUDFRONT_DISTRIBUTION_ID="${2:?Informe a distribuição}"; shift ;;
    --url) SITE_URL="${2:?Informe a URL}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Erro: opção desconhecida: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

log() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$*"
}

fail() {
  printf '\n\033[1;31mErro: %s\033[0m\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\nDeploy interrompido na linha %s. Código: %s\n' "${BASH_LINENO[0]:-desconhecida}" "$exit_code" >&2
  exit "$exit_code"
}
trap on_error ERR

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: $1"
}

truthy() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

read_stack_output() {
  local output_key="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue" \
    --output text
}

require_command aws
require_command node
require_command npm

cd "$PROJECT_ROOT"

NODE_MAJOR="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
[[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || fail "não foi possível identificar a versão do Node.js"
(( NODE_MAJOR >= 20 )) || fail "Node.js 20 ou superior é obrigatório. Versão atual: $(node --version)"

log "Validando identidade AWS"
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
AWS_CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"
printf 'Conta: %s\nIdentidade: %s\nRegião: %s\n' "$AWS_ACCOUNT_ID" "$AWS_CALLER_ARN" "$AWS_REGION"

log "Validando e construindo o projeto"
npm run check
[[ -s dist/index.html ]] || fail "dist/index.html não foi gerado"

if ! truthy "$SKIP_INFRA"; then
  log "Aplicando infraestrutura CloudFormation"
  aws cloudformation deploy \
    --template-file infra/cloudformation.yml \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --parameter-overrides "ProjectName=$PROJECT_NAME" \
    --no-fail-on-empty-changeset
else
  log "Infraestrutura preservada (--skip-infra)"
fi

if [[ -z "$SITE_BUCKET_NAME" ]]; then
  SITE_BUCKET_NAME="$(read_stack_output BucketName)"
fi
if [[ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]]; then
  CLOUDFRONT_DISTRIBUTION_ID="$(read_stack_output DistributionId)"
fi
if [[ -z "$SITE_URL" ]]; then
  SITE_URL="$(read_stack_output WebsiteUrl 2>/dev/null || true)"
fi

[[ -n "$SITE_BUCKET_NAME" && "$SITE_BUCKET_NAME" != "None" ]] || fail "bucket S3 não encontrado"
[[ -n "$CLOUDFRONT_DISTRIBUTION_ID" && "$CLOUDFRONT_DISTRIBUTION_ID" != "None" ]] || fail "distribuição CloudFront não encontrada"

log "Destino do deploy"
printf 'Bucket: %s\nDistribuição: %s\nURL: %s\n' \
  "$SITE_BUCKET_NAME" \
  "$CLOUDFRONT_DISTRIBUTION_ID" \
  "${SITE_URL:-não informada}"

SYNC_EXTRA=()
if truthy "$DRY_RUN"; then
  SYNC_EXTRA+=(--dryrun)
fi

log "Publicando HTML e metadados"
aws s3 sync dist "s3://${SITE_BUCKET_NAME}" \
  --delete \
  --exclude "assets/*" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --only-show-errors \
  "${SYNC_EXTRA[@]}"

log "Publicando assets imutáveis"
aws s3 sync dist/assets "s3://${SITE_BUCKET_NAME}/assets" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --only-show-errors \
  "${SYNC_EXTRA[@]}"

if truthy "$DRY_RUN"; then
  log "Dry-run concluído; nenhuma invalidação foi criada"
  exit 0
fi

log "Verificando index.html no S3"
aws s3api head-object \
  --bucket "$SITE_BUCKET_NAME" \
  --key index.html \
  --query '{ContentType:ContentType,Size:ContentLength,LastModified:LastModified}' \
  --output table

log "Invalidando o CloudFront"
INVALIDATION_ID="$(
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths '/*' \
    --query 'Invalidation.Id' \
    --output text
)"
printf 'Invalidação: %s\n' "$INVALIDATION_ID"

if truthy "$WAIT_INVALIDATION"; then
  log "Aguardando a invalidação"
  aws cloudfront wait invalidation-completed \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID"
fi

if truthy "$SMOKE_TEST" && [[ -n "$SITE_URL" && "$SITE_URL" != "None" ]]; then
  if command -v curl >/dev/null 2>&1; then
    log "Executando smoke test"
    HTTP_STATUS=""
    for attempt in {1..12}; do
      HTTP_STATUS="$(curl --silent --show-error --location --output /dev/null --write-out '%{http_code}' "$SITE_URL" || true)"
      if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "304" ]]; then
        break
      fi
      printf 'Tentativa %02d/12: HTTP %s\n' "$attempt" "${HTTP_STATUS:-erro}"
      sleep 5
    done
    [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "304" ]] || fail "smoke test falhou: HTTP ${HTTP_STATUS:-indisponível}"
    printf 'Smoke test: HTTP %s\n' "$HTTP_STATUS"
  else
    printf 'Aviso: curl não encontrado; smoke test ignorado.\n' >&2
  fi
fi

log "Deploy concluído"
printf 'URL: %s\nBucket: %s\nDistribuição: %s\nInvalidação: %s\n' \
  "${SITE_URL:-não informada}" \
  "$SITE_BUCKET_NAME" \
  "$CLOUDFRONT_DISTRIBUTION_ID" \
  "$INVALIDATION_ID"
