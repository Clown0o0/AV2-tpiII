import { lerListaTextos, lerNumeroPositivo, lerOpcao } from './detalhesProjeto';
import { Projeto, type AjustesProjeto, type DadosProjeto, type DetalhesProjeto } from './Projeto';

export const TECNICAS_ANIMACAO = ['2D', '3D', 'STOP_MOTION'] as const;
export type TecnicaAnimacao = (typeof TECNICAS_ANIMACAO)[number];

// Valores padrão escolhidos por nós (o enunciado não define atributos da animação).
export const TECNICA_PADRAO: TecnicaAnimacao = '2D';
export const QUADROS_POR_SEGUNDO_PADRAO = 24;

export type DetalhesAnimacao = {
  tecnica: TecnicaAnimacao;
  softwares: readonly string[];
  quadrosPorSegundo: number;
};

export class ProjetoAnimacao extends Projeto {
  readonly tecnica: TecnicaAnimacao;
  readonly softwares: readonly string[];
  readonly quadrosPorSegundo: number;

  constructor(dados: DadosProjeto) {
    super({ ...dados, tipoCaptacao: 'ANIMACAO' });
    const detalhes = dados.detalhes ?? {};
    this.tecnica = detalhes.tecnica === undefined ? TECNICA_PADRAO : lerOpcao(detalhes.tecnica, TECNICAS_ANIMACAO, 'tecnica');
    this.softwares = detalhes.softwares === undefined ? [] : lerListaTextos(detalhes.softwares, 'softwares');
    this.quadrosPorSegundo =
      detalhes.quadrosPorSegundo === undefined
        ? QUADROS_POR_SEGUNDO_PADRAO
        : lerNumeroPositivo(detalhes.quadrosPorSegundo, 'quadrosPorSegundo');
  }

  override get detalhes(): DetalhesAnimacao {
    return { tecnica: this.tecnica, softwares: [...this.softwares], quadrosPorSegundo: this.quadrosPorSegundo };
  }

  override clonar(ajustes: AjustesProjeto = {}): ProjetoAnimacao {
    return new ProjetoAnimacao(this.dadosDoClone(ajustes));
  }

  protected override detalhesParaClone(): DetalhesProjeto {
    return this.detalhes;
  }
}
