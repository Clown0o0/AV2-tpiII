// submarino
import type { Profissional } from '../domain/entities/Profissional';
import type { Projeto } from '../domain/entities/Projeto';
import type { ProjetoAnimacao } from '../domain/entities/ProjetoAnimacao';
import type { ProjetoDocumentario } from '../domain/entities/ProjetoDocumentario';
import type { ProjetoPublicitario } from '../domain/entities/ProjetoPublicitario';
import type { MembroRecomendadoLeitura, Recomendacao } from '../domain/entities/Recomendacao';
import type { ProjetoVisitor } from './ProjetoVisitor';

// Visita padrão: guarda o projeto e ignora o resto; cada visitor sobrescreve só o que usa.
// Os subtipos de projeto caem em visitarProjeto, a não ser que o visitor queira tratá-los.
export abstract class VisitanteBase<R> implements ProjetoVisitor<R> {
  private projeto: Projeto | undefined;

  visitarProjeto(projeto: Projeto): void {
    this.projeto = projeto;
  }

  visitarProjetoDocumentario(projeto: ProjetoDocumentario): void {
    this.visitarProjeto(projeto);
  }

  visitarProjetoAnimacao(projeto: ProjetoAnimacao): void {
    this.visitarProjeto(projeto);
  }

  visitarProjetoPublicitario(projeto: ProjetoPublicitario): void {
    this.visitarProjeto(projeto);
  }

  visitarRecomendacao(_recomendacao: Recomendacao): void {}

  visitarMembro(_membro: MembroRecomendadoLeitura): void {}

  visitarProfissional(_profissional: Profissional): void {}

  abstract resultado(): R;

  protected get projetoVisitado(): Projeto | undefined {
    return this.projeto;
  }

  protected obterProjetoVisitado(): Projeto {
    if (!this.projeto) throw new Error('Visitor não percorreu nenhum projeto');
    return this.projeto;
  }
}
