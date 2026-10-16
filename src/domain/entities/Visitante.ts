import type { Projeto } from './Projeto';
import type { ProjetoAnimacao } from './ProjetoAnimacao';
import type { ProjetoDocumentario } from './ProjetoDocumentario';
import type { ProjetoPublicitario } from './ProjetoPublicitario';
import type { Profissional } from './Profissional';
import type { MembroRecomendadoLeitura, Recomendacao } from './Recomendacao';

// Um método por elemento concreto: cada subtipo de projeto chama o seu em aceitar() (despacho duplo).
export interface Visitante {
  visitarProjeto(projeto: Projeto): void;
  visitarProjetoDocumentario(projeto: ProjetoDocumentario): void;
  visitarProjetoAnimacao(projeto: ProjetoAnimacao): void;
  visitarProjetoPublicitario(projeto: ProjetoPublicitario): void;
  visitarRecomendacao(recomendacao: Recomendacao): void;
  visitarMembro(membro: MembroRecomendadoLeitura): void;
  visitarProfissional(profissional: Profissional): void;
}

export interface Elemento {
  aceitar(visitante: Visitante): void;
}
