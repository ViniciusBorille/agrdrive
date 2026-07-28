// O Google só devolve `refresh_token` no primeiro consentimento. Com a
// coluna `NOT NULL`, uma reconexão sem refresh token quebrava o INSERT
// com erro 500 opaco em vez de uma mensagem útil.
//
// Agora a coluna aceita nulo e `models/google-calendar.js` pede uma
// reconexão explícita quando precisa renovar e não tem refresh token.
exports.up = (pgm) => {
  pgm.alterColumn("google_calendar_credentials", "refresh_token", {
    notNull: false,
  });
};

exports.down = false;
