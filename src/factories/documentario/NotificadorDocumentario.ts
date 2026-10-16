import type { PapelTecnico, Projeto } from '../../domain/entities/Projeto';
import type { ProjetoDocumentario } from '../../domain/entities/ProjetoDocumentario';
import { NotificadorPorTipo } from '../../events/observadores/NotificadorPorTipo';
import { VisitanteBase } from '../../visitors/VisitanteBase';

export class NotificadorDocumentario extends NotificadorPorTipo {
  readonly nome = 'notificador-documentario';

  protected textoRecomendacao(projeto: Projeto): string {
    const { entrevistados } = dadosDoAviso(projeto);
    return (
      `Documentário "${projeto.titulo}": equipe sugerida. ` +
      `Providencie as autorizações de uso de imagem dos ${entrevistados} entrevistado(s).`
    );
  }

  protected textoPapelEmAberto(papel: PapelTecnico): string {
    return `Documentário: o papel ${papel} ficou em aberto; a agenda de entrevistas aguarda a substituição.`;
  }

  protected textoEquipeFinalizada(projeto: Projeto): string {
    const { tema } = dadosDoAviso(projeto);
    return `Equipe do documentário "${projeto.titulo}" fechada: confira o cronograma de entrevistas sobre "${tema}".`;
  }
}

interface DadosAvisoDocumentario {
  entrevistados: number;
  tema: string;
}

// Lê os dados dos avisos pelo despacho duplo. Um projeto do tipo sem a subclasse (registro
// antigo) cai em visitarProjeto e recebe os valores neutros.
class LeitorDocumentario extends VisitanteBase<DadosAvisoDocumentario> {
  private dados: DadosAvisoDocumentario = { entrevistados: 0, tema: '' };

  override visitarProjeto(projeto: Projeto): void {
    super.visitarProjeto(projeto);
    this.dados = { entrevistados: 0, tema: projeto.genero };
  }

  override visitarProjetoDocumentario(projeto: ProjetoDocumentario): void {
    super.visitarProjeto(projeto);
    this.dados = { entrevistados: projeto.entrevistados.length, tema: projeto.tema };
  }

  resultado(): DadosAvisoDocumentario {
    return this.dados;
  }
}

function dadosDoAviso(projeto: Projeto): DadosAvisoDocumentario {
  const leitor = new LeitorDocumentario();
  projeto.aceitar(leitor);
  return leitor.resultado();
}
