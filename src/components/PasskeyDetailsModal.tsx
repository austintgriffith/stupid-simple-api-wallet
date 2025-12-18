import React, { useState, useEffect } from "react";
import { PasskeyCredential } from "../types";

interface PasskeyDetailsModalProps {
  credential: PasskeyCredential;
  onClose: () => void;
}

export function PasskeyDetailsModal({
  credential,
  onClose,
}: PasskeyDetailsModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

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
        </div>
      </div>
    </div>
  );
}
