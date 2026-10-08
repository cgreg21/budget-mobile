import { KJUR } from 'jsrsasign';

const TOKEN_TTL_SECONDS = 3600;
/** A token is renewed when less than this is left, so a request never carries an expiring one. */
const RENEW_MARGIN_SECONDS = 300;

/** The PEM of a private key as pasted by the user: line breaks and surrounding spaces are tidied. */
export function normalizePrivateKey(text: string): string {
  const match = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (match === null) return '';
  const body = match[2].replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${match[1]}-----\n${lines.join('\n')}\n-----END ${match[1]}-----\n`;
}

/** Signs the JWT Enable Banking expects (RS256, `kid` = application id). */
export function signToken(applicationId: string, privateKey: string, nowMs: number): string {
  const issuedAt = Math.floor(nowMs / 1000);
  const header = { typ: 'JWT', alg: 'RS256', kid: applicationId };
  return KJUR.jws.JWS.sign(
    'RS256',
    header,
    { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS },
    privateKey,
  );
}

/** Signing an RSA key in JavaScript takes a moment: a token is reused until it is about to expire. */
export class TokenSource {
  private token = '';
  private expiresAtMs = 0;
  private readonly applicationId: string;
  private readonly privateKey: string;

  constructor(applicationId: string, privateKey: string) {
    this.applicationId = applicationId;
    this.privateKey = privateKey;
  }

  get(nowMs: number = Date.now()): string {
    if (this.token === '' || nowMs >= this.expiresAtMs - RENEW_MARGIN_SECONDS * 1000) {
      this.token = signToken(this.applicationId, this.privateKey, nowMs);
      this.expiresAtMs = nowMs + TOKEN_TTL_SECONDS * 1000;
    }
    return this.token;
  }
}
