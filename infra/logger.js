function security(event, data = {}) {
  const logEntry = {
    level: "security",
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  console.log(JSON.stringify(logEntry));
}

// Registro de execução: o que um job fez, para dar o que conferir depois
// sem precisar consultar o banco. Mesmo formato estruturado dos demais.
function info(event, data = {}) {
  const logEntry = {
    level: "info",
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  console.log(JSON.stringify(logEntry));
}

// Falha que precisa chegar a um humano. Sai como JSON estruturado no
// stdout, que é o que a Vercel coleta, com `level: "error"` para dar o que
// filtrar e sobre o que alertar.
//
// Quem chama é responsável por não passar PII: o `ServiceError` de
// `infra/email.js` carrega `context: mailOptions`, que inclui o corpo da
// mensagem e o endereço do destinatário. Isso não pode ir para o log.
function error(event, data = {}) {
  const logEntry = {
    level: "error",
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  console.error(JSON.stringify(logEntry));
}

function getRequestMetadata(request) {
  const forwardedFor = request.headers?.["x-forwarded-for"];
  const ip = forwardedFor
    ? forwardedFor.split(",")[0].trim()
    : request.socket?.remoteAddress;

  return {
    ip,
    method: request.method,
    route: request.url,
  };
}

const logger = {
  security,
  info,
  error,
  getRequestMetadata,
};

export default logger;
