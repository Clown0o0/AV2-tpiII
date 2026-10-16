import type { DadosProjeto } from '../../domain/entities/Projeto';
import { ProjetoAnimacao } from '../../domain/entities/ProjetoAnimacao';
import type { RecomendacaoStrategy } from '../../strategies/RecomendacaoStrategy';
import { FabricaProjetoBase } from '../FabricaProjeto';
import { RelatorioAnimacaoVisitor } from './RelatorioAnimacaoVisitor';
import { NotificadorAnimacao } from './NotificadorAnimacao';
import { RecomendadorAnimacao } from './RecomendadorAnimacao';
import { ValidadorAnimacao } from './ValidadorAnimacao';

export class FabricaAnimacao extends FabricaProjetoBase {
  readonly tipo = 'ANIMACAO' as const;

  comEstrategia(base: RecomendacaoStrategy): FabricaAnimacao {
    return new FabricaAnimacao(this.opcoesComEstrategia(base));
  }

  criarProjeto(dados: DadosProjeto): ProjetoAnimacao {
    return new ProjetoAnimacao(dados);
  }

  criarValidador(dataReferencia = new Date()): ValidadorAnimacao {
    return new ValidadorAnimacao(dataReferencia);
  }

  criarRecomendador(): RecomendadorAnimacao {
    return new RecomendadorAnimacao(this.opcoes.estrategiaBase);
  }

  criarNotificador(): NotificadorAnimacao {
    return new NotificadorAnimacao(this.tipo, this.opcoes.logger);
  }

  criarRelatorio(): RelatorioAnimacaoVisitor {
    return new RelatorioAnimacaoVisitor();
  }
}
