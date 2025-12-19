import React from "react";
import { WalletHeader } from "./WalletHeader";

interface WalletBannerProps {
  address: string;
  ensName: string | null;
  copied: boolean;
  onCopy: () => void;
  onShowQR: () => void;
}

export function WalletBanner({
  address,
  ensName,
  copied,
  onCopy,
  onShowQR,
}: WalletBannerProps) {
  return (
    <div className="wallet-banner">
      <WalletHeader address={address} ensName={ensName} variant="banner" />
      <button
        className="copy-btn"
        onClick={onCopy}
        title={copied ? "Copied!" : "Copy address"}
        tabIndex={-1}
      >
        {copied ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M20 6L9 17L4 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="9"
              y="9"
              width="13"
              height="13"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        )}
      </button>
      <button
        className="qr-btn"
        onClick={onShowQR}
        title="Show QR code"
        tabIndex={-1}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect
            x="3"
            y="3"
            width="7"
            height="7"
            rx="1"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="14"
            y="3"
            width="7"
            height="7"
            rx="1"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="3"
            y="14"
            width="7"
            height="7"
            rx="1"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect x="14" y="14" width="3" height="3" fill="currentColor" />
          <rect x="18" y="14" width="3" height="3" fill="currentColor" />
          <rect x="14" y="18" width="3" height="3" fill="currentColor" />
          <rect x="18" y="18" width="3" height="3" fill="currentColor" />
        </svg>
      </button>
      <a
        href={`https://blockscan.com/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="external-link-btn"
        title="View on Blockscan"
        tabIndex={-1}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M18 13V19C18 20.1046 17.1046 21 16 21H5C3.89543 21 3 20.1046 3 19V8C3 6.89543 3.89543 6 5 6H11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M15 3H21V9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 14L21 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </div>
  );
}
