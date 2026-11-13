import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const protectedPackages = [
  'contracts',
  'domain',
  'screenplay-model',
  'sync-core',
];
const forbiddenImports = [
  '@nestjs/',
  'next/',
  'react',
  'react-native',
  'pg',
  'postgres',
  'typeorm',
  'prisma',
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

const violations = [];
for (const packageName of protectedPackages) {
  const packageRoot = join(workspaceRoot, 'packages', packageName, 'src');
  for (const file of await sourceFiles(packageRoot)) {
    const contents = await readFile(file, 'utf8');
    for (const forbiddenImport of forbiddenImports) {
      const importPattern = new RegExp(
        `(?:from\\s+|import\\s*\\()(['"])(?:${forbiddenImport.replace('/', '\\/')})`,
        'u',
      );
      if (importPattern.test(contents)) {
        violations.push(
          `${relative(workspaceRoot, file)} imports ${forbiddenImport}`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`Package boundary violations:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Framework-neutral package boundaries verified.\n');
}
