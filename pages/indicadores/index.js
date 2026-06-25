import Head from "next/head";
import useSWR from "swr";
import Shell, { STATUS_META, PRIORITY_META } from "@/components/Shell";

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

function KpiCard({ label, value, sub, accent, icon }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "20px 22px",
        border: "1.5px solid #e6ece8",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          background: accent + "18",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: "#1c2b25",
            lineHeight: 1,
            letterSpacing: "-0.5px",
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#5a635e",
            marginTop: 5,
          }}
        >
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: "#9aa39e", marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "22px 24px",
        border: "1.5px solid #e6ece8",
        height: "100%",
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#3a443f",
          margin: "0 0 20px",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function ProgressRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: "#3a443f" }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {count}{" "}
          <span style={{ fontWeight: 400, color: "#b0b8b4", fontSize: 12 }}>
            ({pct}%)
          </span>
        </span>
      </div>
      <div
        style={{
          height: 7,
          background: "#f0f3f1",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: "width .6s cubic-bezier(.4,0,.2,1)",
          }}
        />
      </div>
    </div>
  );
}

function DeadlineChip({ label, count, color, bg }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderRadius: 12,
        background: bg,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#3a443f" }}>
          {label}
        </span>
      </div>
      <span
        style={{
          fontSize: 15,
          fontWeight: 700,
          color,
          minWidth: 24,
          textAlign: "right",
        }}
      >
        {count}
      </span>
    </div>
  );
}

function AssigneeRow({ username, pending, inProgress, completed, total }) {
  const maxVal = Math.max(total, 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 0",
        borderBottom: "1px solid #f4f6f4",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: avatarBg(username),
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
          letterSpacing: "0.5px",
        }}
      >
        {username.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 5,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#2a3530",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {username}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#8a938e",
              marginLeft: 8,
              flexShrink: 0,
            }}
          >
            {total}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
            background: "#f0f3f1",
            gap: 1,
          }}
        >
          {completed > 0 && (
            <div
              title={`Concluídas: ${completed}`}
              style={{
                width: `${(completed / maxVal) * 100}%`,
                background: STATUS_META.COMPLETED.color,
                borderRadius: "3px 0 0 3px",
              }}
            />
          )}
          {inProgress > 0 && (
            <div
              title={`Em andamento: ${inProgress}`}
              style={{
                width: `${(inProgress / maxVal) * 100}%`,
                background: STATUS_META.IN_PROGRESS.color,
              }}
            />
          )}
          {pending > 0 && (
            <div
              title={`Pendentes: ${pending}`}
              style={{
                width: `${(pending / maxVal) * 100}%`,
                background: STATUS_META.PENDING.color,
                borderRadius: "0 3px 3px 0",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "20px 22px",
        border: "1.5px solid #e6ece8",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          background: "#f0f3f1",
        }}
      />
      <div>
        <div
          style={{
            width: 60,
            height: 28,
            borderRadius: 6,
            background: "#f0f3f1",
            marginBottom: 8,
          }}
        />
        <div
          style={{
            width: 120,
            height: 13,
            borderRadius: 4,
            background: "#f4f6f4",
          }}
        />
      </div>
    </div>
  );
}

export default function Indicadores() {
  const { data: tasks } = useSWR("/api/v1/tasks?view=all", fetcher, {
    revalidateOnFocus: false,
  });

  const loading = !tasks;
  const all = tasks || [];
  const total = all.length;

  const byStatus = {
    PENDING: all.filter((t) => t.status === "PENDING").length,
    IN_PROGRESS: all.filter((t) => t.status === "IN_PROGRESS").length,
    COMPLETED: all.filter((t) => t.status === "COMPLETED").length,
    CANCELLED: all.filter((t) => t.status === "CANCELLED").length,
  };

  const active = all.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "CANCELLED",
  );
  const activeCount = active.length;

  const byPriority = {
    URGENT: active.filter((t) => t.priority === "URGENT").length,
    HIGH: active.filter((t) => t.priority === "HIGH").length,
    MEDIUM: active.filter((t) => t.priority === "MEDIUM").length,
    LOW: active.filter((t) => t.priority === "LOW").length,
  };

  const completionRate =
    total > 0 ? Math.round((byStatus.COMPLETED / total) * 100) : 0;
  const urgentHigh = byPriority.URGENT + byPriority.HIGH;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueCount = active.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    d.setHours(0, 0, 0, 0);
    return d < today;
  }).length;

  const dueTodayCount = active.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;

  const dueWeekCount = active.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    return diff >= 1 && diff <= 7;
  }).length;

  const dueOkCount = active.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000) > 7;
  }).length;

  const noDueDateCount = active.filter((t) => !t.due_date).length;

  const assigneeMap = {};
  all.forEach((task) => {
    (task.assignees || []).forEach((a) => {
      if (!assigneeMap[a.id]) {
        assigneeMap[a.id] = {
          username: a.username,
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0,
        };
      }
      const entry = assigneeMap[a.id];
      entry.total++;
      if (task.status === "PENDING") entry.pending++;
      else if (task.status === "IN_PROGRESS") entry.inProgress++;
      else if (task.status === "COMPLETED") entry.completed++;
      else if (task.status === "CANCELLED") entry.cancelled++;
    });
  });
  const topAssignees = Object.values(assigneeMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <>
      <Head>
        <title>Indicadores · AgrDrive</title>
      </Head>
      <Shell>
        {() => (
          <div style={{ maxWidth: 1240, margin: "0 auto" }}>
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginBottom: 24,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <h1
                  style={{ fontSize: 23, fontWeight: 600, margin: "0 0 3px" }}
                >
                  Indicadores
                </h1>
                <p style={{ fontSize: 13.5, color: "#6b7670", margin: 0 }}>
                  {loading
                    ? "Carregando métricas..."
                    : `${total} tarefa${total !== 1 ? "s" : ""} no sistema`}
                </p>
              </div>
            </div>

            {/* KPI Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 14,
                marginBottom: 16,
              }}
            >
              {loading ? (
                [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
              ) : (
                <>
                  <KpiCard
                    label="Total de tarefas"
                    value={total}
                    sub={`${activeCount} ativas`}
                    accent="#1c6856"
                    icon={
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#1c6856"
                        strokeWidth="2"
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    }
                  />
                  <KpiCard
                    label="Taxa de conclusão"
                    value={`${completionRate}%`}
                    sub={`${byStatus.COMPLETED} concluídas`}
                    accent="#2c6e49"
                    icon={
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#2c6e49"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 12l3 3 5-5" />
                      </svg>
                    }
                  />
                  <KpiCard
                    label="Em atraso"
                    value={overdueCount}
                    sub="tarefas ativas vencidas"
                    accent="#c0392b"
                    icon={
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#c0392b"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                    }
                  />
                  <KpiCard
                    label="Alta prioridade"
                    value={urgentHigh}
                    sub="urgente + alta · ativas"
                    accent="#b5651d"
                    icon={
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#b5651d"
                        strokeWidth="2"
                      >
                        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    }
                  />
                </>
              )}
            </div>

            {/* Status + Priority */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
                marginBottom: 16,
              }}
            >
              <SectionCard title="Distribuição por status">
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 36,
                        background: "#f4f6f4",
                        borderRadius: 8,
                        marginBottom: 14,
                      }}
                    />
                  ))
                ) : total === 0 ? (
                  <p style={{ fontSize: 13, color: "#9aa39e", margin: 0 }}>
                    Nenhuma tarefa registrada.
                  </p>
                ) : (
                  Object.entries(STATUS_META).map(([key, meta]) => (
                    <ProgressRow
                      key={key}
                      label={meta.label}
                      count={byStatus[key] || 0}
                      total={total}
                      color={meta.color}
                    />
                  ))
                )}
              </SectionCard>

              <SectionCard title="Distribuição por prioridade (tarefas ativas)">
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 36,
                        background: "#f4f6f4",
                        borderRadius: 8,
                        marginBottom: 14,
                      }}
                    />
                  ))
                ) : activeCount === 0 ? (
                  <p style={{ fontSize: 13, color: "#9aa39e", margin: 0 }}>
                    Nenhuma tarefa ativa.
                  </p>
                ) : (
                  Object.entries(PRIORITY_META).map(([key, meta]) => (
                    <ProgressRow
                      key={key}
                      label={meta.label}
                      count={byPriority[key] || 0}
                      total={activeCount}
                      color={meta.dot}
                    />
                  ))
                )}
              </SectionCard>
            </div>

            {/* Deadlines + Assignees */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "340px 1fr",
                gap: 14,
              }}
            >
              <SectionCard title="Situação dos prazos (ativas)">
                {loading ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 44,
                        background: "#f4f6f4",
                        borderRadius: 12,
                        marginBottom: 10,
                      }}
                    />
                  ))
                ) : activeCount === 0 ? (
                  <p style={{ fontSize: 13, color: "#9aa39e", margin: 0 }}>
                    Nenhuma tarefa ativa.
                  </p>
                ) : (
                  <>
                    <DeadlineChip
                      label="Atrasadas"
                      count={overdueCount}
                      color="#c0392b"
                      bg="#fdf0ef"
                    />
                    <DeadlineChip
                      label="Vencem hoje"
                      count={dueTodayCount}
                      color="#b5651d"
                      bg="#fdf6ed"
                    />
                    <DeadlineChip
                      label="Esta semana"
                      count={dueWeekCount}
                      color="#8a6d0e"
                      bg="#fbf3da"
                    />
                    <DeadlineChip
                      label="No prazo"
                      count={dueOkCount}
                      color="#2c6e49"
                      bg="#e6f1ea"
                    />
                    <DeadlineChip
                      label="Sem prazo"
                      count={noDueDateCount}
                      color="#8a938e"
                      bg="#f4f6f4"
                    />
                  </>
                )}
              </SectionCard>

              <SectionCard title="Tarefas por responsável">
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 48,
                        background: "#f4f6f4",
                        borderRadius: 8,
                        marginBottom: 10,
                      }}
                    />
                  ))
                ) : topAssignees.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9aa39e", margin: 0 }}>
                    Nenhum responsável atribuído.
                  </p>
                ) : (
                  <>
                    {/* Legend */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        marginBottom: 14,
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        {
                          color: STATUS_META.COMPLETED.color,
                          label: "Concluídas",
                        },
                        {
                          color: STATUS_META.IN_PROGRESS.color,
                          label: "Em andamento",
                        },
                        {
                          color: STATUS_META.PENDING.color,
                          label: "Pendentes",
                        },
                      ].map(({ color, label }) => (
                        <div
                          key={label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              background: color,
                              display: "inline-block",
                            }}
                          />
                          <span style={{ fontSize: 12, color: "#8a938e" }}>
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {topAssignees.map((a) => (
                      <AssigneeRow
                        key={a.username}
                        username={a.username}
                        pending={a.pending}
                        inProgress={a.inProgress}
                        completed={a.completed}
                        total={a.total}
                      />
                    ))}
                  </>
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </Shell>
    </>
  );
}
