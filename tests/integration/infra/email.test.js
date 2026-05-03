import email from "infra/email.js";
import orchestrator from "tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

describe("infra/email.js", () => {
  test("send()", async () => {
    await orchestrator.deleteAllEmails();

    await email.send({
      from: "AgrDrive <contato@agrdrive.com.br>",
      to: "contato@curso.dev",
      subject: "Teste de assunto",
      text: "Teste de corpo.",
    });
    await email.send({
      from: "AgrDrive <contato@agrdrive.com.br>",
      to: "contato@curso.dev",
      subject: "Último email enviado.",
      text: "Teste de corpo do último email.",
    });

    const lastEmail = await orchestrator.getLastEmail();
    expect(lastEmail.sender).toBe("<contato@agrdrive.com.br>");
    expect(lastEmail.recipients[0]).toBe("<contato@curso.dev>");
    expect(lastEmail.subject).toBe("Último email enviado.");
    expect(lastEmail.text).toBe("Teste de corpo do último email.\r\n");
  });
});
