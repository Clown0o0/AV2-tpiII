import type { FabricaProjeto } from '../factories/FabricaProjeto';
import type { OrquestradorEquipe } from '../orchestration/OrquestradorEquipe';

export type Relogio = () => Date;

export type CriadorDeOrquestrador = (fabrica: FabricaProjeto) => OrquestradorEquipe;
