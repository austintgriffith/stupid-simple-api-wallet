import { useState, useEffect } from "react";
import {
  isPotentialENSName,
  resolveENS,
  reverseResolveENS,
} from "../utils/ens";

interface UseENSResolutionResult {
  resolvedAddress: string | null;
  ensName: string | null;
  isResolving: boolean;
  error: boolean;
}

/**
 * Hook for resolving ENS names to addresses and vice versa.
 * - If input is a potential ENS name (e.g., "vitalik.eth"), it resolves to an address.
 * - If input is a valid Ethereum address, it reverse-resolves to an ENS name.
 * Both lookups are debounced by 500ms.
 */
export function useENSResolution(input: string): UseENSResolutionResult {
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  // Forward resolution (ENS name -> address)
  useEffect(() => {
    const trimmed = input?.trim() || "";

    // Reset if not a potential ENS name
    if (!isPotentialENSName(trimmed)) {
      setResolvedAddress(null);
      setError(false);
      setIsResolving(false);
      return;
    }

    setIsResolving(true);
    setError(false);

    const timeout = setTimeout(async () => {
      const resolved = await resolveENS(trimmed);
      setResolvedAddress(resolved);
      setError(!resolved);
      setIsResolving(false);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [input]);

  // Reverse resolution (address -> ENS name)
  useEffect(() => {
    const trimmed = input?.trim() || "";

    // Check if it's a valid Ethereum address
    const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmed);

    if (!isValidAddress) {
      setEnsName(null);
      return;
    }

    const timeout = setTimeout(async () => {
      const name = await reverseResolveENS(trimmed);
      setEnsName(name);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [input]);

  return {
    resolvedAddress,
    ensName,
    isResolving,
    error,
  };
}

/**
 * Hook for reverse ENS resolution only (address -> name).
 * Useful for looking up the ENS name of a known address.
 */
export function useReverseENS(address: string | undefined): string | null {
  const [ensName, setEnsName] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setEnsName(null);
      return;
    }

    reverseResolveENS(address).then(setEnsName);
  }, [address]);

  return ensName;
}
