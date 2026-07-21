const bcryptjs = require("bcryptjs");

// Sem cadastro público (o /cadastro foi removido — só quem já tem a
// feature `create:user` pode criar usuários), um banco recém-criado
// não tem nenhum jeito de logar e convidar o primeiro usuário. Este
// seed cria um admin local para destravar esse bootstrap. Nunca deve
// rodar em produção.
exports.up = async (pgm) => {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const hashedPassword = await bcryptjs.hash("admin123", 1);

  await pgm.db.query({
    text: `
      INSERT INTO
        users (username, email, password, features)
      VALUES
        ($1, $2, $3, $4)
      ON CONFLICT (username) DO NOTHING
    ;`,
    values: [
      "admin",
      "admin@agrdrive.com.br",
      hashedPassword,
      [
        "create:session",
        "read:session",
        "create:user",
        "read:user",
        "read:user:self",
        "read:user:others",
        "update:user",
        "update:user:others",
        "create:recovery_token",
        "read:recovery_token",
        "use:tasks",
        "read:indicators",
        "use:agenda",
        "create:migration",
        "read:migration",
        "read:status",
        "read:status:all",
      ],
    ],
  });
};

exports.down = false;
