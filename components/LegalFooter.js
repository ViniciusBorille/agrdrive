import Link from "next/link";

// Link para a Política de Privacidade nas telas públicas (login, ativação e
// recuperação de senha). A Google API Services User Data Policy exige que a
// política seja facilmente acessível antes de o usuário criar conta ou
// autorizar o acesso ao Google Calendar.
export default function LegalFooter({ align = "center", style }) {
  return (
    <p
      style={{
        marginTop: 22,
        marginBottom: 0,
        fontSize: 12.5,
        lineHeight: 1.6,
        color: "#8a938e",
        textAlign: align,
        ...style,
      }}
    >
      Ao usar o AgrDrive você concorda com a{" "}
      <Link
        href="/privacidade"
        style={{ color: "#1c6856", fontWeight: 600, textDecoration: "none" }}
      >
        Política de Privacidade
      </Link>
      .
    </p>
  );
}
