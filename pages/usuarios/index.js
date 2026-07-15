import { useState } from "react";
import Head from "next/head";
import useSWR from "swr";
import Shell from "@/components/Shell";
import PasswordInput from "@/components/PasswordInput";

const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("error");
    return r.json();
  });

const AVATAR_PALETTE = [
  "#1c6856",
  "#c98f1f",
  "#3a7ca5",
  "#9a5ba6",
  "#c0653b",
  "#2b7a78",
];

function avatarColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash ^= username.charCodeAt(i);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function userInitials(username) {
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.substring(0, 2).toUpperCase();
}

function isActive(features) {
  return Array.isArray(features) && features.includes("create:session");
}

const MODULE_PERMISSIONS = [
  {
    feature: "use:tasks",
    module: "Tarefas",
    description: "Criar e acompanhar tarefas da equipe",
  },
  {
    feature: "read:indicators",
    module: "Indicadores",
    description: "Visualizar métricas e desempenho da equipe",
  },
  {
    feature: "create:user",
    module: "Usuários",
    description: "Cadastrar e gerenciar usuários (administrador)",
  },
];

export default function Usuarios() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    features: ["use:tasks"],
  });
  const [teamSearch, setTeamSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const { data: users, mutate } = useSWR("/api/v1/users", fetcher, {
    revalidateOnFocus: false,
  });

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleFeature = (feature) =>
    setForm((f) => ({
      ...f,
      features: f.features.includes(feature)
        ? f.features.filter((x) => x !== feature)
        : [...f.features, feature],
    }));

  const handleRegister = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.password) {
      flash("Preencha usuário, e-mail e senha.");
      return;
    }
    if (!form.email.includes("@")) {
      flash("Informe um e-mail válido.");
      return;
    }
    if (form.password.length < 8) {
      flash("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim().toLowerCase(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          features: form.features,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(data.message || "Erro ao cadastrar usuário.");
        return;
      }
      setForm({
        username: "",
        email: "",
        password: "",
        features: ["use:tasks"],
      });
      mutate();
      flash("Usuário cadastrado · convite de ativação enviado.");
    } finally {
      setSaving(false);
    }
  };

  const filteredTeam = (users || []).filter((u) => {
    if (!teamSearch.trim()) return true;
    const q = teamSearch.trim().toLowerCase();
    return u.username.toLowerCase().includes(q);
  });

  return (
    <>
      <Head>
        <title>Usuários · AgrDrive</title>
      </Head>
      <Shell requireFeature="create:user">
        {() => (
          <div style={{ maxWidth: 1240, margin: "0 auto" }}>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ fontSize: 23, fontWeight: 600, margin: "0 0 3px" }}>
                Usuários
              </h1>
              <p style={{ fontSize: 13.5, color: "#6b7670", margin: 0 }}>
                Cadastre e gerencie quem tem acesso ao AgrDrive · ação restrita
                a administradores
              </p>
            </div>

            <div
              id="ag-usrgrid"
              style={{
                display: "grid",
                gridTemplateColumns: "0.95fr 1.05fr",
                gap: 18,
                alignItems: "start",
              }}
            >
              {/* FORM */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e6ece8",
                  borderRadius: 16,
                  padding: "22px 22px 24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: "#e6f1ea",
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
                      stroke="#1c6856"
                      strokeWidth="2"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M19 8v6M22 11h-6" />
                    </svg>
                  </div>
                  <div>
                    <h2
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        margin: 0,
                      }}
                    >
                      Cadastrar novo usuário
                    </h2>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "#8a938e",
                        margin: "2px 0 0",
                      }}
                    >
                      Um convite de ativação será enviado por e-mail
                    </p>
                  </div>
                </div>

                <label style={labelStyle}>Usuário</label>
                <input
                  value={form.username}
                  onChange={(e) => setField("username", e.target.value)}
                  placeholder="Ex.: mariana"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                  onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
                />

                <label style={labelStyle}>E-mail corporativo</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="mariana@empresa.com.br"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                  onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
                />

                <label style={labelStyle}>Senha provisória</label>
                <PasswordInput
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  placeholder="Mín. 8 caracteres"
                  style={{ ...inputStyle, marginBottom: 20 }}
                  onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                  onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
                />

                <label style={labelStyle}>Permissões por módulo</label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 7,
                    border: "1.5px solid #dde4e0",
                    borderRadius: 11,
                    padding: "10px",
                    marginBottom: 20,
                  }}
                >
                  {MODULE_PERMISSIONS.map((perm) => {
                    const sel = form.features.includes(perm.feature);
                    return (
                      <button
                        key={perm.feature}
                        type="button"
                        onClick={() => toggleFeature(perm.feature)}
                        title={perm.description}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "7px 14px",
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
                        {perm.module}
                      </button>
                    );
                  })}
                </div>

                {toast && (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: "10px 14px",
                      background:
                        toast.startsWith("Erro") ||
                        toast.startsWith("Preencha") ||
                        toast.startsWith("Informe") ||
                        toast.startsWith("A senha")
                          ? "#fdf0ef"
                          : "#eef3f0",
                      border: `1px solid ${toast.startsWith("Usuário cadastrado") ? "#c5ddc8" : "#f5c6c2"}`,
                      borderRadius: 10,
                      fontSize: 13,
                      color: toast.startsWith("Usuário cadastrado")
                        ? "#2c6e49"
                        : "#c0392b",
                    }}
                  >
                    {toast}
                  </div>
                )}

                <RegisterButton onClick={handleRegister} saving={saving} />
              </div>

              {/* TEAM LIST */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e6ece8",
                  borderRadius: 16,
                  padding: "6px 6px 10px",
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
                    Equipe{" "}
                    <span style={{ color: "#8a938e", fontWeight: 500 }}>
                      · {users?.length ?? "—"}
                    </span>
                  </h2>
                  <div style={{ position: "relative", width: 180 }}>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#9aa39e"
                      strokeWidth="2"
                      style={{
                        position: "absolute",
                        left: 11,
                        top: "50%",
                        transform: "translateY(-50%)",
                      }}
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      placeholder="Filtrar..."
                      style={{
                        width: "100%",
                        height: 36,
                        border: "1.5px solid #e6ece8",
                        borderRadius: 9,
                        padding: "0 12px 0 32px",
                        fontSize: 13,
                        outline: "none",
                        background: "#f6f8f7",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#1f8069";
                        e.target.style.background = "#fff";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "#e6ece8";
                        e.target.style.background = "#f6f8f7";
                      }}
                    />
                  </div>
                </div>

                {!users ? (
                  <TeamSkeleton />
                ) : filteredTeam.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: "#8a938e",
                      fontSize: 13.5,
                      padding: "30px 16px",
                      margin: 0,
                    }}
                  >
                    Nenhum usuário encontrado.
                  </p>
                ) : (
                  filteredTeam.map((u) => {
                    const active = isActive(u.features);
                    return (
                      <div
                        key={u.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 13,
                          padding: "12px 16px",
                          borderTop: "1px solid #f0f3f1",
                        }}
                      >
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 11,
                            background: avatarColor(u.username),
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {userInitials(u.username)}
                        </div>
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
                            {u.username}
                          </div>
                          <div style={{ fontSize: 12.5, color: "#8a938e" }}>
                            @{u.username}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: active ? "#2c6e49" : "#8a6d0e",
                            background: active ? "#e6f1ea" : "#fbf3da",
                            borderRadius: 7,
                            padding: "4px 10px",
                            whiteSpace: "nowrap",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: active ? "#2c6e49" : "#8a6d0e",
                            }}
                          />
                          {active ? "Ativo" : "Pendente"}
                        </span>
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
          #ag-usrgrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#3a443f",
  marginBottom: 7,
};

const inputStyle = {
  width: "100%",
  height: 44,
  border: "1.5px solid #dde4e0",
  borderRadius: 11,
  padding: "0 13px",
  fontSize: 14,
  outline: "none",
  marginBottom: 14,
  transition: "border-color .15s",
};

function TeamSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "12px 16px",
            borderTop: "1px solid #f0f3f1",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: "#f0f3f1",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 13,
                background: "#f0f3f1",
                borderRadius: 5,
                width: "60%",
                marginBottom: 6,
              }}
            />
            <div
              style={{
                height: 11,
                background: "#f0f3f1",
                borderRadius: 5,
                width: "40%",
              }}
            />
          </div>
          <div
            style={{
              width: 62,
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

function RegisterButton({ onClick, saving }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={saving}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        height: 46,
        background: hovered && !saving ? "#1a5e4e" : "#1c6856",
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 11,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        border: "none",
        boxShadow: "0 5px 14px rgba(28,104,86,.24)",
        transition: "background .15s",
        opacity: saving ? 0.65 : 1,
        cursor: saving ? "default" : "pointer",
      }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      >
        <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
      </svg>
      {saving ? "Cadastrando..." : "Cadastrar e enviar convite"}
    </button>
  );
}
