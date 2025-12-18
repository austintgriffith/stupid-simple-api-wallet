import React, { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { WalletHeader } from "./WalletHeader";

interface QRModalProps {
  address: string;
  ensName: string | null;
  onClose: () => void;
  onCopyAddress: (address: string) => void;
}

export function QRModal({
  address,
  ensName,
  onClose,
  onCopyAddress,
}: QRModalProps) {
  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header qr-modal-header">
          <div className="qr-modal-identity">
            <WalletHeader address={address} ensName={ensName} variant="modal" />
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-content qr-modal-content">
          <div className="qr-code-container">
            <QRCodeSVG
              value={address}
              size={256}
              level="H"
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
          <div className="qr-full-address mono">{address}</div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              onCopyAddress(address);
              onClose();
            }}
          >
            Copy Address
          </button>
        </div>
      </div>
    </div>
  );
}
