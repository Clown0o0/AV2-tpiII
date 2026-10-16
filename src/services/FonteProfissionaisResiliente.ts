import type { Profissional } from '../domain/entities/Profissional';
import type {
  CicloDeVidaDoCatalogo,
  FiltroCandidatos,
  FonteDeProfissionais,
  OrigemDosProfissionais,
  ResultadoBusca,
} from '../domain/ports/FonteDeProfissionais';
import type { ProfissionalRepository } from '../domain/ports/ProfissionalRepository';

// Abaixo dos 2 s exigidos para a recomendação.
export const TIMEOUT_PADRAO_MS = 1500;
export const TTL_CATALOGO_PADRAO_MS = 60000;

export interface OpcoesFonteResiliente {
  timeoutMs: number;
  ttlMs: number;
  aoFalhar?: (erro: unknown, operacao: string) => void;
}

interface Catalogo {
  profissionais: readonly Profissional[];
  porId: ReadonlyMap<string, Profissional>;
  carregadoEm: number;
}

// Catálogo em memória para não consultar o banco a cada requisição; em falha do repositório,
// devolve o último catálogo (CACHE) ou vazio (INDISPONIVEL), sem lançar erro.
export class FonteProfissionaisResiliente implements FonteDeProfissionais, CicloDeVidaDoCatalogo {
  private catalogo: Catalogo | undefined;
  private cargaEmAndamento: Promise<Catalogo> | undefined;
  private temporizador: NodeJS.Timeout | undefined;
  private readonly opcoes: OpcoesFonteResiliente;

  constructor(
    private readonly repositorio: ProfissionalRepository,
    opcoes: Partial<OpcoesFonteResiliente> = {},
  ) {
    this.opcoes = { timeoutMs: TIMEOUT_PADRAO_MS, ttlMs: TTL_CATALOGO_PADRAO_MS, ...opcoes };
  }

  async buscarCandidatos(filtro: FiltroCandidatos): Promise<ResultadoBusca> {
    const { catalogo, fonte, erro } = await this.obterCatalogo('buscarCandidatos');
    const profissionais = (catalogo?.profissionais ?? []).filter(
      (p) =>
        filtro.papeis.some((papel) => p.atuaComo(papel)) &&
        p.disponivelEntre(filtro.disponivelDe, filtro.disponivelAte) &&
        (filtro.precoMinMaximo === undefined || p.precoMin <= filtro.precoMinMaximo),
    );
    return erro === undefined ? { profissionais, fonte } : { profissionais, fonte, erro };
  }

  async buscarPorIds(ids: readonly string[]): Promise<ResultadoBusca> {
    try {
      const profissionais = await this.comTimeout(this.repositorio.buscarPorIds(ids));
      return { profissionais, fonte: 'REPOSITORIO' };
    } catch (erro) {
      this.opcoes.aoFalhar?.(erro, 'buscarPorIds');
      const doCache = ids.map((id) => this.catalogo?.porId.get(id)).filter((p): p is Profissional => p !== undefined);
      return { profissionais: doCache, fonte: doCache.length > 0 ? 'CACHE' : 'INDISPONIVEL', erro: mensagem(erro) };
    }
  }

  atualizar(): Promise<void> {
    return this.carregarUmaVezPorVez().then(() => undefined);
  }

  invalidar(): void {
    if (this.catalogo) this.catalogo = { ...this.catalogo, carregadoEm: Number.NEGATIVE_INFINITY };
  }

  async iniciar(): Promise<void> {
    this.parar();
    this.agendarRecargaAntesDeVencer();
    await this.recarregarRegistrandoFalha();
  }

  parar(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = undefined;
  }

  private agendarRecargaAntesDeVencer(): void {
    if (this.opcoes.ttlMs <= 0) return;
    this.temporizador = setInterval(() => void this.recarregarRegistrandoFalha(), Math.max(1000, this.opcoes.ttlMs / 2));
    this.temporizador.unref();
  }

  private async recarregarRegistrandoFalha(): Promise<void> {
    try {
      await this.carregarUmaVezPorVez();
    } catch (erro) {
      this.opcoes.aoFalhar?.(erro, 'atualizarCatalogo');
    }
  }

  private async obterCatalogo(operacao: string): Promise<{ catalogo?: Catalogo; fonte: OrigemDosProfissionais; erro?: string }> {
    if (this.catalogo && Date.now() - this.catalogo.carregadoEm < this.opcoes.ttlMs) {
      return { catalogo: this.catalogo, fonte: 'REPOSITORIO' };
    }
    try {
      return { catalogo: await this.comTimeout(this.carregarUmaVezPorVez()), fonte: 'REPOSITORIO' };
    } catch (erro) {
      this.opcoes.aoFalhar?.(erro, operacao);
      return {
        ...(this.catalogo ? { catalogo: this.catalogo } : {}),
        fonte: this.catalogo ? 'CACHE' : 'INDISPONIVEL',
        erro: mensagem(erro),
      };
    }
  }

  // Chamadas simultâneas reaproveitam a mesma consulta; uma carga lenta não é cancelada pelo
  // timeout: ela termina e atualiza o catálogo para as próximas buscas.
  private carregarUmaVezPorVez(): Promise<Catalogo> {
    this.cargaEmAndamento ??= this.repositorio
      .listarTodos()
      .then((lista) => {
        const catalogo: Catalogo = {
          profissionais: lista,
          porId: new Map(lista.map((p) => [p.id, p])),
          carregadoEm: Date.now(),
        };
        this.catalogo = catalogo;
        return catalogo;
      })
      .finally(() => {
        this.cargaEmAndamento = undefined;
      });
    return this.cargaEmAndamento;
  }

  private comTimeout<T>(promessa: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(
        () => rejeitar(new Error(`Repositório de profissionais excedeu ${this.opcoes.timeoutMs}ms`)),
        this.opcoes.timeoutMs,
      );
    });
    return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
  }
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
