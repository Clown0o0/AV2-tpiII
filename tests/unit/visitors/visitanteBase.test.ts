import type { Projeto } from '../../../src/domain/entities/Projeto';
import { ProjetoAnimacao } from '../../../src/domain/entities/ProjetoAnimacao';
import { ProjetoDocumentario } from '../../../src/domain/entities/ProjetoDocumentario';
import { ProjetoPublicitario } from '../../../src/domain/entities/ProjetoPublicitario';
import { Recomendacao } from '../../../src/domain/entities/Recomendacao';
import { ValidadorAnimacao } from '../../../src/factories/animacao/ValidadorAnimacao';
import { ValidadorDocumentario } from '../../../src/factories/documentario/ValidadorDocumentario';
import { EstruturaEquipe } from '../../../src/visitors/ProjetoVisitor';
import { ValidadorPapelObrigatorio } from '../../../src/visitors/ValidadorPapelObrigatorio';
import { VisitanteBase } from '../../../src/visitors/VisitanteBase';
import { criarProjeto, dadosProjeto, DATA_REFERENCIA } from '../../support/fixtures';

class ProjetoVisto extends VisitanteBase<Projeto> {
  resultado(): Projeto {
    return this.obterProjetoVisitado();
  }
}

class SubtipoVisto extends VisitanteBase<string> {
  private subtipo = 'base';

  override visitarProjetoAnimacao(projeto: ProjetoAnimacao): void {
    super.visitarProjetoAnimacao(projeto);
    this.subtipo = `animação ${projeto.tecnica}`;
  }

  resultado(): string {
    return `${this.subtipo}: ${this.obterProjetoVisitado().titulo}`;
  }
}

function visitar<R>(projeto: Projeto, visitante: VisitanteBase<R>): R {
  return new EstruturaEquipe(projeto, new Recomendacao({ projetoId: projeto.id, estrategia: 'COSSENO' }), []).aceitar(visitante);
}

describe('VisitanteBase', () => {
  it('cada subtipo de projeto chama o próprio método de visita, que por padrão cai em visitarProjeto', () => {
    const projetos = [
      criarProjeto(),
      new ProjetoDocumentario(dadosProjeto({ tipoCaptacao: 'DOCUMENTARIO' })),
      new ProjetoAnimacao(dadosProjeto({ tipoCaptacao: 'ANIMACAO' })),
      new ProjetoPublicitario(dadosProjeto({ tipoCaptacao: 'PUBLICITARIO' })),
    ];
    for (const projeto of projetos) expect(visitar(projeto, new ProjetoVisto())).toBe(projeto);
  });

  it('um visitor pode tratar um subtipo sem instanceof (despacho duplo)', () => {
    const animacao = new ProjetoAnimacao(dadosProjeto({ tipoCaptacao: 'ANIMACAO', detalhes: { tecnica: '3D' } }));
    expect(visitar(animacao, new SubtipoVisto())).toBe('animação 3D: Filme Teste');
    expect(visitar(criarProjeto(), new SubtipoVisto())).toBe('base: Filme Teste');
  });

  it('exige que um projeto tenha sido visitado', () => {
    expect(() => new ProjetoVisto().resultado()).toThrow('Visitor não percorreu nenhum projeto');
  });
});

describe('ValidadorPapelObrigatorio', () => {
  it('as subclasses só configuram papel, mensagem e o subtipo em que a regra vale', () => {
    expect(new ValidadorAnimacao(DATA_REFERENCIA)).toBeInstanceOf(ValidadorPapelObrigatorio);
    expect(new ValidadorDocumentario(DATA_REFERENCIA)).toBeInstanceOf(ValidadorPapelObrigatorio);
    const documentario = new ProjetoDocumentario(dadosProjeto({ tipoCaptacao: 'DOCUMENTARIO' }));
    expect(visitar(documentario, new ValidadorDocumentario(DATA_REFERENCIA)).erros).toContain('Documentário exige o papel ROTEIRISTA');
    expect(visitar(documentario, new ValidadorAnimacao(DATA_REFERENCIA)).erros).not.toContain('Animação exige o papel EFEITOS_VISUAIS');
  });
});
