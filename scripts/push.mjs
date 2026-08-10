/**
 * `npm run push -- "mon message"` — envoie le travail vers GitHub, ce qui
 * déclenche automatiquement un déploiement Vercel.
 *
 * POURQUOI CE SCRIPT EXISTE : un `git add` + `git commit` + `git push` tapé à
 * la main échoue silencieusement de plusieurs façons — on est dans le mauvais
 * dossier, on oublie le `git add`, ou `git push` répond « Everything
 * up-to-date » parce qu'aucun commit n'a été créé. Rien de tout ça ne
 * ressemble à une erreur, donc on croit avoir poussé alors que non.
 *
 * Ce script fait les trois étapes dans le bon ordre, depuis la racine du dépôt
 * quel que soit le dossier courant, et REFUSE de mentir : il affiche le SHA
 * réellement présent sur GitHub à la fin. Si ce SHA correspond au commit local,
 * c'est parti. Sinon il sort en erreur.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Exécute git dans la racine du dépôt et rend la sortie (texte, sans retour final). */
function git(args, { quiet = true } = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })?.trim();
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const message = process.argv.slice(2).join(' ').trim();

console.log(`\nDossier : ${repoRoot}`);
console.log(`Dépôt   : ${git(['config', '--get', 'remote.origin.url'])}`);
console.log(`Branche : ${git(['rev-parse', '--abbrev-ref', 'HEAD'])}\n`);

// 1) Y a-t-il quelque chose à envoyer ?
const dirty = git(['status', '--porcelain']);
const aheadCount = Number(git(['rev-list', '--count', '@{u}..HEAD']).trim() || '0');

if (!dirty && aheadCount === 0) {
  console.log('Rien à envoyer — aucun fichier modifié et aucun commit en attente.');
  console.log('(Si tu pensais avoir modifié quelque chose, vérifie que tu as bien enregistré tes fichiers.)\n');
  process.exit(0);
}

// 2) Commit des modifications, s'il y en a.
if (dirty) {
  console.log('Fichiers modifiés :');
  for (const line of dirty.split('\n')) console.log(`  ${line}`);
  console.log('');

  if (!message) {
    fail('Il manque le message. Exemple :\n    npm run push -- "correction du prix affiché"');
  }

  git(['add', '-A']);
  git(['commit', '-m', message]);
  console.log(`✓ Commit créé : ${git(['rev-parse', '--short', 'HEAD'])} — ${message}\n`);
} else {
  console.log(`${aheadCount} commit(s) déjà créé(s), pas encore envoyé(s).\n`);
}

// 3) Envoi, puis VÉRIFICATION que GitHub a bien reçu (la seule preuve qui compte).
const localSha = git(['rev-parse', 'HEAD']);
try {
  git(['push', 'origin', 'HEAD'], { quiet: false });
} catch {
  fail(
    'Le push a échoué. Causes fréquentes :\n' +
      '  • identifiants GitHub expirés → relance, une fenêtre de connexion devrait s’ouvrir\n' +
      '  • pas de connexion internet\n' +
      '  • quelqu’un a poussé avant toi → fais `git pull --rebase` puis relance',
  );
}

const remoteSha = git(['ls-remote', 'origin', 'HEAD']).split(/\s+/)[0];
if (remoteSha !== localSha) {
  fail(`GitHub est à ${remoteSha.slice(0, 7)} alors que ton commit est ${localSha.slice(0, 7)} — l’envoi n’a PAS abouti.`);
}

console.log(`\n✓ Sur GitHub : ${remoteSha.slice(0, 7)}`);
console.log('✓ Vercel démarre le déploiement dans quelques secondes.');
console.log('  Suivi : https://vercel.com/wendels-projects-2d7a204a/pnice-academy\n');
