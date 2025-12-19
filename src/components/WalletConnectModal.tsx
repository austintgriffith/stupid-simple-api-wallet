import React, { useState, useEffect } from "react";
import { QRScannerModal } from "./QRScannerModal";
import {
  SessionRequest,
  ActiveSession,
  BatchCallStatus,
} from "../hooks/useWalletConnect";
import { SLOPWALLET_API, BASE_CHAIN_ID } from "../config";
import { parseAsn1Signature, normalizeS } from "../utils/crypto";
import { PasskeyCredential, WebAuthnAuth } from "../types";
import { PASSKEY_RP_ID } from "../config";

// WalletConnect state type passed from App
export interface WalletConnectState {
  status: string;
  error: string | null;
  pair: (uri: string) => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
  disconnectAll: () => Promise<void>;
  sessionRequests: SessionRequest[];
  activeSessions: ActiveSession[];
  clearRequest: (id: number) => void;
  approveRequest: (
    requestId: number,
    topic: string,
    result: string
  ) => Promise<void>;
  rejectRequest: (requestId: number, topic: string) => Promise<void>;
  updateBatchStatus: (
    batchId: string,
    updates: Partial<BatchCallStatus>
  ) => void;
  isReady: boolean;
}

interface WalletConnectModalProps {
  smartWalletAddress: string;
  credential: PasskeyCredential;
  onClose: () => void;
  wcState: WalletConnectState;
  pendingUri?: string | null;
  onPendingUriConsumed?: () => void;
}

// Format value from hex to ETH
function formatValue(value?: string): string {
  if (!value || value === "0x0" || value === "0x" || value === "0")
    return "0 ETH";
  try {
    const wei = BigInt(value);
    const eth = Number(wei) / 1e18;
    return `${eth.toFixed(6)} ETH`;
  } catch {
    return value;
  }
}

// Parse chain ID from WalletConnect format
function parseChainId(chainId: string): number {
  const match = chainId.match(/eip155:(\d+)/);
  if (match) return parseInt(match[1], 10);
  if (!isNaN(Number(chainId))) return Number(chainId);
  return BASE_CHAIN_ID;
}

export function WalletConnectModal({
  smartWalletAddress,
  credential,
  onClose,
  wcState,
  pendingUri,
  onPendingUriConsumed,
}: WalletConnectModalProps) {
  const [wcUri, setWcUri] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [successTx, setSuccessTx] = useState<{
    txHash: string;
    dAppName: string;
  } | null>(null);

  // Destructure WalletConnect state from props
  const {
    status,
    error,
    pair,
    disconnect,
    disconnectAll,
    sessionRequests,
    activeSessions,
    clearRequest,
    approveRequest,
    rejectRequest,
    updateBatchStatus,
    isReady,
  } = wcState;

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

  // Auto-dismiss success toast after 10 seconds
  useEffect(() => {
    if (successTx) {
      const timeout = setTimeout(() => setSuccessTx(null), 10000);
      return () => clearTimeout(timeout);
    }
  }, [successTx]);

  // Auto-pair when a pending URI is provided (from FAB scanner)
  useEffect(() => {
    if (pendingUri && isReady) {
      pair(pendingUri);
      onPendingUriConsumed?.();
    }
  }, [pendingUri, isReady, pair, onPendingUriConsumed]);

  const handlePaste = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWcUri(value);

    // Auto-connect when a valid WC URI is pasted
    if (value.startsWith("wc:")) {
      await pair(value);
      setWcUri("");
    }
  };

  const handleConnect = async () => {
    if (wcUri.startsWith("wc:")) {
      await pair(wcUri);
      setWcUri("");
    }
  };

  const handleScan = (scannedUri: string) => {
    // The QRScannerModal validates for ETH addresses, but we want WC URIs
    // Check if it's a WC URI
    if (scannedUri.startsWith("wc:")) {
      setWcUri(scannedUri);
      pair(scannedUri);
      setWcUri("");
    } else {
      // If it looks like a WC URI was scanned but validation failed
      setWcUri(scannedUri);
    }
    setIsScanning(false);
  };

  const getStatusBadge = () => {
    switch (status) {
      case "initializing":
        return (
          <span className="wc-badge wc-badge-warning">Initializing...</span>
        );
      case "ready":
        return <span className="wc-badge wc-badge-info">Ready</span>;
      case "pairing":
        return <span className="wc-badge wc-badge-warning">Connecting...</span>;
      case "connected":
        return <span className="wc-badge wc-badge-success">Connected</span>;
      case "error":
        return <span className="wc-badge wc-badge-error">Error</span>;
      default:
        return <span className="wc-badge">Idle</span>;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="wc-header-title">
            <h3>WalletConnect</h3>
            {getStatusBadge()}
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-content wc-content">
          {/* Error Display */}
          {error && (
            <div className="wc-error">
              <span>{error}</span>
            </div>
          )}

          {/* URI Input */}
          <div className="wc-input-section">
            <label>Paste WalletConnect URI</label>
            <div className="wc-input-row">
              <input
                type="text"
                className="input-field"
                placeholder="wc:..."
                value={wcUri}
                onChange={handlePaste}
                disabled={!isReady}
              />
              <button
                className="wc-scan-btn"
                onClick={() => setIsScanning(true)}
                disabled={!isReady}
                title="Scan QR Code"
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
              {wcUri && !wcUri.startsWith("wc:") && (
                <button
                  className="btn btn-primary wc-connect-btn"
                  onClick={handleConnect}
                  disabled={!isReady}
                >
                  Connect
                </button>
              )}
            </div>
            {status === "pairing" && (
              <div className="wc-pairing-status">
                <div className="spinner small"></div>
                <span>Connecting to dApp...</span>
              </div>
            )}
          </div>

          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div className="wc-sessions-section">
              <div className="wc-section-header">
                <span className="wc-section-title">
                  Active Sessions ({activeSessions.length})
                </span>
                <button className="wc-disconnect-all" onClick={disconnectAll}>
                  Disconnect All
                </button>
              </div>
              <div className="wc-sessions-list">
                {activeSessions.map((session) => (
                  <SessionCard
                    key={session.topic}
                    session={session}
                    onDisconnect={() => disconnect(session.topic)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pending Requests */}
          {sessionRequests.length > 0 && (
            <div className="wc-requests-section">
              <div className="wc-section-header">
                <span className="wc-section-title">
                  Pending Requests ({sessionRequests.length})
                </span>
              </div>
              <div className="wc-requests-list">
                {sessionRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    credential={credential}
                    smartWalletAddress={smartWalletAddress}
                    onApprove={approveRequest}
                    onReject={rejectRequest}
                    onClear={() => clearRequest(request.id)}
                    updateBatchStatus={updateBatchStatus}
                    onSuccess={(txHash, dAppName) =>
                      setSuccessTx({ txHash, dAppName })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {activeSessions.length === 0 &&
            sessionRequests.length === 0 &&
            isReady && (
              <div className="wc-empty-state">
                <p>No active connections.</p>
                <p className="wc-hint">
                  Paste a WalletConnect URI or scan a QR code to connect to a
                  dApp.
                </p>
              </div>
            )}
        </div>
      </div>

      {/* QR Scanner Modal */}
      {isScanning && (
        <WCScannerModal
          onScan={handleScan}
          onClose={() => setIsScanning(false)}
        />
      )}

      {/* Success Toast */}
      {successTx && (
        <div className="wc-success-toast">
          <button className="toast-close" onClick={() => setSuccessTx(null)}>
            ×
          </button>
          <div className="toast-content">
            <div className="toast-title">✓ Transaction sent!</div>
            <div className="toast-subtitle">{successTx.dAppName}</div>
            <a
              href={`https://basescan.org/tx/${successTx.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="toast-link"
            >
              View on Basescan →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom QR Scanner for WalletConnect URIs
function WCScannerModal({
  onScan,
  onClose,
}: {
  onScan: (uri: string) => void;
  onClose: () => void;
}) {
  // Wrapper that accepts any scanned content for WC URIs
  const handleScan = (content: string) => {
    onScan(content);
  };

  return <QRScannerModal onScan={handleScan} onClose={onClose} />;
}

// Session Card Component
function SessionCard({
  session,
  onDisconnect,
}: {
  session: ActiveSession;
  onDisconnect: () => void;
}) {
  return (
    <div className="wc-session-card">
      <div className="wc-session-info">
        {session.peerMeta.icons?.[0] && (
          <img
            src={session.peerMeta.icons[0]}
            alt={session.peerMeta.name}
            className="wc-session-icon"
          />
        )}
        <div className="wc-session-details">
          <span className="wc-session-name">{session.peerMeta.name}</span>
          {session.peerMeta.url && (
            <span className="wc-session-url">{session.peerMeta.url}</span>
          )}
        </div>
      </div>
      <button className="wc-disconnect-btn" onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}

// Request Card Component
function RequestCard({
  request,
  credential,
  smartWalletAddress,
  onApprove,
  onReject,
  onClear,
  updateBatchStatus,
  onSuccess,
}: {
  request: SessionRequest;
  credential: PasskeyCredential;
  smartWalletAddress: string;
  onApprove: (
    requestId: number,
    topic: string,
    result: string
  ) => Promise<void>;
  onReject: (requestId: number, topic: string) => Promise<void>;
  onClear: () => void;
  updateBatchStatus: (
    batchId: string,
    updates: { status?: number; txHash?: string }
  ) => void;
  onSuccess: (txHash: string, dAppName: string) => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const isTransaction = request.method === "eth_sendTransaction";
  const isBatchCall = request.method === "wallet_sendCalls";
  const isSigningRequest = [
    "personal_sign",
    "eth_sign",
    "eth_signTypedData",
    "eth_signTypedData_v4",
  ].includes(request.method);

  const getMethodLabel = (method: string) => {
    switch (method) {
      case "eth_sendTransaction":
        return "Transaction";
      case "wallet_sendCalls":
        return "Batch Calls";
      case "personal_sign":
        return "Sign Message";
      case "eth_signTypedData":
      case "eth_signTypedData_v4":
        return "Sign Typed Data";
      default:
        return method;
    }
  };

  const handleSignWithPasskey = async () => {
    if (!credential.qx || !credential.qy) {
      setTxError("Passkey public key not available");
      return;
    }

    setIsProcessing(true);
    setTxError(null);

    try {
      const chainId = parseChainId(request.chainId);

      // Prepare the call data for the API
      let prepareBody: Record<string, unknown>;

      if (isBatchCall && request.calls && request.calls.length > 0) {
        // Batch calls
        prepareBody = {
          chainId,
          wallet: smartWalletAddress,
          qx: credential.qx,
          qy: credential.qy,
          calls: request.calls.map((call) => ({
            target: call.to || "0x0000000000000000000000000000000000000000",
            value: call.value || "0",
            data: call.data || "0x",
          })),
        };
      } else {
        // Single transaction
        prepareBody = {
          chainId,
          wallet: smartWalletAddress,
          qx: credential.qx,
          qy: credential.qy,
          target:
            request.params.to || "0x0000000000000000000000000000000000000000",
          value: request.params.value || "0",
          data: request.params.data || "0x",
        };
      }

      // Step 1: Call prepare-call API
      const prepareResponse = await fetch(`${SLOPWALLET_API}/prepare-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepareBody),
      });

      const prepareData = await prepareResponse.json();
      if (!prepareData.success) {
        throw new Error(prepareData.error || "Failed to prepare transaction");
      }

      const { challengeHash, deadline, calls, isBatch } = prepareData;

      // Step 2: Sign with WebAuthn passkey
      const challengeBytes = new Uint8Array(
        (challengeHash.slice(2).match(/.{2}/g) || []).map((byte: string) =>
          parseInt(byte, 16)
        )
      );

      const credentialIdBytes = Uint8Array.from(
        atob(credential.rawId.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0)
      );

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          allowCredentials: [
            {
              id: credentialIdBytes,
              type: "public-key",
            },
          ],
          userVerification: "required",
          rpId: PASSKEY_RP_ID,
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      if (!assertion) {
        throw new Error("Passkey signing cancelled");
      }

      const assertionResponse =
        assertion.response as AuthenticatorAssertionResponse;

      // Parse signature
      const { r, s: rawS } = parseAsn1Signature(assertionResponse.signature);
      const s = normalizeS(rawS);

      const rHex = "0x" + r.toString(16).padStart(64, "0");
      const sHex = "0x" + s.toString(16).padStart(64, "0");

      const authenticatorData =
        "0x" +
        Array.from(new Uint8Array(assertionResponse.authenticatorData))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const clientDataJSON = new TextDecoder().decode(
        assertionResponse.clientDataJSON
      );

      const challengeIndex = clientDataJSON.indexOf('"challenge"');
      const typeIndex = clientDataJSON.indexOf('"type"');

      const auth: WebAuthnAuth = {
        r: rHex,
        s: sHex,
        challengeIndex: challengeIndex.toString(),
        typeIndex: typeIndex.toString(),
        authenticatorData,
        clientDataJSON,
      };

      // Step 3: Call facilitate API
      const facilitateResponse = await fetch(`${SLOPWALLET_API}/facilitate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smartWalletAddress,
          chainId,
          isBatch,
          calls,
          qx: credential.qx,
          qy: credential.qy,
          deadline,
          auth,
        }),
      });

      const facilitateData = await facilitateResponse.json();

      if (facilitateData.success && facilitateData.txHash) {
        // Update batch status if applicable
        if (isBatchCall && request.batchId) {
          updateBatchStatus(request.batchId, {
            status: 200,
            txHash: facilitateData.txHash,
          });
        }

        // Send tx hash back to dApp (for non-batch requests)
        if (!isBatchCall) {
          await onApprove(request.id, request.topic, facilitateData.txHash);
        } else {
          // For batch calls, just clear the request
          onClear();
        }

        // Show success toast
        onSuccess(facilitateData.txHash, request.peerMeta?.name || "dApp");
      } else {
        throw new Error(facilitateData.error || "Transaction failed");
      }
    } catch (err) {
      console.error("Transaction failed:", err);
      setTxError(err instanceof Error ? err.message : "Transaction failed");

      if (isBatchCall && request.batchId) {
        updateBatchStatus(request.batchId, { status: 500 });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      if (isBatchCall && request.batchId) {
        updateBatchStatus(request.batchId, { status: 400 });
        onClear();
      } else {
        await onReject(request.id, request.topic);
      }
    } catch (err) {
      console.error("Failed to reject:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="wc-request-card">
      {/* Header */}
      <div className="wc-request-header">
        <div className="wc-request-info">
          {request.peerMeta?.icons?.[0] && (
            <img
              src={request.peerMeta.icons[0]}
              alt={request.peerMeta?.name || "dApp"}
              className="wc-request-icon"
            />
          )}
          <span className="wc-request-name">
            {request.peerMeta?.name || "Unknown dApp"}
          </span>
        </div>
        <span className="wc-badge wc-badge-info">
          {getMethodLabel(request.method)}
        </span>
      </div>

      {/* Chain */}
      <div className="wc-request-chain">
        Chain: {parseChainId(request.chainId)}
      </div>

      {/* Transaction Details */}
      {(isTransaction || isBatchCall) && (
        <div className="wc-request-details">
          {isTransaction && (
            <>
              {request.params.to && (
                <div className="wc-detail-row">
                  <span className="wc-detail-label">To:</span>
                  <span className="wc-detail-value mono">
                    {request.params.to.slice(0, 10)}...
                    {request.params.to.slice(-8)}
                  </span>
                </div>
              )}
              <div className="wc-detail-row">
                <span className="wc-detail-label">Value:</span>
                <span className="wc-detail-value">
                  {formatValue(request.params.value)}
                </span>
              </div>
              {request.params.data && request.params.data !== "0x" && (
                <div className="wc-detail-row">
                  <span className="wc-detail-label">Data:</span>
                  <span className="wc-detail-value mono wc-data-preview">
                    {request.params.data.slice(0, 20)}...
                  </span>
                </div>
              )}
            </>
          )}

          {isBatchCall && request.calls && (
            <div className="wc-batch-calls">
              <span className="wc-detail-label">
                {request.calls.length} call(s) in batch
              </span>
              {request.calls.slice(0, 3).map((call, index) => (
                <div key={index} className="wc-batch-call">
                  <span className="wc-batch-call-num">#{index + 1}</span>
                  <span className="mono">
                    {call.to?.slice(0, 10)}...{call.to?.slice(-6)}
                  </span>
                </div>
              ))}
              {request.calls.length > 3 && (
                <span className="wc-batch-more">
                  +{request.calls.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Signing Request Details */}
      {isSigningRequest && (
        <div className="wc-request-details">
          <div className="wc-signing-notice">
            Signing requests are not yet supported.
          </div>
        </div>
      )}

      {/* Error Display */}
      {txError && <div className="wc-request-error">{txError}</div>}

      {/* Action Buttons */}
      {(isTransaction || isBatchCall) && (
        <div className="wc-request-actions">
          <button
            className="btn btn-secondary"
            onClick={handleReject}
            disabled={isProcessing}
          >
            Reject
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSignWithPasskey}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <div className="spinner small"></div>
                Processing...
              </>
            ) : (
              "Sign with Passkey"
            )}
          </button>
        </div>
      )}

      {/* Signing requests - only reject */}
      {isSigningRequest && (
        <div className="wc-request-actions">
          <button
            className="btn btn-secondary"
            onClick={handleReject}
            disabled={isProcessing}
          >
            Reject
          </button>
        </div>
      )}

      {/* Timestamp */}
      <div className="wc-request-time">
        {new Date(request.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}
