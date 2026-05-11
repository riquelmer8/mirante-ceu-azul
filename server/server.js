// Servidor Express do Painel Mirante Céu Azul

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const calendar = require('./calendar');
const auth = require('./auth');
const notifications = require('./notifications');
const backup = require('./backup');

const app = express();
const PORT = process.env.PORT || 3000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5511999999999';
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || '';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.set('trust proxy', 1); // necessário pro rate limit funcionar atrás do Traefik
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// =====================
// Rate limit no login (5 tentativas / 15min por IP)
// =====================
const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// =====================
// Páginas HTML
// =====================
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/admin', (req, res) => {
  if (!auth.lerUsuarioOpcional(req)) return res.redirect('/login');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// =====================
// Config pública
// =====================
app.get('/api/config', (req, res) => {
  res.json({
    whatsapp: WHATSAPP_NUMBER,
    modoMock: calendar.MODO_MOCK,
    pushHabilitado: notifications.estaHabilitado(),
    vapidPublicKey: notifications.estaHabilitado() ? notifications.chavePublica() : null,
  });
});

// =====================
// Auth
// =====================
app.post('/api/auth/login', limitarLogin, async (req, res) => {
  const { usuario, senha } = req.body || {};
  const resultado = await auth.login(usuario, senha);
  if (!resultado.ok) return res.status(401).json({ erro: resultado.erro });
  res.cookie(auth.COOKIE_NOME, resultado.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, usuario: resultado.usuario });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(auth.COOKIE_NOME);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const usuario = auth.lerUsuarioOpcional(req);
  res.json({ autenticado: !!usuario, usuario: usuario || null });
});

// =====================
// Eventos (reservas + bloqueios juntos)
// =====================
app.get('/api/events', async (req, res) => {
  try {
    const mes = req.query.month;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ erro: 'Parâmetro "month" inválido (use YYYY-MM).' });
    }
    const [ano, mesNum] = mes.split('-').map(Number);
    const inicio = new Date(ano, mesNum - 1, 1, 0, 0, 0);
    inicio.setDate(inicio.getDate() - 7);
    const fim = new Date(ano, mesNum, 0, 23, 59, 59);
    fim.setDate(fim.getDate() + 7);

    const eventos = await calendar.listarEventos({ inicio, fim });
    res.json({ eventos });
  } catch (err) {
    console.error('[GET /api/events]', err);
    res.status(500).json({ erro: 'Erro ao buscar eventos.' });
  }
});

app.post('/api/events', auth.exigirAuth, async (req, res) => {
  try {
    const novo = await calendar.criarReserva(req.body || {});
    res.status(201).json({ evento: novo });
  } catch (err) {
    console.error('[POST /api/events]', err);
    res.status(500).json({ erro: 'Erro ao criar reserva.' });
  }
});

app.put('/api/events/:id', auth.exigirAuth, async (req, res) => {
  try {
    const atualizado = await calendar.atualizarReserva(req.params.id, req.body || {});
    res.json({ evento: atualizado });
  } catch (err) {
    console.error('[PUT /api/events]', err);
    res.status(500).json({ erro: 'Erro ao atualizar reserva.' });
  }
});

app.delete('/api/events/:id', auth.exigirAuth, async (req, res) => {
  try {
    await calendar.excluirEvento(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/events]', err);
    res.status(500).json({ erro: 'Erro ao excluir evento.' });
  }
});

// =====================
// Bloqueios (datas indisponíveis sem cliente)
// =====================
app.post('/api/blocks', auth.exigirAuth, async (req, res) => {
  try {
    const novo = await calendar.criarBloqueio(req.body || {});
    res.status(201).json({ evento: novo });
  } catch (err) {
    console.error('[POST /api/blocks]', err);
    res.status(500).json({ erro: 'Erro ao criar bloqueio.' });
  }
});

// =====================
// Endpoint de disponibilidade (uso da Sol/n8n)
// Exemplo: GET /api/availability?date=2026-06-15
// Retorna { date, disponivel: true/false, motivo? }
// =====================
app.get('/api/availability', async (req, res) => {
  try {
    const dataStr = req.query.date;
    if (!dataStr || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
      return res.status(400).json({ erro: 'Parâmetro "date" inválido (use YYYY-MM-DD).' });
    }
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const inicio = new Date(ano, mes - 1, dia, 0, 0, 0);
    const fim = new Date(ano, mes - 1, dia, 23, 59, 59);
    const eventos = await calendar.listarEventos({ inicio, fim });
    const eventosDoDia = eventos.filter((ev) => {
      const dt = new Date(ev.start?.dateTime || ev.start?.date);
      return dt >= inicio && dt <= fim;
    });
    if (eventosDoDia.length === 0) {
      return res.json({ date: dataStr, disponivel: true });
    }
    const primeiro = eventosDoDia[0];
    res.json({
      date: dataStr,
      disponivel: false,
      motivo: calendar.ehBloqueio(primeiro) ? 'bloqueio' : 'reserva',
      total: eventosDoDia.length,
    });
  } catch (err) {
    console.error('[GET /api/availability]', err);
    res.status(500).json({ erro: 'Erro ao consultar disponibilidade.' });
  }
});

// =====================
// Webhook n8n: a Sol avisa que criou/atualizou um evento — apenas dispara push
// (não persiste, porque o evento já está no Google Calendar)
// =====================
app.post('/api/n8n/webhook', async (req, res) => {
  if (!N8N_WEBHOOK_SECRET) {
    return res.status(503).json({ erro: 'Webhook não configurado (defina N8N_WEBHOOK_SECRET).' });
  }
  const assinatura = req.headers['x-webhook-secret'];
  if (assinatura !== N8N_WEBHOOK_SECRET) {
    return res.status(401).json({ erro: 'Secret inválido.' });
  }
  const { tipo, mensagem, cliente } = req.body || {};
  try {
    await notifications.enviarParaTodos({
      titulo: tipo === 'novo' ? 'Nova reserva (Sol)' : 'Atualização da Sol',
      corpo: mensagem || (cliente ? `Reserva: ${cliente}` : 'Sol atualizou a agenda'),
      url: '/admin',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook]', err);
    res.status(500).json({ erro: 'Erro ao processar webhook.' });
  }
});

// =====================
// Web Push: assinar / desinscrever
// =====================
app.post('/api/push/subscribe', auth.exigirAuth, (req, res) => {
  if (!notifications.estaHabilitado()) {
    return res.status(503).json({ erro: 'Web Push não está configurado.' });
  }
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ erro: 'Subscription inválida.' });
  notifications.inscrever(sub);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', auth.exigirAuth, (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ erro: 'endpoint obrigatório.' });
  notifications.desinscrever(endpoint);
  res.json({ ok: true });
});

// Endpoint de teste — dispara um push pra todos
app.post('/api/push/test', auth.exigirAuth, async (req, res) => {
  const result = await notifications.enviarParaTodos({
    titulo: 'Teste de notificação',
    corpo: 'Push funcionando! Você receberá lembretes 1 dia antes dos eventos.',
    url: '/admin',
  });
  res.json(result);
});

// =====================
// Estáticos
// =====================
app.use(express.static(PUBLIC_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));

// =====================
// Cron leve: backup diário (3h) e checagem de lembretes (de hora em hora)
// =====================
async function rodarBackupDiario() {
  try {
    const eventos = await calendar.listarTodosEventos();
    const arq = await backup.salvarBackup(eventos);
    console.log(`[backup] ${eventos.length} eventos salvos em ${arq}`);
  } catch (err) {
    console.error('[backup] Erro:', err.message);
  }
}

async function checarLembretes() {
  try {
    const agora = new Date();
    const fim = new Date(agora.getTime() + 48 * 60 * 60 * 1000);
    const eventos = await calendar.listarEventos({ inicio: agora, fim });
    const r = await notifications.dispararLembretes(eventos);
    if (r.enviados > 0) console.log(`[lembrete] ${r.enviados} push(es) disparado(s).`);
  } catch (err) {
    console.error('[lembrete] Erro:', err.message);
  }
}

function agendarTarefas() {
  // Backup todo dia às 3h da manhã
  function proximoBackup() {
    const agora = new Date();
    const proximo = new Date(agora);
    proximo.setHours(3, 0, 0, 0);
    if (proximo <= agora) proximo.setDate(proximo.getDate() + 1);
    return proximo - agora;
  }
  setTimeout(function tick() {
    rodarBackupDiario();
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }, proximoBackup());

  // Lembretes: checa de hora em hora
  setInterval(checarLembretes, 60 * 60 * 1000);
  // Checa uma vez logo no início também
  setTimeout(checarLembretes, 30 * 1000);
}

// =====================
// Inicialização
// =====================
app.listen(PORT, () => {
  console.log(`\n🌤  Mirante Céu Azul — painel rodando em http://localhost:${PORT}`);
  console.log(`   Calendário público:  http://localhost:${PORT}/`);
  console.log(`   Painel admin:        http://localhost:${PORT}/admin`);
  if (calendar.MODO_MOCK) console.log('\n   ⚠  MODO MOCK ativo (sem Google Calendar). Veja o README.');
  if (!notifications.estaHabilitado()) console.log('   ⚠  Web Push desabilitado (rode: npm run gerar-vapid).');
  if (!N8N_WEBHOOK_SECRET) console.log('   ⚠  Webhook n8n desabilitado (defina N8N_WEBHOOK_SECRET no .env).');
  console.log('');
  agendarTarefas();
});
