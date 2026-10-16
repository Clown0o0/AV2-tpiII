import type { PapelTecnico, Projeto } from '../../domain/entities/Projeto';
import { ProjetoAnimacao } from '../../domain/entities/ProjetoAnimacao';
import { NotificadorPorTipo } from '../../events/observadores/NotificadorPorTipo';

export class NotificadorAnimacao extends NotificadorPorTipo {
  readonly nome = 'notificador-animacao';

  protected textoRecomendacao(projeto: Projeto): string {
    const tecnica = projeto instanceof ProjetoAnimacao ? `${projeto.tecnica}, ${projeto.quadrosPorSegundo} qps` : 'técnica a definir';
    return `Animação "${projeto.titulo}" (${tecnica}): equipe sugerida. Reserve as estações de render para os efeitos visuais.`;
  }

  protected textoPapelEmAberto(papel: PapelTecnico): string {
    return `Animação: o papel ${papel} ficou em aberto; o pipeline de produção está pausado para esse papel.`;
  }

  protected textoEquipeFinalizada(projeto: Projeto): string {
    const softwares = projeto instanceof ProjetoAnimacao && projeto.softwares.length > 0 ? projeto.softwares.join(', ') : 'a definir';
    return `Equipe da animação "${projeto.titulo}" completa: acesso ao pipeline liberado (softwares: ${softwares}).`;
  }
}
