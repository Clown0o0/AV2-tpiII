# cinebridge-recomendacao

[![CI](https://github.com/Clown0o0/AV2-tpiII/actions/workflows/ci.yml/badge.svg)](https://github.com/Clown0o0/AV2-tpiII/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-v24.15.0-339933?style=flat&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v18.6-4169E1?style=flat&logo=postgresql&logoColor=white)

Microsserviço da plataforma cinebridge que recebe um projeto audiovisual e recomenda uma equipe técnica dentro do orçamento e do prazo.

## Índice

1. [Visão geral](#visão-geral)
2. [Início rápido](#início-rápido)
3. [Pré-requisitos](#pré-requisitos)
4. [Passo a passo](#passo-a-passo)
5. [Variáveis de ambiente](#variáveis-de-ambiente)
6. [Endpoints](#endpoints)
7. [Organização do código](#organização-do-código)
8. [Compatibilidade e CI](#compatibilidade-e-ci)
9. [Solução de problemas](#solução-de-problemas)
10. [Documentação técnica](#documentação-técnica)

## Visão geral

O serviço recebe o projeto (gênero, orçamento, prazo, localização e papéis técnicos exigidos) e devolve um profissional sugerido por papel. É a atividade ATVII: sobre a base da ATVI, acrescenta projetos-modelo clonados e uma fábrica por tipo de produção (ficção, documentário, animação e publicitário).

Fluxo de uso:

1. O produtor envia o projeto para `POST /projetos/recomendar`, escolhendo a estratégia: `COSSENO` (competências parecidas com o perfil do papel), `FILTRAGEM_COLABORATIVA` (avaliações de produtores com gosto parecido) ou `ORCAMENTO_REDUZIDO` (mais baratos, locais e bem avaliados).
2. O serviço devolve a equipe sugerida, dentro do orçamento e disponível até a `dataEntrega`.
3. O produtor aceita, rejeita ou substitui cada sugestão; a substituição refaz só aquele papel.
4. Ao aceitar uma sugestão, o profissional recebe um convite e responde aceitando ou recusando; o produtor é avisado.
5. Com todos os convites aceitos, a equipe é finalizada e são emitidos eventos para os serviços de gerenciamento de projetos e financeiro.
6. Se o orçamento ou o prazo mudarem de forma significativa (`PATCH /projetos/:id`), a equipe é recalculada.

Cada ação gera notificações simuladas (e-mail e mensagem interna, em log) e um registro de auditoria em JSON. O `tipoCaptacao` (`FICCAO`, `DOCUMENTARIO`, `ANIMACAO` ou `PUBLICITARIO`) escolhe a fábrica do projeto; os atributos próprios do tipo vão em `detalhes`. Com `modelo`, o projeto parte de um projeto-modelo clonado.

| Padrão | Onde está no código |
|---|---|
| Strategy | `src/strategies/` (`CossenoStrategy`, `FiltragemColaborativaStrategy`, `OrcamentoReduzidoStrategy`, `RegistroEstrategias`) |
| Template Method | `src/orchestration/OrquestradorEquipe.ts` (fluxo fixo) e `OrquestradorPadrao.ts` |
| Observer | `src/events/` (`RecomendacaoEventEmitter`) e `src/events/observadores/` |
| Visitor | `src/visitors/` (`VisitanteBase`, validação, compatibilidade e relatório) e `src/domain/entities/Visitante.ts` |
| Prototype | `src/prototypes/RegistroPrototipos.ts` e `Projeto.clonar()` em `src/domain/entities/Projeto.ts` |
| Factory Method e Abstract Factory | `src/factories/FabricaProjeto.ts`, `src/factories/RegistroFabricas.ts` e uma pasta por tipo em `src/factories/` |

## Início rápido

O caminho mais curto, para quem já tem Node.js 24, Git e PostgreSQL instalados e rodando. Cada passo é explicado em [Passo a passo](#passo-a-passo).

**Windows (PowerShell):**

```powershell
git clone https://github.com/Clown0o0/AV2-tpiII.git
cd AV2-tpiII
npm ci
Copy-Item .env.example .env
notepad .env
npx prisma migrate deploy
npm run db:seed
npm run exemplos
npm run dev
```

**Linux (bash):**

```bash
git clone https://github.com/Clown0o0/AV2-tpiII.git
cd AV2-tpiII
npm ci
cp .env.example .env
nano .env
npx prisma migrate deploy
npm run db:seed
npm run exemplos
npm run dev
```

No editor aberto pelo `notepad`/`nano`, troque `USUARIO` e `SENHA` na `DATABASE_URL` pelos do seu PostgreSQL e salve. Com o servidor rodando, abra **outro terminal na pasta `AV2-tpiII`** e envie um projeto:

```powershell
curl.exe http://localhost:3000/health
curl.exe -X POST http://localhost:3000/projetos/recomendar -H "content-type: application/json" --data-binary "@exemplos/gerados/documentario.json"
```

No Linux, use `curl` no lugar de `curl.exe` (ou rode uma vez `alias curl.exe=curl` nesse terminal e copie os comandos como estão).

## Pré-requisitos

| Ferramenta | Versão | Como conferir |
|---|---|---|
| Node.js | 24 (testado com 24.15.0; o `package.json` exige `>=24`) | `node -v` |
| npm | o que vem com o Node 24 (testado com 11.12.1) | `npm -v` |
| PostgreSQL | testado com 18.6 | `psql --version` |
| Git | qualquer versão recente | `git --version` |
| curl | para os exemplos; já vem no Windows 10+ como `curl.exe` | `curl.exe --version` (Windows) ou `curl --version` (Linux) |

Como instalar:

| | Windows 10+ | Ubuntu 24.04.03+ e derivadas |
|---|---|---|
| Node.js 24 | instalador de https://nodejs.org (ou `winget install OpenJS.NodeJS.LTS`, conferindo se `node -v` mostra 24) | `nvm install 24` (https://github.com/nvm-sh/nvm) ou o repositório da NodeSource |
| PostgreSQL | instalador de https://www.postgresql.org/download/windows/ (cria o serviço `postgresql-x64-NN`) | `sudo apt install postgresql` e `sudo systemctl start postgresql` |
| Git | https://git-scm.com/download/win | `sudo apt install git` |

No Windows, o instalador do PostgreSQL não coloca o `psql` no `PATH`; veja [psql não é reconhecido](#psql-não-é-reconhecido-windows). O projeto não precisa do `psql`: o Prisma cria o banco e as tabelas.

## Passo a passo

Todos os comandos `npm`, `npx` e `node` rodam na **raiz do projeto**: a pasta `AV2-tpiII/` criada pelo `git clone`, onde ficam o `package.json` e este `README.md`.

```
AV2-tpiII/            <- raiz do projeto: rode os comandos aqui
├── docs/             documentação técnica (ATVII.md)
├── exemplos/         modelos JSON dos exemplos de requisição e o script que gera as cópias com data atual
│   └── gerados/      cópias criadas por `npm run exemplos` (fora do Git)
├── prisma/           schema, migrations e seed
├── src/              código do serviço
├── tests/            testes (Jest)
├── .env.example      modelo do .env
├── package.json
└── README.md
```

Os comandos são iguais no PowerShell e no bash, exceto onde aparecem separados.

### 1. Clonar

**Onde:** qualquer pasta.

```bash
git clone https://github.com/Clown0o0/AV2-tpiII.git
cd AV2-tpiII
```

**Resultado esperado:** a pasta `AV2-tpiII` criada, e o terminal dentro dela.

### 2. Instalar as dependências

**Onde:** raiz do projeto.

```bash
npm ci
```

**Resultado esperado:** no fim aparecem `Generated Prisma Client (v6.19.3)` (o `postinstall` roda o `prisma generate`) e `added ... packages`. O `npm ci` instala exatamente as versões do `package-lock.json`. Avisos de `npm audit` não impedem o uso.

**Se falhar:** [Node abaixo da versão 24](#node-abaixo-da-versão-24), [postinstall ou prisma generate falhando](#postinstall-ou-prisma-generate-falhando).

### 3. Criar o `.env`

**Onde:** raiz do projeto.

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
notepad .env
```

```bash
# Linux
cp .env.example .env
nano .env
```

Troque `USUARIO` e `SENHA` na `DATABASE_URL` pelos do seu PostgreSQL (e host, porta ou nome do banco, se forem outros) e salve. As outras variáveis são opcionais; veja [Variáveis de ambiente](#variáveis-de-ambiente). O `.env` está no `.gitignore`, então a senha não vai para o Git.

**Resultado esperado:** um arquivo `.env` ao lado do `package.json`.

**Se falhar:** [.env ausente](#env-ausente-ou-database_url-não-definida), [usuário ou senha inválidos](#usuário-ou-senha-inválidos).

### 4. Criar o banco e as tabelas

**Onde:** raiz do projeto. O PostgreSQL precisa estar rodando.

```bash
npx prisma migrate deploy
```

**Resultado esperado:** se o banco ainda não existir, `PostgreSQL database cinebridge_recomendacao created at localhost:5432`; depois `2 migrations found in prisma/migrations`, a aplicação de `20260925000000_init` e `20261015000000_tipos_de_projeto`, e `All migrations have been successfully applied.` Quem já tem o banco da ATVI recebe só a migration nova.

**Se falhar:** [não conecta ao banco](#não-conecta-ao-banco), [usuário ou senha inválidos](#usuário-ou-senha-inválidos), [tabelas não existem ou migration com erro](#tabelas-não-existem-ou-migration-com-erro).

### 5. Popular com profissionais de exemplo

**Onde:** raiz do projeto.

> **Atenção:** o seed **apaga todos os dados** do banco da `DATABASE_URL` (projetos, recomendações, convites e profissionais) antes de inserir.

```bash
npm run db:seed
```

**Resultado esperado:**

```
Limpando dados e gerando 300 profissionais...
  300/300
Seed concluído. Produtores com histórico de avaliações: produtor-1 ... produtor-25
```

A agenda dos profissionais é relativa ao dia em que o seed roda: de 1 mês atrás até 3 a 18 meses à frente. Para outra quantidade, defina `SEED_PROFISSIONAIS` (de 0 a 1000000):

```powershell
# Windows (PowerShell)
$env:SEED_PROFISSIONAIS=10000; npm run db:seed
```

```bash
# Linux
SEED_PROFISSIONAIS=10000 npm run db:seed
```

**Se falhar:** [variável de ambiente inválida](#variável-de-ambiente-inválida), [não conecta ao banco](#não-conecta-ao-banco).

### 6. Gerar os exemplos com a data atual

**Onde:** raiz do projeto.

```bash
npm run exemplos
```

**Resultado esperado:** a pasta `exemplos/gerados/` com uma cópia de cada exemplo, com `dataEntrega` = hoje + 60 dias:

```
Exemplos gravados em exemplos/gerados com dataEntrega = AAAA-MM-DD (os modelos em exemplos/ não mudam):
  exemplos/gerados/alterar-projeto.json
  exemplos/gerados/animacao.json
  exemplos/gerados/documentario.json
  exemplos/gerados/modelo-publicitario.json
  exemplos/gerados/resposta-convite.json
```

A API recusa `dataEntrega` no passado e só sugere quem tem agenda até a entrega. Uma data fixa acabaria vencendo; por isso os arquivos de `exemplos/` são só modelos (a `dataEntrega` deles é ilustrativa) e os comandos usam as cópias de `exemplos/gerados/`, com uma data que cabe na agenda do seed. A pasta `exemplos/gerados/` está no `.gitignore`, então o `git status` continua limpo. Rode `npm run exemplos` de novo sempre que aparecer o erro 422 "A data de entrega do projeto já passou" ([solução de problemas](#erro-422-a-data-de-entrega-do-projeto-já-passou)).

### 7. Rodar o servidor

**Onde:** raiz do projeto. O terminal fica ocupado enquanto o servidor roda; Ctrl+C para parar.

Em desenvolvimento (recarrega ao salvar um arquivo):

```bash
npm run dev
```

Ou compilado (o `tsc` gera `dist/` e o `npm start` roda `dist/server.js`):

```bash
npm run build
npm start
```

**Resultado esperado:** linhas de log em JSON, entre elas `"msg":"Server listening at http://127.0.0.1:3000"`.

**Se falhar:** [`npm start` sem build](#npm-start-sem-build), [porta em uso](#porta-em-uso), [variável de ambiente inválida](#variável-de-ambiente-inválida), [.env ausente](#env-ausente-ou-database_url-não-definida).

### 8. Conferir se está no ar

**Onde:** outro terminal, qualquer pasta.

```bash
curl.exe http://localhost:3000/health
```

**Resultado esperado:** `{"status":"ok"}`. No Linux, use `curl` (veja [curl.exe não encontrado](#curlexe-não-encontrado-linux)).

**Se falhar:** [curl não funciona no PowerShell](#curl-não-funciona-no-powershell).

### 9. Rodar os testes

**Onde:** raiz do projeto. Não precisam do PostgreSQL nem do servidor rodando (usam repositórios em memória).

```bash
npm test
```

**Resultado esperado:** `Test Suites: 26 passed, 26 total`, `Tests: 255 passed, 255 total` e a tabela de cobertura (o mínimo exigido é 80%).

Use sempre `npm test`, e não `npx jest`: o Fastify carrega pacotes ESM, e o Jest só consegue com a opção `--experimental-vm-modules` do Node, que o script `test` já passa. Veja [`npx jest` falha](#npx-jest-falha-com-must-use-import-to-load-es-module).

## Variáveis de ambiente

Todas são lidas e validadas em `src/composicao/configuracao.ts` (o seed lê `DATABASE_URL` e `SEED_PROFISSIONAIS`). Valor inválido encerra o processo com código 1 e uma mensagem dizendo qual variável e qual valor é aceito. Variável vazia vale como ausente. Uma variável definida no terminal tem prioridade sobre o `.env`.

| Variável | Obrigatória? | Padrão | O que faz |
|---|---|---|---|
| `DATABASE_URL` | sim | — | Conexão com o PostgreSQL: `postgresql://USUARIO:SENHA@HOST:PORTA/BANCO?schema=public`. Usada pelo servidor, pelo seed e pelo Prisma |
| `PORT` | não | `3000` | Porta HTTP (inteiro de 1 a 65535) |
| `HOST` | não | `0.0.0.0` | Endereço em que o servidor escuta |
| `LOG_LEVEL` | não | `info` | Nível de log: `fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent` |
| `CATALOGO_TTL_MS` | não | `60000` | Validade, em ms, do cadastro de profissionais em memória; recarregado em segundo plano a cada metade. `0` desliga o cache (lê o banco a cada pedido) |
| `PROFISSIONAIS_TIMEOUT_MS` | não | `1500` | Espera máxima, em ms, pelo banco ao ler profissionais; depois disso usa o último cadastro carregado |
| `SEED_PROFISSIONAIS` | não (só no seed) | `300` | Quantidade de profissionais criados pelo `npm run db:seed` (0 a 1000000) |

O cadastro de profissionais fica em memória para atender 100 requisições simultâneas com 10 mil profissionais sem consultar o banco a cada pedido. Um profissional novo aparece em até `CATALOGO_TTL_MS`. Se a leitura de profissionais falhar ou passar de `PROFISSIONAIS_TIMEOUT_MS`, a recomendação usa o último cadastro carregado e sai marcada como `parcial`. Com o banco inteiro fora do ar, as rotas que gravam respondem 500 `ERRO_INTERNO`, o `/health` continua respondendo e o serviço volta sozinho quando o banco volta.

## Endpoints

| Método | Caminho | Sucesso | O que faz |
|---|---|---|---|
| POST | `/projetos/recomendar` | 201 | Recebe o projeto (ou um `modelo` + ajustes) e devolve `projeto`, `recomendacao` e `fonteProfissionais` |
| GET | `/projetos/modelos` | 200 | Lista as chaves aceitas em `modelo` |
| PATCH | `/projetos/:id` | 200 | Altera `orcamentoTotal`, `dataEntrega`, `estrategia` ou `forcarReavaliacao`; devolve `projeto`, `alteracao`, `reavaliada` e `recomendacao` |
| GET | `/recomendacoes/:id` | 200 | Estado da equipe (`equipe`, `historico`) e os `convites` |
| GET | `/recomendacoes/:id/relatorio` | 200 | `relatorio`, `validacao` e `compatibilidade`; em animação, `relatorio.metricasRenderizacao` |
| POST | `/recomendacoes/:id/membros/:papel/aceitar` | 201 | Aceita a sugestão e envia convite ao profissional; devolve `recomendacao` e `convite` |
| POST | `/recomendacoes/:id/membros/:papel/rejeitar` | 200 | Rejeita a sugestão; o papel fica em aberto |
| POST | `/recomendacoes/:id/membros/:papel/substituir` | 200 | Nova sugestão só para o papel (corpo opcional `{"estrategia": "..."}`); devolve `recomendacao` e `novoMembro` |
| POST | `/convites/:id/responder` | 200 | O profissional responde `{"aceito": true}` ou `{"aceito": false}`; devolve `convite`, `recomendacao` e `equipeFinalizada` |
| GET | `/health` | 200 | `{"status":"ok"}` |

Papéis (`:papel` e `papeis[].papel`): `DIRETOR`, `DIRETOR_FOTOGRAFIA`, `SONOPLASTA`, `EDITOR`, `ROTEIRISTA`, `EFEITOS_VISUAIS`.

Todo erro responde no mesmo formato, `{"erro": "CODIGO", "mensagem": "..."}`:

| Status | `erro` | Quando |
|---|---|---|
| 400 (413, 414, 415) | `REQUISICAO_INVALIDA` | JSON malformado, campo faltando ou de tipo errado, valor fora do limite (ex.: `orcamentoTotal` acima de 999999999999), texto com caractere nulo, corpo grande demais, parâmetro de URL longo demais, `content-type` não suportado |
| 404 | `NAO_ENCONTRADO` | Projeto, recomendação ou convite inexistente; rota ou método inexistente |
| 409 | `ESTADO_INVALIDO` | Ação que o estado atual não permite (aceitar duas vezes, alterar equipe finalizada etc.) |
| 422 | `VALIDACAO` | Regra de negócio: `dataEntrega` no passado ou inválida, papel repetido, `modelo` inexistente, `detalhes` inválidos |
| 500 | `ERRO_INTERNO` | Falha inesperada (ex.: banco fora do ar); o detalhe fica só no log |

### Exemplos de requisição

**Onde:** raiz do projeto (os caminhos `@exemplos/gerados/...` são relativos a ela), com o servidor rodando. Os corpos são as cópias de `exemplos/gerados/`, criadas a partir dos modelos de [`exemplos/`](exemplos/), e são enviados como arquivo com `--data-binary`, o que evita problemas de aspas e acentos no PowerShell. No Linux, use `curl` no lugar de `curl.exe`, ou rode uma vez `alias curl.exe=curl` no terminal.

Rode antes `npm run exemplos` ([passo 6](#6-gerar-os-exemplos-com-a-data-atual)), e de novo se algum exemplo responder 422 "A data de entrega do projeto já passou". Nos comandos abaixo, troque `ID_DA_RECOMENDACAO`, `ID_DO_PROJETO` e `ID_DO_CONVITE` pelos valores das respostas anteriores.

**1. Documentário** ([`exemplos/documentario.json`](exemplos/documentario.json), estratégia `ORCAMENTO_REDUZIDO`, com `detalhes` de documentário):

```bash
curl.exe -X POST http://localhost:3000/projetos/recomendar -H "content-type: application/json" --data-binary "@exemplos/gerados/documentario.json"
```

Resposta 201: `{"projeto":{"id":"...",...},"recomendacao":{"id":"...","status":"EM_ANDAMENTO",...,"equipe":[{"papel":"DIRETOR","status":"SUGERIDO",...},...]},"fonteProfissionais":"REPOSITORIO"}`. Anote `recomendacao.id` (ID_DA_RECOMENDACAO).

**2. Aceitar cada membro** (um comando por papel da `equipe`: `DIRETOR`, `ROTEIRISTA` e `SONOPLASTA` neste exemplo):

```bash
curl.exe -X POST http://localhost:3000/recomendacoes/ID_DA_RECOMENDACAO/membros/DIRETOR/aceitar
```

Resposta 201 com `"convite":{"id":"...","status":"PENDENTE",...}`. Anote o `convite.id` de cada papel.

**3. Responder cada convite** ([`exemplos/resposta-convite.json`](exemplos/resposta-convite.json), `{"aceito": true}`):

```bash
curl.exe -X POST http://localhost:3000/convites/ID_DO_CONVITE/responder -H "content-type: application/json" --data-binary "@exemplos/gerados/resposta-convite.json"
```

Resposta 200 com `"equipeFinalizada":false` nos primeiros e `"equipeFinalizada":true` no último, quando a `recomendacao` passa a `"status":"FINALIZADA"`.

**4. Consultar a equipe e o relatório:**

```bash
curl.exe http://localhost:3000/recomendacoes/ID_DA_RECOMENDACAO
curl.exe http://localhost:3000/recomendacoes/ID_DA_RECOMENDACAO/relatorio
```

**5. Animação** ([`exemplos/animacao.json`](exemplos/animacao.json), técnica 3D a 24 quadros por segundo):

```bash
curl.exe -X POST http://localhost:3000/projetos/recomendar -H "content-type: application/json" --data-binary "@exemplos/gerados/animacao.json"
curl.exe http://localhost:3000/recomendacoes/ID_DA_RECOMENDACAO/relatorio
```

O relatório da animação traz `relatorio.metricasRenderizacao`, por exemplo `{"descricao":"Estimativas derivadas da duração estimada, dos quadros por segundo e do custo da equipe recomendada.","tecnica":"3D","quadrosPorSegundo":24,"duracaoEstimadaMin":12,"totalQuadrosEstimado":17280,"custoEstimadoPorQuadro":...,"papeisEfeitosVisuaisPreenchidos":1}`.

**6. Alterar o projeto da animação** ([`exemplos/alterar-projeto.json`](exemplos/alterar-projeto.json): orçamento de 90000 para 135000, +50%):

```bash
curl.exe -X PATCH http://localhost:3000/projetos/ID_DO_PROJETO -H "content-type: application/json" --data-binary "@exemplos/gerados/alterar-projeto.json"
```

Resposta 200 com `"alteracao":{"variacaoOrcamento":0.5,"variacaoPrazoDias":0,"estrategiaAlterada":false}`, `"reavaliada":true` e uma `recomendacao` nova. Em projeto com equipe finalizada (o documentário do item 3), a resposta é 409 `ESTADO_INVALIDO`.

**7. A partir de um projeto-modelo** ([`exemplos/modelo-publicitario.json`](exemplos/modelo-publicitario.json): modelo `publicitario`, trocando título, marca, orçamento e estratégia):

```bash
curl.exe http://localhost:3000/projetos/modelos
curl.exe -X POST http://localhost:3000/projetos/recomendar -H "content-type: application/json" --data-binary "@exemplos/gerados/modelo-publicitario.json"
```

O primeiro responde `{"modelos":["ficcao","documentario","animacao","publicitario"]}`; o segundo, 201 com um projeto `PUBLICITARIO` e a equipe do modelo (`DIRETOR`, `DIRETOR_FOTOGRAFIA` e `EDITOR`).

**8. Rejeitar ou substituir uma sugestão:**

```bash
curl.exe -X POST http://localhost:3000/recomendacoes/ID_DA_RECOMENDACAO/membros/EDITOR/substituir
curl.exe -X POST http://localhost:3000/recomendacoes/ID_DA_RECOMENDACAO/membros/EDITOR/rejeitar
```

## Organização do código

```
src/
├── server.ts             Ponto de entrada: lê a configuração, monta o app e trata encerramento e falhas não tratadas
├── app.ts                Fastify: rotas, formato único de erro e 404
├── composicao/           Raiz de composição (criarSistemaRecomendacao) e leitura das variáveis de ambiente (configuracao)
├── compartilhado/        Utilitário de memoização usado pelos caches
├── domain/
│   ├── entities/         Projeto e subtipos, Profissional, Competencia, Avaliacao, Recomendacao, Convite, Visitante
│   ├── ports/            Interfaces de repositório e da fonte de profissionais
│   └── errors.ts         Erros de domínio com o status HTTP de cada um
├── services/             SistemaRecomendacao (fachada) e colaboradores: OrquestradorDeRecomendacao, GestorDeConvites, GeradorDeRelatorio, PublicadorDeEventosDeRecomendacao, PoliticaDeReavaliacao, FonteProfissionaisResiliente
├── orchestration/        Template Method: OrquestradorEquipe e OrquestradorPadrao
├── strategies/           Strategy: cosseno, filtragem colaborativa, orçamento reduzido, base dos recomendadores por tipo e RegistroEstrategias
├── factories/            Abstract Factory e Factory Method: FabricaProjeto, RegistroFabricas e uma pasta por tipo
│   ├── ficcao/           FabricaFiccao, NotificadorFiccao
│   ├── documentario/     FabricaDocumentario, RecomendadorDocumentario, ValidadorDocumentario, NotificadorDocumentario
│   ├── animacao/         FabricaAnimacao, RecomendadorAnimacao, ValidadorAnimacao, NotificadorAnimacao, RelatorioAnimacaoVisitor
│   └── publicitario/     FabricaPublicitario, RecomendadorPublicitario, ValidadorPublicitario, NotificadorPublicitario
├── prototypes/           Prototype: RegistroPrototipos (projetos-modelo)
├── visitors/             Visitor: VisitanteBase, validação, compatibilidade e relatório da equipe
├── events/               Observer: RecomendacaoEventEmitter, tipos de evento e contrato do publicador
│   └── observadores/     E-mail, mensagem interna, auditoria e a base dos notificadores por tipo
├── repositories/         Acesso ao banco com Prisma
└── routes/               Rotas REST, schemas JSON e serializadores
tests/
├── unit/                 Testes de cada camada
├── integration/          API completa com repositórios em memória
└── support/              Fixtures, repositórios em memória e montagem do sistema de teste
prisma/                   schema.prisma, migrations e seed.ts
exemplos/                 Modelos JSON dos exemplos e o script atualizar-datas.js (npm run exemplos)
  └── gerados/            Cópias com dataEntrega atual, usadas pelos curl (fora do Git)
docs/                     ATVII.md (documentação técnica)
```

## Compatibilidade e CI

Sistemas suportados:

- **Windows 10 ou superior** (PowerShell ou cmd);
- **Ubuntu 24.04.03 ou superior** e derivadas do Ubuntu 24.04 (Linux Mint 22.x, Pop!_OS 24.04, Kubuntu/Xubuntu/Lubuntu 24.04 etc.).

Os scripts do `package.json` não usam sintaxe de shell, então rodam iguais no PowerShell, no cmd e no bash. O `.gitattributes` fixa o fim de linha em LF. A diferença entre sistemas está em copiar arquivos, abrir o editor, definir variável na linha de comando e chamar o curl, e esses comandos aparecem separados neste README.

O GitHub Actions (`.github/workflows/ci.yml`) roda `npm ci`, `npx prisma generate`, `npx tsc --noEmit`, `npm run build` e `npm test` em `ubuntu-24.04` e `windows-latest`, com `actions/setup-node@v4` e `node-version: 24`. Esses rótulos não fixam a versão exata, que o GitHub Actions escolhe a cada execução. Os testes não precisam de PostgreSQL.

## Solução de problemas

Os comandos `npm`, `npx` e `node` desta seção rodam na raiz do projeto (`AV2-tpiII/`).

### Não conecta ao banco

**Sintoma:** `P1001: Can't reach database server` ou `ECONNREFUSED`.

**Causa:** o PostgreSQL não está rodando, ou o host/porta da `DATABASE_URL` estão errados.

**Solução:** inicie o PostgreSQL e confira o `.env`.
```bash
# Linux
sudo systemctl start postgresql
```
```powershell
# Windows (PowerShell como administrador; o nome do serviço muda com a versão)
Get-Service postgresql*
Start-Service postgresql-x64-18
```

### Usuário ou senha inválidos

**Sintoma:** `P1000: Authentication failed against database server`.

**Causa:** usuário ou senha da `DATABASE_URL` não conferem (inclusive se `USUARIO` e `SENHA` do `.env.example` não foram trocados).

**Solução:** corrija no `.env`. Caracteres especiais na senha precisam ser codificados (ex.: `@` vira `%40`).

### Banco não existe

**Sintoma:** `P1003: Database cinebridge_recomendacao does not exist`.

**Causa:** o banco ainda não foi criado.

**Solução:** `npx prisma migrate deploy` cria o banco (se o usuário tiver permissão) e as tabelas. Sem permissão para criar bancos, crie com o usuário administrador do PostgreSQL e rode o `migrate deploy` de novo:
```bash
createdb -U postgres cinebridge_recomendacao
npx prisma migrate deploy
```

### Tabelas não existem ou migration com erro

**Sintoma:** `The table "public.Profissional" does not exist`, `P3005` ou `P3009`.

**Causa:** as migrations não foram aplicadas, ou falharam.

**Solução:**
- `npx prisma migrate deploy` aplica as migrations do projeto.
- `npx prisma migrate dev` só é necessário se você alterar o `schema.prisma`.
- Em banco de desenvolvimento, `npx prisma migrate reset` recria tudo (**apaga os dados**).

### .env ausente ou DATABASE_URL não definida

**Sintoma:** ao rodar `npm run dev`, `npm start` ou `npm run db:seed`:
```
Configuração inválida:
  - DATABASE_URL não está definida: crie o .env a partir do .env.example ou defina a variável no ambiente
```
No `npx prisma migrate deploy`: `Environment variable not found: DATABASE_URL`.

**Causa:** não há `.env` na raiz do projeto (ou ele não tem `DATABASE_URL`).

**Solução:** crie o `.env` como no [passo 3](#3-criar-o-env).

### Variável de ambiente inválida

**Sintoma:** o servidor ou o seed encerra logo ao iniciar, com mensagens como:
```
Configuração inválida:
  - PORT="abc" é inválida: use um número inteiro entre 1 e 65535
  - LOG_LEVEL="xyz" é inválida: use um destes valores: fatal, error, warn, info, debug, trace, silent
```

**Causa:** valor fora do aceito em `PORT`, `LOG_LEVEL`, `CATALOGO_TTL_MS`, `PROFISSIONAIS_TIMEOUT_MS`, `SEED_PROFISSIONAIS` ou `DATABASE_URL` que não começa com `postgresql://`. A mensagem lista todas as variáveis com problema.

**Solução:** corrija o valor no `.env` (ou no terminal) conforme a [tabela de variáveis](#variáveis-de-ambiente). Variável definida no terminal vale mais que o `.env`: no PowerShell, `Remove-Item Env:PORT` apaga uma definida por engano; no bash, `unset PORT`.

### npm start sem build

**Sintoma:** `Error: Cannot find module` apontando para `dist\server.js` (Windows) ou `dist/server.js` (Linux).

**Causa:** `npm start` roda o código compilado em `dist/`, que só existe depois do build.

**Solução:**
```bash
npm run build
npm start
```

### npx jest falha com "Must use import to load ES Module"

**Sintoma:** `npx jest` falha nas suítes de integração com `Must use import to load ES Module: ...node_modules\cookie\dist\index.js`.

**Causa:** o Fastify depende de pacotes ESM, e o Jest só os carrega com a opção `--experimental-vm-modules` do Node.

**Solução:** rode `npm test`, que já passa a opção. Para argumentos extras, use `npm test -- <argumentos>` (ex.: `npm test -- --runInBand`).

### postinstall ou prisma generate falhando

**Sintoma:** o `npm ci` termina com erro no `postinstall` (`prisma generate`), por exemplo ao baixar o engine do Prisma sem internet ou atrás de proxy. No Windows, também pode aparecer `EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp...'` (no `npm ci` ou no `npx prisma generate`).

**Causa:** o `prisma generate` precisa do engine do Prisma para a sua plataforma; sem rede ele não consegue baixá-lo. O `EPERM` acontece quando um servidor do projeto está rodando e trava o arquivo do engine.

**Solução:** pare qualquer `npm run dev` ou `npm start` (Ctrl+C), confira a conexão (ou o proxy em `HTTPS_PROXY`) e rode de novo:
```bash
npx prisma generate
```

### Node abaixo da versão 24

**Sintoma:** `npm warn EBADENGINE Unsupported engine` no `npm ci`, ou erros ao rodar os scripts.

**Causa:** o projeto exige Node 24 (`"engines": {"node": ">=24"}`) e só é testado nessa versão.

**Solução:** instale o Node 24 (https://nodejs.org ou `nvm install 24` e `nvm use 24`), confira com `node -v`, apague a pasta `node_modules` e rode `npm ci` de novo.

### Porta em uso

**Sintoma:** `EADDRINUSE: address already in use 0.0.0.0:3000`.

**Causa:** outro processo já usa a porta 3000.

**Solução:** troque `PORT` no `.env` (ex.: `PORT=3001`) ou encerre o outro processo.

### npm não roda no PowerShell

**Sintoma:** `npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada neste sistema`.

**Causa:** a política de execução do PowerShell bloqueia scripts.

**Solução:** use `npm.cmd` no lugar de `npm` (ex.: `npm.cmd ci`), ou libere scripts para o seu usuário: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### curl não funciona no PowerShell

**Sintoma:** erro de parâmetro ao usar `curl -X POST ...`.

**Causa:** no Windows PowerShell, `curl` é outro comando (`Invoke-WebRequest`).

**Solução:** use `curl.exe`, como nos exemplos. Envie o corpo de `POST`/`PATCH` como arquivo (`--data-binary "@exemplos/gerados/arquivo.json"`): passado com `-d '{...}'` direto no PowerShell, o JSON perde as aspas internas e o servidor responde `Body is not valid JSON`.

### curl.exe não encontrado (Linux)

**Sintoma:** `curl.exe: command not found`.

**Causa:** no Linux o programa se chama `curl`.

**Solução:** troque `curl.exe` por `curl`, ou rode `alias curl.exe=curl` no terminal (vale até fechar o terminal).

### Erro 400 "Body is not valid JSON" ou "Request body size did not match Content-Length"

**Causa:** o JSON foi digitado na linha de comando e chegou alterado (aspas removidas pelo PowerShell, acentos recodificados pelo Git Bash) ou foi salvo com codificação diferente de UTF-8.

**Solução:** envie um arquivo salvo em UTF-8 com `--data-binary "@caminho/arquivo.json"`, como os de `exemplos/`.

### psql não é reconhecido (Windows)

**Sintoma:** `psql : O termo 'psql' não é reconhecido...` ou `'createdb' não é reconhecido como um comando interno`.

**Causa:** o instalador do PostgreSQL no Windows não coloca a pasta `bin` no `PATH`.

**Solução:** use o caminho completo (troque `18` pela sua versão) ou adicione a pasta ao `PATH`:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres cinebridge_recomendacao
```

### Peer authentication failed (Ubuntu)

**Sintoma:** `Peer authentication failed for user "postgres"`.

**Causa:** no Ubuntu, o usuário `postgres` do banco só aceita login local pelo usuário `postgres` do sistema, e vem sem senha.

**Solução:** defina uma senha para ele e use-a na `DATABASE_URL`:
```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'escolha-uma-senha';"
```

### Testes estourando o tempo

**Sintoma:** `Exceeded timeout of 5000 ms for a test`.

**Causa:** os testes com 10.000 profissionais e com 100 requisições simultâneas são mais pesados em máquinas lentas.

**Solução:**
```bash
npm test -- --testTimeout=30000
```

### Erros de tipo depois de mudar o schema.prisma

**Sintoma:** `Property 'xyz' does not exist on type ...` ou `@prisma/client did not initialize yet`.

**Causa:** o cliente do Prisma não foi gerado de novo.

**Solução:** `npx prisma generate`.

### Profissionais recém-cadastrados ou apagados não aparecem

**Causa:** o cadastro fica em memória e é recarregado a cada metade do `CATALOGO_TTL_MS`.

**Solução:** espere alguns segundos ou reinicie o servidor depois de rodar o `db:seed`.

### Equipe vem vazia ou incompleta

**Sintoma:** resposta com `"parcial": true` e avisos como `nenhum profissional elegível`.

**Causa:** não há profissionais cadastrados para o papel, disponíveis até a `dataEntrega` e dentro do orçamento.

**Solução:** rode `npm run db:seed`, depois `npm run exemplos` (e use os arquivos de `exemplos/gerados/`), ou use uma `dataEntrega` mais próxima ou um `orcamentoTotal` maior.

### Erro 422 "A data de entrega do projeto já passou"

**Causa:** a `dataEntrega` enviada é hoje ou anterior a hoje. Com os exemplos, acontece quando as cópias de `exemplos/gerados/` foram geradas há mais de 60 dias, ou quando o comando aponta para um modelo de `exemplos/` em vez da cópia.

**Solução:** rode `npm run exemplos` de novo (regrava `exemplos/gerados/` com hoje + 60 dias) e envie os arquivos de `exemplos/gerados/`. Os modelos de `exemplos/` não mudam, então o `git status` continua limpo. Fora dos exemplos, envie uma data futura.

## Documentação técnica

A análise crítica da ATVI, a descrição dos padrões, o diagrama de classes e as decisões de projeto estão em [docs/ATVII.md](docs/ATVII.md).
