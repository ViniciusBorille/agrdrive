// Os tokens do Google Calendar passaram a ser guardados cifrados
// (AES-256-GCM, ver `infra/crypto.js`). As credenciais gravadas antes
// dessa mudança estão em texto puro e não podem ser decifradas, então
// são removidas: quem estava conectado apenas reconecta a conta.
//
// Nenhum ambiente de produção existia quando isso foi escrito, então o
// impacto é limitado às bases de desenvolvimento.
exports.up = (pgm) => {
  pgm.sql(`DELETE FROM google_calendar_credentials;`);
};

exports.down = false;
