// Registro do service worker + banner de "Adicionar à tela inicial".

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[pwa] Service worker não registrado:', err);
    });
  });
}

let promptInstalar = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  // Mostra banner depois de 3s pra não atrapalhar o primeiro acesso
  setTimeout(mostrarBannerInstalar, 3000);
});

window.addEventListener('appinstalled', () => {
  promptInstalar = null;
  removerBanner();
});

function mostrarBannerInstalar() {
  if (!promptInstalar) return;
  if (document.getElementById('pwa-banner')) return;
  if (sessionStorage.getItem('pwa-banner-fechado')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.className = 'pwa-banner';
  banner.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
    <span class="pwa-banner-texto">Adicionar à tela inicial pra acessar mais rápido</span>
    <button class="btn btn-primario" id="pwa-instalar">Instalar</button>
    <button class="btn btn-ghost btn-icone" id="pwa-fechar" style="color:#fff" aria-label="Fechar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  document.body.appendChild(banner);

  document.getElementById('pwa-instalar').addEventListener('click', async () => {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    await promptInstalar.userChoice;
    promptInstalar = null;
    removerBanner();
  });
  document.getElementById('pwa-fechar').addEventListener('click', () => {
    sessionStorage.setItem('pwa-banner-fechado', '1');
    removerBanner();
  });
}

function removerBanner() {
  document.getElementById('pwa-banner')?.remove();
}
