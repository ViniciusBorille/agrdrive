// Tokens deixam de ser guardados em texto puro: um dump do banco não pode
// mais ser usado para sequestrar sessões ativas nem tomar contas via
// ativação/recuperação de senha. O valor entregue ao usuário (cookie ou
// link de e-mail) passa a ser comparado com o SHA-256 armazenado.
//
// `sha256()` e `convert_to()` são nativos do Postgres (11+), então a
// migração não depende da extensão pgcrypto estar habilitada.
const toSha256Hex = (column) =>
  `encode(sha256(convert_to(${column}, 'UTF8')), 'hex')`;

exports.up = (pgm) => {
  // Sessões existentes: o token vira o hash do valor que está no cookie
  // dos usuários, então as sessões ativas continuam válidas. O filtro por
  // tamanho evita hashear duas vezes as sessões que a aplicação nova já
  // tenha criado antes desta migração rodar (o token cru tem 96 caracteres
  // e o digest, 64) — sem ele, esses usuários seriam deslogados.
  pgm.sql(`
    UPDATE sessions
    SET token = ${toSha256Hex("token")}
    WHERE length(token) <> 64;
  `);

  // Tokens de ativação e recuperação: o link do e-mail deixa de ser o
  // `id` da linha e passa a ser um token próprio, guardado só como hash.
  // O backfill hasheia o `id` para que links já enviados sigam válidos.
  for (const table of ["user_activation_tokens", "password_recovery_tokens"]) {
    pgm.addColumn(table, {
      token_hash: {
        type: "varchar(64)",
      },
    });

    pgm.sql(`
      UPDATE ${table}
      SET token_hash = ${toSha256Hex("id::text")};
    `);

    pgm.alterColumn(table, "token_hash", { notNull: true });
    pgm.addConstraint(table, `${table}_token_hash_unique`, {
      unique: "token_hash",
    });
  }
};

exports.down = false;
