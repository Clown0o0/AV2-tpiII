# cinebridge-recomendacao

![Node.js](https://img.shields.io/badge/Node.js-v24.15.0-339933?style=flat&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-v5.9.3-3178C6?style=flat&logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-v5.12.5-000000?style=flat&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v18.6-4169E1?style=flat&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-v6.19.3-2D3748?style=flat&logo=prisma&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-v30.5.2-C21325?style=flat&logo=jest&logoColor=white)
![ts-jest](https://img.shields.io/badge/ts--jest-v29.4.14-C21325?style=flat&logo=jest&logoColor=white)
![ts-node](https://img.shields.io/badge/ts--node-v10.9.2-3178C6?style=flat)
![ts-node-dev](https://img.shields.io/badge/ts--node--dev-v2.0.0-3178C6?style=flat)
![@types/node](https://img.shields.io/badge/%40types%2Fnode-v24.13.6-3178C6?style=flat&logo=typescript&logoColor=white)
![@types/jest](https://img.shields.io/badge/%40types%2Fjest-v30.0.0-3178C6?style=flat&logo=typescript&logoColor=white)

## Tecnologias e versões

As versões dos badges são as do `package.json` (fixas, sem `^`, iguais às do `package-lock.json`) e as da máquina em que o projeto foi testado. O `package.json` exige Node.js `>=24`. Complementos:

| Ferramenta | Versão |
|---|---|
| npm | 11.12.1 |
| PostgreSQL | 18.6 (versão testada) |
| actions/checkout (CI) | v4 |
| actions/setup-node (CI) | v4, com `node-version: 24` |
| Sistemas do CI | `ubuntu-24.04` e `windows-latest` |
| Sistemas suportados | Windows 10 ou superior; Ubuntu 24.04.03 ou superior e derivadas |

No CI, `v4`, `node-version: 24` e `windows-latest` são rótulos; a versão exata é escolhida pelo GitHub Actions a cada execução.

## Sobre o projeto

Microsserviço de recomendação e orquestração de equipes da plataforma cinebridge. Ele recebe um projeto audiovisual (gênero, orçamento, prazo, localização e papéis técnicos exigidos) e monta uma equipe de profissionais recomendada, respeitando o orçamento e o prazo.

Projeto da atividade ATVII. Sobre a base da ATVI (Strategy, Template Method, Observer e Visitor), a ATVII acrescenta **Prototype** (projetos-modelo clonados), **Factory Method** e **Abstract Factory** (uma fábrica por tipo de produção: ficção, documentário, animação e publicitário, cada uma criando o próprio projeto, validador, recomendador e notificador). A análise crítica da ATVI, a descrição dos padrões, o diagrama de classes e as decisões de projeto estão em [docs/ATVII.md](docs/ATVII.md).

## Como funciona

1. O produtor envia o projeto para `POST /projetos/recomendar`, escolhendo a estratégia de recomendação:
   - `COSSENO`: similaridade entre as competências do profissional e o perfil do papel;
   - `FILTRAGEM_COLABORATIVA`: avaliações de produtores com gosto parecido;
   - `ORCAMENTO_REDUZIDO`: prioriza profissionais mais baratos, locais e bem avaliados.
2. O serviço devolve um profissional sugerido por papel, dentro do orçamento e disponível até a data de entrega.
3. O produtor aceita, rejeita ou substitui cada sugestão; a substituição refaz só aquele papel.
4. Ao aceitar uma sugestão, o profissional recebe um convite; a resposta dele é avisada ao produtor.
5. Com todos os papéis confirmados, a equipe é finalizada e são emitidos eventos para os serviços de gerenciamento de projetos e financeiro.
6. Se o orçamento ou o prazo mudarem de forma significativa (`PATCH /projetos/:id`), a equipe inteira é recalculada.

Cada profissional sugerido recebe um aviso de interesse do produtor. Cada ação gera notificações simuladas (e-mail e mensagem interna) e um registro de auditoria em log JSON; documentário, animação e publicidade recebem também avisos próprios do tipo.

O `tipoCaptacao` (`FICCAO`, `DOCUMENTARIO`, `ANIMACAO` ou `PUBLICITARIO`) escolhe a fábrica do projeto, e os atributos próprios do tipo vão em `detalhes`. Com `modelo`, o projeto parte de um projeto-modelo clonado.

O cadastro de profissionais fica em memória (`FonteProfissionaisResiliente`), para atender 100 requisições simultâneas com até 10 mil profissionais sem consultar o banco a cada pedido:

- os candidatos são filtrados em memória;
- é carregado antes de o servidor aceitar requisições e recarregado em segundo plano a cada metade do `CATALOGO_TTL_MS`; só uma carga roda por vez, e requisições simultâneas compartilham a mesma;
- um profissional novo aparece em até `CATALOGO_TTL_MS` (padrão 60 s); se um sugerido foi removido do banco nesse intervalo, a equipe é recomposta com o cadastro recarregado;
- se o banco ficar indisponível, o último cadastro carregado continua em uso (resposta marcada como `parcial`).

Variáveis opcionais no `.env`:

```bash
CATALOGO_TTL_MS=60000          # validade do cadastro em memória
PROFISSIONAIS_TIMEOUT_MS=1500  # espera máxima pelo banco antes do fallback
```

Organização do código:

```
src/
├── domain/          Entidades (Projeto e subtipos, Profissional, Competencia, Avaliacao, Recomendacao, Convite) e interfaces de repositório
├── prototypes/      Prototype: projetos-modelo clonados (RegistroPrototipos)
├── factories/       Abstract Factory + Factory Method: uma fábrica por tipo e o registro tipo -> fábrica
│   ├── ficcao/          FabricaFiccao, NotificadorFiccao
│   ├── documentario/    FabricaDocumentario, RecomendadorDocumentario, ValidadorDocumentario, NotificadorDocumentario
│   ├── animacao/        FabricaAnimacao, RecomendadorAnimacao, ValidadorAnimacao, NotificadorAnimacao
│   └── publicitario/    FabricaPublicitario, RecomendadorPublicitario, ValidadorPublicitario, NotificadorPublicitario
├── strategies/      Strategy: algoritmos de recomendação (e a base dos recomendadores por tipo)
├── orchestration/   Template Method: OrquestradorEquipe (fluxo fixo) e OrquestradorPadrao (recebe a fábrica)
├── events/          Observer: Publicador (RecomendacaoEventEmitter) e observadores com atualizar(evento) (e-mail, mensagem interna, auditoria, base dos notificadores por tipo)
├── visitors/        Visitor: validação, compatibilidade e relatório da equipe
├── repositories/    Acesso ao banco com Prisma
├── services/        Regras de uso (SistemaRecomendacao) e tolerância a falhas
└── routes/          Rotas REST
```

## Como rodar

O projeto tem uma única pasta de código (não há frontend separado). Todos os comandos `npm` e `npx` devem ser executados na **raiz do projeto**: a pasta `AV2-tpiII/` criada pelo `git clone`, onde ficam o `package.json` e o `README.md`.

```
AV2-tpiII/            <- raiz do projeto: rode os comandos aqui
├── docs/             documentação da ATVII (ATVII.md)
├── prisma/
├── src/
├── tests/
├── package.json
└── README.md
```

Pré-requisitos: Node.js 24, npm e PostgreSQL rodando. Verifique em qualquer pasta:

```bash
node -v
npm -v
psql --version
```

1. Baixe o projeto e entre na raiz dele:
   ```bash
   git clone https://github.com/Clown0o0/AV2-tpiII.git
   cd AV2-tpiII
   ```

2. **Na raiz do projeto (`AV2-tpiII/`)**, instale as dependências (isso também gera o cliente do Prisma). As versões estão fixas no `package.json`, então o `npm install` instala exatamente as versões listadas nos badges acima:
   ```bash
   npm install
   ```

3. **Na raiz do projeto (`AV2-tpiII/`)**, crie um arquivo chamado `.env` (ao lado do `package.json`) com o conteúdo abaixo, trocando usuário, senha, porta e nome do banco pelos do seu PostgreSQL:
   ```bash
   # formato: postgresql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO?schema=public
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cinebridge_recomendacao?schema=public"
   PORT=3000
   ```
   O `.env` não vai para o Git (está no `.gitignore`), então sua senha fica só na sua máquina. Sem esse arquivo, o Prisma e o servidor não acham o banco.

4. **Em qualquer pasta** (este comando fala direto com o PostgreSQL, não depende do projeto), crie o banco:
   ```bash
   createdb -U postgres cinebridge_recomendacao
   # ou: psql -U postgres -c "CREATE DATABASE cinebridge_recomendacao;"
   ```

5. **Na raiz do projeto (`AV2-tpiII/`)**, crie as tabelas:
   ```bash
   npx prisma migrate deploy
   ```
   Devem aparecer as duas migrations do projeto: `20260925000000_init` (tabelas da ATVI) e `20261015000000_tipos_de_projeto` (tipo `PUBLICITARIO` e coluna `detalhes`), seguidas de `All migrations have been successfully applied.`

6. (Opcional) **Na raiz do projeto (`AV2-tpiII/`)**, popule o banco com profissionais de exemplo. **O seed apaga os dados existentes antes de inserir.** O padrão é 300 profissionais; use `SEED_PROFISSIONAIS` para mudar:
   ```bash
   npm run db:seed
   # Linux/macOS: SEED_PROFISSIONAIS=10000 npm run db:seed
   # PowerShell:  $env:SEED_PROFISSIONAIS=10000; npm run db:seed
   ```

7. **Na raiz do projeto (`AV2-tpiII/`)**, suba o servidor. Este terminal fica ocupado enquanto o servidor estiver rodando (Ctrl+C para parar):
   ```bash
   npm run dev
   ```
   Ou, compilando com o `tsc` e executando o `.js` gerado em `dist/`:
   ```bash
   npm run build
   npm start
   ```

8. **Em outro terminal, em qualquer pasta**, confirme que está no ar:
   ```bash
   curl http://localhost:3000/health
   # resposta: {"status":"ok"}
   ```

Testes (com cobertura mínima de 80%). **Na raiz do projeto (`AV2-tpiII/`)**; não precisam do PostgreSQL nem do servidor rodando:

```bash
npm run test
```

## Compatibilidade

Sistemas suportados:

- **Windows 10 ou superior** (cmd ou PowerShell);
- **Ubuntu 24.04.03 ou superior** e distribuições derivadas do Ubuntu 24.04 (Linux Mint 22.x, Pop!_OS 24.04, Kubuntu/Xubuntu/Lubuntu 24.04 etc.).

Pré-requisitos por sistema:

| | Windows 10+ | Ubuntu 24.04.03+ e derivadas |
|---|---|---|
| Node.js 24 | instalador de https://nodejs.org (ou `winget install OpenJS.NodeJS.LTS`, conferindo `node -v` = 24) | `nvm install 24` (https://github.com/nvm-sh/nvm) ou o repositório da NodeSource |
| PostgreSQL | instalador de https://www.postgresql.org/download/windows/ (serviço `postgresql-x64-NN`) | `sudo apt install postgresql` e `sudo systemctl start postgresql` |

O código não tem scripts de shell nem caminhos fixos de sistema: os scripts do `package.json` rodam iguais no cmd, no PowerShell e no bash, e os caminhos usados nos testes são montados com `node:path`. O `.gitattributes` fixa o fim de linha em LF, para o checkout no Windows não alterar os arquivos. A única diferença entre sistemas é como definir variáveis de ambiente na linha de comando (veja o passo 6 de "Como rodar").

O GitHub Actions (`.github/workflows/ci.yml`) roda `npm ci`, `npx prisma generate`, `npx tsc --noEmit`, `npm run build` e `npm test` em `ubuntu-24.04` e `windows-latest` com Node 24. Os testes não precisam de PostgreSQL.

Quem já tem o banco da ATVI só precisa rodar `npx prisma migrate deploy` (passo 5 de "Como rodar"): apenas a migration nova da ATVII é aplicada.

## Endpoints

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/projetos/recomendar` | Recebe o projeto (ou um `modelo` + ajustes) e devolve a equipe recomendada |
| GET | `/projetos/modelos` | Lista as chaves dos projetos-modelo aceitas em `modelo` |
| PATCH | `/projetos/:id` | Altera orçamento, prazo ou estratégia; recalcula a equipe se a mudança for significativa |
| POST | `/recomendacoes/:id/membros/:papel/aceitar` | Aceita a sugestão e envia convite ao profissional |
| POST | `/recomendacoes/:id/membros/:papel/rejeitar` | Rejeita a sugestão; o papel fica em aberto |
| POST | `/recomendacoes/:id/membros/:papel/substituir` | Nova sugestão só para o papel (body opcional `{"estrategia": "..."}`) |
| POST | `/convites/:id/responder` | Profissional responde `{"aceito": true}` ou `{"aceito": false}` |
| GET | `/recomendacoes/:id` | Estado atual da equipe e dos convites |
| GET | `/recomendacoes/:id/relatorio` | Relatório, validação e compatibilidade da equipe |
| GET | `/health` | Verifica se o servidor está no ar |

Papéis válidos: `DIRETOR`, `DIRETOR_FOTOGRAFIA`, `SONOPLASTA`, `EDITOR`, `ROTEIRISTA`, `EFEITOS_VISUAIS`.

Exemplo de requisição: um documentário de baixo orçamento.

```bash
curl -X POST http://localhost:3000/projetos/recomendar   -H "content-type: application/json"   -d '{
    "titulo": "Memórias do Corporativo",
    "produtorId": "produtor-1",
    "genero": "Drama",
    "duracaoEstimadaMin": 88,
    "orcamentoTotal": 45000,
    "dataEntrega": "2027-04-01T00:00:00Z",
    "tipoCaptacao": "DOCUMENTARIO",
    "localizacao": "São Paulo",
    "estrategia": "ORCAMENTO_REDUZIDO",
    "papeis": [
      { "papel": "DIRETOR", "peso": 3 },
      { "papel": "ROTEIRISTA", "peso": 2 },
      { "papel": "SONOPLASTA", "peso": 1 }
    ]
  }'
```

`tipoCaptacao` aceita `DOCUMENTARIO`, `FICCAO`, `ANIMACAO` ou `PUBLICITARIO`. A `dataEntrega` precisa ser uma data futura.

Exemplo com atributos específicos do tipo (`detalhes`): uma animação em 3D.

```bash
curl -X POST http://localhost:3000/projetos/recomendar   -H "content-type: application/json"   -d '{
    "titulo": "Órbita",
    "produtorId": "produtor-2",
    "genero": "Ficção científica",
    "duracaoEstimadaMin": 12,
    "orcamentoTotal": 90000,
    "dataEntrega": "2027-06-01T00:00:00Z",
    "tipoCaptacao": "ANIMACAO",
    "localizacao": "Recife",
    "detalhes": { "tecnica": "3D", "softwares": ["Blender", "Houdini"], "quadrosPorSegundo": 24 },
    "papeis": [
      { "papel": "DIRETOR", "peso": 2 },
      { "papel": "EFEITOS_VISUAIS", "peso": 3 }
    ]
  }'
```

Exemplo a partir de um projeto-modelo: um comercial que usa o modelo `publicitario` e só troca a marca e a estratégia.

```bash
curl http://localhost:3000/projetos/modelos
# resposta: {"modelos":["ficcao","documentario","animacao","publicitario"]}

curl -X POST http://localhost:3000/projetos/recomendar   -H "content-type: application/json"   -d '{
    "modelo": "publicitario",
    "titulo": "Verão Aurora",
    "produtorId": "produtor-3",
    "orcamentoTotal": 60000,
    "dataEntrega": "2027-02-01T00:00:00Z",
    "localizacao": "Rio de Janeiro",
    "estrategia": "ORCAMENTO_REDUZIDO",
    "detalhes": { "marca": "Café Aurora" }
  }'
```

Os exemplos funcionam como estão no bash do Linux e do macOS. **No Windows** (PowerShell, cmd ou Git Bash), salve o JSON (o trecho entre `'{` e `}'`) num arquivo `projeto.json` em UTF-8 (o padrão do VS Code e do Bloco de Notas) e envie o arquivo, como em [Erro 400 "Request body size did not match Content-Length"](#erro-400-request-body-size-did-not-match-content-length-ou-body-is-not-valid-json).

## Solução de problemas

Os comandos `npm` e `npx` desta seção também devem ser executados na raiz do projeto (`AV2-tpiII/`).

### Não conecta ao banco

**Sintoma:** `P1001: Can't reach database server` ou `ECONNREFUSED`.

**Causa:** o PostgreSQL não está rodando, ou o host/porta da `DATABASE_URL` estão errados.

**Solução:** inicie o PostgreSQL e confira o `.env`.
```bash
# Linux
sudo systemctl start postgresql
# Windows (PowerShell como administrador; o nome varia com a versão)
Get-Service postgresql*
Start-Service postgresql-x64-17
```

### Usuário ou senha inválidos

**Sintoma:** `P1000: Authentication failed against database server`.

**Causa:** usuário ou senha da `DATABASE_URL` não conferem.

**Solução:** corrija no `.env`. Caracteres especiais na senha precisam ser codificados (ex.: `@` vira `%40`).

### Banco não existe

**Sintoma:** `P1003: Database cinebridge_recomendacao does not exist`.

**Causa:** o banco ainda não foi criado.

**Solução:**
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

### Versão do Node incompatível

**Sintoma:** `npm warn EBADENGINE Unsupported engine` ou erro ao iniciar.

**Causa:** o projeto exige Node 24.

**Solução:** instale o Node 24 (https://nodejs.org ou `nvm install 24` e `nvm use 24`), apague a pasta `node_modules` e rode `npm install` de novo.

### Porta em uso

**Sintoma:** `EADDRINUSE: address already in use 0.0.0.0:3000`.

**Causa:** outro processo já usa a porta 3000.

**Solução:** troque `PORT` no `.env` (ex.: `PORT=3001`) ou encerre o outro processo.

### Testes estourando o tempo

**Sintoma:** `Exceeded timeout of 5000 ms for a test`.

**Causa:** os testes com 10.000 profissionais e com 100 requisições simultâneas são mais pesados em máquinas lentas.

**Solução:**
```bash
npm run test -- --testTimeout=30000
```

### Erros de tipo depois de mudar o schema.prisma

**Sintoma:** `Property 'xyz' does not exist on type ...` ou `@prisma/client did not initialize yet`.

**Causa:** o cliente do Prisma não foi gerado de novo.

**Solução:**
```bash
npx prisma generate
```

### EPERM ao gerar o Prisma no Windows

**Sintoma:** `EPERM: operation not permitted, rename '...query_engine-windows.dll.node...'`.

**Causa:** o `npm run dev` está rodando e bloqueia o arquivo.

**Solução:** pare o servidor (Ctrl+C) e rode `npx prisma generate` de novo.

### curl não funciona no PowerShell

**Sintoma:** erro de parâmetro ao usar `curl -X POST ...`.

**Causa:** no Windows PowerShell, `curl` é outro comando (`Invoke-WebRequest`).

**Solução:** use `curl.exe` ou `Invoke-RestMethod http://localhost:3000/health`. Para `POST`/`PATCH` com corpo JSON, não passe o JSON com `-d '...'` no PowerShell (ele remove as aspas internas e o servidor responde `Body is not valid JSON`); use um arquivo, como no item seguinte.

### Erro 400 "Request body size did not match Content-Length" ou "Body is not valid JSON"

**Causa:** no Windows, o JSON passado direto na linha de comando (`-d '{...}'`) chega alterado: o PowerShell remove as aspas internas, e o Git Bash muda a codificação de letras acentuadas (`São Paulo`, `Órbita`).

**Solução:** salve o corpo num arquivo `projeto.json` em UTF-8 e envie com `--data-binary`:
```powershell
curl.exe -X POST http://localhost:3000/projetos/recomendar -H "content-type: application/json" --data-binary "@projeto.json"
```

### psql ou createdb não é reconhecido (Windows)

**Sintoma:** `psql : O termo 'psql' não é reconhecido...` ou `'createdb' não é reconhecido como um comando interno`.

**Causa:** o instalador do PostgreSQL no Windows não coloca a pasta `bin` no `PATH`.

**Solução:** use o caminho completo (troque `18` pela sua versão) ou adicione a pasta ao `PATH` nas variáveis de ambiente do Windows:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres cinebridge_recomendacao
```

### Peer authentication failed (Ubuntu)

**Sintoma:** `createdb: error: ... Peer authentication failed for user "postgres"`.

**Causa:** no Ubuntu, o usuário `postgres` do banco só aceita login local pelo usuário `postgres` do sistema, e vem sem senha.

**Solução:** crie o banco como esse usuário e defina a senha usada na `DATABASE_URL`:
```bash
sudo -u postgres createdb cinebridge_recomendacao
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
```

### Profissionais recém-cadastrados ou apagados não aparecem

**Causa:** o cadastro fica em memória e é recarregado a cada `CATALOGO_TTL_MS/2`.

**Solução:** espere alguns segundos ou reinicie o `npm run dev` depois de rodar o `db:seed`.

### Equipe vem vazia ou incompleta

**Sintoma:** resposta com `"parcial": true` e avisos como `nenhum profissional elegível`.

**Causa:** não há profissionais cadastrados para o papel, disponíveis até a `dataEntrega` e dentro do orçamento.

**Solução:** rode `npm run db:seed`, use uma `dataEntrega` mais próxima ou aumente o `orcamentoTotal`.

### Erro 422 "A data de entrega do projeto já passou"

**Causa:** a `dataEntrega` enviada é anterior a hoje.

**Solução:** envie uma data futura.
