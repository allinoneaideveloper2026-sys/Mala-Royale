// Fails if the staff emails in firestore.rules and the VITE_* settings disagree.
// Usage: VITE_OWNER_EMAILS=a@x.com VITE_DEVELOPER_EMAILS=b@x.com npm run check:config
// With neither variable set (e.g. a fork without secrets) it only checks that the rules file lists emails.
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

function listFromRules(fn) {
  const match = new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return\\s*\\[([^\\]]*)\\]`).exec(rules);
  if (!match) throw new Error(`firestore.rules: could not find function ${fn}()`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1].trim().toLowerCase()).sort();
}
const parse = value => (value || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean).sort();

let failed = false;
for (const [fn, envName] of [['developerEmails', 'VITE_DEVELOPER_EMAILS'], ['ownerEmails', 'VITE_OWNER_EMAILS']]) {
  const inRules = listFromRules(fn);
  if (inRules.length === 0) { console.error(`firestore.rules ${fn}() is empty`); failed = true; continue; }
  const inEnv = parse(process.env[envName]);
  if (inEnv.length === 0) { console.log(`skip ${envName}: not set (rules list: ${inRules.length} email(s))`); continue; }
  if (JSON.stringify(inRules) !== JSON.stringify(inEnv)) {
    console.error(`MISMATCH ${envName}\n  rules: ${inRules.join(', ')}\n  env:   ${inEnv.join(', ')}`);
    failed = true;
  } else {
    console.log(`ok ${envName}`);
  }
}
process.exit(failed ? 1 : 0);
