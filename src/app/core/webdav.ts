import { Http } from '@nativescript/core';

import { normalizeBaseUrl, remoteUrl, type RemoteConfig } from '../domain/remote';
import {
  RemoteRequestError, RemoteUnreachableError, type RemoteEntry, type RemoteFile, type RemoteStore,
} from './remote-store';

export { RemoteRequestError, RemoteUnreachableError };

interface DavResponse {
  status: number;
  text: string;
  etag?: string;
}

const TIMEOUT_MS = 15000;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?>'
  + '<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>';

/** Base64 of the UTF-8 bytes of `text` (for the Basic authorization header). */
export function toBase64(text: string): string {
  const bytes = [...unescape(encodeURIComponent(text))].map((char) => char.charCodeAt(0));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : BASE64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : BASE64[c & 63];
  }
  return out;
}

const decode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const unescapeXml = (text: string): string =>
  text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Reads a PROPFIND multistatus; tolerant of the namespace prefix each server picks. */
export function parseListing(xml: string, directory: string): RemoteEntry[] {
  const self = directory.split('/').filter((segment) => segment !== '').join('/');
  const entries: RemoteEntry[] = [];

  for (const block of xml.matchAll(/<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)) {
    const body = block[1];
    const href = /<(?:[\w-]+:)?href\b[^>]*>([^<]*)</i.exec(body)?.[1];
    if (href === undefined) continue;

    const path = decode(href.trim()).replace(/^[a-z]+:\/\/[^/]*/i, '').split('/').filter((s) => s !== '').join('/');
    if (path === self || path.endsWith(`/${self}`)) continue;

    const name = path.slice(path.lastIndexOf('/') + 1);
    if (name === '') continue;
    const etag = /<(?:[\w-]+:)?getetag\b[^>]*>([^<]*)</i.exec(body)?.[1];
    entries.push({
      name,
      isDirectory: /<(?:[\w-]+:)?collection\b/i.test(body),
      ...(etag === undefined ? {} : { etag: unescapeXml(etag.trim()) }),
    });
  }
  return entries;
}

/** A minimal WebDAV client: just what the budget files need. */
export class WebDavClient implements RemoteStore {
  private readonly authorization: string;
  private readonly ensured = new Set<string>();

  constructor(private readonly config: RemoteConfig, password: string) {
    this.authorization = `Basic ${toBase64(`${config.username}:${password}`)}`;
  }

  /** Checks the server answers and accepts the credentials. */
  async probe(): Promise<void> {
    const { status } = await this.request('PROPFIND', '', { Depth: '0' }, PROPFIND_BODY);
    if (status === 404) throw new RemoteRequestError('Adresse du serveur introuvable', status);
    this.assertOk(status, [200, 207]);
  }

  /** The entries of a directory, or `null` when it does not exist. */
  async list(directory: string): Promise<RemoteEntry[] | null> {
    const full = this.full(directory);
    const { status, text } = await this.request('PROPFIND', full, { Depth: '1' }, PROPFIND_BODY);
    if (status === 404) return null;
    this.assertOk(status, [200, 207]);
    return parseListing(text, full);
  }

  async read(path: string): Promise<RemoteFile | null> {
    const { status, text, etag } = await this.request('GET', this.full(path));
    if (status === 404) return null;
    this.assertOk(status, [200]);
    return { content: text, ...(etag === undefined ? {} : { etag }) };
  }

  /** Creates or replaces a file, creating its directory first; returns the new ETag when the server tells it. */
  async write(path: string, content: string): Promise<string | undefined> {
    await this.ensureDirectory(path.split('/').slice(0, -1).join('/'));
    const { status, etag } = await this.request('PUT', this.full(path), { 'Content-Type': 'application/json; charset=utf-8' }, content);
    this.assertOk(status, [200, 201, 204]);
    return etag;
  }

  async remove(path: string): Promise<void> {
    const { status } = await this.request('DELETE', this.full(path));
    if (status !== 404) this.assertOk(status, [200, 202, 204]);
  }

  /** Creates every missing segment of a directory path (and of the remote directory), parents first. */
  async ensureDirectory(directory: string): Promise<void> {
    const segments = this.full(directory).split('/');
    for (let depth = 1; depth <= segments.length; depth++) {
      const path = segments.slice(0, depth).join('/');
      if (this.ensured.has(path)) continue;
      const { status } = await this.request('MKCOL', path);
      // 405: it already exists.
      this.assertOk(status, [200, 201, 301, 405]);
      this.ensured.add(path);
    }
  }

  private assertOk(status: number, accepted: readonly number[]): void {
    if (accepted.includes(status)) return;
    if (status === 401 || status === 403) throw new RemoteRequestError('Identifiants refusés par le serveur', status);
    if (status >= 500 || status === 408 || status === 429) throw new RemoteUnreachableError(`Serveur indisponible (${status})`);
    throw new RemoteRequestError(`Réponse inattendue du serveur (${status})`, status);
  }

  private async request(method: string, path: string, headers: Record<string, string> = {}, content?: string): Promise<DavResponse> {
    const url = path === '' ? normalizeBaseUrl(this.config.baseUrl) : remoteUrl(this.config.baseUrl, path);
    try {
      const response = await Http.request({
        url,
        method,
        headers: { Authorization: this.authorization, ...headers },
        timeout: TIMEOUT_MS,
        ...(content === undefined ? {} : { content }),
      });
      const text = response.content ? response.content.toString() : '';
      return { status: response.statusCode, text, etag: readHeader(response.headers, 'etag') };
    } catch (error) {
      throw new RemoteUnreachableError(error instanceof Error ? error.message : String(error));
    }
  }

  // Paths handed to the client are relative to the remote directory.
  private full(path: string): string {
    return path === '' ? this.config.remoteDir : `${this.config.remoteDir}/${path}`;
  }
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (typeof headers !== 'object' || headers === null) return undefined;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== name) continue;
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}
