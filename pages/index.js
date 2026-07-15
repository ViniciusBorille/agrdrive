import { useState } from "react";
import Head from "next/head";
import useSWR from "swr";
import { useRouter } from "next/router";
import Shell, { fmtDue, STATUS_META, PRIORITY_META } from "@/components/Shell";

// const AGENDA = [
//   {
//     day: "Hoje",
//     time: "08:00",
//     client: "Fazenda Santa Rita",
//     type: "Monitoramento de soja",
//     tone: "#1f8069",
//   },
//   {
//     day: "Hoje",
//     time: "14:00",
//     client: "Agro Vale",
//     type: "Reunião comercial — proposta",
//     tone: "#c9a41f",
//   },
//   {
//     day: "Amanhã",
//     time: "07:30",
//     client: "Fazenda Boa Vista",
//     type: "Aplicação de fungicida",
//     tone: "#1f8069",
//   },
//   {
//     day: "Sex",
//     time: "09:00",
//     client: "Fazenda Horizonte",
//     type: "Visita de prospecção",
//     tone: "#3a7ca5",
//   },
//   {
//     day: "Sex",
//     time: "15:30",
//     client: "Fazenda Três Irmãos",
//     type: "Coleta de fenologia",
//     tone: "#1f8069",
//   },
// ];

const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("error");
    return r.json();
  });

function KpiCard({ accent, icon, value, label }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6ece8",
        borderRadius: 16,
        padding: "18px 18px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 3,
          background: accent,
        }}
      />
      <div style={{ marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 13, color: "#6b7670", marginTop: 5 }}>
        {label}
      </div>
    </div>
  );
}

function KpiIconBox({ bg, stroke, children }) {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      >
        {children}
      </svg>
    </div>
  );
}

function ActionButton({ primary, onClick, icon, label }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 42,
        background: primary
          ? hovered
            ? "#1a5e4e"
            : "#1c6856"
          : hovered
            ? "#f4f7f5"
            : "#fff",
        color: primary ? "#fff" : "#1c6856",
        fontSize: 13.5,
        fontWeight: 600,
        borderRadius: 11,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 7,
        border: primary ? "none" : "1.5px solid #d7e0db",
        boxShadow: primary ? "0 4px 12px rgba(28,104,86,.2)" : "none",
        transition: "background .15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function TaskSkeleton() {
  return (
    <>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "13px 16px",
            borderTop: "1px solid #f0f3f1",
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#e6ece8",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              height: 14,
              background: "#f0f3f1",
              borderRadius: 6,
            }}
          />
          <div
            style={{
              width: 74,
              height: 26,
              background: "#f0f3f1",
              borderRadius: 7,
            }}
          />
        </div>
      ))}
    </>
  );
}

export default function Home() {
  const router = useRouter();
  const { data: user } = useSWR("/api/v1/user", fetcher);
  const { data: tasks } = useSWR(
    user ? "/api/v1/tasks?view=all" : null,
    fetcher,
  );

  const hours = new Date().getHours();
  const greeting =
    hours < 12 ? "Bom dia" : hours < 18 ? "Boa tarde" : "Boa noite";
  const firstName = user?.username?.split(" ")[0] || "";

  const todayLong = (() => {
    const s = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const userId = user?.id;

  const isAssignee = (t) => t.assignees?.some((a) => a.id === userId);

  const kpiPendentes = tasks?.filter(
    (t) => isAssignee(t) && t.status === "PENDING",
  ).length;
  const kpiRecebidas = tasks?.filter(
    (t) =>
      isAssignee(t) && (t.status === "PENDING" || t.status === "IN_PROGRESS"),
  ).length;
  const kpiCriadas = tasks?.filter(
    (t) =>
      t.created_by === userId &&
      t.status !== "COMPLETED" &&
      t.status !== "CANCELLED",
  ).length;

  const homeTasks = tasks
    ? tasks
        .filter(
          (t) =>
            isAssignee(t) &&
            (t.status === "PENDING" || t.status === "IN_PROGRESS"),
        )
        .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
        .slice(0, 5)
    : [];

  return (
    <>
      <Head>
        <title>Início · AgrDrive</title>
      </Head>
      <Shell>
        {({ openModal }) => (
          <div style={{ maxWidth: 1240, margin: "0 auto" }}>
            {/* GREETING */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 24,
              }}
            >
              <div>
                <h1
                  style={{ fontSize: 25, fontWeight: 600, margin: "0 0 4px" }}
                >
                  {greeting}
                  {firstName ? `, ${firstName}` : ""}
                </h1>
                <p style={{ fontSize: 14, color: "#6b7670", margin: 0 }}>
                  {todayLong}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <ActionButton
                  primary
                  onClick={openModal}
                  icon={
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
                  }
                  label="Nova tarefa"
                />
              </div>
            </div>

            {/* KPI CARDS */}
            <div
              id="ag-kpis"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 16,
                marginBottom: 22,
              }}
            >
              <KpiCard
                accent="#c9a41f"
                value={kpiPendentes}
                label="Tarefas pendentes"
                icon={
                  <KpiIconBox bg="#fbf3da" stroke="#c9a41f">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </KpiIconBox>
                }
              />
              <KpiCard
                accent="#1f8069"
                value={kpiRecebidas}
                label="Tarefas recebidas"
                icon={
                  <KpiIconBox bg="#e6f1ea" stroke="#1f8069">
                    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
                  </KpiIconBox>
                }
              />
              <KpiCard
                accent="#3a7ca5"
                value={kpiCriadas}
                label="Criadas por você"
                icon={
                  <KpiIconBox bg="#e6eef6" stroke="#3a7ca5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </KpiIconBox>
                }
              />
            </div>

            {/* CONTENT GRID */}
            <div
              id="ag-homegrid"
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr",
                gap: 18,
              }}
            >
              {/* UPCOMING TASKS */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e6ece8",
                  borderRadius: 16,
                  padding: "6px 6px 8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 16px 12px",
                  }}
                >
                  <h2 style={{ fontSize: 15.5, fontWeight: 600, margin: 0 }}>
                    Próximos prazos
                  </h2>
                  <button
                    onClick={() => router.push("/tarefas")}
                    style={{
                      fontSize: 12.5,
                      color: "#1f8069",
                      fontWeight: 600,
                      padding: 0,
                    }}
                  >
                    Ver todas →
                  </button>
                </div>
                {!tasks ? (
                  <TaskSkeleton />
                ) : homeTasks.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: "#8a938e",
                      fontSize: 13.5,
                      padding: "30px 16px",
                      margin: 0,
                    }}
                  >
                    Nenhuma tarefa pendente
                  </p>
                ) : (
                  homeTasks.map((t) => {
                    const sm = STATUS_META[t.status] || STATUS_META.PENDING;
                    const pm =
                      PRIORITY_META[t.priority] || PRIORITY_META.MEDIUM;
                    const due = fmtDue(t.due_date, t.status);
                    return (
                      <div
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          padding: "13px 16px",
                          borderTop: "1px solid #f0f3f1",
                        }}
                      >
                        <div
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: pm.dot,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
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
                              }}
                            >
                              {t.description}
                            </div>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: sm.color,
                            background: sm.bg,
                            borderRadius: 7,
                            padding: "4px 9px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sm.label}
                        </span>
                        <div style={{ textAlign: "right", minWidth: 74 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: due.color,
                            }}
                          >
                            {due.label}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Shell>
      <style jsx global>{`
        @media (max-width: 900px) {
          #ag-kpis {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          #ag-homegrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
