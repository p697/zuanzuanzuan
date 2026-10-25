// Resolve from the installed module directory, including GitHub project-site prefixes.
export const SITE_ROOT = new URL("../", import.meta.url);
export function assetURL(path, root = SITE_ROOT) {
  return new URL(path.replace(/^\/(?!\/)/, ""), root).href;
}
export function resolveAssetPaths(value, root = SITE_ROOT) {
  if (typeof value === "string")
    return value.startsWith("/") && !value.startsWith("//")
      ? assetURL(value, root)
      : value;
  if (Array.isArray(value))
    return value.map((item) => resolveAssetPaths(item, root));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveAssetPaths(item, root),
      ]),
    );
  return value;
}
