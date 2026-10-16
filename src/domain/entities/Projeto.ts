import { randomUUID } from 'node:crypto';
import { ErroValidacao } from '../errors';
import { Competencia, type VetorCompetencias } from './Competencia';
import type { Elemento, Visitante } from './Visitante';

export const PAPEIS_TECNICOS = [
  'DIRETOR',
  'DIRETOR_FOTOGRAFIA',
  'SONOPLASTA',
  'EDITOR',
  'ROTEIRISTA',
  'EFEITOS_VISUAIS',
] as const;
export type PapelTecnico = (typeof PAPEIS_TECNICOS)[number];

export const TIPOS_CAPTACAO = ['DOCUMENTARIO', 'FICCAO', 'ANIMACAO', 'PUBLICITARIO'] as const;
export type TipoCaptacao = (typeof TIPOS_CAPTACAO)[number];

export const TIPOS_ESTRATEGIA = ['COSSENO', 'FILTRAGEM_COLABORATIVA', 'ORCAMENTO_REDUZIDO'] as const;
export type TipoEstrategia = (typeof TIPOS_ESTRATEGIA)[number];

// Perfil usado quando o produtor não diz o que espera do papel; dá para sobrescrever com
// `competenciasDesejadas`.
export const PERFIL_PADRAO_POR_PAPEL: Readonly<Record<PapelTecnico, VetorCompetencias>> = {
  DIRETOR: { direcao: 1, narrativa: 0.8, lideranca: 0.9 },
  DIRETOR_FOTOGRAFIA: { fotografia: 1, iluminacao: 0.9, camera: 0.8 },
  SONOPLASTA: { captacao_som: 1, mixagem: 0.8, trilha: 0.5 },
  EDITOR: { edicao: 1, ritmo: 0.8, color_grading: 0.5 },
  ROTEIRISTA: { roteiro: 1, narrativa: 0.9, pesquisa: 0.6 },
  EFEITOS_VISUAIS: { vfx: 1, composicao: 0.9, animacao_3d: 0.7 },
};

export interface PapelRequerido {
  readonly papel: PapelTecnico;
  // Peso de importância relativa do papel (> 0).
  readonly peso: number;
  readonly competenciasDesejadas?: VetorCompetencias;
}

export interface DadosProjeto {
  id?: string;
  titulo: string;
  produtorId: string;
  produtorEmail?: string | null;
  genero: string;
  duracaoEstimadaMin: number;
  orcamentoTotal: number;
  dataEntrega: Date;
  tipoCaptacao: TipoCaptacao;
  localizacao: string;
  papeis: readonly PapelRequerido[];
  estrategia?: TipoEstrategia;
  // Atributos específicos do tipo; cada subclasse lê e valida os seus (a ficção não tem nenhum).
  detalhes?: DetalhesProjeto | null;
  criadoEm?: Date;
}

export type DetalhesProjeto = Readonly<Record<string, unknown>>;

// O que pode ser ajustado ao clonar: tudo menos identidade e tipo.
export type AjustesProjeto = Partial<Omit<DadosProjeto, 'id' | 'criadoEm' | 'tipoCaptacao'>>;

export interface AlteracoesProjeto {
  orcamentoTotal?: number;
  dataEntrega?: Date;
  estrategia?: TipoEstrategia;
}

export interface ResultadoAlteracao {
  // Variação relativa do orçamento (0.1 = 10%).
  variacaoOrcamento: number;
  // Diferença absoluta, em dias, da data de entrega.
  variacaoPrazoDias: number;
  estrategiaAlterada: boolean;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Projeto de ficção (sem atributos específicos) e base dos demais tipos. É o Prototype:
// clonar() devolve uma cópia profunda, com novo id, passando de novo pela validação.
export class Projeto implements Elemento {
  readonly id: string;
  readonly titulo: string;
  readonly produtorId: string;
  readonly produtorEmail: string | null;
  readonly genero: string;
  readonly duracaoEstimadaMin: number;
  readonly tipoCaptacao: TipoCaptacao;
  readonly localizacao: string;
  private readonly _papeis: readonly PapelRequerido[];
  private readonly _criadoEm: Date;
  private _orcamentoTotal: number;
  private _dataEntrega: Date;
  private _estrategia: TipoEstrategia;

  constructor(dados: DadosProjeto) {
    this.validarTipoCaptacao(dados.tipoCaptacao);
    Projeto.validar(dados);
    this.id = dados.id ?? randomUUID();
    this.titulo = dados.titulo.trim();
    this.produtorId = dados.produtorId;
    this.produtorEmail = dados.produtorEmail ?? null;
    this.genero = dados.genero.trim().toLowerCase();
    this.duracaoEstimadaMin = dados.duracaoEstimadaMin;
    this.tipoCaptacao = dados.tipoCaptacao;
    this.localizacao = dados.localizacao.trim();
    this._papeis = dados.papeis.map(normalizarPapelRequerido);
    this._criadoEm = new Date((dados.criadoEm ?? new Date()).getTime());
    this._orcamentoTotal = dados.orcamentoTotal;
    this._dataEntrega = new Date(dados.dataEntrega.getTime());
    this._estrategia = dados.estrategia ?? 'COSSENO';
  }

  get papeis(): readonly PapelRequerido[] {
    return this._papeis.map(copiarPapelRequerido);
  }

  get criadoEm(): Date {
    return new Date(this._criadoEm.getTime());
  }

  get orcamentoTotal(): number {
    return this._orcamentoTotal;
  }

  get dataEntrega(): Date {
    return new Date(this._dataEntrega.getTime());
  }

  get estrategia(): TipoEstrategia {
    return this._estrategia;
  }

  // Atributos específicos do tipo já resolvidos (com os valores padrão); null na ficção.
  get detalhes(): DetalhesProjeto | null {
    return null;
  }

  clonar(ajustes: AjustesProjeto = {}): Projeto {
    return new Projeto(this.dadosDoClone(ajustes));
  }

  // Valores atuais + ajustes, sem id nem criadoEm (o clone ganha os seus). O construtor copia
  // papéis e atributos específicos, então nada do clone aponta para objetos do original.
  protected dadosDoClone(ajustes: AjustesProjeto): DadosProjeto {
    const informados = Object.fromEntries(Object.entries(ajustes).filter(([, valor]) => valor !== undefined));
    return {
      titulo: this.titulo,
      produtorId: this.produtorId,
      produtorEmail: this.produtorEmail,
      genero: this.genero,
      duracaoEstimadaMin: this.duracaoEstimadaMin,
      orcamentoTotal: this._orcamentoTotal,
      dataEntrega: new Date(this._dataEntrega.getTime()),
      localizacao: this.localizacao,
      estrategia: this._estrategia,
      papeis: this.papeis,
      ...informados,
      tipoCaptacao: this.tipoCaptacao,
      detalhes: { ...this.detalhesParaClone(), ...ajustes.detalhes },
    };
  }

  // Só o que o clone deve herdar: valores derivados de outros campos (ex.: tema = gênero)
  // ficam de fora para serem recalculados se o ajuste mudar o campo de origem.
  protected detalhesParaClone(): DetalhesProjeto {
    return {};
  }

  // Tipos novos (fora de TIPOS_CAPTACAO) sobrescrevem para aceitar o próprio tipo.
  protected validarTipoCaptacao(tipo: TipoCaptacao): void {
    if (!TIPOS_CAPTACAO.includes(tipo)) throw new ErroValidacao(`Tipo de captação inválido: ${String(tipo)}`);
  }

  papelRequerido(papel: PapelTecnico): PapelRequerido {
    const encontrado = this._papeis.find((p) => p.papel === papel);
    if (!encontrado) throw new ErroValidacao(`Papel ${papel} não é requerido pelo projeto`);
    return encontrado;
  }

  // Perfil de competências esperado para o papel (definido pelo produtor ou padrão).
  perfilDesejado(papel: PapelTecnico): VetorCompetencias {
    return this.papelRequerido(papel).competenciasDesejadas ?? PERFIL_PADRAO_POR_PAPEL[papel];
  }

  alterar(alteracoes: AlteracoesProjeto): ResultadoAlteracao {
    const orcamentoAnterior = this._orcamentoTotal;
    const entregaAnterior = this._dataEntrega;
    const estrategiaAnterior = this._estrategia;
    if (alteracoes.orcamentoTotal !== undefined) {
      Projeto.validarOrcamento(alteracoes.orcamentoTotal);
      this._orcamentoTotal = alteracoes.orcamentoTotal;
    }
    if (alteracoes.dataEntrega !== undefined) {
      Projeto.validarData(alteracoes.dataEntrega);
      this._dataEntrega = new Date(alteracoes.dataEntrega.getTime());
    }
    if (alteracoes.estrategia !== undefined) this._estrategia = alteracoes.estrategia;

    return {
      variacaoOrcamento: Math.abs(this._orcamentoTotal - orcamentoAnterior) / orcamentoAnterior,
      variacaoPrazoDias: Math.abs(this._dataEntrega.getTime() - entregaAnterior.getTime()) / MS_POR_DIA,
      estrategiaAlterada: this._estrategia !== estrategiaAnterior,
    };
  }

  aceitar(visitante: Visitante): void {
    visitante.visitarProjeto(this);
  }

  private static validar(dados: DadosProjeto): void {
    Projeto.validarTextosObrigatorios(dados);
    if (!Number.isFinite(dados.duracaoEstimadaMin) || dados.duracaoEstimadaMin <= 0) {
      throw new ErroValidacao('Duração estimada deve ser positiva');
    }
    if (dados.estrategia !== undefined && !TIPOS_ESTRATEGIA.includes(dados.estrategia)) {
      throw new ErroValidacao(`Estratégia inválida: ${String(dados.estrategia)}`);
    }
    Projeto.validarOrcamento(dados.orcamentoTotal);
    Projeto.validarData(dados.dataEntrega);
    Projeto.validarPapeis(dados.papeis);
  }

  private static validarTextosObrigatorios(dados: DadosProjeto): void {
    if (!dados.titulo?.trim()) throw new ErroValidacao('Título do projeto é obrigatório');
    if (!dados.produtorId?.trim()) throw new ErroValidacao('Produtor do projeto é obrigatório');
    if (!dados.genero?.trim()) throw new ErroValidacao('Gênero da obra é obrigatório');
    if (!dados.localizacao?.trim()) throw new ErroValidacao('Localização do projeto é obrigatória');
  }

  private static validarPapeis(papeis: readonly PapelRequerido[] | undefined): void {
    if (!papeis?.length) throw new ErroValidacao('O projeto deve exigir ao menos um papel técnico');
    const vistos = new Set<PapelTecnico>();
    for (const papel of papeis) {
      if (!PAPEIS_TECNICOS.includes(papel.papel)) throw new ErroValidacao(`Papel técnico inválido: ${String(papel.papel)}`);
      if (vistos.has(papel.papel)) throw new ErroValidacao(`Papel ${papel.papel} informado mais de uma vez`);
      if (!Number.isFinite(papel.peso) || papel.peso <= 0) throw new ErroValidacao(`Peso do papel ${papel.papel} deve ser positivo`);
      vistos.add(papel.papel);
    }
  }

  private static validarOrcamento(orcamento: number): void {
    if (!Number.isFinite(orcamento) || orcamento <= 0) throw new ErroValidacao('Orçamento total deve ser positivo');
  }

  // O banco só grava anos de até 4 dígitos.
  private static validarData(data: Date): void {
    if (!(data instanceof Date) || Number.isNaN(data.getTime()) || data.getUTCFullYear() > 9999) {
      throw new ErroValidacao('Data de entrega inválida');
    }
  }
}

function normalizarPapelRequerido(papel: PapelRequerido): PapelRequerido {
  const { competenciasDesejadas } = papel;
  return {
    papel: papel.papel,
    peso: papel.peso,
    ...(competenciasDesejadas ? { competenciasDesejadas: Competencia.normalizarVetor(competenciasDesejadas) } : {}),
  };
}

function copiarPapelRequerido(papel: PapelRequerido): PapelRequerido {
  const { competenciasDesejadas } = papel;
  return { ...papel, ...(competenciasDesejadas ? { competenciasDesejadas: { ...competenciasDesejadas } } : {}) };
}
