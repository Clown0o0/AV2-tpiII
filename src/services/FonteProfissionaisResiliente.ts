import type { Profissional } from '../domain/entities/Profissional';
import type { FiltroCandidatos, ProfissionalRepository } from '../domain/ports/ProfissionalRepository';
import type { FonteProfissionais } from '../events/EventTypes';

// Valores padrão. O timeout fica abaixo dos 2 s exigidos para a recomendação.
export const TIMEOUT_PADRAO_MS = 1500;
// Por quanto tempo o cadastro carregado em memória é considerado atual.
export const TTL_CATALOGO_PADRAO_MS = 60000;

export interface ResultadoBusca {
  profissionais: Profissional[];
  fonte: FonteProfissionais;
  erro?: string;
}

export interface OpcoesFonteResiliente {
  // Tempo máximo de espera pelo repositório antes do fallback.
  timeoutMs: number;
  // Validade do catálogo em memória; vencido, a próxima busca recarrega do repositório.
  ttlMs: number;
  aoFalhar?: (erro: unknown, operacao: string) => void;
}

interface Catalogo {
  profissionais: readonly Profissional[];
  porId: ReadonlyMap<string, Profissional>;
  carregadoEm: number;
}

// Mantém o cadastro de profissionais em memória e filtra os candidatos lá, em vez de consultar
// o banco a cada requisição. Só uma carga roda por vez (as demais esperam a mesma), e uma carga
// lenta não é cancelada pelo timeout: ela termina e atualiza o catálogo. Se o repositório falhar,
// usa o último catálogo carregado (resultado parcial) ou devolve vazio. Nunca lança erro.
export class FonteProfissionaisResiliente {
  private catalogo: Catalogo | undefined;
  private carga: Promise<Catalogo> | undefined;
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

  // Recarrega o cadastro. Chamadas simultâneas compartilham a mesma consulta.
  atualizar(): Promise<void> {
    return this.carregar().then(() => undefined);
  }

  // Marca o catálogo como vencido (ex.: foi encontrado um profissional que não existe mais).
  invalidar(): void {
    if (this.catalogo) this.catalogo = { ...this.catalogo, carregadoEm: Number.NEGATIVE_INFINITY };
  }

  // Carrega o catálogo agora e o recarrega em segundo plano antes de vencer, para que as
  // requisições não esperem pelo banco.
  async iniciar(): Promise<void> {
    this.parar();
    if (this.opcoes.ttlMs > 0) {
      this.temporizador = setInterval(() => void this.aquecer(), Math.max(1000, this.opcoes.ttlMs / 2));
      this.temporizador.unref();
    }
    await this.aquecer();
  }

  parar(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = undefined;
  }

  private async aquecer(): Promise<void> {
    try {
      await this.carregar();
    } catch (erro) {
      this.opcoes.aoFalhar?.(erro, 'atualizarCatalogo');
    }
  }

  private async obterCatalogo(operacao: string): Promise<{ catalogo?: Catalogo; fonte: FonteProfissionais; erro?: string }> {
    if (this.catalogo && Date.now() - this.catalogo.carregadoEm < this.opcoes.ttlMs) {
      return { catalogo: this.catalogo, fonte: 'REPOSITORIO' };
    }
    try {
      return { catalogo: await this.comTimeout(this.carregar()), fonte: 'REPOSITORIO' };
    } catch (erro) {
      this.opcoes.aoFalhar?.(erro, operacao);
      return {
        ...(this.catalogo ? { catalogo: this.catalogo } : {}),
        fonte: this.catalogo ? 'CACHE' : 'INDISPONIVEL',
        erro: mensagem(erro),
      };
    }
  }

  private carregar(): Promise<Catalogo> {
    this.carga ??= this.repositorio
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
        this.carga = undefined;
      });
    return this.carga;
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
