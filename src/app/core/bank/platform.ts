import { Http } from '@nativescript/core';
import type { BankHttp, JwtSigner } from 'budget-lib';
import { KJUR } from 'jsrsasign';

/** The HTTP transport of the bank client: NativeScript's, which resolves for any status. */
export const nativeBankHttp: BankHttp = async ({ method, url, headers, body, timeoutMs }) => {
  const response = await Http.request({
    url, method, headers, timeout: timeoutMs, ...(body === undefined ? {} : { content: body }),
  });
  return { status: response.statusCode, body: response.content ? response.content.toString() : '' };
};

/** RS256 in plain JavaScript: the phone has no WebCrypto to sign with an imported key. */
export const rsaSigner: JwtSigner = (header, payload, privateKey) =>
  KJUR.jws.JWS.sign('RS256', header as { alg: string }, payload, privateKey);
