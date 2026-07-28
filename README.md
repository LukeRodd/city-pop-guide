# City Pop — guia essencial

Site estático bilíngue, sem frameworks ou dependências de runtime. A base foi organizada para ser legível em desenvolvimento, gerar artefatos versionados e operar com uma política de segurança restritiva.

## Arquitetura

```text
src/                       código legível e conteúdo
  assets/css/main.css      design system e responsividade
  assets/js/theme-init.js  tema aplicado antes do CSS
  assets/js/i18n.js        conteúdo PT-BR e EN
  assets/js/app.js         controles, tradução e efeitos
infra/cloudformation.yml   S3 privado + CloudFront OAC
scripts/build.mjs          build com hash de conteúdo
scripts/validate.mjs       validações de segurança e integridade
scripts/serve.mjs          servidor local com cabeçalhos de segurança
scripts/deploy.sh          build, infraestrutura e publicação
dist/                      saída gerada; não deve ser editada
```

## Requisitos

- Node.js 20 ou superior
- npm
- AWS CLI v2 para publicação
- Credenciais AWS configuradas apenas no ambiente local

O projeto não possui dependências npm externas.

## Desenvolvimento

```bash
npm run validate
npm run build
npm run serve
```

Acesse `http://127.0.0.1:8080` ou defina outra porta:

```bash
PORT=9000 npm run serve
```

## Validações automáticas

`npm run validate` verifica:

- arquivos locais referenciados pelo HTML;
- chaves de tradução em PT-BR e inglês;
- atributos `alt`, largura e altura de imagens;
- `noopener noreferrer` em links externos;
- ausência de scripts, estilos e eventos inline;
- ausência de `innerHTML`, `eval` e APIs equivalentes;
- padrões comuns de credenciais e chaves privadas;
- sintaxe JavaScript e shell.

## Build

```bash
npm run build
```

O build recria `dist/` e adiciona um hash SHA-256 curto ao nome de CSS, JavaScript e imagens. Isso permite cache imutável para assets sem manter versões antigas com o mesmo nome.

## Deploy seguro na AWS

```bash
AWS_REGION=sa-east-1 \
STACK_NAME=city-pop-guide \
PROJECT_NAME=city-pop-guide \
./scripts/deploy.sh
```

A infraestrutura padrão cria:

- bucket S3 privado;
- bloqueio integral de acesso público;
- criptografia SSE-S3;
- versionamento com expiração de versões antigas;
- CloudFront com Origin Access Control;
- HTTPS obrigatório;
- CSP estrita e outros cabeçalhos de segurança;
- cache imutável somente para assets versionados.

O endpoint de website público do S3 não é utilizado.

## Segurança de conteúdo

O site não inclui formulários, cookies, analytics, rastreadores, fontes remotas, scripts de terceiros ou conteúdo carregado dinamicamente. A CSP permite apenas recursos da própria origem.

## Imagens e direitos

As capas aparecem em resolução reduzida para comentário editorial. Os direitos permanecem com os respectivos artistas, selos e criadores.


## Correção do seletor de tema

O controle de tema agora é inicializado por `theme-init.js`, sem depender do módulo
principal. A versão em `dist/` contém um bundle JavaScript clássico, portanto a
alternância funciona também ao abrir `dist/index.html` diretamente com `file://`.
Para desenvolvimento, o servidor local continua sendo a forma recomendada.


## Deploy contínuo pelo GitHub

O repositório passa a ser a fonte oficial do site:

```text
push em main
    ↓
GitHub Actions
    ↓ OIDC / credenciais temporárias
S3 privado
    ↓
CloudFront
```

Não salve `AWS_ACCESS_KEY_ID` ou `AWS_SECRET_ACCESS_KEY` no GitHub.

### 1. Crie um repositório vazio

Exemplo:

```text
https://github.com/OWNER/REPOSITORY
```

### 2. Publique o projeto

```bash
scripts/publish-github.sh \
  https://github.com/OWNER/REPOSITORY.git
```

Também é possível executar os comandos Git manualmente.

### 3. Crie a infraestrutura do site uma vez

```bash
AWS_REGION="sa-east-1" \
STACK_NAME="city-pop-guide" \
PROJECT_NAME="city-pop-guide" \
./scripts/deploy.sh
```

Essa etapa cria o S3 privado e o CloudFront.

### 4. Crie a role OIDC do GitHub

```bash
AWS_REGION="sa-east-1" \
SITE_STACK_NAME="city-pop-guide" \
CONFIGURE_GITHUB_VARIABLES=true \
scripts/bootstrap-github.sh OWNER REPOSITORY
```

O script lê o bucket e a distribuição da stack, cria uma role limitada e,
quando o GitHub CLI está autenticado, detecta o subject OIDC imutável e configura
automaticamente as quatro variáveis e o environment `production`.

Repositórios que usam o `sub` OIDC imutável devem informar o valor exato:

```bash
GITHUB_OIDC_SUBJECT="repo:OWNER@ORG_ID/REPOSITORY@REPO_ID:ref:refs/heads/main" \
scripts/bootstrap-github.sh OWNER REPOSITORY
```

### 5. Configure as variáveis do repositório

Em:

```text
Settings
  → Secrets and variables
  → Actions
  → Variables
```

Crie:

```text
AWS_REGION
AWS_ROLE_ARN
SITE_BUCKET_NAME
CLOUDFRONT_DISTRIBUTION_ID
```

Esses valores não são credenciais secretas. A autenticação acontece com tokens
temporários emitidos por OIDC.

### 6. Proteja o ambiente de produção

O workflow usa o environment `production`. Em:

```text
Settings → Environments → production
```

É possível exigir aprovação manual e restringir a branch `main`.

### 7. Fluxos incluídos

- `CI`: valida branches e pull requests.
- `Deploy production`: publica automaticamente cada push em `main`.
- `Dependabot`: acompanha atualizações das GitHub Actions.

O workflow de deploy não recebe permissão para criar usuários, chaves ou alterar
a infraestrutura. Ele pode apenas sincronizar o bucket e invalidar a distribuição.
