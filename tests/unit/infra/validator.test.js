import validator from "@/infra/validator.js";
import { ValidationError } from "@/infra/errors.js";

describe("infra/validator.js", () => {
  describe(".validate()", () => {
    test("devolve os dados já parseados quando o schema aceita", () => {
      const parsed = validator.validate(validator.usernameSchema, "  fulano  ");

      // O schema aplica `.trim()`, então o retorno não é o dado de entrada.
      expect(parsed).toBe("fulano");
    });

    test("lança ValidationError com a mensagem do primeiro problema", () => {
      expect(() => validator.validate(validator.usernameSchema, "ab")).toThrow(
        expect.objectContaining({
          name: "ValidationError",
          message: "O username deve ter no mínimo 3 caracteres.",
          action: "Verifique os dados enviados e tente novamente.",
        }),
      );
    });

    test("o erro lançado é um ValidationError de verdade", () => {
      expect(() =>
        validator.validate(validator.uuidSchema, "não-é-uuid"),
      ).toThrow(ValidationError);
    });
  });

  describe(".uuidSchema", () => {
    test("aceita um uuid válido", () => {
      const uuid = "3f4a1b2c-5d6e-4f70-8a91-b2c3d4e5f607";

      expect(validator.validate(validator.uuidSchema, uuid)).toBe(uuid);
    });

    test("recusa um texto que não é uuid", () => {
      expect(() => validator.validate(validator.uuidSchema, "123")).toThrow(
        expect.objectContaining({
          message: "O id informado não possui um formato válido.",
        }),
      );
    });
  });

  describe(".usernameSchema", () => {
    test.each([
      ["fulano", "letras"],
      ["fulano_123", "letras, números e underscore"],
      ["abc", "o mínimo de 3 caracteres"],
      ["a".repeat(30), "o máximo de 30 caracteres"],
    ])("aceita %p (%s)", (username) => {
      expect(validator.validate(validator.usernameSchema, username)).toBe(
        username,
      );
    });

    test.each([
      ["ab", "O username deve ter no mínimo 3 caracteres."],
      ["a".repeat(31), "O username deve ter no máximo 30 caracteres."],
      [
        "com espaço",
        "O username deve conter apenas letras, números e underscore.",
      ],
      [
        "com-hifen",
        "O username deve conter apenas letras, números e underscore.",
      ],
    ])("recusa %p", (username, expectedMessage) => {
      expect(() =>
        validator.validate(validator.usernameSchema, username),
      ).toThrow(expect.objectContaining({ message: expectedMessage }));
    });

    test("recusa um valor que não é texto", () => {
      expect(() => validator.validate(validator.usernameSchema, 123)).toThrow(
        expect.objectContaining({ message: "O username deve ser um texto." }),
      );
    });
  });

  describe(".emailSchema", () => {
    test("aceita um e-mail válido", () => {
      expect(
        validator.validate(validator.emailSchema, "fulano@agrdrive.com.br"),
      ).toBe("fulano@agrdrive.com.br");
    });

    test("recusa um e-mail malformado", () => {
      expect(() =>
        validator.validate(validator.emailSchema, "fulano@"),
      ).toThrow(
        expect.objectContaining({
          message: "O email informado não possui um formato válido.",
        }),
      );
    });

    test("recusa um e-mail acima de 254 caracteres", () => {
      const longEmail = `${"a".repeat(250)}@teste.com`;

      expect(() =>
        validator.validate(validator.emailSchema, longEmail),
      ).toThrow(
        expect.objectContaining({
          message: "O email deve ter no máximo 254 caracteres.",
        }),
      );
    });
  });

  describe(".passwordSchema", () => {
    test("aceita uma senha dentro dos limites", () => {
      expect(validator.validate(validator.passwordSchema, "senha123")).toBe(
        "senha123",
      );
    });

    test("recusa uma senha curta demais", () => {
      expect(() =>
        validator.validate(validator.passwordSchema, "curta12"),
      ).toThrow(
        expect.objectContaining({
          message: "A senha deve ter no mínimo 8 caracteres.",
        }),
      );
    });

    // 72 bytes é o teto do bcrypt: acima disso o resto seria ignorado
    // silenciosamente na comparação.
    test("recusa uma senha acima de 72 caracteres", () => {
      expect(() =>
        validator.validate(validator.passwordSchema, "a".repeat(73)),
      ).toThrow(
        expect.objectContaining({
          message: "A senha deve ter no máximo 72 caracteres.",
        }),
      );
    });

    test("recusa um valor que não é texto", () => {
      expect(() => validator.validate(validator.passwordSchema, null)).toThrow(
        expect.objectContaining({ message: "A senha deve ser um texto." }),
      );
    });
  });
});
