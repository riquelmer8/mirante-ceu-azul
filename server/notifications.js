// Web Push: armazena assinaturas e envia lembretes 1 dia antes de cada evento.
// Se VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não estiverem definidos, não envia push (mas o resto do app funciona).

const fs = require('fs');
const path = require('path');
const webPush = require('web-push');

const ARQUIVO_ASSINATURAS = path.join(__dirname, '..', 'data', 'push-subscriptions.json');
const ARQUIVO_LEMBRETES_ENVIADOS = path.join(__dirname, '..', 'data', 'lembretes-enviados.json');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:contato@miranteceuazul.com.br';

const habilitado = !!(VAPID_PUBLIC && VAPID_PRIVATE);

if (habilitado) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('[push] Web Push habilitado.');
} else {
  console.warn('[push] VAPID keys não definidas — Web Push desabilitado. Rode: npm run gerar-vapid');
}

// =========================
// Persistência simples em JSON
// =========================
function garantirPasta() {
  const pasta = path.dirname(ARQUIVO_ASSINATURAS);
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
}

function lerJson(arq, padrao) {
  try {
    if (!fs.existsSync(arq)) return padrao;
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch {
    return padrao;
  }
}

function escreverJson(arq, dados) {
  garantirPasta();
  fs.writeFileSync(arq, JSON.stringify(dados, null, 2));
}

function lerAssinaturas() { return lerJson(ARQUIVO_ASSINATURAS, []); }
function salvarAssinaturas(lista) { escreverJson(ARQUIVO_ASSINATURAS, lista); }

function lerLembretesEnviados() { return lerJson(ARQUIVO_LEMBRETES_ENVIADOS, {}); }
function salvarLembretesEnviados(d) { escreverJson(ARQUIVO_LEMBRETES_ENVIADOS, d); }

// =========================
// API pública
// =========================

function chavePublica() { return VAPID_PUBLIC; }
function estaHabilitado() { return habilitado; }

function inscrever(subscription) {
  const lista = lerAssinaturas();
  const ja = lista.find((s) => s.endpoint === subscription.endpoint);
  if (ja) return { ok: true, novo: false };
  lista.push({ ...subscription, criadoEm: new Date().toISOString() });
  salvarAssinaturas(lista);
  return { ok: true, novo: true };
}

function desinscrever(endpoint) {
  const lista = lerAssinaturas();
  const nova = lista.filter((s) => s.endpoint !== endpoint);
  salvarAssinaturas(nova);
  return { ok: true };
}

async function enviarParaTodos({ titulo, corpo, url }) {
  if (!habilitado) return { enviadas: 0, falhas: 0, motivo: 'desabilitado' };
  const lista = lerAssinaturas();
  const payload = JSON.stringify({ titulo, corpo, url: url || '/admin' });
  let enviadas = 0, falhas = 0;
  const removidas = [];

  for (const sub of lista) {
    try {
      await webPush.sendNotification(sub, payload);
      enviadas++;
    } catch (err) {
      falhas++;
      // Inscrição expirada ou inválida — remove
      if (err.statusCode === 410 || err.statusCode === 404) removidas.push(sub.endpoint);
      else console.warn('[push] Falha ao enviar:', err.statusCode || err.message);
    }
  }
  if (removidas.length > 0) {
    salvarAssinaturas(lista.filter((s) => !removidas.includes(s.endpoint)));
  }
  return { enviadas, falhas };
}

// =========================
// Cron de lembretes — verifica eventos das próximas 24-25h
// =========================

/**
 * Recebe a lista atual de eventos e dispara push pra cada evento que
 * começa em ~24h e ainda não teve lembrete enviado.
 */
async function dispararLembretes(eventos) {
  if (!habilitado) return { enviados: 0 };
  const enviados = lerLembretesEnviados();
  const agora = new Date();
  const limite24h = new Date(agora.getTime() + 26 * 60 * 60 * 1000); // até 26h pra frente
  const inicio24h = new Date(agora.getTime() + 22 * 60 * 60 * 1000); // a partir de 22h

  let total = 0;
  for (const ev of eventos) {
    const inicioEv = new Date(ev.start?.dateTime || ev.start?.date);
    if (inicioEv < inicio24h || inicioEv > limite24h) continue;
    if (enviados[ev.id]) continue;

    const ehBlq = (ev.summary || '').startsWith('[BLOQUEIO]');
    const titulo = ehBlq ? `Data bloqueada amanhã` : `Reserva amanhã`;
    const corpo = ev.summary?.replace('[BLOQUEIO] ', '') || 'Evento';
    await enviarParaTodos({ titulo, corpo, url: '/admin' });
    enviados[ev.id] = new Date().toISOString();
    total++;
  }

  if (total > 0) salvarLembretesEnviados(enviados);
  return { enviados: total };
}

module.exports = {
  chavePublica,
  estaHabilitado,
  inscrever,
  desinscrever,
  enviarParaTodos,
  dispararLembretes,
};
