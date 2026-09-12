// Registro do que já foi enviado. É esta tabela que impede o reenvio.
//
// O agendador recalcula "o que vence em N dias" a cada execução; sem um
// registro do que já saiu, cada passagem mandaria o mesmo aviso de novo.
// A chave única abaixo é a garantia: a reserva é feita com
// `INSERT ... ON CONFLICT DO NOTHING RETURNING id`, e só quem recebe o id
// de volta ganhou a corrida e pode enviar. Duas execuções simultâneas do
// job, ou um retry, não geram e-mail duplicado — quem resolve é o banco,
// sem lock na aplicação.
exports.up = (pgm) => {
  pgm.createType("notification_delivery_status", [
    "PENDING", // reservado, ainda não enviado
    "SENT",
    "FAILED",
    "SKIPPED", // deixou de fazer sentido antes de sair (tarefa concluída,
    // janela de tolerância vencida)
  ]);

  pgm.createTable("notification_deliveries", {
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

    type: {
      type: "notification_type",
      notNull: true,
    },

    // Id da tarefa ou da visita. Sem foreign key de propósito: aponta
    // para tabelas diferentes conforme o tipo, e o registro de envio deve
    // sobreviver ao desaparecimento do item — é histórico do que saiu.
    subject_id: {
      type: "uuid",
      notNull: true,
    },

    offset_minutes: {
      type: "integer",
      notNull: true,
    },

    // Guardado mesmo depois de enviado: é o que permite responder
    // "por que este e-mail chegou nesta hora?".
    scheduled_for: {
      type: "timestamptz",
      notNull: true,
    },

    status: {
      type: "notification_delivery_status",
      notNull: true,
      default: "PENDING",
    },

    sent_at: {
      type: "timestamptz",
    },

    error: {
      type: "text",
    },

    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.addConstraint(
    "notification_deliveries",
    "notification_deliveries_idempotency_key",
    "UNIQUE (user_id, type, subject_id, offset_minutes)",
  );

  // Consulta do despachante: o que está reservado e ainda não saiu.
  pgm.createIndex("notification_deliveries", ["status", "scheduled_for"]);
};

exports.down = false;
