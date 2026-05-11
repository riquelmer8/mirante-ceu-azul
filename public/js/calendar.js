// Página pública — só leitura.

const M = window.MiranteCalendario;
let whatsappNumero = '';
let cancelaUltimaBusca = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const resp = await fetch('/api/config');
    const cfg = await resp.json();
    whatsappNumero = cfg.whatsapp || '';
    if (cfg.modoMock) document.getElementById('aviso-mock')?.classList.remove('oculto');
  } catch {}

  const calendario = M.criar({
    containerMes: document.getElementById('calendario-mes'),
    containerGrid: document.getElementById('calendario-grid'),
    botaoAnterior: document.getElementById('btn-anterior'),
    botaoProximo: document.getElementById('btn-proximo'),
    corPorTipo: false, // público vê só "reservado" vs "indisponível"
    aoClicarDia: abrirModalDia,
    aoMudarMes: carregarMes,
  });

  document.getElementById('btn-hoje')?.addEventListener('click', () => calendario.irParaHoje());

  async function carregarMes(ym) {
    if (cancelaUltimaBusca) cancelaUltimaBusca.abort();
    const ctrl = new AbortController();
    cancelaUltimaBusca = ctrl;

    mostrarEstado('carregando');
    try {
      const resp = await fetch(`/api/events?month=${ym}`, { signal: ctrl.signal });
      if (!resp.ok) throw new Error('Falha');
      const dados = await resp.json();
      calendario.definirEventos(dados.eventos || []);
      mostrarEstado('ok');
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      mostrarEstado('erro');
    }
  }
});

function mostrarEstado(estado) {
  const el = document.getElementById('estado-calendario');
  if (!el) return;
  if (estado === 'ok') { el.classList.add('oculto'); return; }
  el.classList.remove('oculto');
  if (estado === 'carregando') {
    el.innerHTML = `<div class="estado"><div class="spinner" role="status" aria-label="Carregando"></div><div>Carregando agenda…</div></div>`;
  } else {
    el.innerHTML = `<div class="estado"><svg class="estado-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div class="estado-titulo">Não consegui carregar</div></div>`;
  }
}

function abrirModalDia(data, eventos) {
  const dataFmt = M.formatarData(data.toISOString(), { weekday: 'long', month: 'long' });
  const dataCap = dataFmt.charAt(0).toUpperCase() + dataFmt.slice(1);

  if (eventos.length === 0) {
    abrirModal({
      titulo: 'Data disponível',
      conteudo: `
        <div class="detalhes-lista">
          <div class="detalhe-item"><span class="badge badge--livre">✓ Livre</span></div>
          <div class="detalhe-item">
            <span class="detalhe-rotulo">Data</span>
            <span class="detalhe-valor" style="text-transform:capitalize">${dataCap}</span>
          </div>
          <p style="color:var(--texto-suave);margin:0.5rem 0 0;line-height:1.5;">
            Esta data está disponível pra reserva. Entre em contato pra mais informações sobre seu evento.
          </p>
        </div>`,
      acoes: whatsappNumero ? [
        {
          texto: 'Conversar no WhatsApp', classe: 'btn-whatsapp',
          icone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.18 2.095 3.195 5.076 4.485.709.3 1.263.495 1.694.645.712.227 1.36.195 1.871.121.571-.091 1.758-.721 2.006-1.413.255-.69.255-1.281.18-1.405-.074-.135-.27-.21-.566-.359zM12.057 21.25h-.005c-1.815 0-3.586-.49-5.13-1.41l-.367-.218-3.821 1.001 1.022-3.728-.241-.388C2.487 14.42 2 12.71 2 10.952 2.005 6.49 5.683 2.81 12.05 2.81c2.4 0 4.654.94 6.351 2.64 1.694 1.696 2.625 3.951 2.624 6.353 0 4.462-3.683 8.448-9.968 8.448"/></svg>',
          acao: () => {
            const dataMsg = data.toLocaleDateString('pt-BR');
            const msg = encodeURIComponent(`Olá! Tenho interesse em reservar o sítio Mirante Céu Azul para o dia ${dataMsg}. Pode me ajudar?`);
            window.open(`https://wa.me/${whatsappNumero}?text=${msg}`, '_blank');
          },
        },
      ] : [],
    });
    return;
  }

  // Bloqueio — público vê só "indisponível", sem motivo
  if (M.ehBloqueio(eventos[0])) {
    abrirModal({
      titulo: 'Data indisponível',
      conteudo: `
        <div class="detalhes-lista">
          <div class="detalhe-item"><span class="badge badge--bloqueado">Indisponível</span></div>
          <div class="detalhe-item">
            <span class="detalhe-rotulo">Data</span>
            <span class="detalhe-valor" style="text-transform:capitalize">${dataCap}</span>
          </div>
          <p style="color:var(--texto-suave);margin:0.5rem 0 0;">Esta data não está disponível pra reserva. Veja outras datas no calendário.</p>
        </div>`,
    });
    return;
  }

  // Reserva(s)
  const blocos = eventos.map((ev) => {
    const det = M.parsearDetalhes(ev.description);
    const horaInicio = M.formatarHora(ev.start?.dateTime);
    const horaFim = M.formatarHora(ev.end?.dateTime);
    return `
      <div class="detalhes-lista" style="padding-top:1rem;border-top:1px solid var(--linha-suave);">
        ${det.tipo ? `<div class="detalhe-item"><span class="badge badge-tipo--${M.slugTipo(det.tipo)}">${escapar(det.tipo)}</span></div>` : ''}
        <div class="detalhe-item"><span class="detalhe-rotulo">Horário</span><span class="detalhe-valor">${horaInicio}${horaFim ? ' — ' + horaFim : ''}</span></div>
      </div>`;
  }).join('');

  abrirModal({
    titulo: dataCap,
    conteudo: `
      <div class="detalhes-lista">
        <div class="detalhe-item"><span class="badge badge--reservado">${eventos.length === 1 ? 'Reservado' : `${eventos.length} reservas`}</span></div>
      </div>
      ${blocos}`,
  });
}

function abrirModal({ titulo, conteudo, acoes = [] }) {
  document.querySelectorAll('.modal-overlay').forEach((el) => el.remove());

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

  function fechar() {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') fechar(); }

  modal.querySelector('.modal-fechar').addEventListener('click', fechar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
  document.addEventListener('keydown', onEsc);

  acoes.forEach((a, i) => {
    modal.querySelector(`[data-acao="${i}"]`)?.addEventListener('click', () => { a.acao?.(); fechar(); });
  });

  setTimeout(() => modal.querySelector('.modal-fechar')?.focus(), 50);
}

function escapar(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
