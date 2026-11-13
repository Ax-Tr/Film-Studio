import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';

const yamlFiles = [
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  'infra/docker/compose.yaml',
  'pnpm-workspace.yaml',
];

for (const file of yamlFiles) {
  const source = await readFile(file, 'utf8');
  const document = parseDocument(source, { prettyErrors: true });
  if (document.errors.length > 0) {
    for (const error of document.errors) {
      process.stderr.write(`${file}: ${error.message}\n`);
    }
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  process.stdout.write(`Validated ${yamlFiles.length} YAML configuration files.\n`);
}
