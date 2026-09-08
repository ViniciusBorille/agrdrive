import {
  buildNotificationEmail,
  formatEventAt,
} from "@/models/notification-templates.js";

const user = {
  username: "fulano",
  email: "fulano@exemplo.test",
  timezone: "America/Sao_Paulo",
};

function tarefa(title, offsetMinutes = 1440) {
  return {
    type: "TASK_DUE",
    offsetMinutes,
    title,
    eventAt: new Date("2026-09-29T23:59:59.999-03:00"),
  };
}

function visita(title, offsetMinutes = 120) {
  return {
    type: "VISIT_UPCOMING",
    offsetMinutes,
    title,
    eventAt: new Date("2026-09-20T09:00:00-03:00"),
  };
}

describe("models/notification-templates.js", () => {
  describe(".formatEventAt()", () => {
    // A data no e-mail precisa bater com a que a pessoa vê na tela.
    test("formata no fuso do destinatário", () => {
      const formatado = formatEventAt(
        new Date("2026-09-30T02:59:59.999Z"),
        "America/Sao_Paulo",
      );

      expect(formatado).toContain("29/09/2026");
    });

    test("sem data devolve string vazia", () => {
      expect(formatEventAt(null, "America/Sao_Paulo")).toBe("");
    });
  });

  describe("assunto", () => {
    // O assunto tem que resolver sem abrir o e-mail.
    test("um item do mesmo tipo é específico", () => {
      const { subject } = buildNotificationEmail({
        user,
        items: [tarefa("Entregar laudo")],
      });

      expect(subject).toBe("1 tarefa vence em 1 dia");
    });

    test("vários itens do mesmo tipo e antecedência somam", () => {
      const { subject } = buildNotificationEmail({
        user,
        items: [tarefa("A", 4320), tarefa("B", 4320), tarefa("C", 4320)],
      });

      expect(subject).toBe("3 tarefas vencem em 3 dias");
    });

    test("compromissos usam o verbo da agenda", () => {
      const { subject } = buildNotificationEmail({
        user,
        items: [visita("Fazenda Santa Rita")],
      });

      expect(subject).toBe("1 compromisso acontece em 2 horas");
    });

    // Misturando tipos não dá para ser específico sem mentir.
    test("tipos misturados caem no total honesto", () => {
      const { subject } = buildNotificationEmail({
        user,
        items: [tarefa("A"), visita("B")],
      });

      expect(subject).toBe("Você tem 2 avisos do AgrDrive");
    });

    test("antecedências diferentes também caem no total", () => {
      const { subject } = buildNotificationEmail({
        user,
        items: [tarefa("A", 1440), tarefa("B", 4320)],
      });

      expect(subject).toBe("Você tem 2 avisos do AgrDrive");
    });
  });

  describe("corpo", () => {
    // Cliente que só mostra texto precisa continuar legível.
    test("sempre gera texto puro além do HTML", () => {
      const { text, html } = buildNotificationEmail({
        user,
        items: [tarefa("Entregar laudo")],
      });

      expect(text).toContain("Entregar laudo");
      expect(text).toContain("29/09/2026");
      expect(html).toContain("Entregar laudo");
    });

    test("cada item traz link para o módulo", () => {
      const { text, html } = buildNotificationEmail({
        user,
        items: [tarefa("Entregar laudo"), visita("Santa Rita")],
      });

      expect(text).toContain("/tarefas");
      expect(text).toContain("/agenda");
      expect(html).toContain("/tarefas");
      expect(html).toContain("/agenda");
    });

    test("rodapé leva para a tela de configuração", () => {
      const { text, html } = buildNotificationEmail({
        user,
        items: [tarefa("Entregar laudo")],
      });

      expect(text).toContain("/configuracoes/notificacoes");
      expect(html).toContain("/configuracoes/notificacoes");
    });

    test("agrupa os itens por tipo em vez de misturar", () => {
      const { text } = buildNotificationEmail({
        user,
        items: [tarefa("Tarefa 1"), visita("Visita 1"), tarefa("Tarefa 2")],
      });

      expect(text.indexOf("TAREFAS")).toBeLessThan(
        text.indexOf("COMPROMISSOS"),
      );
      expect(text.indexOf("Tarefa 2")).toBeLessThan(text.indexOf("Visita 1"));
    });

    // Título de tarefa é texto livre digitado pelo usuário.
    test("escapa HTML vindo do título", () => {
      const { html } = buildNotificationEmail({
        user,
        items: [tarefa("<script>alert(1)</script>")],
      });

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    test("não vaza dado sensível do usuário no corpo", () => {
      const { text, html } = buildNotificationEmail({
        user,
        items: [tarefa("Entregar laudo")],
      });

      expect(text).not.toContain(user.email);
      expect(html).not.toContain(user.email);
    });
  });
});
