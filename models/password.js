import bcryptjs from "bcryptjs";

async function hash(password) {
  const rounds = getNumberOfRounds();
  return await bcryptjs.hash(password, rounds);
}

function getNumberOfRounds() {
  // Seguro por padrão: qualquer ambiente desconhecido (staging, preview etc.)
  // usa custo alto. Custo baixo apenas em test/development, por velocidade.
  if (["test", "development"].includes(process.env.NODE_ENV)) {
    return 1;
  }

  return 14;
}

async function compare(providedPassword, storedPassword) {
  return await bcryptjs.compare(providedPassword, storedPassword);
}

// Hash descartável, gerado sob demanda com o custo do ambiente atual.
let dummyHashPromise;

// Gasta o mesmo tempo de CPU de uma verificação real. Sem isso, o login
// responde muito mais rápido quando o e-mail não existe (nenhum bcrypt
// roda) e o tempo de resposta revela quais e-mails estão cadastrados.
async function compareWithDummyHash(providedPassword) {
  dummyHashPromise ??= hash("dummy password for constant time comparison");

  await compare(providedPassword, await dummyHashPromise);
}

const password = {
  hash,
  compare,
  compareWithDummyHash,
};

export default password;
