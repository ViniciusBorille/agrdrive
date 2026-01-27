import Head from "next/head";
import Link from "next/link";

export default function EmDesenvolvimento() {
  return (
    <>
      <Head>
        <title>Em desenvolvimento</title>
      </Head>

      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.badge}>🚧 Em desenvolvimento</div>

          <h1 style={styles.title}>Estamos construindo esta página</h1>
          <p style={styles.text}>
            Esta seção ainda está sendo preparada. Volte em breve 🙂
          </p>

          <div style={styles.actions}>
            <Link href="/" style={{ ...styles.button, ...styles.primary }}>
              Voltar para o início
            </Link>

            <Link
              href="/contato"
              style={{ ...styles.button, ...styles.secondary }}
            >
              Falar com a gente
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background:
      "radial-gradient(1200px 600px at 50% 0%, rgba(218,165,32,0.18), transparent 60%), #070707",
    color: "#fff",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
  },
  card: {
    width: "min(720px, 100%)",
    borderRadius: 18,
    padding: "28px 26px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
  },
  badge: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(218,165,32,0.18)",
    border: "1px solid rgba(218,165,32,0.35)",
    color: "#F5D37A",
    fontWeight: 700,
    marginBottom: 14,
  },
  title: { fontSize: 34, lineHeight: 1.1, margin: "8px 0 10px" },
  text: { opacity: 0.9, fontSize: 16, lineHeight: 1.6, margin: "0 0 18px" },
  actions: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 700,
  },
  primary: { background: "#DAA520", color: "#0b0b0b" },
  secondary: {
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.14)",
  },
};
