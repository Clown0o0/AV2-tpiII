// submarino
import { obterOuCalcular } from '../compartilhado/memoizacao';
import { Avaliacao } from '../domain/entities/Avaliacao';
import { similaridadeCosseno } from '../domain/entities/Competencia';
import type { Profissional } from '../domain/entities/Profissional';
import {
  arredondar,
  ordenarRanking,
  type CandidatoPontuado,
  type ContextoEstrategia,
  type RecomendacaoStrategy,
} from './RecomendacaoStrategy';

export const PESO_PRIOR_BAYESIANO = 2; // quantas "notas virtuais" com a média geral cada profissional recebe
export const NOTA_NEUTRA = 3;

type NotasDoProdutorPorProfissional = Map<string, number>;
type NotasPorProdutor = Map<string, NotasDoProdutorPorProfissional>;

// Estima a nota que o produtor do projeto daria a cada candidato, com base nas notas de
// produtores de gosto parecido. Sem vizinhos, cai numa média suavizada do próprio candidato.
export class FiltragemColaborativaStrategy implements RecomendacaoStrategy {
  readonly tipo = 'FILTRAGEM_COLABORATIVA' as const;
  readonly descricao = 'Filtragem colaborativa usando o histórico de avaliações de produtores';

  recomendar(candidatos: readonly Profissional[], contexto: ContextoEstrategia): CandidatoPontuado[] {
    const resumo = resumoDoUniverso(contexto.universo);
    const produtor = contexto.projeto.produtorId;
    const minhasNotas = resumo.notas.get(produtor);
    const somasDosVizinhos = somasDosVizinhosDoProdutor(resumo, produtor);
    return ordenarRanking(candidatos.map((profissional) => pontuar(profissional, minhasNotas, somasDosVizinhos, resumo.mediaGeral)));
  }
}

function pontuar(
  profissional: Profissional,
  minhasNotas: NotasDoProdutorPorProfissional | undefined,
  somasDosVizinhos: SomasDosVizinhos,
  mediaGeral: number,
): CandidatoPontuado {
  const { media: mediaDosVizinhos, pesoTotal } = mediaPonderadaDosVizinhos(somasDosVizinhos.get(profissional.id));
  const previsao = minhasNotas?.get(profissional.id) ?? mediaDosVizinhos ?? mediaBayesiana(profissional, mediaGeral);
  return {
    profissional,
    score: arredondar(previsao / Avaliacao.NOTA_MAXIMA),
    detalhes: { notaPrevista: arredondar(previsao), pesoVizinhos: arredondar(pesoTotal) },
  };
}

function mediaPonderadaDosVizinhos(soma: SomaPonderada | undefined): { media: number | undefined; pesoTotal: number } {
  const pesoTotal = soma?.pesoTotal ?? 0;
  return { media: soma && pesoTotal > 0 ? soma.somaPonderada / pesoTotal : undefined, pesoTotal };
}

type Vizinho = [notasDoVizinho: Map<string, number>, similaridade: number];

interface SomaPonderada {
  somaPonderada: number;
  pesoTotal: number;
}

// Por profissional: soma das notas dos vizinhos que o avaliaram, ponderadas pela similaridade.
type SomasDosVizinhos = Map<string, SomaPonderada>;

interface ResumoUniverso {
  notas: NotasPorProdutor;
  mediaGeral: number;
  somasPorProdutor: Map<string, SomasDosVizinhos>;
}

// Cache por array: numa rodada todos os papéis recebem o mesmo `universo`.
const CACHE_RESUMOS_POR_UNIVERSO = new WeakMap<readonly Profissional[], ResumoUniverso>();

function resumoDoUniverso(universo: readonly Profissional[]): ResumoUniverso {
  return obterOuCalcular(CACHE_RESUMOS_POR_UNIVERSO, universo, () => ({
    notas: agruparNotas(universo),
    mediaGeral: calcularMediaGeral(universo),
    somasPorProdutor: new Map(),
  }));
}

function somasDosVizinhosDoProdutor(resumo: ResumoUniverso, produtor: string): SomasDosVizinhos {
  return obterOuCalcular(resumo.somasPorProdutor, produtor, () => somarNotasDosVizinhos(calcularVizinhos(resumo.notas, produtor)));
}

// Calculado uma vez por produtor em vez de percorrer os vizinhos para cada candidato. Os vizinhos
// são somados na mesma ordem, então o resultado é idêntico ao da soma feita candidato a candidato.
function somarNotasDosVizinhos(vizinhos: readonly Vizinho[]): SomasDosVizinhos {
  const somas: SomasDosVizinhos = new Map();
  for (const [notasDoVizinho, similaridade] of vizinhos) {
    for (const [profissionalId, nota] of notasDoVizinho) {
      const soma = somas.get(profissionalId);
      if (soma) {
        soma.somaPonderada += similaridade * nota;
        soma.pesoTotal += similaridade;
      } else {
        somas.set(profissionalId, { somaPonderada: similaridade * nota, pesoTotal: similaridade });
      }
    }
  }
  return somas;
}

function calcularVizinhos(notas: NotasPorProdutor, produtor: string): Vizinho[] {
  const minhasNotas = notas.get(produtor);
  const vizinhos: Vizinho[] = [];
  for (const [outro, notasDoOutro] of notas) {
    if (outro === produtor) continue;
    const s = similaridadeEntreProdutores(minhasNotas, notasDoOutro);
    if (s > 0) vizinhos.push([notasDoOutro, s]);
  }
  return vizinhos;
}

// Cache porque as avaliações de um profissional não mudam depois de carregadas.
const CACHE_MEDIAS_POR_PROFISSIONAL = new WeakMap<Profissional, Array<[autorId: string, media: number]>>();

function mediasPorAutor(profissional: Profissional): Array<[string, number]> {
  return obterOuCalcular(CACHE_MEDIAS_POR_PROFISSIONAL, profissional, () => calcularMediasPorAutor(profissional));
}

function calcularMediasPorAutor(profissional: Profissional): Array<[string, number]> {
  const acumulado = new Map<string, { soma: number; quantidade: number }>();
  for (const { autorId, nota } of profissional.avaliacoes) {
    const atual = acumulado.get(autorId) ?? { soma: 0, quantidade: 0 };
    acumulado.set(autorId, { soma: atual.soma + nota, quantidade: atual.quantidade + 1 });
  }
  return [...acumulado].map(([autor, { soma, quantidade }]) => [autor, soma / quantidade]);
}

function agruparNotas(profissionais: readonly Profissional[]): NotasPorProdutor {
  const notas: NotasPorProdutor = new Map();
  for (const profissional of profissionais) {
    for (const [autor, media] of mediasPorAutor(profissional)) {
      let doAutor = notas.get(autor);
      if (!doAutor) {
        doAutor = new Map();
        notas.set(autor, doAutor);
      }
      doAutor.set(profissional.id, media);
    }
  }
  return notas;
}

function calcularMediaGeral(profissionais: readonly Profissional[]): number {
  let soma = 0;
  let quantidade = 0;
  for (const profissional of profissionais) {
    for (const avaliacao of profissional.avaliacoes) {
      soma += avaliacao.nota;
      quantidade += 1;
    }
  }
  return quantidade === 0 ? NOTA_NEUTRA : soma / quantidade;
}

// Notas centralizadas no meio da escala para que gostos opostos deem similaridade negativa;
// só entram os profissionais avaliados pelos dois produtores.
function similaridadeEntreProdutores(a: NotasDoProdutorPorProfissional | undefined, b: NotasDoProdutorPorProfissional): number {
  if (!a) return 0;
  const [centralizadasA, centralizadasB] = notasCentralizadasEmComum(a, b);
  return similaridadeCosseno(centralizadasA, centralizadasB);
}

function notasCentralizadasEmComum(
  a: NotasDoProdutorPorProfissional,
  b: NotasDoProdutorPorProfissional,
): [Record<string, number>, Record<string, number>] {
  const centralizadasA: Record<string, number> = {};
  const centralizadasB: Record<string, number> = {};
  for (const [profissionalId, notaA] of a) {
    const notaB = b.get(profissionalId);
    if (notaB === undefined) continue;
    centralizadasA[profissionalId] = notaA - NOTA_NEUTRA;
    centralizadasB[profissionalId] = notaB - NOTA_NEUTRA;
  }
  return [centralizadasA, centralizadasB];
}

function mediaBayesiana(profissional: Profissional, mediaGeral: number): number {
  const soma = profissional.avaliacoes.reduce((acc, a) => acc + a.nota, 0);
  return (PESO_PRIOR_BAYESIANO * mediaGeral + soma) / (PESO_PRIOR_BAYESIANO + profissional.avaliacoes.length);
}
