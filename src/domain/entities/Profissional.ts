import { randomUUID } from 'node:crypto';
import { obterOuCalcular } from '../../compartilhado/memoizacao';
import { ErroValidacao } from '../errors';
import { Avaliacao } from './Avaliacao';
import { Competencia, type VetorCompetencias } from './Competencia';
import type { PapelTecnico } from './Projeto';
import type { Elemento, Visitante } from './Visitante';

export interface Disponibilidade {
  inicio: Date;
  fim: Date;
}

export interface DadosProfissional {
  id?: string;
  nome: string;
  email: string;
  especialidades: PapelTecnico[];
  precoMin: number;
  precoMax: number;
  localizacao: string;
  disponibilidade: Disponibilidade[];
  competencias: Competencia[];
  historicoProjetos?: string[];
  avaliacoes?: Avaliacao[];
}

export class Profissional implements Elemento {
  readonly id: string;
  readonly nome: string;
  readonly email: string;
  readonly especialidades: readonly PapelTecnico[];
  readonly precoMin: number;
  readonly precoMax: number;
  readonly localizacao: string;
  readonly historicoProjetos: readonly string[];
  private readonly _disponibilidade: readonly Disponibilidade[];
  private readonly _competencias: readonly Competencia[];
  private readonly _avaliacoes: readonly Avaliacao[];
  private readonly vetor: VetorCompetencias;
  private readonly chaveLocalizacao: string;

  constructor(dados: DadosProfissional) {
    if (!dados.nome?.trim()) throw new ErroValidacao('Nome do profissional é obrigatório');
    if (!dados.especialidades?.length) throw new ErroValidacao(`Profissional ${dados.nome} sem especialidades`);
    if (!(dados.precoMin >= 0) || !(dados.precoMax >= dados.precoMin)) {
      throw new ErroValidacao(`Faixa de preço inválida para ${dados.nome}`);
    }
    this.id = dados.id ?? randomUUID();
    this.nome = dados.nome.trim();
    this.email = dados.email;
    this.especialidades = [...dados.especialidades];
    this.precoMin = dados.precoMin;
    this.precoMax = dados.precoMax;
    this.localizacao = dados.localizacao.trim();
    this.chaveLocalizacao = chaveDeComparacaoDaLocalizacao(this.localizacao);
    this._disponibilidade = dados.disponibilidade.map(copiarJanela);
    this._competencias = [...dados.competencias];
    this.historicoProjetos = [...(dados.historicoProjetos ?? [])];
    this._avaliacoes = [...(dados.avaliacoes ?? [])];
    this.vetor = Object.freeze(Object.fromEntries(this._competencias.map((c) => [c.nome, c.nivel])));
  }

  get disponibilidade(): readonly Disponibilidade[] {
    return this._disponibilidade.map(copiarJanela);
  }

  get competencias(): readonly Competencia[] {
    return [...this._competencias];
  }

  get avaliacoes(): readonly Avaliacao[] {
    return [...this._avaliacoes];
  }

  atuaComo(papel: PapelTecnico): boolean {
    return this.especialidades.includes(papel);
  }

  disponivelEntre(inicio: Date, fim: Date): boolean {
    return this._disponibilidade.some((janela) => janelaCobre(janela, inicio, fim));
  }

  vetorCompetencias(): VetorCompetencias {
    return this.vetor;
  }

  mediaAvaliacoes(): number | null {
    if (this._avaliacoes.length === 0) return null;
    return this._avaliacoes.reduce((soma, a) => soma + a.nota, 0) / this._avaliacoes.length;
  }

  // Média normalizada em 0..1; quem não tem avaliações recebe o valor informado.
  reputacao(semAvaliacoes: number): number {
    const media = this.mediaAvaliacoes();
    return media === null ? semAvaliacoes : media / Avaliacao.NOTA_MAXIMA;
  }

  mesmaLocalizacao(localizacao: string): boolean {
    return this.chaveLocalizacao === chaveDeComparacaoDaLocalizacao(localizacao);
  }

  proximidadeDe(localizacao: string): 0 | 1 {
    return this.mesmaLocalizacao(localizacao) ? 1 : 0;
  }

  aceitar(visitante: Visitante): void {
    visitante.visitarProfissional(this);
  }
}

function copiarJanela(janela: Disponibilidade): Disponibilidade {
  return { inicio: new Date(janela.inicio.getTime()), fim: new Date(janela.fim.getTime()) };
}

function janelaCobre(janela: Disponibilidade, inicio: Date, fim: Date): boolean {
  return janela.inicio.getTime() <= inicio.getTime() && janela.fim.getTime() >= fim.getTime();
}

// Cache porque a comparação roda para cada candidato e localeCompare com acentos é lento.
const CACHE_CHAVES_LOCALIZACAO = new Map<string, string>();
const LIMITE_CACHE_CHAVES_LOCALIZACAO = 1000;

function chaveDeComparacaoDaLocalizacao(texto: string): string {
  if (CACHE_CHAVES_LOCALIZACAO.size >= LIMITE_CACHE_CHAVES_LOCALIZACAO) CACHE_CHAVES_LOCALIZACAO.clear();
  return obterOuCalcular(CACHE_CHAVES_LOCALIZACAO, texto, () => removerAcentos(texto.trim()).toLowerCase());
}

function removerAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '');
}
