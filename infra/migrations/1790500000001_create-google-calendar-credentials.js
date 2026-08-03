exports.up = (pgm) => {
  pgm.createTable("google_calendar_credentials", {
    user_id: {
      type: "uuid",
      primaryKey: true,
      references: "users",
      onDelete: "CASCADE",
    },

    access_token: {
      type: "text",
      notNull: true,
    },

    refresh_token: {
      type: "text",
      notNull: true,
    },

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
};

exports.down = false;
