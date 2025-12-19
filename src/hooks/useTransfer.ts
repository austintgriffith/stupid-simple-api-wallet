import { useState, useEffect, useCallback } from "react";
import { PASSKEY_RP_ID, SLOPWALLET_API, BASE_CHAIN_ID } from "../config";
import {
  BalanceResponse,
  PrepareTransferResponse,
  WebAuthnAuth,
  PasskeyCredential,
} from "../types";
import { parseAsn1Signature, normalizeS } from "../utils/crypto";

interface UseTransferOptions {
  credential: PasskeyCredential | null;
  smartContractWallet: string | undefined;
  balances: BalanceResponse["balances"] | null;
  onSuccess?: () => void;
}

export function useTransfer({
  credential,
  smartContractWallet,
  balances,
  onSuccess,
}: UseTransferOptions) {
  // Transfer state
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferStatus, setTransferStatus] = useState<string>("");
  const [transferTxHash, setTransferTxHash] = useState<string | null>(null);

  // Success toast state
  const [showSuccessToast, setShowSuccessToast] = useState<boolean>(false);

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

  const dismissSuccessToast = useCallback(() => {
    setShowSuccessToast(false);
    setTransferStatus("");
    setTransferTxHash(null);
  }, []);

  // Transfer USDC using 3-step API flow
  const handleTransfer = useCallback(
    async (finalRecipient: string) => {
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

        const prepareData: PrepareTransferResponse =
          await prepareResponse.json();
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
          onSuccess?.();
        } else {
          throw new Error(facilitateData.error || "Transaction failed");
        }
      } catch (error: any) {
        console.error("Transfer failed:", error);
        setTransferStatus(`✗ ${error.message || "Transfer failed"}`);
      } finally {
        setIsTransferring(false);
      }
    },
    [credential, smartContractWallet, transferAmount, onSuccess]
  );

  // Set max USDC amount
  const handleMaxAmount = useCallback(() => {
    if (balances?.usdc) {
      setTransferAmount(balances.usdc.formatted);
    }
  }, [balances]);

  // Reset transfer state (useful when logging out)
  const resetTransfer = useCallback(() => {
    setRecipientAddress("");
    setTransferAmount("");
    setTransferStatus("");
    setTransferTxHash(null);
    setShowSuccessToast(false);
  }, []);

  return {
    recipientAddress,
    setRecipientAddress,
    transferAmount,
    setTransferAmount,
    isTransferring,
    transferStatus,
    transferTxHash,
    handleTransfer,
    handleMaxAmount,
    showSuccessToast,
    dismissSuccessToast,
    resetTransfer,
  };
}
