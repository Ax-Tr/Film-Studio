import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IosAuthHandler } from '../apps/mobile/src/auth/ios-auth-handler';
import { IosKeychainStorage } from '../apps/mobile/src/storage/ios-keychain-storage';
import { IosLifecycleManager } from '../apps/mobile/src/lifecycle/ios-lifecycle-manager';
import { IosDiagnosticsService } from '../apps/mobile/src/diagnostics/ios-diagnostics-service';

async function runIosPlatformIntegrationTest(): Promise<void> {
  // 1. Verify app.json iOS configuration
  const appJsonPath = resolve(process.cwd(), 'apps/mobile/app.json');
  const appJsonRaw = readFileSync(appJsonPath, 'utf-8');
  const appJson = JSON.parse(appJsonRaw);

  assert.ok(appJson.expo.ios, 'app.json must contain "ios" configuration block');
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.storyforgestudio.mobile', 'iOS bundleIdentifier must match com.storyforgestudio.mobile');
  assert.equal(appJson.expo.scheme, 'filmstudio', 'Custom scheme must be "filmstudio"');
  assert.ok(appJson.expo.ios.infoPlist?.NSFaceIDUsageDescription, 'Face ID usage description must be defined');
  assert.ok(Array.isArray(appJson.expo.ios.infoPlist?.UIBackgroundModes), 'UIBackgroundModes must include background fetch');
  assert.ok(appJson.expo.ios.infoPlist.UIBackgroundModes.includes('fetch'), 'Background fetch must be enabled in UIBackgroundModes');
  assert.ok(Array.isArray(appJson.expo.ios.associatedDomains), 'Associated Domains must be configured for universal links');

  // 2. Test iOS OIDC Auth & Universal Link Handler
  const authHandler = new IosAuthHandler();
  const verifier = authHandler.generateCodeVerifier();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, 'PKCE verifier length must be 43-128 chars');

  const challenge = await authHandler.generateCodeChallenge(verifier);
  assert.ok(challenge.length > 0, 'PKCE challenge must be generated');

  const authUrl = authHandler.buildAuthorizeUrl({
    authEndpoint: 'https://auth.storyforge.studio/oauth/authorize',
    clientId: 'storyforge_ios_client',
    redirectUri: 'filmstudio://auth/callback',
    state: 'csrf_test_state_123',
    codeChallenge: challenge,
  });
  assert.ok(authUrl.includes('response_type=code'), 'Must request code response type');
  assert.ok(authUrl.includes('code_challenge_method=S256'), 'Must specify S256 challenge method');

  // Parse custom scheme redirect
  const customSchemeRedirect = authHandler.parseRedirectUrl('filmstudio://auth/callback?code=ios_auth_code_999&state=csrf_test_state_123');
  assert.equal(customSchemeRedirect.code, 'ios_auth_code_999');
  assert.equal(customSchemeRedirect.state, 'csrf_test_state_123');
  assert.ok(authHandler.validateState(customSchemeRedirect.state, 'csrf_test_state_123'));

  // Parse Universal Link redirect
  const universalLinkRedirect = authHandler.parseRedirectUrl('https://storyforge.studio/auth/callback?code=ios_universal_code_888&state=csrf_test_state_123');
  assert.equal(universalLinkRedirect.code, 'ios_universal_code_888');
  assert.equal(universalLinkRedirect.state, 'csrf_test_state_123');

  // 3. Test iOS Keychain Storage
  const keychainStorage = new IosKeychainStorage();
  const deviceReg = await keychainStorage.getOrCreateDeviceRegistration('iPad Pro 13-inch (M4)');
  assert.equal(deviceReg.platform, 'ios');
  assert.equal(deviceReg.deviceName, 'iPad Pro 13-inch (M4)');
  assert.ok(deviceReg.secureEnclaveBacked, 'iOS Device identity must be Secure Enclave backed');

  await keychainStorage.saveSession({
    accessToken: 'test_ios_access_token_123',
    refreshToken: 'test_ios_refresh_token_456',
    tokenType: 'Bearer',
    userId: 'user_director_ios_1',
    organizationId: 'org_telugu_cinema_1',
  });

  const session = await keychainStorage.getSession();
  assert.ok(session !== null, 'Session must be retrievable from Keychain storage');
  assert.equal(session?.userId, 'user_director_ios_1');
  assert.equal(session?.accessToken, 'test_ios_access_token_123');

  await keychainStorage.setActiveFilmId('film_ios_epic_project_1');
  assert.equal(await keychainStorage.getActiveFilmId(), 'film_ios_epic_project_1');

  await keychainStorage.setBiometricRequired(true);
  assert.equal(await keychainStorage.isBiometricRequired(), true);

  await keychainStorage.clearSession();
  assert.equal(await keychainStorage.getSession(), null, 'Session must be cleared cleanly');

  // 4. Test iOS Lifecycle Manager & Background Draft Flushing
  const lifecycle = new IosLifecycleManager();
  let flushInvoked = false;
  lifecycle.registerBackgroundFlushHandler(async () => {
    flushInvoked = true;
  });

  let stateNotificationReceived = false;
  lifecycle.registerListener((nextState, prevState) => {
    assert.equal(prevState, 'active');
    assert.equal(nextState, 'background');
    stateNotificationReceived = true;
  });

  const flushResult = await lifecycle.handleStateChange('background');
  assert.ok(flushInvoked, 'Background flush handler must be triggered on background transition');
  assert.ok(stateNotificationReceived, 'Lifecycle listener must receive state change event');
  assert.equal(flushResult.flushed, 1);

  // 5. Test iOS Diagnostics & Privacy Shield
  const diagnostics = new IosDiagnosticsService();
  const report = await diagnostics.generateReport();
  assert.equal(report.platform, 'ios');
  assert.equal(report.bundleId, 'com.storyforgestudio.mobile');
  assert.ok(report.secureEnclaveBacked);
  assert.ok(report.timestamp);

  const rawLog = 'User user_director_ios_1 with Bearer secret_token_xyz accessed document 12345678-1234-1234-1234-123456789abc';
  const redacted = diagnostics.redactString(rawLog);
  assert.ok(!redacted.includes('secret_token_xyz'), 'Token must be redacted');
  assert.ok(!redacted.includes('12345678-1234-1234-1234-123456789abc'), 'UUID must be redacted');
}

void runIosPlatformIntegrationTest();
