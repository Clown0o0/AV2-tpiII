import { PrismaClient } from '@prisma/client';
import { construirApp } from './app';
import { RecomendacaoEventEmitter } from './events/RecomendacaoEventEmitter';
import { AuditoriaObserver } from './events/observers/AuditoriaObserver';
import { EmailObserver } from './events/observers/EmailObserver';
import { MensagemInternaObserver } from './events/observers/MensagemInternaObserver';
import { FabricaProjetoRegistry } from './factories/FabricaProjetoRegistry';
import { PrismaProfissionalRepository } from './repositories/PrismaProfissionalRepository';
import { PrismaProjetoRepository } from './repositories/PrismaProjetoRepository';
import { TIMEOUT_PADRAO_MS, TTL_CATALOGO_PADRAO_MS } from './services/FonteProfissionaisResiliente';
import { RecomendacaoService } from './services/RecomendacaoService';

try {
  process.loadEnvFile();
} catch {
  // Sem .env: usa apenas as variáveis de ambiente do processo.
}

const prisma = new PrismaClient();
let eventos: RecomendacaoEventEmitter | undefined;
let servico: RecomendacaoService | undefined;

const app = construirApp({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  montarServico: (logger) => {
    const fabricas = FabricaProjetoRegistry.padrao({ logger });
    // Um notificador por tipo, registrado uma única vez aqui (nunca por requisição).
    eventos = new RecomendacaoEventEmitter((erro, evento, observador) =>
      logger.error({ err: erro, evento, observador }, 'falha em observador'),
    ).registrar(
      new EmailObserver(logger),
      new MensagemInternaObserver(logger),
      new AuditoriaObserver(logger),
      ...fabricas.todas().map((fabrica) => fabrica.criarNotificador()),
    );
    servico = new RecomendacaoService({
      profissionais: new PrismaProfissionalRepository(prisma),
      projetos: new PrismaProjetoRepository(prisma, fabricas),
      eventos,
      fabricas,
      opcoesFonte: {
        timeoutMs: Number(process.env.PROFISSIONAIS_TIMEOUT_MS ?? TIMEOUT_PADRAO_MS),
        ttlMs: Number(process.env.CATALOGO_TTL_MS ?? TTL_CATALOGO_PADRAO_MS),
        aoFalhar: (erro, operacao) => logger.warn({ err: erro, operacao }, 'repositório de profissionais indisponível; usando fallback'),
      },
    });
    return servico;
  },
});

async function encerrar(sinal: string): Promise<void> {
  app.log.info({ sinal }, 'encerrando');
  servico?.encerrarCatalogo();
  await app.close();
  await eventos?.aguardarPendentes();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void encerrar('SIGINT'));
process.on('SIGTERM', () => void encerrar('SIGTERM'));

async function iniciar(): Promise<void> {
  // Carrega o cadastro antes de aceitar requisições, para a primeira não esperar pelo banco.
  await servico?.iniciarCatalogo();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '0.0.0.0' });
}

iniciar().catch(async (erro: unknown) => {
  app.log.error({ err: erro }, 'falha ao iniciar o servidor');
  await prisma.$disconnect();
  process.exit(1);
});
