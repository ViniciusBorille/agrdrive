function security(event, data = {}) {
  const logEntry = {
    level: "security",
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  console.log(JSON.stringify(logEntry));
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
  getRequestMetadata,
};

export default logger;
