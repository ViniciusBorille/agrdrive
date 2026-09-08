// Contador de tentativas de envio.
//
// Falha de SMTP costuma ser momentânea, então desistir na primeira perderia
// avisos por nada. Mas endereço inválido falha sempre, e sem um teto a
// linha seria retentada em toda execução do job, para sempre.
//
// Com o contador, a regra fica simples: enquanto houver tentativa
// disponível a entrega continua PENDING e o job tenta de novo; esgotadas as
// tentativas ela vira FAILED e para de ser considerada.
exports.up = (pgm) => {
  pgm.addColumn("notification_deliveries", {
    attempts: {
      type: "integer",
      notNull: true,
      default: 0,
    },
  });
};

exports.down = false;
