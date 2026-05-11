# Mirante Céu Azul · Painel de Agendamentos

Painel mobile-first (PWA) para o Sítio Mirante Céu Azul (Arujá-SP) gerenciar reservas de eventos. Mostra a agenda pública de datas livres/ocupadas e tem um painel administrativo completo com status de pagamento, bloqueio de datas, filtros, resumo financeiro e notificações push. Sincroniza com o Google Calendar (que também é alimentado pela IA "Sol" no n8n via WhatsApp).

**Identidade visual** alinhada com [miranteceuazul.com.br](https://miranteceuazul.com.br): paleta navy + dourado + bege quente, tipografia Playfair Display + DM Sans.

---

## Features

### Páginas
- **Pública (`/`)** — calendário do mês com datas livres/reservadas/indisponíveis. Toque em data livre → modal com botão WhatsApp.
- **Admin (`/admin`)** — login obrigatório. Calendário com cores por tipo de evento, indicadores de status, lista lateral filtrável, resumo financeiro do mês, push notifications.
- **Login (`/login`)** — JWT em cookie httpOnly + bcrypt + rate limit (5 tentativas/15min).

### Reservas
- Campos: cliente, telefone, tipo (casamento/aniversário/corporativo/outro), data/hora início e fim, **status** (orçamento/confirmada/paga/realizada), **valor total** e **valor pago**, observações.
- Status padrão de nova reserva: **confirmada**.
- Cores no calendário por tipo de evento (casamento dourado, aniversário rosado, corporativo navy, outro cinza).
- Indicador de status (ponto colorido na célula).

### Bloqueio de datas
- Marcar dia como indisponível (manutenção, férias, evento pessoal) sem ser uma reserva fake.
- Aparece como **cinza neutro** no calendário público — sem o motivo.
- Aparece com o motivo só no admin.

### Resumo financeiro (admin)
Quatro cards no topo, atualizados conforme o mês visualizado:
- **Confirmado**: soma dos valores de reservas com status confirmada/paga/realizada.
- **Recebido**: soma dos valores pagos · "a receber" = confirmado − recebido.
- **Projetado**: total incluindo orçamentos.
- **Eventos no mês**: contagem (+ bloqueios).

### Filtros (admin, lateral)
- Busca por nome do cliente (em tempo real).
- Status (todos/orçamento/confirmada/paga/realizada).
- Período (próximos 7/15/30/90/365 dias).

### Notificações push (PWA)
- Botão de sino no header pra ativar.
- Backend dispara push 1 dia antes de cada evento (cron interno, checagem de hora em hora).
- Funciona com app fechado (Web Push + VAPID).

### Backup
- Diariamente às 3h da manhã, escreve `data/backups/backup-YYYY-MM-DD.json` com todos os eventos.
- Mantém os últimos 30 backups.

### Integração com a Sol (n8n)
- **Webhook** (`POST /api/n8n/webhook` com header `X-Webhook-Secret`): a Sol avisa quando cria evento → o painel dispara push pra você.
- **Disponibilidade** (`GET /api/availability?date=YYYY-MM-DD`): a Sol consulta se uma data está livre, mais rápido do que via Google Calendar.

### Outros
- "Copiar pro WhatsApp" no modal da reserva: copia ficha formatada (cliente, data, valor, restante).
- Mobile-first com PWA instalável.
- Tudo em PT-BR.

---

## Stack
- Node.js 20+ / Express
- HTML + CSS puro + JavaScript vanilla (sem build, sem framework)
- `googleapis`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `dotenv`, `web-push`, `express-rate-limit`
- Docker pra deploy

---

## Sumário

1. [Como rodar local](#como-rodar-local)
2. [Gerar a senha do administrador](#gerar-a-senha-do-administrador)
3. [Gerar chaves VAPID (Web Push)](#gerar-chaves-vapid-web-push)
4. [Configurar o Google Calendar](#configurar-o-google-calendar)
5. [Integração com a Sol (n8n)](#integração-com-a-sol-n8n)
6. [Deploy no Easypanel (Docker + Traefik)](#deploy-no-easypanel-docker--traefik)
7. [Instalar como app no celular (PWA)](#instalar-como-app-no-celular-pwa)
8. [Estrutura do projeto](#estrutura-do-projeto)
9. [API REST](#api-rest)
10. [Resolução de problemas](#resolução-de-problemas)

---

## Como rodar local

### Pré-requisitos
- [Node.js 20 ou superior](https://nodejs.org/)

### Passos

```bash
# 1. Instale dependências do servidor
cd server
npm install
cd ..

# 2. Crie o .env a partir do exemplo
cp .env.example .env

# 3. Gere a senha do admin (ver próxima seção)
cd server
npm run gerar-senha
# Cole o ADMIN_PASSWORD_HASH no .env

# 4. (Opcional) Gere chaves VAPID pra notificações push
npm run gerar-vapid
# Cole as 3 linhas (PUBLIC, PRIVATE, EMAIL) no .env

# 5. Defina um JWT_SECRET aleatório forte no .env

# 6. Rode o servidor
npm start
```

Acesse **http://localhost:3000**.

> Sem configurar o Google Calendar, o sistema roda em **modo demonstração** com 5 reservas mock + 1 bloqueio. Sem VAPID, push fica desabilitado mas o resto funciona.

---

## Gerar a senha do administrador

```bash
cd server
npm run gerar-senha
```

Modo interativo (senha não fica no histórico). Saída:

```
✓ Hash gerado!
Copie a linha abaixo para o seu arquivo .env:
ADMIN_PASSWORD_HASH=$2a$12$xxxxxxx...
```

Cole no `.env`, **sem aspas**.

---

## Gerar chaves VAPID (Web Push)

Web Push exige um par de chaves VAPID (uma pública, uma privada). Gere uma vez:

```bash
cd server
npm run gerar-vapid
```

Saída:
```
VAPID_PUBLIC_KEY=BFyP3...
VAPID_PRIVATE_KEY=cLs7...
VAPID_EMAIL=mailto:contato@miranteceuazul.com.br
```

Cole as 3 linhas no `.env` e reinicie o servidor.

> Sem VAPID, o botão de sino no header fica oculto e os lembretes não disparam — mas o resto do app funciona.

---

## Configurar o Google Calendar

### Passo 1 — Crie um projeto no Google Cloud
1. https://console.cloud.google.com/ → **Selecionar projeto → Novo projeto**.
2. Nome: `mirante-ceu-azul-painel`. Criar.

### Passo 2 — Ative a Google Calendar API
1. **APIs e serviços → Biblioteca**.
2. Pesquise **Google Calendar API** → **Ativar**.

### Passo 3 — Crie uma conta de serviço
1. **APIs e serviços → Credenciais → Criar credencial → Conta de serviço**.
2. Nome: `mirante-painel`. Criar e continuar → Concluir.
3. Clique na conta criada → aba **Chaves → Adicionar chave → Criar nova chave → JSON**.
4. Vai baixar um `.json`. **Guarde com cuidado**.

### Passo 4 — Compartilhe o calendário com a conta de serviço
1. https://calendar.google.com → encontre o calendário do Mirante (ou crie um novo).
2. Três pontinhos no calendário → **Configurações e compartilhamento**.
3. **Compartilhar com pessoas e grupos específicos** → cole o e-mail da conta de serviço.
4. Permissão: **Fazer alterações nos eventos**. Enviar.

### Passo 5 — Pegue o ID do calendário
Ainda em **Configurações**, role até **Integrar calendário**. Copie o **ID** (algo como `abc123@group.calendar.google.com`).

### Passo 6 — Configure no `.env`

```env
GOOGLE_CALENDAR_ID=abc123@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

> O JSON inteiro fica em **uma linha só**. Mantenha as `\n` literais dentro do `private_key`.

---

## Integração com a Sol (n8n)

### Webhook (Sol → painel)
Quando a Sol cria/atualiza um evento via WhatsApp, ela pode chamar o webhook pra disparar push pro Felipe:

```
POST https://agenda.zuva.com.br/api/n8n/webhook
Headers:
  Content-Type: application/json
  X-Webhook-Secret: <valor de N8N_WEBHOOK_SECRET no .env>
Body:
  { "tipo": "novo", "cliente": "Ana Silva", "mensagem": "Reserva pra 15/06" }
```

Defina `N8N_WEBHOOK_SECRET` no `.env` (qualquer string aleatória forte). Sem ele o endpoint responde 503.

### Disponibilidade (Sol consulta o painel)
Mais rápido do que a Sol bater no Google Calendar:

```
GET https://agenda.zuva.com.br/api/availability?date=2026-06-15

Resposta:
  { "date": "2026-06-15", "disponivel": true }
ou
  { "date": "2026-06-15", "disponivel": false, "motivo": "reserva", "total": 1 }
```

Endpoint público (não exige autenticação).

---

## Deploy no Easypanel (Docker + Traefik)

`docker-compose.yml` já vem pronto com Traefik + HTTPS Let's Encrypt.

1. Suba o código pro Git.
2. No Easypanel:
   - Crie **App → Dockerfile**.
   - Aponte pro repositório.
   - **Domínios**: `agenda.zuva.com.br` (ou o seu) com HTTPS habilitado.
   - **Variáveis de ambiente** (obrigatórias):
     ```
     NODE_ENV=production
     JWT_SECRET=<segredo forte>
     ADMIN_USERNAME=felipe
     ADMIN_PASSWORD_HASH=<hash>
     GOOGLE_CALENDAR_ID=<id>
     GOOGLE_SERVICE_ACCOUNT_JSON=<json em uma linha>
     WHATSAPP_NUMBER=5511999999999
     VAPID_PUBLIC_KEY=<chave pública>
     VAPID_PRIVATE_KEY=<chave privada>
     VAPID_EMAIL=mailto:contato@miranteceuazul.com.br
     N8N_WEBHOOK_SECRET=<secret aleatório>
     ```
   - **Porta**: 3000.
3. Deploy.

Volume opcional: monte `/app/data` num volume persistente pra não perder backups e push subscriptions a cada redeploy.

### Alternativa direta:
```bash
git clone <repo>
cd mirante-ceu-azul-painel
cp .env.example .env  # edite com valores reais
docker compose up -d --build
```

---

## Instalar como app no celular (PWA)

### iPhone (Safari)
1. Abra o site no Safari.
2. Botão **Compartilhar** → **Adicionar à tela inicial**.

### Android (Chrome)
1. Abra o site no Chrome.
2. Banner aparece no rodapé → **Instalar**.
3. Ou: menu (3 pontos) → **Instalar app**.

Depois de instalar, abre como app de verdade. Notificações push funcionam mesmo com o app fechado (Android; no iOS precisa estar instalado como PWA).

---

## Estrutura do projeto

```
mirante-ceu-azul-painel/
├── server/
│   ├── server.js                # Express + rotas + crons
│   ├── calendar.js              # Google Calendar (com modo mock)
│   ├── auth.js                  # JWT + bcrypt
│   ├── notifications.js         # Web Push (VAPID)
│   ├── backup.js                # Backup diário em JSON
│   ├── generate-password.js     # CLI: gerar hash bcrypt
│   ├── generate-vapid.js        # CLI: gerar chaves VAPID
│   └── package.json
│
├── public/
│   ├── index.html               # Calendário público
│   ├── admin.html               # Painel administrativo
│   ├── login.html               # Login
│   ├── manifest.json            # Manifesto PWA
│   ├── sw.js                    # Service worker (offline + push)
│   ├── css/styles.css           # Tema navy + dourado + bege
│   ├── js/
│   │   ├── calendar-shared.js   # Lógica compartilhada do calendário
│   │   ├── calendar.js          # Página pública
│   │   ├── admin.js             # Painel admin
│   │   ├── login.js             # Login
│   │   └── pwa.js               # SW + banner instalar
│   └── icons/
│       ├── icon-192.svg
│       └── icon-512.svg
│
├── data/                        # Runtime (gitignored)
│   ├── push-subscriptions.json
│   ├── lembretes-enviados.json
│   └── backups/
│
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## API REST

| Método | Rota | Auth? | Descrição |
|---|---|---|---|
| GET | `/api/config` | não | whatsapp, modoMock, push habilitado, vapid public key |
| GET | `/api/events?month=YYYY-MM` | não | Lista eventos (reservas + bloqueios) do mês |
| POST | `/api/events` | sim | Cria reserva |
| PUT | `/api/events/:id` | sim | Atualiza reserva |
| DELETE | `/api/events/:id` | sim | Exclui reserva ou bloqueio |
| POST | `/api/blocks` | sim | Cria bloqueio de data |
| GET | `/api/availability?date=YYYY-MM-DD` | não | Disponibilidade da data (uso da Sol) |
| POST | `/api/n8n/webhook` | secret | Sol notifica painel → dispara push |
| POST | `/api/auth/login` | não | Login (cookie httpOnly) — rate limit 5/15min |
| POST | `/api/auth/logout` | não | Limpa cookie |
| GET | `/api/auth/me` | não | Estado de autenticação |
| POST | `/api/push/subscribe` | sim | Inscreve dispositivo pra push |
| POST | `/api/push/unsubscribe` | sim | Desinscreve |
| POST | `/api/push/test` | sim | Dispara push de teste |

### Modelo de dados
Reservas e bloqueios moram no mesmo Google Calendar. A diferença é o prefixo do `summary`:
- **Reserva**: `Tipo — Cliente` (ex: `Casamento — Ana Silva`)
- **Bloqueio**: `[BLOQUEIO] Motivo` (ex: `[BLOQUEIO] Manutenção da piscina`)

A `description` é texto plano com chaves: `Cliente:`, `Telefone:`, `Tipo:`, `Status:`, `Valor:`, `Pago:`, `Obs:` (ou `Motivo:` pra bloqueios).

---

## Resolução de problemas

### "MODO MOCK" mesmo com `.env` preenchido
- O `.env` tem que estar na **raiz do projeto** (não em `/server/`).
- Confirme que `GOOGLE_CALENDAR_ID` e `GOOGLE_SERVICE_ACCOUNT_JSON` estão definidos.
- Reinicie o servidor.

### Botão de sino (push) não aparece
- Push só funciona em **HTTPS** (não em `http://`, exceto `localhost`).
- VAPID precisa estar configurado no `.env`.
- Permissão de notificação tem que estar autorizada no navegador.

### Lembretes não chegam
- Backend checa de hora em hora. Push dispara pros eventos que começam em ~24h.
- Verifique nos logs: `[lembrete] N push(es) disparado(s)`.
- Se o push deu permissão mas nada chega, teste com `POST /api/push/test` (autenticado).

### Login retorna "Muitas tentativas"
- 5 tentativas erradas em 15min ativam o rate limit.
- Espere 15 minutos ou reinicie o servidor.

### Webhook do n8n responde 503
- Defina `N8N_WEBHOOK_SECRET` no `.env`. Reinicie.
- A Sol precisa enviar o secret no header `X-Webhook-Secret`.

### Backups
- Geram às 3h da manhã (horário do servidor).
- Em `data/backups/backup-YYYY-MM-DD.json`.
- Mantém os últimos 30 dias automaticamente.
- Pra fazer um backup manual agora: reinicie o servidor com `NODE_ENV` qualquer (não tem CLI dedicado).

---

## Licença
Uso interno do Sítio Mirante Céu Azul.
