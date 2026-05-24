# AgrDrive

Sistema de gerenciamento de usuários e autenticação para a plataforma AgrDrive.

## Tecnologias

- **Frontend/Backend:** [Next.js](https://nextjs.org/) 16 + React 19
- **Banco de dados:** PostgreSQL 16 (via [node-postgres](https://node-postgres.com/))
- **Autenticação:** Sessões por cookie com tokens UUID
- **Email:** Nodemailer + Mailcatcher (desenvolvimento)
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

3. Configure as variáveis de ambiente copiando o arquivo de exemplo:

```bash
cp .env.development .env.development.local
```

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
| `npm run lint:prettier:fix` | Formata o código com Prettier                               |

## Estrutura do projeto

```
agrdrive/
├── pages/
│   ├── index.js                # Página principal
│   ├── status/                 # Página de status do sistema
│   └── api/v1/                 # Endpoints REST
│       ├── users/              # Gerenciamento de usuários
│       ├── sessions/           # Login e logout
│       ├── activations/        # Ativação de conta por email
│       ├── migrations/         # Execução de migrations via API
│       └── status/             # Health check
├── models/                     # Camada de regras de negócio
│   ├── user.js
│   ├── session.js
│   ├── authentication.js
│   ├── authorization.js
│   ├── activation.js
│   └── password.js
├── infra/                      # Infraestrutura e configurações
│   ├── database.js             # Cliente PostgreSQL
│   ├── controller.js           # Middleware de requisições
│   ├── email.js                # Serviço de email
│   ├── errors.js               # Classes de erro customizadas
│   ├── migrations/             # Arquivos de migration SQL
│   └── compose.yaml            # Docker Compose (PostgreSQL + Mailcatcher)
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

### Sessões

| Método   | Endpoint    | Descrição                       |
| -------- | ----------- | ------------------------------- |
| `POST`   | `/sessions` | Realiza login (cria sessão)     |
| `DELETE` | `/sessions` | Realiza logout (encerra sessão) |

### Ativação de conta

| Método  | Endpoint                 | Descrição                                 |
| ------- | ------------------------ | ----------------------------------------- |
| `PATCH` | `/activations/:token_id` | Ativa a conta via token enviado por email |

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

## Autorização

O sistema utiliza controle de acesso baseado em features. Cada usuário possui um array `features` que define as permissões disponíveis:

- `create:user`, `read:user`, `update:user`
- `create:session`, `read:session`
- `read:activation_token`
- `read:migrator`, `run:migrator`
- `read:system`

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
