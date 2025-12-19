import React from "react";
import { BalanceResponse } from "../types";

interface BalanceCardProps {
  balances: BalanceResponse["balances"] | null;
  isLoading: boolean;
}

export function BalanceCard({ balances, isLoading }: BalanceCardProps) {
  return (
    <div className="balance-card" style={{ marginTop: "24px" }}>
      {isLoading && !balances ? (
        <div className="balance-loading">
          <div className="spinner small"></div>
        </div>
      ) : balances ? (
        <div className="balance-amount">
          <span className="balance-value">${balances.usdc.formatted}</span>
          <span className="balance-symbol">USDC</span>
        </div>
      ) : (
        <div className="balance-amount">
          <span className="balance-value">--</span>
          <span className="balance-symbol">USDC</span>
        </div>
      )}
      {balances && (
        <div className="balance-secondary">{balances.eth.formatted} ETH</div>
      )}
    </div>
  );
}
