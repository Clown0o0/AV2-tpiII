import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app';
import type { OrigemDosProfissionais } from '../../src/domain/ports/FonteDeProfissionais';
import type { ProjetoJson, RecomendacaoJson } from '../../src/routes/serializadores';
import type { PapelTecnico, Projeto, TipoCaptacao } from '../../src/domain/entities/Projeto';
import { Projeto as ProjetoBase, type DadosProjeto } from '../../src/domain/entities/Projeto';
import { lerTexto } from '../../src/domain/entities/detalhesProjeto';
import { RecomendacaoEventEmitter } from '../../src/events/RecomendacaoEventEmitter';
import { AuditoriaObservador } from '../../src/events/observadores/AuditoriaObservador';
import { EmailObservador } from '../../src/events/observadores/EmailObservador';
import { NotificadorPorTipo } from '../../src/events/observadores/NotificadorPorTipo';
import { FabricaProjetoBase, type FabricaProjeto } from '../../src/factories/FabricaProjeto';
import { RegistroFabricas } from '../../src/factories/RegistroFabricas';
import { FabricaAnimacao } from '../../src/factories/animacao/FabricaAnimacao';
import { FabricaDocumentario } from '../../src/factories/documentario/FabricaDocumentario';
import { OrquestradorPadrao } from '../../src/orchestration/OrquestradorPadrao';
import { CossenoStrategy } from '../../src/strategies/CossenoStrategy';
import type { RecomendacaoStrategy } from '../../src/strategies/RecomendacaoStrategy';
import { RecomendadorPorTipo } from '../../src/strategies/RecomendadorPorTipo';
import { RelatorioVisitor } from '../../src/visitors/RelatorioVisitor';
import { ValidacaoConsistenciaVisitor } from '../../src/visitors/ValidacaoConsistenciaVisitor';
import { criarProfissional, dadosProjeto, DATA_ENTREGA, DATA_REFERENCIA, elencoCompleto, OPCOES_FABRICA } from '../support/fixtures';
import { InMemoryProfissionalRepository, InMemoryProjetoRepository, LoggerMemoria } from '../support/InMemoryRepositories';
import { criarSistemaDeTeste } from '../support/sistema';

interface RespostaRecomendacao {
  projeto: ProjetoJson;
  recomendacao: RecomendacaoJson;
  fonteProfissionais: OrigemDosProfissionais;
}

// ---------------------------------------------------------------------------------------------
// Tipo novo definido SÓ aqui: realidade virtual. Prova que um tipo novo não exige mudar
// OrquestradorEquipe, OrquestradorPadrao nem SistemaRecomendacao.
// (Um tipo novo de verdade também entraria em TIPOS_CAPTACAO e no enum do banco.)
// ---------------------------------------------------------------------------------------------
const REALIDADE_VIRTUAL = 'REALIDADE_VIRTUAL' as TipoCaptacao;

class ProjetoRealidadeVirtual extends ProjetoBase {
  readonly plataforma: string;

  constructor(dados: DadosProjeto) {
    super({ ...dados, tipoCaptacao: REALIDADE_VIRTUAL });
    this.plataforma = dados.detalhes?.plataforma === undefined ? 'Meta Quest' : lerTexto(dados.detalhes.plataforma, 'plataforma');
  }

  override get detalhes() {
    return { plataforma: this.plataforma };
  }

  protected override validarTipoCaptacao(): void {}
}

class ValidadorRealidadeVirtual extends ValidacaoConsistenciaVisitor {
  protected override errosDoTipo(projeto: Projeto): string[] {
    return projeto.papeis.some((p) => p.papel === 'DIRETOR_FOTOGRAFIA') ? [] : ['Realidade virtual exige DIRETOR_FOTOGRAFIA (captação 360°)'];
  }
}

class RecomendadorRealidadeVirtual extends RecomendadorPorTipo {
  protected readonly competenciasValorizadas = ['camera', 'composicao'];
}

class NotificadorRealidadeVirtual extends NotificadorPorTipo {
  readonly nome = 'notificador-realidade-virtual';
  protected textoRecomendacao = (projeto: Projeto) => `VR "${projeto.titulo}": reserve o rig de câmeras 360°.`;
  protected textoPapelEmAberto = (papel: PapelTecnico) => `VR: papel ${papel} em aberto.`;
  protected textoEquipeFinalizada = () => 'Equipe de VR completa.';
}

class FabricaRealidadeVirtual extends FabricaProjetoBase {
  readonly tipo = REALIDADE_VIRTUAL;
  comEstrategia(base: RecomendacaoStrategy): FabricaRealidadeVirtual {
    return new FabricaRealidadeVirtual(this.opcoesComEstrategia(base));
  }
  criarProjeto = (dados: DadosProjeto) => new ProjetoRealidadeVirtual(dados);
  criarValidador = (dataReferencia = new Date()) => new ValidadorRealidadeVirtual(dataReferencia);
  criarRecomendador = () => new RecomendadorRealidadeVirtual(this.opcoes.estrategiaBase);
  criarNotificador = () => new NotificadorRealidadeVirtual(this.tipo, this.opcoes.logger);
  criarRelatorio = () => new RelatorioVisitor();
}

// ---------------------------------------------------------------------------------------------

/** Sobe o app como o server.ts: registro padrão (+ extras) e um notificador por fábrica, uma vez. */
function montarApp(extras: FabricaProjeto[] = []) {
  const logger = new LoggerMemoria();
  const fabricas = RegistroFabricas.padrao({ logger });
  for (const fabrica of extras) fabricas.registrar(fabrica);
  const notificadores = new Map(fabricas.todas().map((f) => [f.tipo, f.criarNotificador()]));
  const email = new EmailObservador(logger);
  const auditoria = new AuditoriaObservador(logger);
  const eventos = new RecomendacaoEventEmitter().registrar(email, auditoria, ...notificadores.values());
  const projetos = new InMemoryProjetoRepository();
  const service = criarSistemaDeTeste({
    profissionais: new InMemoryProfissionalRepository(elencoCompleto()),
    projetos,
    eventos,
    fabricas,
    relogio: () => DATA_REFERENCIA,
    opcoesFonte: { timeoutMs: 100, ttlMs: 0 },
  });
  const app = construirApp({ montarServico: () => service });
  const avisos = (tipo: TipoCaptacao) => (notificadores.get(tipo) as Partial<NotificadorPorTipo>).enviadas ?? [];
  return { app, eventos, email, auditoria, projetos, avisos, service };
}

const corpoBase = {
  titulo: 'Rio Aberto',
  produtorId: 'produtor-7',
  genero: 'Drama',
  duracaoEstimadaMin: 95,
  orcamentoTotal: 180000,
  dataEntrega: DATA_ENTREGA.toISOString(),
  localizacao: 'São Paulo',
  estrategia: 'COSSENO',
  papeis: [
    { papel: 'DIRETOR', peso: 3 },
    { papel: 'EDITOR', peso: 1 },
  ],
};

async function post(app: FastifyInstance, payload: object) {
  return app.inject({ method: 'POST', url: '/projetos/recomendar', payload });
}

async function recomendar(app: FastifyInstance, payload: object): Promise<RespostaRecomendacao> {
  const resposta = await post(app, payload);
  expect(resposta.statusCode).toBe(201);
  return resposta.json<RespostaRecomendacao>();
}

describe('Fábricas: a mesma requisição com tipos diferentes gera ecossistemas coerentes com o tipo', () => {
  // Scores esperados com cosseno (DIRETOR-top e EDITOR-top têm o perfil padrão do papel):
  //   documentário valoriza narrativa (DIRETOR tem 0.8); publicitário valoriza ritmo e color_grading (EDITOR tem 0.8 e 0.5).
  it.each([
    ['FICCAO', { DIRETOR: 1, EDITOR: 1 }, null, true, null],
    ['DOCUMENTARIO', { DIRETOR: 0.8533, EDITOR: 0.8 }, { tema: 'drama', entrevistados: [] }, false, 'Documentário exige o papel ROTEIRISTA'],
    ['ANIMACAO', { DIRETOR: 0.8, EDITOR: 0.8 }, { tecnica: '2D', softwares: [], quadrosPorSegundo: 24 }, false, 'Animação exige o papel EFEITOS_VISUAIS'],
    ['PUBLICITARIO', { DIRETOR: 0.8, EDITOR: 0.8867 }, { marca: 'Rio Aberto', canais: [], duracaoMaxSegundos: 5700 }, true, null],
  ] as const)('%s', async (tipo, scores, detalhes, valida, erroDoTipo) => {
    const { app, eventos, avisos, email } = montarApp();
    const { projeto, recomendacao } = await recomendar(app, { ...corpoBase, tipoCaptacao: tipo });

    // projeto do tipo, com os atributos específicos padrão
    expect(projeto.tipoCaptacao).toBe(tipo);
    expect(projeto.detalhes).toEqual(detalhes);
    // recomendação: mesma estratégia escolhida, scores ajustados pelo recomendador do tipo
    expect(recomendacao.estrategia).toBe('COSSENO');
    expect(Object.fromEntries(recomendacao.equipe.map((m) => [m.papel, m.score]))).toEqual(scores);

    // validação do relatório: regras do tipo
    const { validacao, relatorio } = (await app.inject(`/recomendacoes/${recomendacao.id}/relatorio`)).json();
    expect(validacao.valida).toBe(valida);
    if (erroDoTipo) expect(validacao.erros).toEqual([erroDoTipo]);
    else expect(validacao.erros).toEqual([]);
    expect(relatorio.projeto.detalhes).toEqual(detalhes);

    // notificações: só o notificador do tipo fala, e também em evento sem `projeto` (rejeição)
    await app.inject({ method: 'POST', url: `/recomendacoes/${recomendacao.id}/membros/EDITOR/rejeitar` });
    await eventos.aguardarPendentes();
    for (const outro of ['DOCUMENTARIO', 'ANIMACAO', 'PUBLICITARIO'] as const) {
      expect(avisos(outro)).toHaveLength(outro === tipo ? 2 : 0);
    }
    expect(avisos(tipo).map((n) => n.evento)).toEqual(tipo === 'FICCAO' ? [] : ['recomendacao.gerada', 'membro.rejeitado']);
    expect(avisos(tipo).every((n) => n.projetoId === projeto.id)).toBe(true);
    // os observadores genéricos seguem funcionando para todos os tipos
    expect(email.enviados[0]?.assunto).toBe('Equipe recomendada para "Rio Aberto"');
    await app.close();
  });

  it('só o relatório da animação traz as métricas de renderização', async () => {
    const { app } = montarApp();
    for (const tipo of ['FICCAO', 'DOCUMENTARIO', 'ANIMACAO', 'PUBLICITARIO'] as const) {
      const { recomendacao } = await recomendar(app, { ...corpoBase, tipoCaptacao: tipo });
      const { relatorio } = (await app.inject(`/recomendacoes/${recomendacao.id}/relatorio`)).json();
      if (tipo !== 'ANIMACAO') {
        expect(relatorio).not.toHaveProperty('metricasRenderizacao');
        continue;
      }
      // 95 min * 60 s * 24 qps (padrão da animação)
      expect(relatorio.metricasRenderizacao).toEqual({
        descricao: expect.stringMatching(/^Estimativas/),
        tecnica: '2D',
        quadrosPorSegundo: 24,
        duracaoEstimadaMin: 95,
        totalQuadrosEstimado: 136800,
        custoEstimadoPorQuadro: Math.round((relatorio.financeiro.custoEquipe / 136800) * 100) / 100,
        papeisEfeitosVisuaisPreenchidos: 0,
      });
    }
    await app.close();
  });

  it('o mesmo serviço troca de fábrica a cada pedido sem misturar famílias', async () => {
    const criados: Array<[TipoCaptacao, string]> = [];
    // Espia: delega à fábrica real e anota a classe de cada objeto criado.
    const espiar = (fabrica: FabricaProjeto): FabricaProjeto => {
      const anotar = <T extends object>(objeto: T): T => {
        criados.push([fabrica.tipo, objeto.constructor.name]);
        return objeto;
      };
      return {
        tipo: fabrica.tipo,
        comEstrategia: (base) => espiar(fabrica.comEstrategia(base)),
        criarProjeto: (dados) => anotar(fabrica.criarProjeto(dados)),
        criarValidador: (data) => anotar(fabrica.criarValidador(data)),
        criarRecomendador: () => anotar(fabrica.criarRecomendador()),
        criarNotificador: () => anotar(fabrica.criarNotificador()),
        criarRelatorio: () => anotar(fabrica.criarRelatorio()),
      };
    };
    const fabricas = new RegistroFabricas(RegistroFabricas.padrao().todas().map(espiar));
    const service = criarSistemaDeTeste({
      profissionais: new InMemoryProfissionalRepository(elencoCompleto()),
      projetos: new InMemoryProjetoRepository(),
      eventos: new RecomendacaoEventEmitter(),
      fabricas,
      relogio: () => DATA_REFERENCIA,
      opcoesFonte: { ttlMs: 0 },
    });

    for (const tipo of ['ANIMACAO', 'DOCUMENTARIO', 'FICCAO', 'PUBLICITARIO', 'ANIMACAO'] as const) {
      const { recomendacao } = await service.recomendar(dadosProjeto({ tipoCaptacao: tipo }));
      await service.substituirMembro(recomendacao.id, 'EDITOR');
      await service.gerarRelatorio(recomendacao.id);
    }

    const familia: Record<string, string[]> = {
      FICCAO: ['Projeto', 'CossenoStrategy', 'ValidacaoConsistenciaVisitor', 'RelatorioVisitor'],
      DOCUMENTARIO: ['ProjetoDocumentario', 'RecomendadorDocumentario', 'ValidadorDocumentario', 'RelatorioVisitor'],
      ANIMACAO: ['ProjetoAnimacao', 'RecomendadorAnimacao', 'ValidadorAnimacao', 'RelatorioAnimacaoVisitor'],
      PUBLICITARIO: ['ProjetoPublicitario', 'RecomendadorPublicitario', 'ValidadorPublicitario', 'RelatorioVisitor'],
    };
    for (const [tipo, classe] of criados) expect(familia[tipo]).toContain(classe);
    expect(new Set(criados.map(([, classe]) => classe))).toEqual(new Set(Object.values(familia).flat()));
  });

  it('o mesmo orquestrador-padrão ranqueia de forma diferente conforme a fábrica recebida', () => {
    const vfx = criarProfissional({ id: 'vfx', competencias: { direcao: 1, vfx: 1, composicao: 1, animacao_3d: 1 } });
    const pesquisador = criarProfissional({ id: 'pesquisador', competencias: { direcao: 1, narrativa: 1, pesquisa: 1, captacao_som: 1 } });
    const entrada = {
      projeto: new ProjetoBase(dadosProjeto({ papeis: [{ papel: 'DIRETOR', peso: 1 }] })),
      profissionais: [vfx, pesquisador],
      estrategia: { ...new CossenoStrategy(), recomendar: (c: readonly typeof vfx[]) => c.map((profissional) => ({ profissional, score: 0.5, detalhes: {} })) },
      dataReferencia: DATA_REFERENCIA,
    };
    const escolhido = (fabrica: FabricaProjeto) =>
      new OrquestradorPadrao(fabrica).orquestrar(entrada).selecionados[0]?.escolhido.profissional.id;
    expect(escolhido(new FabricaAnimacao(OPCOES_FABRICA))).toBe('vfx');
    expect(escolhido(new FabricaDocumentario(OPCOES_FABRICA))).toBe('pesquisador');
  });
});

describe('Extensibilidade: tipo novo (realidade virtual) sem tocar no orquestrador nem no serviço', () => {
  it('fluxo completo pela API com a FabricaRealidadeVirtual registrada', async () => {
    const { app, eventos, avisos, projetos } = montarApp([new FabricaRealidadeVirtual(OPCOES_FABRICA)]);
    const corpo = {
      ...corpoBase,
      tipoCaptacao: REALIDADE_VIRTUAL,
      detalhes: { plataforma: 'Apple Vision Pro' },
      papeis: [
        { papel: 'DIRETOR', peso: 2 },
        { papel: 'DIRETOR_FOTOGRAFIA', peso: 2 },
      ],
    };
    const { projeto, recomendacao } = await recomendar(app, corpo);

    expect(projeto).toMatchObject({ tipoCaptacao: REALIDADE_VIRTUAL, detalhes: { plataforma: 'Apple Vision Pro' } });
    expect(projetos.projetos.get(projeto.id)).toBeInstanceOf(ProjetoRealidadeVirtual);
    // DIRETOR_FOTOGRAFIA-top tem camera 0.8 -> afinidade (0.8 + 0) / 2 = 0.4
    expect(recomendacao.equipe.find((m) => m.papel === 'DIRETOR_FOTOGRAFIA')?.score).toBe(0.88);

    const sub = await app.inject({ method: 'POST', url: `/recomendacoes/${recomendacao.id}/membros/DIRETOR/substituir` });
    expect(sub.statusCode).toBe(200);
    expect((await app.inject(`/recomendacoes/${recomendacao.id}/relatorio`)).json().validacao.valida).toBe(true);

    const semDop = await recomendar(app, { ...corpo, papeis: [{ papel: 'DIRETOR', peso: 1 }] });
    const relatorio = (await app.inject(`/recomendacoes/${semDop.recomendacao.id}/relatorio`)).json();
    expect(relatorio.validacao.erros).toEqual(['Realidade virtual exige DIRETOR_FOTOGRAFIA (captação 360°)']);

    await eventos.aguardarPendentes();
    expect(avisos(REALIDADE_VIRTUAL).map((n) => n.texto)).toEqual([
      'VR "Rio Aberto": reserve o rig de câmeras 360°.',
      'VR "Rio Aberto": reserve o rig de câmeras 360°.',
    ]);
    expect(avisos('DOCUMENTARIO')).toEqual([]);
    await app.close();
  });

  it('sem a fábrica registrada, o tipo é recusado', async () => {
    const { app } = montarApp();
    expect((await post(app, { ...corpoBase, tipoCaptacao: REALIDADE_VIRTUAL })).statusCode).toBe(400);
    await app.close();
  });
});

describe('Guarda: o orquestrador não conhece tipos de projeto', () => {
  const pasta = join(__dirname, '..', '..', 'src', 'orchestration');
  const arquivos = readdirSync(pasta).filter((nome) => nome.endsWith('.ts'));

  it.each(arquivos)('%s não menciona tipoCaptacao, nomes de tipo nem switch', (arquivo) => {
    const codigo = readFileSync(join(pasta, arquivo), 'utf8');
    expect(codigo).not.toMatch(/tipoCaptacao/);
    expect(codigo).not.toMatch(/DOCUMENTARIO|ANIMACAO|PUBLICITARIO|FICCAO/);
    expect(codigo).not.toMatch(/documentario|animacao|publicitario|ficcao/i);
    expect(codigo).not.toMatch(/\bswitch\s*\(/);
    expect(codigo).not.toMatch(/instanceof\s+Projeto/);
  });

  it('a pasta tem os dois arquivos do orquestrador', () => {
    expect(arquivos.sort()).toEqual(['OrquestradorEquipe.ts', 'OrquestradorPadrao.ts']);
  });
});

describe('Projetos-modelo (Prototype) pela API', () => {
  let ctx: ReturnType<typeof montarApp>;
  const pedido = {
    titulo: 'Curta Estelar',
    produtorId: 'produtor-9',
    orcamentoTotal: 150000,
    dataEntrega: DATA_ENTREGA.toISOString(),
    localizacao: 'Recife',
  };

  beforeEach(() => {
    ctx = montarApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('GET /projetos/modelos lista as chaves', async () => {
    expect((await ctx.app.inject('/projetos/modelos')).json()).toEqual({
      modelos: ['ficcao', 'documentario', 'animacao', 'publicitario'],
    });
  });

  it('POST com modelo clona o modelo e os campos do corpo sobrescrevem', async () => {
    const { projeto, recomendacao } = await recomendar(ctx.app, {
      ...pedido,
      modelo: 'animacao',
      estrategia: 'ORCAMENTO_REDUZIDO',
      detalhes: { softwares: ['Maya'] },
    });
    expect(projeto).toMatchObject({
      ...pedido,
      tipoCaptacao: 'ANIMACAO',
      genero: 'animação',
      duracaoEstimadaMin: 85,
      estrategia: 'ORCAMENTO_REDUZIDO',
      detalhes: { tecnica: '3D', softwares: ['Maya'], quadrosPorSegundo: 24 },
    });
    expect(projeto.papeis.map((p) => p.papel)).toEqual(['DIRETOR', 'EFEITOS_VISUAIS', 'SONOPLASTA']);
    expect(recomendacao.estrategia).toBe('ORCAMENTO_REDUZIDO');

    // dois pedidos do mesmo modelo são projetos independentes
    const outro = await recomendar(ctx.app, { ...pedido, modelo: 'animacao', papeis: [{ papel: 'DIRETOR', peso: 1 }], tipoCaptacao: 'ANIMACAO' });
    expect(outro.projeto.id).not.toBe(projeto.id);
    expect(outro.projeto.papeis).toEqual([{ papel: 'DIRETOR', peso: 1 }]);
    expect(outro.projeto.detalhes?.softwares).toEqual(['Blender']);
  });

  it('erros: modelo inexistente, tipo diferente do modelo e atributo inválido -> 422; corpo incompleto -> 400', async () => {
    const inexistente = await post(ctx.app, { ...pedido, modelo: 'novela' });
    expect(inexistente.statusCode).toBe(422);
    expect(inexistente.json()).toMatchObject({ erro: 'VALIDACAO', mensagem: 'Modelo de projeto inexistente: novela' });

    expect((await post(ctx.app, { ...pedido, modelo: 'documentario', tipoCaptacao: 'ANIMACAO' })).json().mensagem).toBe(
      'O modelo documentario é do tipo DOCUMENTARIO, não ANIMACAO',
    );

    const tecnica = await post(ctx.app, { ...corpoBase, tipoCaptacao: 'ANIMACAO', detalhes: { tecnica: 'VR' } });
    expect(tecnica.statusCode).toBe(422);
    expect(tecnica.json().mensagem).toMatch(/tecnica/);
    expect((await post(ctx.app, { ...pedido, modelo: 'publicitario', detalhes: { duracaoMaxSegundos: 0 } })).statusCode).toBe(422);

    const { genero: _genero, ...semGenero } = corpoBase;
    expect((await post(ctx.app, { ...semGenero, tipoCaptacao: 'FICCAO' })).statusCode).toBe(400);
    expect((await post(ctx.app, { modelo: 'ficcao', titulo: 'x' })).statusCode).toBe(400);
  });
});
