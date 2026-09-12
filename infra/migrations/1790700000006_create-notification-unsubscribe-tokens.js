// Token que faz o link de descadastro funcionar sem login.
//
// Quem está incomodado com o e-mail não vai lembrar a senha para pedir
// para parar de receber. Sem saída fácil, o caminho que sobra é o botão de
// spam — e isso degrada a entregabilidade de todo o domínio, inclusive do
// e-mail de recuperação de senha. O prejuízo não fica contido na
// funcionalidade.
//
// Mesmo padrão de `user_activation_tokens` e `password_recovery_tokens`
// depois do commit `bac80ad`: o link carrega o token cru, o banco guarda
// só o SHA-256. Um dump não permite descadastrar ninguém.
exports.up = (pgm) => {
  pgm.createTable("notification_unsubscribe_tokens", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },

    token_hash: {
      type: "varchar(64)",
      notNull: true,
    },

    // Os tipos que estavam naquele e-mail. É o que permite oferecer
    // "desligar só este aviso" além de "desligar todos": sem isso, a
    // página não teria como saber do que o usuário está reclamando.
    types: {
      type: "notification_type[]",
      notNull: true,
      default: "{}",
    },

    used_at: {
      type: "timestamptz",
      notNull: false,
    },

    // Prazo generoso de propósito. Recuperação de senha expira em 15
    // minutos porque o usuário está esperando o e-mail; aqui ele pode
    // abrir a mensagem semanas depois, e um link morto empurra de volta
    // para o botão de spam.
    expires_at: {
      type: "timestamptz",
      notNull: true,
    },

    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },

    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.addConstraint(
    "notification_unsubscribe_tokens",
    "notification_unsubscribe_tokens_token_hash_unique",
    { unique: "token_hash" },
  );

  pgm.createIndex("notification_unsubscribe_tokens", "user_id");
};

exports.down = false;
