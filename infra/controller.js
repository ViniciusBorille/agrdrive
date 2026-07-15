import * as cookie from "cookie";
import session from "@/models/session.js";
import user from "@/models/user";
import authorization from "@/models/authorization.js";
import rateLimiter from "@/infra/rate-limiter.js";
import logger from "@/infra/logger.js";

import {
  InternalServerError,
  MethodNotAllowedError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
} from "@/infra/errors";

function onNoMatchHandler(request, response) {
  const publicErrorObject = new MethodNotAllowedError();
  response.status(publicErrorObject.statusCode).json(publicErrorObject);
}

function onErrorHandler(error, request, response) {
  if (error instanceof UnauthorizedError) {
    logger.security("authentication_denied", {
      ...logger.getRequestMetadata(request),
      user_id: request.context?.user?.id ?? null,
    });
    clearSessionCookie(response);
    return response.status(error.statusCode).json(error);
  }
  if (error instanceof ForbiddenError) {
    logger.security("access_denied", {
      ...logger.getRequestMetadata(request),
      user_id: request.context?.user?.id ?? null,
    });
    return response.status(error.statusCode).json(error);
  }
  if (error instanceof TooManyRequestsError) {
    logger.security("rate_limited", logger.getRequestMetadata(request));
    return response.status(error.statusCode).json(error);
  }
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return response.status(error.statusCode).json(error);
  }

  const publicErrorObject = new InternalServerError({
    cause: error,
  });

  console.error(publicErrorObject);

  response.status(publicErrorObject.statusCode).json(publicErrorObject);
}

function setSessionCookie(sessionToken, response) {
  const setCookie = cookie.serialize("session_id", sessionToken, {
    path: "/",
    maxAge: session.EXPIRATION_IN_MILISECONDS / 1000,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  });
  response.setHeader("Set-Cookie", setCookie);
}
function clearSessionCookie(response) {
  const setCookie = cookie.serialize("session_id", "invalid", {
    path: "/",
    maxAge: -1,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  });
  response.setHeader("Set-Cookie", setCookie);
}

async function injectAnonymousOrUser(request, response, next) {
  if (request.cookies?.session_id) {
    await injectAuthenticatedUser(request);
    return next();
  }

  injectAnonymousUser(request);
  return next();
}

async function injectAuthenticatedUser(request) {
  const sessionToken = request.cookies.session_id;
  const sessionObject = await session.findOneValidByToken(sessionToken);
  const userObject = await user.findOneById(sessionObject.user_id);

  request.context = {
    ...request.context,
    user: userObject,
  };
}

function injectAnonymousUser(request) {
  const anonymousUserObject = {
    features: ["create:session", "read:activation_token", "create:user"],
  };

  request.context = {
    ...request.context,
    user: anonymousUserObject,
  };
}

function canRequest(feature) {
  return function canRequestMiddleware(request, response, next) {
    const userTryingToRequest = request.context.user;

    if (authorization.can(userTryingToRequest, feature)) {
      return next();
    }

    throw new ForbiddenError({
      message: "Você não possui permissão para executar esta ação.",
      action: `Verifique se o seu usuário possui a feature "${feature}"`,
    });
  };
}

function rateLimit({ windowMs, max, keyGenerator }) {
  const limiter = rateLimiter.createRateLimiter({ windowMs, max });

  return function rateLimitMiddleware(request, response, next) {
    if (["test", "development"].includes(process.env.NODE_ENV)) {
      return next();
    }

    const { ip } = logger.getRequestMetadata(request);
    const key = keyGenerator ? keyGenerator(request, ip) : ip;

    const { allowed } = limiter.consume(String(key));

    if (!allowed) {
      throw new TooManyRequestsError();
    }

    return next();
  };
}

function requireAuthentication(request, response, next) {
  if (!request.context?.user?.id) {
    throw new UnauthorizedError({
      message: "Você precisa estar autenticado para acessar este recurso.",
      action: "Faça login para continuar.",
    });
  }
  return next();
}

const controller = {
  errorHandlers: {
    onNoMatch: onNoMatchHandler,
    onError: onErrorHandler,
  },
  setSessionCookie,
  clearSessionCookie,
  injectAnonymousOrUser,
  canRequest,
  rateLimit,
  requireAuthentication,
};

export default controller;
