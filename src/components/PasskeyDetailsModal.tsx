import React, { useState, useEffect } from "react";
import { PasskeyCredential } from "../types";
import { deriveEthereumKeyFromPasskey } from "../utils/crypto";

interface PasskeyDetailsModalProps {
  credential: PasskeyCredential;
  onClose: () => void;
}

export function PasskeyDetailsModal({
  credential,
  onClose,
}: PasskeyDetailsModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [derivedKey, setDerivedKey] = useState<`0x${string}` | null>(null);
  const [derivedAddress, setDerivedAddress] = useState<`0x${string}` | null>(
    null
  );
  const [isDerivingKey, setIsDerivingKey] = useState(false);
  const [derivationError, setDerivationError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

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

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDeriveKey = async () => {
    setIsDerivingKey(true);
    setDerivationError(null);
    setDerivedKey(null);
    setDerivedAddress(null);
    setShowPrivateKey(false);

    try {
      const result = await deriveEthereumKeyFromPasskey(credential.rawId);
      setDerivedKey(result.privateKey);
      setDerivedAddress(result.address);
    } catch (error) {
      setDerivationError(
        error instanceof Error ? error.message : "Failed to derive key"
      );
    } finally {
      setIsDerivingKey(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Passkey Details</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-content">
          <div className="modal-field">
            <label>Public Key X (Qx)</label>
            <div className="modal-field-value">
              <span className="mono">{credential.qx || "Not available"}</span>
              {credential.qx && (
                <button
                  className="copy-btn"
                  onClick={() => copyToClipboard(credential.qx!, "qx")}
                >
                  {copiedField === "qx" ? "✓" : "Copy"}
                </button>
              )}
            </div>
            <span className="field-hint">
              32-byte hex string (0x + 64 hex characters)
            </span>
          </div>

          <div className="modal-field">
            <label>Public Key Y (Qy)</label>
            <div className="modal-field-value">
              <span className="mono">{credential.qy || "Not available"}</span>
              {credential.qy && (
                <button
                  className="copy-btn"
                  onClick={() => copyToClipboard(credential.qy!, "qy")}
                >
                  {copiedField === "qy" ? "✓" : "Copy"}
                </button>
              )}
            </div>
            <span className="field-hint">
              32-byte hex string (0x + 64 hex characters)
            </span>
          </div>

          <div className="modal-field">
            <label>Credential ID (Base64URL)</label>
            <div className="modal-field-value">
              <span className="mono">{credential.rawId}</span>
              <button
                className="copy-btn"
                onClick={() => copyToClipboard(credential.rawId, "rawId")}
              >
                {copiedField === "rawId" ? "✓" : "Copy"}
              </button>
            </div>
            <span className="field-hint">
              Base64URL-encoded credential identifier from the passkey
            </span>
          </div>

          <div className="modal-divider" />

          <div className="modal-field">
            <label>Derive Ethereum Key (PRF)</label>
            <span
              className="field-hint"
              style={{ marginBottom: "8px", display: "block" }}
            >
              Use the WebAuthn PRF extension to derive a deterministic Ethereum
              private key from this passkey. Requires biometric/PIN
              authentication.
            </span>

            {!derivedKey && !derivationError && (
              <button
                className="derive-key-btn"
                onClick={handleDeriveKey}
                disabled={isDerivingKey}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "#4f46e5",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: isDerivingKey ? "wait" : "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                  opacity: isDerivingKey ? 0.7 : 1,
                }}
              >
                {isDerivingKey ? "Authenticating..." : "Derive Private Key"}
              </button>
            )}

            {derivationError && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  color: "#dc2626",
                  fontSize: "13px",
                }}
              >
                {derivationError}
                <button
                  onClick={handleDeriveKey}
                  style={{
                    display: "block",
                    marginTop: "8px",
                    padding: "8px 16px",
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Try Again
                </button>
              </div>
            )}

            {derivedKey && derivedAddress && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fefce8",
                  border: "1px solid #fef08a",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    color: "#854d0e",
                    fontSize: "12px",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  ⚠️ Keep your private key secret! Never share it with anyone.
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Derived Address
                  </label>
                  <div className="modal-field-value">
                    <span
                      className="mono"
                      style={{ fontSize: "12px", wordBreak: "break-all" }}
                    >
                      {derivedAddress}
                    </span>
                    <button
                      className="copy-btn"
                      onClick={() =>
                        copyToClipboard(derivedAddress, "derivedAddress")
                      }
                    >
                      {copiedField === "derivedAddress" ? "✓" : "Copy"}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Private Key
                  </label>
                  <div className="modal-field-value">
                    <span
                      className="mono"
                      style={{ fontSize: "12px", wordBreak: "break-all" }}
                    >
                      {showPrivateKey ? derivedKey : "•".repeat(66)}
                    </span>
                    <button
                      className="copy-btn"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      style={{ marginRight: "4px" }}
                    >
                      {showPrivateKey ? "Hide" : "Show"}
                    </button>
                    <button
                      className="copy-btn"
                      onClick={() => copyToClipboard(derivedKey, "derivedKey")}
                    >
                      {copiedField === "derivedKey" ? "✓" : "Copy"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleDeriveKey}
                  style={{
                    marginTop: "12px",
                    padding: "8px 16px",
                    backgroundColor: "#4f46e5",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Re-derive Key
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
