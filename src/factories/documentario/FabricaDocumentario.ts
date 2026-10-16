import type { DadosProjeto } from '../../domain/entities/Projeto';
import { ProjetoDocumentario } from '../../domain/entities/ProjetoDocumentario';
import type { RecomendacaoStrategy } from '../../strategies/RecomendacaoStrategy';
import { FabricaProjetoBase } from '../FabricaProjeto';
import { RelatorioVisitor } from '../../visitors/RelatorioVisitor';
import { NotificadorDocumentario } from './NotificadorDocumentario';
import { RecomendadorDocumentario } from './RecomendadorDocumentario';
import { ValidadorDocumentario } from './ValidadorDocumentario';

export class FabricaDocumentario extends FabricaProjetoBase {
  readonly tipo = 'DOCUMENTARIO' as const;

  comEstrategia(base: RecomendacaoStrategy): FabricaDocumentario {
    return new FabricaDocumentario(this.opcoesComEstrategia(base));
  }

  criarProjeto(dados: DadosProjeto): ProjetoDocumentario {
    return new ProjetoDocumentario(dados);
  }

  criarValidador(dataReferencia = new Date()): ValidadorDocumentario {
    return new ValidadorDocumentario(dataReferencia);
  }

  criarRecomendador(): RecomendadorDocumentario {
    return new RecomendadorDocumentario(this.opcoes.estrategiaBase);
  }

  criarNotificador(): NotificadorDocumentario {
    return new NotificadorDocumentario(this.tipo, this.opcoes.logger);
  }

  criarRelatorio(): RelatorioVisitor {
    return new RelatorioVisitor();
  }
}
