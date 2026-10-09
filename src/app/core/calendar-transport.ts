import { Http } from '@nativescript/core';
import type { HttpTransport } from 'budget-lib';

export class CalendarNetworkError extends Error {}

/** HTTP errors remain responses; only transport failures reject. */
export const nativeCalendarHttp: HttpTransport = async ({ method, url, headers, body }) => {
  const response = await Http.request({ method, url, headers, ...(body === undefined ? {} : { content: body }), timeout: 20000 })
    .catch((error: unknown) => {
      throw new CalendarNetworkError(error instanceof Error ? error.message : String(error));
    });
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    normalized[name.toLowerCase()] = String(value);
  }
  return { status: response.statusCode, headers: normalized, body: response.content ? response.content.toString() : '' };
};
