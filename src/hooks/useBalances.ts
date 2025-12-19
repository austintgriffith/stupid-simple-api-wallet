import { useState, useEffect, useCallback } from "react";
import { SLOPWALLET_API } from "../config";
import { BalanceResponse } from "../types";

interface UseBalancesOptions {
  walletAddress: string | undefined;
  enabled?: boolean;
  refreshInterval?: number;
}

export function useBalances({
  walletAddress,
  enabled = true,
  refreshInterval = 3000,
}: UseBalancesOptions) {
  const [balances, setBalances] = useState<BalanceResponse["balances"] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `${SLOPWALLET_API}/balances?address=${walletAddress}`
      );
      const data: BalanceResponse = await response.json();
      setBalances(data.balances);
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // Fetch balances when enabled and auto-refresh
  useEffect(() => {
    if (enabled && walletAddress) {
      fetchBalances();
      const interval = setInterval(fetchBalances, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [enabled, walletAddress, fetchBalances, refreshInterval]);

  return {
    balances,
    isLoading,
    refresh: fetchBalances,
  };
}
