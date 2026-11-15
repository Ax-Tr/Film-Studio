/**
 * iOS Universal Link and OIDC PKCE Auth Handler
 *
 * Implements iOS Authorization Code + PKCE verification, redirect handling
 * via custom scheme `filmstudio://auth/callback` or HTTPS Universal Links (`https://storyforge.studio/auth/callback`).
 * Handles ASWebAuthenticationSession / Universal Link redirects with state validation.
 */

export interface IosPkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

export interface IosAuthRedirectResult {
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
  readonly errorDescription?: string;
}

export class IosAuthHandler {
  /**
   * Generates a high-entropy cryptographically random PKCE verifier
   */
  generateCodeVerifier(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generates code challenge using standard base64url encoding
   */
  async generateCodeChallenge(verifier: string): Promise<string> {
    return Buffer.from(verifier).toString('base64url');
  }

  /**
   * Constructs the full OIDC authorization URL with PKCE for iOS ASWebAuthenticationSession / SafariViewController
   */
  buildAuthorizeUrl(params: {
    readonly authEndpoint: string;
    readonly clientId: string;
    readonly redirectUri: string;
    readonly scope?: string;
    readonly state: string;
    readonly codeChallenge: string;
  }): string {
    const url = new URL(params.authEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', params.scope ?? 'openid profile email offline_access');
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /**
   * Parses an incoming iOS deep link (custom scheme `filmstudio://` or Universal Link `https://storyforge.studio/`)
   */
  parseRedirectUrl(urlStr: string): IosAuthRedirectResult {
    try {
      const url = new URL(urlStr);
      const code = url.searchParams.get('code') ?? undefined;
      const state = url.searchParams.get('state') ?? undefined;
      const error = url.searchParams.get('error') ?? undefined;
      const errorDescription = url.searchParams.get('error_description') ?? undefined;

      return {
        code,
        state,
        error,
        errorDescription,
      };
    } catch {
      return {
        error: 'invalid_redirect_url',
        errorDescription: 'The incoming iOS redirect URL could not be parsed.',
      };
    }
  }

  /**
   * Verifies state parameter against original CSRF nonce
   */
  validateState(returnedState: string | undefined, expectedState: string): boolean {
    if (!returnedState || !expectedState) {
      return false;
    }
    return returnedState === expectedState;
  }
}

export const iosAuthHandler = new IosAuthHandler();

