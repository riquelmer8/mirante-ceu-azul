// Painel administrativo — gerencia reservas, bloqueios, filtros, financeiro, push.

const M = window.MiranteCalendario;

let cancelaUltimaBusca = null;
let cacheEventos = [];
let mesAtualYM = null;
let calendario = null;
let whatsappNumero = '';
let configCarregada = null;

// Estado dos filtros
const filtros = {
  busca: '',
  status: 'todos',
  diasFrente: 30,
};

document.addEventListener('DOMContentLoaded', async () => {
  // Verifica auth
  try {
    const dados = await (await fetch('/api/auth/me')).json();
    if (!dados.autenticado) { window.location.href = '/login'; return; }
  } catch { window.location.href = '/login'; return; }

  // Carrega config
  try {
    configCarregada = await (await fetch('/api/config')).json();
    whatsappNumero = configCarregada.whatsapp || '';
    if (configCarregada.modoMock) document.getElementById('aviso-mock')?.classList.remove('oculto');
  } catch {}

  calendario = M.criar({
    containerMes: document.getElementById('calendario-mes'),
    containerGrid: document.getElementById('calendario-grid'),
    botaoAnterior: document.getElementById('btn-anterior'),
    botaoProximo: document.getElementById('btn-proximo'),
    corPorTipo: true,
    mostrarStatusIndicador: true,
    aoClicarDia: abrirModalDia,
    aoMudarMes: carregarMes,
  });

  document.getElementById('btn-hoje')?.addEventListener('click', () => calendario.irParaHoje());
  document.getElementById('btn-nova-reserva')?.addEventListener('click', () => abrirFormReserva());
  document.getElementById('btn-bloquear')?.addEventListener('click', () => abrirFormBloqueio());
  document.getElementById('btn-logout')?.addEventListener('click', sair);
  document.getElementById('btn-sincronizar')?.addEventListener('click', () => {
    if (mesAtualYM) carregarMes(mesAtualYM);
    toast('Agenda atualizada.', 'sucesso');
  });

  // Filtros
  const inputBusca = document.getElementById('filtro-busca');
  inputBusca?.addEventListener('input', (e) => {
    filtros.busca = e.target.value.trim().toLowerCase();
    renderizarProximas();
  });

  document.querySelectorAll('.pill[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill[data-status]').forEach((b) => b.classList.remove('pill--ativo'));
      btn.classList.add('pill--ativo');
      filtros.status = btn.dataset.status;
      renderizarProximas();
    });
  });

  document.getElementById('filtro-periodo')?.addEventListener('change', (e) => {
    filtros.diasFrente = parseInt(e.target.value, 10) || 30;
    renderizarProximas();
  });

  // Push notifications
  configurarBotaoPush();
});

// =====================
// Carregar mês
// =====================
async function carregarMes(ym) {
  mesAtualYM = ym;
  if (cancelaUltimaBusca) cancelaUltimaBusca.abort();
  const ctrl = new AbortController();
  cancelaUltimaBusca = ctrl;

  mostrarEstadoCalendario('carregando');
  mostrarEstadoProximas('carregando');

  try {
    const resp = await fetch(`/api/events?month=${ym}`, { signal: ctrl.signal });
    if (!resp.ok) throw new Error('Falha');
    const dados = await resp.json();
    cacheEventos = dados.eventos || [];
    calendario.definirEventos(cacheEventos);
    mostrarEstadoCalendario('ok');
    renderizarProximas();
    renderizarResumo();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    mostrarEstadoCalendario('erro');
    mostrarEstadoProximas('erro');
  }
}

function mostrarEstadoCalendario(estado) {
  const el = document.getElementById('estado-calendario');
  if (!el) return;
  if (estado === 'ok') { el.classList.add('oculto'); return; }
  el.classList.remove('oculto');
  el.innerHTML = estado === 'carregando'
    ? `<div class="estado"><div class="spinner" role="status"></div><div>Carregando…</div></div>`
    : `<div class="estado"><div class="estado-titulo">Erro ao carregar</div></div>`;
}

function mostrarEstadoProximas(estado) {
  const el = document.getElementById('proximas-lista');
  if (!el) return;
  if (estado === 'carregando') {
    el.innerHTML = `<li><div class="estado" style="padding:2rem 1rem"><div class="spinner"></div></div></li>`;
  } else if (estado === 'erro') {
    el.innerHTML = `<li><div class="estado" style="padding:2rem 1rem">Erro ao carregar</div></li>`;
  }
}

// =====================
// Resumo financeiro do mês visualizado
// =====================
function renderizarResumo() {
  const reservas = cacheEventos.filter((ev) => !M.ehBloqueio(ev) && pertenceAoMes(ev, mesAtualYM));
  let confirmado = 0, pago = 0, projetado = 0;
  let nConfirmadas = 0, nOrcamento = 0;

  for (const ev of reservas) {
    const det = M.parsearDetalhes(ev.description);
    const valor = numericoSimples(det.valor);
    const valorPago = numericoSimples(det.valorPago);
    projetado += valor;
    if (det.status === 'orcamento') {
      nOrcamento++;
    } else {
      confirmado += valor;
      pago += valorPago;
      nConfirmadas++;
    }
  }

  const aReceber = Math.max(0, confirmado - pago);
  set('resumo-confirmado', M.formatarReais(confirmado));
  set('resumo-confirmado-detalhe', `${nConfirmadas} ${nConfirmadas === 1 ? 'evento' : 'eventos'}`);
  set('resumo-pago', M.formatarReais(pago));
  set('resumo-pago-detalhe', `a receber: ${M.formatarReais(aReceber)}`);
  set('resumo-projetado', M.formatarReais(projetado));
  set('resumo-projetado-detalhe', nOrcamento > 0 ? `inclui ${nOrcamento} ${nOrcamento === 1 ? 'orçamento' : 'orçamentos'}` : 'todos confirmados');
  set('resumo-eventos', String(reservas.length));
  const bloqueios = cacheEventos.filter((ev) => M.ehBloqueio(ev) && pertenceAoMes(ev, mesAtualYM)).length;
  set('resumo-eventos-detalhe', bloqueios > 0 ? `+ ${bloqueios} bloqueio(s)` : 'sem bloqueios');
}

function pertenceAoMes(ev, ym) {
  if (!ym) return true;
  const dt = new Date(ev.start?.dateTime || ev.start?.date);
  const evYm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return evYm === ym;
}

function numericoSimples(v) {
  return Number(String(v || '0').replace(/[^\d.-]/g, '')) || 0;
}

function set(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// =====================
// Lista lateral com filtros
// =====================
function renderizarProximas() {
  const el = document.getElementById('proximas-lista');
  if (!el) return;

  const agora = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + filtros.diasFrente);

  let lista = cacheEventos
    .filter((ev) => {
      const dt = new Date(ev.start?.dateTime || ev.start?.date);
      return dt >= agora && dt <= limite;
    })
    .sort((a, b) => new Date(a.start?.dateTime) - new Date(b.start?.dateTime));

  // Filtra por status (bloqueios sempre passam)
  if (filtros.status !== 'todos') {
    lista = lista.filter((ev) => {
      if (M.ehBloqueio(ev)) return false; // bloqueios não têm status
      const det = M.parsearDetalhes(ev.description);
      return det.status === filtros.status;
    });
  }

  // Filtra por busca
  if (filtros.busca) {
    lista = lista.filter((ev) => {
      const det = M.parsearDetalhes(ev.description);
      const alvo = `${det.cliente} ${det.tipo} ${det.observacoes} ${ev.summary || ''}`.toLowerCase();
      return alvo.includes(filtros.busca);
    });
  }

  if (lista.length === 0) {
    el.innerHTML = `
      <li><div class="estado" style="padding:2.5rem 1rem">
        <svg class="estado-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div class="estado-titulo">Nenhum evento</div>
        <div style="font-size:0.875rem;">Ajuste os filtros ou crie uma reserva.</div>
      </div></li>`;
    return;
  }

  el.innerHTML = lista.map((ev) => {
    const dt = new Date(ev.start?.dateTime);
    const ehBlq = M.ehBloqueio(ev);
    const det = M.parsearDetalhes(ev.description);
    const titulo = ehBlq ? (det.motivo || 'Bloqueio') : (det.cliente || 'Reserva');
    const meta = ehBlq
      ? `<span class="badge badge--bloqueado">Bloqueio</span>`
      : `${det.tipo ? `<span class="badge badge-tipo--${M.slugTipo(det.tipo)}">${escapar(det.tipo)}</span>` : ''}${det.status ? `<span class="badge badge-status--${det.status}">${escapar(M.STATUS_LABEL[det.status] || det.status)}</span>` : ''}`;

    return `
      <li>
        <button class="proximo-item" data-id="${escapar(ev.id)}">
          <div class="proximo-data ${ehBlq ? 'proximo-data--bloqueio' : ''}">
            <span class="proximo-data-dia">${dt.getDate()}</span>
            <span class="proximo-data-mes">${M.NOMES_MES[dt.getMonth()].slice(0, 3)}</span>
          </div>
          <div class="proximo-info">
            <span class="proximo-cliente">${escapar(titulo)}</span>
            <span class="proximo-meta">${meta}<span style="color:var(--texto-leve)">${M.formatarHora(ev.start?.dateTime)}</span></span>
          </div>
        </button>
      </li>`;
  }).join('');

  el.querySelectorAll('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ev = cacheEventos.find((e) => e.id === btn.dataset.id);
      if (!ev) return;
      const dt = new Date(ev.start?.dateTime);
      abrirModalDia(dt, [ev]);
    });
  });
}

// =====================
// Modal do dia (admin)
// =====================
function abrirModalDia(data, eventos) {
  const dataFmt = M.formatarData(data.toISOString(), { weekday: 'long', month: 'long' });
  const dataCap = dataFmt.charAt(0).toUpperCase() + dataFmt.slice(1);

  if (eventos.length === 0) {
    abrirModal({
      titulo: 'Data disponível',
      conteudo: `
        <div class="detalhes-lista">
          <div class="detalhe-item"><span class="badge badge--livre">Livre</span></div>
          <div class="detalhe-item">
            <span class="detalhe-rotulo">Data</span>
            <span class="detalhe-valor" style="text-transform:capitalize">${dataCap}</span>
          </div>
        </div>`,
      acoes: [
        { texto: 'Bloquear data', classe: 'btn-secundario', acao: () => abrirFormBloqueio({ data }) },
        { texto: 'Criar reserva', classe: 'btn-primario', acao: () => abrirFormReserva({ data }) },
      ],
    });
    return;
  }

  const blocos = eventos.map((ev) => {
    if (M.ehBloqueio(ev)) {
      const det = M.parsearDetalhes(ev.description);
      return `
        <div class="detalhes-lista" style="padding-top:1rem;border-top:1px solid var(--linha-suave);">
          <div class="detalhe-item"><span class="badge badge--bloqueado">Bloqueio</span></div>
          <div class="detalhe-item"><span class="detalhe-rotulo">Motivo</span><span class="detalhe-valor">${escapar(det.motivo || '-')}</span></div>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <button class="btn btn-perigo" data-excluir="${escapar(ev.id)}" style="flex:1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Remover bloqueio
            </button>
          </div>
        </div>`;
    }
    const det = M.parsearDetalhes(ev.description);
    const horaInicio = M.formatarHora(ev.start?.dateTime);
    const horaFim = M.formatarHora(ev.end?.dateTime);
    const valor = numericoSimples(det.valor);
    const pago = numericoSimples(det.valorPago);
    const restante = Math.max(0, valor - pago);
    return `
      <div class="detalhes-lista" style="padding-top:1rem;border-top:1px solid var(--linha-suave);">
        <div class="detalhe-item" style="display:flex;flex-direction:row;gap:0.375rem;flex-wrap:wrap">
          ${det.tipo ? `<span class="badge badge-tipo--${M.slugTipo(det.tipo)}">${escapar(det.tipo)}</span>` : ''}
          ${det.status ? `<span class="badge badge-status--${det.status}">${escapar(M.STATUS_LABEL[det.status] || det.status)}</span>` : ''}
        </div>
        ${det.cliente ? `<div class="detalhe-item"><span class="detalhe-rotulo">Cliente</span><span class="detalhe-valor">${escapar(det.cliente)}</span></div>` : ''}
        ${det.telefone ? `<div class="detalhe-item"><span class="detalhe-rotulo">Telefone</span><span class="detalhe-valor">${escapar(det.telefone)}</span></div>` : ''}
        <div class="detalhe-item"><span class="detalhe-rotulo">Horário</span><span class="detalhe-valor">${horaInicio}${horaFim ? ' — ' + horaFim : ''}</span></div>
        ${valor > 0 ? `
          <div class="detalhe-item"><span class="detalhe-rotulo">Valor total</span><span class="detalhe-valor detalhe-valor--dinheiro">${M.formatarReais(valor)}</span></div>
          <div class="detalhe-item"><span class="detalhe-rotulo">Pago</span><span class="detalhe-valor">${M.formatarReais(pago)} ${restante > 0 ? `· <span style="color:var(--dourado)">restam ${M.formatarReais(restante)}</span>` : '<span style="color:var(--status-paga)">· quitado ✓</span>'}</span></div>
        ` : ''}
        ${det.observacoes ? `<div class="detalhe-item"><span class="detalhe-rotulo">Observações</span><span class="detalhe-valor">${escapar(det.observacoes)}</span></div>` : ''}
        <div style="display:flex;gap:0.375rem;margin-top:0.5rem;flex-wrap:wrap;">
          <button class="btn btn-secundario btn-sm" data-copiar="${escapar(ev.id)}" style="flex:1;min-width:130px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copiar
          </button>
          <button class="btn btn-secundario btn-sm" data-editar="${escapar(ev.id)}" style="flex:1;min-width:100px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Editar
          </button>
          <button class="btn btn-perigo btn-sm" data-excluir="${escapar(ev.id)}" style="flex:1;min-width:100px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            Excluir
          </button>
        </div>
      </div>`;
  }).join('');

  abrirModal({
    titulo: dataCap,
    conteudo: `
      <div class="detalhes-lista">
        <div class="detalhe-item"><span class="badge ${M.ehBloqueio(eventos[0]) ? 'badge--bloqueado' : 'badge--reservado'}">${eventos.length === 1 ? (M.ehBloqueio(eventos[0]) ? 'Bloqueado' : 'Reservado') : `${eventos.length} eventos`}</span></div>
      </div>
      ${blocos}`,
    aposMontar: (modal) => {
      modal.querySelectorAll('[data-editar]').forEach((b) => {
        b.addEventListener('click', () => {
          const ev = cacheEventos.find((e) => e.id === b.dataset.editar);
          if (ev) abrirFormReserva({ evento: ev });
        });
      });
      modal.querySelectorAll('[data-excluir]').forEach((b) => {
        b.addEventListener('click', () => excluirEvento(b.dataset.excluir));
      });
      modal.querySelectorAll('[data-copiar]').forEach((b) => {
        b.addEventListener('click', () => {
          const ev = cacheEventos.find((e) => e.id === b.dataset.copiar);
          if (ev) copiarParaWhatsApp(ev);
        });
      });
    },
  });
}

// =====================
// Form de reserva
// =====================
function abrirFormReserva({ data, evento } = {}) {
  const editando = !!evento;
  const det = editando ? M.parsearDetalhes(evento.description) : { cliente: '', telefone: '', tipo: '', status: 'confirmada', valor: '', valorPago: '0', observacoes: '' };
  if (!editando) det.status = 'confirmada'; // padrão

  let inicioIso, fimIso;
  if (editando) {
    inicioIso = evento.start?.dateTime;
    fimIso = evento.end?.dateTime;
  } else if (data) {
    const ini = new Date(data); ini.setHours(14, 0, 0, 0);
    const fim = new Date(data); fim.setHours(22, 0, 0, 0);
    inicioIso = ini.toISOString();
    fimIso = fim.toISOString();
  } else {
    const ini = new Date(); ini.setMinutes(0, 0, 0); ini.setHours(ini.getHours() + 1);
    const fim = new Date(ini); fim.setHours(fim.getHours() + 4);
    inicioIso = ini.toISOString();
    fimIso = fim.toISOString();
  }

  abrirModal({
    titulo: editando ? 'Editar reserva' : 'Nova reserva',
    conteudo: `
      <form id="form-reserva">
        <div class="form-grupo">
          <label class="form-label form-label-obrigatorio" for="f-cliente">Nome do cliente</label>
          <input class="form-input" id="f-cliente" name="cliente" required value="${escapar(det.cliente)}" autocomplete="off" />
        </div>
        <div class="form-grade">
          <div class="form-grupo">
            <label class="form-label" for="f-telefone">Telefone</label>
            <input class="form-input" id="f-telefone" name="telefone" type="tel" value="${escapar(det.telefone)}" placeholder="(11) 99999-9999" />
          </div>
          <div class="form-grupo">
            <label class="form-label form-label-obrigatorio" for="f-tipo">Tipo de evento</label>
            <select class="form-select" id="f-tipo" name="tipo" required>
              <option value="">Selecione…</option>
              ${M.TIPOS_VALIDOS.map((t) => `<option value="${t}" ${det.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-grade">
          <div class="form-grupo">
            <label class="form-label form-label-obrigatorio" for="f-inicio">Início</label>
            <input class="form-input" id="f-inicio" name="dataInicio" type="datetime-local" required value="${M.formatarParaInputDateTime(inicioIso)}" />
          </div>
          <div class="form-grupo">
            <label class="form-label form-label-obrigatorio" for="f-fim">Fim</label>
            <input class="form-input" id="f-fim" name="dataFim" type="datetime-local" required value="${M.formatarParaInputDateTime(fimIso)}" />
          </div>
        </div>
        <div class="form-divisor"></div>
        <div class="form-grupo">
          <label class="form-label" for="f-status">Status</label>
          <select class="form-select" id="f-status" name="status">
            ${M.STATUS_VALIDOS.map((s) => `<option value="${s}" ${det.status === s ? 'selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}
          </select>
        </div>
        <div class="form-grade">
          <div class="form-grupo">
            <label class="form-label" for="f-valor">Valor total (R$)</label>
            <input class="form-input" id="f-valor" name="valor" type="text" inputmode="decimal" value="${escapar(det.valor)}" placeholder="Ex: 12000" />
          </div>
          <div class="form-grupo">
            <label class="form-label" for="f-pago">Valor pago (R$)</label>
            <input class="form-input" id="f-pago" name="valorPago" type="text" inputmode="decimal" value="${escapar(det.valorPago)}" placeholder="0" />
          </div>
        </div>
        <div class="form-grupo">
          <label class="form-label" for="f-obs">Observações</label>
          <textarea class="form-textarea" id="f-obs" name="observacoes" rows="3">${escapar(det.observacoes)}</textarea>
        </div>
        <div id="form-erro-area"></div>
      </form>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', acao: () => {} },
      { texto: editando ? 'Salvar' : 'Criar reserva', classe: 'btn-primario', manual: true, acao: () => {} },
    ],
    aposMontar: (modal) => {
      const form = modal.querySelector('#form-reserva');
      const btnSalvar = modal.querySelector('[data-acao="1"]');
      const erroArea = modal.querySelector('#form-erro-area');

      btnSalvar.addEventListener('click', async (e) => {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(form));
        if (!dados.cliente || !dados.tipo || !dados.dataInicio || !dados.dataFim) {
          erroArea.innerHTML = `<div class="form-erro">Preencha os campos obrigatórios.</div>`;
          return;
        }
        if (new Date(dados.dataFim) <= new Date(dados.dataInicio)) {
          erroArea.innerHTML = `<div class="form-erro">A data/hora de fim deve ser depois do início.</div>`;
          return;
        }
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Salvando…`;
        try {
          const url = editando ? `/api/events/${encodeURIComponent(evento.id)}` : '/api/events';
          const method = editando ? 'PUT' : 'POST';
          const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
          if (!resp.ok) {
            const erro = await resp.json().catch(() => ({}));
            throw new Error(erro.erro || 'Erro ao salvar');
          }
          fecharModal();
          await carregarMes(mesAtualYM);
          toast(editando ? 'Reserva atualizada.' : 'Reserva criada.', 'sucesso');
        } catch (err) {
          erroArea.innerHTML = `<div class="form-erro">${escapar(err.message)}</div>`;
          btnSalvar.disabled = false;
          btnSalvar.innerHTML = `<span>${editando ? 'Salvar' : 'Criar reserva'}</span>`;
        }
      });
    },
  });
}

// =====================
// Form de bloqueio
// =====================
function abrirFormBloqueio({ data } = {}) {
  let inicioIso, fimIso;
  if (data) {
    const ini = new Date(data); ini.setHours(0, 0, 0, 0);
    const fim = new Date(data); fim.setHours(23, 59, 0, 0);
    inicioIso = ini.toISOString(); fimIso = fim.toISOString();
  } else {
    const ini = new Date(); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() + 1);
    const fim = new Date(ini); fim.setHours(23, 59, 0, 0);
    inicioIso = ini.toISOString(); fimIso = fim.toISOString();
  }

  abrirModal({
    titulo: 'Bloquear data',
    conteudo: `
      <p style="color:var(--texto-suave);font-size:0.875rem;margin:0 0 1rem">A data fica indisponível pra reservas. No calendário público aparece como "indisponível", sem o motivo.</p>
      <form id="form-bloqueio">
        <div class="form-grupo">
          <label class="form-label form-label-obrigatorio" for="b-motivo">Motivo (visível só pra você)</label>
          <input class="form-input" id="b-motivo" name="motivo" required placeholder="Ex: manutenção, férias, evento pessoal" />
        </div>
        <div class="form-grade">
          <div class="form-grupo">
            <label class="form-label form-label-obrigatorio" for="b-inicio">Início</label>
            <input class="form-input" id="b-inicio" name="dataInicio" type="datetime-local" required value="${M.formatarParaInputDateTime(inicioIso)}" />
          </div>
          <div class="form-grupo">
            <label class="form-label form-label-obrigatorio" for="b-fim">Fim</label>
            <input class="form-input" id="b-fim" name="dataFim" type="datetime-local" required value="${M.formatarParaInputDateTime(fimIso)}" />
          </div>
        </div>
        <div id="form-erro-area"></div>
      </form>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', acao: () => {} },
      { texto: 'Bloquear', classe: 'btn-primario', manual: true, acao: () => {} },
    ],
    aposMontar: (modal) => {
      const form = modal.querySelector('#form-bloqueio');
      const btnSalvar = modal.querySelector('[data-acao="1"]');
      const erroArea = modal.querySelector('#form-erro-area');

      btnSalvar.addEventListener('click', async (e) => {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(form));
        if (!dados.motivo || !dados.dataInicio || !dados.dataFim) {
          erroArea.innerHTML = `<div class="form-erro">Preencha tudo.</div>`; return;
        }
        if (new Date(dados.dataFim) <= new Date(dados.dataInicio)) {
          erroArea.innerHTML = `<div class="form-erro">Fim deve ser depois do início.</div>`; return;
        }
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Bloqueando…`;
        try {
          const resp = await fetch('/api/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
          if (!resp.ok) throw new Error('Erro ao bloquear');
          fecharModal();
          await carregarMes(mesAtualYM);
          toast('Data bloqueada.', 'sucesso');
        } catch (err) {
          erroArea.innerHTML = `<div class="form-erro">${escapar(err.message)}</div>`;
          btnSalvar.disabled = false;
          btnSalvar.innerHTML = `<span>Bloquear</span>`;
        }
      });
    },
  });
}

// =====================
// Excluir + copiar pro WhatsApp
// =====================
async function excluirEvento(id) {
  if (!confirm('Tem certeza que quer excluir? Esta ação não pode ser desfeita.')) return;
  try {
    const resp = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Erro');
    fecharModal();
    await carregarMes(mesAtualYM);
    toast('Evento excluído.', 'sucesso');
  } catch {
    toast('Não foi possível excluir.', 'erro');
  }
}

function copiarParaWhatsApp(ev) {
  const det = M.parsearDetalhes(ev.description);
  const data = M.formatarData(ev.start?.dateTime, { weekday: 'long' });
  const horaIni = M.formatarHora(ev.start?.dateTime);
  const horaFim = M.formatarHora(ev.end?.dateTime);
  const valor = numericoSimples(det.valor);
  const pago = numericoSimples(det.valorPago);
  const restante = Math.max(0, valor - pago);

  const linhas = [
    `📅 *${det.tipo || 'Reserva'} — ${det.cliente || 'Sem nome'}*`,
    ``,
    `📆 ${data}`,
    `🕐 ${horaIni}${horaFim ? ' às ' + horaFim : ''}`,
    det.telefone ? `📞 ${det.telefone}` : null,
    valor ? `💰 Total: ${M.formatarReais(valor)}` : null,
    valor ? `   Pago: ${M.formatarReais(pago)}${restante > 0 ? ` · Restam: ${M.formatarReais(restante)}` : ' (quitado)'}` : null,
    det.observacoes ? `📝 ${det.observacoes}` : null,
  ].filter(Boolean).join('\n');

  navigator.clipboard.writeText(linhas).then(() => {
    toast('Dados copiados — cole no WhatsApp.', 'sucesso');
  }).catch(() => {
    // Fallback: abre o WhatsApp direto se tiver telefone
    if (det.telefone && whatsappNumero) {
      const tel = det.telefone.replace(/\D/g, '');
      window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(linhas)}`, '_blank');
    } else {
      toast('Não consegui copiar.', 'erro');
    }
  });
}

// =====================
// Push notifications
// =====================
async function configurarBotaoPush() {
  const btn = document.getElementById('btn-push');
  if (!btn) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!configCarregada?.pushHabilitado) return;

  // Verifica estado atual
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) return; // já inscrito — não mostra botão

  btn.classList.remove('oculto');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        toast('Permissão de notificação negada.', 'erro');
        btn.disabled = false;
        return;
      }
      const novaSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(configCarregada.vapidPublicKey),
      });
      const resp = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novaSub),
      });
      if (!resp.ok) throw new Error('Falha ao registrar');
      toast('Notificações ativadas!', 'sucesso');
      btn.classList.add('oculto');
    } catch (err) {
      console.error(err);
      toast('Erro ao ativar notificações.', 'erro');
      btn.disabled = false;
    }
  });
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function sair() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// =====================
// Modal helpers
// =====================
function abrirModal({ titulo, conteudo, acoes = [], aposMontar }) {
  fecharModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-titulo">${titulo}</h2>
      <button class="modal-fechar" aria-label="Fechar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">${conteudo}</div>
    ${acoes.length ? `<div class="modal-footer">${acoes.map((a, i) => `<button class="btn ${a.classe || 'btn-primario'}" data-acao="${i}">${a.icone || ''}<span>${a.texto}</span></button>`).join('')}</div>` : ''}
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  modal.querySelector('.modal-fechar').addEventListener('click', fecharModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });
  document.addEventListener('keydown', escFechar);

  acoes.forEach((a, i) => {
    if (a.manual) return; // ação que será conectada via aposMontar (forms)
    modal.querySelector(`[data-acao="${i}"]`)?.addEventListener('click', () => {
      a.acao?.();
      // Fecha SÓ este overlay (se ainda existir — pode ter sido substituído por outro modal)
      if (document.body.contains(overlay)) {
        overlay.remove();
        // Só restaura o scroll se não houver outro modal aberto
        if (!document.querySelector('.modal-overlay')) {
          document.body.style.overflow = '';
        }
      }
    });
  });

  if (aposMontar) aposMontar(modal);
  setTimeout(() => modal.querySelector('.modal-fechar')?.focus(), 50);
}

function fecharModal() {
  document.querySelectorAll('.modal-overlay').forEach((el) => el.remove());
  document.body.style.overflow = '';
  document.removeEventListener('keydown', escFechar);
}
function escFechar(e) { if (e.key === 'Escape') fecharModal(); }

function toast(texto, tipo = 'sucesso') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast toast--${tipo}`;
  el.textContent = texto;
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapar(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
