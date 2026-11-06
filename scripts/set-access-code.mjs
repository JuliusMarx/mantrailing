// Sets the access code of the gate in src/index.html. Only a SHA-256 hash is stored.
//   npm run access-code
// The code is read without echoing it. Changing it locks out everyone until they enter the new one.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';

const FILE = new URL('../src/index.html', import.meta.url);
const html = readFileSync(FILE, 'utf8');
const key = html.match(/var ACCESS = \{ key: '([^']+)'/)?.[1];
if (!key) throw new Error('No ACCESS gate found in src/index.html');

/** Input that arrived after the end of the previous answer (piped input comes in one chunk). */
let buffered = '';

/** Reads one line without echoing it. */
function ask(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    let value = '';
    const consume = (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];
        if (char === '\r' || char === '\n') {
          // Skip the "\n" of a "\r\n" pair, keep the rest for the next question.
          buffered = chunk.slice(chunk[i + 1] === '\n' && char === '\r' ? i + 2 : i + 1);
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', consume);
          stdout.write('\n');
          resolve(value);
          return true;
        }
        if (char === '\u0003') process.exit(1); // Ctrl+C
        if (char === '\u007f' || char === '\b') {
          if (value) stdout.write('\b \b');
          value = value.slice(0, -1);
        } else if (char >= ' ') {
          // Show a star per character, so you can see the typing arrives.
          value += char;
          stdout.write('*');
        }
      }
      return false;
    };
    const rest = buffered;
    buffered = '';
    if (consume(rest)) return;
    stdin.setRawMode?.(true);
    stdin.setEncoding('utf8');
    stdin.on('data', consume);
    stdin.resume();
  });
}

let code = '';
for (let attempt = 1; !code; attempt++) {
  if (attempt > 3) {
    console.error('Abgebrochen, nichts geändert. / Cancelled, nothing changed.');
    process.exit(1);
  }
  const first = (await ask('Neuer Zugangscode / New access code: ')).trim();
  if (first.length < 6) {
    console.log(`Nur ${first.length} Zeichen – bitte mindestens 6. / Only ${first.length} characters – use at least 6.`);
    continue;
  }
  const again = (await ask('Wiederholen / Repeat: ')).trim();
  if (first !== again) {
    console.log('Die Eingaben stimmen nicht überein, bitte nochmal. / The codes do not match, try again.');
    continue;
  }
  code = first;
}

const hash = createHash('sha256').update(key + ':' + code).digest('hex');
writeFileSync(FILE, html.replace(/(var ACCESS = \{ key: '[^']+', hash: ')[0-9a-f]*(' \})/, '$1' + hash + '$2'));
console.log('Gespeichert. Nach dem nächsten Build und Deploy gilt der neue Code. / Saved – takes effect after the next build and deploy.');
