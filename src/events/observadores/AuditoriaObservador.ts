import type { EventoBase, EventoRecomendacao, NomeEvento } from '../EventTypes';
import type { Observador } from '../RecomendacaoEventEmitter';

// Subconjunto compatível com o pino (logger do Fastify).
export interface LoggerEstruturado {
  info(objeto: Record<string, unknown>, mensagem: string): void;
}

export interface RegistroAuditoria {
  evento: NomeEvento;
  ator: EventoBase['ator'];
  projetoId: string;
  ocorridoEm: string;
  dados: Record<string, unknown>;
}

// Registra, como log estruturado, toda ação de produtores, profissionais e do sistema.
export class AuditoriaObservador implements Observador {
  readonly nome = 'auditoria';
  private readonly _registros: RegistroAuditoria[] = [];

  constructor(
    private readonly logger: LoggerEstruturado,
    private readonly limiteMemoria = 1000,
  ) {}

  get registros(): readonly RegistroAuditoria[] {
    return this._registros;
  }

  atualizar(evento: EventoRecomendacao): void {
    const { ator, projetoId, ocorridoEm, ...resto } = evento.payload;
    const registro: RegistroAuditoria = {
      evento: evento.nome,
      ator,
      projetoId,
      ocorridoEm: ocorridoEm.toISOString(),
      dados: resumir(resto),
    };
    this._registros.push(registro);
    if (this._registros.length > this.limiteMemoria) this._registros.shift();
    this.logger.info({ auditoria: true, ...registro }, `auditoria: ${evento.nome}`);
  }
}

// Reduz entidades a identificadores para manter o log de auditoria enxuto.
export function resumir(dados: Record<string, unknown>): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados)) resultado[chave] = resumirValor(valor);
  return resultado;
}

function resumirValor(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map(resumirValor);
  if (ehRegistro(valor)) return typeof valor.id === 'string' ? { id: valor.id } : resumir(valor);
  return valor;
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object';
}
