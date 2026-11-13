import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const patterns = [
  ['private key', /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/u],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/u],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u],
];
const binaryExtensions = new Set([
  '.aab',
  '.apk',
  '.db',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.keystore',
  '.p12',
  '.pdf',
  '.png',
  '.webp',
  '.zip',
]);

const output = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
);
const candidates = output.split('\0').filter(Boolean);
const findings = [];

for (const candidate of candidates) {
  if (binaryExtensions.has(extname(candidate).toLowerCase())) continue;
  const path = resolve(candidate);
  const metadata = await stat(path);
  if (metadata.size > 2_000_000) continue;
  const contents = await readFile(path, 'utf8');
  for (const [label, pattern] of patterns) {
    if (pattern.test(contents)) findings.push(`${candidate}: ${label}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Potential committed secrets found:\n${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `High-confidence secret patterns absent from ${candidates.length} repository files.\n`,
  );
}
