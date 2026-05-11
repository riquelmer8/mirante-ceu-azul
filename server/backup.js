// Backup diário simples: salva eventos em /data/backup-YYYY-MM-DD.json e mantém 30 dias.

const fs = require('fs');
const path = require('path');

const PASTA_BACKUP = path.join(__dirname, '..', 'data', 'backups');
const DIAS_RETER = 30;

function garantirPasta() {
  if (!fs.existsSync(PASTA_BACKUP)) fs.mkdirSync(PASTA_BACKUP, { recursive: true });
}

async function salvarBackup(eventos) {
  garantirPasta();
  const hoje = new Date().toISOString().slice(0, 10);
  const arq = path.join(PASTA_BACKUP, `backup-${hoje}.json`);
  fs.writeFileSync(arq, JSON.stringify({
    geradoEm: new Date().toISOString(),
    total: eventos.length,
    eventos,
  }, null, 2));
  limparAntigos();
  return arq;
}

function limparAntigos() {
  try {
    const arquivos = fs.readdirSync(PASTA_BACKUP)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();
    if (arquivos.length <= DIAS_RETER) return;
    const remover = arquivos.slice(0, arquivos.length - DIAS_RETER);
    for (const f of remover) {
      fs.unlinkSync(path.join(PASTA_BACKUP, f));
    }
  } catch (err) {
    console.warn('[backup] Erro ao limpar backups antigos:', err.message);
  }
}

module.exports = { salvarBackup };
