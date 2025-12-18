import { SLOPWALLET_API } from "../config";

// Common TLDs that might be used with ENS (DNSSEC-enabled domains)
// This avoids triggering on partial input like ".et" while typing ".eth"
export const VALID_ENS_TLDS = new Set([
  // Native ENS
  "eth",
  // Common generic TLDs
  "com",
  "org",
  "net",
  "io",
  "co",
  "xyz",
  "app",
  "dev",
  "ai",
  "id",
  "me",
  "tv",
  "cc",
  "gg",
  "fm",
  "im",
  "to",
  // Country codes that are commonly used
  "uk",
  "de",
  "nl",
  "fr",
  "es",
  "it",
  "jp",
  "kr",
  "au",
  "ca",
  "ch",
  "se",
  "no",
  "fi",
  "pl",
  "cz",
  "at",
  "be",
  "nz",
  // Newer/popular TLDs
  "club",
  "online",
  "site",
  "tech",
  "store",
  "blog",
  "info",
  "biz",
  "pro",
  "name",
  "link",
  "click",
  "space",
  "world",
  "life",
  "live",
  "news",
  "art",
  "box",
  "kred",
  "luxe",
]);

/**
 * Check if input looks like a potential ENS name.
 * Supports: .eth names, DNS domains with common TLDs, and subdomains.
 */
export function isPotentialENSName(input: string): boolean {
  if (!input || input.length < 3) return false;

  const trimmed = input.trim().toLowerCase();

  // Skip Ethereum addresses
  if (trimmed.startsWith("0x") && trimmed.length === 42) return false;

  // Must have at least one dot
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot === -1) return false;

  // Extract the TLD and check against our list
  const tld = trimmed.slice(lastDot + 1);
  return VALID_ENS_TLDS.has(tld);
}

/**
 * Resolve an ENS name to an Ethereum address using the SlopWallet API.
 */
export const resolveENS = async (name: string): Promise<string | null> => {
  try {
    const response = await fetch(
      `${SLOPWALLET_API}/ens?query=${encodeURIComponent(name)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.address || null;
  } catch {
    return null;
  }
};

/**
 * Reverse resolve an Ethereum address to an ENS name using the SlopWallet API.
 */
export const reverseResolveENS = async (
  address: string
): Promise<string | null> => {
  try {
    const response = await fetch(
      `${SLOPWALLET_API}/ens?query=${encodeURIComponent(address)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.ensName || null;
  } catch {
    return null;
  }
};
