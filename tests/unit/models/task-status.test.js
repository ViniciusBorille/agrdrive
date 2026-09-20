import {
  TASK_STATUSES,
  TASK_STATUS_TRANSITIONS,
  allowedTaskStatusTransitions,
  canTransitionTaskStatus,
} from "@/models/task-status.js";

describe("models/task-status.js", () => {
  describe(".canTransitionTaskStatus()", () => {
    test("permite as transições previstas para o fluxo normal", () => {
      expect(canTransitionTaskStatus("PENDING", "IN_PROGRESS")).toBe(true);
      expect(canTransitionTaskStatus("IN_PROGRESS", "COMPLETED")).toBe(true);
      expect(canTransitionTaskStatus("PENDING", "COMPLETED")).toBe(true);
    });

    test("permite passar por 'em finalização' antes de concluir", () => {
      expect(canTransitionTaskStatus("IN_PROGRESS", "FINISHING")).toBe(true);
      expect(canTransitionTaskStatus("PENDING", "FINISHING")).toBe(true);
      expect(canTransitionTaskStatus("FINISHING", "COMPLETED")).toBe(true);
      expect(canTransitionTaskStatus("FINISHING", "CANCELLED")).toBe(true);
    });

    // "Em finalização" avança como os outros status abertos: não desfaz.
    test("não deixa uma tarefa em finalização voltar atrás", () => {
      expect(canTransitionTaskStatus("FINISHING", "IN_PROGRESS")).toBe(false);
      expect(canTransitionTaskStatus("FINISHING", "PENDING")).toBe(false);
    });

    test("permite cancelar o que ainda está aberto", () => {
      expect(canTransitionTaskStatus("PENDING", "CANCELLED")).toBe(true);
      expect(canTransitionTaskStatus("IN_PROGRESS", "CANCELLED")).toBe(true);
    });

    // Regra central: concluída não volta atrás, senão o histórico do que
    // aconteceu deixa de ser confiável.
    test("não deixa uma tarefa concluída voltar para nenhum outro status", () => {
      expect(canTransitionTaskStatus("COMPLETED", "PENDING")).toBe(false);
      expect(canTransitionTaskStatus("COMPLETED", "IN_PROGRESS")).toBe(false);
      expect(canTransitionTaskStatus("COMPLETED", "FINISHING")).toBe(false);
      expect(canTransitionTaskStatus("COMPLETED", "CANCELLED")).toBe(false);
    });

    test("trata cancelada como terminal, do mesmo jeito que concluída", () => {
      expect(canTransitionTaskStatus("CANCELLED", "PENDING")).toBe(false);
      expect(canTransitionTaskStatus("CANCELLED", "IN_PROGRESS")).toBe(false);
      expect(canTransitionTaskStatus("CANCELLED", "FINISHING")).toBe(false);
      expect(canTransitionTaskStatus("CANCELLED", "COMPLETED")).toBe(false);
    });

    // Sem isto, reenviar o mesmo PATCH viraria erro e um retry inocente
    // quebraria.
    test("aceita permanecer no mesmo status, inclusive nos terminais", () => {
      for (const status of TASK_STATUSES) {
        expect(canTransitionTaskStatus(status, status)).toBe(true);
      }
    });

    test("recusa status desconhecido dos dois lados", () => {
      expect(canTransitionTaskStatus("PENDING", "DONE")).toBe(false);
      expect(canTransitionTaskStatus("INEXISTENTE", "COMPLETED")).toBe(false);
    });
  });

  describe(".allowedTaskStatusTransitions()", () => {
    test("inclui o status atual, para a tela conseguir marcá-lo", () => {
      expect(allowedTaskStatusTransitions("IN_PROGRESS")).toContain(
        "IN_PROGRESS",
      );
    });

    test("devolve só o próprio status quando o estado é terminal", () => {
      expect(allowedTaskStatusTransitions("COMPLETED")).toEqual(["COMPLETED"]);
      expect(allowedTaskStatusTransitions("CANCELLED")).toEqual(["CANCELLED"]);
    });

    test("mantém a ordem declarada em TASK_STATUSES", () => {
      expect(allowedTaskStatusTransitions("PENDING")).toEqual([
        "PENDING",
        "IN_PROGRESS",
        "FINISHING",
        "COMPLETED",
        "CANCELLED",
      ]);
    });

    // A ordem importa para o menu da tela: "Em finalização" precisa
    // aparecer entre "Em andamento" e "Concluída", não no fim da lista.
    test("oferece 'em finalização' na posição certa do fluxo", () => {
      expect(allowedTaskStatusTransitions("IN_PROGRESS")).toEqual([
        "IN_PROGRESS",
        "FINISHING",
        "COMPLETED",
        "CANCELLED",
      ]);
      expect(allowedTaskStatusTransitions("FINISHING")).toEqual([
        "FINISHING",
        "COMPLETED",
        "CANCELLED",
      ]);
    });

    test("não estoura com status desconhecido", () => {
      expect(allowedTaskStatusTransitions("INEXISTENTE")).toEqual([]);
    });
  });

  // Guarda contra acrescentar um valor no enum do banco e esquecer de
  // dizer para onde ele pode ir.
  test("todo status conhecido declara suas transições", () => {
    for (const status of TASK_STATUSES) {
      expect(TASK_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});
