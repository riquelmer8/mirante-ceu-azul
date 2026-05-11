// Módulo compartilhado de calendário (público + admin).
// IIFE pra não vazar nomes pro escopo global.

(function () {
'use strict';

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const NOMES_DIA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const TIPOS_VALIDOS = ['Casamento', 'Aniversário', 'Corporativo', 'Outro'];
const STATUS_VALIDOS = ['orcamento', 'confirmada', 'paga', 'realizada'];
const STATUS_LABEL = {
  orcamento: 'Orçamento',
  confirmada: 'Confirmada',
  paga: 'Paga',
  realizada: 'Realizada',
};

/**
 * Cria uma instância de calendário.
 * Opções:
 *  - containerMes, containerGrid, botaoAnterior, botaoProximo
 *  - aoClicarDia(data, eventos)
 *  - aoMudarMes(ymStr)
 *  - corPorTipo: bool — se true, aplica cor de fundo conforme o tipo do evento (admin)
 *  - mostrarStatusIndicador: bool — se true, mostra ponto colorido conforme status
 */
function criarCalendario(opcoes) {
  let mesAtual = new Date();
  let eventos = [];

  function definirMes(data) {
    mesAtual = new Date(data.getFullYear(), data.getMonth(), 1);
    if (opcoes.aoMudarMes) {
      const ym = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth() + 1).padStart(2, '0')}`;
      opcoes.aoMudarMes(ym);
    }
  }

  function definirEventos(novos) {
    eventos = novos || [];
    renderizar();
  }

  function obterMesYM() {
    return `${mesAtual.getFullYear()}-${String(mesAtual.getMonth() + 1).padStart(2, '0')}`;
  }

  function renderizar() {
    if (!opcoes.containerMes || !opcoes.containerGrid) return;

    opcoes.containerMes.textContent = `${NOMES_MES[mesAtual.getMonth()]} de ${mesAtual.getFullYear()}`;
    opcoes.containerGrid.innerHTML = '';

    NOMES_DIA_CURTOS.forEach((nome) => {
      const cab = document.createElement('div');
      cab.className = 'calendario-cabecalho-dia';
      cab.textContent = nome;
      opcoes.containerGrid.appendChild(cab);
    });

    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diaSemanaPrimeiro = new Date(ano, mes, 1).getDay();

    for (let i = 0; i < diaSemanaPrimeiro; i++) {
      const v = document.createElement('div');
      v.className = 'calendario-celula calendario-celula--vazia';
      v.setAttribute('aria-hidden', 'true');
      opcoes.containerGrid.appendChild(v);
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const eventosPorDia = {};
    for (const ev of eventos) {
      const inicioStr = ev.start?.dateTime || ev.start?.date;
      if (!inicioStr) continue;
      const dt = new Date(inicioStr);
      const chave = chaveDia(dt);
      if (!eventosPorDia[chave]) eventosPorDia[chave] = [];
      eventosPorDia[chave].push(ev);
    }

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      const dataDia = new Date(ano, mes, dia);
      const chave = chaveDia(dataDia);
      const eventosDoDia = eventosPorDia[chave] || [];
      const passada = dataDia < hoje;
      const ehHoje = dataDia.getTime() === hoje.getTime();

      const celula = document.createElement('button');
      celula.type = 'button';
      celula.className = 'calendario-celula';
      if (passada) celula.classList.add('calendario-celula--passada');
      if (ehHoje) celula.classList.add('calendario-celula--hoje');

      // Determina o estado da célula
      const principal = eventosDoDia[0];
      if (!principal) {
        celula.classList.add('calendario-celula--livre');
      } else if (ehBloqueio(principal)) {
        celula.classList.add('calendario-celula--bloqueado');
      } else if (opcoes.corPorTipo) {
        const tipo = parsearDetalhes(principal.description).tipo || 'Outro';
        const slug = slugTipo(tipo);
        celula.classList.add(`calendario-celula--tipo-${slug}`);
      } else {
        celula.classList.add('calendario-celula--reservado');
      }

      const numero = document.createElement('span');
      numero.className = 'calendario-numero';
      numero.textContent = dia;
      celula.appendChild(numero);

      // Indicador de status (admin)
      if (opcoes.mostrarStatusIndicador && principal && !ehBloqueio(principal)) {
        const det = parsearDetalhes(principal.description);
        if (det.status) {
          const ind = document.createElement('span');
          ind.className = `calendario-indicador calendario-indicador--${det.status}`;
          ind.title = STATUS_LABEL[det.status] || det.status;
          celula.appendChild(ind);
        }
      }

      if (eventosDoDia.length > 0) {
        const mini = document.createElement('span');
        mini.className = 'calendario-evento-mini';
        if (ehBloqueio(principal)) {
          mini.textContent = 'Bloqueado';
        } else if (eventosDoDia.length === 1) {
          mini.textContent = nomeCurto(principal);
        } else {
          mini.textContent = `${eventosDoDia.length} eventos`;
        }
        celula.appendChild(mini);
      }

      const dataFmt = dataDia.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      const labelEstado = !principal ? 'disponível'
        : ehBloqueio(principal) ? 'indisponível'
        : `reservado (${eventosDoDia.length})`;
      celula.setAttribute('aria-label', `${dataFmt} — ${labelEstado}`);

      celula.addEventListener('click', () => {
        opcoes.aoClicarDia?.(dataDia, eventosDoDia);
      });

      opcoes.containerGrid.appendChild(celula);
    }
  }

  function chaveDia(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function nomeCurto(ev) {
    const det = parsearDetalhes(ev.description);
    const candidato = det.cliente || ev.summary || 'Reservado';
    return candidato.length > 18 ? candidato.slice(0, 16) + '…' : candidato;
  }

  if (opcoes.botaoAnterior) {
    opcoes.botaoAnterior.addEventListener('click', () => {
      definirMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1));
    });
  }
  if (opcoes.botaoProximo) {
    opcoes.botaoProximo.addEventListener('click', () => {
      definirMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1));
    });
  }

  definirMes(new Date());

  return {
    definirEventos,
    obterMesYM,
    irParaHoje: () => definirMes(new Date()),
    reRenderizar: renderizar,
  };
}

// =====================
// Helpers
// =====================

function ehBloqueio(evento) {
  return (evento?.summary || '').startsWith('[BLOQUEIO]');
}

function parsearDetalhes(descricao) {
  const det = {
    cliente: '', telefone: '', tipo: '', status: '',
    valor: '', valorPago: '', observacoes: '', motivo: ''
  };
  if (!descricao) return det;
  const linhas = descricao.split('\n');
  for (const linha of linhas) {
    const [chave, ...resto] = linha.split(':');
    const valor = resto.join(':').trim();
    const c = chave.trim().toLowerCase();
    if (c === 'cliente') det.cliente = valor;
    else if (c === 'telefone') det.telefone = valor;
    else if (c === 'tipo') det.tipo = valor;
    else if (c === 'status') det.status = valor;
    else if (c === 'valor') det.valor = valor.replace(/^r\$\s*/i, '');
    else if (c === 'pago') det.valorPago = valor.replace(/^r\$\s*/i, '');
    else if (c === 'obs') det.observacoes = valor;
    else if (c === 'motivo') det.motivo = valor;
  }
  return det;
}

function slugTipo(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.startsWith('casa')) return 'casamento';
  if (t.startsWith('anivers')) return 'aniversario';
  if (t.startsWith('corp')) return 'corporativo';
  return 'outro';
}

function formatarHora(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatarData(isoString, opcoes = {}) {
  return new Date(isoString).toLocaleDateString('pt-BR', {
    weekday: opcoes.weekday || 'long',
    day: 'numeric',
    month: opcoes.month || 'long',
    year: opcoes.year || 'numeric',
  });
}

function formatarParaInputDateTime(isoString) {
  if (!isoString) return '';
  const dt = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function formatarReais(valor) {
  const n = Number(String(valor || '0').replace(/[^\d.-]/g, '')) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

window.MiranteCalendario = {
  criar: criarCalendario,
  parsearDetalhes,
  formatarHora,
  formatarData,
  formatarParaInputDateTime,
  formatarReais,
  ehBloqueio,
  slugTipo,
  NOMES_MES,
  TIPOS_VALIDOS,
  STATUS_VALIDOS,
  STATUS_LABEL,
};

})();
