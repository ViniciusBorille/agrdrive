import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import useSWR, { mutate } from "swr";
import Logo from "./Logo";

const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw Object.assign(new Error("http"), { status: r.status });
    return r.json();
  });

export const STATUS_META = {
  PENDING: { label: "Pendente", bg: "#fbf3da", color: "#8a6d0e" },
  IN_PROGRESS: { label: "Em andamento", bg: "#e6eef6", color: "#2b5f93" },
  COMPLETED: { label: "Concluída", bg: "#e6f1ea", color: "#2c6e49" },
  CANCELLED: { label: "Cancelada", bg: "#f0f1f1", color: "#8a8f8c" },
};

export const PRIORITY_META = {
  LOW: { label: "Baixa", color: "#6b7670", dot: "#a9b2ad" },
  MEDIUM: { label: "Média", color: "#8a6d0e", dot: "#c9a41f" },
  HIGH: { label: "Alta", color: "#b5651d", dot: "#e08a2b" },
  URGENT: { label: "Urgente", color: "#c0392b", dot: "#d9483b" },
};

export function fmtDue(dueDateStr, status) {
  if (!dueDateStr) return { label: "Sem prazo", color: "#a9b2ad" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dueDateStr);
  d.setHours(0, 0, 0, 0);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const short = `${dd}/${mm}`;
  if (status === "COMPLETED" || status === "CANCELLED")
    return { label: short, color: "#a9b2ad" };
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return { label: "Atrasada", color: "#c0392b" };
  if (diff === 0) return { label: "Hoje", color: "#b5651d" };
  if (diff === 1) return { label: "Amanhã", color: "#b5651d" };
  if (diff <= 6) return { label: `Em ${diff} dias`, color: "#5a635e" };
  return { label: short, color: "#5a635e" };
}

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

function NavSection({ label }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "1.5px",
        color: "rgba(255,255,255,.45)",
        padding: "18px 10px 10px",
      }}
    >
      {label}
    </div>
  );
}

function NavButton({ active, onClick, disabled, icon, label, badge }) {
  const [hovered, setHovered] = useState(false);
  const isDisabled = disabled && !active;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 11,
        fontSize: 13.5,
        fontWeight: 500,
        marginBottom: 3,
        textAlign: "left",
        color: isDisabled ? "rgba(255,255,255,.55)" : "#fff",
        background:
          hovered && !isDisabled ? "rgba(255,255,255,.09)" : "transparent",
        transition: "background .14s, color .14s",
        cursor: isDisabled ? "default" : "pointer",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 11,
            background: "rgba(255,255,255,.17)",
          }}
        />
      )}
      <span style={{ position: "relative", flexShrink: 0 }}>{icon}</span>
      <span style={{ position: "relative" }}>{label}</span>
      {badge > 0 && (
        <span
          style={{
            position: "relative",
            marginLeft: "auto",
            background: "#ebc22f",
            color: "#1c4d3e",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 9,
            padding: "1px 8px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function TaskModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    due_date: "",
    assignees: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const { data: users } = useSWR("/api/v1/users", fetcher);
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
    if (form.assignees.length === 0) {
      setError("Selecione pelo menos um responsável.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        ...(form.description.trim() && {
          description: form.description.trim(),
        }),
        priority: form.priority,
        ...(form.due_date && { due_date: form.due_date + "T00:00:00.000Z" }),
        assigned_to: form.assignees,
      };
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Erro ao criar tarefa.");
        return;
      }
      mutate(
        (key) => typeof key === "string" && key.includes("/api/v1/tasks"),
        undefined,
        { revalidate: true },
      );
      onSaved();
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
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
              Nova tarefa
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
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Ex.: Coleta de amostra de solo"
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

          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#3a443f",
              marginBottom: 7,
            }}
          >
            Responsáveis *
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
                style={{ fontSize: 13, color: "#9aa39e", lineHeight: "30px" }}
              >
                Carregando usuários...
              </span>
            ) : users.length === 0 ? (
              <span
                style={{ fontSize: 13, color: "#9aa39e", lineHeight: "30px" }}
              >
                Nenhum usuário disponível.
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
                        letterSpacing: "0.5px",
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
            {saving ? "Criando..." : "Criar tarefa"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Shell({ children }) {
  const router = useRouter();
  const {
    data: user,
    error,
    isLoading,
  } = useSWR("/api/v1/user", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [showModal, setShowModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const toastTimer = useRef(null);

  useEffect(() => {
    if (error) router.replace("/login");
  }, [error, router]);

  const { data: assignedTasks } = useSWR(
    user ? "/api/v1/tasks?view=assigned" : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const pendingCount =
    assignedTasks?.filter((t) => t.status === "PENDING").length ?? 0;

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  const openModal = () => setShowModal(true);

  const handleSaved = () => {
    setShowModal(false);
    flash("Tarefa criada com sucesso!");
    if (router.pathname !== "/tarefas") router.push("/tarefas");
  };

  const doLogout = async () => {
    try {
      await fetch("/api/v1/sessions", { method: "DELETE" });
    } catch {
      // ignore logout errors
    }
    router.replace("/login");
  };

  const isHome = router.pathname === "/";
  const isTarefas = router.pathname === "/tarefas";
  const isUsuarios = router.pathname === "/usuarios";
  const isIndicadores = router.pathname === "/indicadores";

  const pageTitle = isTarefas
    ? "Tarefas"
    : isUsuarios
      ? "Usuários"
      : isIndicadores
        ? "Indicadores"
        : "Início";
  const pageSubtitle = isTarefas
    ? "Gestão de tarefas da equipe"
    : isUsuarios
      ? "Controle de acesso e equipe"
      : isIndicadores
        ? "Métricas e desempenho da equipe"
        : "Visão geral da sua operação";

  if (isLoading || (!user && !error)) {
    return <div style={{ minHeight: "100vh", background: "#eef2ef" }} />;
  }
  if (error) return null;

  const username = user?.username || "Usuário";
  const initials = username.substring(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* SIDEBAR */}
      <aside
        className="ag-sidebar"
        style={{
          width: 248,
          flexShrink: 0,
          background:
            "linear-gradient(180deg,#1f8069 0%,#1c6856 50%,#185845 100%)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          padding: "22px 16px",
        }}
      >
        <div style={{ padding: "4px 8px 26px" }}>
          <Logo />
        </div>

        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "1.5px",
            color: "rgba(255,255,255,.45)",
            padding: "0 10px 10px",
          }}
        >
          PRINCIPAL
        </div>

        <NavButton
          active={isHome}
          onClick={() => router.push("/")}
          label="Início"
          icon={
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V21h14V9.5" />
            </svg>
          }
        />
        <NavButton
          active={isTarefas}
          onClick={() => router.push("/tarefas")}
          label="Tarefas"
          badge={pendingCount}
          icon={
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
        <NavButton
          disabled
          label="Agenda de campo"
          icon={
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          }
        />
        <NavButton
          disabled
          label="Relatórios de visita"
          icon={
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M9 14h6M9 18h4" />
            </svg>
          }
        />
        <NavButton
          disabled
          label="Comercial"
          icon={
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 3 3 5-6" />
            </svg>
          }
        />

        <NavSection label="GESTÃO" />
        <NavButton
          active={isUsuarios}
          onClick={() => router.push("/usuarios")}
          label="Usuários"
          icon={
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
            </svg>
          }
        />
        <NavButton
          active={isIndicadores}
          onClick={() => router.push("/indicadores")}
          label="Indicadores"
          icon={
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3v18h18" />
              <rect x="7" y="11" width="3" height="7" />
              <rect x="13" y="7" width="3" height="11" />
            </svg>
          }
        />

        <div
          style={{
            marginTop: "auto",
            borderTop: "1px solid rgba(255,255,255,.14)",
            paddingTop: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => setShowEditProfile(true)}
              title="Editar perfil"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                flex: 1,
                minWidth: 0,
                padding: "6px 8px",
                borderRadius: 11,
                background: "transparent",
                color: "#fff",
                textAlign: "left",
                cursor: "pointer",
                transition: "background .14s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,.09)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: "#ebc22f",
                  color: "#1c4d3e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {username}
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)" }}>
                  Agrônomo
                </div>
              </div>
            </button>
            <LogoutButton onClick={doLogout} />
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "#eef2ef",
        }}
      >
        {/* TOPBAR */}
        <header
          style={{
            height: 66,
            flexShrink: 0,
            background: "#fff",
            borderBottom: "1px solid #e6ece8",
            display: "flex",
            alignItems: "center",
            padding: "0 26px",
            gap: 18,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.1 }}>
              {pageTitle}
            </div>
            <div style={{ fontSize: 12.5, color: "#8a938e" }}>
              {pageSubtitle}
            </div>
          </div>

          <div
            className="ag-topsearch"
            style={{ marginLeft: "auto", position: "relative", width: 280 }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9aa39e"
              strokeWidth="2"
              style={{
                position: "absolute",
                left: 13,
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              placeholder="Buscar tarefas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
              style={{
                width: "100%",
                height: 42,
                border: "1.5px solid #e6ece8",
                borderRadius: 11,
                padding: "0 14px 0 38px",
                fontSize: 13.5,
                outline: "none",
                background: "#f6f8f7",
              }}
            />
          </div>

          <NotifButton tasks={assignedTasks} />

          <AddTaskButton onClick={openModal} />
        </header>

        {/* CONTENT */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 30px 40px",
          }}
        >
          {typeof children === "function"
            ? children({ openModal, searchQuery })
            : children}
        </main>
      </div>

      {showModal && (
        <TaskModal onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}

      {showEditProfile && user && (
        <EditProfileModal
          user={user}
          onClose={() => setShowEditProfile(false)}
          onSaved={(emailChanged) => {
            setShowEditProfile(false);
            if (emailChanged) {
              flash(
                "Email alterado! Verifique sua caixa de entrada para confirmar.",
              );
              setTimeout(() => router.replace("/login"), 2000);
            } else {
              flash("Perfil atualizado com sucesso!");
            }
          }}
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
            whiteSpace: "nowrap",
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
  );
}

function EditProfileModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    username: user.username,
    email: user.email || "",
    password: "",
    confirmPassword: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.username.trim()) {
      setError("Informe um nome de usuário.");
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    const body = {};
    if (form.username !== user.username) body.username = form.username;
    if (form.email !== (user.email || "")) body.email = form.email;
    if (form.password) body.password = form.password;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/users/${user.username}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Erro ao atualizar perfil.");
        return;
      }
      const data = await res.json();
      onSaved(data.emailVerificationRequired ?? false);
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
          maxWidth: 480,
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
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
              Editar perfil
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
        <div
          style={{
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
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
              Nome de usuário
            </label>
            <input
              value={form.username}
              onChange={(e) => setField("username", e.target.value)}
              style={{
                width: "100%",
                height: 44,
                border: "1.5px solid #dde4e0",
                borderRadius: 11,
                padding: "0 13px",
                fontSize: 14,
                outline: "none",
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
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              style={{
                width: "100%",
                height: 44,
                border: "1.5px solid #dde4e0",
                borderRadius: 11,
                padding: "0 13px",
                fontSize: 14,
                outline: "none",
              }}
            />
            <p
              style={{
                marginTop: 5,
                fontSize: 12,
                color: "#9aa39e",
              }}
            >
              Ao alterar o email, você receberá um link de verificação e será
              desconectado.
            </p>
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
              Nova senha
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder="Deixe em branco para não alterar"
              style={{
                width: "100%",
                height: 44,
                border: "1.5px solid #dde4e0",
                borderRadius: 11,
                padding: "0 13px",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          {form.password && (
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
                Confirmar senha
              </label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setField("confirmPassword", e.target.value)}
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #dde4e0",
                  borderRadius: 11,
                  padding: "0 13px",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>
          )}

          {error && (
            <p
              style={{
                fontSize: 13,
                color: "#c0392b",
                background: "#fdf0ef",
                border: "1px solid #f5c6c2",
                borderRadius: 8,
                padding: "8px 12px",
                margin: 0,
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
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogoutButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title="Sair"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color: hovered ? "#fff" : "rgba(255,255,255,.7)",
        padding: 6,
        borderRadius: 8,
        display: "flex",
        background: hovered ? "rgba(255,255,255,.12)" : "transparent",
        transition: "background .14s, color .14s",
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
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5M21 12H9" />
      </svg>
    </button>
  );
}

function NotifButton({ tasks }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const PORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const pending = (tasks || [])
    .filter((t) => t.status === "PENDING")
    .sort((a, b) => {
      const aOver = fmtDue(a.due_date, a.status).label === "Atrasada";
      const bOver = fmtDue(b.due_date, b.status).label === "Atrasada";
      if (aOver !== bOver) return aOver ? -1 : 1;
      return PORDER[a.priority] - PORDER[b.priority];
    });
  const count = pending.length;
  const shown = pending.slice(0, 8);

  return (
    <div ref={containerRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          width: 42,
          height: 42,
          borderRadius: 11,
          border: "1.5px solid #e6ece8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5a635e",
          background: open || hovered ? "#f4f7f5" : "transparent",
          transition: "background .14s",
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: 9,
              right: 10,
              width: 8,
              height: 8,
              background: "#d9483b",
              borderRadius: "50%",
              border: "2px solid #fff",
            }}
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 320,
            background: "#fff",
            border: "1.5px solid #e6ece8",
            borderRadius: 14,
            boxShadow: "0 12px 40px rgba(0,0,0,.14)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "13px 16px 10px",
              fontSize: 13,
              fontWeight: 600,
              color: "#3a443f",
              borderBottom: "1px solid #eef1ef",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Notificações</span>
            {count > 0 && (
              <span
                style={{
                  background: "#d9483b",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 8,
                  padding: "1px 7px",
                }}
              >
                {count}
              </span>
            )}
          </div>

          {shown.length === 0 ? (
            <div
              style={{
                padding: "22px 16px",
                fontSize: 13,
                color: "#9aa39e",
                textAlign: "center",
              }}
            >
              Sem tarefas pendentes atribuídas a você.
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {shown.map((t) => {
                const due = fmtDue(t.due_date, t.status);
                const pm = PRIORITY_META[t.priority];
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: "10px 16px",
                      borderBottom: "1px solid #f4f6f4",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#2a3530",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.title}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: due.color,
                        }}
                      >
                        {due.label}
                      </span>
                      <span
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: "50%",
                          background: "#d8dedd",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 500,
                          color: pm.color,
                        }}
                      >
                        {pm.label}
                      </span>
                    </div>
                  </div>
                );
              })}
              {pending.length > 8 && (
                <div
                  style={{
                    padding: "10px 16px",
                    fontSize: 12.5,
                    color: "#9aa39e",
                    textAlign: "center",
                  }}
                >
                  + {pending.length - 8} mais tarefas pendentes
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddTaskButton({ onClick }) {
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
        flexShrink: 0,
        boxShadow: "0 4px 12px rgba(28,104,86,.22)",
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
