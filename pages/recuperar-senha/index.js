import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!email.trim()) {
      setError("Informe o seu e-mail.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/recoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Não foi possível enviar o e-mail.");
        return;
      }
      setSent(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Recuperar senha · AgrDrive</title>
      </Head>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f7f5",
          padding: "40px 24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#fff",
            borderRadius: 18,
            boxShadow: "0 8px 32px rgba(0,0,0,.08)",
            padding: "44px 40px",
          }}
        >
          <div style={{ marginBottom: 28, textAlign: "center" }}>
            <Logo size="md" variant="dark" />
          </div>

          {sent ? (
            <div style={{ textAlign: "center" }}>
              <MailIcon />
              <h1
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  color: "#18211d",
                  margin: "20px 0 8px",
                }}
              >
                Verifique seu e-mail
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: "#6b7670",
                  margin: "0 0 24px",
                  lineHeight: 1.6,
                }}
              >
                Se o e-mail <strong>{email.trim()}</strong> estiver cadastrado,
                você receberá um link para definir uma nova senha. O link expira
                em 15 minutos.
              </p>
              <Link
                href="/login"
                style={{ color: "#1c6856", fontWeight: 600, fontSize: 13.5 }}
              >
                Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  margin: "0 0 8px",
                  color: "#18211d",
                }}
              >
                Recuperar senha
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: "#6b7670",
                  margin: "0 0 26px",
                  lineHeight: 1.6,
                }}
              >
                Informe o e-mail da sua conta e enviaremos um link para você
                definir uma nova senha.
              </p>

              <form onSubmit={handleSubmit}>
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

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: 48,
                    background: "#1c6856",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    borderRadius: 11,
                    boxShadow: "0 6px 16px rgba(28,104,86,.28)",
                    opacity: loading ? 0.7 : 1,
                    cursor: loading ? "default" : "pointer",
                    border: "none",
                  }}
                >
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </button>
              </form>

              <p
                style={{
                  marginTop: 22,
                  fontSize: 13.5,
                  color: "#6b7670",
                  textAlign: "center",
                }}
              >
                Lembrou a senha?{" "}
                <Link
                  href="/login"
                  style={{ color: "#1c6856", fontWeight: 600 }}
                >
                  Voltar para o login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MailIcon() {
  return (
    <div
      style={{
        width: 60,
        height: 60,
        borderRadius: "50%",
        background: "#e6f1ea",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto",
      }}
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1c6856"
        strokeWidth="2"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    </div>
  );
}
