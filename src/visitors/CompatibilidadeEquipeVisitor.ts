import { similaridadeCosseno } from '../domain/entities/Competencia';
import type { Profissional } from '../domain/entities/Profissional';
import type { PapelTecnico, Projeto } from '../domain/entities/Projeto';
import type { MembroRecomendadoLeitura } from '../domain/entities/Recomendacao';
import { arredondar } from '../strategies/RecomendacaoStrategy';
import { VisitanteBase } from './VisitanteBase';

export interface CompatibilidadePapel {
  papel: PapelTecnico;
  profissionalId: string;
  competencias: number;
  reputacao: number;
  localizacao: number;
  compatibilidade: number;
}

export interface ResultadoCompatibilidade {
  // Média ponderada pelos pesos dos papéis; papéis vazios contam como 0.
  indiceGeral: number;
  // Fração dos papéis requeridos com membro ativo.
  cobertura: number;
  porPapel: CompatibilidadePapel[];
}

export interface PesosCompatibilidade {
  competencias: number;
  reputacao: number;
  localizacao: number;
  // Reputação (0..1) assumida para profissionais sem avaliações.
  reputacaoSemAvaliacao: number;
}

// Pesos padrão da fórmula; podem ser trocados no construtor.
export const PESOS_COMPATIBILIDADE: PesosCompatibilidade = {
  competencias: 0.6,
  reputacao: 0.25,
  localizacao: 0.15,
  reputacaoSemAvaliacao: 0.5,
};

// Calcula uma métrica de compatibilidade geral da equipe com o projeto.
export class CompatibilidadeEquipeVisitor extends VisitanteBase<ResultadoCompatibilidade> {
  private readonly membrosPorProfissional = new Map<string, MembroRecomendadoLeitura>();
  private readonly porPapel: CompatibilidadePapel[] = [];

  constructor(private readonly pesos: PesosCompatibilidade = PESOS_COMPATIBILIDADE) {
    super();
  }

  override visitarMembro(membro: MembroRecomendadoLeitura): void {
    this.membrosPorProfissional.set(membro.profissionalId, membro);
  }

  override visitarProfissional(profissional: Profissional): void {
    const membro = this.membrosPorProfissional.get(profissional.id);
    const projeto = this.projetoVisitado;
    if (membro && projeto) this.porPapel.push(this.compatibilidadeDoMembro(projeto, membro, profissional));
  }

  resultado(): ResultadoCompatibilidade {
    const projeto = this.obterProjetoVisitado();
    const somaPesos = projeto.papeis.reduce((soma, p) => soma + p.peso, 0);
    const indice = projeto.papeis.reduce((soma, requerido) => soma + requerido.peso * this.compatibilidadeDoPapel(requerido.papel), 0);
    return {
      indiceGeral: arredondar(indice / somaPesos),
      cobertura: arredondar(this.porPapel.length / projeto.papeis.length),
      porPapel: [...this.porPapel],
    };
  }

  private compatibilidadeDoMembro(projeto: Projeto, membro: MembroRecomendadoLeitura, profissional: Profissional): CompatibilidadePapel {
    const competencias = similaridadeCosseno(projeto.perfilDesejado(membro.papel), profissional.vetorCompetencias());
    const reputacao = profissional.reputacao(this.pesos.reputacaoSemAvaliacao);
    const localizacao = profissional.proximidadeDe(projeto.localizacao);
    const ponderada = this.pesos.competencias * competencias + this.pesos.reputacao * reputacao + this.pesos.localizacao * localizacao;
    return {
      papel: membro.papel,
      profissionalId: profissional.id,
      competencias: arredondar(competencias),
      reputacao: arredondar(reputacao),
      localizacao,
      compatibilidade: arredondar(ponderada),
    };
  }

  private compatibilidadeDoPapel(papel: PapelTecnico): number {
    return this.porPapel.find((p) => p.papel === papel)?.compatibilidade ?? 0;
  }
}
