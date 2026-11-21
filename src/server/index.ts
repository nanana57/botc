import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { startServer } from './server';

// Chargement minimal de .env (sans dépendance) — les clés restent côté serveur.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const port = Number(process.env.PORT || 8787);
startServer({ port, dataDir: join(ROOT, 'data', 'rooms'), staticDir: join(ROOT, 'dist') }).then(s => {
  const ai = process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'none' ? `IA : ${process.env.AI_PROVIDER}` : 'IA : phrases locales (aucun fournisseur configuré)';
  console.log(`Minuit au Clocher — serveur prêt sur http://localhost:${s.port}  (${ai})`);
});
