export interface AuthorizationRequest {
  readonly authorizationEndpoint: URL;
  readonly clientId: string;
  readonly redirectUri: URL;
  readonly codeChallenge: string;
  readonly state: string;
  readonly nonce: string;
  readonly scopes: readonly string[];
}

export function buildAuthorizationUrl(request: AuthorizationRequest): URL {
  const url = new URL(request.authorizationEndpoint);
  url.searchParams.set('client_id', request.clientId);
  url.searchParams.set('redirect_uri', request.redirectUri.toString());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', request.codeChallenge);
  url.searchParams.set('state', request.state);
  url.searchParams.set('nonce', request.nonce);
  url.searchParams.set('scope', request.scopes.join(' '));
  return url;
}
