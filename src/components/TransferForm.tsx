import React, { RefObject } from "react";
import { BalanceResponse } from "../types";
import { isPotentialENSName } from "../utils/ens";
import { truncateAddress } from "../utils/format";

interface ENSState {
  resolvedAddress: string | null;
  ensName: string | null;
  isResolving: boolean;
  error: boolean;
}

interface TransferFormProps {
  recipientAddress: string;
  setRecipientAddress: (address: string) => void;
  transferAmount: string;
  setTransferAmount: (amount: string) => void;
  ens: ENSState;
  isTransferring: boolean;
  transferStatus: string;
  showSuccessToast: boolean;
  balances: BalanceResponse["balances"] | null;
  onTransfer: (finalRecipient: string) => void;
  onMaxAmount: () => void;
  onScanQR: () => void;
  amountInputRef: RefObject<HTMLInputElement | null>;
}

export function TransferForm({
  recipientAddress,
  setRecipientAddress,
  transferAmount,
  setTransferAmount,
  ens,
  isTransferring,
  transferStatus,
  showSuccessToast,
  balances,
  onTransfer,
  onMaxAmount,
  onScanQR,
  amountInputRef,
}: TransferFormProps) {
  const { resolvedAddress, ensName, isResolving, error: ensError } = ens;

  // Determine the final recipient address
  const finalRecipient = resolvedAddress || recipientAddress;

  // Check if the form is valid for submission
  const isFormValid =
    recipientAddress &&
    transferAmount &&
    parseFloat(transferAmount) > 0 &&
    !isResolving &&
    (!isPotentialENSName(recipientAddress) || resolvedAddress);

  const handleSubmit = () => {
    onTransfer(finalRecipient);
  };

  return (
    <div className="transfer-card">
      <div className="form-group">
        <label htmlFor="recipient">Recipient Address</label>
        <div className="input-with-icon">
          <input
            id="recipient"
            type="text"
            placeholder="0x... or ENS name"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            disabled={isTransferring}
            className="input-field"
          />
          <button
            type="button"
            className="input-icon-btn"
            onClick={onScanQR}
            disabled={isTransferring}
            title="Scan QR code"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 7V5C3 3.89543 3.89543 3 5 3H7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M17 3H19C20.1046 3 21 3.89543 21 5V7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M21 17V19C21 20.1046 20.1046 21 19 21H17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M7 21H5C3.89543 21 3 20.1046 3 19V17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <rect
                x="7"
                y="7"
                width="4"
                height="4"
                rx="1"
                stroke="currentColor"
                strokeWidth="2"
              />
              <rect
                x="13"
                y="7"
                width="4"
                height="4"
                rx="1"
                stroke="currentColor"
                strokeWidth="2"
              />
              <rect
                x="7"
                y="13"
                width="4"
                height="4"
                rx="1"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M13 13H17V17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {isResolving && (
          <div className="ens-status resolving">Resolving ENS...</div>
        )}
        {resolvedAddress && (
          <div className="ens-status resolved">
            <span className="ens-resolved-address">
              → {truncateAddress(resolvedAddress)}
            </span>
            <button
              className="ens-action-btn"
              onClick={() => {
                navigator.clipboard.writeText(resolvedAddress);
              }}
              title="Copy address"
            >
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
            </button>
            <a
              href={`https://blockscan.com/address/${resolvedAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ens-action-btn"
              title="View on Blockscan"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
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
        )}
        {ensError && <div className="ens-status error">ENS name not found</div>}
        {ensName && !isPotentialENSName(recipientAddress) && (
          <div className="ens-status resolved">
            <span className="ens-resolved-name">{ensName}</span>
          </div>
        )}
      </div>

      <div className="form-group">
        <div className="amount-header">
          <label htmlFor="amount">Amount (USDC)</label>
          <button
            className="max-btn"
            onClick={onMaxAmount}
            disabled={isTransferring || !balances}
            tabIndex={-1}
          >
            MAX
          </button>
        </div>
        <input
          ref={amountInputRef}
          id="amount"
          type="number"
          placeholder="0.00"
          value={transferAmount}
          onChange={(e) => setTransferAmount(e.target.value)}
          disabled={isTransferring}
          className="input-field"
          step="0.01"
          min="0"
        />
      </div>

      <button
        className={`btn ${
          isFormValid ? "btn-primary" : "btn-primary-outline"
        } btn-send`}
        onClick={handleSubmit}
        disabled={!isFormValid || isTransferring}
      >
        {isTransferring ? (
          <>
            <div className="spinner small"></div>
            Processing...
          </>
        ) : (
          <>
            <span className="btn-icon">↗</span>
            Send USDC
          </>
        )}
      </button>

      {transferStatus && !showSuccessToast && (
        <div
          className={`status-message ${
            transferStatus.includes("✗") ? "error" : "info"
          }`}
        >
          {transferStatus}
        </div>
      )}
    </div>
  );
}
