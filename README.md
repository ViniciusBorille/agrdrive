# AgrDrive

Sistema de gerenciamento de usuários e autenticação para a plataforma AgrDrive.

## Tecnologias

- **Frontend/Backend:** [Next.js](https://nextjs.org/) 16 + React 19
- **Banco de dados:** PostgreSQL 16 (via [node-postgres](https://node-postgres.com/))
- **Autenticação:** Sessões por cookie com tokens UUID
- **Email:** Nodemailer sobre SMTP — [Resend](https://resend.com/) em produção, [Mailcatcher](https://mailcatcher.me/) em desenvolvimento
- **Testes:** Jest
- **Infraestrutura local:** Docker Compose

## Pré-requisitos

- Node.js 24+
- Docker e Docker Compose
- npm

## Configuração do ambiente

1. Clone o repositório:

```bash
git clone <url-do-repositorio>
cd agrdrive
```

2. Instale as dependências:

```bash
npm install
```

3. Crie o arquivo de variáveis de ambiente a partir do modelo:

```bash
cp .env.development.example .env.development
```

**Este passo é obrigatório.** Nenhum arquivo `.env` é versionado — o
`compose.yaml`, as migrations e o Jest leem o `.env.development`, então sem
ele nada sobe.

Os valores do modelo já funcionam com o Docker Compose. As únicas variáveis
em branco são `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, necessárias só
para a sincronização com o Google Calendar — o passo a passo para obtê-las
está comentado no próprio arquivo. Sem elas a Agenda de campo funciona como
calendário local; apenas o botão "Conectar ao Google Calendar" falha.

Em produção as variáveis vêm do ambiente da Vercel, não deste arquivo.

4. Suba os serviços de infraestrutura (PostgreSQL + Mailcatcher):

```bash
docker compose -f infra/compose.yaml up -d
```

5. Execute as migrations do banco de dados:

```bash
npm run migrations:up
```

6. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

O servidor estará disponível em `http://localhost:3000`.

## Scripts disponíveis

| Script                      | Descrição                                                   |
| --------------------------- | ----------------------------------------------------------- |
| `npm run dev`               | Inicia Docker, executa migrations e sobe o servidor Next.js |
| `npm test`                  | Executa a suite de testes                                   |
| `npm run migrations:create` | Cria um novo arquivo de migration                           |
| `npm run migrations:up`     | Aplica as migrations pendentes                              |
| `npm run lint:eslint:check` | Verifica o código com ESLint                                |
| `npm run backup:branch`     | Cria um branch de backup no Neon antes de uma migration     |
| `npm run lint:prettier:fix` | Formata o código com Prettier                               |

## Estrutura do projeto

```text
agrdrive/
├── pages/
│   ├── index.js                # Página principal
│   ├── login/                  # Login
│   ├── ativar/                 # Ativação de conta por email
│   ├── recuperar-senha/        # Recuperação de senha
│   ├── tarefas/                # Módulo de Tarefas
│   ├── agenda/                 # Módulo de Agenda de campo
│   ├── indicadores/            # Indicadores
│   ├── usuarios/               # Administração de usuários
│   ├── privacidade/            # Política de privacidade
│   ├── status/                 # Página de status do sistema
│   └── api/v1/                 # Endpoints REST
│       ├── users/              # Gerenciamento de usuários
│       ├── user/               # Usuário da sessão atual
│       ├── sessions/           # Login e logout
│       ├── activations/        # Ativação de conta por email
│       ├── recoveries/         # Recuperação de senha
│       ├── tasks/              # Tarefas
│       ├── visits/             # Compromissos da agenda
│       ├── google-calendar/    # Integração com o Google Calendar
│       ├── migrations/         # Execução de migrations via API
│       └── status/             # Health check
├── components/                 # Componentes compartilhados do front
├── models/                     # Camada de regras de negócio
│   ├── user.js
│   ├── session.js
│   ├── authentication.js
│   ├── authorization.js
│   ├── activation.js
│   ├── recovery.js
│   ├── password.js
│   ├── task.js
│   ├── visit.js
│   └── google-calendar.js
├── infra/                      # Infraestrutura e configurações
│   ├── database.js             # Cliente PostgreSQL
│   ├── controller.js           # Middleware de requisições
│   ├── crypto.js               # Cifragem em repouso (AES-256-GCM)
│   ├── validator.js            # Validação de entrada com Zod
│   ├── email.js                # Serviço de email
│   ├── errors.js               # Classes de erro customizadas
│   ├── logger.js               # Log estruturado
│   ├── migrations/             # Arquivos de migration SQL
│   ├── scripts/                # Scripts de apoio (backup, wait-for-postgres)
│   └── compose.yaml            # Docker Compose (PostgreSQL + Mailcatcher)
├── docs/
│   └── runbooks/               # Procedimentos operacionais
└── tests/
    ├── integration/            # Testes de integração por endpoint
    └── unit/                   # Testes unitários
```

## API

Todos os endpoints estão sob o prefixo `/api/v1`.

### Usuários

| Método  | Endpoint           | Descrição                    |
| ------- | ------------------ | ---------------------------- |
| `POST`  | `/users`           | Cadastra um novo usuário     |
| `GET`   | `/users/:username` | Retorna dados de um usuário  |
| `PATCH` | `/users/:username` | Atualiza dados de um usuário |

O cadastro é feito por quem tem a feature `create:user`; não há rota pública
de auto-cadastro.

### Sessão atual

| Método | Endpoint | Descrição                              |
| ------ | -------- | -------------------------------------- |
| `GET`  | `/user`  | Retorna o usuário dono da sessão atual |

### Sessões

| Método   | Endpoint    | Descrição                       |
| -------- | ----------- | ------------------------------- |
| `POST`   | `/sessions` | Realiza login (cria sessão)     |
| `DELETE` | `/sessions` | Realiza logout (encerra sessão) |

### Ativação de conta

| Método  | Endpoint                 | Descrição                                 |
| ------- | ------------------------ | ----------------------------------------- |
| `PATCH` | `/activations/:token_id` | Ativa a conta via token enviado por email |

### Recuperação de senha

| Método  | Endpoint                | Descrição                                   |
| ------- | ----------------------- | ------------------------------------------- |
| `POST`  | `/recoveries`           | Envia o email de recuperação de senha       |
| `PATCH` | `/recoveries/:token_id` | Redefine a senha a partir do token recebido |

### Tarefas

Exigem a feature `use:tasks`.

| Método   | Endpoint     | Descrição                                              |
| -------- | ------------ | ------------------------------------------------------ |
| `POST`   | `/tasks`     | Cria uma tarefa e atribui responsáveis                 |
| `GET`    | `/tasks`     | Lista tarefas (`?view=assigned&#124;created&#124;all`) |
| `GET`    | `/tasks/:id` | Detalhe (criador ou responsável)                       |
| `PATCH`  | `/tasks/:id` | Atualiza a tarefa (só o criador pode reatribuir)       |
| `DELETE` | `/tasks/:id` | Soft delete (só o criador)                             |

### Agenda de campo

Exigem a feature `use:agenda`.

| Método   | Endpoint      | Descrição                                          |
| -------- | ------------- | -------------------------------------------------- |
| `POST`   | `/visits`     | Cria um compromisso (`sync: true` envia ao Google) |
| `GET`    | `/visits`     | Lista os compromissos do usuário (`?from=&to=`)    |
| `GET`    | `/visits/:id` | Detalhe do compromisso                             |
| `PATCH`  | `/visits/:id` | Atualiza o compromisso                             |
| `DELETE` | `/visits/:id` | Soft delete do compromisso                         |

### Google Calendar

| Método | Endpoint                      | Descrição                                        |
| ------ | ----------------------------- | ------------------------------------------------ |
| `GET`  | `/google-calendar`            | Estado da conexão do usuário                     |
| `GET`  | `/google-calendar/connect`    | Inicia o fluxo OAuth                             |
| `GET`  | `/google-calendar/callback`   | Recebe o `code` e guarda os tokens cifrados      |
| `POST` | `/google-calendar/disconnect` | Revoga o acesso na Google e apaga as credenciais |
| `POST` | `/google-calendar/sync`       | Sincroniza a agenda nos dois sentidos            |

### Sistema

| Método | Endpoint      | Descrição                            |
| ------ | ------------- | ------------------------------------ |
| `GET`  | `/status`     | Retorna o status de saúde do sistema |
| `GET`  | `/migrations` | Lista migrations executadas          |
| `POST` | `/migrations` | Executa migrations pendentes         |

## Banco de dados

O schema é gerenciado por migrations localizadas em `infra/migrations/`.

Tabelas principais:

- **users** — dados dos usuários (username, email, senha hash, features/permissões)
- **sessions** — sessões ativas com token e data de expiração (30 dias)
- **user_activation_tokens** — tokens de ativação de conta por email (15 minutos)
- **tasks** — tarefas do módulo de Tarefas (soft delete via `deleted_at`)
- **visits** — compromissos do módulo de Agenda de campo
- **google_calendar_credentials** — tokens OAuth do Google Calendar, cifrados em repouso

## Segurança

- Senhas com hash bcrypt; sessões por cookie `httpOnly` + `sameSite=lax`.
- Tokens de sessão, ativação e recuperação são guardados no banco apenas
  como hash; o valor em claro só existe no cookie ou no e-mail do usuário.
- Entradas das rotas são validadas com Zod (`infra/validator.js`), que devolve
  400 com mensagem em português via `ValidationError`.
- Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy) são aplicados em `next.config.mjs`.
- Tokens OAuth do Google Calendar são cifrados com AES-256-GCM antes de
  chegar ao banco (`infra/crypto.js`). A chave vem de `ENCRYPTION_KEY`.
  O valor em `.env.development` é público e serve só para desenvolvimento
  e CI — **em produção, gere uma chave própria** e injete por gerenciador
  de segredos:

  ```bash
  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
  ```

  Trocar a chave invalida os tokens já gravados: os usuários precisam
  reconectar a conta do Google.

- O fluxo OAuth é protegido contra CSRF por um `state` aleatório guardado
  em cookie `httpOnly` e conferido no callback.

## Autorização

O sistema utiliza controle de acesso baseado em features. Cada usuário possui um array `features` que define as permissões disponíveis:

- Usuários: `create:user`, `read:user`, `read:user:self`, `read:user:others`,
  `update:user`, `update:user:others`
- Sessão: `create:session`, `read:session`
- Tokens por email: `read:activation_token`, `create:recovery_token`,
  `read:recovery_token`
- Módulos: `use:tasks`, `use:agenda`, `read:indicators`
- Migrations: `create:migration`, `read:migration`
- Sistema: `read:status`, `read:status:all`

## Backup

O banco tem duas camadas de backup, descritas em detalhe no
[runbook de restauração](docs/runbooks/restore.md):

1. **Branch do Neon** (`npm run backup:branch`) — cópia instantânea
   copy-on-write, criada manualmente antes de aplicar migrations. Nenhuma
   migration do projeto tem `down`, então não há volta pelo código.
2. **Dump cifrado fora do Neon** (`.github/workflows/backup.yaml`) — `pg_dump`
   diário às 06:00 UTC, cifrado com GPG (AES-256) e enviado para um bucket
   S3-compatível privado. Protege contra perda da conta ou do projeto.

## Serviços de desenvolvimento

| Serviço          | URL                   |
| ---------------- | --------------------- |
| Aplicação        | http://localhost:3000 |
| PostgreSQL       | localhost:5433        |
| Mailcatcher (UI) | http://localhost:1080 |

## Testes

```bash
# Todos os testes
npm test

# Apenas testes de integração
npm test -- tests/integration

# Apenas testes unitários
npm test -- tests/unit
```

Os testes de integração sobem um servidor Next.js isolado e utilizam um banco de dados dedicado para testes.

## Convenções

- Commits seguem o padrão [Conventional Commits](https://www.conventionalcommits.org/) (validado via commitlint + Commitizen)
- Formatação gerenciada pelo Prettier
- Linting com ESLint
- Hooks de pré-commit via Husky
