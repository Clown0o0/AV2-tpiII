import type { Projeto } from '../domain/entities/Projeto';
import type { Recomendacao } from '../domain/entities/Recomendacao';
import type { FonteDeProfissionais } from '../domain/ports/FonteDeProfissionais';
import type { FabricaProjeto } from '../factories/FabricaProjeto';
import type { ResultadoCompatibilidade } from '../visitors/CompatibilidadeEquipeVisitor';
import { EstruturaEquipe, type ProjetoVisitor } from '../visitors/ProjetoVisitor';
import type { Relatorio } from '../visitors/RelatorioVisitor';
import type { ResultadoValidacao } from '../visitors/ValidacaoConsistenciaVisitor';
import type { Relogio } from './contratos';

export interface RelatorioCompleto {
  relatorio: Relatorio;
  validacao: ResultadoValidacao;
  compatibilidade: ResultadoCompatibilidade;
}

export interface GeracaoDeRelatorio {
  gerar(projeto: Projeto, recomendacao: Recomendacao, fabrica: FabricaProjeto): Promise<RelatorioCompleto>;
}

export type CriadorDeVisitorDeCompatibilidade = () => ProjetoVisitor<ResultadoCompatibilidade>;

// Roda sobre a equipe atual o relatório e o validador da fábrica do tipo e a compatibilidade.
export class GeradorDeRelatorio implements GeracaoDeRelatorio {
  constructor(
    private readonly profissionais: FonteDeProfissionais,
    private readonly criarCompatibilidade: CriadorDeVisitorDeCompatibilidade,
    private readonly relogio: Relogio,
  ) {}

  async gerar(projeto: Projeto, recomendacao: Recomendacao, fabrica: FabricaProjeto): Promise<RelatorioCompleto> {
    const estrutura = await this.estruturaDaEquipe(projeto, recomendacao);
    return {
      relatorio: estrutura.aceitar(fabrica.criarRelatorio()),
      validacao: estrutura.aceitar(fabrica.criarValidador(this.relogio())),
      compatibilidade: estrutura.aceitar(this.criarCompatibilidade()),
    };
  }

  private async estruturaDaEquipe(projeto: Projeto, recomendacao: Recomendacao): Promise<EstruturaEquipe> {
    const ids = recomendacao.membrosAtivos().map((m) => m.profissionalId);
    const { profissionais } = await this.profissionais.buscarPorIds(ids);
    return new EstruturaEquipe(projeto, recomendacao, profissionais);
  }
}
