import { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { construirApp } from './app';
import { RecomendacaoEventEmitter } from './events/RecomendacaoEventEmitter';
import { AuditoriaObservador } from './events/observadores/AuditoriaObservador';
import { EmailObservador } from './events/observadores/EmailObservador';
import { MensagemInternaObservador } from './events/observadores/MensagemInternaObservador';
import { RegistroFabricas } from './factories/RegistroFabricas';
import { PrismaProfissionalRepository } from './repositories/PrismaProfissionalRepository';
import { PrismaProjetoRepository } from './repositories/PrismaProjetoRepository';
import { criarSistemaRecomendacao } from './composicao/criarSistemaRecomendacao';
import { lerConfiguracao, lerOuEncerrar, type Configuracao } from './composicao/configuracao';
import type { OpcoesFonteResiliente } from './services/FonteProfissionaisResiliente';
import type { SistemaRecomendacao } from './services/SistemaRecomendacao';

try {
  process.loadEnvFile();
} catch {
  // Sem .env: usa apenas as variáveis de ambiente do processo.
}

const configuracao = lerOuEncerrar(() => lerConfiguracao(process.env));
const prisma = new PrismaClient();
let eventos: RecomendacaoEventEmitter | undefined;
let servico: SistemaRecomendacao | undefined;

const app = construirApp({
  logger: { level: configuracao.nivelLog },
  montarServico: (logger) => {
    const fabricas = RegistroFabricas.padrao({ logger });
    eventos = criarPublicadorDeEventos(logger, fabricas);
    servico = criarSistemaRecomendacao({
      profissionais: new PrismaProfissionalRepository(prisma),
      projetos: new PrismaProjetoRepository(prisma, fabricas),
      eventos,
      fabricas,
      opcoesFonte: opcoesDaFonteDeProfissionais(logger, configuracao),
    });
    return servico;
  },
});

// Um notificador por tipo, registrado uma única vez aqui (nunca por requisição).
function criarPublicadorDeEventos(logger: FastifyBaseLogger, fabricas: RegistroFabricas): RecomendacaoEventEmitter {
  return new RecomendacaoEventEmitter((erro, evento, observador) =>
    logger.error({ err: erro, evento, observador }, 'falha em observador'),
  ).registrar(
    new EmailObservador(logger),
    new MensagemInternaObservador(logger),
    new AuditoriaObservador(logger),
    ...fabricas.todas().map((fabrica) => fabrica.criarNotificador()),
  );
}

function opcoesDaFonteDeProfissionais(logger: FastifyBaseLogger, config: Configuracao): Partial<OpcoesFonteResiliente> {
  return {
    timeoutMs: config.profissionaisTimeoutMs,
    ttlMs: config.catalogoTtlMs,
    aoFalhar: (erro, operacao) => logger.warn({ err: erro, operacao }, 'repositório de profissionais indisponível; usando fallback'),
  };
}

async function encerrar(sinal: string): Promise<void> {
  app.log.info({ sinal }, 'encerrando');
  servico?.encerrarCatalogo();
  await app.close();
  await eventos?.aguardarPendentes();
  await prisma.$disconnect();
  process.exit(0);
}

// Falha não tratada deixa o processo em estado desconhecido: registra e encerra com código 1.
// O temporizador garante a saída mesmo se o desligamento do Prisma travar.
function encerrarPorFalha(erro: unknown, origem: string): void {
  app.log.fatal({ err: erro, origem }, 'falha não tratada; encerrando');
  setTimeout(() => process.exit(1), 3000).unref();
  servico?.encerrarCatalogo();
  void prisma.$disconnect().finally(() => process.exit(1));
}

process.on('SIGINT', () => void encerrar('SIGINT'));
process.on('SIGTERM', () => void encerrar('SIGTERM'));
process.on('unhandledRejection', (motivo) => encerrarPorFalha(motivo, 'unhandledRejection'));
process.on('uncaughtException', (erro) => encerrarPorFalha(erro, 'uncaughtException'));

async function iniciar(): Promise<void> {
  // Carrega o cadastro antes de aceitar requisições, para a primeira não esperar pelo banco.
  await servico?.iniciarCatalogo();
  await app.listen({ port: configuracao.porta, host: configuracao.host });
}

iniciar().catch(async (erro: unknown) => {
  app.log.error({ err: erro }, 'falha ao iniciar o servidor');
  await prisma.$disconnect();
  process.exit(1);
});
