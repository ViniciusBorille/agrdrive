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
    // Regra única: fora de "concluída", a tarefa anda para qualquer
    // lado, inclusive para trás. Quem errou o clique corrige na hora.
    test("aceita qualquer transição a partir de um status não concluído", () => {
      const abertos = TASK_STATUSES.filter((status) => status !== "COMPLETED");

      for (const from of abertos) {
        for (const to of TASK_STATUSES) {
          expect(canTransitionTaskStatus(from, to)).toBe(true);
        }
      }
    });

    test("deixa voltar de cancelada e de em finalização", () => {
      expect(canTransitionTaskStatus("CANCELLED", "IN_PROGRESS")).toBe(true);
      expect(canTransitionTaskStatus("FINISHING", "IN_PROGRESS")).toBe(true);
      expect(canTransitionTaskStatus("FINISHING", "PENDING")).toBe(true);
    });

    test("não deixa uma tarefa concluída ir para nenhum outro status", () => {
      expect(canTransitionTaskStatus("COMPLETED", "PENDING")).toBe(false);
      expect(canTransitionTaskStatus("COMPLETED", "IN_PROGRESS")).toBe(false);
      expect(canTransitionTaskStatus("COMPLETED", "FINISHING")).toBe(false);
      expect(canTransitionTaskStatus("COMPLETED", "CANCELLED")).toBe(false);
    });

    // Sem isto, reenviar o mesmo PATCH viraria erro e um retry inocente
    // quebraria.
    test("aceita permanecer no mesmo status, inclusive em concluída", () => {
      for (const status of TASK_STATUSES) {
        expect(canTransitionTaskStatus(status, status)).toBe(true);
      }
    });
  });

  describe(".isTaskStatusFinal()", () => {
    test("trata só concluída como definitiva", () => {
      expect(isTaskStatusFinal("COMPLETED")).toBe(true);

      for (const status of TASK_STATUSES.filter((s) => s !== "COMPLETED")) {
        expect(isTaskStatusFinal(status)).toBe(false);
      }
    });
  });

  // Encerrada é sobre prazo, não sobre permissão. Cancelada está nesta
  // lista por um motivo diferente: não atrasa mais, mas ainda muda.
  describe("CLOSED_TASK_STATUSES", () => {
    test("cobre concluída e cancelada", () => {
      expect(CLOSED_TASK_STATUSES).toEqual(["COMPLETED", "CANCELLED"]);
    });

    test("não inclui 'em finalização' — ela ainda tem prazo a cumprir", () => {
      expect(CLOSED_TASK_STATUSES).not.toContain("FINISHING");
    });

    test("deixar de contar prazo não trava o status", () => {
      expect(isTaskStatusFinal("CANCELLED")).toBe(false);
      expect(canTransitionTaskStatus("CANCELLED", "PENDING")).toBe(true);
    });
  });
});
