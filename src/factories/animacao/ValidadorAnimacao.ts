import type { ProjetoAnimacao } from '../../domain/entities/ProjetoAnimacao';
import { ValidadorPapelObrigatorio } from '../../visitors/ValidadorPapelObrigatorio';

export class ValidadorAnimacao extends ValidadorPapelObrigatorio {
  constructor(inicioDaJanelaDeDisponibilidade?: Date) {
    super('EFEITOS_VISUAIS', 'Animação exige o papel EFEITOS_VISUAIS', inicioDaJanelaDeDisponibilidade);
  }

  override visitarProjetoAnimacao(projeto: ProjetoAnimacao): void {
    super.visitarProjetoAnimacao(projeto);
    this.aplicarRegraAo(projeto);
  }
}
