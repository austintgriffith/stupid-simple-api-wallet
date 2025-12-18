import React from "react";
import BlockiesSvg from "blockies-react-svg";
import { truncateAddress } from "../utils/format";

interface WalletHeaderProps {
  address: string;
  ensName: string | null;
  variant?: "banner" | "modal";
}

/**
 * Reusable wallet identity display component.
 * Shows blockie + ENS name (if available) + truncated address.
 */
export function WalletHeader({
  address,
  ensName,
  variant = "banner",
}: WalletHeaderProps) {
  const isBanner = variant === "banner";

  return (
    <div className={isBanner ? "wallet-header-banner" : "wallet-header-modal"}>
      <BlockiesSvg
        address={address}
        className={isBanner ? "wallet-identicon" : "qr-modal-identicon"}
      />
      <div className={isBanner ? "wallet-info" : "qr-modal-info"}>
        <span className={`${isBanner ? "wallet-name" : "qr-modal-name"} mono`}>
          {ensName || truncateAddress(address)}
        </span>
        {ensName && (
          <span
            className={`${
              isBanner ? "wallet-address-subtitle" : "qr-modal-address-subtitle"
            } mono`}
          >
            {truncateAddress(address)}
          </span>
        )}
      </div>
    </div>
  );
}
