import { SERVICES } from "./config";

/** Searchable tags: service tags + customer's own tags + meaningful words from the title. */
export function buildKeywords(serviceId: string, userTags: string[], title: string): string[] {
  const service = SERVICES.find((s) => s.id === serviceId);
  const fromTitle = (title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).slice(0, 5);
  return Array.from(new Set([...(service?.keywords ?? []), ...userTags, ...fromTitle])).slice(0, 20);
}
