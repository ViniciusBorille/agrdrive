# Runbook: restaurar o banco a partir do backup

Procedimento para trazer o banco de produção de volta depois de uma
migration destrutiva, uma exclusão acidental ou a perda do projeto no
Neon.

O projeto tem duas camadas de backup, e a escolha entre elas é a primeira
decisão a tomar:

| Situação                                              | Camada   | Tempo típico       |
| ----------------------------------------------------- | -------- | ------------------ |
| Erro nosso (migration ruim, `DELETE` sem `WHERE`)     | Camada 1 | minutos            |
| Perda da conta, projeto apagado, problema do provedor | Camada 2 | dezenas de minutos |

> **Antes de qualquer coisa:** avise quem estiver usando o sistema e
> registre a hora do incidente. A camada 1 restaura o banco inteiro para
> um ponto no tempo — tudo que foi gravado depois desse ponto se perde.

## Camada 1 — branch do Neon

Um branch do Neon é uma cópia instantânea copy-on-write do banco inteiro.
`npm run backup:branch` cria um antes de aplicar migrations, e o próprio
script imprime o comando de restauração ao terminar.

1. Autentique o `neonctl` (abre o navegador) ou exporte `NEON_API_KEY`:

   ```bash
   npx neonctl auth
   ```

2. Liste os branches e escolha o ponto para onde voltar:

   ```bash
   npx neonctl branches list --project-id odd-queen-19802349
   ```

3. Restaure a branch padrão (`production`) a partir do backup:

   ```bash
   npx neonctl branches restore production backup-<rotulo> --project-id odd-queen-19802349
   ```

   O `neonctl` preserva o estado anterior num branch de segurança
   (`production_old_<timestamp>`) — se a restauração for a escolha errada,
   ainda dá para voltar dela.

4. Confira o resultado antes de liberar o sistema:

   ```bash
   curl https://<dominio>/api/v1/status
   curl https://<dominio>/api/v1/migrations
   ```

O plano Free do Neon permite 10 branches. Se a criação falhar por limite,
apague os backups antigos:

```bash
npx neonctl branches delete backup-<rotulo> --project-id odd-queen-19802349
```

## Camada 2 — dump cifrado no bucket

Use quando o Neon não é mais uma opção: conta perdida, projeto apagado,
provedor indisponível. O `.github/workflows/backup.yaml` grava um
`pg_dump` no formato `custom`, cifrado com GPG, todo dia às 06:00 UTC.

Você vai precisar de:

- `BACKUP_PASSPHRASE` — a senha de cifragem, guardada **fora** do GitHub.
  Sem ela o dump é lixo, e não existe recuperação possível.
- As credenciais do bucket (`BACKUP_S3_*`).
- `pg_restore` na mesma major do servidor de destino ou mais nova, e `gpg`.

1. Liste os backups disponíveis e escolha o mais recente que anteceda o
   incidente:

   ```bash
   aws s3 ls "s3://$BACKUP_S3_BUCKET/" --endpoint-url "$BACKUP_S3_ENDPOINT"
   ```

2. Baixe e decifre:

   ```bash
   aws s3 cp "s3://$BACKUP_S3_BUCKET/agrdrive-<timestamp>.pgdump.gpg" . \
     --endpoint-url "$BACKUP_S3_ENDPOINT"

   gpg --batch --decrypt \
       --passphrase "$BACKUP_PASSPHRASE" \
       --output dump.pgdump \
       "agrdrive-<timestamp>.pgdump.gpg"
   ```

3. Restaure para um banco **vazio** — nunca por cima do banco atual, que
   é a evidência do que deu errado:

   ```bash
   pg_restore --dbname "$DATABASE_URL_DESTINO" \
     --no-owner --no-privileges --clean --if-exists \
     dump.pgdump
   ```

   Use a connection string **direta** do Neon, não a `-pooler`: o
   PgBouncer não suporta o protocolo que o `pg_restore` usa. É a mesma
   razão pela qual o workflow de backup exige a direta.

4. Aponte a aplicação para o banco restaurado (variáveis de ambiente da
   Vercel) e refaça o deploy.

5. Apague o dump decifrado da sua máquina — ele contém e-mail de todos os
   usuários, hashes de senha e os tokens do Google:

   ```bash
   rm -f dump.pgdump "agrdrive-<timestamp>.pgdump.gpg"
   ```

## Depois de restaurar

- Se a `ENCRYPTION_KEY` do ambiente mudou desde o backup, os tokens do
  Google Calendar gravados não decifram: os usuários precisam reconectar
  a conta. O restante do sistema funciona normalmente.
- Rode `GET /api/v1/migrations` para confirmar em que ponto do histórico
  de migrations o banco restaurado está, e aplique as pendentes.
- Registre no incidente quanto tempo a restauração levou. Esse número é o
  RTO real do projeto — o único que vale citar para o cliente.

## Pendências deste runbook

- [ ] Ensaiar a camada 2 ponta a ponta contra um banco descartável e
      anotar aqui o tempo medido. Backup que nunca foi restaurado não é
      backup.
- [ ] Alerta de falha do workflow de backup (hoje a falha só aparece na
      aba Actions; dois dias sem backup precisam avisar alguém).
- [ ] Política de retenção no bucket (lifecycle rule do provedor, não um
      laço de `delete` no CI).
