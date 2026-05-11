// Gera um par de chaves VAPID pra Web Push.
// Uso: npm run gerar-vapid

const webPush = require('web-push');

const chaves = webPush.generateVAPIDKeys();

console.log('\n✓ Chaves VAPID geradas!\n');
console.log('Copie as linhas abaixo para o seu arquivo .env:\n');
console.log(`VAPID_PUBLIC_KEY=${chaves.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${chaves.privateKey}`);
console.log(`VAPID_EMAIL=mailto:contato@miranteceuazul.com.br`);
console.log('\nDepois reinicie o servidor.\n');
