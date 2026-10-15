import type { Projeto } from '../../domain/entities/Projeto';
import { ProjetoDocumentario } from '../../domain/entities/ProjetoDocumentario';
import { ValidacaoConsistenciaVisitor } from '../../visitors/ValidacaoConsistenciaVisitor';

// Regra do tipo: documentário precisa de roteirista (pesquisa e roteiro das entrevistas).
export class ValidadorDocumentario extends ValidacaoConsistenciaVisitor {
  protected override errosDoTipo(projeto: Projeto): string[] {
    if (!(projeto instanceof ProjetoDocumentario)) return [`Projeto ${projeto.id} não é um documentário`];
    return projeto.papeis.some((p) => p.papel === 'ROTEIRISTA') ? [] : ['Documentário exige o papel ROTEIRISTA'];
  }
}
