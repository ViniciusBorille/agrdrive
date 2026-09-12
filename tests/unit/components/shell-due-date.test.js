import { dueDateInputToISO, isoToDueDateInput } from "@/components/Shell";

describe("conversão do prazo entre o seletor de data e o banco", () => {
  describe(".dueDateInputToISO()", () => {
    test("grava o fim do dia escolhido, no fuso local", () => {
      const gravado = new Date(dueDateInputToISO("2026-09-29"));

      expect(gravado.getFullYear()).toBe(2026);
      expect(gravado.getMonth()).toBe(8); // setembro
      expect(gravado.getDate()).toBe(29);
      expect(gravado.getHours()).toBe(23);
      expect(gravado.getMinutes()).toBe(59);
    });

    test("sem prazo devolve null, não string vazia", () => {
      expect(dueDateInputToISO("")).toBeNull();
      expect(dueDateInputToISO(null)).toBeNull();
      expect(dueDateInputToISO(undefined)).toBeNull();
    });
  });

  describe(".isoToDueDateInput()", () => {
    test("sem prazo devolve string vazia, que é o que o input espera", () => {
      expect(isoToDueDateInput(null)).toBe("");
      expect(isoToDueDateInput("")).toBe("");
    });

    // O bug antigo era exatamente este: o formulário fazia
    // `task.due_date.split("T")[0]`, que devolve a data em UTC. Para o fim
    // do dia no Brasil isso já é o dia seguinte, e a data reaparecia
    // trocada ao reabrir o formulário.
    test("devolve a data local escolhida, não a data em UTC", () => {
      const iso = dueDateInputToISO("2026-09-29");

      expect(isoToDueDateInput(iso)).toBe("2026-09-29");
    });
  });

  // A propriedade que precisa valer em qualquer fuso: o que o usuário
  // escolheu é o que ele vê de volta ao reabrir o formulário.
  describe("ida e volta", () => {
    const datas = [
      "2026-01-01",
      "2026-09-29",
      "2026-12-31",
      "2026-02-28",
      "2028-02-29",
    ];

    for (const data of datas) {
      test(`preserva ${data}`, () => {
        expect(isoToDueDateInput(dueDateInputToISO(data))).toBe(data);
      });
    }
  });
});
