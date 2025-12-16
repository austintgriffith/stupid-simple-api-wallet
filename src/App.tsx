import React, { useState, useEffect, useCallback } from "react";
import BlockiesSvg from "blockies-react-svg";
import { keccak256, concat, toHex } from "viem";
import "./App.css";

// Passkey configuration - RP ID must match associated domain for iOS app
// Use the production domain when in Capacitor native app, otherwise use current hostname
const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.();
const PASSKEY_RP_ID = isNativeApp
  ? "reactapp-sigma-lyart.vercel.app" // Must match App.entitlements webcredentials
  : window.location.hostname;
const PASSKEY_RP_NAME = "Slop Wallet Mobile";

// SlopWallet API configuration
const SLOPWALLET_API = "https://slopwallet.com/api";
const BASE_CHAIN_ID = BigInt(8453);

// Balance response interface
interface BalanceResponse {
  address: string;
  balances: {
    eth: { raw: string; formatted: string; symbol: string; decimals: number };
    usdc: { raw: string; formatted: string; symbol: string; decimals: number };
  };
}

// Transfer calldata response interface
interface TransferResponse {
  success: boolean;
  asset: string;
  amount: string;
  to: string;
  call: {
    target: string;
    value: string;
    data: string;
  };
}

// WebAuthn auth data for relay
interface WebAuthnAuth {
  r: string;
  s: string;
  challengeIndex: string;
  typeIndex: string;
  authenticatorData: string;
  clientDataJSON: string;
}

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
  qx?: string;
  qy?: string;
  createdAt: Date;
}

// Build challenge hash for signing
function buildChallengeHash(
  chainId: bigint,
  walletAddress: `0x${string}`,
  target: `0x${string}`,
  value: bigint,
  data: `0x${string}`,
  nonce: bigint,
  deadline: bigint
): `0x${string}` {
  return keccak256(
    concat([
      toHex(chainId, { size: 32 }),
      walletAddress,
      target,
      toHex(value, { size: 32 }),
      data,
      toHex(nonce, { size: 32 }),
      toHex(deadline, { size: 32 }),
    ])
  );
}

// Parse ASN.1 DER signature to extract r and s values
function parseAsn1Signature(signature: ArrayBuffer): { r: bigint; s: bigint } {
  const bytes = new Uint8Array(signature);
  let offset = 0;

  // Check for SEQUENCE tag (0x30)
  if (bytes[offset++] !== 0x30) {
    throw new Error("Invalid ASN.1 signature: expected SEQUENCE");
  }

  // Skip sequence length
  let seqLen = bytes[offset++];
  if (seqLen & 0x80) {
    offset += seqLen & 0x7f;
  }

  // Parse r INTEGER
  if (bytes[offset++] !== 0x02) {
    throw new Error("Invalid ASN.1 signature: expected INTEGER for r");
  }
  let rLen = bytes[offset++];
  let rBytes = bytes.slice(offset, offset + rLen);
  offset += rLen;
  // Remove leading zero if present (for positive number representation)
  if (rBytes[0] === 0x00 && rBytes.length > 32) {
    rBytes = rBytes.slice(1);
  }

  // Parse s INTEGER
  if (bytes[offset++] !== 0x02) {
    throw new Error("Invalid ASN.1 signature: expected INTEGER for s");
  }
  let sLen = bytes[offset++];
  let sBytes = bytes.slice(offset, offset + sLen);
  // Remove leading zero if present
  if (sBytes[0] === 0x00 && sBytes.length > 32) {
    sBytes = sBytes.slice(1);
  }

  // Pad to 32 bytes if needed
  const rPadded = new Uint8Array(32);
  const sPadded = new Uint8Array(32);
  rPadded.set(rBytes, 32 - rBytes.length);
  sPadded.set(sBytes, 32 - sBytes.length);

  const r = BigInt(
    "0x" +
      Array.from(rPadded)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
  );
  const s = BigInt(
    "0x" +
      Array.from(sPadded)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
  );

  return { r, s };
}

// Normalize s value to low-s form (required by secp256r1)
function normalizeS(s: bigint): bigint {
  const curveOrder = BigInt(
    "0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551"
  );
  const halfOrder = curveOrder / BigInt(2);
  return s > halfOrder ? curveOrder - s : s;
}

// Extract public key coordinates from SPKI format (what getPublicKey() returns)
function extractPublicKeyFromSpki(spkiKey: ArrayBuffer): {
  qx: `0x${string}`;
  qy: `0x${string}`;
} {
  const bytes = new Uint8Array(spkiKey);

  // SPKI format for EC P-256:
  // - ASN.1 header (variable length, typically 26-27 bytes)
  // - 0x04 (uncompressed point indicator)
  // - X coordinate (32 bytes)
  // - Y coordinate (32 bytes)
  // Total: header + 65 bytes for the point

  // The last 65 bytes contain: 0x04 + X (32) + Y (32)
  if (bytes.length < 65) {
    throw new Error("SPKI key too short");
  }

  // Find the uncompressed point marker (0x04) followed by 64 bytes
  let pointStart = -1;
  for (let i = 0; i < bytes.length - 64; i++) {
    if (bytes[i] === 0x04) {
      // Verify this looks like a valid position (near the end)
      if (bytes.length - i === 65) {
        pointStart = i;
        break;
      }
    }
  }

  if (pointStart === -1) {
    // Fallback: assume last 64 bytes are X and Y (without 0x04 marker)
    // This can happen with some key formats
    const qx = bytes.slice(bytes.length - 64, bytes.length - 32);
    const qy = bytes.slice(bytes.length - 32);

    return {
      qx: ("0x" +
        Array.from(qx)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")) as `0x${string}`,
      qy: ("0x" +
        Array.from(qy)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")) as `0x${string}`,
    };
  }

  // Skip 0x04 marker and extract X and Y
  const qx = bytes.slice(pointStart + 1, pointStart + 33);
  const qy = bytes.slice(pointStart + 33, pointStart + 65);

  return {
    qx: ("0x" +
      Array.from(qx)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`,
    qy: ("0x" +
      Array.from(qy)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`,
  };
}

// Helper to truncate address for display (0x1234...5678)
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function App() {
  const [credential, setCredential] = useState<PasskeyCredential | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showPasskeyDetails, setShowPasskeyDetails] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Balance state
  const [balances, setBalances] = useState<BalanceResponse["balances"] | null>(
    null
  );
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

  // Transfer state
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferStatus, setTransferStatus] = useState<string>("");
  const [transferTxHash, setTransferTxHash] = useState<string | null>(null);

  const smartContractWallet = process.env.REACT_APP_SMART_CONTRACT_WALLET;

  // Fetch balances from SlopWallet API
  const fetchBalances = useCallback(async () => {
    if (!smartContractWallet) return;

    setIsLoadingBalance(true);
    try {
      const response = await fetch(
        `${SLOPWALLET_API}/balances?address=${smartContractWallet}`
      );
      const data: BalanceResponse = await response.json();
      setBalances(data.balances);
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [smartContractWallet]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedCredentialId = localStorage.getItem("passkey_credential_id");
    const savedRawId = localStorage.getItem("passkey_raw_id");
    const savedQx = localStorage.getItem("passkey_qx");
    const savedQy = localStorage.getItem("passkey_qy");

    if (savedCredentialId && savedRawId) {
      setCredential({
        id: savedCredentialId,
        rawId: savedRawId,
        qx: savedQx || undefined,
        qy: savedQy || undefined,
        createdAt: new Date(),
      });
    }
  }, []);

  // Fetch balances when logged in and auto-refresh every 5 seconds
  useEffect(() => {
    if (credential && smartContractWallet) {
      fetchBalances();
      const interval = setInterval(fetchBalances, 3000);
      return () => clearInterval(interval);
    }
  }, [credential, smartContractWallet, fetchBalances]);

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            name: `slop_wallet_${Date.now()}`,
            displayName: "Slop Wallet Mobile",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" }, // ES256 (P-256)
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        };

      const cred = (await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      })) as PublicKeyCredential;

      if (cred) {
        const attestationResponse =
          cred.response as AuthenticatorAttestationResponse;

        const publicKeyBytes = attestationResponse.getPublicKey();
        let qx: `0x${string}` | undefined;
        let qy: `0x${string}` | undefined;

        if (publicKeyBytes) {
          try {
            const coords = extractPublicKeyFromSpki(publicKeyBytes);
            qx = coords.qx;
            qy = coords.qy;
            console.log("Extracted public key coordinates:", { qx, qy });
          } catch (e) {
            console.error("Could not extract public key coordinates:", e);
            console.log(
              "Raw public key bytes:",
              new Uint8Array(publicKeyBytes)
            );
          }
        } else {
          console.warn("No public key bytes returned from getPublicKey()");
        }

        const passkeyData: PasskeyCredential = {
          id: cred.id,
          rawId: bufferToBase64url(cred.rawId),
          publicKey: bufferToBase64url(publicKeyBytes || new ArrayBuffer(0)),
          qx,
          qy,
          createdAt: new Date(),
        };

        // Store credential ID and public key for later use
        localStorage.setItem("passkey_credential_id", cred.id);
        localStorage.setItem("passkey_raw_id", passkeyData.rawId);
        if (qx) localStorage.setItem("passkey_qx", qx);
        if (qy) localStorage.setItem("passkey_qy", qy);

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

  // Transfer USDC using 3-step API flow
  const handleTransferUSDC = async () => {
    if (
      !credential ||
      !smartContractWallet ||
      !recipientAddress ||
      !transferAmount
    ) {
      setTransferStatus("✗ Missing required fields");
      return;
    }

    if (!credential.qx || !credential.qy) {
      setTransferStatus(
        "✗ Passkey public key not available. Please regenerate passkey."
      );
      return;
    }

    setIsTransferring(true);
    setTransferStatus("Getting transfer data...");
    setTransferTxHash(null);

    try {
      // Step 1: Get transfer calldata from API
      const transferResponse = await fetch(`${SLOPWALLET_API}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: "USDC",
          amount: transferAmount,
          to: recipientAddress,
        }),
      });

      const transferData: TransferResponse = await transferResponse.json();
      if (!transferData.success) {
        throw new Error("Failed to get transfer calldata");
      }

      setTransferStatus("Please sign with passkey...");

      // Step 2: Build challenge hash and sign with passkey
      const target = transferData.call.target as `0x${string}`;
      const value = BigInt(transferData.call.value);
      const data = transferData.call.data as `0x${string}`;
      const nonce = BigInt(0); // TODO: Fetch from smart wallet contract once passkey is registered
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

      const challengeHash = buildChallengeHash(
        BASE_CHAIN_ID,
        smartContractWallet as `0x${string}`,
        target,
        value,
        data,
        nonce,
        deadline
      );

      // Convert challenge hash to bytes for WebAuthn
      const challengeBytes = new Uint8Array(
        (challengeHash.slice(2).match(/.{2}/g) || []).map((byte) =>
          parseInt(byte, 16)
        )
      );

      // Convert credential ID from base64url to Uint8Array
      const credentialIdBytes = Uint8Array.from(
        atob(credential.rawId.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0)
      );

      // Sign with WebAuthn passkey
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
        throw new Error("No assertion returned from passkey");
      }

      const assertionResponse =
        assertion.response as AuthenticatorAssertionResponse;

      // Parse the signature (ASN.1 DER format)
      const { r, s: rawS } = parseAsn1Signature(assertionResponse.signature);
      const s = normalizeS(rawS);

      // Convert to hex strings
      const rHex = "0x" + r.toString(16).padStart(64, "0");
      const sHex = "0x" + s.toString(16).padStart(64, "0");

      // Get authenticator data and client data JSON
      const authenticatorData =
        "0x" +
        Array.from(new Uint8Array(assertionResponse.authenticatorData))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const clientDataJSON = new TextDecoder().decode(
        assertionResponse.clientDataJSON
      );

      // Find challenge and type indices in clientDataJSON
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

      setTransferStatus("Submitting transaction...");

      // Step 3: Submit to relay/facilitator
      const facilitateResponse = await fetch(`${SLOPWALLET_API}/facilitate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smartWalletAddress: smartContractWallet,
          chainId: Number(BASE_CHAIN_ID),
          isBatch: false,
          calls: [
            {
              target,
              value: value.toString(),
              data,
            },
          ],
          qx: credential.qx,
          qy: credential.qy,
          deadline: deadline.toString(),
          auth,
        }),
      });

      const facilitateData = await facilitateResponse.json();

      if (facilitateData.success && facilitateData.txHash) {
        setTransferTxHash(facilitateData.txHash);
        setTransferStatus("✓ Transfer complete!");
        setRecipientAddress("");
        setTransferAmount("");
        // Refresh balances
        fetchBalances();
      } else {
        throw new Error(facilitateData.error || "Transaction failed");
      }
    } catch (error: any) {
      console.error("Transfer failed:", error);
      setTransferStatus(`✗ ${error.message || "Transfer failed"}`);
    } finally {
      setIsTransferring(false);
    }
  };

  // Set max USDC amount
  const handleMaxAmount = () => {
    if (balances?.usdc) {
      setTransferAmount(balances.usdc.formatted);
    }
  };

  const logout = () => {
    localStorage.removeItem("passkey_credential_id");
    localStorage.removeItem("passkey_raw_id");
    localStorage.removeItem("passkey_qx");
    localStorage.removeItem("passkey_qy");
    setCredential(null);
    setStatus("");
    setBalances(null);
    setTransferStatus("");
    setTransferTxHash(null);
  };

  return (
    <div className={`App${isNativeApp ? " native-app" : ""}`}>
      {smartContractWallet && (
        <div className="wallet-banner">
          <BlockiesSvg
            address={smartContractWallet}
            className="wallet-identicon"
          />
          <span className="wallet-address mono">
            {truncateAddress(smartContractWallet)}
          </span>
          <button
            className="copy-btn"
            onClick={() => copyAddress(smartContractWallet)}
            title={copied ? "Copied!" : "Copy address"}
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
          <a
            href={`https://slopwallet.com/${smartContractWallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="external-link-btn"
            title="View on SlopWallet"
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
      {credential ? (
        <div className="container logged-in-container">
          {/* Balance Card */}
          <div className="balance-card" style={{ marginTop: "24px" }}>
            {isLoadingBalance && !balances ? (
              <div className="balance-loading">
                <div className="spinner small"></div>
              </div>
            ) : balances ? (
              <div className="balance-amount">
                <span className="balance-value">
                  ${balances.usdc.formatted}
                </span>
                <span className="balance-symbol">USDC</span>
              </div>
            ) : (
              <div className="balance-amount">
                <span className="balance-value">--</span>
                <span className="balance-symbol">USDC</span>
              </div>
            )}
            {balances && (
              <div className="balance-secondary">
                {balances.eth.formatted} ETH
              </div>
            )}
          </div>

          {/* Transfer Form */}
          <div className="transfer-card">
            <div className="form-group">
              <label htmlFor="recipient">Recipient Address</label>
              <input
                id="recipient"
                type="text"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                disabled={isTransferring}
                className="input-field"
              />
            </div>

            <div className="form-group">
              <div className="amount-header">
                <label htmlFor="amount">Amount (USDC)</label>
                <button
                  className="max-btn"
                  onClick={handleMaxAmount}
                  disabled={isTransferring || !balances}
                >
                  MAX
                </button>
              </div>
              <input
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
              className="btn btn-primary btn-send"
              onClick={handleTransferUSDC}
              disabled={
                isTransferring ||
                !recipientAddress ||
                !transferAmount ||
                parseFloat(transferAmount) <= 0
              }
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

            {transferStatus && (
              <div
                className={`status-message ${
                  transferStatus.includes("✓")
                    ? "success"
                    : transferStatus.includes("✗")
                    ? "error"
                    : "info"
                }`}
              >
                {transferStatus}
              </div>
            )}

            {transferTxHash && (
              <a
                href={`https://basescan.org/tx/${transferTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                View transaction on Basescan →
              </a>
            )}
          </div>

          {/* Passkey Info */}
          {!credential.qx && (
            <div className="warning-card">
              <p>
                ⚠️ Passkey public key not available. Please generate a new
                passkey to enable transfers.
              </p>
              <button
                className="btn btn-secondary"
                onClick={generatePasskey}
                disabled={isLoading}
              >
                Regenerate Passkey
              </button>
            </div>
          )}

          <button className="btn btn-logout" onClick={logout}>
            Logout
          </button>
          <button
            className="passkey-details-link"
            onClick={() => setShowPasskeyDetails(true)}
          >
            Passkey Details
          </button>
        </div>
      ) : (
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
      )}

      {/* Passkey Details Modal */}
      {showPasskeyDetails && credential && (
        <div
          className="modal-overlay"
          onClick={() => setShowPasskeyDetails(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Passkey Details</h3>
              <button
                className="modal-close"
                onClick={() => setShowPasskeyDetails(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="modal-field">
                <label>Public Key X (Qx)</label>
                <div className="modal-field-value">
                  <span className="mono">
                    {credential.qx || "Not available"}
                  </span>
                  {credential.qx && (
                    <button
                      className="copy-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(credential.qx!);
                        setCopiedField("qx");
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
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
                  <span className="mono">
                    {credential.qy || "Not available"}
                  </span>
                  {credential.qy && (
                    <button
                      className="copy-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(credential.qy!);
                        setCopiedField("qy");
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
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
                    onClick={async () => {
                      await navigator.clipboard.writeText(credential.rawId);
                      setCopiedField("rawId");
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
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
      )}
    </div>
  );
}

export default App;
