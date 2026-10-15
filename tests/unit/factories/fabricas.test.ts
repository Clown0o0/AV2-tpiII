import { ErroValidacao } from '../../../src/domain/errors';
import type { Profissional } from '../../../src/domain/entities/Profissional';
import { Projeto, type DadosProjeto, type TipoCaptacao } from '../../../src/domain/entities/Projeto';
import { ProjetoAnimacao } from '../../../src/domain/entities/ProjetoAnimacao';
import { ProjetoDocumentario } from '../../../src/domain/entities/ProjetoDocumentario';
import { ProjetoPublicitario } from '../../../src/domain/entities/ProjetoPublicitario';
import { MembroRecomendado, Recomendacao } from '../../../src/domain/entities/Recomendacao';
import { EVENTOS, type MembroRejeitado, type RecomendacaoGerada } from '../../../src/events/EventTypes';
import { RecomendacaoEventEmitter } from '../../../src/events/RecomendacaoEventEmitter';
import { NotificadorPorTipo } from '../../../src/events/observers/NotificadorPorTipo';
import { FabricaAnimacao } from '../../../src/factories/animacao/FabricaAnimacao';
import { NotificadorAnimacao } from '../../../src/factories/animacao/NotificadorAnimacao';
import { RecomendadorAnimacao } from '../../../src/factories/animacao/RecomendadorAnimacao';
import { ValidadorAnimacao } from '../../../src/factories/animacao/ValidadorAnimacao';
import { FabricaDocumentario } from '../../../src/factories/documentario/FabricaDocumentario';
import { NotificadorDocumentario } from '../../../src/factories/documentario/NotificadorDocumentario';
import { RecomendadorDocumentario } from '../../../src/factories/documentario/RecomendadorDocumentario';
import { ValidadorDocumentario } from '../../../src/factories/documentario/ValidadorDocumentario';
import type { FabricaProjeto } from '../../../src/factories/FabricaProjeto';
import { FabricaProjetoRegistry } from '../../../src/factories/FabricaProjetoRegistry';
import { FabricaFiccao } from '../../../src/factories/ficcao/FabricaFiccao';
import { NotificadorFiccao } from '../../../src/factories/ficcao/NotificadorFiccao';
import { FabricaPublicitario } from '../../../src/factories/publicitario/FabricaPublicitario';
import { NotificadorPublicitario } from '../../../src/factories/publicitario/NotificadorPublicitario';
import { RecomendadorPublicitario } from '../../../src/factories/publicitario/RecomendadorPublicitario';
import { ValidadorPublicitario } from '../../../src/factories/publicitario/ValidadorPublicitario';
import { CossenoStrategy } from '../../../src/strategies/CossenoStrategy';
import { OrcamentoReduzidoStrategy } from '../../../src/strategies/OrcamentoReduzidoStrategy';
import type { ContextoEstrategia, RecomendacaoStrategy } from '../../../src/strategies/RecomendacaoStrategy';
import { EstruturaEquipe, type ProjetoVisitor } from '../../../src/visitors/ProjetoVisitor';
import { ValidacaoConsistenciaVisitor, type ResultadoValidacao } from '../../../src/visitors/ValidacaoConsistenciaVisitor';
import { criarProfissional, dadosProjeto, DATA_REFERENCIA } from '../../support/fixtures';
import { LoggerMemoria } from '../../support/InMemoryRepositories';

const FAMILIAS = [
  ['FICCAO', FabricaFiccao, Projeto, ValidacaoConsistenciaVisitor, CossenoStrategy, NotificadorFiccao],
  ['DOCUMENTARIO', FabricaDocumentario, ProjetoDocumentario, ValidadorDocumentario, RecomendadorDocumentario, NotificadorDocumentario],
  ['ANIMACAO', FabricaAnimacao, ProjetoAnimacao, ValidadorAnimacao, RecomendadorAnimacao, NotificadorAnimacao],
  ['PUBLICITARIO', FabricaPublicitario, ProjetoPublicitario, ValidadorPublicitario, RecomendadorPublicitario, NotificadorPublicitario],
] as const;

const CLASSES_DE_TIPO = [
  ProjetoDocumentario, ProjetoAnimacao, ProjetoPublicitario,
  ValidadorDocumentario, ValidadorAnimacao, ValidadorPublicitario,
  RecomendadorDocumentario, RecomendadorAnimacao, RecomendadorPublicitario,
  NotificadorDocumentario, NotificadorAnimacao, NotificadorPublicitario, NotificadorFiccao,
];

// Estratégia base fixa: todo candidato vale 0.5, para isolar o efeito do ajuste por tipo.
const baseFixa: RecomendacaoStrategy = {
  tipo: 'ORCAMENTO_REDUZIDO',
  descricao: 'base de teste',
  ranquear: (candidatos) => candidatos.map((profissional) => ({ profissional, score: 0.5, detalhes: { base: 1 } })),
};

function contexto(universo: Profissional[]): ContextoEstrategia {
  return { projeto: new Projeto(dadosProjeto()), papel: 'DIRETOR', perfilDesejado: { direcao: 1 }, orcamentoPapel: 1e6, universo };
}

describe('Abstract Factory — cada fábrica cria só a família do próprio tipo', () => {
  it.each(FAMILIAS)('%s', (tipo, Fabrica, ClasseProjeto, ClasseValidador, ClasseRecomendador, ClasseNotificador) => {
    const fabrica = new Fabrica();
    const familia = [
      fabrica.criarProjeto(dadosProjeto({ tipoCaptacao: 'FICCAO' })),
      fabrica.criarValidador(),
      fabrica.criarRecomendador(),
      fabrica.criarNotificador(),
    ];
    expect(fabrica.tipo).toBe(tipo);
    expect((familia[0] as Projeto).tipoCaptacao).toBe(tipo);
    expect(familia[0]).toBeInstanceOf(ClasseProjeto);
    expect(familia[1]).toBeInstanceOf(ClasseValidador);
    expect(familia[2]).toBeInstanceOf(ClasseRecomendador);
    expect(familia[3]).toBeInstanceOf(ClasseNotificador);
    // Nenhum objeto é de uma classe específica de OUTRO tipo.
    const minhas = new Set<unknown>([ClasseProjeto, ClasseValidador, ClasseRecomendador, ClasseNotificador]);
    for (const objeto of familia) {
      for (const Classe of CLASSES_DE_TIPO.filter((c) => !minhas.has(c))) expect(objeto).not.toBeInstanceOf(Classe);
    }
  });

  it('comEstrategia devolve fábrica da mesma classe, com a estratégia escolhida como base', () => {
    const reduzido = new OrcamentoReduzidoStrategy();
    for (const [, Fabrica] of FAMILIAS) {
      const original = new Fabrica();
      const configurada = original.comEstrategia(reduzido);
      expect(configurada).toBeInstanceOf(Fabrica);
      expect(configurada).not.toBe(original);
      expect(configurada.criarRecomendador().tipo).toBe('ORCAMENTO_REDUZIDO');
      expect(original.criarRecomendador().tipo).toBe('COSSENO');
    }
    expect(new FabricaFiccao().comEstrategia(reduzido).criarRecomendador()).toBe(reduzido);
  });
});

describe('Recomendadores por tipo (decoram a estratégia escolhida)', () => {
  const generalista = criarProfissional({ id: 'generalista', competencias: { direcao: 1 } });
  const animador = criarProfissional({ id: 'animador', competencias: { direcao: 1, vfx: 1, animacao_3d: 1, composicao: 1 } });
  const documentarista = criarProfissional({ id: 'documentarista', competencias: { direcao: 1, pesquisa: 0.9, narrativa: 0.9, captacao_som: 0.9 } });
  const publicitario = criarProfissional({ id: 'publicitario', competencias: { direcao: 1, ritmo: 1, color_grading: 1, iluminacao: 0.7 } });
  const todos = [generalista, animador, documentarista, publicitario];

  it.each([
    [FabricaAnimacao, 'animador'],
    [FabricaDocumentario, 'documentarista'],
    [FabricaPublicitario, 'publicitario'],
  ] as const)('%p põe no topo quem tem as competências do tipo', (Fabrica, esperado) => {
    const recomendador = new Fabrica().comEstrategia(baseFixa).criarRecomendador();
    const ranking = recomendador.ranquear(todos, contexto(todos));
    expect(ranking[0]?.profissional.id).toBe(esperado);
    // só o especialista do tipo ganha afinidade; o generalista fica com 80% do score base
    expect(ranking.find((c) => c.profissional.id === 'generalista')?.score).toBe(0.4);
    expect(ranking.filter((c) => c.score > 0.4).map((c) => c.profissional.id)).toEqual([esperado]);
    expect(ranking.every((c) => c.score >= 0 && c.score <= 1)).toBe(true);
    expect(ranking[0]?.detalhes).toMatchObject({ base: 1, scoreBase: 0.5 });
    // tipo e descrição continuam sendo os da estratégia escolhida
    expect(recomendador.tipo).toBe('ORCAMENTO_REDUZIDO');
    expect(recomendador.descricao).toBe('base de teste');
  });

  it('o score fica em [0,1] e a ordenação é determinística mesmo com base no máximo', () => {
    const maximo: RecomendacaoStrategy = { ...baseFixa, ranquear: (c) => c.map((profissional) => ({ profissional, score: 1, detalhes: {} })) };
    const ranking = new FabricaAnimacao().comEstrategia(maximo).criarRecomendador().ranquear(todos, contexto(todos));
    expect(ranking.map((c) => c.score)).toEqual([1, 0.8, 0.8, 0.8]);
    expect(ranking.map((c) => c.profissional.id)).toEqual(['animador', 'documentarista', 'generalista', 'publicitario']);
  });

  it('respeita os descartes da estratégia base', () => {
    const caro = criarProfissional({ id: 'caro', precoMin: 999999, competencias: { vfx: 1 } });
    const recomendador = new FabricaAnimacao().comEstrategia(new OrcamentoReduzidoStrategy()).criarRecomendador();
    expect(recomendador.ranquear([caro], { ...contexto([caro]), orcamentoPapel: 1000 })).toEqual([]);
  });
});

describe('Validadores por tipo', () => {
  function validarCom(validador: ProjetoVisitor<ResultadoValidacao>, projeto: Projeto) {
    const diretor = criarProfissional({ id: 'dir' });
    const recomendacao = new Recomendacao({
      projetoId: projeto.id,
      estrategia: 'COSSENO',
      membros: [new MembroRecomendado({ papel: 'DIRETOR', profissionalId: 'dir', score: 1, custo: 10000, rodada: 1 })],
    });
    return new EstruturaEquipe(projeto, recomendacao, [diretor]).aceitar(validador);
  }

  const validar = (fabrica: FabricaProjeto, projeto: Projeto) => validarCom(fabrica.criarValidador(DATA_REFERENCIA), projeto);

  const soDiretor = (tipo: TipoCaptacao, extra: Partial<DadosProjeto> = {}) =>
    dadosProjeto({ tipoCaptacao: tipo, papeis: [{ papel: 'DIRETOR', peso: 1 }], ...extra });

  it('documentário exige ROTEIRISTA; animação exige EFEITOS_VISUAIS', () => {
    const doc = new FabricaDocumentario();
    const anim = new FabricaAnimacao();
    const semRoteirista = validar(doc, doc.criarProjeto(soDiretor('DOCUMENTARIO')));
    expect(semRoteirista.valida).toBe(false);
    expect(semRoteirista.erros).toEqual(['Documentário exige o papel ROTEIRISTA']);
    expect(validar(anim, anim.criarProjeto(soDiretor('ANIMACAO'))).erros).toEqual(['Animação exige o papel EFEITOS_VISUAIS']);
    // com o papel exigido, a regra do tipo passa (o papel vazio é erro da validação padrão)
    const comRoteirista = validar(doc, doc.criarProjeto(dadosProjeto({ tipoCaptacao: 'DOCUMENTARIO', papeis: [{ papel: 'DIRETOR', peso: 1 }, { papel: 'ROTEIRISTA', peso: 1 }] })));
    expect(comRoteirista.erros).toEqual(['Papel obrigatório ROTEIRISTA não preenchido']);
  });

  it('publicitário confere a duração estimada com a duração máxima da peça', () => {
    const pub = new FabricaPublicitario();
    expect(validar(pub, pub.criarProjeto(soDiretor('PUBLICITARIO', { duracaoEstimadaMin: 1 }))).valida).toBe(true);
    const longa = validar(pub, pub.criarProjeto(soDiretor('PUBLICITARIO', { duracaoEstimadaMin: 2, detalhes: { duracaoMaxSegundos: 30 } })));
    expect(longa.valida).toBe(false);
    expect(longa.erros).toEqual(['Duração estimada (120 s) excede a duração máxima da peça (30 s)']);
  });

  it('validador de um tipo recusa projeto de outro tipo', () => {
    const ficcao = new Projeto(soDiretor('FICCAO'));
    expect(validar(new FabricaDocumentario(), ficcao).erros).toEqual([`Projeto ${ficcao.id} não é um documentário`]);
    expect(validar(new FabricaAnimacao(), ficcao).erros).toEqual([`Projeto ${ficcao.id} não é uma animação`]);
    expect(validar(new FabricaPublicitario(), ficcao).erros).toEqual([`Projeto ${ficcao.id} não é uma peça publicitária`]);
  });

  it('FabricaFiccao dá exatamente o resultado do ValidacaoConsistenciaVisitor da ATVI', () => {
    const fabrica = new FabricaFiccao();
    for (const projeto of [new Projeto(dadosProjeto()), new Projeto(soDiretor('FICCAO'))]) {
      const resultado = validar(fabrica, projeto);
      expect(resultado).toEqual(validarCom(new ValidacaoConsistenciaVisitor(DATA_REFERENCIA), projeto));
    }
    expect(validar(fabrica, new Projeto(soDiretor('FICCAO'))).valida).toBe(true);
    expect(fabrica.criarValidador().constructor).toBe(ValidacaoConsistenciaVisitor);
  });
});

describe('Notificadores por tipo', () => {
  function eventoGerado(projeto: Projeto): RecomendacaoGerada {
    return {
      ator: { tipo: 'PRODUTOR', id: projeto.produtorId },
      ocorridoEm: DATA_REFERENCIA,
      projetoId: projeto.id,
      projeto,
      recomendacao: new Recomendacao({
        projetoId: projeto.id,
        estrategia: 'COSSENO',
        membros: [new MembroRecomendado({ papel: 'DIRETOR', profissionalId: 'p1', score: 1, custo: 1, rodada: 1 })],
      }),
      motivo: 'INICIAL',
      fonteProfissionais: 'REPOSITORIO',
      profissionaisSugeridos: [],
    };
  }

  function rejeitado(tipoCaptacao: TipoCaptacao): MembroRejeitado {
    return { ator: { tipo: 'PRODUTOR', id: 'produtor-1' }, ocorridoEm: DATA_REFERENCIA, projetoId: 'x', tipoCaptacao, recomendacaoId: 'r', papel: 'EDITOR', profissionalId: 'p' };
  }

  function montar() {
    const emitter = new RecomendacaoEventEmitter();
    const logger = new LoggerMemoria();
    const registry = FabricaProjetoRegistry.padrao({ logger });
    const notificadores = Object.fromEntries(registry.todas().map((f) => [f.tipo, f.criarNotificador()]));
    emitter.registrar(...Object.values(notificadores));
    const enviadas = (tipo: TipoCaptacao) => (notificadores[tipo] as NotificadorPorTipo).enviadas;
    return { emitter, enviadas, logger, notificadores };
  }

  it('cada notificador reage só a eventos de projetos do próprio tipo (inclusive eventos sem projeto)', async () => {
    const { emitter, enviadas, logger } = montar();
    const doc = new FabricaDocumentario().criarProjeto(dadosProjeto({ tipoCaptacao: 'DOCUMENTARIO', detalhes: { entrevistados: ['A', 'B'] } }));
    const anim = new FabricaAnimacao().criarProjeto(dadosProjeto({ tipoCaptacao: 'ANIMACAO', detalhes: { tecnica: '3D', softwares: ['Blender'] } }));
    const pub = new FabricaPublicitario().criarProjeto(dadosProjeto({ tipoCaptacao: 'PUBLICITARIO', detalhes: { marca: 'Aurora', canais: ['TV'] } }));
    const ficcao = new Projeto(dadosProjeto());

    for (const projeto of [doc, anim, pub, ficcao]) {
      emitter.publicar(EVENTOS.RECOMENDACAO_GERADA, eventoGerado(projeto));
      emitter.publicar(EVENTOS.EQUIPE_FINALIZADA, eventoGerado(projeto));
    }
    emitter.publicar(EVENTOS.MEMBRO_REJEITADO, rejeitado('ANIMACAO'));
    await emitter.aguardarPendentes();

    expect(enviadas('DOCUMENTARIO').map((n) => n.texto)).toEqual([
      'Documentário "Filme Teste": equipe sugerida. Providencie as autorizações de uso de imagem dos 2 entrevistado(s).',
      'Equipe do documentário "Filme Teste" fechada: confira o cronograma de entrevistas sobre "drama".',
    ]);
    expect(enviadas('ANIMACAO').map((n) => n.texto)).toEqual([
      'Animação "Filme Teste" (3D, 24 qps): equipe sugerida. Reserve as estações de render para os efeitos visuais.',
      'Equipe da animação "Filme Teste" completa: acesso ao pipeline liberado (softwares: Blender).',
      'Animação: o papel EDITOR ficou em aberto; o pipeline de produção está pausado para esse papel.',
    ]);
    expect(enviadas('PUBLICITARIO').map((n) => n.texto)).toEqual([
      'Peça publicitária de Aurora: equipe sugerida. Envie a proposta para aprovação da agência.',
      'Equipe da campanha "Filme Teste" confirmada (canais: TV).',
    ]);
    expect(enviadas('DOCUMENTARIO').every((n) => n.projetoId === doc.id && n.tipoCaptacao === 'DOCUMENTARIO')).toBe(true);
    expect(enviadas('ANIMACAO')[2]).toMatchObject({ evento: EVENTOS.MEMBRO_REJEITADO, destinatarioId: 'produtor-1' });
    expect(logger.linhas.filter((l) => l.objeto.canal === 'notificador-publicitario')).toHaveLength(2);
  });

  it('projeto antigo do tipo, mas sem a subclasse, recebe textos com valores neutros', async () => {
    const { emitter, enviadas } = montar();
    for (const tipo of ['DOCUMENTARIO', 'ANIMACAO', 'PUBLICITARIO'] as const) {
      const legado = new Projeto(dadosProjeto({ tipoCaptacao: tipo }));
      emitter.publicar(EVENTOS.RECOMENDACAO_GERADA, eventoGerado(legado));
      emitter.publicar(EVENTOS.EQUIPE_FINALIZADA, eventoGerado(legado));
      emitter.publicar(EVENTOS.MEMBRO_REJEITADO, rejeitado(tipo));
    }
    await emitter.aguardarPendentes();
    expect(enviadas('DOCUMENTARIO')[0]?.texto).toContain('dos 0 entrevistado(s)');
    expect(enviadas('ANIMACAO')[0]?.texto).toContain('(técnica a definir)');
    expect(enviadas('ANIMACAO')[1]?.texto).toContain('(softwares: a definir)');
    expect(enviadas('PUBLICITARIO')[0]?.texto).toContain('Peça publicitária de Filme Teste');
    expect(enviadas('PUBLICITARIO')[1]?.texto).toContain('(canais: a definir)');
    expect(enviadas('DOCUMENTARIO')[2]?.texto).toMatch(/^Documentário: o papel EDITOR/);
    expect(enviadas('PUBLICITARIO')[2]?.texto).toMatch(/^Publicidade: o papel EDITOR/);
  });

  it('registro único: uma inscrição por evento por notificador, e um aviso por evento publicado', async () => {
    const { emitter, enviadas } = montar();
    // 3 notificadores com regras (ficção não se inscreve em nada)
    expect(emitter.quantidadeInscritos(EVENTOS.RECOMENDACAO_GERADA)).toBe(3);
    expect(emitter.quantidadeInscritos(EVENTOS.MEMBRO_REJEITADO)).toBe(3);
    expect(emitter.quantidadeInscritos(EVENTOS.PROJETO_ALTERADO)).toBe(0);
    emitter.publicar(EVENTOS.MEMBRO_REJEITADO, rejeitado('DOCUMENTARIO'));
    await emitter.aguardarPendentes();
    expect(enviadas('DOCUMENTARIO')).toHaveLength(1);
  });

  it('a falha de um notificador não afeta os outros', async () => {
    const falhas: string[] = [];
    const emitter = new RecomendacaoEventEmitter((_e, _evento, observador) => falhas.push(observador));
    class NotificadorQuebrado extends NotificadorPorTipo {
      readonly nome = 'quebrado';
      protected textoRecomendacao = () => '';
      protected textoEquipeFinalizada = () => '';
      protected textoPapelEmAberto(): string {
        throw new Error('SMTP fora');
      }
    }
    const quebrado = new NotificadorQuebrado('DOCUMENTARIO');
    const saudavel = new NotificadorDocumentario('DOCUMENTARIO');
    emitter.registrar(quebrado, saudavel);
    emitter.publicar(EVENTOS.MEMBRO_REJEITADO, rejeitado('DOCUMENTARIO'));
    await emitter.aguardarPendentes();
    expect(falhas).toEqual(['quebrado']);
    expect(saudavel.enviadas).toHaveLength(1);
  });
});

describe('FabricaProjetoRegistry', () => {
  it('mapeia cada tipo para a sua fábrica', () => {
    const registry = FabricaProjetoRegistry.padrao();
    expect(registry.tipos()).toEqual(['DOCUMENTARIO', 'FICCAO', 'ANIMACAO', 'PUBLICITARIO']);
    for (const [tipo, Fabrica] of FAMILIAS) expect(registry.obter(tipo)).toBeInstanceOf(Fabrica);
  });

  it('tipo sem fábrica registrada lança ErroValidacao', () => {
    const registry = new FabricaProjetoRegistry([new FabricaFiccao()]);
    expect(() => registry.obter('ANIMACAO')).toThrow(ErroValidacao);
    expect(() => registry.obter('ANIMACAO')).toThrow(/sem fábrica registrada: ANIMACAO/);
    registry.registrar(new FabricaAnimacao());
    expect(registry.obter('ANIMACAO')).toBeInstanceOf(FabricaAnimacao);
  });
});
