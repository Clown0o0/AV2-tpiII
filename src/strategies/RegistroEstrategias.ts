import { ErroValidacao } from '../domain/errors';
import type { TipoEstrategia } from '../domain/entities/Projeto';
import { CossenoStrategy } from './CossenoStrategy';
import { FiltragemColaborativaStrategy } from './FiltragemColaborativaStrategy';
import { OrcamentoReduzidoStrategy } from './OrcamentoReduzidoStrategy';
import type { CatalogoEstrategias, RecomendacaoStrategy } from './RecomendacaoStrategy';

export class RegistroEstrategias implements CatalogoEstrategias {
  private readonly estrategias = new Map<TipoEstrategia, RecomendacaoStrategy>();

  constructor(estrategias: readonly RecomendacaoStrategy[] = []) {
    for (const estrategia of estrategias) this.registrar(estrategia);
  }

  static padrao(): RegistroEstrategias {
    return new RegistroEstrategias([
      new CossenoStrategy(),
      new FiltragemColaborativaStrategy(),
      new OrcamentoReduzidoStrategy(),
    ]);
  }

  registrar(estrategia: RecomendacaoStrategy): void {
    this.estrategias.set(estrategia.tipo, estrategia);
  }

  obter(tipo: TipoEstrategia): RecomendacaoStrategy {
    const estrategia = this.estrategias.get(tipo);
    if (!estrategia) throw new ErroValidacao(`Estratégia de recomendação não suportada: ${tipo}`);
    return estrategia;
  }

  tipos(): TipoEstrategia[] {
    return [...this.estrategias.keys()];
  }
}
