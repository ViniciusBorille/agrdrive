import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/v1/user")
      .then((r) => {
        if (r.ok) router.replace("/");
      })
      .catch(() => {});
  }, [router]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password) {
      setError("Preencha o e-mail e a senha.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "E-mail ou senha inválidos.");
        return;
      }
      router.push("/");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Entrar · AgrDrive</title>
      </Head>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* LEFT PANEL */}
        <div
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
          className="ag-authpanel"
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
            <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
              <div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: "#ebc22f",
                  }}
                >
                  +1.2k
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "rgba(255,255,255,.65)",
                  }}
                >
                  visitas registradas
                </div>
              </div>
              <div>
                <div
                  style={{ fontSize: 26, fontWeight: 700, color: "#ebc22f" }}
                >
                  38
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "rgba(255,255,255,.65)",
                  }}
                >
                  fazendas atendidas
                </div>
              </div>
              <div>
                <div
                  style={{ fontSize: 26, fontWeight: 700, color: "#ebc22f" }}
                >
                  12
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "rgba(255,255,255,.65)",
                  }}
                >
                  agrônomos ativos
                </div>
              </div>
            </div>
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

            <h1
              style={{
                fontSize: 27,
                fontWeight: 600,
                margin: "0 0 8px",
                color: "#18211d",
              }}
            >
              Entrar na plataforma
            </h1>
            <p
              style={{
                fontSize: 14.5,
                color: "#6b7670",
                margin: "0 0 30px",
              }}
            >
              Acesse com seu e-mail corporativo.
            </p>

            <form onSubmit={handleLogin}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#3a443f",
                  marginBottom: 7,
                }}
              >
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vinicius@empresa.com.br"
                autoComplete="email"
                style={{
                  width: "100%",
                  height: 46,
                  border: "1.5px solid #dde4e0",
                  borderRadius: 11,
                  padding: "0 14px",
                  fontSize: 14.5,
                  outline: "none",
                  marginBottom: 18,
                  background: "#fff",
                  transition: "border-color .15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 7,
                }}
              >
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#3a443f",
                  }}
                >
                  Senha
                </label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: "100%",
                  height: 46,
                  border: "1.5px solid #dde4e0",
                  borderRadius: 11,
                  padding: "0 14px",
                  fontSize: 14.5,
                  outline: "none",
                  marginBottom: 22,
                  background: "#fff",
                  transition: "border-color .15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#1f8069")}
                onBlur={(e) => (e.target.style.borderColor = "#dde4e0")}
              />

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
              Não tem uma conta?{" "}
              <Link
                href="/cadastro"
                style={{ color: "#1c6856", fontWeight: 600 }}
              >
                Criar conta
              </Link>
            </p>
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
      {loading ? "Entrando..." : "Entrar"}
    </button>
  );
}
