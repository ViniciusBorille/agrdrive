import Head from "next/head";
import Link from "next/link";
import Logo from "@/components/Logo";

const LAST_UPDATE = "29 de julho de 2026";
const CONTACT_EMAIL = "viniciusborilledasilva@gmail.com";

const GREEN = "#1c6856";
const INK = "#18211d";
const MUTED = "#5a635e";
const LINE = "#e2e8e4";

function Section({ id, number, title, children }) {
  return (
    <section id={id} style={{ scrollMarginTop: 90, marginBottom: 40 }}>
      <h2
        style={{
          fontSize: 19,
          fontWeight: 700,
          color: INK,
          margin: "0 0 14px",
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span style={{ color: GREEN, fontSize: 14, fontWeight: 600 }}>
          {number}
        </span>
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.75, color: "#33403a" }}>
        {children}
      </div>
    </section>
  );
}

function P({ children }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

function Ul({ children }) {
  return <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>{children}</ul>;
}

function Li({ children }) {
  return <li style={{ marginBottom: 7 }}>{children}</li>;
}

function Strong({ children }) {
  return <strong style={{ fontWeight: 600, color: INK }}>{children}</strong>;
}

function Callout({ tone = "green", title, children }) {
  const tones = {
    green: { bg: "#e9f2ee", border: "#bcd8cd", accent: GREEN },
    amber: { bg: "#fbf6e6", border: "#e6d9a8", accent: "#8a6d0e" },
  };
  const t = tones[tone];
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${t.accent}`,
        borderRadius: 12,
        padding: "16px 18px",
        margin: "0 0 16px",
      }}
    >
      {title && (
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: t.accent,
            marginBottom: 8,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "#33403a" }}>
        {children}
      </div>
    </div>
  );
}

function DataTable({ rows }) {
  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        overflow: "hidden",
        margin: "0 0 16px",
      }}
    >
      {rows.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            padding: "13px 16px",
            background: i % 2 === 0 ? "#fff" : "#f7faf8",
            borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
            fontSize: 14.5,
            lineHeight: 1.65,
          }}
        >
          <div
            style={{
              flex: "0 0 210px",
              fontWeight: 600,
              color: INK,
            }}
          >
            {row.label}
          </div>
          <div style={{ flex: "1 1 300px", color: "#4a544e" }}>{row.value}</div>
        </div>
      ))}
    </div>
  );
}

const INDEX = [
  ["quem-somos", "1. Quem trata os seus dados"],
  ["dados-coletados", "2. Dados que coletamos"],
  ["finalidades", "3. Para que usamos os dados"],
  ["bases-legais", "4. Bases legais (LGPD)"],
  ["google", "5. Integração com o Google Calendar"],
  ["cookies", "6. Cookies"],
  ["compartilhamento", "7. Com quem compartilhamos"],
  ["internacional", "8. Transferência internacional"],
  ["retencao", "9. Por quanto tempo guardamos"],
  ["seguranca", "10. Segurança"],
  ["direitos", "11. Seus direitos"],
  ["menores", "12. Menores de idade"],
  ["incidentes", "13. Incidentes de segurança"],
  ["alteracoes", "14. Alterações desta política"],
  ["contato", "15. Contato"],
];

export default function Privacidade() {
  return (
    <>
      <Head>
        <title>Política de Privacidade · AgrDrive</title>
        <meta
          name="description"
          content="Política de Privacidade do AgrDrive: quais dados coletamos, com que finalidade, por quanto tempo e quais são os seus direitos sob a LGPD."
        />
        <meta name="robots" content="index, follow" />
      </Head>

      <div
        className="ag-privacy"
        style={{ minHeight: "100vh", background: "#eef2ef" }}
      >
        {/* HEADER */}
        <header
          style={{
            background:
              "linear-gradient(160deg,#1f8069 0%,#1c6856 55%,#16523f 100%)",
            padding: "22px 24px 64px",
          }}
        >
          <div
            style={{
              maxWidth: 1060,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Link href="/" style={{ textDecoration: "none" }}>
              <Logo size="md" />
            </Link>
            <Link
              href="/"
              style={{
                color: "rgba(255,255,255,.9)",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,.3)",
                borderRadius: 9,
                padding: "8px 16px",
              }}
            >
              Voltar ao sistema
            </Link>
          </div>

          <div style={{ maxWidth: 1060, margin: "34px auto 0" }}>
            <h1
              style={{
                color: "#fff",
                fontSize: 34,
                fontWeight: 700,
                margin: "0 0 10px",
                letterSpacing: "-0.5px",
              }}
            >
              Política de Privacidade
            </h1>
            <p
              style={{
                color: "rgba(255,255,255,.82)",
                fontSize: 15.5,
                lineHeight: 1.7,
                margin: 0,
                maxWidth: 640,
              }}
            >
              Como o AgrDrive coleta, usa, armazena e protege dados pessoais, em
              conformidade com a Lei nº 13.709/2018 (LGPD) e com a Google API
              Services User Data Policy.
            </p>
            <div
              style={{
                marginTop: 16,
                display: "inline-block",
                background: "rgba(255,255,255,.14)",
                border: "1px solid rgba(255,255,255,.22)",
                borderRadius: 999,
                padding: "6px 14px",
                color: "#fff",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Última atualização: {LAST_UPDATE}
            </div>
          </div>
        </header>

        {/* CONTEÚDO */}
        <div
          style={{
            maxWidth: 1060,
            margin: "-40px auto 0",
            padding: "0 24px 60px",
            display: "flex",
            gap: 28,
            alignItems: "flex-start",
          }}
        >
          {/* ÍNDICE */}
          <nav
            className="ag-privacy-index"
            style={{
              flex: "0 0 236px",
              position: "sticky",
              top: 24,
              background: "#fff",
              border: `1px solid ${LINE}`,
              borderRadius: 14,
              padding: "18px 14px",
              boxShadow: "0 2px 14px rgba(24,33,29,.05)",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "1.4px",
                color: "#9aa39e",
                padding: "0 8px 10px",
              }}
            >
              NESTA PÁGINA
            </div>
            {INDEX.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                style={{
                  display: "block",
                  padding: "7px 8px",
                  fontSize: 13.5,
                  color: MUTED,
                  textDecoration: "none",
                  borderRadius: 7,
                  lineHeight: 1.45,
                }}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* CORPO */}
          <main
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              background: "#fff",
              border: `1px solid ${LINE}`,
              borderRadius: 16,
              padding: "38px 42px",
              boxShadow: "0 2px 18px rgba(24,33,29,.06)",
            }}
            className="ag-privacy-body"
          >
            <Callout tone="amber" title="Sobre a natureza deste projeto">
              O AgrDrive é um <Strong>projeto acadêmico</Strong>, desenvolvido
              com finalidade educacional e de demonstração técnica. Não há
              exploração comercial, venda de dados nem publicidade. Ainda assim,
              como há tratamento de dados pessoais reais de quem se cadastra,
              esta política descreve integralmente e de boa-fé o que o sistema
              faz com esses dados.
            </Callout>

            <Section
              id="quem-somos"
              number="01"
              title="Quem trata os seus dados"
            >
              <P>
                O AgrDrive é um sistema web de gestão de atividades agronômicas,
                disponível em <Strong>https://agrdrive.com.br</Strong>, que
                reúne cadastro de usuários, gestão de tarefas, agenda de visitas
                de campo e indicadores.
              </P>
              <DataTable
                rows={[
                  {
                    label: "Controlador",
                    value:
                      "Vinicius Borille da Silva, pessoa física responsável pelo projeto acadêmico AgrDrive.",
                  },
                  {
                    label: "Encarregado (DPO)",
                    value: `Vinicius Borille da Silva — ${CONTACT_EMAIL}`,
                  },
                  {
                    label: "Canal para titulares",
                    value: `${CONTACT_EMAIL} (art. 18 da LGPD)`,
                  },
                ]}
              />
              <P>
                Ao criar uma conta e utilizar o AgrDrive, você declara ter lido
                e compreendido esta política.
              </P>
            </Section>

            <Section
              id="dados-coletados"
              number="02"
              title="Dados que coletamos"
            >
              <P>
                Coletamos apenas o necessário para o sistema funcionar. Não
                coletamos dados sensíveis (art. 5º, II da LGPD), não usamos
                rastreadores de terceiros e não fazemos qualquer forma de
                perfilamento comportamental.
              </P>

              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                a) Dados de cadastro e conta
              </h3>
              <Ul>
                <Li>
                  <Strong>Nome de usuário</Strong> e <Strong>e-mail</Strong>,
                  informados por você no cadastro.
                </Li>
                <Li>
                  <Strong>Senha</Strong>, armazenada exclusivamente como hash
                  bcrypt. Não guardamos, não conseguimos ler e nunca recuperamos
                  a sua senha em texto legível.
                </Li>
                <Li>
                  <Strong>Permissões de acesso</Strong> (quais módulos a sua
                  conta pode usar) e as datas de criação e atualização do
                  registro.
                </Li>
              </Ul>

              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                b) Dados de autenticação
              </h3>
              <Ul>
                <Li>
                  <Strong>Token de sessão</Strong> aleatório, gravado em cookie
                  e associado à sua conta, com data de expiração.
                </Li>
                <Li>
                  <Strong>Tokens temporários</Strong> de ativação de conta e de
                  recuperação de senha, enviados ao seu e-mail e válidos por 15
                  minutos.
                </Li>
              </Ul>

              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                c) Conteúdo que você cria no sistema
              </h3>
              <Ul>
                <Li>
                  <Strong>Tarefas:</Strong> título, descrição, situação,
                  prioridade, prazo, quem criou e quais usuários foram
                  designados como responsáveis.
                </Li>
                <Li>
                  <Strong>Agenda de campo:</Strong> título do compromisso, nome
                  do cliente ou fazenda, data, horário de início e término, tipo
                  de evento e quem o criou.
                </Li>
              </Ul>
              <Callout tone="amber">
                Ao registrar o nome de um cliente ou de uma propriedade rural em
                uma visita, você pode estar inserindo dados pessoais de
                terceiros. Nessa hipótese, <Strong>você é responsável</Strong>{" "}
                por ter base legal para esse registro e por informar o titular,
                quando aplicável. Registre apenas o que for necessário à sua
                atividade profissional.
              </Callout>

              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                d) Dados técnicos e registros de segurança
              </h3>
              <Ul>
                <Li>
                  <Strong>Endereço IP</Strong>, método HTTP e rota acessada,
                  registrados apenas em eventos relevantes de segurança — como
                  bloqueio por excesso de tentativas de login.
                </Li>
                <Li>
                  O endereço IP também é usado, de forma temporária e em
                  memória, para limitar tentativas de login, cadastros e pedidos
                  de recuperação de senha (proteção contra abuso e força bruta).
                </Li>
              </Ul>
              <P>
                Não utilizamos Google Analytics, pixels de rastreamento,
                fingerprinting ou qualquer ferramenta de publicidade.
              </P>

              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                e) Dados da conta Google (opcional)
              </h3>
              <P>
                Somente se você optar por conectar o Google Calendar. O
                detalhamento está na{" "}
                <a href="#google" style={{ color: GREEN, fontWeight: 600 }}>
                  seção 5
                </a>
                .
              </P>
            </Section>

            <Section
              id="finalidades"
              number="03"
              title="Para que usamos os dados"
            >
              <DataTable
                rows={[
                  {
                    label: "Criar e manter sua conta",
                    value:
                      "Identificar você no sistema, validar o e-mail informado e controlar a quais módulos você tem acesso.",
                  },
                  {
                    label: "Autenticar o acesso",
                    value:
                      "Manter você conectado com segurança e encerrar a sessão quando ela expira.",
                  },
                  {
                    label: "Enviar e-mails operacionais",
                    value:
                      "Ativação de conta e recuperação de senha. Não enviamos marketing, newsletters ou comunicações promocionais.",
                  },
                  {
                    label: "Operar os módulos",
                    value:
                      "Gerenciar tarefas, agenda de visitas de campo e indicadores gerados a partir dos seus próprios registros.",
                  },
                  {
                    label: "Sincronizar a agenda",
                    value:
                      "Refletir suas visitas de campo no seu Google Calendar, quando você autoriza essa integração.",
                  },
                  {
                    label: "Proteger o sistema",
                    value:
                      "Prevenir acessos indevidos, ataques de força bruta e uso abusivo dos formulários públicos.",
                  },
                ]}
              />
              <P>
                <Strong>
                  Não vendemos, alugamos, cedemos nem monetizamos dados pessoais
                  em nenhuma hipótese.
                </Strong>
              </P>
            </Section>

            <Section id="bases-legais" number="04" title="Bases legais (LGPD)">
              <P>
                Todo tratamento realizado pelo AgrDrive tem uma base legal do
                art. 7º da Lei nº 13.709/2018:
              </P>
              <DataTable
                rows={[
                  {
                    label: "Execução de contrato (art. 7º, V)",
                    value:
                      "Cadastro, autenticação, tarefas, agenda e indicadores — sem esses dados o serviço solicitado não existe.",
                  },
                  {
                    label: "Consentimento (art. 7º, I)",
                    value:
                      "Integração com o Google Calendar. É opcional, exige ação explícita sua e pode ser revogada a qualquer momento.",
                  },
                  {
                    label: "Legítimo interesse (art. 7º, IX)",
                    value:
                      "Registros de segurança e limitação de requisições por IP, para proteger as contas dos usuários contra acesso não autorizado.",
                  },
                  {
                    label: "Obrigação legal (art. 7º, II)",
                    value:
                      "Retenção ou apresentação de informações quando exigido por lei ou por ordem de autoridade competente.",
                  },
                ]}
              />
            </Section>

            <Section
              id="google"
              number="05"
              title="Integração com o Google Calendar"
            >
              <P>
                O módulo <Strong>Agenda de campo</Strong> funciona de forma
                totalmente independente como calendário local. A conexão com o
                Google Calendar é um recurso <Strong>opcional</Strong>, ativado
                somente quando você clica em &quot;Conectar ao Google
                Calendar&quot; e autoriza o acesso na tela de consentimento do
                Google.
              </P>

              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                Qual permissão pedimos
              </h3>
              <DataTable
                rows={[
                  {
                    label: "Escopo solicitado",
                    value:
                      "https://www.googleapis.com/auth/calendar.events — permite criar, ler, atualizar e excluir eventos do seu calendário principal.",
                  },
                  {
                    label: "O que fazemos com ele",
                    value:
                      "Criar no seu calendário os compromissos que você cadastra no AgrDrive, atualizá-los e removê-los quando você os altera ou exclui, e importar para o AgrDrive eventos do período exibido na agenda.",
                  },
                  {
                    label: "O que NÃO acessamos",
                    value:
                      "Gmail, Google Drive, Contatos, Fotos, dados de perfil, lista de contatos ou qualquer outro serviço Google. Não pedimos e não temos acesso a nada além dos eventos de calendário.",
                  },
                  {
                    label: "O que armazenamos",
                    value:
                      "Os tokens de acesso e de atualização fornecidos pelo Google, cifrados com AES-256-GCM antes de chegarem ao banco de dados, e o identificador do evento criado, para conseguir atualizá-lo depois.",
                  },
                ]}
              />
              <P>
                Pedimos apenas essa permissão porque é a mínima necessária para
                o recurso funcionar. Não solicitamos escopos adicionais para
                funcionalidades futuras.
              </P>

              <Callout
                tone="green"
                title="Limited Use — Google API Services User Data Policy"
              >
                <P>
                  O uso e a transferência, pelo AgrDrive, de informações
                  recebidas das APIs do Google seguem a{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: GREEN, fontWeight: 600 }}
                  >
                    Google API Services User Data Policy
                  </a>
                  , incluindo os requisitos de <Strong>Limited Use</Strong>. Em
                  termos concretos, isso significa que:
                </P>
                <Ul>
                  <Li>
                    os dados obtidos do Google Calendar são usados{" "}
                    <Strong>exclusivamente</Strong> para prover o módulo Agenda
                    de campo, visível e evidente na interface do sistema;
                  </Li>
                  <Li>
                    esses dados <Strong>não são transferidos</Strong> a
                    terceiros, salvo para prover o próprio recurso, por motivo
                    de segurança ou por exigência legal;
                  </Li>
                  <Li>
                    esses dados <Strong>não são lidos por seres humanos</Strong>
                    , exceto com o seu consentimento expresso, por necessidade
                    de segurança ou por exigência legal;
                  </Li>
                  <Li>
                    esses dados <Strong>nunca</Strong> são vendidos, usados para
                    publicidade, remarketing, análise de crédito ou repassados a
                    corretores de dados.
                  </Li>
                </Ul>
              </Callout>

              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                Como desconectar
              </h3>
              <P>
                A qualquer momento, no próprio módulo Agenda de campo, você pode
                usar a opção de desconectar. Ao fazê-lo, o AgrDrive{" "}
                <Strong>revoga o token junto ao Google</Strong> e{" "}
                <Strong>apaga as credenciais armazenadas</Strong> no nosso banco
                de dados. Os eventos já criados no seu Google Calendar
                permanecem lá, sob o seu controle.
              </P>
              <P>
                Você também pode revogar o acesso diretamente em{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: GREEN, fontWeight: 600 }}
                >
                  myaccount.google.com/permissions
                </a>
                .
              </P>
            </Section>

            <Section id="cookies" number="06" title="Cookies">
              <P>
                O AgrDrive usa apenas{" "}
                <Strong>cookies estritamente necessários</Strong>. Não há
                cookies de publicidade, de analytics ou de terceiros para
                rastreamento — por isso não exibimos banner de consentimento de
                cookies.
              </P>
              <DataTable
                rows={[
                  {
                    label: "Cookie de sessão",
                    value:
                      "Mantém você autenticado. É httpOnly (inacessível a JavaScript), sameSite=lax e transmitido apenas por HTTPS em produção. Expira em até 30 dias.",
                  },
                  {
                    label: "Cookie de estado OAuth",
                    value:
                      "Cookie httpOnly temporário, criado apenas durante a conexão com o Google Calendar, para proteger o fluxo contra ataques CSRF. É descartado ao final do processo.",
                  },
                ]}
              />
              <P>
                Bloquear esses cookies impede o login e o funcionamento do
                sistema.
              </P>
              <P>
                A tipografia do sistema (fonte Poppins) é carregada do serviço
                Google Fonts. Nesse carregamento, o seu endereço IP é recebido
                pelo Google, conforme a{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: GREEN, fontWeight: 600 }}
                >
                  Política de Privacidade do Google
                </a>
                . Nenhum cookie de rastreamento é definido por esse
                carregamento.
              </P>
            </Section>

            <Section
              id="compartilhamento"
              number="07"
              title="Com quem compartilhamos"
            >
              <P>
                Não comercializamos dados. O compartilhamento ocorre apenas com
                os prestadores de infraestrutura necessários à operação, que
                atuam como <Strong>operadores</Strong> nos termos do art. 5º,
                VII da LGPD:
              </P>
              <DataTable
                rows={[
                  {
                    label: "Vercel Inc.",
                    value:
                      "Hospedagem da aplicação. Processa as requisições que você faz ao sistema.",
                  },
                  {
                    label: "Neon LLC",
                    value:
                      "Armazenamento dos registros do sistema em PostgreSQL.",
                  },
                  {
                    label: "Resend",
                    value:
                      "Entrega das mensagens de ativação de conta e recuperação de senha. Recebe o seu endereço de e-mail.",
                  },
                  {
                    label: "Google LLC",
                    value:
                      "Somente se você conectar o Google Calendar, e limitado aos dados dos eventos que você sincroniza.",
                  },
                ]}
              />
              <P>
                Também podemos divulgar informações quando houver{" "}
                <Strong>determinação judicial</Strong> ou requisição de
                autoridade competente, nos limites da lei.
              </P>
            </Section>

            <Section
              id="internacional"
              number="08"
              title="Transferência internacional"
            >
              <P>
                Os provedores acima podem processar e armazenar dados em
                servidores localizados fora do Brasil, inclusive nos Estados
                Unidos. Essas transferências ocorrem com fundamento no art. 33
                da LGPD — em especial nos incisos relativos à execução de
                contrato do qual o titular é parte e ao consentimento específico
                e destacado, no caso da integração com o Google.
              </P>
            </Section>

            <Section
              id="retencao"
              number="09"
              title="Por quanto tempo guardamos"
            >
              <DataTable
                rows={[
                  {
                    label: "Dados de conta",
                    value:
                      "Enquanto a conta existir. Após pedido de exclusão, são removidos no prazo descrito na seção 11.",
                  },
                  {
                    label: "Sessões",
                    value:
                      "Expiram automaticamente em até 30 dias sem uso, com limite máximo absoluto de 90 dias. O logout encerra a sessão imediatamente.",
                  },
                  {
                    label: "Tokens de ativação e recuperação",
                    value: "Válidos por 15 minutos e inutilizáveis após o uso.",
                  },
                  {
                    label: "Tarefas e visitas",
                    value:
                      "Enquanto a conta existir. A exclusão feita pela interface é uma exclusão lógica: o registro deixa de aparecer e de ser acessível pelo sistema, mas permanece marcado como excluído no banco por integridade histórica. A remoção definitiva ocorre mediante solicitação (seção 11) ou com a exclusão da conta.",
                  },
                  {
                    label: "Credenciais do Google Calendar",
                    value:
                      "Até você desconectar a integração ou excluir a conta. Nos dois casos são apagadas do banco.",
                  },
                  {
                    label: "Registros de segurança",
                    value:
                      "Retidos pelo período de retenção de logs da plataforma de hospedagem, apenas para fins de segurança e auditoria.",
                  },
                ]}
              />
              <P>
                A exclusão da conta remove em cascata as tarefas criadas por
                você, as visitas registradas e as credenciais do Google
                Calendar.
              </P>
            </Section>

            <Section id="seguranca" number="10" title="Segurança">
              <P>
                Adotamos medidas técnicas compatíveis com o art. 46 da LGPD:
              </P>
              <Ul>
                <Li>
                  <Strong>Senhas com hash bcrypt</Strong> — nunca armazenadas
                  nem trafegadas em texto claro no banco.
                </Li>
                <Li>
                  <Strong>Tokens OAuth cifrados em repouso</Strong> com
                  AES-256-GCM, de modo que um vazamento do banco não permite
                  acessar o calendário de ninguém.
                </Li>
                <Li>
                  <Strong>Cookies httpOnly e sameSite=lax</Strong>, com
                  transmissão por HTTPS em produção.
                </Li>
                <Li>
                  <Strong>Proteção CSRF</Strong> no fluxo OAuth por parâmetro{" "}
                  <em>state</em> aleatório, validado no retorno.
                </Li>
                <Li>
                  <Strong>Limitação de requisições</Strong> em login, cadastro e
                  recuperação de senha.
                </Li>
                <Li>
                  <Strong>Controle de acesso por permissões</Strong>, de modo
                  que cada usuário só alcança os módulos e registros a que tem
                  direito.
                </Li>
                <Li>
                  <Strong>Segredos fora do código-fonte</Strong>, injetados por
                  variáveis de ambiente do provedor de hospedagem.
                </Li>
              </Ul>
              <P>
                Nenhum sistema é absolutamente seguro. Recomendamos que você use
                uma senha exclusiva e não a compartilhe.
              </P>
            </Section>

            <Section id="direitos" number="11" title="Seus direitos">
              <P>
                O art. 18 da LGPD garante a você, a qualquer momento e sem
                custo:
              </P>
              <Ul>
                <Li>
                  <Strong>Confirmação e acesso</Strong> — saber se tratamos
                  dados seus e obter cópia deles.
                </Li>
                <Li>
                  <Strong>Correção</Strong> — atualizar dados incompletos,
                  inexatos ou desatualizados.
                </Li>
                <Li>
                  <Strong>Anonimização, bloqueio ou eliminação</Strong> de dados
                  desnecessários, excessivos ou tratados em desconformidade com
                  a lei.
                </Li>
                <Li>
                  <Strong>Portabilidade</Strong> a outro fornecedor, mediante
                  requisição expressa.
                </Li>
                <Li>
                  <Strong>
                    Eliminação dos dados tratados com consentimento
                  </Strong>
                  , ressalvadas as hipóteses do art. 16.
                </Li>
                <Li>
                  <Strong>Informação</Strong> sobre com quem compartilhamos seus
                  dados e sobre a possibilidade de não consentir.
                </Li>
                <Li>
                  <Strong>Revogação do consentimento</Strong> — imediata no caso
                  do Google Calendar, pelo próprio sistema.
                </Li>
              </Ul>
              <P>
                Para exercer qualquer um desses direitos, escreva para{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  style={{ color: GREEN, fontWeight: 600 }}
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                a partir do e-mail cadastrado na sua conta. Respondemos em até{" "}
                <Strong>15 dias</Strong>. Podemos solicitar informações
                adicionais para confirmar a sua identidade antes de atender ao
                pedido, como medida de proteção contra fraudes.
              </P>
              <P>
                Você também pode apresentar reclamação à{" "}
                <Strong>Autoridade Nacional de Proteção de Dados (ANPD)</Strong>
                .
              </P>
            </Section>

            <Section id="menores" number="12" title="Menores de idade">
              <P>
                O AgrDrive destina-se a profissionais do setor agrícola e não é
                dirigido a menores de 18 anos. Não coletamos intencionalmente
                dados de crianças ou adolescentes. Se identificarmos um cadastro
                nessa condição sem o consentimento de ao menos um dos pais ou do
                responsável legal, a conta e os dados associados serão
                excluídos.
              </P>
            </Section>

            <Section
              id="incidentes"
              number="13"
              title="Incidentes de segurança"
            >
              <P>
                Em caso de incidente de segurança que possa acarretar risco ou
                dano relevante aos titulares, comunicaremos a ANPD e os
                titulares afetados em prazo razoável, informando a natureza dos
                dados envolvidos, os riscos e as medidas adotadas, conforme o
                art. 48 da LGPD.
              </P>
            </Section>

            <Section
              id="alteracoes"
              number="14"
              title="Alterações desta política"
            >
              <P>
                Esta política pode ser atualizada para refletir mudanças no
                sistema ou na legislação. A data da última atualização fica
                sempre no topo da página. Se passarmos a tratar dados de forma
                significativamente diferente da descrita aqui — em especial se
                passarmos a acessar dados do Google não divulgados nesta versão
                —, avisaremos previamente e solicitaremos novo consentimento
                antes de aplicar a mudança.
              </P>
            </Section>

            <Section id="contato" number="15" title="Contato">
              <P>
                Dúvidas sobre privacidade, pedidos de titular ou comunicação de
                problemas de segurança:
              </P>
              <div
                style={{
                  background: "#f4f7f5",
                  border: `1px solid ${LINE}`,
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div style={{ fontWeight: 600, color: INK, marginBottom: 4 }}>
                  Vinicius Borille da Silva
                </div>
                <div style={{ fontSize: 14, color: MUTED, marginBottom: 10 }}>
                  Controlador e Encarregado pelo Tratamento de Dados Pessoais —
                  AgrDrive
                </div>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  style={{
                    color: GREEN,
                    fontWeight: 600,
                    fontSize: 15,
                    textDecoration: "none",
                  }}
                >
                  {CONTACT_EMAIL}
                </a>
              </div>
            </Section>
          </main>
        </div>

        {/* FOOTER */}
        <footer
          style={{
            borderTop: `1px solid ${LINE}`,
            background: "#fff",
            padding: "26px 24px",
          }}
        >
          <div
            style={{
              maxWidth: 1060,
              margin: "0 auto",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              fontSize: 13.5,
              color: MUTED,
            }}
          >
            <span>
              © {new Date().getFullYear()} AgrDrive — projeto acadêmico.
            </span>
            <Link
              href="/"
              style={{ color: GREEN, fontWeight: 600, textDecoration: "none" }}
            >
              Voltar ao sistema
            </Link>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        .ag-privacy a:hover {
          text-decoration: underline;
        }
        .ag-privacy .ag-privacy-index a:hover {
          background: #f2f6f4;
          color: #1c6856;
          text-decoration: none;
        }
        @media (max-width: 900px) {
          .ag-privacy .ag-privacy-index {
            display: none;
          }
          .ag-privacy .ag-privacy-body {
            padding: 26px 20px !important;
          }
        }
      `}</style>
    </>
  );
}
