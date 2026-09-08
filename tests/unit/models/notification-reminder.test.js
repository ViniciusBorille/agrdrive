import {
  DAYS,
  HOURS,
  describeSchedule,
  humanizeOffset,
  minutesToParts,
  partsToMinutes,
} from "@/models/notification-reminder.js";

describe("models/notification-reminder.js", () => {
  describe(".humanizeOffset()", () => {
    test("fala em dias, horas ou minutos conforme o valor", () => {
      expect(humanizeOffset(1440)).toBe("1 dia");
      expect(humanizeOffset(4320)).toBe("3 dias");
      expect(humanizeOffset(60)).toBe("1 hora");
      expect(humanizeOffset(120)).toBe("2 horas");
      expect(humanizeOffset(90)).toBe("90 minutos");
    });
  });

  describe("conversão entre a API e a tela", () => {
    // Ninguém configura "4320 minutos antes", mas é isso que a API guarda.
    test("escolhe a maior unidade que representa o valor sem resto", () => {
      expect(minutesToParts(4320)).toEqual({ value: 3, unit: DAYS });
      expect(minutesToParts(1440)).toEqual({ value: 1, unit: DAYS });
      expect(minutesToParts(120)).toEqual({ value: 2, unit: HOURS });
      expect(minutesToParts(60)).toEqual({ value: 1, unit: HOURS });
    });

    test("volta para minutos", () => {
      expect(partsToMinutes(3, DAYS)).toBe(4320);
      expect(partsToMinutes(2, HOURS)).toBe(120);
    });

    // É aqui que nasceria o bug de "coloquei 3 dias e chegou em 3 horas".
    test("ida e volta preserva o valor", () => {
      for (const minutes of [60, 120, 1440, 2880, 4320, 10080, 43200]) {
        const parts = minutesToParts(minutes);
        expect(partsToMinutes(parts.value, parts.unit)).toBe(minutes);
      }
    });

    test("recusa entrada que não vira antecedência", () => {
      expect(partsToMinutes("", DAYS)).toBeNull();
      expect(partsToMinutes(0, DAYS)).toBeNull();
      expect(partsToMinutes(-3, DAYS)).toBeNull();
      expect(partsToMinutes("abc", HOURS)).toBeNull();
    });
  });

  describe(".describeSchedule()", () => {
    // A frase é como o usuário confere que entendeu a própria configuração
    // antes de salvar.
    test("lista as antecedências em português, da mais distante à mais próxima", () => {
      expect(
        describeSchedule({
          enabled: true,
          reminders: [1440, 10080, 4320],
          sendAtTime: "08:00",
        }),
      ).toBe("Você receberá 3 avisos: 7 dias, 3 dias e 1 dia antes, às 08:00.");
    });

    test("concorda o singular com um aviso só", () => {
      expect(
        describeSchedule({
          enabled: true,
          reminders: [1440],
          sendAtTime: "07:00",
        }),
      ).toBe("Você receberá 1 aviso: 1 dia antes, às 07:00.");
    });

    test("desligado diz que não vai receber", () => {
      expect(
        describeSchedule({
          enabled: false,
          reminders: [1440],
          sendAtTime: "08:00",
        }),
      ).toBe("Você não receberá este aviso.");
    });

    test("tipo imediato não fala em antecedência", () => {
      expect(describeSchedule({ enabled: true, immediate: true })).toBe(
        "Você receberá este aviso assim que acontecer.",
      );
    });

    // Ligado e sem nenhum aviso é o estado que a API recusa; a tela precisa
    // dizer isso antes de o usuário tentar salvar.
    test("ligado e sem aviso orienta o que fazer", () => {
      expect(
        describeSchedule({ enabled: true, reminders: [], sendAtTime: "08:00" }),
      ).toBe("Escolha pelo menos um aviso ou desligue este tipo.");
    });
  });
});
