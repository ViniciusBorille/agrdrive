exports.up = (pgm) => {
  pgm.createType("task_status", [
    "PENDING",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]);

  pgm.createType("task_priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);

  pgm.createTable("tasks", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    title: {
      type: "varchar(150)",
      notNull: true,
    },

    description: {
      type: "varchar(2000)",
    },

    status: {
      type: "task_status",
      notNull: true,
      default: "PENDING",
    },

    priority: {
      type: "task_priority",
      notNull: true,
      default: "MEDIUM",
    },

    created_by: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },

    assigned_to: {
      type: "uuid",
      references: "users",
      onDelete: "SET NULL",
    },

    due_date: {
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

  pgm.createIndex("tasks", "status");
  pgm.createIndex("tasks", "priority");
  pgm.createIndex("tasks", "created_by");
  pgm.createIndex("tasks", "assigned_to");
  pgm.createIndex("tasks", "due_date");
};

exports.down = false;
