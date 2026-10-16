import type { DadosProjeto } from '../../domain/entities/Projeto';
import { ProjetoPublicitario } from '../../domain/entities/ProjetoPublicitario';
import type { RecomendacaoStrategy } from '../../strategies/RecomendacaoStrategy';
import { FabricaProjetoBase } from '../FabricaProjeto';
import { RelatorioVisitor } from '../../visitors/RelatorioVisitor';
import { NotificadorPublicitario } from './NotificadorPublicitario';
import { RecomendadorPublicitario } from './RecomendadorPublicitario';
import { ValidadorPublicitario } from './ValidadorPublicitario';

export class FabricaPublicitario extends FabricaProjetoBase {
  readonly tipo = 'PUBLICITARIO' as const;

  comEstrategia(base: RecomendacaoStrategy): FabricaPublicitario {
    return new FabricaPublicitario(this.opcoesComEstrategia(base));
  }

  criarProjeto(dados: DadosProjeto): ProjetoPublicitario {
    return new ProjetoPublicitario(dados);
  }

  criarValidador(dataReferencia = new Date()): ValidadorPublicitario {
    return new ValidadorPublicitario(dataReferencia);
  }

  criarRecomendador(): RecomendadorPublicitario {
    return new RecomendadorPublicitario(this.opcoes.estrategiaBase);
  }

  criarNotificador(): NotificadorPublicitario {
    return new NotificadorPublicitario(this.tipo, this.opcoes.logger);
  }

  criarRelatorio(): RelatorioVisitor {
    return new RelatorioVisitor();
  }
}
