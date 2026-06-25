import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Logo from "@/components/Logo";

export default function Ativar() {
  const router = useRouter();
  const { token_id } = router.query;
  const [status, setStatus] = useState("activating");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token_id) return;

    fetch(`/api/v1/activations/${token_id}`, { method: "PATCH" })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          setTimeout(() => router.replace("/login"), 3000);
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(data.message || "Não foi possível ativar sua conta.");
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMessage("Erro de conexão. Tente novamente.");
        setStatus("error");
      });
  }, [token_id, router]);

  return (
    <>
      <Head>
        <title>Ativar conta · AgrDrive</title>
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
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <Logo size="md" variant="dark" />
          </div>

          {status === "activating" && (
            <>
              <Spinner />
              <h1
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  color: "#18211d",
                  margin: "20px 0 8px",
                }}
              >
                Ativando sua conta...
              </h1>
              <p style={{ fontSize: 14, color: "#6b7670", margin: 0 }}>
                Aguarde um momento.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckIcon />
              <h1
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  color: "#18211d",
                  margin: "20px 0 8px",
                }}
              >
                Conta ativada com sucesso!
              </h1>
              <p style={{ fontSize: 14, color: "#6b7670", margin: "0 0 24px" }}>
                Você será redirecionado para o login em instantes.
              </p>
              <button
                onClick={() => router.replace("/login")}
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
            </>
          )}

          {status === "error" && (
            <>
              <ErrorIcon />
              <h1
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  color: "#18211d",
                  margin: "20px 0 8px",
                }}
              >
                Falha na ativação
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: "#c0392b",
                  background: "#fdf0ef",
                  border: "1px solid #f5c6c2",
                  borderRadius: 10,
                  padding: "10px 14px",
                  margin: "0 0 24px",
                  lineHeight: 1.5,
                }}
              >
                {errorMessage}
              </p>
              <button
                onClick={() => router.replace("/login")}
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
                }}
              >
                Ir para o login
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: "50%",
        border: "3px solid #e6ece8",
        borderTopColor: "#1c6856",
        animation: "agSpin 0.8s linear infinite",
        margin: "0 auto",
      }}
    >
      <style jsx global>{`
        @keyframes agSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
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

function ErrorIcon() {
  return (
    <div
      style={{
        width: 60,
        height: 60,
        borderRadius: "50%",
        background: "#fdf0ef",
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
        stroke="#c0392b"
        strokeWidth="2.5"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </div>
  );
}
