import type { ProjetoPublicitario } from '../../domain/entities/ProjetoPublicitario';
import { ValidacaoConsistenciaVisitor } from '../../visitors/ValidacaoConsistenciaVisitor';

interface DuracoesDaPeca {
  estimadaSegundos: number;
  maximaSegundos: number;
}

// A duração estimada não pode passar da duração máxima da peça (limite de veiculação).
export class ValidadorPublicitario extends ValidacaoConsistenciaVisitor {
  private duracoes: DuracoesDaPeca | undefined;

  override visitarProjetoPublicitario(projeto: ProjetoPublicitario): void {
    super.visitarProjetoPublicitario(projeto);
    this.duracoes = { estimadaSegundos: projeto.duracaoEstimadaMin * 60, maximaSegundos: projeto.duracaoMaxSegundos };
  }

  protected override errosDoTipo(): string[] {
    const duracoes = this.duracoes;
    if (!duracoes || duracoes.estimadaSegundos <= duracoes.maximaSegundos) return [];
    return [`Duração estimada (${duracoes.estimadaSegundos} s) excede a duração máxima da peça (${duracoes.maximaSegundos} s)`];
  }
}
