import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function Cadastro() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setError("Preencha todos os campos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Não foi possível criar a conta.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Criar conta · AgrDrive</title>
      </Head>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* LEFT PANEL */}
        <div
          className="ag-authpanel"
          style={{
            position: "relative",
            width: "46%",
            background:
              "linear-gradient(160deg,#1f8069 0%,#1c6856 55%,#16523f 100%)",
            color: "#fff",
            padding: "56px 52px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -120,
              top: -80,
              width: 380,
              height: 380,
              border: "1px solid rgba(255,255,255,.10)",
              borderRadius: "50%",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: -40,
              bottom: -140,
              width: 300,
              height: 300,
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: "50%",
            }}
          />

          <div style={{ position: "relative" }}>
            <Logo size="lg" />
          </div>

          <div style={{ position: "relative" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.6)",
                marginBottom: 18,
              }}
            >
              Gestão para consultoria agronômica
            </div>
            <h2
              style={{
                fontSize: 34,
                lineHeight: 1.2,
                fontWeight: 600,
                margin: "0 0 18px",
                maxWidth: 420,
              }}
            >
              Sua operação de campo organizada do plantio à colheita.
            </h2>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(255,255,255,.78)",
                maxWidth: 400,
                margin: 0,
              }}
            >
              Agenda de visitas, relatórios técnicos, tarefas entre a equipe e
              indicadores comerciais — tudo em um só lugar.
            </p>
          </div>

          <div
            style={{
              position: "relative",
              fontSize: 12.5,
              color: "rgba(255,255,255,.5)",
            }}
          >
            © 2026 AgrDrive · Tecnologia para o agronegócio
          </div>
        </div>

        {/* RIGHT FORM */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 24px",
            background: "#f4f7f5",
          }}
        >
          <div style={{ width: "100%", maxWidth: 392 }}>
            <div style={{ marginBottom: 34 }}>
              <Logo size="md" variant="dark" />
            </div>

            {done ? (
              <SuccessState
                email={form.email}
                onLogin={() => router.push("/login")}
              />
            ) : (
              <>
                <h1
                  style={{
                    fontSize: 27,
                    fontWeight: 600,
                    margin: "0 0 8px",
                    color: "#18211d",
                  }}
                >
                  Criar conta
                </h1>
                <p
                  style={{
                    fontSize: 14.5,
                    color: "#6b7670",
                    margin: "0 0 30px",
                  }}
                >
                  Preencha os dados para se cadastrar na plataforma.
                </p>

                <form onSubmit={handleSubmit}>
                  <Field label="Nome de usuário">
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => setField("username", e.target.value)}
                      placeholder="Ex.: joao_silva"
                      autoComplete="username"
                      style={inputStyle}
                      onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                      onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
                    />
                  </Field>

                  <Field label="E-mail">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      placeholder="joao@empresa.com.br"
                      autoComplete="email"
                      style={inputStyle}
                      onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                      onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
                    />
                  </Field>

                  <Field label="Senha">
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setField("password", e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      style={{ ...inputStyle, marginBottom: 22 }}
                      onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                      onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
                    />
                  </Field>

                  {error && (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: "10px 14px",
                        background: "#fdf0ef",
                        border: "1px solid #f5c6c2",
                        borderRadius: 10,
                        fontSize: 13,
                        color: "#c0392b",
                      }}
                    >
                      {error}
                    </div>
                  )}

                  <SubmitButton loading={loading} />
                </form>

                <p
                  style={{
                    marginTop: 22,
                    fontSize: 13.5,
                    color: "#6b7670",
                    textAlign: "center",
                  }}
                >
                  Já tem uma conta?{" "}
                  <Link
                    href="/login"
                    style={{ color: "#1c6856", fontWeight: 600 }}
                  >
                    Entrar
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .ag-authpanel {
          display: flex;
        }
        @media (max-width: 900px) {
          .ag-authpanel {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: "#3a443f",
          marginBottom: 7,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SuccessState({ email, onLogin }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "#e6f1ea",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1c6856"
          strokeWidth="2.5"
        >
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <path d="m22 6-10 7L2 6" />
        </svg>
      </div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: "#18211d",
          margin: "0 0 10px",
        }}
      >
        Verifique seu e-mail
      </h1>
      <p
        style={{
          fontSize: 14.5,
          color: "#6b7670",
          lineHeight: 1.6,
          margin: "0 0 28px",
        }}
      >
        Enviamos um link de ativação para{" "}
        <strong style={{ color: "#3a443f" }}>{email}</strong>. Clique no link
        para ativar sua conta e acessar a plataforma.
      </p>
      <button
        onClick={onLogin}
        style={{
          height: 46,
          padding: "0 28px",
          background: "#1c6856",
          color: "#fff",
          fontSize: 14.5,
          fontWeight: 600,
          borderRadius: 11,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(28,104,86,.28)",
        }}
      >
        Ir para o login
      </button>
    </div>
  );
}

function SubmitButton({ loading }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="submit"
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        height: 48,
        background: hovered && !loading ? "#1a5e4e" : "#1c6856",
        color: "#fff",
        fontSize: 15,
        fontWeight: 600,
        borderRadius: 11,
        letterSpacing: ".2px",
        boxShadow: "0 6px 16px rgba(28,104,86,.28)",
        transition: "background .15s, transform .12s",
        transform: hovered && !loading ? "translateY(-1px)" : "none",
        opacity: loading ? 0.7 : 1,
        cursor: loading ? "default" : "pointer",
        border: "none",
      }}
    >
      {loading ? "Criando conta..." : "Criar conta"}
    </button>
  );
}

const inputStyle = {
  width: "100%",
  height: 46,
  border: "1.5px solid #dde4e0",
  borderRadius: 11,
  padding: "0 14px",
  fontSize: 14.5,
  outline: "none",
  background: "#fff",
  transition: "border-color .15s",
  display: "block",
};
