# Segurança

## Modelo de ameaça

Este é um site estático sem autenticação, formulários, APIs, cookies ou armazenamento de dados pessoais. Os principais riscos considerados são:

- comprometimento da cadeia de publicação;
- exposição pública acidental do bucket;
- injeção de script por alteração de conteúdo;
- cache servindo arquivos incompatíveis;
- inclusão futura de recursos remotos sem revisão.

## Controles

- S3 privado com Block Public Access habilitado;
- CloudFront OAC com acesso somente de leitura;
- HTTPS obrigatório;
- Content Security Policy sem `unsafe-inline` e sem terceiros;
- assets com hash de conteúdo;
- validação de padrões de credenciais antes do build;
- ausência de HTML dinâmico por JavaScript;
- links externos isolados com `noopener noreferrer`.

## Credenciais

Nunca salve chaves AWS, tokens, arquivos `.env` ou chaves privadas no repositório. O deploy usa exclusivamente a cadeia de credenciais padrão da AWS CLI.

## Relato de vulnerabilidade

Não publique detalhes sensíveis em uma issue aberta. Encaminhe o relato de forma privada ao responsável pelo repositório, incluindo impacto, passos de reprodução e uma correção sugerida quando possível.


## GitHub Actions

- Autenticação AWS por OIDC e `AssumeRoleWithWebIdentity`.
- Nenhuma access key persistente no GitHub.
- Trust policy limitada a um subject de repositório e branch.
- Workflow com `contents: read` e `id-token: write`.
- Checkout sem persistir o token Git.
- Role de deploy limitada ao bucket e à distribuição do site.
- Deploy de produção isolado no GitHub Environment `production`.
