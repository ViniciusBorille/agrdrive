exports.up = (pgm) => {
  pgm.createType("visit_event_type", [
    "MONITORAMENTO",
    "APLICACAO",
    "COMERCIAL",
    "PROSPECCAO",
    "COLETA",
    "OUTRO",
  ]);

  pgm.createTable("visits", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    title: {
      type: "varchar(150)",
      notNull: true,
    },

    client: {
      type: "varchar(150)",
    },

    event_date: {
      type: "date",
      notNull: true,
    },

    start_time: {
      type: "time",
      notNull: true,
    },

    end_time: {
      type: "time",
      notNull: true,
    },

    type: {
      type: "visit_event_type",
      notNull: true,
      default: "OUTRO",
    },

    created_by: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },

    synced: {
      type: "boolean",
      notNull: true,
      default: false,
    },

    google_event_id: {
      type: "varchar(255)",
    },

    deleted_at: {
      type: "timestamptz",
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

  pgm.createIndex("visits", "created_by");
  pgm.createIndex("visits", "event_date");
  pgm.createIndex("visits", "deleted_at");
};

exports.down = false;
