import React, { useState } from "react";
import "./App.css";

// Vercel domain for passkey association
const PASSKEY_RP_ID = "reactapp-sigma-lyart.vercel.app";
const PASSKEY_RP_NAME = "Passkey Wallet";

// Helper to generate random bytes
function generateRandomBytes(length: number): ArrayBuffer {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array.buffer as ArrayBuffer;
}

// Helper to convert ArrayBuffer to base64url string
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

interface PasskeyCredential {
  id: string;
  rawId: string;
  publicKey?: string;
  createdAt: Date;
}

function App() {
  const [credential, setCredential] = useState<PasskeyCredential | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const generatePasskey = async () => {
    setIsLoading(true);
    setStatus("Creating passkey...");

    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error("WebAuthn is not supported in this browser");
      }

      const userId = generateRandomBytes(32);
      const challenge = generateRandomBytes(32);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions =
        {
          challenge,
          rp: {
            name: PASSKEY_RP_NAME,
            id: PASSKEY_RP_ID,
          },
          user: {
            id: userId,
            name: `user_${Date.now()}`,
            displayName: "Passkey User",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" }, // ES256
            { alg: -257, type: "public-key" }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        };

      const credential = (await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      })) as PublicKeyCredential;

      if (credential) {
        const attestationResponse =
          credential.response as AuthenticatorAttestationResponse;

        const passkeyData: PasskeyCredential = {
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          publicKey: bufferToBase64url(
            attestationResponse.getPublicKey() || new ArrayBuffer(0)
          ),
          createdAt: new Date(),
        };

        // Store credential ID for later authentication
        localStorage.setItem("passkey_credential_id", credential.id);
        localStorage.setItem("passkey_raw_id", passkeyData.rawId);

        setCredential(passkeyData);
        setStatus("✓ Passkey created successfully!");
      }
    } catch (error: any) {
      console.error("Error creating passkey:", error);
      setStatus(`✗ Error: ${error.message || "Failed to create passkey"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const connectPasskey = async () => {
    setIsLoading(true);
    setStatus("Connecting to passkey...");

    try {
      if (!window.PublicKeyCredential) {
        throw new Error("WebAuthn is not supported in this browser");
      }

      const challenge = generateRandomBytes(32);

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions =
        {
          challenge,
          rpId: PASSKEY_RP_ID,
          userVerification: "required",
          timeout: 60000,
        };

      const assertion = (await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      })) as PublicKeyCredential;

      if (assertion) {
        const passkeyData: PasskeyCredential = {
          id: assertion.id,
          rawId: bufferToBase64url(assertion.rawId),
          createdAt: new Date(),
        };

        localStorage.setItem("passkey_credential_id", assertion.id);
        localStorage.setItem("passkey_raw_id", passkeyData.rawId);

        setCredential(passkeyData);
        setStatus("✓ Connected to passkey successfully!");
      }
    } catch (error: any) {
      console.error("Error connecting passkey:", error);
      setStatus(`✗ Error: ${error.message || "Failed to connect passkey"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = () => {
    setCredential(null);
    setStatus("");
  };

  return (
    <div className="App">
      <div className="container">
        <div className="hero">
          <div className="icon-container">
            <svg
              className="key-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 2L19 4M11.3891 11.6109C12.3844 12.6062 13 13.9812 13 15.5C13 18.5376 10.5376 21 7.5 21C4.46243 21 2 18.5376 2 15.5C2 12.4624 4.46243 10 7.5 10C9.01878 10 10.3938 10.6156 11.3891 11.6109ZM11.3891 11.6109L15.5 7.5M15.5 7.5L18.5 10.5L22 7L19 4M15.5 7.5L19 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1>Passkey Authentication</h1>
          <p className="subtitle">
            Secure, passwordless access using your device
          </p>
        </div>

        {!credential ? (
          <div className="auth-options">
            <button
              className="btn btn-primary"
              onClick={generatePasskey}
              disabled={isLoading}
            >
              <span className="btn-icon">+</span>
              Generate New Passkey
            </button>

            <div className="divider">
              <span>or</span>
            </div>

            <button
              className="btn btn-secondary"
              onClick={connectPasskey}
              disabled={isLoading}
            >
              <span className="btn-icon">↗</span>
              Connect Existing Passkey
            </button>
          </div>
        ) : (
          <div className="credential-card">
            <div className="credential-header">
              <span className="status-dot"></span>
              <span>Connected</span>
            </div>
            <div className="credential-details">
              <div className="detail-row">
                <span className="label">Credential ID</span>
                <span className="value mono">
                  {credential.id.slice(0, 20)}...
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Raw ID</span>
                <span className="value mono">
                  {credential.rawId.slice(0, 20)}...
                </span>
              </div>
            </div>
            <button className="btn btn-disconnect" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        )}

        {status && (
          <div
            className={`status-message ${
              status.includes("✓")
                ? "success"
                : status.includes("✗")
                ? "error"
                : "info"
            }`}
          >
            {status}
          </div>
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
