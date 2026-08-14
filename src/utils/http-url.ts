import { VaultError } from "./errors.js";

export function validateHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VaultError(`Invalid URL "${value}". Supply an http:// or https:// URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new VaultError(`Invalid URL "${value}". Supply an http:// or https:// URL.`);
  }
  return url.toString();
}
