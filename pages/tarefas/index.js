import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import useSWR, { mutate } from "swr";
import Shell, { fmtDue, STATUS_META, PRIORITY_META } from "@/components/Shell";

const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("error");
    return r.json();
  });

const AVATAR_COLORS = [
  "#1c6856",
  "#2e7d54",
  "#257a6c",
  "#1a5c4e",
  "#3d6b4f",
  "#2a6640",
];
function avatarBg(username) {
  let h = 0;
  for (let i = 0; i < username.length; i++)
    h = (h ^ username.charCodeAt(i)) & 0xff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function invalidateTasks() {
  mutate(
    (key) => typeof key === "string" && key.includes("/api/v1/tasks"),
    undefined,
    { revalidate: true },
  );
}

function ViewTab({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        height: 32,
        padding: "0 14px",
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

function StatusChipFixed({
  active,
  onClick,
  dot,
  label,
  count,
  activeBg,
  activeBorder,
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 36,
        padding: "0 14px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        border: "1.5px solid #e6ece8",
        background: "#fff",
        color: "#3a443f",
        cursor: "pointer",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            inset: -1.5,
            borderRadius: 10,
            background: activeBg || "#e6f1ea",
            border: `1.5px solid ${activeBorder || "#1c6856"}`,
          }}
        />
      )}
      {dot && (
        <span
          style={{
            position: "relative",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dot,
          }}
        />
      )}
      <span style={{ position: "relative" }}>{label}</span>
      <span style={{ position: "relative", opacity: 0.55, fontWeight: 600 }}>
        {count}
      </span>
    </button>
  );
}

function EditTaskModal({ task, isCreator, onClose }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    status: task.status,
    priority: task.priority,
    due_date: task.due_date ? task.due_date.split("T")[0] : "",
    assignees: task.assignees?.map((a) => a.id) || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { data: users } = useSWR(isCreator ? "/api/v1/users" : null, fetcher);
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleAssignee = (id) =>
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(id)
        ? f.assignees.filter((x) => x !== id)
        : [...f.assignees, id],
    }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Informe um título para a tarefa.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date ? form.due_date + "T00:00:00.000Z" : null,
        ...(isCreator && { assigned_to: form.assignees }),
      };
      const res = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Erro ao salvar tarefa.");
        return;
      }
      invalidateTasks();
      onClose();
    } finally {
      setSaving(false);
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
          maxWidth: 540,
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 24px 60px rgba(0,0,0,.25)",
          animation: "agScale .22s ease both",
        }}
      >
        {/* Header */}
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
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1c6856"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
              Editar tarefa
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

        {/* Body */}
        <div style={{ padding: "22px 24px" }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#3a443f",
              marginBottom: 7,
            }}
          >
            Título da tarefa *
          </label>
          <input
            ref={titleRef}
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
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
            Descrição
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Detalhe o que precisa ser feito..."
            rows={3}
            style={{
              width: "100%",
              border: "1.5px solid #dde4e0",
              borderRadius: 11,
              padding: "11px 13px",
              fontSize: 14,
              outline: "none",
              resize: "none",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          />

          {isCreator && (
            <>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#3a443f",
                  marginBottom: 7,
                }}
              >
                Responsáveis
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  maxHeight: 148,
                  overflowY: "auto",
                  border: "1.5px solid #dde4e0",
                  borderRadius: 11,
                  padding: "10px",
                  marginBottom: 16,
                  minHeight: 52,
                  alignContent: "flex-start",
                }}
              >
                {!users ? (
                  <span
                    style={{
                      fontSize: 13,
                      color: "#9aa39e",
                      lineHeight: "30px",
                    }}
                  >
                    Carregando usuários...
                  </span>
                ) : (
                  users.map((u) => {
                    const sel = form.assignees.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleAssignee(u.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "4px 10px 4px 5px",
                          borderRadius: 20,
                          border: `1.5px solid ${sel ? "#1c6856" : "#dde4e0"}`,
                          background: sel ? "#e6f1ea" : "#fff",
                          cursor: "pointer",
                          fontSize: 13,
                          color: sel ? "#1c6856" : "#3a443f",
                          fontWeight: sel ? 600 : 400,
                          transition: "border-color .15s, background .15s",
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            background: avatarBg(u.username),
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        {u.username}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
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
                Status
              </label>
              <div style={{ position: "relative" }}>
                <select
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
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
                  <option value="PENDING">Pendente</option>
                  <option value="IN_PROGRESS">Em andamento</option>
                  <option value="COMPLETED">Concluída</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8a938e"
                  strokeWidth="2"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
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
                Prioridade
              </label>
              <div style={{ position: "relative" }}>
                <select
                  value={form.priority}
                  onChange={(e) => setField("priority", e.target.value)}
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
                  <option value="LOW">Baixa</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8a938e"
                  strokeWidth="2"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#3a443f",
                marginBottom: 7,
              }}
            >
              Prazo
            </label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setField("due_date", e.target.value)}
              style={{
                width: "100%",
                height: 44,
                border: "1.5px solid #dde4e0",
                borderRadius: 11,
                padding: "0 13px",
                fontSize: 14,
                outline: "none",
                color: "#3a443f",
              }}
            />
          </div>

          {error && (
            <p
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "#c0392b",
                background: "#fdf0ef",
                border: "1px solid #f5c6c2",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "18px 24px",
            borderTop: "1px solid #eef1ef",
            background: "#fafbfa",
            borderRadius: "0 0 18px 18px",
          }}
        >
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
              border: "none",
              opacity: saving ? 0.65 : 1,
            }}
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ t, userId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [editOpen, setEditOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const isCreator = !!userId && t.created_by === userId;
  const isAssignee = !!userId && t.assignees?.some((a) => a.id === userId);
  const canAct = isCreator || isAssignee;

  const sm = STATUS_META[t.status] || STATUS_META.PENDING;
  const pm = PRIORITY_META[t.priority] || PRIORITY_META.MEDIUM;
  const due = fmtDue(t.due_date, t.status);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e) {
      if (
        !menuRef.current?.contains(e.target) &&
        !btnRef.current?.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    }
    function onScroll() {
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

  const openMenu = () => {
    const rect = btnRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMenuOpen((v) => !v);
  };

  const changeStatus = async (status) => {
    if (busy || status === t.status) {
      setMenuOpen(false);
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    try {
      await fetch(`/api/v1/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      invalidateTasks();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!confirm(`Excluir a tarefa "${t.title}"?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/tasks/${t.id}`, { method: "DELETE" });
      invalidateTasks();
    } finally {
      setBusy(false);
    }
  };

  const STATUS_OPTIONS = [
    { value: "PENDING", label: "Pendente", color: "#8a6d0e" },
    { value: "IN_PROGRESS", label: "Em andamento", color: "#2b5f93" },
    { value: "COMPLETED", label: "Concluída", color: "#2c6e49" },
    { value: "CANCELLED", label: "Cancelada", color: "#8a8f8c" },
  ];

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "grid",
          gridTemplateColumns: "2.4fr 1fr 1.2fr 1fr 40px",
          gap: 14,
          padding: "15px 20px",
          borderBottom: "1px solid #f2f5f3",
          alignItems: "center",
          background: busy ? "#f4f7f5" : hovered ? "#f9fbfa" : "transparent",
          transition: "background .12s",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {/* Title + description */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {t.title}
          </div>
          {t.description && (
            <div
              style={{
                fontSize: 12.5,
                color: "#8a938e",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a9b2ad"
                strokeWidth="2"
              >
                <path d="M9 14h6M9 10h6" />
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              {t.description}
            </div>
          )}
          {/* Assignee avatars */}
          {t.assignees?.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
              {t.assignees.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  title={a.username}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: avatarBg(a.username),
                    color: "#fff",
                    fontSize: 8,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    letterSpacing: "0.3px",
                    border: "1.5px solid #fff",
                  }}
                >
                  {a.username.slice(0, 2).toUpperCase()}
                </div>
              ))}
              {t.assignees.length > 5 && (
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#d8dedd",
                    color: "#5a635e",
                    fontSize: 8,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1.5px solid #fff",
                  }}
                >
                  +{t.assignees.length - 5}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Priority */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: pm.dot,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: pm.color, fontWeight: 500 }}>
            {pm.label}
          </span>
        </div>

        {/* Status */}
        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: sm.color,
              background: sm.bg,
              borderRadius: 8,
              padding: "5px 11px",
              whiteSpace: "nowrap",
            }}
          >
            {sm.label}
          </span>
        </div>

        {/* Due date */}
        <div style={{ fontSize: 13, fontWeight: 500, color: due.color }}>
          {due.label}
        </div>

        {/* Actions */}
        <div style={{ position: "relative" }}>
          <button
            ref={btnRef}
            onClick={() => canAct && openMenu()}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              color: canAct ? (menuOpen ? "#1c6856" : "#a9b2ad") : "#d8dedd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: menuOpen ? "#e6f1ea" : "transparent",
              transition: "color .1s, background .1s",
              cursor: canAct ? "pointer" : "default",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuPos.top,
                right: menuPos.right,
                zIndex: 9999,
                background: "#fff",
                border: "1px solid #e6ece8",
                borderRadius: 13,
                boxShadow: "0 8px 28px rgba(0,0,0,.14)",
                minWidth: 210,
                padding: "6px",
              }}
            >
              {/* Status section (assignee or creator) */}
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: ".8px",
                  color: "#9aa39e",
                  textTransform: "uppercase",
                  padding: "5px 10px 3px",
                }}
              >
                Alterar status
              </div>
              {STATUS_OPTIONS.map((opt) => (
                <MenuRow
                  key={opt.value}
                  label={opt.label}
                  checked={t.status === opt.value}
                  checkedColor={opt.color}
                  onClick={() => changeStatus(opt.value)}
                />
              ))}

              {/* Creator actions */}
              {isCreator && (
                <>
                  <div
                    style={{
                      height: 1,
                      background: "#eef1ef",
                      margin: "6px 0",
                    }}
                  />
                  <MenuRow
                    label="Editar tarefa"
                    icon={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    }
                    onClick={() => {
                      setMenuOpen(false);
                      setEditOpen(true);
                    }}
                  />
                  <MenuRow
                    label="Excluir tarefa"
                    icon={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    }
                    red
                    onClick={handleDelete}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <EditTaskModal
          task={t}
          isCreator={isCreator}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function MenuRow({ label, icon, checked, checkedColor, red, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 10px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: checked ? 600 : 500,
        color: red
          ? "#c0392b"
          : checked
            ? checkedColor || "#1c6856"
            : "#3a443f",
        background: hovered ? (red ? "#fdf0ef" : "#f4f7f5") : "transparent",
        transition: "background .1s",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 16,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: red
            ? "#c0392b"
            : checked
              ? checkedColor || "#1c6856"
              : "#9aa39e",
        }}
      >
        {checked ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : icon ? (
          icon
        ) : (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "currentColor",
              display: "inline-block",
            }}
          />
        )}
      </span>
      {label}
    </button>
  );
}

export default function Tarefas() {
  const [fView, setFView] = useState("all");
  const [fStatus, setFStatus] = useState("ALL");
  const [fPriority, setFPriority] = useState("ALL");

  const { data: user } = useSWR("/api/v1/user", fetcher, {
    revalidateOnFocus: false,
  });
  const userId = user?.id;

  const viewKey =
    fView === "all"
      ? "/api/v1/tasks?view=all"
      : fView === "assigned"
        ? "/api/v1/tasks?view=assigned"
        : "/api/v1/tasks?view=created";

  const { data: tasks } = useSWR(viewKey, fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <>
      <Head>
        <title>Tarefas · AgrDrive</title>
      </Head>
      <Shell>
        {({ openModal, searchQuery }) => {
          let filtered = tasks || [];
          if (fStatus !== "ALL")
            filtered = filtered.filter((t) => t.status === fStatus);
          if (fPriority !== "ALL")
            filtered = filtered.filter((t) => t.priority === fPriority);
          if (searchQuery?.trim()) {
            const q = searchQuery.trim().toLowerCase();
            filtered = filtered.filter(
              (t) =>
                t.title.toLowerCase().includes(q) ||
                (t.description || "").toLowerCase().includes(q),
            );
          }
          const ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          filtered = [...filtered].sort(
            (a, b) =>
              ORDER[a.priority] - ORDER[b.priority] ||
              (a.due_date || "").localeCompare(b.due_date || ""),
          );
          const counts = {
            ALL: tasks?.length ?? 0,
            PENDING: tasks?.filter((t) => t.status === "PENDING").length ?? 0,
            IN_PROGRESS:
              tasks?.filter((t) => t.status === "IN_PROGRESS").length ?? 0,
            COMPLETED:
              tasks?.filter((t) => t.status === "COMPLETED").length ?? 0,
            CANCELLED:
              tasks?.filter((t) => t.status === "CANCELLED").length ?? 0,
          };
          return (
            <div style={{ maxWidth: 1240, margin: "0 auto" }}>
              {/* HEADER */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  marginBottom: 20,
                }}
              >
                <div>
                  <h1
                    style={{ fontSize: 23, fontWeight: 600, margin: "0 0 3px" }}
                  >
                    Tarefas
                  </h1>
                  <p style={{ fontSize: 13.5, color: "#6b7670", margin: 0 }}>
                    {filtered.length} tarefa(s) · atribua e acompanhe prazos com
                    a equipe
                  </p>
                </div>
                <NewTaskButton onClick={openModal} />
              </div>

              {/* FILTERS ROW 1: view toggle + priority */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 14,
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
                    active={fView === "all"}
                    onClick={() => setFView("all")}
                    label="Todas"
                  />
                  <ViewTab
                    active={fView === "assigned"}
                    onClick={() => setFView("assigned")}
                    label="Atribuídas a mim"
                  />
                  <ViewTab
                    active={fView === "created"}
                    onClick={() => setFView("created")}
                    label="Criadas por mim"
                  />
                </div>

                <div style={{ position: "relative", marginLeft: "auto" }}>
                  <select
                    value={fPriority}
                    onChange={(e) => setFPriority(e.target.value)}
                    style={{
                      height: 40,
                      border: "1.5px solid #e6ece8",
                      borderRadius: 11,
                      padding: "0 34px 0 13px",
                      fontSize: 13,
                      background: "#fff",
                      color: "#3a443f",
                      outline: "none",
                      appearance: "none",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    <option value="ALL">Todas as prioridades</option>
                    <option value="URGENT">Urgente</option>
                    <option value="HIGH">Alta</option>
                    <option value="MEDIUM">Média</option>
                    <option value="LOW">Baixa</option>
                  </select>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#8a938e"
                    strokeWidth="2"
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                    }}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* FILTERS ROW 2: search + status chips */}
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  flexWrap: "wrap",
                  marginBottom: 16,
                  alignItems: "center",
                }}
              >
                <StatusChipFixed
                  active={fStatus === "ALL"}
                  onClick={() => setFStatus("ALL")}
                  label="Todas"
                  count={counts.ALL}
                  activeBg="#e6f1ea"
                  activeBorder="#1c6856"
                />
                <StatusChipFixed
                  active={fStatus === "PENDING"}
                  onClick={() => setFStatus("PENDING")}
                  dot="#c9a41f"
                  label="Pendentes"
                  count={counts.PENDING}
                  activeBg="#fbf3da"
                  activeBorder="#c9a41f"
                />
                <StatusChipFixed
                  active={fStatus === "IN_PROGRESS"}
                  onClick={() => setFStatus("IN_PROGRESS")}
                  dot="#3a7ca5"
                  label="Em andamento"
                  count={counts.IN_PROGRESS}
                  activeBg="#e6eef6"
                  activeBorder="#3a7ca5"
                />
                <StatusChipFixed
                  active={fStatus === "COMPLETED"}
                  onClick={() => setFStatus("COMPLETED")}
                  dot="#34a853"
                  label="Concluídas"
                  count={counts.COMPLETED}
                  activeBg="#e6f1ea"
                  activeBorder="#34a853"
                />
                <StatusChipFixed
                  active={fStatus === "CANCELLED"}
                  onClick={() => setFStatus("CANCELLED")}
                  dot="#b3b8b5"
                  label="Canceladas"
                  count={counts.CANCELLED}
                  activeBg="#eef0ef"
                  activeBorder="#9aa39e"
                />
              </div>

              {/* TABLE */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e6ece8",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                {/* HEAD */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.4fr 1fr 1.2fr 1fr 40px",
                    gap: 14,
                    padding: "13px 20px",
                    background: "#f6f8f7",
                    borderBottom: "1px solid #eef1ef",
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: ".4px",
                    color: "#8a938e",
                    textTransform: "uppercase",
                  }}
                >
                  <div>Tarefa</div>
                  <div>Prioridade</div>
                  <div>Status</div>
                  <div>Prazo</div>
                  <div />
                </div>

                {/* ROWS */}
                {!tasks ? (
                  <SkeletonRows />
                ) : filtered.length === 0 ? (
                  <EmptyState />
                ) : (
                  filtered.map((t) => (
                    <TaskRow key={t.id} t={t} userId={userId} />
                  ))
                )}
              </div>
            </div>
          );
        }}
      </Shell>
    </>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "50px 20px",
        textAlign: "center",
        color: "#8a938e",
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 16,
          background: "#f4f7f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#b3b8b5"
          strokeWidth="2"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "#3a443f" }}>
        Nenhuma tarefa encontrada
      </div>
      <div style={{ fontSize: 13, marginTop: 3 }}>
        Ajuste os filtros ou crie uma nova tarefa.
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "2.4fr 1fr 1.2fr 1fr 40px",
            gap: 14,
            padding: "15px 20px",
            borderBottom: "1px solid #f2f5f3",
            alignItems: "center",
          }}
        >
          <div
            style={{
              height: 14,
              background: "#f0f3f1",
              borderRadius: 6,
              width: "70%",
            }}
          />
          <div
            style={{
              height: 14,
              background: "#f0f3f1",
              borderRadius: 6,
              width: "60%",
            }}
          />
          <div
            style={{
              height: 26,
              background: "#f0f3f1",
              borderRadius: 8,
              width: 100,
            }}
          />
          <div
            style={{
              height: 14,
              background: "#f0f3f1",
              borderRadius: 6,
              width: "50%",
            }}
          />
          <div />
        </div>
      ))}
    </>
  );
}

function NewTaskButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 42,
        background: hovered ? "#1a5e4e" : "#1c6856",
        color: "#fff",
        fontSize: 13.5,
        fontWeight: 600,
        borderRadius: 11,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 7,
        border: "none",
        boxShadow: "0 4px 12px rgba(28,104,86,.2)",
        transition: "background .15s",
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
      Nova tarefa
    </button>
  );
}
