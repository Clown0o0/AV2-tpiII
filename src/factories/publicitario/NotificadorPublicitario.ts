import type { PapelTecnico, Projeto } from '../../domain/entities/Projeto';
import type { ProjetoPublicitario } from '../../domain/entities/ProjetoPublicitario';
import { NotificadorPorTipo } from '../../events/observadores/NotificadorPorTipo';
import { VisitanteBase } from '../../visitors/VisitanteBase';

export class NotificadorPublicitario extends NotificadorPorTipo {
  readonly nome = 'notificador-publicitario';

  protected textoRecomendacao(projeto: Projeto): string {
    const { marca } = dadosDoAviso(projeto);
    return `Peça publicitária de ${marca}: equipe sugerida. Envie a proposta para aprovação da agência.`;
  }

  protected textoPapelEmAberto(papel: PapelTecnico): string {
    return `Publicidade: o papel ${papel} ficou em aberto; avise a agência sobre possível impacto no prazo de veiculação.`;
  }

  protected textoEquipeFinalizada(projeto: Projeto): string {
    const { canais } = dadosDoAviso(projeto);
    return `Equipe da campanha "${projeto.titulo}" confirmada (canais: ${canais.length > 0 ? canais.join(', ') : 'a definir'}).`;
  }
}

interface DadosAvisoPublicitario {
  marca: string;
  canais: readonly string[];
}

// Lê os dados dos avisos pelo despacho duplo. Um projeto do tipo sem a subclasse (registro
// antigo) cai em visitarProjeto e recebe os valores neutros.
class LeitorPublicitario extends VisitanteBase<DadosAvisoPublicitario> {
  private dados: DadosAvisoPublicitario = { marca: '', canais: [] };

  override visitarProjeto(projeto: Projeto): void {
    super.visitarProjeto(projeto);
    this.dados = { marca: projeto.titulo, canais: [] };
  }

  override visitarProjetoPublicitario(projeto: ProjetoPublicitario): void {
    super.visitarProjeto(projeto);
    this.dados = { marca: projeto.marca, canais: projeto.canais };
  }

  resultado(): DadosAvisoPublicitario {
    return this.dados;
  }
}

function dadosDoAviso(projeto: Projeto): DadosAvisoPublicitario {
  const leitor = new LeitorPublicitario();
  projeto.aceitar(leitor);
  return leitor.resultado();
}
