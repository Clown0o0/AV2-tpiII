import { ErroValidacao } from '../../../src/domain/errors';
import type { Profissional } from '../../../src/domain/entities/Profissional';
import type { Projeto, TipoEstrategia } from '../../../src/domain/entities/Projeto';
import { FabricaFiccao } from '../../../src/factories/ficcao/FabricaFiccao';
import { OrquestradorPadrao } from '../../../src/orchestration/OrquestradorPadrao';
import { CossenoStrategy } from '../../../src/strategies/CossenoStrategy';
import { RegistroEstrategias } from '../../../src/strategies/RegistroEstrategias';
import { FiltragemColaborativaStrategy } from '../../../src/strategies/FiltragemColaborativaStrategy';
import { OrcamentoReduzidoStrategy } from '../../../src/strategies/OrcamentoReduzidoStrategy';
import { similaridadeCosseno } from '../../../src/domain/entities/Competencia';
import { arredondar, type ContextoEstrategia } from '../../../src/strategies/RecomendacaoStrategy';
import { criarProfissional, criarProjeto, DATA_REFERENCIA, gerarProfissionais, OPCOES_FABRICA } from '../../support/fixtures';

/**
 * Cenário em que cada estratégia tem um "vencedor" diferente para DIRETOR:
 * - especialista: perfil idêntico ao desejado, caro, de outra cidade, mal avaliado pelo vizinho do produtor;
 * - bemAvaliado: competências fracas, mas avaliado com nota máxima por um produtor de gosto parecido;
 * - localBarato: aderência média, barato e na mesma cidade do projeto.
 */
function cenario(): { projeto: Projeto; universo: Profissional[] } {
  const projeto = criarProjeto({ orcamentoTotal: 50000, localizacao: 'São Paulo', papeis: [{ papel: 'DIRETOR', peso: 1 }] });
  const especialista = criarProfissional({
    id: 'especialista',
    precoMin: 40000,
    localizacao: 'Rio de Janeiro',
    competencias: { direcao: 1, narrativa: 0.8, lideranca: 0.9 },
    notas: [['produtor-2', 2]],
  });
  const bemAvaliado = criarProfissional({
    id: 'bem-avaliado',
    precoMin: 30000,
    localizacao: 'Curitiba',
    competencias: { direcao: 0.3, fotografia: 0.9 },
    notas: [['produtor-2', 5]],
  });
  const localBarato = criarProfissional({
    id: 'local-barato',
    precoMin: 8000,
    localizacao: 'são paulo',
    competencias: { direcao: 0.5, roteiro: 0.8 },
  });
  // Editor avaliado igualmente pelos dois produtores: torna produtor-1 e produtor-2 "vizinhos".
  const editorComum = criarProfissional({
    id: 'editor-comum',
    especialidades: ['EDITOR'],
    notas: [
      ['produtor-1', 5],
      ['produtor-2', 5],
    ],
  });
  return { projeto, universo: [especialista, bemAvaliado, localBarato, editorComum] };
}

function contexto(projeto: Projeto, universo: Profissional[], orcamentoPapel = 50000): ContextoEstrategia {
  return { projeto, papel: 'DIRETOR', perfilDesejado: projeto.perfilDesejado('DIRETOR'), orcamentoPapel, universo };
}

describe('Strategy — trocar a estratégia muda o resultado para o mesmo input', () => {
  it.each<[TipoEstrategia, string]>([
    ['COSSENO', 'especialista'],
    ['FILTRAGEM_COLABORATIVA', 'bem-avaliado'],
    ['ORCAMENTO_REDUZIDO', 'local-barato'],
  ])('estratégia %s recomenda %s como diretor', (tipo, esperado) => {
    const { projeto, universo } = cenario();
    const orquestrador = new OrquestradorPadrao(new FabricaFiccao(OPCOES_FABRICA));
    const resultado = orquestrador.orquestrar({
      projeto,
      profissionais: universo,
      estrategia: RegistroEstrategias.padrao().obter(tipo),
      dataReferencia: DATA_REFERENCIA,
    });
    expect(resultado.estrategia).toBe(tipo);
    expect(resultado.selecionados[0]?.escolhido.profissional.id).toBe(esperado);
  });

  it('as três estratégias produzem três escolhas distintas', () => {
    const { projeto, universo } = cenario();
    const orquestrador = new OrquestradorPadrao(new FabricaFiccao(OPCOES_FABRICA));
    const registro = RegistroEstrategias.padrao();
    const escolhas = (['COSSENO', 'FILTRAGEM_COLABORATIVA', 'ORCAMENTO_REDUZIDO'] as const)
      .map((tipo) => registro.obter(tipo))
      .map(
        (estrategia) =>
          orquestrador.orquestrar({ projeto, profissionais: universo, estrategia, dataReferencia: DATA_REFERENCIA })
            .selecionados[0]?.escolhido.profissional.id,
      );
    expect(new Set(escolhas).size).toBe(3);
  });
});

describe('CossenoStrategy', () => {
  it('pontua pela similaridade de cosseno e ordena de forma decrescente', () => {
    const { projeto, universo } = cenario();
    const diretores = universo.filter((p) => p.atuaComo('DIRETOR'));
    const ranking = new CossenoStrategy().recomendar(diretores, contexto(projeto, universo));
    expect(ranking.map((c) => c.profissional.id)).toEqual(['especialista', 'local-barato', 'bem-avaliado']);
    expect(ranking[0]?.score).toBeCloseTo(1, 4);
    expect(ranking[0]?.detalhes.similaridade).toBeCloseTo(1, 4);
  });

  it('atribui zero a quem não tem competências', () => {
    const { projeto } = cenario();
    const semCompetencias = criarProfissional({ competencias: {} });
    const [unico] = new CossenoStrategy().recomendar([semCompetencias], contexto(projeto, [semCompetencias]));
    expect(unico?.score).toBe(0);
  });

  it('desempata por preço mínimo e depois por id', () => {
    const { projeto } = cenario();
    const a = criarProfissional({ id: 'b', precoMin: 5000 });
    const b = criarProfissional({ id: 'a', precoMin: 5000 });
    const c = criarProfissional({ id: 'c', precoMin: 1000 });
    const ranking = new CossenoStrategy().recomendar([a, b, c], contexto(projeto, [a, b, c]));
    expect(ranking.map((x) => x.profissional.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('FiltragemColaborativaStrategy', () => {
  it('prevê a nota a partir de produtores com gosto semelhante', () => {
    const { projeto, universo } = cenario();
    const diretores = universo.filter((p) => p.atuaComo('DIRETOR'));
    const ranking = new FiltragemColaborativaStrategy().recomendar(diretores, contexto(projeto, universo));
    const porId = Object.fromEntries(ranking.map((c) => [c.profissional.id, c]));
    expect(porId['bem-avaliado']?.detalhes.notaPrevista).toBe(5);
    expect(porId['especialista']?.detalhes.notaPrevista).toBe(2);
    expect(porId['local-barato']?.detalhes.pesoVizinhos).toBe(0);
  });

  it('usa a própria nota do produtor quando ele já avaliou o profissional', () => {
    const avaliado = criarProfissional({ id: 'avaliado', notas: [['produtor-1', 1]] });
    const projeto = criarProjeto({ papeis: [{ papel: 'DIRETOR', peso: 1 }] });
    const [c] = new FiltragemColaborativaStrategy().recomendar([avaliado], contexto(projeto, [avaliado]));
    expect(c?.detalhes.notaPrevista).toBe(1);
  });

  it('ignora vizinhos com gosto oposto e cai na média bayesiana', () => {
    // produtor-1 e produtor-3 discordam sobre o editor -> similaridade negativa.
    const editor = criarProfissional({ id: 'ed', especialidades: ['EDITOR'], notas: [['produtor-1', 5], ['produtor-3', 1]] });
    const diretor = criarProfissional({ id: 'dir', notas: [['produtor-3', 5]] });
    const projeto = criarProjeto({ papeis: [{ papel: 'DIRETOR', peso: 1 }] });
    const [c] = new FiltragemColaborativaStrategy().recomendar([diretor], contexto(projeto, [editor, diretor]));
    expect(c?.detalhes.pesoVizinhos).toBe(0);
    // média global = (5+1+5)/3 = 3.667; bayesiana = (2*3.667 + 5) / 3
    expect(c?.detalhes.notaPrevista).toBeCloseTo((2 * (11 / 3) + 5) / 3, 3);
  });

  it('sem nenhuma avaliação no universo usa o ponto médio da escala', () => {
    const p = criarProfissional();
    const projeto = criarProjeto({ papeis: [{ papel: 'DIRETOR', peso: 1 }] });
    const [c] = new FiltragemColaborativaStrategy().recomendar([p], contexto(projeto, [p]));
    expect(c?.detalhes.notaPrevista).toBe(3);
    expect(c?.score).toBe(0.6);
  });

  it('reaproveita o modelo para o mesmo universo', () => {
    const { projeto, universo } = cenario();
    const estrategia = new FiltragemColaborativaStrategy();
    const primeira = estrategia.recomendar(universo.slice(0, 3), contexto(projeto, universo));
    const segunda = estrategia.recomendar(universo.slice(0, 3), contexto(projeto, universo));
    expect(segunda).toEqual(primeira);
  });

  it('pondera a nota de cada vizinho pela similaridade com o produtor', () => {
    // produtor-2 concorda em tudo com produtor-1 (similaridade 1); produtor-3 só em parte.
    const e1 = criarProfissional({ id: 'e1', especialidades: ['EDITOR'], notas: [['produtor-1', 5], ['produtor-2', 5], ['produtor-3', 5]] });
    const e2 = criarProfissional({ id: 'e2', especialidades: ['EDITOR'], notas: [['produtor-1', 4], ['produtor-3', 1]] });
    const alvo = criarProfissional({ id: 'alvo', notas: [['produtor-2', 5], ['produtor-3', 1]] });
    const projeto = criarProjeto({ papeis: [{ papel: 'DIRETOR', peso: 1 }] });
    const [c] = new FiltragemColaborativaStrategy().recomendar([alvo], contexto(projeto, [e1, e2, alvo]));
    // Notas centralizadas em comum com produtor-3: (2, 1) e (2, -2).
    const s3 = 2 / (Math.sqrt(5) * Math.sqrt(8));
    expect(c?.detalhes.pesoVizinhos).toBeCloseTo(1 + s3, 4);
    expect(c?.detalhes.notaPrevista).toBeCloseTo((1 * 5 + s3 * 1) / (1 + s3), 4);
  });

  it('dá o mesmo resultado que somar os vizinhos candidato a candidato', () => {
    const universo = gerarProfissionais(3000);
    let comVizinhos = 0;
    for (const produtorId of ['produtor-0', 'produtor-7', 'produtor-19', 'sem-avaliacoes']) {
      const projeto = criarProjeto({ produtorId, papeis: [{ papel: 'DIRETOR', peso: 1 }] });
      const candidatos = universo.filter((p) => p.atuaComo('DIRETOR'));
      const ranking = new FiltragemColaborativaStrategy().recomendar(candidatos, contexto(projeto, universo));
      const esperado = previsoesDeReferencia(universo, produtorId);
      expect(ranking).toHaveLength(candidatos.length);
      for (const { profissional, detalhes } of ranking) {
        const referencia = esperado(profissional);
        expect([profissional.id, detalhes.notaPrevista, detalhes.pesoVizinhos]).toEqual([profissional.id, referencia.nota, referencia.peso]);
        if (referencia.peso > 0) comVizinhos += 1;
      }
    }
    expect(comVizinhos).toBeGreaterThan(100);
  });
});

// Cálculo direto da filtragem colaborativa: para cada candidato percorre os vizinhos em ordem.
function previsoesDeReferencia(universo: readonly Profissional[], produtor: string): (p: Profissional) => { nota: number; peso: number } {
  const notas = new Map<string, Map<string, number>>();
  let somaGeral = 0;
  let quantidadeGeral = 0;
  for (const profissional of universo) {
    const porAutor = new Map<string, number[]>();
    for (const { autorId, nota } of profissional.avaliacoes) {
      porAutor.set(autorId, [...(porAutor.get(autorId) ?? []), nota]);
      somaGeral += nota;
      quantidadeGeral += 1;
    }
    for (const [autor, lista] of porAutor) {
      if (!notas.has(autor)) notas.set(autor, new Map());
      notas.get(autor)?.set(profissional.id, lista.reduce((a, b) => a + b, 0) / lista.length);
    }
  }
  const mediaGeral = quantidadeGeral === 0 ? 3 : somaGeral / quantidadeGeral;
  const minhas = notas.get(produtor);
  const vizinhos: Array<[Map<string, number>, number]> = [];
  for (const [outro, notasDoOutro] of notas) {
    if (outro === produtor || !minhas) continue;
    const a: Record<string, number> = {};
    const b: Record<string, number> = {};
    for (const [id, nota] of minhas) {
      const notaB = notasDoOutro.get(id);
      if (notaB === undefined) continue;
      a[id] = nota - 3;
      b[id] = notaB - 3;
    }
    const s = similaridadeCosseno(a, b);
    if (s > 0) vizinhos.push([notasDoOutro, s]);
  }
  return (p) => {
    let somaPonderada = 0;
    let pesoTotal = 0;
    for (const [notasDoVizinho, s] of vizinhos) {
      const nota = notasDoVizinho.get(p.id);
      if (nota === undefined) continue;
      somaPonderada += s * nota;
      pesoTotal += s;
    }
    const soma = p.avaliacoes.reduce((acc, a) => acc + a.nota, 0);
    const bayesiana = (2 * mediaGeral + soma) / (2 + p.avaliacoes.length);
    const previsao = minhas?.get(p.id) ?? (pesoTotal > 0 ? somaPonderada / pesoTotal : undefined) ?? bayesiana;
    return { nota: arredondar(previsao), peso: arredondar(pesoTotal) };
  };
}

describe('OrcamentoReduzidoStrategy', () => {
  it('descarta quem excede a fatia do orçamento ou tem reputação ruim comprovada', () => {
    const { projeto } = cenario();
    const caro = criarProfissional({ id: 'caro', precoMin: 60000 });
    const malAvaliado = criarProfissional({ id: 'ruim', precoMin: 5000, notas: [['x', 1], ['y', 2]] });
    const umaNotaRuim = criarProfissional({ id: 'uma-nota', precoMin: 5000, notas: [['x', 1]] });
    const ranking = new OrcamentoReduzidoStrategy().recomendar(
      [caro, malAvaliado, umaNotaRuim],
      contexto(projeto, [caro, malAvaliado, umaNotaRuim]),
    );
    expect(ranking.map((c) => c.profissional.id)).toEqual(['uma-nota']);
  });

  it('combina economia, localização e reputação', () => {
    const { projeto, universo } = cenario();
    const diretores = universo.filter((p) => p.atuaComo('DIRETOR'));
    const ranking = new OrcamentoReduzidoStrategy().recomendar(diretores, contexto(projeto, universo));
    const local = ranking[0];
    expect(local?.profissional.id).toBe('local-barato');
    expect(local?.detalhes).toEqual({ economia: 0.84, local: 1, reputacao: 0.6 });
    expect(local?.score).toBeCloseTo(0.5 * 0.84 + 0.3 + 0.2 * 0.6, 4);
  });

  it('com orçamento do papel zerado não há economia possível', () => {
    const { projeto } = cenario();
    const gratuito = criarProfissional({ precoMin: 0 });
    const [c] = new OrcamentoReduzidoStrategy().recomendar([gratuito], contexto(projeto, [gratuito], 0));
    expect(c?.detalhes.economia).toBe(0);
  });
});

describe('RegistroEstrategias', () => {
  it('resolve cada tipo para a estratégia concreta correspondente', () => {
    const registro = RegistroEstrategias.padrao();
    expect(registro.obter('COSSENO')).toBeInstanceOf(CossenoStrategy);
    expect(registro.obter('FILTRAGEM_COLABORATIVA')).toBeInstanceOf(FiltragemColaborativaStrategy);
    expect(registro.obter('ORCAMENTO_REDUZIDO')).toBeInstanceOf(OrcamentoReduzidoStrategy);
  });

  it('rejeita estratégia não registrada', () => {
    expect(() => new RegistroEstrategias().obter('COSSENO')).toThrow(ErroValidacao);
  });
});
