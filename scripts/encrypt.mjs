// Encrypt the built site with StaticCrypt: dist/ -> dist-locked/ (the only thing deployed).
//
//   SITE_PASSWORD=...  npm run encrypt      (the deploy workflow does this)
//   npm run preview:locked                   (local test; password "preview" unless SITE_PASSWORD is set)
//
// The salt is derived from the password, so:
// - redeploying with the same password keeps remembered devices signed in;
// - changing the password changes the salt, which signs every remembered device out.
import { cpSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.argv.includes('--preview');

let password = process.env.SITE_PASSWORD || '';
if (!password && preview) {
  password = 'preview';
  console.log('Local preview: the password is "preview".');
}
if (!password) {
  console.error('SITE_PASSWORD is not set. Refusing to deploy an unprotected site.');
  process.exit(1);
}

const dist = resolve(root, 'dist');
const locked = resolve(root, 'dist-locked');
if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

// Fresh output: copy public assets (terrain images), then replace index.html with the encrypted one.
rmSync(locked, { recursive: true, force: true });
cpSync(dist, locked, { recursive: true });
rmSync(resolve(locked, 'index.html'));

const salt = createHash('sha256').update(`kauai-map:${password}`).digest('hex').slice(0, 32);
const cli = resolve(root, 'node_modules/staticrypt/cli/index.js');
execFileSync(
  process.execPath,
  [
    cli,
    resolve(dist, 'index.html'),
    '--directory', locked,
    '--config', 'false', // never write a .staticrypt.json with the salt
    '--salt', salt,
    '--short',
    '--remember', '30',
    '--template', resolve(root, 'staticrypt/password_template.html'),
    '--template-title', 'Kauai Trip',
    '--template-instructions', 'Enter the trip password to open the map.',
    '--template-placeholder', 'Password',
    '--template-button', 'Open map',
    '--template-remember', 'Remember this device for 30 days',
    '--template-error', 'That password did not work. Try again.',
    '--template-toggle-show', 'Show',
    '--template-toggle-hide', 'Hide',
  ],
  // Password goes in through the environment, never the command line.
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, STATICRYPT_PASSWORD: password } },
);

// Safety net: the locked page must not contain any readable trip data.
const out = readFileSync(resolve(locked, 'index.html'), 'utf8');
const leaks = [
  process.env.SHEET_CSV_URL,
  process.env.VITE_SHEET_CSV_URL,
  process.env.SUGGEST_FORM_URL,
  process.env.VITE_SUGGEST_FORM_URL,
  'docs.google.com/spreadsheets',
  'docs.google.com/forms',
  'primary_category',
  'Home base',
].filter((s) => s && out.includes(s));
if (leaks.length) {
  rmSync(locked, { recursive: true, force: true });
  console.error('Encrypted page still contains readable trip data; deleted dist-locked. Do not deploy.');
  process.exit(1);
}
console.log('Encrypted -> dist-locked/index.html (no readable trip data found).');
