import database from "@/infra/database.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import visit from "@/models/visit.js";
import { NotFoundError } from "@/infra/errors.js";

// Normaliza o SQL para asserção: o texto das queries é indentado em
// várias linhas e comparar espaço a espaço seria frágil demais.
function queryText(callIndex = 0) {
  return database.query.mock.calls[callIndex][0].text.replace(/\s+/g, " ");
}

function queryValues(callIndex = 0) {
  return database.query.mock.calls[callIndex][0].values;
}

beforeEach(() => {
  database.query.mockReset();
});

describe("models/visit.js", () => {
  describe(".create()", () => {
    test("insere a visita com os valores informados", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "visit-1" }] });

      const created = await visit.create({
        title: "Visita técnica",
        client: "Fazenda Boa Vista",
        event_date: "2026-09-01",
        start_time: "08:00",
        end_time: "09:30",
        type: "VISITA",
        created_by: "user-1",
      });

      expect(created).toEqual({ id: "visit-1" });
      expect(queryValues()).toEqual([
        "Visita técnica",
        "Fazenda Boa Vista",
        "2026-09-01",
        "08:00",
        "09:30",
        "VISITA",
        "user-1",
      ]);
    });

    test("usa null para cliente e OUTRO para tipo quando omitidos", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "visit-1" }] });

      await visit.create({
        title: "Sem cliente",
        event_date: "2026-09-01",
        start_time: "08:00",
        end_time: "09:30",
        created_by: "user-1",
      });

      const values = queryValues();
      expect(values[1]).toBeNull();
      expect(values[5]).toBe("OUTRO");
    });
  });

  describe(".findAll()", () => {
    test("filtra pelo dono e esconde as visitas removidas", async () => {
      database.query.mockResolvedValue({ rows: [] });

      await visit.findAll({ userId: "user-1" });

      expect(queryText()).toContain("created_by = $1 AND deleted_at IS NULL");
      expect(queryText()).not.toContain("BETWEEN");
      expect(queryValues()).toEqual(["user-1"]);
    });

    test("ordena por data e hora de início", async () => {
      database.query.mockResolvedValue({ rows: [] });

      await visit.findAll({ userId: "user-1" });

      expect(queryText()).toContain("ORDER BY event_date ASC, start_time ASC");
    });

    test("aplica a janela de datas quando from e to são informados", async () => {
      database.query.mockResolvedValue({ rows: [] });

      await visit.findAll({
        userId: "user-1",
        from: "2026-08-01",
        to: "2026-09-01",
      });

      expect(queryText()).toContain("event_date BETWEEN $2 AND $3");
      expect(queryValues()).toEqual(["user-1", "2026-08-01", "2026-09-01"]);
    });

    // A janela só vale completa: metade dela produziria um filtro
    // silenciosamente aberto de um dos lados.
    test.each([
      [{ from: "2026-08-01" }, "só from"],
      [{ to: "2026-09-01" }, "só to"],
    ])("ignora a janela quando vem %p (%s)", async (janela) => {
      database.query.mockResolvedValue({ rows: [] });

      await visit.findAll({ userId: "user-1", ...janela });

      expect(queryText()).not.toContain("BETWEEN");
      expect(queryValues()).toEqual(["user-1"]);
    });

    test("devolve as linhas encontradas", async () => {
      database.query.mockResolvedValue({
        rows: [{ id: "visit-1" }, { id: "visit-2" }],
      });

      await expect(visit.findAll({ userId: "user-1" })).resolves.toHaveLength(
        2,
      );
    });
  });

  describe(".findOneById()", () => {
    test("devolve a visita encontrada", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "visit-1" }],
      });

      await expect(visit.findOneById("visit-1")).resolves.toEqual({
        id: "visit-1",
      });
      expect(queryText()).toContain("deleted_at IS NULL");
    });

    test("lança NotFoundError quando não existe ou já foi removida", async () => {
      database.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(visit.findOneById("visit-sumida")).rejects.toThrow(
        expect.objectContaining({
          name: "NotFoundError",
          message: "A visita informada não foi encontrada no sistema.",
        }),
      );
    });
  });

  describe(".update()", () => {
    const currentVisit = {
      id: "visit-1",
      title: "Título antigo",
      client: "Cliente antigo",
      event_date: "2026-09-01",
      start_time: "08:00:00",
      end_time: "09:30:00",
      type: "VISITA",
      synced: false,
      google_event_id: null,
    };

    // O update é total (todas as colunas no SET), então o model precisa
    // reler a visita e mesclar — senão um PATCH parcial apagaria campos.
    test("mescla os valores novos por cima dos atuais", async () => {
      database.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [currentVisit] })
        .mockResolvedValueOnce({
          rows: [{ ...currentVisit, title: "Título novo" }],
        });

      await visit.update("visit-1", { title: "Título novo" });

      expect(queryValues(1)).toEqual([
        "visit-1",
        "Título novo",
        "Cliente antigo",
        "2026-09-01",
        "08:00:00",
        "09:30:00",
        "VISITA",
        false,
        null,
      ]);
    });

    test("grava o vínculo com o Google quando informado", async () => {
      database.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [currentVisit] })
        .mockResolvedValueOnce({ rows: [currentVisit] });

      await visit.update("visit-1", {
        synced: true,
        google_event_id: "evento-1",
      });

      const values = queryValues(1);
      expect(values[7]).toBe(true);
      expect(values[8]).toBe("evento-1");
    });

    test("propaga o NotFoundError quando a visita não existe", async () => {
      database.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        visit.update("visit-sumida", { title: "x" }),
      ).rejects.toThrow(NotFoundError);
      expect(database.query).toHaveBeenCalledTimes(1);
    });
  });

  describe(".remove()", () => {
    // Remoção é lógica: a linha permanece no banco com `deleted_at`
    // preenchido, o que torna um apagamento indevido reversível.
    test("marca deleted_at em vez de apagar a linha", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "visit-1" }],
      });

      await visit.remove("visit-1");

      expect(queryText()).toContain("UPDATE");
      expect(queryText()).toContain("deleted_at = timezone('utc', now())");
      expect(queryText()).not.toContain("DELETE FROM");
    });

    test("devolve a visita removida", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "visit-1" }],
      });

      await expect(visit.remove("visit-1")).resolves.toEqual({ id: "visit-1" });
    });

    test("lança NotFoundError ao remover duas vezes", async () => {
      database.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(visit.remove("visit-1")).rejects.toThrow(NotFoundError);
    });
  });
});
