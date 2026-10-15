# ATVII: análise crítica, padrões e decisões

Documentação da atividade ATVII do `cinebridge-recomendacao`. Como instalar, rodar e resolver problemas está no [README](../README.md).

## Análise crítica da ATVI

Antes de aplicar os padrões, revisamos o código da ATVI procurando pontos de rigidez (mudança simples exige mexer em vários lugares), fragilidade (mudança num lugar quebra outro) e imobilidade (código que não dá para reaproveitar). O código da ATVI não está mais neste diretório; a coluna "Onde estava" cita arquivo e método, sem número de linha.

| Sintoma | Onde estava no código da ATVI | Consequência | Padrão que resolveu | Onde está agora |
|---|---|---|---|---|
| Rigidez | `Projeto` (`src/domain/entities/Projeto.ts`) era uma classe única. `tipoCaptacao` (`DOCUMENTARIO`, `FICCAO`, `ANIMACAO`) só aparecia no relatório. A lista de tipos estava repetida em `Projeto.ts` (`TIPOS_CAPTACAO`), no enum `TipoCaptacao` do Prisma, no schema Fastify de `recomendacao.routes.ts` e no mapeamento de `PrismaProjetoRepository`. | O tipo não mudava nenhum comportamento. Um tipo novo exigia editar quatro arquivos de camadas diferentes. | Abstract Factory | Uma fábrica por tipo em `src/factories/<tipo>/`, ligadas ao tipo só em `FabricaProjetoRegistry`. O schema da rota monta o `enum` com `service.tiposCaptacao()` (tipos registrados) e `projetoParaDominio` reconstrói o subtipo com `fabricas.obter(tipo).criarProjeto(...)`. Para **persistir** um tipo novo, `TIPOS_CAPTACAO` e o enum do Prisma (com migration) ainda precisam mudar. |
| Rigidez | `SistemaRecomendacao.recomendar` fazia `new Projeto(dados)`; `gerarRelatorio` fazia `new ValidacaoConsistenciaVisitor(...)`; o construtor do serviço fazia `new OrquestradorPadrao()`. | Criação e validação presas às classes concretas; trocar a classe por tipo exigiria `if`/`switch` no serviço. | Factory Method (`criarProjeto`, `criarValidador`) | `SistemaRecomendacao.recomendar` chama `fabricas.obter(tipoCaptacao).criarProjeto(dados)`; `gerarRelatorio` chama `fabricaDe(projeto).criarValidador(...)`; o orquestrador é criado por `criarComposicao(fabrica)` (padrão `new OrquestradorPadrao(fabrica)`) em `src/services/SistemaRecomendacao.ts`. `RelatorioVisitor` e `CompatibilidadeEquipeVisitor` continuam criados com `new` em `gerarRelatorio`, iguais para todos os tipos. |
| Fragilidade | `PERFIL_PADRAO_POR_PAPEL` (`Projeto.ts`) e a estratégia (`OrquestradorPadrao.aplicarEstrategia`) eram globais, iguais para qualquer gênero. | Ajustar a recomendação de animação ou publicidade significava editar o fluxo comum, com risco de mudar o resultado dos outros tipos. | Abstract Factory + Factory Method (`criarRecomendador`) | `OrquestradorPadrao.aplicarEstrategia` pede o recomendador à fábrica (`fabrica.comEstrategia(base).criarRecomendador()`). Os `RecomendadorDocumentario`/`Animacao`/`Publicitario` (`src/factories/<tipo>/`, base `src/strategies/RecomendadorPorTipo.ts`) decoram a estratégia escolhida. O `PERFIL_PADRAO_POR_PAPEL` em si continua global e não mudou. |
| Fragilidade | `EmailObserver`, `MensagemInternaObserver` e `AuditoriaObserver` (`src/events/observers/`) eram globais e sem noção de tipo. | Uma notificação específica de um tipo exigiria condicionais por tipo dentro desses observers. | Abstract Factory + Factory Method (`criarNotificador`) | Os três observers genéricos continuam sem noção de tipo. Os avisos por tipo ficam em `NotificadorDocumentario`/`Animacao`/`Publicitario` (base `src/events/observers/NotificadorPorTipo.ts`, que filtra pelo `tipoCaptacao` do evento), criados pela fábrica e registrados uma vez em `src/server.ts`. |
| Imobilidade | Não havia forma de reaproveitar um projeto pronto (papéis, pesos, atributos): cada `POST /projetos/recomendar` começava do zero. | Configurações repetidas eram digitadas de novo a cada cadastro. | Prototype | `Projeto.clonar()` e as sobrescritas nos subtipos (`src/domain/entities/`); `RegistroPrototipos.criarAPartirDe` (`src/prototypes/RegistroPrototipos.ts`); campo `modelo` em `POST /projetos/recomendar` e `GET /projetos/modelos`. |

## Padrões de projeto da ATVII

**Prototype.** `Projeto.clonar(ajustes?)` devolve uma cópia profunda do projeto: novo `id`, novo `criadoEm`, valores atuais (inclusive orçamento, prazo e estratégia alterados depois da criação), papéis com `competenciasDesejadas` e atributos do subtipo copiados. A cópia passa de novo pelo construtor, então os ajustes são validados. `ProjetoDocumentario`, `ProjetoAnimacao` e `ProjetoPublicitario` sobrescrevem `clonar()` e devolvem o próprio tipo. O `RegistroPrototipos` guarda um projeto-modelo por chave (`ficcao`, `documentario`, `animacao`, `publicitario`) e cria projetos novos com `criarAPartirDe(chave, ajustes)`; é usado pelo campo `modelo` de `POST /projetos/recomendar`.

**Abstract Factory.** A interface `FabricaProjeto` (`src/factories/FabricaProjeto.ts`) é implementada por `FabricaFiccao`, `FabricaDocumentario`, `FabricaAnimacao` e `FabricaPublicitario`. Cada uma cria só objetos do próprio tipo, então projeto, validador, recomendador e notificador sempre combinam entre si.

**Factory Method.** `criarProjeto`, `criarValidador`, `criarRecomendador` e `criarNotificador` são os métodos de fábrica; cada fábrica concreta decide a classe criada. A base `FabricaProjetoBase` guarda as opções e implementa `comEstrategia(base)`, que devolve a mesma fábrica usando a estratégia escolhida pelo produtor como base do recomendador.

**Uso no fluxo.** `OrquestradorPadrao` (o orquestrador) recebe a `FabricaProjeto` no construtor e pede a ela o recomendador na etapa de aplicar a estratégia; não há nenhum `if`/`switch` por tipo em `src/orchestration/` (um teste lê os arquivos e confere). O `SistemaRecomendacao` pega a fábrica no `FabricaProjetoRegistry` pelo `tipoCaptacao` e a usa para criar o projeto, o orquestrador e o validador. Os notificadores são criados uma vez, no `server.ts`, um por fábrica registrada.

**Tipo novo.** Basta criar a fábrica (e as classes da família) e registrar no `FabricaProjetoRegistry`. O teste `tests/integration/fabricas.integration.test.ts` define uma `FabricaRealidadeVirtual` dentro do próprio arquivo e roda o fluxo completo pela API sem mudar orquestrador nem serviço. Para persistir um tipo novo de verdade, ele também precisa entrar em `TIPOS_CAPTACAO` e no enum `TipoCaptacao` do banco (com migration).

### Diagrama de classes -> código

Os nomes do código seguem os do diagrama do enunciado: `OrquestradorEquipe` (`orquestrar`, `validarRestricoes`, `normalizarDados`, `aplicarEstrategia`, `posProcessar`) e `OrquestradorPadrao` em `src/orchestration/`, `SistemaRecomendacao` em `src/services/`, `RecomendacaoStrategy.recomendar` em `src/strategies/` e `Observador.atualizar(evento: EventoRecomendacao)` em `src/events/RecomendacaoEventEmitter.ts`. Até a ATVI, esses três primeiros se chamavam `ComposicaoEquipeTemplate`, `ComposicaoEquipeDefault` e `RecomendacaoService`, e o método da estratégia era `ranquear`.

O Observer segue a forma Publicador/Assinante: `RecomendacaoEventEmitter` implementa `Publicador` (`adicionar`, `remover`, `notificar`), usando o `EventEmitter` do Node por baixo, e cada `Observador` recebe todo `EventoRecomendacao` em `atualizar(evento)` e trata só os eventos que lhe interessam (pelo `evento.nome`). `publicar(nome, payload)` e `registrar(...observadores)` são atalhos para `notificar` e `adicionar`.

O que ainda difere do diagrama:

| Diagrama | Código |
|---|---|
| `Projeto` (`clonar(): Projeto`) | `Projeto` (`src/domain/entities/Projeto.ts`), que também é o projeto de ficção |
| `FabricaProjeto` | `FabricaProjeto` + `FabricaProjetoBase` (`src/factories/FabricaProjeto.ts`) |
| `FabricaDocumentario` / `FabricaAnimacao` / `FabricaPublicitario` | mesmos nomes, em `src/factories/<tipo>/`, mais `FabricaFiccao` |
| `VisitanteProjeto` (`visitarProjeto`, `visitarProfissional`) | `ProjetoVisitor<R>` (`src/visitors/ProjetoVisitor.ts`), que estende `Visitante`; os elementos implementam `Elemento` (`src/domain/entities/Visitante.ts`); os `ValidadorX` estendem `ValidacaoConsistenciaVisitor` |

### Estrutura implementada

O diagrama do enunciado é conceitual; este é o que está no código. Para não repetir 4 vezes a mesma forma, os produtos de cada fábrica aparecem pelas bases: `ValidadorDocumentario`/`Animacao`/`Publicitario` estendem `ValidacaoConsistenciaVisitor`, `RecomendadorDocumentario`/`Animacao`/`Publicitario` estendem `RecomendadorPorTipo` e `NotificadorDocumentario`/`Animacao`/`Publicitario` estendem `NotificadorPorTipo`. A `FabricaFiccao` devolve o `ValidacaoConsistenciaVisitor` base, a própria estratégia escolhida e um `NotificadorFiccao` vazio.

```mermaid
classDiagram
    class Projeto {
        +id
        +tipoCaptacao
        +detalhes
        +clonar(ajustes) Projeto
        +alterar(alteracoes) ResultadoAlteracao
        +aceitar(visitante)
    }
    class ProjetoDocumentario {
        +tema
        +entrevistados
        +clonar(ajustes) ProjetoDocumentario
    }
    class ProjetoAnimacao {
        +tecnica
        +softwares
        +quadrosPorSegundo
        +clonar(ajustes) ProjetoAnimacao
    }
    class ProjetoPublicitario {
        +marca
        +canais
        +duracaoMaxSegundos
        +clonar(ajustes) ProjetoPublicitario
    }
    Projeto <|-- ProjetoDocumentario
    Projeto <|-- ProjetoAnimacao
    Projeto <|-- ProjetoPublicitario

    class RegistroPrototipos {
        +padrao() RegistroPrototipos$
        +registrar(chave, prototipo)
        +criarAPartirDe(chave, ajustes) Projeto
        +chaves() string[]
    }
    RegistroPrototipos o-- Projeto : modelos clonados

    class FabricaProjeto {
        <<interface>>
        +tipo
        +comEstrategia(base) FabricaProjeto
        +criarProjeto(dados) Projeto
        +criarValidador(dataReferencia) ProjetoVisitor
        +criarRecomendador() RecomendacaoStrategy
        +criarNotificador() Observador
    }
    class FabricaProjetoBase {
        <<abstract>>
        #opcoes
        +comEstrategia(base) FabricaProjeto
    }
    FabricaProjeto <|.. FabricaProjetoBase
    FabricaProjetoBase <|-- FabricaFiccao
    FabricaProjetoBase <|-- FabricaDocumentario
    FabricaProjetoBase <|-- FabricaAnimacao
    FabricaProjetoBase <|-- FabricaPublicitario

    class FabricaProjetoRegistry {
        +padrao(opcoes) FabricaProjetoRegistry$
        +registrar(fabrica)
        +obter(tipo) FabricaProjeto
        +tipos()
        +todas()
    }
    FabricaProjetoRegistry o-- FabricaProjeto

    FabricaProjeto ..> Projeto : cria
    FabricaProjeto ..> ProjetoVisitor : cria
    FabricaProjeto ..> RecomendacaoStrategy : cria
    FabricaProjeto ..> Observador : cria

    class ProjetoVisitor~R~ {
        <<interface>>
        +visitarProjeto(projeto)
        +visitarRecomendacao(recomendacao)
        +visitarMembro(membro)
        +visitarProfissional(profissional)
        +resultado() R
    }
    class ValidacaoConsistenciaVisitor {
        #errosDoTipo(projeto) string[]
    }
    ProjetoVisitor <|.. ValidacaoConsistenciaVisitor
    ProjetoVisitor <|.. RelatorioVisitor
    ProjetoVisitor <|.. CompatibilidadeEquipeVisitor

    class RecomendacaoStrategy {
        <<interface>>
        +tipo
        +descricao
        +recomendar(candidatos, contexto) CandidatoPontuado[]
    }
    class RecomendadorPorTipo {
        <<abstract>>
        +base
        #competenciasValorizadas
    }
    RecomendacaoStrategy <|.. CossenoStrategy
    RecomendacaoStrategy <|.. FiltragemColaborativaStrategy
    RecomendacaoStrategy <|.. OrcamentoReduzidoStrategy
    RecomendacaoStrategy <|.. RecomendadorPorTipo
    RecomendadorPorTipo o-- RecomendacaoStrategy : decora

    class Observador {
        <<interface>>
        +nome
        +atualizar(evento: EventoRecomendacao)
    }
    class Publicador {
        <<interface>>
        +adicionar(observador)
        +remover(observador)
        +notificar(evento: EventoRecomendacao)
    }
    Publicador <|.. RecomendacaoEventEmitter
    class NotificadorPorTipo {
        <<abstract>>
        +tipoCaptacao
        +enviadas
    }
    Observador <|.. EmailObserver
    Observador <|.. MensagemInternaObserver
    Observador <|.. AuditoriaObserver
    Observador <|.. NotificadorPorTipo
    Observador <|.. NotificadorFiccao
    RecomendacaoEventEmitter o-- Observador : observadores

    class OrquestradorEquipe {
        <<abstract>>
        +orquestrar(entrada) ResultadoComposicao
        #validarRestricoes(entrada)
        #normalizarDados(entrada)
        #aplicarEstrategia(entrada)
        #posProcessar(rankings, entrada)
    }
    class OrquestradorPadrao {
        -fabrica: FabricaProjeto
    }
    OrquestradorEquipe <|-- OrquestradorPadrao
    OrquestradorPadrao --> FabricaProjeto : pede o recomendador

    class SistemaRecomendacao {
        +recomendar(dados)
        +recomendarAPartirDoModelo(modelo, ajustes)
        +alterarProjeto(id, alteracoes)
        +gerarRelatorio(recomendacaoId)
        +modelos()
        +tiposCaptacao()
    }
    SistemaRecomendacao --> FabricaProjetoRegistry
    SistemaRecomendacao --> RegistroPrototipos
    SistemaRecomendacao --> RecomendacaoEventEmitter : publica eventos
    SistemaRecomendacao ..> OrquestradorEquipe : criarComposicao(fabrica)
    SistemaRecomendacao ..> ProjetoVisitor : roda os visitors
```

## Decisões

O enunciado não define os pontos abaixo; são escolhas nossas.

- **D1 — Tipos.** `PUBLICITARIO` entrou em `tipoCaptacao`. `FICCAO` continua existindo, com a `FabricaFiccao`, que repete o comportamento da ATVI: `Projeto` base, `ValidacaoConsistenciaVisitor`, estratégia escolhida sem ajuste e nenhuma notificação além das genéricas. São 4 fábricas.
- **D2 — Atributos específicos** (campo `detalhes`; todos opcionais, com valor padrão, e validados só quando enviados; valor inválido gera 422):

  | Tipo | Atributos (padrão) |
  |---|---|
  | `DOCUMENTARIO` | `tema` (o gênero), `entrevistados` (`[]`) |
  | `ANIMACAO` | `tecnica`: `2D`, `3D` ou `STOP_MOTION` (`2D`), `softwares` (`[]`), `quadrosPorSegundo` > 0 (`24`) |
  | `PUBLICITARIO` | `marca` (o título), `canais` (`[]`), `duracaoMaxSegundos` > 0 (`duracaoEstimadaMin * 60`) |
  | `FICCAO` | nenhum (`detalhes` é ignorado e volta `null`) |

  Valores derivados (tema, marca, duração máxima) não são copiados no clone quando não foram informados: são recalculados a partir do campo de origem do clone.
- **D3 — Persistência.** Coluna `detalhes JSONB NULL` em `Projeto` (sem herança de tabela) e migration `20261015000000_tipos_de_projeto`. O repositório reconstrói o subtipo pela fábrica do tipo gravado (`FabricaProjetoRegistry`).
- **D4 — Prototype.** Modelos padrão: ficção (DIRETOR, ROTEIRISTA, DIRETOR_FOTOGRAFIA, EDITOR), documentário (DIRETOR, ROTEIRISTA, EDITOR; estratégia `ORCAMENTO_REDUZIDO`), animação (DIRETOR, EFEITOS_VISUAIS, SONOPLASTA; 3D, Blender, 24 qps) e publicitário (DIRETOR, DIRETOR_FOTOGRAFIA, EDITOR; 1 min, até 60 s, TV e redes sociais). Com `modelo`, o pedido precisa de `titulo`, `produtorId`, `orcamentoTotal`, `dataEntrega` e `localizacao`; o resto vem do modelo, e o que for enviado sobrescreve. `tipoCaptacao`, se enviado, precisa ser o do modelo. Sem `modelo`, nada mudou.
- **D5 — Fábricas.** Os recomendadores por tipo **decoram** a estratégia escolhida (`COSSENO`, `FILTRAGEM_COLABORATIVA` ou `ORCAMENTO_REDUZIDO`): score final = 80% o da estratégia + 20% a afinidade do profissional com as competências do tipo (documentário: `pesquisa`, `narrativa`, `captacao_som`; animação: `vfx`, `animacao_3d`, `composicao`; publicitário: `ritmo`, `color_grading`, `iluminacao`). O score continua em [0, 1] e `tipo`/`descricao` são os da estratégia, então a API continua mostrando a estratégia escolhida. A estratégia chega à fábrica por `fabrica.comEstrategia(base)`. Validadores: documentário exige `ROTEIRISTA`; animação exige `EFEITOS_VISUAIS`; publicitário exige `duracaoEstimadaMin * 60 <= duracaoMaxSegundos`. Esses erros aparecem em `validacao` do relatório (não bloqueiam a recomendação). Notificadores: avisos simulados próprios do tipo ao gerar a recomendação, ao rejeitar um membro e ao finalizar a equipe; só reagem a eventos do próprio tipo (o serviço passou a mandar `tipoCaptacao` em todo evento).
- **D6 — Orquestrador.** `new OrquestradorPadrao(fabrica, opcoes?)`. O fluxo validar -> normalizar -> aplicar estratégia -> pós-processar e a trava de `orquestrar()` não mudaram.
- **D7 — Serviço.** `SistemaRecomendacao` aceita `fabricas` (padrão `FabricaProjetoRegistry.padrao()`) e `prototipos` (padrão `RegistroPrototipos.padrao()`). A antiga dependência opcional `composicao` virou `criarComposicao?: (fabrica) => OrquestradorEquipe`, já que o orquestrador agora depende da fábrica de cada projeto.
- **D8 — Relatório por tipo.** O texto do enunciado cita um "gerador de relatório com métricas de eficiência de renderização" para animação, mas a `FabricaProjeto` do diagrama tem só quatro métodos (projeto, validador, recomendador, notificador). Tratamos o diagrama como especificação: não há `criarRelatorio()`, e o `RelatorioVisitor` continua genérico para todos os tipos (ele só mostra os `detalhes` do subtipo). Relatório com métricas de renderização não foi implementado.
