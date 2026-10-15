import { ErroValidacao } from '../domain/errors';
import type { TipoCaptacao } from '../domain/entities/Projeto';
import { FabricaAnimacao } from './animacao/FabricaAnimacao';
import { FabricaDocumentario } from './documentario/FabricaDocumentario';
import type { FabricaProjeto, OpcoesFabrica } from './FabricaProjeto';
import { FabricaFiccao } from './ficcao/FabricaFiccao';
import { FabricaPublicitario } from './publicitario/FabricaPublicitario';

// Único lugar que liga tipo de projeto -> fábrica. Um tipo novo só precisa ser registrado aqui.
export class FabricaProjetoRegistry {
  private readonly fabricas = new Map<TipoCaptacao, FabricaProjeto>();

  constructor(fabricas: readonly FabricaProjeto[] = []) {
    for (const fabrica of fabricas) this.registrar(fabrica);
  }

  static padrao(opcoes: Partial<OpcoesFabrica> = {}): FabricaProjetoRegistry {
    return new FabricaProjetoRegistry([
      new FabricaDocumentario(opcoes),
      new FabricaFiccao(opcoes),
      new FabricaAnimacao(opcoes),
      new FabricaPublicitario(opcoes),
    ]);
  }

  registrar(fabrica: FabricaProjeto): void {
    this.fabricas.set(fabrica.tipo, fabrica);
  }

  obter(tipo: TipoCaptacao): FabricaProjeto {
    const fabrica = this.fabricas.get(tipo);
    if (!fabrica) throw new ErroValidacao(`Tipo de projeto sem fábrica registrada: ${tipo}`);
    return fabrica;
  }

  tipos(): TipoCaptacao[] {
    return [...this.fabricas.keys()];
  }

  todas(): FabricaProjeto[] {
    return [...this.fabricas.values()];
  }
}
