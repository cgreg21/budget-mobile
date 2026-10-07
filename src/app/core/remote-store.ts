/*
 * core/remote-store.ts — what the synchronisation needs from a place where the
 * budget files are kept: a WebDAV server (kDrive…) or iCloud Drive. Paths are
 * relative to the remote directory (`categories.json`, `months/YYYY-MM.json`).
 */

/** The store could not be reached (no network, timeout…): the work is kept for later. */
export class RemoteUnreachableError extends Error {}

/** The store answered but refused: wrong address, credentials, rights, or not available here. */
export class RemoteRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface RemoteEntry {
  name: string;
  isDirectory: boolean;
  /** Changes whenever the file does; absent when the store cannot tell. */
  etag?: string;
}

export interface RemoteFile {
  content: string;
  etag?: string;
}

export interface RemoteStore {
  /** Checks the store is usable (reachable, credentials accepted…). */
  probe(): Promise<void>;
  /** The entries of a directory, or `null` when it does not exist. */
  list(directory: string): Promise<RemoteEntry[] | null>;
  read(path: string): Promise<RemoteFile | null>;
  /** Creates or replaces a file, creating its directory first; returns the new ETag when known. */
  write(path: string, content: string): Promise<string | undefined>;
  remove(path: string): Promise<void>;
  ensureDirectory(directory: string): Promise<void>;
}
