import type { Projeto } from '../../domain/entities/Projeto';
import { ProjetoAnimacao } from '../../domain/entities/ProjetoAnimacao';
import { ValidacaoConsistenciaVisitor } from '../../visitors/ValidacaoConsistenciaVisitor';

// Regra escolhida por nós: animação precisa de alguém de efeitos visuais.
export class ValidadorAnimacao extends ValidacaoConsistenciaVisitor {
  protected override errosDoTipo(projeto: Projeto): string[] {
    if (!(projeto instanceof ProjetoAnimacao)) return [`Projeto ${projeto.id} não é uma animação`];
    return projeto.papeis.some((p) => p.papel === 'EFEITOS_VISUAIS') ? [] : ['Animação exige o papel EFEITOS_VISUAIS'];
  }
}
