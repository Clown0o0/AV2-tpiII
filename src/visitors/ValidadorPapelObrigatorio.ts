import type { PapelTecnico, Projeto } from '../domain/entities/Projeto';
import { ValidacaoConsistenciaVisitor } from './ValidacaoConsistenciaVisitor';

// Regra de um tipo de projeto: o papel informado é obrigatório. Projetos de outros tipos não
// são afetados; a subclasse chama aplicarRegraAo() só ao visitar um projeto do próprio tipo.
export abstract class ValidadorPapelObrigatorio extends ValidacaoConsistenciaVisitor {
  private projetoDoTipo: Projeto | undefined;

  protected constructor(
    private readonly papelObrigatorio: PapelTecnico,
    private readonly mensagem: string,
    inicioDaJanelaDeDisponibilidade?: Date,
  ) {
    super(inicioDaJanelaDeDisponibilidade);
  }

  protected aplicarRegraAo(projeto: Projeto): void {
    this.projetoDoTipo = projeto;
  }

  protected override errosDoTipo(): string[] {
    const projeto = this.projetoDoTipo;
    if (!projeto || projeto.papeis.some((p) => p.papel === this.papelObrigatorio)) return [];
    return [this.mensagem];
  }
}
