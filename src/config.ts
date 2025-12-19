// Passkey configuration - RP ID must match associated domain for iOS app
// Use the production domain when in Capacitor native app, otherwise use current hostname
export const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.();
export const PASSKEY_RP_ID = isNativeApp
  ? "reactapp-sigma-lyart.vercel.app" // Must match App.entitlements webcredentials
  : window.location.hostname;
export const PASSKEY_RP_NAME = "Slop Wallet Mobile";

// SlopWallet API configuration
export const SLOPWALLET_API = "https://slopwallet.com/api";
export const BASE_CHAIN_ID = 8453;

// WalletConnect configuration
export const WALLETCONNECT_PROJECT_ID =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || "";
export const SUPPORTED_CHAIN_IDS = [1, 8453]; // Ethereum Mainnet, Base
