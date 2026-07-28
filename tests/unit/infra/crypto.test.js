import crypto from "node:crypto";
import cryptography from "@/infra/crypto.js";

const ORIGINAL_ENV = process.env;
const VALID_KEY = crypto.randomBytes(32).toString("base64");

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ENCRYPTION_KEY: VALID_KEY };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("infra/crypto.js", () => {
  describe(".encrypt() e .decrypt()", () => {
    test("round trip devolve o valor original", () => {
      const plainText = "ya29.a0AfB_by-token-do-google";

      const encrypted = cryptography.encrypt(plainText);

      expect(encrypted).not.toBe(plainText);
      expect(encrypted).not.toContain(plainText);
      expect(cryptography.decrypt(encrypted)).toBe(plainText);
    });

    test("preserva acentuação e caracteres multibyte", () => {
      const plainText = "visita à fazenda São João 🌱";

      expect(cryptography.decrypt(cryptography.encrypt(plainText))).toBe(
        plainText,
      );
    });

    test("gera ciphertexts diferentes para a mesma entrada (IV aleatório)", () => {
      const first = cryptography.encrypt("mesmo-valor");
      const second = cryptography.encrypt("mesmo-valor");

      expect(first).not.toBe(second);
      expect(cryptography.decrypt(first)).toBe("mesmo-valor");
      expect(cryptography.decrypt(second)).toBe("mesmo-valor");
    });

    test("usa o formato versionado v1:iv:tag:ciphertext", () => {
      const parts = cryptography.encrypt("qualquer-coisa").split(":");

      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("v1");
    });

    test("null e undefined atravessam como null", () => {
      expect(cryptography.encrypt(null)).toBeNull();
      expect(cryptography.encrypt(undefined)).toBeNull();
      expect(cryptography.decrypt(null)).toBeNull();
      expect(cryptography.decrypt(undefined)).toBeNull();
    });

    test("string vazia continua sendo cifrada e recuperada", () => {
      expect(cryptography.decrypt(cryptography.encrypt(""))).toBe("");
    });
  });

  describe(".decrypt() com entrada inválida", () => {
    test("rejeita valor em texto puro (formato desconhecido)", () => {
      expect(() => cryptography.decrypt("token-em-texto-puro")).toThrow(
        expect.objectContaining({ name: "ServiceError" }),
      );
    });

    test("rejeita ciphertext adulterado", () => {
      const encrypted = cryptography.encrypt("valor-original");
      const [version, iv, tag, cipherText] = encrypted.split(":");
      const tamperedCipherText = Buffer.from(cipherText, "base64");
      tamperedCipherText[0] ^= 0xff;

      const tampered = [
        version,
        iv,
        tag,
        tamperedCipherText.toString("base64"),
      ].join(":");

      expect(() => cryptography.decrypt(tampered)).toThrow(
        expect.objectContaining({ name: "ServiceError" }),
      );
    });

    test("rejeita valor cifrado com outra chave", () => {
      const encrypted = cryptography.encrypt("valor-original");

      process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

      expect(() => cryptography.decrypt(encrypted)).toThrow(
        expect.objectContaining({ name: "ServiceError" }),
      );
    });
  });

  describe(".isEncrypted()", () => {
    test("distingue valor cifrado de texto puro", () => {
      expect(cryptography.isEncrypted(cryptography.encrypt("x"))).toBe(true);
      expect(cryptography.isEncrypted("ya29.token-puro")).toBe(false);
      expect(cryptography.isEncrypted("v1:so-duas-partes")).toBe(false);
      expect(cryptography.isEncrypted(null)).toBe(false);
    });
  });

  describe("configuração da chave", () => {
    test("falha quando ENCRYPTION_KEY não está definida", () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => cryptography.encrypt("x")).toThrow(
        expect.objectContaining({ name: "InternalServerError" }),
      );
    });

    test("falha quando ENCRYPTION_KEY não tem 32 bytes", () => {
      process.env.ENCRYPTION_KEY =
        Buffer.from("chave-curta").toString("base64");

      expect(() => cryptography.encrypt("x")).toThrow(
        expect.objectContaining({ name: "InternalServerError" }),
      );
    });
  });
});
