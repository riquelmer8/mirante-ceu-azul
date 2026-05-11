// Autenticação simples baseada em JWT em cookie httpOnly.
// Usuário e hash da senha vêm das variáveis de ambiente.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'felipe';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const COOKIE_NOME = 'mirante_token';
const TOKEN_DURACAO = '7d';

if (!ADMIN_PASSWORD_HASH) {
  console.warn('[auth] ADMIN_PASSWORD_HASH não definido. Login não vai funcionar até gerar a senha (rode: npm run gerar-senha).');
}
if (JWT_SECRET === 'troque-este-segredo-em-producao') {
  console.warn('[auth] JWT_SECRET usando valor padrão — defina um segredo forte em produção.');
}

async function login(usuario, senha) {
  if (!usuario || !senha) {
    return { ok: false, erro: 'Informe usuário e senha.' };
  }
  if (usuario !== ADMIN_USERNAME) {
    return { ok: false, erro: 'Credenciais inválidas.' };
  }
  if (!ADMIN_PASSWORD_HASH) {
    return { ok: false, erro: 'Senha do administrador não configurada no servidor.' };
  }

  const ok = await bcrypt.compare(senha, ADMIN_PASSWORD_HASH);
  if (!ok) {
    return { ok: false, erro: 'Credenciais inválidas.' };
  }

  const token = jwt.sign({ usuario }, JWT_SECRET, { expiresIn: TOKEN_DURACAO });
  return { ok: true, token, usuario };
}

function exigirAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NOME];
  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado.' });
  }
  try {
    const dados = jwt.verify(token, JWT_SECRET);
    req.usuario = dados.usuario;
    next();
  } catch {
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
}

function lerUsuarioOpcional(req) {
  const token = req.cookies?.[COOKIE_NOME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET).usuario;
  } catch {
    return null;
  }
}

module.exports = {
  login,
  exigirAuth,
  lerUsuarioOpcional,
  COOKIE_NOME,
  TOKEN_DURACAO,
};
