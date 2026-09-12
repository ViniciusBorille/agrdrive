jest.mock("nodemailer", () => {
  const sendMail = jest.fn();

  return {
    __esModule: true,
    default: { createTransport: jest.fn(() => ({ sendMail })) },
    __sendMail: sendMail,
  };
});

import email from "@/infra/email.js";
import { ServiceError } from "@/infra/errors.js";

const sendMail = jest.requireMock("nodemailer").__sendMail;

const mailOptions = {
  from: "AgrDrive <contato@agrdrive.com.br>",
  to: "fulano@agrdrive.com.br",
  subject: "Assunto",
  text: "Corpo",
};

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({ messageId: "1" });
});

describe("infra/email.js", () => {
  describe(".send()", () => {
    test("repassa as opções para o transporte", async () => {
      await email.send(mailOptions);

      expect(sendMail).toHaveBeenCalledWith(mailOptions);
    });

    test("resolve sem devolver nada quando o envio dá certo", async () => {
      await expect(email.send(mailOptions)).resolves.toBeUndefined();
    });

    test("envolve a falha de envio em ServiceError", async () => {
      sendMail.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(email.send(mailOptions)).rejects.toThrow(
        expect.objectContaining({
          name: "ServiceError",
          message: "Não foi possível enviar o email.",
          action: "Verifique se o serviço de email está disponível.",
        }),
      );
    });

    // O contexto carrega o e-mail que falhou para dar o que investigar
    // no log — e é só isso: ele nunca chega ao corpo da resposta HTTP.
    test("guarda a causa e o e-mail que falhou no erro", async () => {
      const causa = new Error("ECONNREFUSED");
      sendMail.mockRejectedValue(causa);

      await expect(email.send(mailOptions)).rejects.toThrow(
        expect.objectContaining({ cause: causa, context: mailOptions }),
      );
    });

    test("o erro lançado é um ServiceError de verdade", async () => {
      sendMail.mockRejectedValue(new Error("falhou"));

      await expect(email.send(mailOptions)).rejects.toThrow(ServiceError);
    });
  });

  // O transporte é montado uma vez, no carregamento do módulo, então
  // cada ambiente precisa ser exercitado com uma importação isolada.
  describe("transporte", () => {
    const ORIGINAL_ENV = process.env;

    afterEach(() => {
      process.env = ORIGINAL_ENV;
    });

    async function createTransportOptionsWith(env) {
      let options;

      await jest.isolateModulesAsync(async () => {
        process.env = { ...ORIGINAL_ENV, ...env };
        const nodemailer = jest.requireMock("nodemailer").default;
        nodemailer.createTransport.mockClear();
        await import("@/infra/email.js");
        options = nodemailer.createTransport.mock.calls[0][0];
      });

      return options;
    }

    test("usa conexão sem TLS implícito em desenvolvimento", async () => {
      const options = await createTransportOptionsWith({
        NODE_ENV: "development",
      });

      expect(options.secure).toBe(false);
    });

    // Em produção o SMTP é externo: sem `secure`, as credenciais do
    // remetente sairiam em claro.
    test("exige conexão segura em produção", async () => {
      const options = await createTransportOptionsWith({
        NODE_ENV: "production",
        EMAIL_SMTP_HOST: "smtp.provedor.com",
        EMAIL_SMTP_PORT: "465",
      });

      expect(options.secure).toBe(true);
      expect(options.host).toBe("smtp.provedor.com");
    });
  });
});

describe("remetente padrão", () => {
  // Estava repetido como literal em cada model que mandava e-mail, o que
  // garantia que um dia divergiriam. Agora vive num lugar só, e é aqui que
  // se verifica que o endereço certo chega ao transporte.
  test("preenche o remetente institucional quando o chamador omite", async () => {
    await email.send({
      to: "fulano@agrdrive.com.br",
      subject: "Assunto",
      text: "Corpo",
    });

    expect(sendMail.mock.calls[0][0].from).toBe(
      "AgrDrive <contato@agrdrive.com.br>",
    );
  });

  test("um remetente explícito continua vencendo o padrão", async () => {
    await email.send({ ...mailOptions, from: "Outro <outro@agrdrive.com.br>" });

    expect(sendMail.mock.calls[0][0].from).toBe(
      "Outro <outro@agrdrive.com.br>",
    );
  });
});
