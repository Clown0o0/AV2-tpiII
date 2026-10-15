import { ErroValidacao } from '../domain/errors';
import { ProjetoAnimacao } from '../domain/entities/ProjetoAnimacao';
import { ProjetoDocumentario } from '../domain/entities/ProjetoDocumentario';
import { ProjetoPublicitario } from '../domain/entities/ProjetoPublicitario';
import { Projeto, type AjustesProjeto, type DadosProjeto } from '../domain/entities/Projeto';

// Campos que todo pedido com `modelo` precisa informar (a rota exige); no modelo são só marcadores.
const BASE_MODELO: Omit<DadosProjeto, 'genero' | 'duracaoEstimadaMin' | 'tipoCaptacao' | 'papeis'> = {
  titulo: 'Modelo',
  produtorId: 'modelo',
  orcamentoTotal: 1,
  dataEntrega: new Date(0),
  localizacao: 'A definir',
};

// Prototype: guarda um projeto-modelo por chave e cria novos projetos clonando o modelo
// e aplicando os ajustes (que passam pela validação do construtor).
export class RegistroPrototipos {
  private readonly prototipos = new Map<string, Projeto>();

  // Um projeto-modelo inicial por tipo.
  static padrao(): RegistroPrototipos {
    const registro = new RegistroPrototipos();
    registro.registrar(
      'ficcao',
      new Projeto({
        ...BASE_MODELO,
        genero: 'Drama',
        duracaoEstimadaMin: 100,
        tipoCaptacao: 'FICCAO',
        papeis: [
          { papel: 'DIRETOR', peso: 3 },
          { papel: 'ROTEIRISTA', peso: 2 },
          { papel: 'DIRETOR_FOTOGRAFIA', peso: 2 },
          { papel: 'EDITOR', peso: 1 },
        ],
      }),
    );
    registro.registrar(
      'documentario',
      new ProjetoDocumentario({
        ...BASE_MODELO,
        genero: 'Documentário',
        duracaoEstimadaMin: 80,
        tipoCaptacao: 'DOCUMENTARIO',
        estrategia: 'ORCAMENTO_REDUZIDO',
        papeis: [
          { papel: 'DIRETOR', peso: 3 },
          { papel: 'ROTEIRISTA', peso: 2 },
          { papel: 'EDITOR', peso: 2 },
        ],
      }),
    );
    registro.registrar(
      'animacao',
      new ProjetoAnimacao({
        ...BASE_MODELO,
        genero: 'Animação',
        duracaoEstimadaMin: 85,
        tipoCaptacao: 'ANIMACAO',
        detalhes: { tecnica: '3D', softwares: ['Blender'], quadrosPorSegundo: 24 },
        papeis: [
          { papel: 'DIRETOR', peso: 3 },
          { papel: 'EFEITOS_VISUAIS', peso: 3 },
          { papel: 'SONOPLASTA', peso: 1 },
        ],
      }),
    );
    registro.registrar(
      'publicitario',
      new ProjetoPublicitario({
        ...BASE_MODELO,
        genero: 'Publicidade',
        duracaoEstimadaMin: 1,
        tipoCaptacao: 'PUBLICITARIO',
        // 60 s: a duração estimada é em minutos inteiros (1 min), e o validador do tipo exige estimada <= máxima.
        detalhes: { canais: ['TV', 'redes sociais'], duracaoMaxSegundos: 60 },
        papeis: [
          { papel: 'DIRETOR', peso: 2 },
          { papel: 'DIRETOR_FOTOGRAFIA', peso: 3 },
          { papel: 'EDITOR', peso: 2 },
        ],
      }),
    );
    return registro;
  }

  // Guarda uma cópia: mudar o objeto passado depois não altera o modelo.
  registrar(chave: string, prototipo: Projeto): void {
    this.prototipos.set(chave, prototipo.clonar());
  }

  criarAPartirDe(chave: string, ajustes: AjustesProjeto = {}): Projeto {
    const prototipo = this.prototipos.get(chave);
    if (!prototipo) throw new ErroValidacao(`Modelo de projeto inexistente: ${chave}`);
    return prototipo.clonar(ajustes);
  }

  chaves(): string[] {
    return [...this.prototipos.keys()];
  }
}
