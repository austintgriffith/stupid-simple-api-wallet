// Balance response interface
export interface BalanceResponse {
  address: string;
  balances: {
    eth: { raw: string; formatted: string; symbol: string; decimals: number };
    usdc: { raw: string; formatted: string; symbol: string; decimals: number };
  };
}

// Prepare transfer response interface
export interface PrepareTransferResponse {
  success: boolean;
  call: {
    target: string;
    value: string;
    data: string;
  };
  nonce: string;
  deadline: string;
  challengeHash: string;
}

// WebAuthn auth data for relay
export interface WebAuthnAuth {
  r: string;
  s: string;
  challengeIndex: string;
  typeIndex: string;
  authenticatorData: string;
  clientDataJSON: string;
}

export interface PasskeyCredential {
  id: string;
  rawId: string;
  publicKey?: string;
  qx?: string;
  qy?: string;
  createdAt: Date;
}
