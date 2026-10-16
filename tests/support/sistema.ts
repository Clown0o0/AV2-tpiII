import {
  criarSistemaRecomendacao,
  type OpcoesSistemaRecomendacao,
} from '../../src/composicao/criarSistemaRecomendacao';
import { RecomendacaoEventEmitter } from '../../src/events/RecomendacaoEventEmitter';
import type { SistemaRecomendacao } from '../../src/services/SistemaRecomendacao';
import { elencoCompleto } from './fixtures';
import { InMemoryProfissionalRepository, InMemoryProjetoRepository } from './InMemoryRepositories';

/** Monta o sistema pela mesma raiz de composição do server.ts, com infraestrutura em memória por padrão. */
export function criarSistemaDeTeste(opcoes: Partial<OpcoesSistemaRecomendacao> = {}): SistemaRecomendacao {
  return criarSistemaRecomendacao({
    profissionais: new InMemoryProfissionalRepository(elencoCompleto()),
    projetos: new InMemoryProjetoRepository(),
    eventos: new RecomendacaoEventEmitter(),
    ...opcoes,
  });
}
