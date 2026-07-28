# Auditoria da base anterior

## Problemas encontrados

1. O último pacote distribuído continha HTML que referenciava imagens e `site.webmanifest`, mas esses arquivos não estavam no ZIP.
2. Tema, idioma e fade acumulavam implementações sucessivas, com funções duplicadas e estados incompatíveis (`day/night`, `light/dark` e classes no `body`).
3. O CSS tinha mais de 1.500 linhas, sobrescritas no final por um bloco de correção, tornando o resultado dependente da ordem das regras.
4. O script de deploy desabilitava o bloqueio de acesso público e criava uma política de leitura pública no S3.
5. O HTML continha JavaScript inline, impedindo uma CSP estrita sem `unsafe-inline` ou hash manual.
6. Assets mantinham nomes fixos enquanto o cache podia durar meses, causando versões antigas no navegador.
7. A animação podia ocultar conteúdo antes de confirmar suporte ao `IntersectionObserver`.
8. Não havia validação automatizada de links locais, traduções, atributos de imagem, segredos ou APIs inseguras.

## Refatoração aplicada

- Base reconstruída a partir do último pacote que ainda continha todos os assets.
- Código-fonte e saída de produção separados em `src/` e `dist/`.
- CSS organizado em cascade layers e componentes sem blocos corretivos duplicados.
- Tema normalizado para `light/dark`, com migração das preferências antigas.
- Traduções isoladas em um módulo próprio.
- Atualizações de texto e atributos feitas exclusivamente com `textContent` e `setAttribute`.
- Fade progressivo e seguro: conteúdo visível por padrão e ocultado apenas quando será observado.
- Build determinístico com fingerprint de assets.
- Validador sem dependências externas.
- S3 privado atrás do CloudFront com OAC.
- Cabeçalhos de segurança centralizados em uma Response Headers Policy.

## Decisões pragmáticas

- Nenhum framework foi adicionado: a página não possui complexidade de estado que justifique React, Vue ou equivalente.
- Nenhuma biblioteca de animação foi adicionada: `IntersectionObserver` e CSS atendem ao efeito solicitado com menos peso.
- Nenhuma fonte externa foi adicionada: reduz chamadas, risco de indisponibilidade e superfície de rastreamento.
- WAF não foi incluído: para um site estático sem entrada do usuário, seria custo e operação sem benefício proporcional.


## Correção 2.0.1 — tema

- O tema deixou de depender do carregamento do módulo principal.
- O listener do botão é registrado pelo script de inicialização no `DOMContentLoaded`.
- O build agrega traduções e aplicação em um script clássico.
- O artefato `dist/` não contém `import`, `export` ou `type="module"`.
- O tema funciona em hospedagem HTTPS e ao abrir o HTML localmente.


## Integração GitHub

Foram adicionados:

- CI para branches e pull requests.
- Deploy automático da branch `main`.
- Federação GitHub/AWS por OIDC.
- Role de publicação com permissões específicas.
- Dependabot para GitHub Actions.
- Validação automática dos workflows e do template OIDC.
