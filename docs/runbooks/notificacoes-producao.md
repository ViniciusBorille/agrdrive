# Runbook: colocar as notificações em produção

O código do épico AG-107 está pronto e testado (AG-108 a AG-115). O que
falta é infraestrutura, fora do repositório: ligar o agendador (AG-112) e
autenticar o domínio de envio (AG-116).

> **A ordem importa.** Ligar o disparo de hora em hora antes de autenticar
> o domínio faz o primeiro lote sair em massa de um domínio sem SPF nem
> DKIM — que é exatamente o padrão que filtro de spam procura. Uma
> reputação queimada leva semanas para recuperar e derruba junto o e-mail
> de recuperação de senha.
>
> Por isso o roteiro abaixo está intercalado: a parte A vai até o teste em
> **modo seco**, que não envia nada; a parte B autentica o domínio; só
> então a parte A é concluída.

## Pré-requisito: migrations **antes** do deploy

> ⚠️ **Esta ordem não é preferência, é requisito.** Este projeto não aplica
> migrations no deploy — não há `vercel.json` nem passo de build que faça
> isso. Subir o código antes de migrar quebra o **cadastro de usuário**,
> não só a tela de notificações.
>
> O motivo está em `models/user.js`: desde o commit `203e994`, criar
> usuário grava as preferências padrão de notificação, porque quem nasce
> sem linha nunca é apurado pelo agendador. Sem as tabelas, esse `INSERT`
> lança e o erro sobe — uma operação que funcionava antes passa a falhar.
> Aconteceu de verdade na primeira subida deste épico.

Antes de qualquer coisa, o backup. **Nenhuma migration deste projeto tem
`down`**, então não existe volta pelo código:

```bash
npm run backup:branch -- antes-das-notificacoes
```

Depois aplique as migrations no banco de destino. Não use
`npm run migrations:up`: aquele script força `--envPath .env.development` e
apontaria para o Postgres local.

```bash
DATABASE_URL="<url-do-neon>" npx node-pg-migrate -m infra/migrations up
```

Alternativa pelo próprio sistema, para usuário com a feature
`create:migration` — `GET` na mesma rota lista o que está pendente sem
escrever nada, e é o diagnóstico mais rápido quando uma tela reclama:

```bash
curl -X POST "https://agrdrive.com.br/api/v1/migrations" -H "Cookie: session_id=<cookie>"
```

Só então confira os dois pontos que dependem do deploy:

- **O endpoint existe.** `/api/v1/notifications/dispatch` só responde
  depois que o código estiver na `main` e a Vercel tiver feito o deploy.
  Antes disso, a chamada devolve 404, não 401.
- **O workflow está na branch padrão.** O GitHub só executa `schedule` a
  partir do arquivo que está na branch padrão. Com
  `.github/workflows/notifications.yaml` apenas numa branch de trabalho, o
  cron não roda nem aparece na aba Actions.

> **Se a Vercel usar o mesmo banco para preview e produção** — que é o
> padrão, a menos que você tenha separado —, migrar "no staging" já mexe na
> produção. Não é problema, mas torna o backup acima obrigatório, e não
> recomendado.

## Parte A — ligar o agendador (AG-112)

O agendamento vive no GitHub Actions, não no Vercel Cron, porque o plano
gratuito da Vercel dispara uma vez por dia — com `send_at_time` e fuso por
usuário, "às 08:00" seria mentira para quase todo mundo. O workflow está
em `.github/workflows/notifications.yaml` e roda de hora em hora.

Enquanto `NOTIFICATIONS_DISPATCH_SECRET` não existir na Vercel, o endpoint
responde 401 a qualquer chamada. Ele é fechado por padrão, não aberto — um
deploy sem a variável não vira porta destrancada. Nada dispara até você
concluir os passos abaixo.

### A1. Gerar o segredo

Qualquer string serve — a comparação é feita sobre o SHA-256 dos dois
lados, em tempo constante. Use algo com entropia real:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Guarde o valor: ele vai para dois lugares e precisa ser idêntico nos dois.

### A2. Publicar o segredo na Vercel

No projeto na Vercel: **Settings → Environment Variables → Add New**.

| Campo       | Valor                                           |
| ----------- | ----------------------------------------------- |
| Key         | `NOTIFICATIONS_DISPATCH_SECRET`                 |
| Value       | o valor gerado no A1                            |
| Environment | Production (marque Preview só se for testar lá) |

> **A pegadinha:** variável de ambiente na Vercel só passa a valer em um
> **novo deployment**. Depois de salvar, vá em Deployments e use
> _Redeploy_ no deployment atual de produção. Sem isso o endpoint continua
> respondendo 401 e você vai procurar o erro no lugar errado.

### A3. Publicar o mesmo segredo no GitHub

No repositório: **Settings → Secrets and variables → Actions → New
repository secret**.

| Campo  | Valor                                 |
| ------ | ------------------------------------- |
| Name   | `NOTIFICATIONS_DISPATCH_SECRET`       |
| Secret | **o mesmo valor** publicado na Vercel |

Opcionalmente, na aba _Variables_ da mesma tela, crie
`NOTIFICATIONS_DISPATCH_URL` para apontar o disparo a um preview em vez da
produção. Sem ela, o workflow usa
`https://agrdrive.com.br/api/v1/notifications/dispatch`.

### A4. Conferir em modo seco (não envia nada)

O endpoint aceita `?dry_run=true`: ele apura e responde o que faria, sem
reservar e sem enviar. Existe justamente para depurar em produção sem
transformar a investigação em e-mail na caixa do cliente.

```bash
curl -sS -X POST "https://agrdrive.com.br/api/v1/notifications/dispatch?dry_run=true" -H "Authorization: Bearer SEU_SEGREDO"
```

Resposta esperada:

```json
{
  "dry_run": true,
  "would_reserve": 0,
  "would_skip": 0,
  "already_queued": 0,
  "duration_ms": 137
}
```

Como ler o resultado:

- **HTTP 200 com esse corpo** — a autenticação e o banco estão de pé. Pode
  seguir para a parte B.
- **HTTP 401** — o segredo diverge entre o que você mandou e o que está na
  Vercel, ou o redeploy do A2 não foi feito.
- **HTTP 405** — você mandou `GET`. O endpoint só aceita `POST`.
- **`would_reserve` maior que zero** — já existem avisos vencidos
  esperando. Normal se houver tarefas com prazo próximo; significa que o
  primeiro disparo real vai mandar e-mail de verdade. Mais um motivo para
  fazer a parte B antes.

**Pare aqui e faça a parte B.** Só volte ao A5 depois que o domínio estiver
autenticado.

### A5. Primeiro disparo real

No repositório: **Actions → Disparo de notificações → Run workflow**.

O workflow falha alto de propósito em três situações: segredo ausente,
resposta diferente de 200, ou `failed` maior que zero no corpo. Esse
último é o que importa — o endpoint responde 200 mesmo com entregas
falhas, porque o disparo funcionou e foram as entregas que não. Uma
entrega que esgotou as três tentativas não será retentada, então a falha
do workflow é o único caminho pelo qual isso chega a uma pessoa.

Confira no log a linha `HTTP 200` e o resumo:

```json
{
  "reserved": 3,
  "skipped": 0,
  "sent": 3,
  "retrying": 0,
  "failed": 0,
  "recipients": 2,
  "duration_ms": 1841
}
```

### A6. Confirmar que o horário pegou

O `cron: "0 * * * *"` só começa a valer depois que o workflow existe na
branch padrão. Volte em Actions uma hora depois e confirme que apareceu uma
execução que você não disparou à mão.

> ⚠️ **Lembrete de 60 dias.** O GitHub desativa workflows agendados em
> repositórios sem atividade por 60 dias. O cron para sem erro e sem aviso
> — num sistema de notificação esse é o pior modo de falha, porque ninguém
> reclama de e-mail que não chegou. Se o repositório for ficar parado,
> confira este workflow ou use o `workflow_dispatch` para reativá-lo.

---

## Parte B — entregabilidade com o Resend (AG-116)

Sem isto, tudo o que foi construído no épico não chega. E o modo de falhar
é silencioso: ninguém reclama de e-mail que não recebeu, e o cliente
conclui que a funcionalidade não funciona.

### B0. Onde já estamos

O Resend **já é o provedor**: manda a ativação de conta e a recuperação de
senha, e está declarado na política de privacidade. Isso responde sozinho
os dois primeiros passos que a issue previa — levantar o que roda hoje e
escolher provedor — e provavelmente boa parte do DNS.

Provavelmente, porque o Resend só deixa enviar a partir do seu domínio
depois de verificá-lo, e verificar significa **SPF e DKIM já publicados**.
Se a ativação de conta chega hoje na caixa de entrada de endereços
quaisquer, esses dois registros existem.

O que sobra é menor que a issue original sugeria, mas não é zero — e a
parte que sobra é justamente a que separa e-mail transacional de e-mail em
lote.

### B1. Conferir se o remetente bate com o domínio verificado

No painel do Resend, em **Domains**: o domínio precisa estar _Verified_.
Anote **qual** domínio está lá — raiz (`agrdrive.com.br`) ou subdomínio
(`send.agrdrive.com.br`), que é o padrão que o Resend sugere.

Agora, no ambiente da Vercel, confira `EMAIL_FROM`. Quando a variável não
existe, o código cai em `AgrDrive <contato@agrdrive.com.br>`. **Os dois
precisam falar do mesmo domínio.** Se o Resend verificou
`send.agrdrive.com.br` e o `EMAIL_FROM` diz `@agrdrive.com.br`, o envio é
recusado ou cai direto em spam.

Confira também `EMAIL_SMTP_PORT`. O código usa
`secure: NODE_ENV === "production"`, que é TLS direto na porta **465**. O
Resend aceita 465, então deve estar certo — mas se a porta configurada for
587, que é STARTTLS, a conexão não se estabelece e o sintoma parece bug da
aplicação.

### B2. DMARC, que o Resend não publica por você

SPF e DKIM saem da verificação do domínio. **DMARC não** — é registro seu,
e é o que mais pesa quando o volume deixa de ser reativo.

```text
Tipo: TXT   Nome: _dmarc   Valor: v=DMARC1; p=none; rua=mailto:dmarc@agrdrive.com.br; fo=1
```

> **Não comece em `p=reject`.** Com a configuração ainda verde, isso
> bloqueia o seu próprio e-mail de recuperação de senha e tranca todo mundo
> para fora do sistema. Suba por etapas: `p=none` → leia os relatórios por
> uma ou duas semanas → `p=quarantine` → só então considere `p=reject`.

Se já existir um registro `v=spf1` no domínio, confira que ele não foi
duplicado quando o Resend foi configurado: dois registros SPF invalidam um
ao outro, e o limite de **10 consultas de DNS** estoura em silêncio.

### B3. Conferir se o `List-Unsubscribe` sobrevive ao provedor

Os cabeçalhos da AG-115 são montados em `models/notification-templates.js`
e entregues ao nodemailer. Falta confirmar que o Resend os repassa em vez
de reescrevê-los com os dele.

Mande um aviso de verdade para uma conta no Gmail e abra o original da
mensagem. Você precisa ver:

- `List-Unsubscribe` apontando para
  `/api/v1/notifications/unsubscribe/<token>` do **seu** domínio;
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`;
- o botão nativo **Cancelar inscrição** ao lado do remetente.

Se o Resend substituir o cabeçalho pelo dele, o botão continua
funcionando, mas quem processa o descadastro passa a ser o Resend e o
sistema não fica sabendo — a pessoa continuaria marcada como ativa na tela
de notificações. Nesse caso me chame: dá para resolver desligando o
gerenciamento de inscrição do lado deles, ou tratando o webhook.

### B4. Comparar a cota com o volume

Confira o plano no painel, porque os números mudam. Hoje o gratuito do
Resend é da ordem de **3.000 mensagens por mês e 100 por dia**.

O teto diário é o que merece atenção, e é uma mudança de natureza, não de
grau: ativação e recuperação são reativas e esparsas; aviso agendado sai
em lote, concentrado no horário que os usuários escolheram. Um pico às
08:00 pode consumir a cota do dia inteiro de uma vez.

A projeção é **usuários × tipos ativos × lembretes por tipo**, por evento
avisado. O agrupamento ajuda bastante: tudo o que vence no mesmo lembrete
vira uma mensagem só por usuário, não uma por item.

### B5. Bounce e reclamação — isto exige código

Endereço que rejeita permanentemente precisa parar de receber, senão a
reputação do domínio cai por causa de um único usuário.

O Resend emite eventos de webhook para isso (`email.bounced`,
`email.complained`), assinados. **O endpoint que os recebe ainda não
existe.** A operação de desligar já existe, em
`models/notification-unsubscribe.js` — falta o webhook que a chama.

Quando você quiser, eu implemento: é criar a rota, validar a assinatura e
desligar as preferências do endereço que rejeitou.

### B6. Registrar o que ficou decidido

- Provedor documentado no `README.md`, que hoje só menciona o Mailcatcher
  de desenvolvimento.
- Política de privacidade: a entrada do Resend fala apenas em ativação e
  recuperação. Com o épico, ele passa a entregar aviso agendado também.

---

## Checklist

**Pré-requisito** — nesta ordem

- [ ] Backup do Neon criado (`npm run backup:branch`)
- [ ] Migrations aplicadas no banco de destino
- [ ] Épico na `main` e deploy feito na Vercel
- [ ] `.github/workflows/notifications.yaml` na branch padrão
- [ ] Cadastro de usuário conferido depois do deploy

**AG-112**

- [x] Segredo gerado
- [x] `NOTIFICATIONS_DISPATCH_SECRET` na Vercel (Production)
- [x] `NOTIFICATIONS_DISPATCH_SECRET` nos secrets do GitHub, valor idêntico
- [ ] Redeploy feito **depois** de salvar a variável
- [ ] Modo seco respondeu 200
- [ ] `workflow_dispatch` executado com sucesso (só depois da AG-116)
- [ ] Execução automática confirmada na hora seguinte

**AG-116** — o Resend já é o provedor, o que dispensa escolher e
provavelmente já resolveu SPF e DKIM

- [x] Provedor atual levantado: Resend, já em uso para ativação e recuperação
- [ ] Domínio aparece como _Verified_ no painel do Resend
- [ ] `EMAIL_FROM` na Vercel usa o mesmo domínio verificado
- [ ] `EMAIL_SMTP_PORT` é 465, coerente com `secure: true` em produção
- [ ] SPF único no domínio, dentro do limite de 10 consultas
- [ ] DKIM validado
- [ ] DMARC em `p=none` com `rua` recebendo relatórios
- [ ] `List-Unsubscribe` do AgrDrive chegando intacto, conferido no original da mensagem
- [ ] Teste real na caixa de entrada do Gmail e do Outlook
- [ ] Botão nativo de cancelar inscrição aparecendo
- [ ] Cota diária comparada com o pico do horário de envio
- [ ] Webhook de bounce implementado (falta código)
- [ ] Provedor documentado no README
- [ ] Política de privacidade citando o aviso agendado
- [ ] DMARC promovido a `p=quarantine` com relatórios limpos
