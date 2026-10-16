import type { PapelTecnico, Projeto } from '../../domain/entities/Projeto';
import { ProjetoPublicitario } from '../../domain/entities/ProjetoPublicitario';
import { NotificadorPorTipo } from '../../events/observadores/NotificadorPorTipo';

export class NotificadorPublicitario extends NotificadorPorTipo {
  readonly nome = 'notificador-publicitario';

  protected textoRecomendacao(projeto: Projeto): string {
    const marca = projeto instanceof ProjetoPublicitario ? projeto.marca : projeto.titulo;
    return `Peça publicitária de ${marca}: equipe sugerida. Envie a proposta para aprovação da agência.`;
  }

  protected textoPapelEmAberto(papel: PapelTecnico): string {
    return `Publicidade: o papel ${papel} ficou em aberto; avise a agência sobre possível impacto no prazo de veiculação.`;
  }

  protected textoEquipeFinalizada(projeto: Projeto): string {
    const canais = projeto instanceof ProjetoPublicitario && projeto.canais.length > 0 ? projeto.canais.join(', ') : 'a definir';
    return `Equipe da campanha "${projeto.titulo}" confirmada (canais: ${canais}).`;
  }
}
