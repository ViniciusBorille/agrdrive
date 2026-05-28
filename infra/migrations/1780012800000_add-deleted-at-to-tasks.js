exports.up = (pgm) => {
  pgm.addColumn("tasks", {
    deleted_at: {
      type: "timestamptz",
    },
  });

  pgm.createIndex("tasks", "deleted_at");
};

exports.down = false;
