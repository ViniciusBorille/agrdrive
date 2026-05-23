exports.up = (pgm) => {
  pgm.dropColumn("users", "role");
};

exports.down = false;
