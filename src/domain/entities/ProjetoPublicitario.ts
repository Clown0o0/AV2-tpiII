import { lerListaTextos, lerNumeroPositivo, lerTexto } from './detalhesProjeto';
import { Projeto, type AjustesProjeto, type DadosProjeto, type DetalhesProjeto } from './Projeto';

export type DetalhesPublicitario = {
  marca: string;
  canais: readonly string[];
  duracaoMaxSegundos: number;
};

export class ProjetoPublicitario extends Projeto {
  readonly canais: readonly string[];
  // Sem valor informado, a marca é o título e a duração máxima é a duração estimada.
  private readonly marcaInformada: string | undefined;
  private readonly duracaoMaxInformada: number | undefined;

  constructor(dados: DadosProjeto) {
    super({ ...dados, tipoCaptacao: 'PUBLICITARIO' });
    const detalhes = dados.detalhes ?? {};
    this.marcaInformada = detalhes.marca === undefined ? undefined : lerTexto(detalhes.marca, 'marca');
    this.canais = detalhes.canais === undefined ? [] : lerListaTextos(detalhes.canais, 'canais');
    this.duracaoMaxInformada =
      detalhes.duracaoMaxSegundos === undefined ? undefined : lerNumeroPositivo(detalhes.duracaoMaxSegundos, 'duracaoMaxSegundos');
  }

  get marca(): string {
    return this.marcaInformada ?? this.titulo;
  }

  get duracaoMaxSegundos(): number {
    return this.duracaoMaxInformada ?? this.duracaoEstimadaMin * 60;
  }

  override get detalhes(): DetalhesPublicitario {
    return { marca: this.marca, canais: [...this.canais], duracaoMaxSegundos: this.duracaoMaxSegundos };
  }

  override clonar(ajustes: AjustesProjeto = {}): ProjetoPublicitario {
    return new ProjetoPublicitario(this.dadosDoClone(ajustes));
  }

  protected override detalhesParaClone(): DetalhesProjeto {
    return {
      ...(this.marcaInformada !== undefined ? { marca: this.marcaInformada } : {}),
      canais: [...this.canais],
      ...(this.duracaoMaxInformada !== undefined ? { duracaoMaxSegundos: this.duracaoMaxInformada } : {}),
    };
  }
}
