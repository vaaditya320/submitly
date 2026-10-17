import { hashPassword } from '../lib/security.js';
import readline from 'node:readline';
// Read from an interactive terminal without echoing the password or putting it in shell history.
if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal.');
process.stdout.write('New owner password (hidden): ');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let password = '';
process.stdin.on('keypress', async (value, key) => {
  if (key.ctrl && key.name === 'c') process.exit(1);
  if (key.name === 'return') {
    process.stdin.setRawMode(false); process.stdin.pause();
    if (password.length < 8) { console.error('\nUse at least 8 characters.'); process.exitCode = 1; return; }
    console.log('\nPaste this into ADMIN_PASSWORD_HASH in .env:\n' + await hashPassword(password));
    return;
  }
  if (key.name === 'backspace') password = password.slice(0, -1);
  else if (value && !key.ctrl && !key.meta) password += value;
});
