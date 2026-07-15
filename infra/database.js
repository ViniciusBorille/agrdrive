import { Client } from "pg";
import { ServiceError } from "@/infra/errors";

async function query(queryObject) {
  let client;
  try {
    client = await getNewClient();
    const result = await client.query(queryObject);
    return result;
  } catch (error) {
    const serviceErrorObject = new ServiceError({
      message: "Erro na conexão com o Banco ou na Query.",
      cause: error,
    });
    throw serviceErrorObject;
  } finally {
    await client?.end();
  }
}

// Executa `callback(client)` dentro de uma transação (BEGIN/COMMIT).
// Qualquer erro faz ROLLBACK de todas as queries executadas no callback.
async function transaction(callback) {
  let client;
  try {
    client = await getNewClient();
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client?.query("ROLLBACK");
    } catch {
      // conexão já encerrada/quebrada — nada a fazer
    }

    if (error instanceof ServiceError) {
      throw error;
    }

    throw new ServiceError({
      message: "Erro na transação com o Banco de Dados.",
      cause: error,
    });
  } finally {
    await client?.end();
  }
}

async function getNewClient() {
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: process.env.POSTGRES_USER,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.NODE_ENV === "production" ? true : false,
  });

  await client.connect();
  return client;
}

const database = {
  query,
  transaction,
  getNewClient,
};

export default database;
