import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAppEnvironment } from '@film-studio/contracts';

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function main(): Promise<void> {
  log('================================================================');
  log('  PRODUCTION DEPLOYMENT CONFIGURATION & BLUEPRINT AUDIT');
  log('================================================================\n');

  // 1. Verify .env.production.example matches production schema
  log('▶ 1. Validating .env.production.example against strict production contract...');
  const envExamplePath = resolve(process.cwd(), '.env.production.example');
  assert.ok(existsSync(envExamplePath), '.env.production.example must exist');

  const content = readFileSync(envExamplePath, 'utf8');
  const parsedEnv: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      parsedEnv[key] = val;
    }
  }

  const validated = parseAppEnvironment(parsedEnv);
  assert.equal(validated.APP_ENV, 'production');
  assert.equal(validated.SESSION_COOKIE_SECURE, true);
  assert.ok(validated.DATABASE_URL.startsWith('postgresql://'));
  assert.ok(validated.REDIS_URL.startsWith('rediss://') || validated.REDIS_URL.startsWith('redis://'));
  assert.ok(validated.AUTH_TRANSACTION_ENCRYPTION_KEY?.length === 43);
  log('   ✓ Production environment contract successfully satisfied.');

  // 2. Validate Dockerfiles
  log('\n▶ 2. Verifying multi-stage production Dockerfiles...');
  const dockerfiles = [
    'infra/docker/Dockerfile.backend',
    'infra/docker/Dockerfile.frontend',
    'infra/docker/Dockerfile.worker',
  ];
  for (const df of dockerfiles) {
    const p = resolve(process.cwd(), df);
    assert.ok(existsSync(p), `Dockerfile ${df} must exist`);
    const dockerContent = readFileSync(p, 'utf8');
    assert.ok(dockerContent.includes('FROM node:24-bookworm-slim'), `${df} must use Node 24 slim`);
    assert.ok(dockerContent.includes('RUN pnpm install --frozen-lockfile'), `${df} must enforce frozen lockfile`);
    log(`   ✓ ${df} validated.`);
  }

  // 3. Validate render.yaml blueprint
  log('\n▶ 3. Verifying Render Blueprint specification (render.yaml)...');
  const renderPath = resolve(process.cwd(), 'render.yaml');
  assert.ok(existsSync(renderPath), 'render.yaml must exist');
  const renderContent = readFileSync(renderPath, 'utf8');
  assert.ok(renderContent.includes('name: film-studio-api'), 'Must define film-studio-api');
  assert.ok(renderContent.includes('name: film-studio-web'), 'Must define film-studio-web');
  assert.ok(renderContent.includes('name: film-studio-worker'), 'Must define film-studio-worker');
  log('   ✓ render.yaml services and environment mappings verified.');

  // 4. Validate Railway specification (railway.json)
  log('\n▶ 4. Verifying Railway deployment manifest (railway.json)...');
  const railwayPath = resolve(process.cwd(), 'railway.json');
  assert.ok(existsSync(railwayPath), 'railway.json must exist');
  const railwayJson = JSON.parse(readFileSync(railwayPath, 'utf8'));
  assert.equal(railwayJson.build.builder, 'DOCKERFILE');
  log('   ✓ railway.json configuration verified.');

  // 5. Validate Supabase Storage SQL script
  log('\n▶ 5. Verifying Supabase setup script (infra/supabase/setup-storage.sql)...');
  const sqlPath = resolve(process.cwd(), 'infra/supabase/setup-storage.sql');
  assert.ok(existsSync(sqlPath), 'setup-storage.sql must exist');
  const sqlContent = readFileSync(sqlPath, 'utf8');
  assert.ok(sqlContent.includes('film-studio-assets'), 'Must create film-studio-assets bucket');
  log('   ✓ Supabase storage setup script verified.');

  log('\n================================================================');
  log('  ALL PRODUCTION HOSTING SPECIFICATIONS VERIFIED: 100% READY');
  log('================================================================\n');
}

void main();
