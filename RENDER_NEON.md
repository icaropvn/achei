# Publicar o Achei! no Render com Neon

Use o Web Service Node e o banco que você já criou. Não é preciso criar outro serviço, usar o WSL ou rodar Docker para publicar no runtime Node do Render.

## GitHub e Render

1. Envie o código atualizado para a branch ligada ao serviço. Inclua arquivos ocultos como `.node-version` e `.gitignore`, os dois arquivos `package-lock.json`, `frontend/`, `server/` e `db/migrations/`. Não envie `.env`, credenciais, `node_modules/` ou `dist/`.
2. Em **Settings**, confirme:
   - **Language:** Node.
   - **Root Directory:** deixe vazio se o `package.json` do backend estiver na raiz do GitHub; use `achei-v1` somente se essa pasta estiver dentro da raiz.
   - **Build Command:** `npm ci --include=dev && npm ci --prefix frontend --include=dev && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
   - **Pre-Deploy Command:** deixe vazio. O app aplica as migrações ao iniciar no Render.
3. Mantenha `DATABASE_URL` com a URL do Neon, incluindo as opções de TLS que vieram ao copiá-la. Mantenha `APP_ORIGIN` com a URL pública HTTPS exata do serviço, sem barra final. Sem essa variável, o app usa `RENDER_EXTERNAL_URL`. Se `NODE_VERSION` estiver configurada, use Node 24 (por exemplo, `24.22.1`); se não estiver, `.node-version` já define a versão.
4. Se `DATABASE_URL` usar o host com `-pooler`, é recomendado adicionar `DATABASE_URL_UNPOOLED` com a URL direta do **mesmo** banco e branch. O app usa essa variável só para migrar, com fallback para `DATABASE_URL`. No Neon, copie a URL direta desativando o toggle de pooling no modal **Connect**.
5. Envie o commit e faça o deploy. O Render fornece `PORT` e `RENDER`; não configure essas variáveis manualmente. Deixe `BIND_HOST` sem configurar ou use `0.0.0.0`.

## Conferir o deploy

- Abra o endereço do serviço. `/api/health` verifica o servidor; `/api/ready` verifica se o banco responde e tem a tabela de migrações. Ambos devem retornar `{"ok":true}`.
- No primeiro deploy, o log deve indicar `Aplicada: 001.sql` antes de abrir a porta. Os deploys seguintes não reaplicam essa migração.
- Se não houver instituições, o banco ainda não foi populado. Deploy e migração não criam contas demonstrativas.

## Criar o primeiro administrador (uma vez)

A partir da pasta do projeto em qualquer máquina com Node 24, use os mesmos comandos de build do Render. Configure `DATABASE_URL` **apenas na sessão local do terminal**, com a URL do Neon do mesmo banco. Esse procedimento não requer instalar o PostgreSQL na máquina.

No PowerShell, leia a URL sem colocá-la no histórico (o comando abaixo usa PowerShell 7):

```powershell
$env:DATABASE_URL = Read-Host "Cole a URL do Neon" -MaskInput
npm run manage -- admin admin@example.test "Administrador"
Remove-Item Env:DATABASE_URL
```

No Bash:

```bash
read -rsp "Cole a URL do Neon: " DATABASE_URL; printf '\n'
export DATABASE_URL
npm run manage -- admin admin@example.test "Administrador"
unset DATABASE_URL
```

Troque o e-mail do exemplo e informe uma senha exclusiva quando o CLI pedir. Depois, entre no Achei! publicado e cadastre as instituições e os funcionários. Para preencher apenas instituições fictícias em um banco de demonstração, use `npm run manage -- demo` enquanto a URL ainda estiver disponível no terminal.
