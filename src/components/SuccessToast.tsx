import React from "react";

interface SuccessToastProps {
  txHash: string;
  onDismiss: () => void;
}

export function SuccessToast({ txHash, onDismiss }: SuccessToastProps) {
  return (
    <div className="success-toast">
      <button className="toast-close" onClick={onDismiss}>
        ×
      </button>
      <div className="toast-content">
        <div className="toast-title">✓ Transfer complete!</div>
        <a
          href={`https://basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="toast-link"
        >
          View transaction on Basescan →
        </a>
      </div>
    </div>
  );
}
