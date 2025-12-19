import React, { useEffect } from "react";
import { useWalletConnect } from "../hooks/useWalletConnect";
import { WalletConnectModal } from "./WalletConnectModal";
import { PasskeyCredential } from "../types";

interface WalletConnectProviderProps {
  smartWalletAddress: string;
  credential: PasskeyCredential;
  showModal: boolean;
  onCloseModal: () => void;
  onInitialized: () => void;
  onRequestReceived: () => void;
  pendingUri?: string | null;
  onPendingUriConsumed?: () => void;
}

export function WalletConnectProvider({
  smartWalletAddress,
  credential,
  showModal,
  onCloseModal,
  onInitialized,
  onRequestReceived,
  pendingUri,
  onPendingUriConsumed,
}: WalletConnectProviderProps) {
  // Initialize WalletConnect - this stays alive even when modal is closed
  const wcState = useWalletConnect({
    smartWalletAddress,
    enabled: true,
  });

  // Signal App that WC is initialized (called once)
  useEffect(() => {
    if (wcState.isReady) {
      onInitialized();
    }
  }, [wcState.isReady, onInitialized]);

  // Signal App when new requests arrive (to auto-open modal)
  useEffect(() => {
    if (wcState.sessionRequests.length > 0) {
      onRequestReceived();
    }
  }, [wcState.sessionRequests.length, onRequestReceived]);

  // Only render modal UI when showModal is true
  // The WalletConnect connection stays alive regardless
  if (!showModal) {
    return null;
  }

  return (
    <WalletConnectModal
      smartWalletAddress={smartWalletAddress}
      credential={credential}
      onClose={onCloseModal}
      wcState={wcState}
      pendingUri={pendingUri}
      onPendingUriConsumed={onPendingUriConsumed}
    />
  );
}
