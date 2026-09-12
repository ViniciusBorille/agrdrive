// Preferências de notificação por usuário e os lembretes de cada uma.
//
// A tabela de lembretes é separada em vez de um array de inteiros porque
// cada antecedência é consultada individualmente pelo motor de apuração:
// como linha, ela entra em JOIN e em índice; dentro de um array, exigiria
// unnest a cada leitura.
exports.up = (pgm) => {
  pgm.createType("notification_type", [
    "TASK_DUE", // tarefa com prazo se aproximando
    "VISIT_UPCOMING", // compromisso da agenda se aproximando
    "TASK_ASSIGNED", // imediata: você foi atribuído a uma tarefa
  ]);

  pgm.createTable("notification_preferences", {
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

    enabled: {
      type: "boolean",
      notNull: true,
      default: true,
    },

    // Hora do dia em que os avisos daquele tipo saem, no fuso do usuário
    // (coluna `timezone` em `users`). Sem fuso, "às 08:00" não significa
    // nada para quem não está no mesmo lugar que o servidor.
    send_at_time: {
      type: "time",
      notNull: true,
      default: "08:00",
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
    "notification_preferences",
    "notification_preferences_user_id_type_key",
    "UNIQUE (user_id, type)",
  );

  pgm.createIndex("notification_preferences", "user_id");

  pgm.createTable("notification_reminders", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    preference_id: {
      type: "uuid",
      notNull: true,
      references: "notification_preferences",
      onDelete: "CASCADE",
    },

    // Em minutos, não em dias: assim "2 horas antes de uma visita" cabe
    // sem mudar o schema depois. A tela converte para dias quando for
    // múltiplo de 1440.
    offset_minutes: {
      type: "integer",
      notNull: true,
      check: "offset_minutes >= 0",
    },
  });

  // Impede gravar a mesma antecedência duas vezes na mesma preferência,
  // o que geraria dois e-mails idênticos no mesmo instante.
  pgm.addConstraint(
    "notification_reminders",
    "notification_reminders_preference_id_offset_key",
    "UNIQUE (preference_id, offset_minutes)",
  );

  pgm.createIndex("notification_reminders", "preference_id");
};

exports.down = false;
