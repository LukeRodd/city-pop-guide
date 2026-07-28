#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  scripts/publish-github.sh https://github.com/OWNER/REPOSITORY.git

The target repository should be empty or should accept the initial main branch.
EOF
}

[[ $# -eq 1 ]] || {
  usage
  exit 2
}

REMOTE_URL="$1"

cd "$PROJECT_ROOT"

if [[ ! -d .git ]]; then
  git init
fi

git branch -M main

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

git add .
git commit -m "feat: add production city pop website" || true
git push --set-upstream origin main
