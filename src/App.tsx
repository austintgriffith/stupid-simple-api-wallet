import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import "./App.css";

// Config
import {
  isNativeApp,
  PASSKEY_RP_ID,
  PASSKEY_RP_NAME,
  SLOPWALLET_API,
  BASE_CHAIN_ID,
} from "./config";

// Types
import {
  BalanceResponse,
  PrepareTransferResponse,
  WebAuthnAuth,
  PasskeyCredential,
} from "./types";

// Utils
import {
  generateRandomBytes,
  bufferToBase64url,
  parseAsn1Signature,
  normalizeS,
  extractPublicKeyFromSpki,
} from "./utils/crypto";
import { isPotentialENSName, resolveENS, reverseResolveENS } from "./utils/ens";
import { truncateAddress } from "./utils/format";

// Components
import { WalletHeader } from "./components/WalletHeader";
import { QRModal } from "./components/QRModal";
import { QRScannerModal } from "./components/QRScannerModal";
import { PasskeyDetailsModal } from "./components/PasskeyDetailsModal";
import { SuccessToast } from "./components/SuccessToast";

// Lazy load WalletConnect provider to reduce initial bundle size (~256KB gzipped)
// The provider stays mounted after first use to keep the connection alive
const WalletConnectProvider = lazy(() =>
  import("./components/WalletConnectProvider").then((module) => ({
    default: module.WalletConnectProvider,
  }))
);

function App() {
  const [credential, setCredential] = useState<PasskeyCredential | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showPasskeyDetails, setShowPasskeyDetails] = useState<boolean>(false);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [showQRScanner, setShowQRScanner] = useState<boolean>(false);
  const [showWalletConnect, setShowWalletConnect] = useState<boolean>(false);
  const [wcInitialized, setWcInitialized] = useState<boolean>(false);

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

  // ENS resolution state
  const [ensResolvedAddress, setEnsResolvedAddress] = useState<string | null>(
    null
  );
  const [isResolvingENS, setIsResolvingENS] = useState<boolean>(false);
  const [ensError, setEnsError] = useState<boolean>(false);
  const [recipientEnsName, setRecipientEnsName] = useState<string | null>(null);

  // Success toast state
  const [showSuccessToast, setShowSuccessToast] = useState<boolean>(false);

  // Wallet ENS name state (reverse lookup)
  const [walletEnsName, setWalletEnsName] = useState<string | null>(null);

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

  // Fetch ENS name for wallet on page load (reverse lookup)
  useEffect(() => {
    if (smartContractWallet) {
      reverseResolveENS(smartContractWallet).then(setWalletEnsName);
    }
  }, [smartContractWallet]);

  // ENS resolution with debounce (forward: name -> address)
  useEffect(() => {
    const input = recipientAddress.trim();

    // Reset if not a potential ENS name
    if (!isPotentialENSName(input)) {
      setEnsResolvedAddress(null);
      setEnsError(false);
      setIsResolvingENS(false);
      return;
    }

    setIsResolvingENS(true);
    setEnsError(false);

    const timeout = setTimeout(async () => {
      const resolved = await resolveENS(input);
      setEnsResolvedAddress(resolved);
      setEnsError(!resolved);
      setIsResolvingENS(false);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [recipientAddress]);

  // Reverse ENS lookup (address -> name)
  useEffect(() => {
    const input = recipientAddress.trim();

    // Check if it's a valid Ethereum address
    const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(input);

    if (!isValidAddress) {
      setRecipientEnsName(null);
      return;
    }

    const timeout = setTimeout(async () => {
      const ensName = await reverseResolveENS(input);
      setRecipientEnsName(ensName);
    }, 500);

    return () => clearTimeout(timeout);
  }, [recipientAddress]);

  // Auto-dismiss success toast after 10 seconds
  useEffect(() => {
    if (showSuccessToast) {
      const timeout = setTimeout(() => {
        setShowSuccessToast(false);
        setTransferStatus("");
        setTransferTxHash(null);
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [showSuccessToast]);

  const dismissSuccessToast = () => {
    setShowSuccessToast(false);
    setTransferStatus("");
    setTransferTxHash(null);
  };

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

      if (!smartContractWallet) {
        throw new Error("Smart contract wallet not configured");
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
        const assertionResponse =
          assertion.response as AuthenticatorAssertionResponse;

        // Parse the signature to get r and s values
        const { r, s } = parseAsn1Signature(assertionResponse.signature);

        setStatus("Verifying passkey...");

        // Call the API to recover and verify the passkey
        const recoverResponse = await fetch(
          `${SLOPWALLET_API}/passkey/recover`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wallet: smartContractWallet,
              chainId: 8453,
              signature: {
                r: "0x" + r.toString(16).padStart(64, "0"),
                s: "0x" + s.toString(16).padStart(64, "0"),
              },
              authenticatorData:
                "0x" +
                Array.from(new Uint8Array(assertionResponse.authenticatorData))
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join(""),
              clientDataJSON: new TextDecoder().decode(
                assertionResponse.clientDataJSON
              ),
            }),
          }
        );

        const recoverData = await recoverResponse.json();

        if (recoverData.error) {
          throw new Error(
            "Passkey not authorized. Please use a passkey that has been added to this wallet."
          );
        }

        // Save the recovered qx/qy to localStorage
        localStorage.setItem("passkey_qx", recoverData.qx);
        localStorage.setItem("passkey_qy", recoverData.qy);

        const passkeyData: PasskeyCredential = {
          id: assertion.id,
          rawId: bufferToBase64url(assertion.rawId),
          qx: recoverData.qx,
          qy: recoverData.qy,
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
    // Use ENS resolved address if available, otherwise use input directly
    const finalRecipient = ensResolvedAddress || recipientAddress;

    if (
      !credential ||
      !smartContractWallet ||
      !finalRecipient ||
      !transferAmount
    ) {
      setTransferStatus("✗ Missing required fields");
      return;
    }

    // Validate that we have a valid address
    if (!finalRecipient.startsWith("0x") || finalRecipient.length !== 42) {
      setTransferStatus("✗ Invalid recipient address");
      return;
    }

    if (!credential.qx || !credential.qy) {
      setTransferStatus(
        "✗ Passkey public key not available. Please regenerate passkey."
      );
      return;
    }

    setIsTransferring(true);
    setTransferStatus("Preparing transfer...");
    setTransferTxHash(null);

    try {
      // Step 1: Get all transfer data in a single call
      const prepareResponse = await fetch(
        `${SLOPWALLET_API}/prepare-transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId: BASE_CHAIN_ID,
            wallet: smartContractWallet,
            qx: credential.qx,
            qy: credential.qy,
            asset: "USDC",
            amount: transferAmount,
            to: finalRecipient,
          }),
        }
      );

      const prepareData: PrepareTransferResponse = await prepareResponse.json();
      if (!prepareData.success) {
        throw new Error("Failed to prepare transfer");
      }

      setTransferStatus("Please sign with passkey...");

      // Extract data from response
      const { call, deadline, challengeHash } = prepareData;
      const target = call.target as `0x${string}`;
      const value = call.value;
      const data = call.data as `0x${string}`;

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

      // Step 2: Submit to relay/facilitator
      const facilitateResponse = await fetch(`${SLOPWALLET_API}/facilitate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smartWalletAddress: smartContractWallet,
          chainId: BASE_CHAIN_ID,
          isBatch: false,
          calls: [
            {
              target,
              value,
              data,
            },
          ],
          qx: credential.qx,
          qy: credential.qy,
          deadline,
          auth,
        }),
      });

      const facilitateData = await facilitateResponse.json();

      if (facilitateData.success && facilitateData.txHash) {
        setTransferTxHash(facilitateData.txHash);
        setTransferStatus("✓ Transfer complete!");
        setShowSuccessToast(true);
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
          <WalletHeader
            address={smartContractWallet}
            ensName={walletEnsName}
            variant="banner"
          />
          <button
            className="copy-btn"
            onClick={() => copyAddress(smartContractWallet)}
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
            onClick={() => setShowQRModal(true)}
            title="Show QR code"
            tabIndex={-1}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
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
            href={`https://blockscan.com/address/${smartContractWallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="external-link-btn"
            title="View on Blockscan"
            tabIndex={-1}
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
                  onClick={() => setShowQRScanner(true)}
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
              {isResolvingENS && (
                <div className="ens-status resolving">Resolving ENS...</div>
              )}
              {ensResolvedAddress && (
                <div className="ens-status resolved">
                  <span className="ens-resolved-address">
                    → {truncateAddress(ensResolvedAddress)}
                  </span>
                  <button
                    className="ens-action-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(ensResolvedAddress);
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
                    href={`https://blockscan.com/address/${ensResolvedAddress}`}
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
              {ensError && (
                <div className="ens-status error">ENS name not found</div>
              )}
              {recipientEnsName && !isPotentialENSName(recipientAddress) && (
                <div className="ens-status resolved">
                  <span className="ens-resolved-name">{recipientEnsName}</span>
                </div>
              )}
            </div>

            <div className="form-group">
              <div className="amount-header">
                <label htmlFor="amount">Amount (USDC)</label>
                <button
                  className="max-btn"
                  onClick={handleMaxAmount}
                  disabled={isTransferring || !balances}
                  tabIndex={-1}
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
                parseFloat(transferAmount) <= 0 ||
                isResolvingENS ||
                (isPotentialENSName(recipientAddress) && !ensResolvedAddress)
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

          {/* Secondary Actions */}
          <div className="secondary-actions">
            <button
              className="btn btn-secondary-action"
              onClick={() => setShowWalletConnect(true)}
            >
              Connect
            </button>
            <a
              href={`https://slopwallet.com/${smartContractWallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary-action"
            >
              Advanced
            </a>
            <a
              href={`https://blockscan.com/address/${smartContractWallet}#transactions`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary-action"
            >
              History
            </a>
          </div>

          {/* Passkey Info */}
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

      {/* QR Code Modal */}
      {showQRModal && smartContractWallet && (
        <QRModal
          address={smartContractWallet}
          ensName={walletEnsName}
          usdcBalance={balances?.usdc.formatted ?? null}
          onClose={() => setShowQRModal(false)}
          onCopyAddress={copyAddress}
        />
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScannerModal
          onScan={(address) => {
            setRecipientAddress(address);
            setShowQRScanner(false);
          }}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Passkey Details Modal */}
      {showPasskeyDetails && credential && (
        <PasskeyDetailsModal
          credential={credential}
          onClose={() => setShowPasskeyDetails(false)}
        />
      )}

      {/* Success Toast */}
      {showSuccessToast && transferTxHash && (
        <SuccessToast txHash={transferTxHash} onDismiss={dismissSuccessToast} />
      )}

      {/* WalletConnect Provider (lazy loaded, stays mounted after first use) */}
      {(wcInitialized || showWalletConnect) &&
        credential &&
        smartContractWallet && (
          <Suspense
            fallback={
              showWalletConnect ? (
                <div className="modal-overlay">
                  <div className="modal wc-modal">
                    <div
                      className="modal-content"
                      style={{ textAlign: "center", padding: "48px" }}
                    >
                      <div className="spinner"></div>
                      <p style={{ marginTop: "16px", color: "#666" }}>
                        Loading WalletConnect...
                      </p>
                    </div>
                  </div>
                </div>
              ) : null
            }
          >
            <WalletConnectProvider
              smartWalletAddress={smartContractWallet}
              credential={credential}
              showModal={showWalletConnect}
              onCloseModal={() => setShowWalletConnect(false)}
              onInitialized={() => setWcInitialized(true)}
              onRequestReceived={() => setShowWalletConnect(true)}
            />
          </Suspense>
        )}
    </div>
  );
}

export default App;
