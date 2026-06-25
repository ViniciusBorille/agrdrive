exports.up = (pgm) => {
  pgm.createTable("task_assignees", {
    task_id: {
      type: "uuid",
      notNull: true,
      references: "tasks",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.addConstraint(
    "task_assignees",
    "task_assignees_pkey",
    "PRIMARY KEY (task_id, user_id)",
  );

  pgm.createIndex("task_assignees", "user_id");

  pgm.sql(`
    INSERT INTO task_assignees (task_id, user_id)
    SELECT id, assigned_to FROM tasks WHERE assigned_to IS NOT NULL
  `);

  pgm.dropIndex("tasks", "assigned_to");
  pgm.dropColumn("tasks", "assigned_to");
};

exports.down = false;
