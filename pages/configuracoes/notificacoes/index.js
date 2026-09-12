import { useState } from "react";
import Head from "next/head";
import useSWR from "swr";
import Shell from "@/components/Shell";
import {
  DAYS,
  HOURS,
  describeSchedule,
  minutesToParts,
  partsToMinutes,
} from "@/models/notification-reminder.js";

const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("error");
    return r.json();
  });

// Cada linha precisa de uma identidade estável: usar o índice como chave
// faria o React reaproveitar o input errado ao remover um aviso do meio.
let nextRowId = 0;
function toRows(reminders) {
  return reminders.map((minutes) => ({
    id: (nextRowId += 1),
    ...minutesToParts(minutes),
  }));
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 25,
        borderRadius: 999,
        border: "none",
        padding: 3,
        cursor: "pointer",
        background: checked ? "#1c6856" : "#cfd8d3",
        display: "flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        transition: "background .15s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: "50%",
          background: "#fff",
          display: "block",
        }}
      />
    </button>
  );
}

function ReminderRow({ row, onChange, onRemove, canRemove }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="number"
        min="1"
        value={row.value}
        aria-label="Quantidade"
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        style={{
          width: 74,
          height: 38,
          borderRadius: 10,
          border: "1.5px solid #dde4e0",
          padding: "0 10px",
          fontSize: 14,
        }}
      />
      <select
        value={row.unit}
        aria-label="Unidade"
        onChange={(e) => onChange({ ...row, unit: e.target.value })}
        style={{
          height: 38,
          borderRadius: 10,
          border: "1.5px solid #dde4e0",
          padding: "0 10px",
          fontSize: 14,
          background: "#fff",
        }}
      >
        <option value={DAYS}>dias antes</option>
        <option value={HOURS}>horas antes</option>
      </select>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="Remover aviso"
        title={
          canRemove
            ? "Remover aviso"
            : "Para não receber, desligue este tipo de notificação"
        }
        style={{
          height: 38,
          width: 38,
          borderRadius: 10,
          border: "1.5px solid #dde4e0",
          background: "#fff",
          color: canRemove ? "#c0392b" : "#c9d0cc",
          cursor: canRemove ? "pointer" : "not-allowed",
          fontSize: 17,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function TypeCard({ preference, onSaved }) {
  const immediate = preference.schedule === "IMMEDIATE";
  const limits = preference.limits;

  const [enabled, setEnabled] = useState(preference.enabled);
  const [sendAtTime, setSendAtTime] = useState(preference.send_at_time);
  const [rows, setRows] = useState(() => toRows(preference.reminders));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const minutes = rows
    .map((row) => partsToMinutes(row.value, row.unit))
    .filter((value) => value !== null);

  const atMaximum = rows.length >= limits.max_reminders;
  const hasDuplicates = new Set(minutes).size !== minutes.length;
  const outOfRange = minutes.some(
    (value) =>
      value < limits.min_offset_minutes || value > limits.max_offset_minutes,
  );
  const incomplete = minutes.length !== rows.length;

  // A tela recusa antes de tentar salvar, com o mesmo critério da API, para
  // o usuário não descobrir o limite por um erro depois do clique.
  const localError = hasDuplicates
    ? "Há avisos repetidos: cada um precisa de uma antecedência diferente."
    : incomplete
      ? "Preencha a quantidade de todos os avisos."
      : outOfRange
        ? `A antecedência precisa ficar entre ${limits.min_offset_minutes / 60} hora(s) e ${limits.max_offset_minutes / 1440} dias.`
        : null;

  const blocked =
    Boolean(localError) || (enabled && !immediate && rows.length === 0);

  function updateRow(updated) {
    setRows(rows.map((row) => (row.id === updated.id ? updated : row)));
    setSaved(false);
  }

  function addRow() {
    setRows([...rows, { id: (nextRowId += 1), value: 1, unit: DAYS }]);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const body = immediate
        ? { enabled }
        : { enabled, send_at_time: sendAtTime, reminders: minutes };

      const response = await fetch(
        `/api/v1/notification-preferences/${preference.type}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const responseBody = await response.json();
        throw new Error(responseBody.message || "Não foi possível salvar.");
      }

      setSaved(true);
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1.5px solid #e6ece8",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {preference.label}
          </div>
          <div style={{ fontSize: 13, color: "#5a635e", marginTop: 3 }}>
            {preference.description}
          </div>
        </div>
        <Toggle
          checked={enabled}
          label={`Ativar ${preference.label}`}
          onChange={(value) => {
            setEnabled(value);
            setSaved(false);
          }}
        />
      </div>

      {enabled && !immediate && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderTop: "1px solid #f2f5f3",
            paddingTop: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".7px",
                color: "#9aa39e",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Avisos
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((row) => (
                <ReminderRow
                  key={row.id}
                  row={row}
                  onChange={updateRow}
                  canRemove={rows.length > 1}
                  onRemove={() => {
                    setRows(rows.filter((item) => item.id !== row.id));
                    setSaved(false);
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addRow}
              disabled={atMaximum}
              style={{
                marginTop: 10,
                height: 36,
                padding: "0 14px",
                borderRadius: 10,
                border: "1.5px dashed #cfd8d3",
                background: "transparent",
                color: atMaximum ? "#a9b2ad" : "#1c6856",
                fontSize: 13,
                fontWeight: 600,
                cursor: atMaximum ? "not-allowed" : "pointer",
              }}
            >
              + Adicionar aviso
            </button>

            {/* O motivo fica visível, senão o botão desabilitado vira um
                mistério. */}
            {atMaximum && (
              <span style={{ fontSize: 12, color: "#8a938e", marginLeft: 10 }}>
                Máximo de {limits.max_reminders} avisos por tipo.
              </span>
            )}
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".7px",
                color: "#9aa39e",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Hora do envio
            </div>
            <input
              type="time"
              value={sendAtTime}
              aria-label="Hora do envio"
              onChange={(e) => {
                setSendAtTime(e.target.value);
                setSaved(false);
              }}
              style={{
                height: 38,
                borderRadius: 10,
                border: "1.5px solid #dde4e0",
                padding: "0 10px",
                fontSize: 14,
              }}
            />
            <div style={{ fontSize: 12, color: "#8a938e", marginTop: 6 }}>
              Vale para avisos de um dia ou mais. Abaixo disso, o aviso sai na
              hora exata da antecedência.
            </div>
          </div>
        </div>
      )}

      {/* Como o usuário confere que entendeu a própria configuração antes
          de salvar. */}
      <div
        style={{
          fontSize: 13,
          color: blocked ? "#c0392b" : "#2c6e49",
          background: blocked ? "#fdf1f0" : "#f1f7f3",
          border: `1px solid ${blocked ? "#f3d6d2" : "#dcebe2"}`,
          borderRadius: 10,
          padding: "9px 12px",
        }}
      >
        {localError ??
          describeSchedule({
            enabled,
            reminders: minutes,
            sendAtTime,
            immediate,
          })}
      </div>

      {error && <div style={{ fontSize: 13, color: "#c0392b" }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || blocked}
          style={{
            height: 40,
            padding: "0 20px",
            borderRadius: 11,
            border: "none",
            background: blocked ? "#a9b2ad" : "#1c6856",
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: saving || blocked ? "not-allowed" : "pointer",
            opacity: saving ? 0.65 : 1,
          }}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {saved && !saving && (
          <span style={{ fontSize: 13, color: "#2c6e49" }}>
            Preferências salvas.
          </span>
        )}
      </div>
    </div>
  );
}

export default function NotificacoesPage() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/v1/notification-preferences",
    fetcher,
    { revalidateOnFocus: false },
  );

  return (
    <Shell>
      <Head>
        <title>Notificações · AgrDrive</title>
      </Head>

      {/* O teto de largura não é enfeite: sem ele, num monitor largo cada
          cartão viraria uma faixa de mil pixels para abrigar um campo de
          número e um select de 130. Em 1180 cabem três colunas de ~380,
          que é o tamanho em que o conteúdo do cartão respira. */}
      <div
        style={{
          maxWidth: 1180,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <p style={{ fontSize: 13.5, color: "#5a635e", margin: 0 }}>
          Escolha o que chega no seu e-mail de cadastro e com quanta
          antecedência.
        </p>

        {isLoading && (
          <div style={{ fontSize: 13.5, color: "#8a938e" }}>Carregando...</div>
        )}

        {error && (
          <div style={{ fontSize: 13.5, color: "#c0392b" }}>
            Não foi possível carregar suas preferências. Tente recarregar a
            página.
          </div>
        )}

        {/* Sem módulo que gere aviso, não há o que configurar — e dizer isso
            é melhor que mostrar uma tela vazia. */}
        {data?.length === 0 && (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1.5px solid #e6ece8",
              padding: "26px 22px",
              textAlign: "center",
              color: "#5a635e",
              fontSize: 13.5,
            }}
          >
            Você ainda não tem módulos que gerem notificação. Peça acesso a
            Tarefas ou à Agenda de campo para configurar seus avisos.
          </div>
        )}

        {/* Lado a lado, para a configuração inteira caber numa tela só —
            empilhados, comparar "quando chega o aviso de tarefa" com "quando
            chega o da agenda" exigia rolar.

            `auto-fit` com `minmax` em vez de um número fixo de colunas: a
            quantidade de cartões vem da API, e o mínimo de 320px é o que o
            conteúdo do cartão precisa (quantidade + unidade + remover, mais
            o respiro das bordas). Abaixo disso a grade cai sozinha para uma
            coluna, que é o comportamento certo no celular.

            O `min(320px, 100%)` existe porque num celular estreito a área
            útil fica menor que 320: sem ele a coluna continuaria com 320 e
            o cartão vazaria para fora da própria grade.

            `alignItems: start` porque os cartões têm alturas muito
            diferentes — o de tarefa atribuída não tem lembretes para
            configurar. Esticados, ele viraria um retângulo com um vazio
            embaixo do botão. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
            gap: 14,
            alignItems: "start",
          }}
        >
          {/* A tela não conhece a lista de tipos: ela desenha o que a API
              devolver. Acrescentar um tipo no catálogo não exige mexer aqui. */}
          {data?.map((preference) => (
            <TypeCard
              key={preference.type}
              preference={preference}
              onSaved={mutate}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}
