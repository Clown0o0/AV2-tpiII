import { lerListaTextos, lerTexto } from './detalhesProjeto';
import { Projeto, type AjustesProjeto, type DadosProjeto, type DetalhesProjeto } from './Projeto';
import type { Visitante } from './Visitante';

export type DetalhesDocumentario = {
  tema: string;
  entrevistados: readonly string[];
};

export class ProjetoDocumentario extends Projeto {
  readonly entrevistados: readonly string[];
  // Sem tema informado, o tema é o gênero.
  private readonly temaInformado: string | undefined;

  constructor(dados: DadosProjeto) {
    super({ ...dados, tipoCaptacao: 'DOCUMENTARIO' });
    const detalhes = dados.detalhes ?? {};
    this.temaInformado = detalhes.tema === undefined ? undefined : lerTexto(detalhes.tema, 'tema');
    this.entrevistados = detalhes.entrevistados === undefined ? [] : lerListaTextos(detalhes.entrevistados, 'entrevistados');
  }

  get tema(): string {
    return this.temaInformado ?? this.genero;
  }

  override get detalhes(): DetalhesDocumentario {
    return { tema: this.tema, entrevistados: [...this.entrevistados] };
  }

  override clonar(ajustes: AjustesProjeto = {}): ProjetoDocumentario {
    return new ProjetoDocumentario(this.dadosDoClone(ajustes));
  }

  protected override detalhesParaClone(): DetalhesProjeto {
    return {
      ...(this.temaInformado !== undefined ? { tema: this.temaInformado } : {}),
      entrevistados: [...this.entrevistados],
    };
  }

  override aceitar(visitante: Visitante): void {
    visitante.visitarProjetoDocumentario(this);
  }
}
