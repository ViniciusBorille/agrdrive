const { execFileSync } = require("node:child_process");

// Camada 1 do backup: um branch do Neon é uma cópia instantânea do banco
// inteiro, copy-on-write — não duplica storage e o compute dele fica em
// zero enquanto ninguém acessa. Criar um antes de rodar migration é a
// rede de segurança mais barata disponível, e aqui ela é necessária:
// nenhuma migration do projeto tem `down`, então não existe volta pelo
// código. O plano Free inclui 10 branches.
//
// Requer autenticação prévia — `npx neonctl auth` (abre o navegador) ou
// a variável de ambiente NEON_API_KEY.
//
//   npm run backup:branch
//   npm run backup:branch -- antes-do-hash-tokens

// O id do projeto vai explícito de propósito. O `neonctl` também aceita
// um contexto gravado por `neonctl link`, mas isso é estado local da
// máquina: o script passaria a funcionar aqui e falhar num clone novo,
// em outro computador ou no CI. Id de projeto não é credencial, então
// versionar é seguro. A variável de ambiente permite apontar para outro
// projeto sem editar o arquivo.
const PROJECT_ID = process.env.NEON_PROJECT_ID || "odd-queen-19802349";

// A branch padrão do projeto no Neon se chama "production" (não "main",
// que é o nome padrão do Neon em projetos novos). É ela que o comando de
// restauração recebe como destino.
const DEFAULT_BRANCH = process.env.NEON_DEFAULT_BRANCH || "production";

// O rótulo entra num nome de branch e, no Windows, numa linha de shell.
// Restringir o alfabeto evita tanto nome inválido quanto surpresa.
function sanitizar(valor) {
  return valor.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);
}

function nomeDoBranch() {
  const rotulo = process.argv[2];

  if (rotulo) {
    return `backup-${sanitizar(rotulo)}`;
  }

  const agora = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `backup-${agora}Z`;
}

const nome = nomeDoBranch();

console.log(`\n🌱 Criando branch de backup no Neon: ${nome}`);
console.log(`   Projeto: ${PROJECT_ID}`);

try {
  execFileSync(
    "npx",
    [
      "neonctl",
      "branches",
      "create",
      "--project-id",
      PROJECT_ID,
      "--name",
      nome,
    ],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
} catch {
  console.error(`\n🔴 Não foi possível criar o branch "${nome}".`);
  console.error("   Autentique-se com `npx neonctl auth` e tente de novo.");
  console.error("   No Free há limite de 10 branches por projeto.");
  process.exit(1);
}

console.log(`\n🟢 Branch "${nome}" criado.`);
console.log(
  `   Restaurar:  npx neonctl branches restore ${DEFAULT_BRANCH} ${nome} --project-id ${PROJECT_ID}`,
);
console.log(
  `   Descartar:  npx neonctl branches delete ${nome} --project-id ${PROJECT_ID}`,
);
