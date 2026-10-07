/*
 * core/icloud.ts — the budget files kept in the app's iCloud Drive container
 * (iOS only). The container is a plain local folder that iOS mirrors to the
 * other devices, so reading and writing use ordinary files.
 *
 * Files that other devices created are first seen as placeholders
 * (`.name.json.icloud`); they are reported without ETag, so the synchronisation
 * fetches them, which triggers their download.
 */
import { File, Folder, isIOS, path as fsPath } from '@nativescript/core';

import { RemoteRequestError, RemoteUnreachableError, type RemoteEntry, type RemoteFile, type RemoteStore } from './remote-store';

const DOWNLOAD_TIMEOUT_MS = 15000;
const DOWNLOAD_POLL_MS = 300;
const PLACEHOLDER_SUFFIX = '.icloud';

export const isICloudSupported = (): boolean => isIOS;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ICloudStore implements RemoteStore {
  private root: string | undefined;

  constructor(private readonly remoteDir: string) {}

  async probe(): Promise<void> {
    this.rootPath();
    await this.ensureDirectory('');
  }

  async list(directory: string): Promise<RemoteEntry[] | null> {
    const full = this.resolve(directory);
    if (!Folder.exists(full)) return null;

    const entries: RemoteEntry[] = [];
    for (const entity of Folder.fromPath(full).getEntitiesSync()) {
      const name = entity.name;
      if (entity instanceof Folder) {
        if (!name.startsWith('.')) entries.push({ name, isDirectory: true });
      } else if (name.startsWith('.') && name.endsWith(PLACEHOLDER_SUFFIX)) {
        this.startDownload(entity.path);
        entries.push({ name: name.slice(1, -PLACEHOLDER_SUFFIX.length), isDirectory: false });
      } else if (!name.startsWith('.')) {
        entries.push({ name, isDirectory: false, etag: this.etagOf(entity.path) });
      }
    }
    return entries;
  }

  async read(remotePath: string): Promise<RemoteFile | null> {
    const full = this.resolve(remotePath);
    if (!File.exists(full)) {
      const placeholder = this.placeholderOf(full);
      if (!File.exists(placeholder)) return null;
      await this.download(placeholder, full);
    }
    return { content: File.fromPath(full).readTextSync(), etag: this.etagOf(full) };
  }

  async write(remotePath: string, content: string): Promise<string | undefined> {
    const full = this.resolve(remotePath);
    Folder.fromPath(full.slice(0, full.lastIndexOf('/')));
    File.fromPath(full).writeTextSync(content);
    return this.etagOf(full);
  }

  async remove(remotePath: string): Promise<void> {
    const full = this.resolve(remotePath);
    if (File.exists(full)) File.fromPath(full).removeSync();
  }

  async ensureDirectory(directory: string): Promise<void> {
    Folder.fromPath(this.resolve(directory));
  }

  /** Where the files live: `<container>/Documents/<remoteDir>`; the container is unavailable without iCloud. */
  private rootPath(): string {
    if (this.root !== undefined) return this.root;
    if (!isIOS) throw new RemoteRequestError('iCloud n’est disponible que sur iOS.', 0);

    const container = NSFileManager.defaultManager.URLForUbiquityContainerIdentifier(null);
    if (!container || !container.path) {
      throw new RemoteRequestError(
        'iCloud Drive est indisponible : connectez-vous à iCloud, activez iCloud Drive pour l’application et vérifiez l’entitlement iCloud.',
        0,
      );
    }
    this.root = fsPath.join(container.path, 'Documents', this.remoteDir);
    return this.root;
  }

  private resolve(relative: string): string {
    const parts = relative.split('/').filter((segment) => segment !== '' && segment !== '.' && segment !== '..');
    return fsPath.join(this.rootPath(), ...parts);
  }

  private placeholderOf(full: string): string {
    const index = full.lastIndexOf('/');
    return `${full.slice(0, index + 1)}.${full.slice(index + 1)}${PLACEHOLDER_SUFFIX}`;
  }

  private etagOf(full: string): string | undefined {
    try {
      const file = File.fromPath(full);
      return `${file.lastModified.getTime()}-${file.size}`;
    } catch {
      return undefined;
    }
  }

  private startDownload(placeholder: string): void {
    try {
      NSFileManager.defaultManager.startDownloadingUbiquitousItemAtURLError(NSURL.fileURLWithPath(placeholder));
    } catch (error) {
      console.warn('The iCloud download could not be started:', error);
    }
  }

  private async download(placeholder: string, full: string): Promise<void> {
    this.startDownload(placeholder);
    const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
    while (!File.exists(full)) {
      if (Date.now() > deadline) throw new RemoteUnreachableError('Téléchargement iCloud en cours, nouvel essai plus tard.');
      await sleep(DOWNLOAD_POLL_MS);
    }
  }
}
