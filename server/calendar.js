// Camada de Google Calendar com fallback para MOCK
// Suporta: reservas (com status + valor pago) e bloqueios de data.

const { google } = require('googleapis');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const MODO_MOCK = !CALENDAR_ID || !SERVICE_ACCOUNT_JSON;

let calendarClient = null;

if (!MODO_MOCK) {
  try {
    const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    calendarClient = google.calendar({ version: 'v3', auth });
    console.log('[calendar] Conectado ao Google Calendar:', CALENDAR_ID);
  } catch (err) {
    console.error('[calendar] Erro ao inicializar Google Calendar:', err.message);
    console.warn('[calendar] Caindo no modo MOCK.');
  }
} else {
  console.warn('[calendar] MODO MOCK ativo — defina GOOGLE_CALENDAR_ID e GOOGLE_SERVICE_ACCOUNT_JSON para usar Google Calendar.');
}

// =========================
// MOCK
// =========================

function gerarMockEventos() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  return [
    montarEvento({
      cliente: 'Ana Silva', telefone: '(11) 98765-4321', tipo: 'Casamento',
      status: 'paga', valor: '15000', valorPago: '15000',
      observacoes: '120 convidados, decoração rústica',
      dataInicio: new Date(ano, mes, 8, 14, 0).toISOString(),
      dataFim: new Date(ano, mes, 8, 23, 0).toISOString(),
    }, 'mock-1'),
    montarEvento({
      cliente: 'Roberto Mendes', telefone: '(11) 91234-5678', tipo: 'Aniversário',
      status: 'confirmada', valor: '8000', valorPago: '4000',
      observacoes: '80 pessoas, churrasco',
      dataInicio: new Date(ano, mes, 15, 12, 0).toISOString(),
      dataFim: new Date(ano, mes, 15, 22, 0).toISOString(),
    }, 'mock-2'),
    montarEvento({
      cliente: 'Empresa XYZ Ltda', telefone: '(11) 3000-4000', tipo: 'Corporativo',
      status: 'orcamento', valor: '12000', valorPago: '0',
      observacoes: '150 funcionários',
      dataInicio: new Date(ano, mes, 22, 10, 0).toISOString(),
      dataFim: new Date(ano, mes, 22, 18, 0).toISOString(),
    }, 'mock-3'),
    montarEvento({
      cliente: 'Mariana Costa', telefone: '(11) 99999-1111', tipo: 'Aniversário',
      status: 'confirmada', valor: '4500', valorPago: '2250',
      observacoes: '40 crianças + pais',
      dataInicio: new Date(ano, mes, 28, 14, 0).toISOString(),
      dataFim: new Date(ano, mes, 28, 19, 0).toISOString(),
    }, 'mock-4'),
    montarEvento({
      cliente: 'Juliana Pereira', telefone: '(11) 97777-2222', tipo: 'Casamento',
      status: 'paga', valor: '18000', valorPago: '18000',
      observacoes: '200 convidados',
      dataInicio: new Date(ano, mes + 1, 5, 15, 0).toISOString(),
      dataFim: new Date(ano, mes + 1, 6, 1, 0).toISOString(),
    }, 'mock-5'),
    montarBloqueio({
      motivo: 'Manutenção da piscina',
      dataInicio: new Date(ano, mes, 18, 0, 0).toISOString(),
      dataFim: new Date(ano, mes, 18, 23, 59).toISOString(),
    }, 'mock-bloq-1'),
  ];
}

let mockStore = gerarMockEventos();

// =========================
// API pública
// =========================

async function listarEventos({ inicio, fim }) {
  if (MODO_MOCK || !calendarClient) {
    return mockStore.filter((ev) => {
      const dt = new Date(ev.start.dateTime || ev.start.date);
      return dt >= inicio && dt <= fim;
    });
  }

  const resp = await calendarClient.events.list({
    calendarId: CALENDAR_ID,
    timeMin: inicio.toISOString(),
    timeMax: fim.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });
  return resp.data.items || [];
}

async function listarTodosEventos() {
  if (MODO_MOCK || !calendarClient) return [...mockStore];
  // Pega 1 ano pra trás e 1 ano pra frente — usado pro backup
  const inicio = new Date(); inicio.setFullYear(inicio.getFullYear() - 1);
  const fim = new Date(); fim.setFullYear(fim.getFullYear() + 1);
  return listarEventos({ inicio, fim });
}

async function criarReserva(dados) {
  const evento = montarEvento(dados);
  if (MODO_MOCK || !calendarClient) {
    const novo = { ...evento, id: `mock-${Date.now()}` };
    mockStore.push(novo);
    return novo;
  }
  const resp = await calendarClient.events.insert({ calendarId: CALENDAR_ID, requestBody: evento });
  return resp.data;
}

async function atualizarReserva(id, dados) {
  const evento = montarEvento(dados);
  if (MODO_MOCK || !calendarClient) {
    const idx = mockStore.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Evento não encontrado');
    mockStore[idx] = { ...evento, id };
    return mockStore[idx];
  }
  const resp = await calendarClient.events.update({ calendarId: CALENDAR_ID, eventId: id, requestBody: evento });
  return resp.data;
}

async function criarBloqueio(dados) {
  const evento = montarBloqueio(dados);
  if (MODO_MOCK || !calendarClient) {
    const novo = { ...evento, id: `mock-bloq-${Date.now()}` };
    mockStore.push(novo);
    return novo;
  }
  const resp = await calendarClient.events.insert({ calendarId: CALENDAR_ID, requestBody: evento });
  return resp.data;
}

async function excluirEvento(id) {
  if (MODO_MOCK || !calendarClient) {
    mockStore = mockStore.filter((e) => e.id !== id);
    return { ok: true };
  }
  await calendarClient.events.delete({ calendarId: CALENDAR_ID, eventId: id });
  return { ok: true };
}

// =========================
// Helpers de montagem
// =========================

function montarEvento({ cliente, telefone, tipo, status, dataInicio, dataFim, valor, valorPago, observacoes }, idForcado) {
  const statusFinal = status || 'confirmada';
  const descricao = [
    `Cliente: ${cliente || '-'}`,
    `Telefone: ${telefone || '-'}`,
    `Tipo: ${tipo || '-'}`,
    `Status: ${statusFinal}`,
    valor ? `Valor: R$ ${valor}` : null,
    `Pago: R$ ${valorPago || '0'}`,
    observacoes ? `Obs: ${observacoes}` : null,
  ].filter(Boolean).join('\n');

  const ev = {
    summary: `${tipo || 'Reserva'} — ${cliente || 'Sem nome'}`,
    description: descricao,
    start: { dateTime: new Date(dataInicio).toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: new Date(dataFim).toISOString(), timeZone: 'America/Sao_Paulo' },
  };
  if (idForcado) ev.id = idForcado;
  return ev;
}

function montarBloqueio({ motivo, dataInicio, dataFim }, idForcado) {
  const ev = {
    summary: `[BLOQUEIO] ${motivo || 'Indisponível'}`,
    description: `Motivo: ${motivo || '-'}\nTipo: bloqueio`,
    start: { dateTime: new Date(dataInicio).toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: new Date(dataFim).toISOString(), timeZone: 'America/Sao_Paulo' },
  };
  if (idForcado) ev.id = idForcado;
  return ev;
}

// Detecta se um evento do calendário é um bloqueio (não uma reserva)
function ehBloqueio(evento) {
  return (evento?.summary || '').startsWith('[BLOQUEIO]');
}

module.exports = {
  listarEventos,
  listarTodosEventos,
  criarReserva,
  atualizarReserva,
  criarBloqueio,
  excluirEvento,
  ehBloqueio,
  MODO_MOCK,
};
