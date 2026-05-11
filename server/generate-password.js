// Utilitário para gerar o hash bcrypt da senha do admin.
// Uso:
//   node server/generate-password.js
//   node server/generate-password.js minhaSenhaForte

const bcrypt = require('bcryptjs');
const readline = require('readline');

async function gerarHash(senha) {
  const hash = await bcrypt.hash(senha, 12);
  console.log('\n✓ Hash gerado com sucesso!\n');
  console.log('Copie a linha abaixo para o seu arquivo .env:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
}

async function principal() {
  const senhaArg = process.argv[2];

  if (senhaArg) {
    await gerarHash(senhaArg);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Digite a senha do administrador: ', async (senha) => {
    if (!senha || senha.length < 6) {
      console.error('\n✗ Senha precisa ter pelo menos 6 caracteres.\n');
      rl.close();
      process.exit(1);
    }
    await gerarHash(senha);
    rl.close();
  });
}

principal().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
