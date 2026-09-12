import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Logo from "@/components/Logo";
import LegalFooter from "@/components/LegalFooter";

const GREEN = "#1c6856";
const INK = "#18211d";
const MUTED = "#6b7670";

// Página pública: quem chega aqui está incomodado com o e-mail e não vai
// lembrar a senha. Exigir login seria o mesmo que não oferecer saída.
//
// Nada acontece ao abrir. Cliente de e-mail pré-carrega link, e um
// descadastro no `GET` desligaria a notificação de quem nunca clicou —
// por isso o `useEffect` só lê, e desligar exige o botão.
export default function Descadastro() {
  const router = useRouter();
  const { token } = router.query;

  const [status, setStatus] = useState("loading");
  const [info, setInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [applying, setApplying] = useState(null);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/v1/notifications/unsubscribe/${token}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          setErrorMessage(body.message || "Este link não é mais válido.");
          setStatus("invalid");
          return;
        }

        setInfo(body);
        setStatus("ready");
      })
      .catch(() => {
        setErrorMessage("Erro de conexão. Tente novamente.");
        setStatus("invalid");
      });
  }, [token]);

  const unsubscribe = useCallback(
    async (type) => {
      setApplying(type ?? "ALL");
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/v1/notifications/unsubscribe/${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(type ? { type } : {}),
          },
        );

        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          setErrorMessage(
            body.message || "Não foi possível concluir o descadastro.",
          );
          return;
        }

        setResult(body);
        setStatus("done");
      } catch {
        setErrorMessage("Erro de conexão. Tente novamente.");
      } finally {
        setApplying(null);
      }
    },
    [token],
  );

  return (
    <>
      <Head>
        <title>Parar de receber avisos · AgrDrive</title>
        <meta name="robots" content="noindex" />
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
            maxWidth: 480,
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

          {status === "loading" && <Spinner />}

          {status === "invalid" && (
            <>
              <Title>Este link não vale mais</Title>
              <ErrorBox>{errorMessage}</ErrorBox>
              <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 22px" }}>
                Cada link de descadastro serve uma vez só. Você ainda pode
                ajustar tudo entrando no sistema.
              </p>
              <PrimaryButton
                onClick={() => router.replace("/configuracoes/notificacoes")}
              >
                Ajustar meus avisos
              </PrimaryButton>
            </>
          )}

          {status === "ready" && info && (
            <>
              <Title>Parar de receber avisos por e-mail</Title>
              <p style={{ fontSize: 14.5, color: MUTED, margin: "0 0 24px" }}>
                {info.username}, escolha o que você quer desligar. Nada é
                desligado até você clicar.
              </p>

              {info.types.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  {info.types.map((item) => (
                    <SecondaryButton
                      key={item.type}
                      onClick={() => unsubscribe(item.type)}
                      disabled={applying !== null}
                    >
                      {applying === item.type
                        ? "Desligando..."
                        : `Desligar só "${item.label}"`}
                    </SecondaryButton>
                  ))}
                </div>
              )}

              <PrimaryButton
                onClick={() => unsubscribe(null)}
                disabled={applying !== null}
              >
                {applying === "ALL"
                  ? "Desligando..."
                  : "Desligar todos os avisos"}
              </PrimaryButton>

              {errorMessage && (
                <div style={{ marginTop: 18 }}>
                  <ErrorBox>{errorMessage}</ErrorBox>
                </div>
              )}

              <Note>
                E-mails de ativação de conta e de recuperação de senha continuam
                chegando: eles respondem a um pedido seu e não dependem desta
                configuração.
              </Note>
            </>
          )}

          {status === "done" && result && (
            <>
              <CheckIcon />
              <Title>Pronto, você não recebe mais</Title>

              <div
                style={{
                  background: "#f1f7f3",
                  border: "1px solid #dcebe2",
                  borderRadius: 12,
                  padding: "14px 16px",
                  margin: "0 0 20px",
                  fontSize: 14,
                  color: "#2c6e49",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Desligamos {result.disabled.length === 1 ? "o" : "os"} aviso
                  {result.disabled.length === 1 ? "" : "s"}:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {result.disabled.map((item) => (
                    <li key={item.type} style={{ marginBottom: 3 }}>
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Caminho de volta: descadastro por engano não pode virar
                  um beco sem saída. */}
              <p style={{ fontSize: 14, color: MUTED, margin: "0 0 22px" }}>
                Foi sem querer? Dá para religar quando quiser, com as mesmas
                antecedências que você já tinha.
              </p>

              <PrimaryButton
                onClick={() => router.replace("/configuracoes/notificacoes")}
              >
                Voltar e reativar
              </PrimaryButton>

              <Note>
                E-mails de ativação de conta e de recuperação de senha continuam
                chegando: eles respondem a um pedido seu e não dependem desta
                configuração.
              </Note>
            </>
          )}

          <LegalFooter />
        </div>
      </div>
    </>
  );
}

function Title({ children }) {
  return (
    <h1
      style={{
        fontSize: 21,
        fontWeight: 600,
        color: INK,
        margin: "20px 0 8px",
      }}
    >
      {children}
    </h1>
  );
}

function Note({ children }) {
  return (
    <p
      style={{
        fontSize: 12.5,
        color: "#8a938e",
        lineHeight: 1.6,
        margin: "22px 0 0",
        borderTop: "1px solid #eef1ef",
        paddingTop: 14,
      }}
    >
      {children}
    </p>
  );
}

function ErrorBox({ children }) {
  return (
    <p
      style={{
        fontSize: 14,
        color: "#c0392b",
        background: "#fdf0ef",
        border: "1px solid #f5c6c2",
        borderRadius: 10,
        padding: "10px 14px",
        margin: "0 0 18px",
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 46,
        padding: "0 24px",
        background: disabled ? "#a9b2ad" : GREEN,
        color: "#fff",
        fontSize: 14.5,
        fontWeight: 600,
        borderRadius: 11,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 44,
        marginBottom: 9,
        padding: "0 20px",
        background: "#fff",
        color: disabled ? "#a9b2ad" : GREEN,
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 11,
        border: "1.5px solid #cfd8d3",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
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
        borderTopColor: GREEN,
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
        stroke={GREEN}
        strokeWidth="2.5"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
  );
}
