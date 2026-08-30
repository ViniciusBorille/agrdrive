import crypto from "node:crypto";
import { InternalServerError, ServiceError } from "@/infra/errors.js";

// Criptografia simétrica autenticada para segredos guardados no banco
// (hoje: os tokens OAuth do Google Calendar). AES-256-GCM garante
// confidencialidade e integridade — adulterar o ciphertext faz a
// decifragem falhar em vez de devolver lixo silenciosamente.
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_IN_BYTES = 32;
const IV_LENGTH_IN_BYTES = 12; // tamanho recomendado para GCM
const FORMAT_VERSION = "v1";

// Formato: "v1:<iv>:<authTag>:<ciphertext>", todos em base64.
// base64 nunca contém ":", então o split é seguro.
const SEPARATOR = ":";

function getKey() {
  const rawKey = process.env.ENCRYPTION_KEY;

  if (!rawKey) {
    throw new InternalServerError({
      cause:
        "A variável de ambiente `ENCRYPTION_KEY` não está definida. " +
        "Gere uma com: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\"",
    });
  }

  const key = Buffer.from(rawKey, "base64");

  if (key.length !== KEY_LENGTH_IN_BYTES) {
    throw new InternalServerError({
      cause: `A variável \`ENCRYPTION_KEY\` deve ter ${KEY_LENGTH_IN_BYTES} bytes em base64 (recebido: ${key.length}).`,
    });
  }

  return key;
}

function isEncrypted(value) {
  return (
    typeof value === "string" &&
    value.startsWith(`${FORMAT_VERSION}${SEPARATOR}`) &&
    value.split(SEPARATOR).length === 4
  );
}

function encrypt(plainText) {
  if (plainText === null || plainText === undefined) {
    return null;
  }

  const initializationVector = crypto.randomBytes(IV_LENGTH_IN_BYTES);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    getKey(),
    initializationVector,
  );

  const cipherText = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);

  return [
    FORMAT_VERSION,
    initializationVector.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    cipherText.toString("base64"),
  ].join(SEPARATOR);
}

function decrypt(encryptedValue) {
  if (encryptedValue === null || encryptedValue === undefined) {
    return null;
  }

  if (!isEncrypted(encryptedValue)) {
    throw new ServiceError({
      message: "Não foi possível ler um dado protegido do sistema.",
      action: "Reconecte a integração para gerar novas credenciais.",
      cause: "Valor fora do formato esperado em `crypto.decrypt`.",
    });
  }

  const [, initializationVector, authTag, cipherText] =
    encryptedValue.split(SEPARATOR);

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(initializationVector, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(cipherText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof InternalServerError) {
      throw error;
    }

    // Chave trocada ou ciphertext adulterado.
    throw new ServiceError({
      message: "Não foi possível ler um dado protegido do sistema.",
      action: "Reconecte a integração para gerar novas credenciais.",
      cause: error,
    });
  }
}

// Hash de mão única para tokens de credencial (sessão, ativação,
// recuperação): o banco guarda apenas o hash, então um dump não permite
// usar os tokens. Não serve para senhas — para senhas, use bcrypt.
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

const cryptography = {
  encrypt,
  decrypt,
  isEncrypted,
  sha256,
};

export default cryptography;
