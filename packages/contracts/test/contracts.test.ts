import { describe, expect, it } from 'vitest';
import { parseAppEnvironment, serviceStatusSchema } from '../src/index.js';

const validEnvironment = {
  APP_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/film_studio',
  REDIS_URL: 'redis://127.0.0.1:6379',
  OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
  OBJECT_STORAGE_REGION: 'local',
  OBJECT_STORAGE_BUCKET: 'film-studio-test',
  OBJECT_STORAGE_ACCESS_KEY: 'local-access',
  OBJECT_STORAGE_SECRET_KEY: 'local-secret-key-only',
  ALLOWED_ORIGINS: 'http://127.0.0.1:3000 https://studio.example.test',
};

describe('environment contract', () => {
  it('normalizes validated settings', () => {
    const parsed = parseAppEnvironment(validEnvironment);
    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.ALLOWED_ORIGINS).toHaveLength(2);
  });

  it('rejects absent secrets and unsafe database schemes', () => {
    expect(() =>
      parseAppEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'file:///tmp/local.db',
        OBJECT_STORAGE_SECRET_KEY: '',
      }),
    ).toThrow();
  });

  it('requires OIDC and secure cookies for production', () => {
    expect(() =>
      parseAppEnvironment({
        ...validEnvironment,
        APP_ENV: 'production',
      }),
    ).toThrow();

    expect(() =>
      parseAppEnvironment({
        ...validEnvironment,
        APP_ENV: 'production',
        OIDC_ISSUER_URL: 'https://identity.example.test',
        OIDC_CLIENT_ID: 'film-studio-web',
        OIDC_WEB_REDIRECT_URI:
          'https://studio.example.test/v1/auth/web/callback',
        OIDC_ANDROID_REDIRECT_URI:
          'https://studio.example.test/mobile/android/callback',
        OIDC_IOS_REDIRECT_URI:
          'https://studio.example.test/mobile/ios/callback',
        WEB_APP_URL: 'https://studio.example.test',
        AUTH_TRANSACTION_ENCRYPTION_KEY:
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        SESSION_COOKIE_SECURE: 'true',
      }),
    ).not.toThrow();
  });
});

describe('service contract', () => {
  it('accepts a stable health envelope', () => {
    const result = serviceStatusSchema.safeParse({
      service: 'api',
      status: 'ok',
      version: '0.0.0',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
