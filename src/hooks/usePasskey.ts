import { useState, useEffect, useCallback } from "react";
import { PASSKEY_RP_ID, PASSKEY_RP_NAME, SLOPWALLET_API } from "../config";
import { PasskeyCredential } from "../types";
import {
  generateRandomBytes,
  bufferToBase64url,
  parseAsn1Signature,
  extractPublicKeyFromSpki,
} from "../utils/crypto";

interface UsePasskeyOptions {
  smartContractWallet?: string;
}

export function usePasskey({ smartContractWallet }: UsePasskeyOptions = {}) {
  const [credential, setCredential] = useState<PasskeyCredential | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  const generatePasskey = useCallback(async () => {
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
  }, []);

  const connectPasskey = useCallback(async () => {
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
  }, [smartContractWallet]);

  const logout = useCallback(() => {
    localStorage.removeItem("passkey_credential_id");
    localStorage.removeItem("passkey_raw_id");
    localStorage.removeItem("passkey_qx");
    localStorage.removeItem("passkey_qy");
    setCredential(null);
    setStatus("");
  }, []);

  return {
    credential,
    isLoading,
    status,
    generatePasskey,
    connectPasskey,
    logout,
  };
}
