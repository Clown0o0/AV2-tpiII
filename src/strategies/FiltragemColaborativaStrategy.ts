import { Avaliacao } from '../domain/entities/Avaliacao';
import type { Profissional } from '../domain/entities/Profissional';
import {
  arredondar,
  ordenarRanking,
  type CandidatoPontuado,
  type ContextoEstrategia,
  type RecomendacaoStrategy,
} from './RecomendacaoStrategy';

// Parâmetros da filtragem colaborativa.
export const PESO_PRIOR_BAYESIANO = 2; // quantas "notas virtuais" com a média geral cada profissional recebe
export const NOTA_NEUTRA = 3; // meio da escala 1..5

type NotasPorProdutor = Map<string, Map<string, number>>; // produtor -> (profissional -> nota média)

// Estima a nota que o produtor do projeto daria a cada candidato, com base nas notas de
// produtores de gosto parecido. Sem vizinhos, cai numa média suavizada do próprio candidato.
export class FiltragemColaborativaStrategy implements RecomendacaoStrategy {
  readonly tipo = 'FILTRAGEM_COLABORATIVA' as const;
  readonly descricao = 'Filtragem colaborativa usando o histórico de avaliações de produtores';

  recomendar(candidatos: readonly Profissional[], contexto: ContextoEstrategia): CandidatoPontuado[] {
    const resumo = resumoDoUniverso(contexto.universo);
    const { notas, mediaGeral } = resumo;
    const produtor = contexto.projeto.produtorId;
    const minhasNotas = notas.get(produtor);
    const vizinhos = vizinhosDoProdutor(resumo, produtor);

    const ranking = candidatos.map((profissional) => {
      let somaPonderada = 0;
      let somaPesos = 0;
      for (const [notasDoVizinho, s] of vizinhos) {
        const nota = notasDoVizinho.get(profissional.id);
        if (nota === undefined) continue;
        somaPonderada += s * nota;
        somaPesos += s;
      }

      const previsao =
        minhasNotas?.get(profissional.id) ??
        (somaPesos > 0 ? somaPonderada / somaPesos : mediaBayesiana(profissional, mediaGeral));

      return {
        profissional,
        score: arredondar(previsao / Avaliacao.NOTA_MAXIMA),
        detalhes: { notaPrevista: arredondar(previsao), pesoVizinhos: arredondar(somaPesos) },
      };
    });
    return ordenarRanking(ranking);
  }
}

type Vizinho = [notasDoVizinho: Map<string, number>, similaridade: number];

interface ResumoUniverso {
  notas: NotasPorProdutor;
  mediaGeral: number;
  vizinhos: Map<string, Vizinho[]>;
}

// Em uma rodada, todos os papéis recebem o mesmo array `universo`; o resumo é calculado uma vez por array.
const RESUMOS = new WeakMap<readonly Profissional[], ResumoUniverso>();

function resumoDoUniverso(universo: readonly Profissional[]): ResumoUniverso {
  let resumo = RESUMOS.get(universo);
  if (!resumo) {
    resumo = { notas: agruparNotas(universo), mediaGeral: calcularMediaGeral(universo), vizinhos: new Map() };
    RESUMOS.set(universo, resumo);
  }
  return resumo;
}

function vizinhosDoProdutor(resumo: ResumoUniverso, produtor: string): Vizinho[] {
  let vizinhos = resumo.vizinhos.get(produtor);
  if (!vizinhos) {
    vizinhos = [];
    const minhasNotas = resumo.notas.get(produtor);
    for (const [outro, notasDoOutro] of resumo.notas) {
      if (outro === produtor) continue;
      const s = similaridade(minhasNotas, notasDoOutro);
      if (s > 0) vizinhos.push([notasDoOutro, s]);
    }
    resumo.vizinhos.set(produtor, vizinhos);
  }
  return vizinhos;
}

// Média das notas que cada produtor deu a um profissional; não muda, então é calculada uma vez por profissional.
const MEDIAS_POR_PROFISSIONAL = new WeakMap<Profissional, Array<[autorId: string, media: number]>>();

function mediasPorAutor(profissional: Profissional): Array<[string, number]> {
  let medias = MEDIAS_POR_PROFISSIONAL.get(profissional);
  if (!medias) {
    const acumulado = new Map<string, { soma: number; quantidade: number }>();
    for (const { autorId, nota } of profissional.avaliacoes) {
      const atual = acumulado.get(autorId) ?? { soma: 0, quantidade: 0 };
      atual.soma += nota;
      atual.quantidade += 1;
      acumulado.set(autorId, atual);
    }
    medias = [...acumulado].map(([autor, { soma, quantidade }]) => [autor, soma / quantidade]);
    MEDIAS_POR_PROFISSIONAL.set(profissional, medias);
  }
  return medias;
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

// Cosseno entre dois produtores, só sobre quem os dois avaliaram. As notas são centralizadas
// no meio da escala, assim gostos opostos dão similaridade negativa.
function similaridade(a: Map<string, number> | undefined, b: Map<string, number>): number {
  if (!a) return 0;
  let produto = 0;
  let normaA = 0;
  let normaB = 0;
  for (const [id, notaA] of a) {
    const notaB = b.get(id);
    if (notaB === undefined) continue;
    const x = notaA - NOTA_NEUTRA;
    const y = notaB - NOTA_NEUTRA;
    produto += x * y;
    normaA += x * x;
    normaB += y * y;
  }
  if (normaA === 0 || normaB === 0) return 0;
  return produto / Math.sqrt(normaA * normaB);
}

function mediaBayesiana(profissional: Profissional, mediaGeral: number): number {
  const soma = profissional.avaliacoes.reduce((acc, a) => acc + a.nota, 0);
  return (PESO_PRIOR_BAYESIANO * mediaGeral + soma) / (PESO_PRIOR_BAYESIANO + profissional.avaliacoes.length);
}
