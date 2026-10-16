import type { ProjetoAnimacao, TecnicaAnimacao } from '../../domain/entities/ProjetoAnimacao';
import { RelatorioVisitor, type Relatorio } from '../../visitors/RelatorioVisitor';

export const DESCRICAO_METRICAS_RENDERIZACAO =
  'Estimativas derivadas da duração estimada, dos quadros por segundo e do custo da equipe recomendada.';

export interface MetricasRenderizacao {
  descricao: string;
  tecnica: TecnicaAnimacao;
  quadrosPorSegundo: number;
  duracaoEstimadaMin: number;
  totalQuadrosEstimado: number;
  custoEstimadoPorQuadro: number;
  papeisEfeitosVisuaisPreenchidos: number;
}

export interface RelatorioAnimacao extends Relatorio {
  metricasRenderizacao: MetricasRenderizacao;
}

interface DadosDeRenderizacao {
  tecnica: TecnicaAnimacao;
  quadrosPorSegundo: number;
  duracaoEstimadaMin: number;
}

// Relatório base + métricas de eficiência de renderização, calculadas só com dados do projeto e
// da equipe. Com um projeto que não é animação, devolve o relatório base sem as métricas.
export class RelatorioAnimacaoVisitor extends RelatorioVisitor {
  private animacao: DadosDeRenderizacao | undefined;

  override visitarProjetoAnimacao(projeto: ProjetoAnimacao): void {
    super.visitarProjetoAnimacao(projeto);
    const { tecnica, quadrosPorSegundo, duracaoEstimadaMin } = projeto;
    this.animacao = { tecnica, quadrosPorSegundo, duracaoEstimadaMin };
  }

  override resultado(): Relatorio | RelatorioAnimacao {
    const relatorio = super.resultado();
    if (!this.animacao) return relatorio;
    const metricasRenderizacao = calcularMetricas(this.animacao, relatorio);
    return { ...relatorio, metricasRenderizacao, texto: `${relatorio.texto}\n${formatarMetricas(metricasRenderizacao)}` };
  }
}

function calcularMetricas(animacao: DadosDeRenderizacao, relatorio: Relatorio): MetricasRenderizacao {
  const totalQuadrosEstimado = animacao.duracaoEstimadaMin * 60 * animacao.quadrosPorSegundo;
  return {
    descricao: DESCRICAO_METRICAS_RENDERIZACAO,
    ...animacao,
    totalQuadrosEstimado,
    custoEstimadoPorQuadro: Math.round((relatorio.financeiro.custoEquipe / totalQuadrosEstimado) * 100) / 100,
    papeisEfeitosVisuaisPreenchidos: relatorio.equipe.filter((linha) => linha.papel === 'EFEITOS_VISUAIS').length,
  };
}

function formatarMetricas(metricas: MetricasRenderizacao): string {
  return (
    `Renderização (estimativa): ${metricas.tecnica}, ${metricas.quadrosPorSegundo} qps, ` +
    `${metricas.totalQuadrosEstimado} quadros, custo por quadro ${metricas.custoEstimadoPorQuadro.toFixed(2)}, ` +
    `${metricas.papeisEfeitosVisuaisPreenchidos} papel(is) de efeitos visuais preenchido(s)`
  );
}
