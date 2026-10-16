import { Convite } from '../domain/entities/Convite';
import type { MembroRecomendadoLeitura, Recomendacao } from '../domain/entities/Recomendacao';
import { ErroEstadoInvalido, ErroNaoEncontrado } from '../domain/errors';
import type { ConviteRepository } from '../domain/ports/ConviteRepository';
import type { Relogio } from './contratos';

export interface ServicoDeConvites {
  criar(recomendacaoId: string, projetoId: string, membro: MembroRecomendadoLeitura): Promise<Convite>;
  obter(id: string): Promise<Convite>;
  listar(recomendacaoId: string): Promise<Convite[]>;
  cancelarPendentes(recomendacaoId: string, membro?: MembroRecomendadoLeitura): Promise<void>;
  responder(convite: Convite, recomendacao: Recomendacao, aceito: boolean): Promise<void>;
}

export class GestorDeConvites implements ServicoDeConvites {
  constructor(
    private readonly convites: ConviteRepository,
    private readonly relogio: Relogio,
  ) {}

  async criar(recomendacaoId: string, projetoId: string, membro: MembroRecomendadoLeitura): Promise<Convite> {
    const convite = new Convite({
      recomendacaoId,
      projetoId,
      profissionalId: membro.profissionalId,
      papel: membro.papel,
      criadoEm: this.relogio(),
    });
    await this.convites.salvarConvite(convite);
    return convite;
  }

  async obter(id: string): Promise<Convite> {
    const convite = await this.convites.buscarConvite(id);
    if (!convite) throw new ErroNaoEncontrado(`Convite ${id} não encontrado`);
    return convite;
  }

  listar(recomendacaoId: string): Promise<Convite[]> {
    return this.convites.listarConvites(recomendacaoId);
  }

  // Sem `membro`, cancela todos os convites pendentes da recomendação.
  async cancelarPendentes(recomendacaoId: string, membro?: MembroRecomendadoLeitura): Promise<void> {
    const pendentes = (await this.listar(recomendacaoId)).filter((c) => c.pendente && (!membro || conviteDoMembro(c, membro)));
    for (const convite of pendentes) {
      convite.cancelar(this.relogio());
      await this.convites.salvarConvite(convite);
    }
  }

  // A resposta muda o convite e o membro correspondente na recomendação; quem chama salva a recomendação.
  async responder(convite: Convite, recomendacao: Recomendacao, aceito: boolean): Promise<void> {
    garantirConviteDoMembroAtivo(convite, recomendacao);
    convite.responder(aceito, this.relogio());
    if (aceito) recomendacao.confirmar(convite.papel);
    else recomendacao.recusar(convite.papel);
    await this.convites.salvarConvite(convite);
  }
}

function conviteDoMembro(convite: Convite, membro: MembroRecomendadoLeitura): boolean {
  return convite.profissionalId === membro.profissionalId && convite.papel === membro.papel;
}

function garantirConviteDoMembroAtivo(convite: Convite, recomendacao: Recomendacao): void {
  if (recomendacao.membroAtivo(convite.papel)?.profissionalId !== convite.profissionalId) {
    throw new ErroEstadoInvalido(`Convite ${convite.id} não corresponde mais ao membro ativo do papel ${convite.papel}`);
  }
}
