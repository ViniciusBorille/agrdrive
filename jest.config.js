const nextJest = require("next/jest");
const dotenv = require("dotenv");
dotenv.config({
  path: ".env.development",
});

const createJestConfig = nextJest({
  dir: ".",
});
const jestConfig = createJestConfig({
  moduleDirectories: ["node_modules", "<rootDir>"],
  testTimeout: 60000,

  // Sem esta lista, o relatório só mostra arquivos que algum teste
  // importou — um módulo sem teste nenhum fica invisível em vez de
  // aparecer como 0%, o que infla a cobertura aparente.
  //
  // `pages/` fica de fora de propósito: os testes de integração batem no
  // servidor Next, que roda em outro processo e não é instrumentado.
  // Incluir essas rotas mostraria 0% para código que na prática está
  // coberto ponta a ponta.
  // `infra/scripts` fica de fora: são utilitários de desenvolvimento
  // (espera do Postgres subir), não código que roda em produção.
  collectCoverageFrom: ["infra/**/*.js", "models/**/*.js", "!infra/scripts/**"],
});

module.exports = jestConfig;
