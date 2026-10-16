import Fastify, {
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import { ErroDominio } from './domain/errors';
import { recomendacaoRoutes } from './routes/recomendacao.routes';
import type { SistemaRecomendacao } from './services/SistemaRecomendacao';

export interface OpcoesApp {
  logger?: FastifyServerOptions['logger'];
  montarServico: (loggerDoFastify: FastifyBaseLogger) => SistemaRecomendacao;
}

const STATUS_REQUISICAO_INVALIDA = 400;

export function construirApp(opcoes: OpcoesApp): FastifyInstance {
  const app = Fastify({ logger: opcoes.logger ?? false, frameworkErrors: tratarErro });
  const service = opcoes.montarServico(app.log);
  app.setErrorHandler<FastifyError>(tratarErro);
  app.setNotFoundHandler(rotaInexistente);
  app.addHook('preValidation', rejeitarCaractereNulo);
  app.get('/health', async () => ({ status: 'ok' }));
  app.register(recomendacaoRoutes, { service });
  return app;
}

function tratarErro(erro: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (erro instanceof ErroDominio) {
    request.log.warn({ codigo: erro.codigo, mensagem: erro.message }, 'erro de domínio');
    return reply.code(erro.codigoHttp).send({ erro: erro.codigo, mensagem: erro.message });
  }
  const statusDoCliente = statusDeErroDoCliente(erro);
  if (statusDoCliente !== undefined) {
    return reply.code(statusDoCliente).send({ erro: 'REQUISICAO_INVALIDA', mensagem: erro.message });
  }
  request.log.error({ err: erro }, 'erro não tratado');
  return reply.code(500).send({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno inesperado; tente novamente.' });
}

function rotaInexistente(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ erro: 'NAO_ENCONTRADO', mensagem: `Rota ${request.method} ${request.url} não existe` });
}

// O Postgres não grava texto com \u0000; sem esta checagem a requisição viraria 500 no banco.
async function rejeitarCaractereNulo(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!contemCaractereNulo(request.body)) return undefined;
  return reply.code(STATUS_REQUISICAO_INVALIDA).send({ erro: 'REQUISICAO_INVALIDA', mensagem: 'Texto com caractere nulo (U+0000) não é aceito' });
}

function contemCaractereNulo(valor: unknown): boolean {
  if (typeof valor === 'string') return valor.includes('\u0000');
  if (Array.isArray(valor)) return valor.some(contemCaractereNulo);
  if (typeof valor !== 'object' || valor === null) return false;
  return Object.entries(valor).some(([chave, item]) => chave.includes('\u0000') || contemCaractereNulo(item));
}

// Erros de schema e 4xx do próprio Fastify (JSON malformado, Content-Length errado) são culpa do
// cliente e não podem virar 500.
function statusDeErroDoCliente(erro: FastifyError): number | undefined {
  if (erro.validation) return STATUS_REQUISICAO_INVALIDA;
  const { statusCode } = erro;
  return statusCode !== undefined && statusCode >= 400 && statusCode < 500 ? statusCode : undefined;
}
