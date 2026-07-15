import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Logo from "@/components/Logo";
import PasswordInput from "@/components/PasswordInput";

export default function DefinirNovaSenha() {
  const router = useRouter();
  const { token_id } = router.query;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!password) {
      setError("Informe a nova senha.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/recoveries/${token_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Não foi possível alterar a senha.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 3000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Definir nova senha · AgrDrive</title>
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

          {success ? (
            <div style={{ textAlign: "center" }}>
              <CheckIcon />
              <h1
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  color: "#18211d",
                  margin: "20px 0 8px",
                }}
              >
                Senha alterada com sucesso!
              </h1>
              <p style={{ fontSize: 14, color: "#6b7670", margin: "0 0 24px" }}>
                Você será redirecionado para o login em instantes.
              </p>
              <Link
                href="/login"
                style={{ color: "#1c6856", fontWeight: 600, fontSize: 13.5 }}
              >
                Ir para o login
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
                Definir nova senha
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: "#6b7670",
                  margin: "0 0 26px",
                  lineHeight: 1.6,
                }}
              >
                Escolha uma nova senha com no mínimo 8 caracteres.
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
                  Nova senha
                </label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mín. 8 caracteres"
                  autoComplete="new-password"
                  style={{
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

                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#3a443f",
                    marginBottom: 7,
                  }}
                >
                  Confirmar nova senha
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  style={{
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
                  {loading ? "Salvando..." : "Salvar nova senha"}
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

function CheckIcon() {
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
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1c6856"
        strokeWidth="2.5"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
  );
}
