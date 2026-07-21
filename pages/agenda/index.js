import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR, { mutate } from "swr";
import Shell from "@/components/Shell";

const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("error");
    return r.json();
  });

const EVENT_TYPES = {
  MONITORAMENTO: { label: "Monitoramento", tone: "#1f8069" },
  APLICACAO: { label: "Aplicação", tone: "#2b7a78" },
  COMERCIAL: { label: "Reunião comercial", tone: "#c9a41f" },
  PROSPECCAO: { label: "Prospecção", tone: "#3a7ca5" },
  COLETA: { label: "Coleta", tone: "#1f8069" },
  OUTRO: { label: "Outro", tone: "#8a938e" },
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function invalidateVisits() {
  mutate(
    (key) => typeof key === "string" && key.includes("/api/v1/visits"),
    undefined,
    { revalidate: true },
  );
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function dstr(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return dstr(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return dstr(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}
function todayStr() {
  const d = new Date();
  return dstr(d.getFullYear(), d.getMonth(), d.getDate());
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildMonthGrid(year, month, visits, selectedDate, today) {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const ds = dstr(d.getFullYear(), d.getMonth(), d.getDate());
    const dayVisits = visits
      .filter((v) => v.event_date === ds)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    days.push({
      dateStr: ds,
      dayNum: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: ds === today,
      isSelected: ds === selectedDate,
      shown: dayVisits.slice(0, 2),
      hasMore: dayVisits.length > 2,
      moreCount: Math.max(0, dayVisits.length - 2),
    });
  }
  return days;
}

function ViewTab({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        height: 32,
        padding: "0 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        color: "#3a443f",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,.12)",
          }}
        />
      )}
      <span style={{ position: "relative" }}>{label}</span>
    </button>
  );
}

function VisitModal({ visit, defaultDate, googleConnected, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: visit?.title ?? "",
    client: visit?.client ?? "",
    event_date: visit?.event_date ?? defaultDate,
    start_time: visit?.start_time?.slice(0, 5) ?? "09:00",
    end_time: visit?.end_time?.slice(0, 5) ?? "10:00",
    type: visit?.type ?? "MONITORAMENTO",
    sync: visit ? visit.synced : googleConnected,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Informe um título para a visita.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        client: form.client.trim() || null,
        event_date: form.event_date,
        start_time: form.start_time,
        end_time: form.end_time,
        type: form.type,
        sync: form.sync,
      };
      const res = await fetch(
        visit ? `/api/v1/visits/${visit.id}` : "/api/v1/visits",
        {
          method: visit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Erro ao salvar visita.");
        return;
      }
      invalidateVisits();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/visits/${visit.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Erro ao excluir visita.");
        return;
      }
      invalidateVisits();
      onSaved();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,40,33,.42)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 20px",
        zIndex: 50,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 24px 60px rgba(0,0,0,.25)",
          animation: "agScale .22s ease both",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 24px",
            borderBottom: "1px solid #eef1ef",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#e6f1ea",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1c6856"
                strokeWidth="2"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
              {visit ? "Editar visita" : "Nova visita"}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              color: "#8a938e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: "22px 24px" }}>
          {error && (
            <div
              style={{
                fontSize: 13,
                color: "#c0392b",
                background: "#fdf0ef",
                borderRadius: 9,
                padding: "9px 12px",
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#3a443f",
              marginBottom: 7,
            }}
          >
            Título *
          </label>
          <input
            ref={titleRef}
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="Ex.: Monitoramento de soja"
            style={{
              width: "100%",
              height: 44,
              border: "1.5px solid #dde4e0",
              borderRadius: 11,
              padding: "0 13px",
              fontSize: 14,
              outline: "none",
              marginBottom: 16,
            }}
          />

          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#3a443f",
              marginBottom: 7,
            }}
          >
            Cliente / Fazenda
          </label>
          <input
            value={form.client}
            onChange={(e) => setField("client", e.target.value)}
            placeholder="Ex.: Fazenda Santa Rita"
            style={{
              width: "100%",
              height: 44,
              border: "1.5px solid #dde4e0",
              borderRadius: 11,
              padding: "0 13px",
              fontSize: 14,
              outline: "none",
              marginBottom: 16,
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 13,
              marginBottom: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#3a443f",
                  marginBottom: 7,
                }}
              >
                Data
              </label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setField("event_date", e.target.value)}
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #dde4e0",
                  borderRadius: 11,
                  padding: "0 10px",
                  fontSize: 13.5,
                  outline: "none",
                  color: "#3a443f",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#3a443f",
                  marginBottom: 7,
                }}
              >
                Início
              </label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setField("start_time", e.target.value)}
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #dde4e0",
                  borderRadius: 11,
                  padding: "0 10px",
                  fontSize: 13.5,
                  outline: "none",
                  color: "#3a443f",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#3a443f",
                  marginBottom: 7,
                }}
              >
                Fim
              </label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setField("end_time", e.target.value)}
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #dde4e0",
                  borderRadius: 11,
                  padding: "0 10px",
                  fontSize: 13.5,
                  outline: "none",
                  color: "#3a443f",
                }}
              />
            </div>
          </div>

          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#3a443f",
              marginBottom: 7,
            }}
          >
            Tipo
          </label>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <select
              value={form.type}
              onChange={(e) => setField("type", e.target.value)}
              style={{
                width: "100%",
                height: 44,
                border: "1.5px solid #dde4e0",
                borderRadius: 11,
                padding: "0 34px 0 13px",
                fontSize: 14,
                background: "#fff",
                outline: "none",
                appearance: "none",
                cursor: "pointer",
                color: "#3a443f",
              }}
            >
              {Object.entries(EVENT_TYPES).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "12px 14px",
              border: "1.5px solid #e6ece8",
              borderRadius: 11,
              cursor: googleConnected ? "pointer" : "not-allowed",
              opacity: googleConnected ? 1 : 0.55,
            }}
          >
            <input
              type="checkbox"
              checked={form.sync}
              disabled={!googleConnected}
              onChange={(e) => setField("sync", e.target.checked)}
              style={{ width: 17, height: 17, accentColor: "#1c6856" }}
            />
            <span style={{ fontSize: 13.5, color: "#3a443f" }}>
              {googleConnected
                ? "Sincronizar com o Google Calendar"
                : "Conecte o Google Calendar para sincronizar"}
            </span>
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "18px 24px",
            borderTop: "1px solid #eef1ef",
            background: "#fafbfa",
            borderRadius: "0 0 18px 18px",
          }}
        >
          {visit ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                height: 42,
                padding: "0 16px",
                borderRadius: 11,
                fontSize: 13.5,
                fontWeight: 600,
                color: "#c0392b",
                border: "1.5px solid #f0d7d5",
                background: "#fff",
              }}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 11,
                fontSize: 13.5,
                fontWeight: 600,
                color: "#5a635e",
                border: "1.5px solid #dde4e0",
                background: "#fff",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                height: 42,
                padding: "0 20px",
                borderRadius: 11,
                fontSize: 13.5,
                fontWeight: 600,
                color: "#fff",
                background: "#1c6856",
                boxShadow: "0 4px 12px rgba(28,104,86,.22)",
              }}
            >
              {saving ? "Salvando..." : visit ? "Salvar" : "Agendar visita"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Agenda() {
  const router = useRouter();
  const today = todayStr();

  const [view, setView] = useState("month");
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSelectedDate, setCalSelectedDate] = useState(today);
  const [showModal, setShowModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [modalDate, setModalDate] = useState(today);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const { data: visits } = useSWR("/api/v1/visits", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: googleStatus, mutate: mutateGoogleStatus } = useSWR(
    "/api/v1/google-calendar",
    fetcher,
    { revalidateOnFocus: false },
  );
  const googleConnected = googleStatus?.connected ?? false;

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.google === "connected") {
      mutateGoogleStatus();
      router.replace("/agenda", undefined, { shallow: true });
      setTimeout(() => flash("Conectado ao Google Calendar."), 0);
    } else if (router.query.google === "error") {
      router.replace("/agenda", undefined, { shallow: true });
      setTimeout(
        () => flash("Não foi possível conectar ao Google Calendar."),
        0,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.google]);

  const openNewVisitModal = (date) => {
    setEditingVisit(null);
    setModalDate(date || calSelectedDate);
    setShowModal(true);
  };
  const openEditVisitModal = (visit) => {
    setEditingVisit(visit);
    setModalDate(visit.event_date);
    setShowModal(true);
  };
  const closeModal = () => setShowModal(false);
  const handleSaved = () => {
    setShowModal(false);
    flash(
      editingVisit
        ? "Visita atualizada com sucesso."
        : "Visita agendada com sucesso.",
    );
  };

  const disconnectGoogle = async () => {
    await fetch("/api/v1/google-calendar/disconnect", { method: "POST" });
    mutateGoogleStatus();
    flash("Google Calendar desconectado.");
  };
  const syncNow = async () => {
    const res = await fetch("/api/v1/google-calendar/sync", {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    invalidateVisits();

    const parts = [];
    if (data.synced) parts.push(`${data.synced} enviada(s) ao Google`);
    if (data.imported) parts.push(`${data.imported} importada(s) do Google`);

    flash(
      parts.length > 0
        ? `Sincronizado: ${parts.join(", ")}.`
        : "Tudo já sincronizado com o Google Calendar.",
    );
  };

  const visitList = visits || [];
  const monthGrid = buildMonthGrid(
    calYear,
    calMonth,
    visitList,
    calSelectedDate,
    today,
  );
  const monthLabelRaw = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
  }).format(new Date(calYear, calMonth, 1));
  const monthLabel = `${capitalize(monthLabelRaw)} ${calYear}`;

  const selectedDayVisits = visitList
    .filter((v) => v.event_date === calSelectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const selectedDayLabelRaw = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(calSelectedDate + "T00:00:00"));
  const selectedDayLabel = capitalize(selectedDayLabelRaw);

  const weekStart = startOfWeek(calSelectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const ds = addDays(weekStart, i);
    const d = new Date(ds + "T00:00:00");
    const wdRaw = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
      .format(d)
      .replace(".", "");
    const dayVisits = visitList
      .filter((v) => v.event_date === ds)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    return {
      dateStr: ds,
      dayNum: d.getDate(),
      weekdayShort: capitalize(wdRaw),
      isToday: ds === today,
      events: dayVisits,
    };
  });
  const weekRangeLabel = `${weekDays[0].dayNum} — ${weekDays[6].dayNum} de ${monthLabel}`;

  const prevMonth = () =>
    setCalMonth((m) => {
      if (m === 0) {
        setCalYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  const nextMonth = () =>
    setCalMonth((m) => {
      if (m === 11) {
        setCalYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  const prevWeek = () => setCalSelectedDate((d) => addDays(d, -7));
  const nextWeek = () => setCalSelectedDate((d) => addDays(d, 7));

  return (
    <>
      <Head>
        <title>Agenda de campo · AgrDrive</title>
      </Head>
      <Shell requireFeature="use:agenda">
        {() => (
          <div style={{ maxWidth: 1240, margin: "0 auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div>
                <h1
                  style={{ fontSize: 23, fontWeight: 600, margin: "0 0 3px" }}
                >
                  Agenda de campo
                </h1>
                <p style={{ fontSize: 13.5, color: "#6b7670", margin: 0 }}>
                  Visitas, monitoramentos e reuniões da equipe
                </p>
              </div>
              <button
                onClick={() => openNewVisitModal(calSelectedDate)}
                style={{
                  height: 42,
                  background: "#1c6856",
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 600,
                  borderRadius: 11,
                  padding: "0 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  boxShadow: "0 4px 12px rgba(28,104,86,.2)",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nova visita
              </button>
            </div>

            {googleConnected ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#fff",
                  border: "1px solid #e6ece8",
                  borderRadius: 14,
                  padding: "13px 18px",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    background: "#eef3f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <GoogleIcon size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "#2c6e49",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#34a853",
                      }}
                    />
                    Sincronizado com o Google Calendar
                  </div>
                </div>
                <button
                  onClick={syncNow}
                  style={{
                    height: 36,
                    padding: "0 14px",
                    borderRadius: 9,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#1c6856",
                    border: "1.5px solid #d7e0db",
                    background: "#fff",
                  }}
                >
                  Sincronizar agora
                </button>
                <button
                  onClick={disconnectGoogle}
                  style={{
                    height: 36,
                    padding: "0 14px",
                    borderRadius: 9,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#a9423a",
                    background: "transparent",
                  }}
                >
                  Desconectar
                </button>
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  background: "#e3e9e5",
                  borderRadius: 11,
                  padding: 4,
                  gap: 0,
                }}
              >
                <ViewTab
                  active={view === "month"}
                  onClick={() => setView("month")}
                  label="Mês"
                />
                <ViewTab
                  active={view === "semana"}
                  onClick={() => setView("semana")}
                  label="Semana"
                />
              </div>
              {view === "month" ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginLeft: 6,
                  }}
                >
                  <NavArrowButton onClick={prevMonth} direction="left" />
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      minWidth: 150,
                      textAlign: "center",
                    }}
                  >
                    {monthLabel}
                  </div>
                  <NavArrowButton onClick={nextMonth} direction="right" />
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginLeft: 6,
                  }}
                >
                  <NavArrowButton onClick={prevWeek} direction="left" />
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      minWidth: 170,
                      textAlign: "center",
                    }}
                  >
                    {weekRangeLabel}
                  </div>
                  <NavArrowButton onClick={nextWeek} direction="right" />
                </div>
              )}
              {!googleConnected && (
                <button
                  onClick={() =>
                    (window.location.href = "/api/v1/google-calendar/connect")
                  }
                  style={{
                    marginLeft: "auto",
                    height: 36,
                    padding: "0 15px",
                    borderRadius: 9,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#3a443f",
                    border: "1.5px solid #e6ece8",
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <GoogleIcon size={15} />
                  Conectar ao Google Calendar
                </button>
              )}
            </div>

            {view === "month" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.7fr 1fr",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    background: "#e6ece8",
                    border: "1px solid #e6ece8",
                    borderRadius: 16,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7,1fr)",
                      gap: 1,
                      background: "#e6ece8",
                    }}
                  >
                    {WEEKDAY_LABELS.map((wl) => (
                      <div
                        key={wl}
                        style={{
                          background: "#f6f8f7",
                          padding: "10px 0",
                          textAlign: "center",
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: "#8a938e",
                          textTransform: "uppercase",
                          letterSpacing: ".3px",
                        }}
                      >
                        {wl}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7,1fr)",
                      gap: 1,
                      background: "#e6ece8",
                    }}
                  >
                    {monthGrid.map((day) => (
                      <div
                        key={day.dateStr}
                        onClick={() => setCalSelectedDate(day.dateStr)}
                        style={{
                          position: "relative",
                          background: day.isSelected ? "#eef6f1" : "#fff",
                          boxShadow: day.isSelected
                            ? "inset 0 0 0 2px #1c6856"
                            : "none",
                          minHeight: 96,
                          padding: 8,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: day.isToday ? 700 : 500,
                              color: !day.inMonth
                                ? "#c3cac5"
                                : day.isToday
                                  ? "#fff"
                                  : "#3a443f",
                              background: day.isToday
                                ? "#1c6856"
                                : "transparent",
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {day.dayNum}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                            marginTop: 4,
                          }}
                        >
                          {day.shown.map((ev) => (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditVisitModal(ev);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                background: `${EVENT_TYPES[ev.type].tone}17`,
                                borderRadius: 5,
                                padding: "2px 6px",
                                overflow: "hidden",
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: EVENT_TYPES[ev.type].tone,
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#3a443f",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {ev.title}
                              </span>
                            </div>
                          ))}
                          {day.hasMore && (
                            <div
                              style={{
                                fontSize: 10.5,
                                color: "#8a938e",
                                padding: "1px 6px",
                                fontWeight: 600,
                              }}
                            >
                              +{day.moreCount} mais
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #e6ece8",
                    borderRadius: 16,
                    padding: 18,
                    alignSelf: "start",
                  }}
                >
                  <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}
                  >
                    {selectedDayLabel}
                  </div>
                  {calSelectedDate === today && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#1c6856",
                        fontWeight: 600,
                        marginBottom: 14,
                      }}
                    >
                      Hoje
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginTop: 10,
                      marginBottom: 14,
                    }}
                  >
                    {selectedDayVisits.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "24px 8px",
                          color: "#8a938e",
                          fontSize: 13,
                        }}
                      >
                        Nenhum compromisso neste dia.
                      </div>
                    )}
                    {selectedDayVisits.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => openEditVisitModal(ev)}
                        style={{
                          display: "flex",
                          gap: 11,
                          padding: 11,
                          border: "1px solid #eef1ef",
                          borderRadius: 11,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            width: 3,
                            borderRadius: 3,
                            background: EVENT_TYPES[ev.type].tone,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#3a443f",
                            }}
                          >
                            {ev.start_time.slice(0, 5)}–
                            {ev.end_time.slice(0, 5)}
                          </div>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              marginTop: 3,
                            }}
                          >
                            {ev.title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#8a938e",
                              marginTop: 2,
                            }}
                          >
                            {ev.client || "Sem cliente"}
                          </div>
                        </div>
                        <div
                          style={{
                            flexShrink: 0,
                            alignSelf: "flex-start",
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 6,
                            background: ev.synced ? "#e6f1ea" : "#f0f1f1",
                            color: ev.synced ? "#2c6e49" : "#8a8f8c",
                          }}
                        >
                          {ev.synced ? "Sincronizado" : "Local"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => openNewVisitModal(calSelectedDate)}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#1c6856",
                      border: "1.5px dashed #b9d1c5",
                      background: "#f6faf8",
                    }}
                  >
                    + Nova visita neste dia
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {weekDays.map((d) => (
                  <div
                    key={d.dateStr}
                    style={{
                      background: "#fff",
                      border: "1px solid #e6ece8",
                      borderRadius: 14,
                      padding: "14px 16px",
                      display: "flex",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{ width: 56, flexShrink: 0, textAlign: "center" }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto",
                          background: d.isToday ? "#1c6856" : "transparent",
                          color: d.isToday ? "#fff" : "#3a443f",
                        }}
                      >
                        {d.dayNum}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#8a938e",
                          fontWeight: 600,
                          marginTop: 4,
                        }}
                      >
                        {d.weekdayShort}
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      {d.events.length === 0 && (
                        <div style={{ fontSize: 12.5, color: "#b3b8b5" }}>
                          Sem compromissos
                        </div>
                      )}
                      {d.events.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => openEditVisitModal(ev)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: EVENT_TYPES[ev.type].tone,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: "#5a635e",
                              width: 92,
                              flexShrink: 0,
                            }}
                          >
                            {ev.start_time.slice(0, 5)}–
                            {ev.end_time.slice(0, 5)}
                          </span>
                          <span
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {ev.title}
                          </span>
                          <span
                            style={{
                              fontSize: 12.5,
                              color: "#8a938e",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            · {ev.client || "Sem cliente"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => openNewVisitModal(d.dateStr)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        color: "#8a938e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        alignSelf: "center",
                      }}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.3"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showModal && (
              <VisitModal
                visit={editingVisit}
                defaultDate={modalDate}
                googleConnected={googleConnected}
                onClose={closeModal}
                onSaved={handleSaved}
              />
            )}

            {toast && (
              <div
                style={{
                  position: "fixed",
                  bottom: 24,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#1c2b25",
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 500,
                  padding: "13px 20px",
                  borderRadius: 12,
                  boxShadow: "0 12px 30px rgba(0,0,0,.28)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  zIndex: 60,
                  animation: "agToast .25s ease both",
                }}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ebc22f"
                  strokeWidth="2.4"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {toast}
              </div>
            )}
          </div>
        )}
      </Shell>
    </>
  );
}

function NavArrowButton({ onClick, direction }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        border: "1.5px solid #e6ece8",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#5a635e",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
      >
        <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}

function GoogleIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.67-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.5 6.5 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.16-3.16C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
