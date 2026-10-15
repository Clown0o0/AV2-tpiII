import type { PapelTecnico, Projeto } from '../../domain/entities/Projeto';
import { ProjetoDocumentario } from '../../domain/entities/ProjetoDocumentario';
import { NotificadorPorTipo } from '../../events/observers/NotificadorPorTipo';

export class NotificadorDocumentario extends NotificadorPorTipo {
  readonly nome = 'notificador-documentario';

  protected textoRecomendacao(projeto: Projeto): string {
    const entrevistados = projeto instanceof ProjetoDocumentario ? projeto.entrevistados.length : 0;
    return (
      `Documentário "${projeto.titulo}": equipe sugerida. ` +
      `Providencie as autorizações de uso de imagem dos ${entrevistados} entrevistado(s).`
    );
  }

  protected textoPapelEmAberto(papel: PapelTecnico): string {
    return `Documentário: o papel ${papel} ficou em aberto; a agenda de entrevistas aguarda a substituição.`;
  }

  protected textoEquipeFinalizada(projeto: Projeto): string {
    const tema = projeto instanceof ProjetoDocumentario ? projeto.tema : projeto.genero;
    return `Equipe do documentário "${projeto.titulo}" fechada: confira o cronograma de entrevistas sobre "${tema}".`;
  }
}
