// Tela de login.

document.addEventListener('DOMContentLoaded', () => {
  // Se já estiver logado, manda pro admin
  fetch('/api/auth/me')
    .then((r) => r.json())
    .then((d) => { if (d.autenticado) window.location.href = '/admin'; })
    .catch(() => {});

  const form = document.getElementById('form-login');
  const erroArea = document.getElementById('login-erro');
  const btn = document.getElementById('btn-entrar');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erroArea.innerHTML = '';

    const dados = Object.fromEntries(new FormData(form));
    if (!dados.usuario || !dados.senha) {
      erroArea.innerHTML = `<div class="form-erro">Preencha usuário e senha.</div>`;
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Entrando…`;

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.erro || 'Não foi possível entrar.');
      }
      window.location.href = '/admin';
    } catch (err) {
      erroArea.innerHTML = `<div class="form-erro">${err.message}</div>`;
      btn.disabled = false;
      btn.innerHTML = '<span>Entrar</span>';
    }
  });
});
