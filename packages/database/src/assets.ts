const DEFAULT_ASSET_BASE = "https://goberlab-cdn.astra-consulting.tech";

export function publicAssetUrl(r2Key: string | null | undefined): string | null {
  if (!r2Key) return null;
  const base = (process.env.R2_PUBLIC_BASE_URL?.trim() || DEFAULT_ASSET_BASE).replace(/\/$/, "");
  return `${base}/${r2Key.replace(/^\//, "")}`;
}

export function mediaUrl(r2Key: string | null | undefined): string | null {
  if (!r2Key) return null;
  return `/media/${r2Key.replace(/^\//, "")}`;
}
