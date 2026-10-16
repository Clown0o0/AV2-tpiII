import type { PapelTecnico, Projeto } from '../../domain/entities/Projeto';
import type { ProjetoAnimacao } from '../../domain/entities/ProjetoAnimacao';
import { NotificadorPorTipo } from '../../events/observadores/NotificadorPorTipo';
import { VisitanteBase } from '../../visitors/VisitanteBase';

export class NotificadorAnimacao extends NotificadorPorTipo {
  readonly nome = 'notificador-animacao';

  protected textoRecomendacao(projeto: Projeto): string {
    const { tecnica } = dadosDoAviso(projeto);
    return `Animação "${projeto.titulo}" (${tecnica}): equipe sugerida. Reserve as estações de render para os efeitos visuais.`;
  }

  protected textoPapelEmAberto(papel: PapelTecnico): string {
    return `Animação: o papel ${papel} ficou em aberto; o pipeline de produção está pausado para esse papel.`;
  }

  protected textoEquipeFinalizada(projeto: Projeto): string {
    const { softwares } = dadosDoAviso(projeto);
    return `Equipe da animação "${projeto.titulo}" completa: acesso ao pipeline liberado (softwares: ${softwares.length > 0 ? softwares.join(', ') : 'a definir'}).`;
  }
}

interface DadosAvisoAnimacao {
  tecnica: string;
  softwares: readonly string[];
}

// Lê os dados dos avisos pelo despacho duplo. Um projeto do tipo sem a subclasse (registro
// antigo) cai em visitarProjeto e recebe os valores neutros.
class LeitorAnimacao extends VisitanteBase<DadosAvisoAnimacao> {
  private dados: DadosAvisoAnimacao = { tecnica: '', softwares: [] };

  override visitarProjeto(projeto: Projeto): void {
    super.visitarProjeto(projeto);
    this.dados = { tecnica: 'técnica a definir', softwares: [] };
  }

  override visitarProjetoAnimacao(projeto: ProjetoAnimacao): void {
    super.visitarProjeto(projeto);
    this.dados = { tecnica: `${projeto.tecnica}, ${projeto.quadrosPorSegundo} qps`, softwares: projeto.softwares };
  }

  resultado(): DadosAvisoAnimacao {
    return this.dados;
  }
}

function dadosDoAviso(projeto: Projeto): DadosAvisoAnimacao {
  const leitor = new LeitorAnimacao();
  projeto.aceitar(leitor);
  return leitor.resultado();
}
