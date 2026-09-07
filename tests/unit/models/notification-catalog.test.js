import {
  BEFORE_EVENT,
  IMMEDIATE,
  canUserReceive,
  findNotificationType,
  isKnownNotificationType,
  isScheduled,
  listNotificationTypes,
  listNotificationTypesForUser,
} from "@/models/notification-catalog.js";

function userWith(features) {
  return { id: "user-1", features };
}

describe("models/notification-catalog.js", () => {
  describe("formato do catálogo", () => {
    test("todo tipo declara feature, agendamento e limites", () => {
      for (const definition of listNotificationTypes()) {
        expect(typeof definition.type).toBe("string");
        expect(typeof definition.label).toBe("string");
        expect(typeof definition.description).toBe("string");
        expect(typeof definition.feature).toBe("string");
        expect([BEFORE_EVENT, IMMEDIATE]).toContain(definition.schedule);
        expect(Array.isArray(definition.defaultOffsets)).toBe(true);
        expect(typeof definition.maxReminders).toBe("number");
      }
    });

    test("os defaults de um tipo agendado respeitam os próprios limites", () => {
      const agendados = listNotificationTypes().filter(
        (d) => d.schedule === BEFORE_EVENT,
      );

      expect(agendados.length).toBeGreaterThan(0);

      for (const definition of agendados) {
        expect(definition.defaultOffsets.length).toBeLessThanOrEqual(
          definition.maxReminders,
        );

        for (const offset of definition.defaultOffsets) {
          expect(offset).toBeGreaterThanOrEqual(definition.minOffsetMinutes);
          expect(offset).toBeLessThanOrEqual(definition.maxOffsetMinutes);
        }
      }
    });

    test("tipo imediato não tem antecedência para configurar", () => {
      const imediato = findNotificationType("TASK_ASSIGNED");

      expect(imediato.schedule).toBe(IMMEDIATE);
      expect(imediato.defaultOffsets).toEqual([]);
      expect(imediato.maxReminders).toBe(0);
    });

    // Devolver o objeto interno deixaria qualquer consumidor corromper o
    // catálogo para todo o processo, e o bug seria silencioso.
    test("não devolve o objeto interno, devolve cópia", () => {
      listNotificationTypes()[0].defaultOffsets.push(999);
      listNotificationTypes()[0].label = "alterado";

      expect(listNotificationTypes()[0].label).not.toBe("alterado");
      expect(listNotificationTypes()[0].defaultOffsets).not.toContain(999);
    });
  });

  describe(".isKnownNotificationType()", () => {
    test("reconhece os tipos do catálogo", () => {
      expect(isKnownNotificationType("TASK_DUE")).toBe(true);
      expect(isKnownNotificationType("VISIT_UPCOMING")).toBe(true);
      expect(isKnownNotificationType("TASK_ASSIGNED")).toBe(true);
    });

    // É o que impede a API de gravar um tipo inventado.
    test("recusa tipo desconhecido", () => {
      expect(isKnownNotificationType("QUALQUER_COISA")).toBe(false);
      expect(isKnownNotificationType("")).toBe(false);
      expect(isKnownNotificationType(undefined)).toBe(false);
    });
  });

  describe(".isScheduled()", () => {
    test("separa agendado de imediato", () => {
      expect(isScheduled("TASK_DUE")).toBe(true);
      expect(isScheduled("VISIT_UPCOMING")).toBe(true);
      expect(isScheduled("TASK_ASSIGNED")).toBe(false);
    });

    test("tipo desconhecido não é agendado", () => {
      expect(isScheduled("INEXISTENTE")).toBe(false);
    });
  });

  describe(".listNotificationTypesForUser()", () => {
    test("quem só tem tarefas não vê o tipo de agenda", () => {
      const tipos = listNotificationTypesForUser(userWith(["use:tasks"])).map(
        (d) => d.type,
      );

      expect(tipos).toEqual(["TASK_DUE", "TASK_ASSIGNED"]);
    });

    test("quem só tem agenda não vê os tipos de tarefa", () => {
      const tipos = listNotificationTypesForUser(userWith(["use:agenda"])).map(
        (d) => d.type,
      );

      expect(tipos).toEqual(["VISIT_UPCOMING"]);
    });

    test("quem tem os dois módulos vê tudo", () => {
      const tipos = listNotificationTypesForUser(
        userWith(["use:tasks", "use:agenda"]),
      ).map((d) => d.type);

      expect(tipos).toEqual(["TASK_DUE", "VISIT_UPCOMING", "TASK_ASSIGNED"]);
    });

    test("quem não tem módulo nenhum não vê tipo nenhum", () => {
      expect(listNotificationTypesForUser(userWith(["read:session"]))).toEqual(
        [],
      );
    });
  });

  describe(".canUserReceive()", () => {
    test("depende da feature do módulo", () => {
      const soTarefas = userWith(["use:tasks"]);

      expect(canUserReceive(soTarefas, "TASK_DUE")).toBe(true);
      expect(canUserReceive(soTarefas, "VISIT_UPCOMING")).toBe(false);
    });

    test("tipo desconhecido nunca pode ser recebido", () => {
      expect(canUserReceive(userWith(["use:tasks"]), "INEXISTENTE")).toBe(
        false,
      );
    });
  });
});
