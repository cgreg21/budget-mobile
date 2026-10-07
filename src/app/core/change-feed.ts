/** Tells the synchronisation which files changed locally, without the data layer knowing about it. */
type Listener = (file: string) => void;

const listeners = new Set<Listener>();

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyLocalChange(file: string): void {
  for (const listener of listeners) listener(file);
}
