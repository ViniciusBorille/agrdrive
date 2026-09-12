// "3 dias antes, às 08:00" não significa nada sem fuso. O projeto trata o
// Brasil como fuso único hoje (o `models/google-calendar.js` assume
// America/Sao_Paulo fixo), mas consultor viaja entre MT e SP, que têm
// offsets distintos. Guardar por usuário custa uma coluna agora e evita
// remodelar depois.
exports.up = (pgm) => {
  pgm.addColumn("users", {
    timezone: {
      type: "text",
      notNull: true,
      default: "America/Sao_Paulo",
    },
  });
};

exports.down = false;
