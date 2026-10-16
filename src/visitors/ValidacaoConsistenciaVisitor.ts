import type { Profissional } from '../domain/entities/Profissional';
import type { PapelTecnico, Projeto } from '../domain/entities/Projeto';
import type { MembroRecomendadoLeitura, Recomendacao } from '../domain/entities/Recomendacao';
import { VisitanteBase } from './VisitanteBase';

export interface ResultadoValidacao {
  valida: boolean;
  erros: string[];
  custoTotal: number;
  orcamentoTotal: number;
  papeisPreenchidos: number;
  papeisRequeridos: number;
}

// Verifica papéis obrigatórios preenchidos, orçamento suficiente e coerência de cada membro.
export class ValidacaoConsistenciaVisitor extends VisitanteBase<ResultadoValidacao> {
  private readonly erros: string[] = [];
  private readonly membrosPorProfissional = new Map<string, MembroRecomendadoLeitura>();
  private readonly profissionaisVisitados = new Set<string>();
  private custoTotal = 0;

  constructor(private readonly inicioDaJanelaDeDisponibilidade: Date = new Date()) {
    super();
  }

  override visitarRecomendacao(recomendacao: Recomendacao): void {
    if (recomendacao.status === 'OBSOLETA') this.erros.push('Recomendação obsoleta (substituída por uma reavaliação)');
  }

  override visitarMembro(membro: MembroRecomendadoLeitura): void {
    if (this.membrosPorProfissional.has(membro.profissionalId)) {
      this.erros.push(`Profissional ${membro.profissionalId} alocado em mais de um papel`);
    }
    this.membrosPorProfissional.set(membro.profissionalId, membro);
    this.custoTotal += membro.custo;
  }

  override visitarProfissional(profissional: Profissional): void {
    this.profissionaisVisitados.add(profissional.id);
    const membro = this.membrosPorProfissional.get(profissional.id);
    if (!membro) return;
    if (!profissional.atuaComo(membro.papel)) this.erros.push(`${profissional.nome} não possui especialidade ${membro.papel}`);
    if (membro.custo < profissional.precoMin || membro.custo > profissional.precoMax) {
      this.erros.push(`Custo de ${profissional.nome} (${membro.custo}) fora da faixa de preço`);
    }
    if (!this.disponivelAteAEntrega(profissional)) this.erros.push(`${profissional.nome} não está disponível até a data de entrega`);
  }

  resultado(): ResultadoValidacao {
    const projeto = this.obterProjetoVisitado();
    const papeisPreenchidos = new Set([...this.membrosPorProfissional.values()].map((m) => m.papel));
    const erros = [
      ...this.erros,
      ...this.errosDePapeisVazios(projeto, papeisPreenchidos),
      ...this.errosDeProfissionaisAusentes(),
      ...this.errosDeOrcamento(projeto),
      ...this.errosDoTipo(projeto),
    ];
    return {
      valida: erros.length === 0,
      erros,
      custoTotal: this.custoTotal,
      orcamentoTotal: projeto.orcamentoTotal,
      papeisPreenchidos: papeisPreenchidos.size,
      papeisRequeridos: projeto.papeis.length,
    };
  }

  // Regras extras de cada tipo de projeto (validadores das fábricas); a ficção não tem nenhuma.
  protected errosDoTipo(_projeto: Projeto): string[] {
    return [];
  }

  private disponivelAteAEntrega(profissional: Profissional): boolean {
    const entrega = this.projetoVisitado?.dataEntrega;
    if (!entrega || entrega <= this.inicioDaJanelaDeDisponibilidade) return true;
    return profissional.disponivelEntre(this.inicioDaJanelaDeDisponibilidade, entrega);
  }

  private errosDePapeisVazios(projeto: Projeto, preenchidos: ReadonlySet<PapelTecnico>): string[] {
    return projeto.papeis.filter(({ papel }) => !preenchidos.has(papel)).map(({ papel }) => `Papel obrigatório ${papel} não preenchido`);
  }

  private errosDeProfissionaisAusentes(): string[] {
    return [...this.membrosPorProfissional]
      .filter(([profissionalId]) => !this.profissionaisVisitados.has(profissionalId))
      .map(([profissionalId, membro]) => `Profissional ${profissionalId} (${membro.papel}) não encontrado`);
  }

  private errosDeOrcamento(projeto: Projeto): string[] {
    if (this.custoTotal <= projeto.orcamentoTotal) return [];
    return [`Orçamento insuficiente: equipe custa ${this.custoTotal}, orçamento é ${projeto.orcamentoTotal}`];
  }
}
