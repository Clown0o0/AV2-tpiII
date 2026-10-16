import type { ProjetoDocumentario } from '../../domain/entities/ProjetoDocumentario';
import { ValidadorPapelObrigatorio } from '../../visitors/ValidadorPapelObrigatorio';

export class ValidadorDocumentario extends ValidadorPapelObrigatorio {
  constructor(inicioDaJanelaDeDisponibilidade?: Date) {
    super('ROTEIRISTA', 'Documentário exige o papel ROTEIRISTA', inicioDaJanelaDeDisponibilidade);
  }

  override visitarProjetoDocumentario(projeto: ProjetoDocumentario): void {
    super.visitarProjetoDocumentario(projeto);
    this.aplicarRegraAo(projeto);
  }
}
