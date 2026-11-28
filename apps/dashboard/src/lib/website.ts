import { z } from 'zod';
import { keycloak } from './keycloak';

/** Optional external editorial service. HAIP keeps no website content or second media store. */
export function websiteApiUrl(): string | undefined {
  const value = import.meta.env.VITE_WEBSITE_API_URL;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && !(import.meta.env.DEV && url.hostname === 'localhost' && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) return undefined;
    return url.href.replace(/\/$/, '');
  } catch { return undefined; }
}
const content = z.object({
  heading: z.string(), description: z.string(),
  photo: z.object({ propertySlug: z.string(), filename: z.string() }),
  actions: z.array(z.object({ label: z.string(), href: z.string() })).max(2),
});
export const websitePageSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), label: z.string(), revision: z.number().int(),
  draft: content, published: content, updatedAt: z.string().nullable(), publishedAt: z.string().nullable(),
});
export const websitePagesSchema = z.object({ pages: z.array(websitePageSchema) });
export const websiteMediaSchema = z.object({ properties: z.array(z.object({
  slug: z.string(), name: z.string(), photos: z.array(z.object({ filename: z.string(), url: z.string().url(), alt: z.string() })),
})) });
export type WebsitePage = z.infer<typeof websitePageSchema>;
export type WebsiteContent = WebsitePage['draft'];
export type WebsiteMedia = z.infer<typeof websiteMediaSchema>;
export class WebsiteRequestError extends Error { constructor(readonly status: number) { super('Website request failed'); } }
export async function websiteRequest<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> {
  const base = websiteApiUrl();
  if (!base) throw new WebsiteRequestError(503);
  await keycloak.updateToken(30);
  if (!keycloak.token) throw new WebsiteRequestError(401);
  const response = await fetch(`${base}/${path}`, {
    method, headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new WebsiteRequestError(response.status);
  return schema.parse(await response.json());
}
