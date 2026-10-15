import type { Projeto } from '../../domain/entities/Projeto';
import { ProjetoPublicitario } from '../../domain/entities/ProjetoPublicitario';
import { ValidacaoConsistenciaVisitor } from '../../visitors/ValidacaoConsistenciaVisitor';

// A duração estimada não pode passar da duração máxima da peça (limite de veiculação).
export class ValidadorPublicitario extends ValidacaoConsistenciaVisitor {
  protected override errosDoTipo(projeto: Projeto): string[] {
    if (!(projeto instanceof ProjetoPublicitario)) return [`Projeto ${projeto.id} não é uma peça publicitária`];
    const estimadaSegundos = projeto.duracaoEstimadaMin * 60;
    return estimadaSegundos > projeto.duracaoMaxSegundos
      ? [`Duração estimada (${estimadaSegundos} s) excede a duração máxima da peça (${projeto.duracaoMaxSegundos} s)`]
      : [];
  }
}
