import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);
const root = resolve(currentDirectory, "..");
const requiredFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy.yml",
  ".github/dependabot.yml",
  "infra/github-deploy-role.yml",
  "scripts/bootstrap-github.sh",
  "scripts/publish-github.sh",
];

const errors = [];

for (const relativePath of requiredFiles) {
  try {
    await stat(resolve(root, relativePath));
  } catch {
    errors.push(`Missing GitHub integration file: ${relativePath}`);
  }
}

const deploy = await readFile(
  resolve(root, ".github/workflows/deploy.yml"),
  "utf8",
);

for (const required of [
  "id-token: write",
  "contents: read",
  "aws-actions/configure-aws-credentials@v6.2.3",
  "role-to-assume: ${{ env.AWS_ROLE_ARN }}",
  "persist-credentials: false",
  "environment: production",
]) {
  if (!deploy.includes(required)) {
    errors.push(`Deploy workflow is missing: ${required}`);
  }
}

for (const forbidden of [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "pull_request_target",
]) {
  if (deploy.includes(forbidden)) {
    errors.push(`Deploy workflow contains forbidden pattern: ${forbidden}`);
  }
}

const roleTemplate = await readFile(
  resolve(root, "infra/github-deploy-role.yml"),
  "utf8",
);

for (const required of [
  "sts:AssumeRoleWithWebIdentity",
  "token.actions.githubusercontent.com:aud",
  "token.actions.githubusercontent.com:sub",
  "s3:PutObject",
  "cloudfront:CreateInvalidation",
]) {
  if (!roleTemplate.includes(required)) {
    errors.push(`OIDC template is missing: ${required}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("GitHub Actions and OIDC configuration validated.");
