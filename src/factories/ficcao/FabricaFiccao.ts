import { Projeto, type DadosProjeto } from '../../domain/entities/Projeto';
import type { RecomendacaoStrategy } from '../../strategies/RecomendacaoStrategy';
import { ValidacaoConsistenciaVisitor } from '../../visitors/ValidacaoConsistenciaVisitor';
import { FabricaProjetoBase } from '../FabricaProjeto';
import { NotificadorFiccao } from './NotificadorFiccao';

// Ficção é o comportamento da ATVI: Projeto base, validação padrão e a estratégia escolhida sem ajuste.
export class FabricaFiccao extends FabricaProjetoBase {
  readonly tipo = 'FICCAO' as const;

  criarProjeto(dados: DadosProjeto): Projeto {
    return new Projeto({ ...dados, tipoCaptacao: this.tipo });
  }

  criarValidador(dataReferencia = new Date()): ValidacaoConsistenciaVisitor {
    return new ValidacaoConsistenciaVisitor(dataReferencia);
  }

  criarRecomendador(): RecomendacaoStrategy {
    return this.opcoes.estrategiaBase;
  }

  criarNotificador(): NotificadorFiccao {
    return new NotificadorFiccao();
  }
}
