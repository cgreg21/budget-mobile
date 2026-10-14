/* Stand-in for `@nativescript-community/ui-document-picker`: the specs script what the user picks or saves. */
import { vi } from 'vitest';

export const openFilePicker = vi.fn<(params?: object) => Promise<{ files: string[] }>>();
export const saveFile = vi.fn<(params: { name: string; data: string; mimeType?: string }) => Promise<boolean>>();

export function resetDocumentPicker(): void {
  openFilePicker.mockReset();
  openFilePicker.mockResolvedValue({ files: [] });
  saveFile.mockReset();
  saveFile.mockResolvedValue(false);
}
