// Troca a "dataEntrega" de todos os exemplos/*.json por hoje + 60 dias, que fica dentro da
// agenda dos profissionais criados pelo seed (de 1 mês atrás até 3 a 18 meses à frente).
// Uso, na raiz do projeto: node exemplos/atualizar-datas.js
const fs = require('node:fs');
const path = require('node:path');

const DIAS_ATE_A_ENTREGA = 60;
const data = new Date(Date.now() + DIAS_ATE_A_ENTREGA * 86_400_000).toISOString().slice(0, 10);

for (const nome of fs.readdirSync(__dirname).filter((arquivo) => arquivo.endsWith('.json'))) {
  const caminho = path.join(__dirname, nome);
  const texto = fs.readFileSync(caminho, 'utf8');
  const atualizado = texto.replace(/"dataEntrega": "[^"]*"/g, `"dataEntrega": "${data}"`);
  if (atualizado !== texto) fs.writeFileSync(caminho, atualizado);
  if (texto.includes('"dataEntrega"')) console.log(`${nome}: dataEntrega = ${data}`);
}
