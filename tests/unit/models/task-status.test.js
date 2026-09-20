import {
  CLOSED_TASK_STATUSES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  canTransitionTaskStatus,
  isTaskStatusFinal,
} from "@/models/task-status.js";

describe("models/task-status.js", () => {
  test("declara um rótulo em português para cada status", () => {
    expect(Object.keys(TASK_STATUS_LABELS).sort()).toEqual(
      [...TASK_STATUSES].sort(),
    );
  });

  // A ordem é de apresentação: é nela que os menus e os filtros da tela
  // de Tarefas aparecem, seguindo o fluxo comum do começo ao fim.
  test("mantém a ordem de apresentação do fluxo", () => {
    expect(TASK_STATUSES).toEqual([
      "PENDING",
      "IN_PROGRESS",
      "FINISHING",
      "COMPLETED",
      "CANCELLED",
    ]);
  });

  describe(".canTransitionTaskStatus()", () => {
    // Enquanto a tarefa está aberta ela anda para qualquer lado,
    // inclusive para trás. Quem errou o clique corrige na hora.
    test("aceita qualquer transição a partir de um status aberto", () => {
      const abertos = TASK_STATUSES.filter(
        (status) => !CLOSED_TASK_STATUSES.includes(status),
      );

      expect(abertos).toEqual(["PENDING", "IN_PROGRESS", "FINISHING"]);

      for (const from of abertos) {
        for (const to of TASK_STATUSES) {
          expect(canTransitionTaskStatus(from, to)).toBe(true);
        }
      }
    });

    test("deixa voltar de em finalização", () => {
      expect(canTransitionTaskStatus("FINISHING", "IN_PROGRESS")).toBe(true);
      expect(canTransitionTaskStatus("FINISHING", "PENDING")).toBe(true);
    });

    test("não deixa uma tarefa encerrada ir para nenhum outro status", () => {
      for (const from of CLOSED_TASK_STATUSES) {
        for (const to of TASK_STATUSES.filter((status) => status !== from)) {
          expect(canTransitionTaskStatus(from, to)).toBe(false);
        }
      }
    });

    // Sem isto, reenviar o mesmo PATCH viraria erro e um retry inocente
    // quebraria.
    test("aceita permanecer no mesmo status, inclusive nas encerradas", () => {
      for (const status of TASK_STATUSES) {
        expect(canTransitionTaskStatus(status, status)).toBe(true);
      }
    });
  });

  describe(".isTaskStatusFinal()", () => {
    test("trata concluída e cancelada como definitivas", () => {
      expect(isTaskStatusFinal("COMPLETED")).toBe(true);
      expect(isTaskStatusFinal("CANCELLED")).toBe(true);
    });

    test("não trava nenhum status aberto", () => {
      expect(isTaskStatusFinal("PENDING")).toBe(false);
      expect(isTaskStatusFinal("IN_PROGRESS")).toBe(false);
      expect(isTaskStatusFinal("FINISHING")).toBe(false);
    });
  });

  describe("CLOSED_TASK_STATUSES", () => {
    test("cobre concluída e cancelada", () => {
      expect(CLOSED_TASK_STATUSES).toEqual(["COMPLETED", "CANCELLED"]);
    });

    test("não inclui 'em finalização' — ela ainda tem prazo a cumprir", () => {
      expect(CLOSED_TASK_STATUSES).not.toContain("FINISHING");
    });

    // Guarda contra as duas leituras se separarem sem querer: hoje quem
    // deixou de contar prazo é exatamente quem não muda mais de status.
    test("casa com o que trava o status", () => {
      for (const status of TASK_STATUSES) {
        expect(isTaskStatusFinal(status)).toBe(
          CLOSED_TASK_STATUSES.includes(status),
        );
      }
    });
  });
});
