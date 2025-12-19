import React, { useState, useRef, Suspense, lazy } from "react";
import "./App.css";

// Config
import { isNativeApp } from "./config";

// Hooks
import { usePasskey } from "./hooks/usePasskey";
import { useBalances } from "./hooks/useBalances";
import { useTransfer } from "./hooks/useTransfer";
import { useENSResolution, useReverseENS } from "./hooks/useENSResolution";

// Components
import { WalletBanner } from "./components/WalletBanner";
import { BalanceCard } from "./components/BalanceCard";
import { TransferForm } from "./components/TransferForm";
import { LoginScreen } from "./components/LoginScreen";
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
  const smartContractWallet = process.env.REACT_APP_SMART_CONTRACT_WALLET;

  // Passkey hook
  const {
    credential,
    isLoading: isPasskeyLoading,
    status: passkeyStatus,
    generatePasskey,
    connectPasskey,
    logout: passkeyLogout,
  } = usePasskey({ smartContractWallet });

  // Balances hook
  const {
    balances,
    isLoading: isLoadingBalance,
    refresh: refreshBalances,
  } = useBalances({
    walletAddress: smartContractWallet,
    enabled: !!credential,
  });

  // Transfer hook
  const transfer = useTransfer({
    credential,
    smartContractWallet,
    balances,
    onSuccess: refreshBalances,
  });

  // ENS resolution for recipient
  const recipientENS = useENSResolution(transfer.recipientAddress);

  // Reverse ENS for wallet address
  const walletEnsName = useReverseENS(smartContractWallet);

  // UI State
  const [copied, setCopied] = useState<boolean>(false);
  const [showPasskeyDetails, setShowPasskeyDetails] = useState<boolean>(false);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [showQRScanner, setShowQRScanner] = useState<boolean>(false);
  const [showWalletConnect, setShowWalletConnect] = useState<boolean>(false);
  const [wcInitialized, setWcInitialized] = useState<boolean>(false);
  const [pendingWcUri, setPendingWcUri] = useState<string | null>(null);

  // Ref for amount input to focus after scanning
  const amountInputRef = useRef<HTMLInputElement>(null);

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const logout = () => {
    passkeyLogout();
    transfer.resetTransfer();
  };

  return (
    <div className={`App${isNativeApp ? " native-app" : ""}`}>
      {smartContractWallet && (
        <WalletBanner
          address={smartContractWallet}
          ensName={walletEnsName}
          copied={copied}
          onCopy={() => copyAddress(smartContractWallet)}
          onShowQR={() => setShowQRModal(true)}
        />
      )}

      {credential ? (
        <div className="container logged-in-container">
          {/* Balance Card */}
          <BalanceCard balances={balances} isLoading={isLoadingBalance} />

          {/* Transfer Form */}
          <TransferForm
            recipientAddress={transfer.recipientAddress}
            setRecipientAddress={transfer.setRecipientAddress}
            transferAmount={transfer.transferAmount}
            setTransferAmount={transfer.setTransferAmount}
            ens={recipientENS}
            isTransferring={transfer.isTransferring}
            transferStatus={transfer.transferStatus}
            showSuccessToast={transfer.showSuccessToast}
            balances={balances}
            onTransfer={transfer.handleTransfer}
            onMaxAmount={transfer.handleMaxAmount}
            onScanQR={() => setShowQRScanner(true)}
            amountInputRef={amountInputRef}
          />

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
        <LoginScreen
          onGenerate={generatePasskey}
          onConnect={connectPasskey}
          isLoading={isPasskeyLoading}
          status={passkeyStatus}
        />
      )}

      {/* Floating Scan Button */}
      {credential && (
        <button
          className="fab-scan"
          onClick={() => setShowQRScanner(true)}
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
            transfer.setRecipientAddress(address);
            setShowQRScanner(false);
            // Focus amount input after modal closes
            setTimeout(() => amountInputRef.current?.focus(), 100);
          }}
          onWalletConnect={(uri) => {
            setPendingWcUri(uri);
            setShowWalletConnect(true);
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
      {transfer.showSuccessToast && transfer.transferTxHash && (
        <SuccessToast
          txHash={transfer.transferTxHash}
          onDismiss={transfer.dismissSuccessToast}
        />
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
              pendingUri={pendingWcUri}
              onPendingUriConsumed={() => setPendingWcUri(null)}
            />
          </Suspense>
        )}
    </div>
  );
}

export default App;
