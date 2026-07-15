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

const password = {
  hash,
  compare,
};

export default password;
