import bcryptjs from "bcryptjs";
import password from "@/models/password.js";

const ORIGINAL_ENV = process.env;

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("models/password.js", () => {
  describe(".hash()", () => {
    test("não devolve a senha em texto puro", async () => {
      const hashed = await password.hash("senhaCorreta");

      expect(hashed).not.toBe("senhaCorreta");
      expect(hashed).toMatch(/^\$2[aby]\$/);
    });

    test("gera hashes diferentes para a mesma senha", async () => {
      const [primeiro, segundo] = await Promise.all([
        password.hash("senhaCorreta"),
        password.hash("senhaCorreta"),
      ]);

      // O salt é aleatório por chamada, então dois hashes iguais
      // indicariam salt fixo — falha grave.
      expect(primeiro).not.toBe(segundo);
    });

    test("usa custo baixo em test e development", async () => {
      const bcryptHash = jest.spyOn(bcryptjs, "hash");

      for (const nodeEnv of ["test", "development"]) {
        process.env = { ...ORIGINAL_ENV, NODE_ENV: nodeEnv };
        await password.hash("senhaCorreta");

        expect(bcryptHash).toHaveBeenLastCalledWith("senhaCorreta", 1);
      }
    });

    // Qualquer ambiente desconhecido (produção, preview, staging) precisa
    // cair no custo alto — o default seguro é o ponto do getNumberOfRounds.
    test.each(["production", "preview", undefined])(
      "usa custo 14 quando NODE_ENV é %p",
      async (nodeEnv) => {
        const bcryptHash = jest
          .spyOn(bcryptjs, "hash")
          .mockResolvedValue("hash-simulado");
        process.env = { ...ORIGINAL_ENV, NODE_ENV: nodeEnv };

        await password.hash("senhaCorreta");

        expect(bcryptHash).toHaveBeenCalledWith("senhaCorreta", 14);
      },
    );
  });

  describe(".compare()", () => {
    test("aceita a senha correta", async () => {
      const hashed = await password.hash("senhaCorreta");

      await expect(password.compare("senhaCorreta", hashed)).resolves.toBe(
        true,
      );
    });

    test("recusa a senha errada", async () => {
      const hashed = await password.hash("senhaCorreta");

      await expect(password.compare("senhaErrada", hashed)).resolves.toBe(
        false,
      );
    });
  });

  describe(".compareWithDummyHash()", () => {
    test("resolve sem devolver nada", async () => {
      await expect(
        password.compareWithDummyHash("qualquerSenha"),
      ).resolves.toBeUndefined();
    });

    // O ponto da função é gastar CPU de propósito: se ela não chamasse o
    // bcrypt, o login voltaria a responder mais rápido para e-mail
    // inexistente e o tempo de resposta entregaria quem está cadastrado.
    test("executa uma comparação bcrypt de verdade", async () => {
      const bcryptCompare = jest.spyOn(bcryptjs, "compare");

      await password.compareWithDummyHash("qualquerSenha");

      expect(bcryptCompare).toHaveBeenCalledWith(
        "qualquerSenha",
        expect.stringMatching(/^\$2[aby]\$/),
      );
    });

    test("reaproveita o mesmo hash descartável entre chamadas", async () => {
      // Primeira chamada fora do spy: garante o hash já memoizado,
      // independente da ordem em que os testes rodarem.
      await password.compareWithDummyHash("primeira");

      const bcryptHash = jest.spyOn(bcryptjs, "hash");
      await password.compareWithDummyHash("segunda");

      // O hash é memoizado no módulo: gerá-lo a cada login desperdiçaria
      // CPU sem ganho de segurança.
      expect(bcryptHash).not.toHaveBeenCalled();
    });
  });
});
