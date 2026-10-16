// Gera em exemplos/gerados/ uma cópia de cada exemplos/*.json com a "dataEntrega" trocada por
// hoje + 60 dias, que fica dentro da agenda dos profissionais criados pelo seed (de 1 mês atrás
// até 3 a 18 meses à frente). Os arquivos de exemplos/ são modelos versionados e nunca mudam.
// Uso, na raiz do projeto: npm run exemplos
const fs = require('node:fs');
const path = require('node:path');

const DIAS_ATE_A_ENTREGA = 60;
const MS_POR_DIA = 86_400_000;
const PASTA_GERADOS = 'gerados';

// Data AAAA-MM-DD, em UTC, DIAS_ATE_A_ENTREGA dias depois de `agora`.
function dataDeEntrega(agora = new Date()) {
  return new Date(agora.getTime() + DIAS_ATE_A_ENTREGA * MS_POR_DIA).toISOString().slice(0, 10);
}

// Troca o valor de toda "dataEntrega" do texto; o resto fica igual, byte a byte.
function comDataDeEntrega(texto, data) {
  return texto.replace(/"dataEntrega": "[^"]*"/g, `"dataEntrega": "${data}"`);
}

// Grava as cópias e devolve os nomes gravados. `sistemaDeArquivos` existe para o teste.
function gerarExemplos({ origem, destino, data, sistemaDeArquivos = fs }) {
  sistemaDeArquivos.mkdirSync(destino, { recursive: true });
  const nomes = sistemaDeArquivos.readdirSync(origem).filter((arquivo) => arquivo.endsWith('.json')).sort();
  for (const nome of nomes) {
    const texto = sistemaDeArquivos.readFileSync(path.join(origem, nome), 'utf8');
    sistemaDeArquivos.writeFileSync(path.join(destino, nome), comDataDeEntrega(texto, data));
  }
  return nomes;
}

function main() {
  const data = dataDeEntrega();
  const destino = path.join(__dirname, PASTA_GERADOS);
  const nomes = gerarExemplos({ origem: __dirname, destino, data });
  const relativo = (path.relative(process.cwd(), destino) || '.').split(path.sep).join('/');
  console.log(`Exemplos gravados em ${relativo} com dataEntrega = ${data} (os modelos em exemplos/ não mudam):`);
  for (const nome of nomes) console.log(`  ${relativo}/${nome}`);
}

if (require.main === module) main();

module.exports = { DIAS_ATE_A_ENTREGA, PASTA_GERADOS, dataDeEntrega, comDataDeEntrega, gerarExemplos };
