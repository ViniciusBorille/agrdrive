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

## Parte B — autenticar o domínio (AG-116)

Sem isso, tudo o que foi construído no épico não chega. E o modo de falhar
é silencioso: ninguém reclama de e-mail que não recebeu, e o cliente
conclui que a funcionalidade não funciona.

### B1. Descobrir o que roda hoje

As variáveis `EMAIL_SMTP_*` vivem no ambiente da Vercel e não estão no
repositório. Antes de escolher qualquer coisa, veja o que já existe:

**Settings → Environment Variables**, e anote `EMAIL_SMTP_HOST`,
`EMAIL_SMTP_PORT` e `EMAIL_FROM`.

Pode ser que o provedor atual já resolva e o trabalho seja só de DNS.

### B2. Escolher o provedor, se o atual não servir

Candidatos: Resend, SendGrid, Amazon SES, Postmark. Critérios que
importam aqui:

- domínio próprio com DKIM (não "envie pelo nosso domínio");
- cota compatível com a projeção do B6;
- webhook de bounce e log de entrega — sem isso o B7 não tem como existir;
- painel que mostre a mensagem entregue, não só "aceita".

> **Antes de culpar o código:** `infra/email.js` usa
> `secure: NODE_ENV === "production"`, o que significa TLS direto na porta
> **465**. Provedor que espera STARTTLS na **587** não vai conectar, e o
> sintoma parece bug da aplicação. Se o provedor escolhido usar 587, o
> ajuste é em `infra/email.js` — me chame que eu faço.
>
> Se o provedor tiver **API HTTP**, vale considerar trocar o SMTP por ela:
> numa função serverless o handshake SMTP é lento e a conexão não se
> reaproveita entre invocações.

### B3. Publicar os registros de DNS

No painel de DNS de `agrdrive.com.br`. Os valores exatos saem do provedor;
a forma é esta:

**SPF** — autoriza o provedor a enviar pelo domínio. Se já existir um
registro `v=spf1`, **edite o existente**; dois registros SPF invalidam um
ao outro.

```
Tipo: TXT   Nome: @   Valor: v=spf1 include:<host-do-provedor> ~all
```

> SPF tem limite de **10 consultas de DNS**. Cada `include:` conta, e
> encadear vários serviços estoura o limite silenciosamente — a validação
> inteira cai, sem mensagem de erro em lugar nenhum.

**DKIM** — assina as mensagens. Quase sempre são CNAMEs que o provedor
entrega prontos:

```
Tipo: CNAME   Nome: <seletor>._domainkey   Valor: <fornecido pelo provedor>
```

**DMARC** — diz ao destinatário o que fazer quando SPF e DKIM falham.
Comece observando, sem bloquear nada:

```
Tipo: TXT   Nome: _dmarc   Valor: v=DMARC1; p=none; rua=mailto:dmarc@agrdrive.com.br; fo=1
```

> **Não comece em `p=reject`.** Com a configuração ainda verde, isso
> bloqueia o seu próprio e-mail de recuperação de senha e tranca todo mundo
> para fora do sistema. Suba por etapas: `p=none` → leia os relatórios por
> uma ou duas semanas → `p=quarantine` → só então considere `p=reject`.

### B4. Validar com ferramenta externa

Depois da propagação (minutos a algumas horas), confira em um validador
público de SPF/DKIM/DMARC ou mandando um e-mail para um serviço de
avaliação de entregabilidade. Os três precisam passar; DKIM em especial
costuma falhar por seletor errado.

### B5. Testar em caixa de entrada de verdade

"Enviado sem erro" não é teste. Crie uma conta no **Gmail** e uma no
**Outlook**, cadastre as duas no sistema, configure um aviso e deixe o
disparo rodar.

O que conferir em cada uma:

- chegou na **caixa de entrada**, não em Promoções nem em Spam;
- o remetente aparece sem aviso de "não verificado";
- o botão nativo **Cancelar inscrição** aparece ao lado do remetente —
  é o `List-Unsubscribe` da AG-115 funcionando, e ele vale muito para a
  reputação: quem usa esse botão não usa o de spam;
- o link do rodapé abre `/descadastro/<token>` e desliga o aviso.

### B6. Comparar a cota com o volume

A projeção é **usuários × tipos ativos × lembretes por tipo**, por evento
avisado. Com o padrão do catálogo (3 dias e 1 dia para tarefas; 1 dia e 2
horas para agenda), cada tarefa com prazo gera 2 e-mails por responsável, e
o teto por tipo é 5.

Lembre que o envio é **agrupado por usuário**: tudo o que vence no mesmo
lembrete vira uma mensagem só, não uma por item. Isso reduz bastante o
número real.

### B7. Tratar bounce e reclamação

**Este item exige código, e ele ainda não existe.** Endereço que rejeita
permanentemente precisa parar de receber, senão a reputação do domínio cai
por causa de um único usuário.

O caminho natural é um webhook do provedor que desligue as preferências
daquele endereço — a mesma operação que a AG-115 já implementou em
`models/notification-unsubscribe.js`. Quando escolher o provedor, me diga
qual é e eu implemento o webhook.

### B8. Registrar o que mudou

- Provedor de produção documentado no `README.md`.
- Variáveis novas acrescentadas ao `.env.development.example`, **em
  branco**, como já foi feito com as do Google.

---

## Checklist

**AG-112**

- [ ] Segredo gerado
- [ ] `NOTIFICATIONS_DISPATCH_SECRET` na Vercel (Production)
- [ ] Redeploy feito depois de salvar a variável
- [ ] `NOTIFICATIONS_DISPATCH_SECRET` nos secrets do GitHub, valor idêntico
- [ ] Modo seco respondeu 200
- [ ] `workflow_dispatch` executado com sucesso (só depois da AG-116)
- [ ] Execução automática confirmada na hora seguinte

**AG-116**

- [ ] Provedor atual levantado no ambiente da Vercel
- [ ] Provedor definido e documentado no README
- [ ] SPF publicado (registro único, dentro do limite de 10 consultas)
- [ ] DKIM publicado e validado
- [ ] DMARC em `p=none` com `rua` recebendo relatórios
- [ ] Validação externa passando nos três
- [ ] Teste real chegando na caixa de entrada do Gmail e do Outlook
- [ ] Botão nativo de cancelar inscrição aparecendo
- [ ] Cota comparada com a projeção de volume
- [ ] Webhook de bounce implementado
- [ ] Variáveis novas em `.env.development.example`
- [ ] DMARC promovido a `p=quarantine` com relatórios limpos
