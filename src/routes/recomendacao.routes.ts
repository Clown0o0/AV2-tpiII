import type { FastifyInstance } from 'fastify';
import type { AjustesProjeto, DadosProjeto, PapelTecnico, TipoCaptacao, TipoEstrategia } from '../domain/entities/Projeto';
import type { ResultadoRecomendacao, SistemaRecomendacao } from '../services/SistemaRecomendacao';
import {
  schemaAlteracaoProjeto,
  schemaIdParams,
  schemaMembroParams,
  schemaProjeto,
  schemaRespostaConvite,
  schemaSubstituicao,
} from './schemas';
import { conviteJson, membroJson, projetoJson, recomendacaoJson } from './serializadores';

interface CamposComunsDoProjeto {
  titulo: string;
  produtorId: string;
  produtorEmail?: string;
  orcamentoTotal: number;
  dataEntrega: string;
  localizacao: string;
  estrategia?: TipoEstrategia;
  detalhes?: Record<string, unknown>;
}

interface PapelNoCorpo {
  papel: PapelTecnico;
  peso: number;
  competenciasDesejadas?: Record<string, number>;
}

interface CorpoProjetoCompleto extends CamposComunsDoProjeto {
  modelo?: undefined;
  genero: string;
  duracaoEstimadaMin: number;
  tipoCaptacao: TipoCaptacao;
  papeis: PapelNoCorpo[];
}

interface CorpoProjetoAPartirDoModelo extends CamposComunsDoProjeto {
  modelo: string;
  genero?: string;
  duracaoEstimadaMin?: number;
  tipoCaptacao?: TipoCaptacao;
  papeis?: PapelNoCorpo[];
}

type CorpoProjeto = CorpoProjetoCompleto | CorpoProjetoAPartirDoModelo;

interface CorpoAlteracao {
  orcamentoTotal?: number;
  dataEntrega?: string;
  estrategia?: TipoEstrategia;
  forcarReavaliacao?: boolean;
}

interface ParamsId {
  id: string;
}

interface ParamsMembro extends ParamsId {
  papel: PapelTecnico;
}

export interface OpcoesRotas {
  service: SistemaRecomendacao;
}

export async function recomendacaoRoutes(app: FastifyInstance, { service }: OpcoesRotas): Promise<void> {
  registrarRecomendarProjeto(app, service);
  registrarListarModelos(app, service);
  registrarAlterarProjeto(app, service);
  registrarConsultarRecomendacao(app, service);
  registrarGerarRelatorio(app, service);
  registrarAceitarMembro(app, service);
  registrarRejeitarMembro(app, service);
  registrarSubstituirMembro(app, service);
  registrarResponderConvite(app, service);
}

function registrarRecomendarProjeto(app: FastifyInstance, service: SistemaRecomendacao): void {
  const schema = { body: schemaProjeto(service.tiposCaptacao(), service.tiposEstrategia()) };
  app.post<{ Body: CorpoProjeto }>('/projetos/recomendar', { schema }, async (request, reply) => {
    const { projeto, recomendacao, fonteProfissionais } = await recomendarPeloCorpo(service, request.body);
    request.log.info(
      { acao: 'recomendar', ator: projeto.produtorId, projetoId: projeto.id, modelo: request.body.modelo },
      'recomendação solicitada',
    );
    return reply.code(201).send({ projeto: projetoJson(projeto), recomendacao: recomendacaoJson(recomendacao), fonteProfissionais });
  });
}

function recomendarPeloCorpo(service: SistemaRecomendacao, corpo: CorpoProjeto): Promise<ResultadoRecomendacao> {
  if (corpo.modelo === undefined) return service.recomendar(dadosDoCorpoCompleto(corpo));
  return service.recomendarAPartirDoModelo(corpo.modelo, ajustesDoCorpo(corpo));
}

function dadosDoCorpoCompleto(corpo: CorpoProjetoCompleto): DadosProjeto {
  const { modelo: _modelo, dataEntrega, ...dados } = corpo;
  return { ...dados, dataEntrega: dataDoCorpo(dataEntrega) };
}

function ajustesDoCorpo(corpo: CorpoProjetoAPartirDoModelo): AjustesProjeto & { tipoCaptacao?: TipoCaptacao } {
  const { modelo: _modelo, dataEntrega, ...ajustes } = corpo;
  return { ...ajustes, dataEntrega: dataDoCorpo(dataEntrega) };
}

// new Date('2026-02-30') vira 2 de março; aqui o dia precisa existir no calendário.
// Data inválida segue adiante e o domínio responde "Data de entrega inválida".
function dataDoCorpo(texto: string): Date {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (!partes) return new Date(texto);
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])];
  const calendario = new Date(Date.UTC(ano, mes, dia));
  return calendario.getUTCMonth() === mes && calendario.getUTCDate() === dia ? new Date(texto) : new Date(Number.NaN);
}

function registrarListarModelos(app: FastifyInstance, service: SistemaRecomendacao): void {
  app.get('/projetos/modelos', async () => ({ modelos: service.modelos() }));
}

function registrarAlterarProjeto(app: FastifyInstance, service: SistemaRecomendacao): void {
  const schema = { params: schemaIdParams, body: schemaAlteracaoProjeto(service.tiposEstrategia()) };
  app.patch<{ Params: ParamsId; Body: CorpoAlteracao }>('/projetos/:id', { schema }, async (request) => {
    const { dataEntrega, ...resto } = request.body;
    const resultado = await service.alterarProjeto(request.params.id, {
      ...resto,
      ...(dataEntrega !== undefined ? { dataEntrega: dataDoCorpo(dataEntrega) } : {}),
    });
    return {
      projeto: projetoJson(resultado.projeto),
      alteracao: resultado.alteracao,
      reavaliada: resultado.reavaliada,
      recomendacao: resultado.recomendacao ? recomendacaoJson(resultado.recomendacao) : null,
    };
  });
}

function registrarConsultarRecomendacao(app: FastifyInstance, service: SistemaRecomendacao): void {
  app.get<{ Params: ParamsId }>('/recomendacoes/:id', { schema: { params: schemaIdParams } }, async (request) => {
    const { recomendacao, convites } = await service.obterRecomendacaoComConvites(request.params.id);
    return { ...recomendacaoJson(recomendacao), convites: convites.map(conviteJson) };
  });
}

function registrarGerarRelatorio(app: FastifyInstance, service: SistemaRecomendacao): void {
  app.get<{ Params: ParamsId }>('/recomendacoes/:id/relatorio', { schema: { params: schemaIdParams } }, async (request) =>
    service.gerarRelatorio(request.params.id),
  );
}

function registrarAceitarMembro(app: FastifyInstance, service: SistemaRecomendacao): void {
  const url = '/recomendacoes/:id/membros/:papel/aceitar';
  app.post<{ Params: ParamsMembro }>(url, { schema: { params: schemaMembroParams } }, async (request, reply) => {
    const { recomendacao, convite } = await service.aceitarMembro(request.params.id, request.params.papel);
    return reply.code(201).send({ recomendacao: recomendacaoJson(recomendacao), convite: conviteJson(convite) });
  });
}

function registrarRejeitarMembro(app: FastifyInstance, service: SistemaRecomendacao): void {
  const url = '/recomendacoes/:id/membros/:papel/rejeitar';
  app.post<{ Params: ParamsMembro }>(url, { schema: { params: schemaMembroParams } }, async (request) =>
    recomendacaoJson(await service.rejeitarMembro(request.params.id, request.params.papel)),
  );
}

function registrarSubstituirMembro(app: FastifyInstance, service: SistemaRecomendacao): void {
  const url = '/recomendacoes/:id/membros/:papel/substituir';
  const schema = { params: schemaMembroParams, body: schemaSubstituicao(service.tiposEstrategia()) };
  app.post<{ Params: ParamsMembro; Body: { estrategia?: TipoEstrategia } | undefined }>(url, { schema }, async (request) => {
    const { id, papel } = request.params;
    const { recomendacao, novoMembro } = await service.substituirMembro(id, papel, request.body?.estrategia);
    return { recomendacao: recomendacaoJson(recomendacao), novoMembro: novoMembro ? membroJson(novoMembro) : null };
  });
}

function registrarResponderConvite(app: FastifyInstance, service: SistemaRecomendacao): void {
  const schema = { params: schemaIdParams, body: schemaRespostaConvite };
  app.post<{ Params: ParamsId; Body: { aceito: boolean } }>('/convites/:id/responder', { schema }, async (request) => {
    const { convite, recomendacao, equipeFinalizada } = await service.responderConvite(request.params.id, request.body.aceito);
    return { convite: conviteJson(convite), recomendacao: recomendacaoJson(recomendacao), equipeFinalizada };
  });
}
