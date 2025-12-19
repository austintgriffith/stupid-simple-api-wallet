import { useCallback, useEffect, useRef, useState } from "react";
import { WalletKit, WalletKitTypes } from "@reown/walletkit";
import { Core } from "@walletconnect/core";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import { WALLETCONNECT_PROJECT_ID, SUPPORTED_CHAIN_IDS } from "../config";

// Type for WalletKit instance
type WalletKitInstance = Awaited<ReturnType<typeof WalletKit.init>>;

// Supported methods for WalletConnect
const SUPPORTED_METHODS = [
  "eth_sendTransaction",
  "wallet_sendCalls",
  "wallet_getCapabilities",
  "wallet_getCallsStatus",
  "eth_accounts",
  "eth_requestAccounts",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
];

// Supported events
const SUPPORTED_EVENTS = ["accountsChanged", "chainChanged"];

export interface CallParams {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
}

export interface SessionRequest {
  id: number;
  topic: string;
  method: string;
  chainId: string;
  params: CallParams;
  calls?: CallParams[];
  batchId?: string;
  timestamp: number;
  peerMeta?: {
    name: string;
    description?: string;
    url?: string;
    icons?: string[];
  };
}

export interface BatchCallStatus {
  batchId: string;
  chainId: string;
  status: number;
  atomic: boolean;
  txHash?: string;
  receipts?: {
    logs: { address: string; data: string; topics: string[] }[];
    status: string;
    blockHash: string;
    blockNumber: string;
    gasUsed: string;
    transactionHash: string;
  }[];
}

export interface ActiveSession {
  topic: string;
  peerMeta: {
    name: string;
    description?: string;
    url?: string;
    icons?: string[];
  };
  expiry: number;
}

type ConnectionStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "pairing"
  | "connected"
  | "error";

interface UseWalletConnectOptions {
  smartWalletAddress: string;
  enabled?: boolean;
}

export const useWalletConnect = ({
  smartWalletAddress,
  enabled = true,
}: UseWalletConnectOptions) => {
  const [walletKit, setWalletKit] = useState<WalletKitInstance | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionRequests, setSessionRequests] = useState<SessionRequest[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);

  const initializingRef = useRef(false);
  const walletKitRef = useRef<WalletKitInstance | null>(null);
  const batchStatusesRef = useRef<Map<string, BatchCallStatus>>(new Map());

  // Initialize WalletKit
  useEffect(() => {
    if (!enabled || !smartWalletAddress || initializingRef.current) return;
    if (!WALLETCONNECT_PROJECT_ID) {
      setError("WalletConnect project ID not configured");
      setStatus("error");
      return;
    }

    const initWalletKit = async () => {
      initializingRef.current = true;
      setStatus("initializing");
      setError(null);

      try {
        const core = new Core({
          projectId: WALLETCONNECT_PROJECT_ID,
        });

        const kit = await WalletKit.init({
          core,
          metadata: {
            name: "Slop Wallet",
            description: "Smart Contract Wallet with Passkey",
            url:
              typeof window !== "undefined"
                ? window.location.origin
                : "https://localhost:3000",
            icons: [],
          },
        });

        walletKitRef.current = kit;
        setWalletKit(kit);
        setStatus("ready");

        // Load existing sessions
        const sessions = kit.getActiveSessions();
        const activeSessionsList: ActiveSession[] = Object.values(sessions).map(
          (session) => ({
            topic: session.topic,
            peerMeta: session.peer.metadata,
            expiry: session.expiry,
          })
        );
        setActiveSessions(activeSessionsList);

        if (activeSessionsList.length > 0) {
          setStatus("connected");
        }
      } catch (err) {
        console.error("Failed to initialize WalletKit:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to initialize WalletConnect"
        );
        setStatus("error");
      } finally {
        initializingRef.current = false;
      }
    };

    initWalletKit();
  }, [enabled, smartWalletAddress]);

  // Set up event listeners
  useEffect(() => {
    if (!walletKit || !smartWalletAddress) return;

    // Handle session proposals - auto approve
    const handleSessionProposal = async (
      proposal: WalletKitTypes.SessionProposal
    ) => {
      const { id, params } = proposal;

      console.log(
        "WalletConnect session proposal from:",
        params.proposer?.metadata?.name || "Unknown"
      );

      try {
        const ourSupportedNamespaces = {
          eip155: {
            chains: SUPPORTED_CHAIN_IDS.map((chainId) => `eip155:${chainId}`),
            methods: SUPPORTED_METHODS,
            events: SUPPORTED_EVENTS,
            accounts: SUPPORTED_CHAIN_IDS.map(
              (chainId) => `eip155:${chainId}:${smartWalletAddress}`
            ),
          },
        };
        const approvedNamespaces = buildApprovedNamespaces({
          proposal: params,
          supportedNamespaces: ourSupportedNamespaces,
        });

        const session = await walletKit.approveSession({
          id,
          namespaces: approvedNamespaces,
        });

        console.log("WalletConnect session approved:", session.topic);

        setActiveSessions((prev) => [
          ...prev,
          {
            topic: session.topic,
            peerMeta: session.peer.metadata,
            expiry: session.expiry,
          },
        ]);
        setStatus("connected");
      } catch (err) {
        console.error("Failed to approve session:", err);

        try {
          await walletKit.rejectSession({
            id,
            reason: getSdkError("USER_REJECTED"),
          });
        } catch (rejectErr) {
          console.error("Failed to reject session:", rejectErr);
        }

        setError(
          err instanceof Error ? err.message : "Failed to approve session"
        );
      }
    };

    // Handle session requests
    const handleSessionRequest = async (
      event: WalletKitTypes.SessionRequest
    ) => {
      const { id, topic, params } = event;
      const { request, chainId } = params;

      console.log(`WalletConnect request: ${request.method}`);

      // Handle wallet_getCapabilities - auto-respond
      if (request.method === "wallet_getCapabilities") {
        const capabilities: Record<string, Record<string, unknown>> = {};
        for (const supportedChainId of SUPPORTED_CHAIN_IDS) {
          const hexChainId = `0x${supportedChainId.toString(16)}`;
          capabilities[hexChainId] = {
            atomic: { status: "supported" },
          };
        }

        try {
          await walletKit.respondSessionRequest({
            topic,
            response: { id, result: capabilities, jsonrpc: "2.0" as const },
          });
        } catch (err) {
          console.error("Failed to send wallet_getCapabilities response:", err);
        }
        return;
      }

      // Handle wallet_getCallsStatus
      if (request.method === "wallet_getCallsStatus") {
        const batchId = request.params?.[0];
        const batchStatus = batchStatusesRef.current.get(batchId);

        if (!batchStatus) {
          try {
            await walletKit.respondSessionRequest({
              topic,
              response: {
                id,
                jsonrpc: "2.0" as const,
                error: { code: 5730, message: "Unknown batch id" },
              },
            });
          } catch (err) {
            console.error("Failed to send error response:", err);
          }
          return;
        }

        const statusResponse = {
          version: "2.0.0",
          id: batchStatus.batchId,
          chainId: batchStatus.chainId,
          status: batchStatus.status,
          atomic: batchStatus.atomic,
          ...(batchStatus.receipts && { receipts: batchStatus.receipts }),
        };

        try {
          await walletKit.respondSessionRequest({
            topic,
            response: { id, result: statusResponse, jsonrpc: "2.0" as const },
          });
        } catch (err) {
          console.error("Failed to send wallet_getCallsStatus response:", err);
        }
        return;
      }

      // Handle eth_accounts and eth_requestAccounts
      if (
        request.method === "eth_accounts" ||
        request.method === "eth_requestAccounts"
      ) {
        try {
          await walletKit.respondSessionRequest({
            topic,
            response: {
              id,
              result: [smartWalletAddress],
              jsonrpc: "2.0" as const,
            },
          });
        } catch (err) {
          console.error(`Failed to send ${request.method} response:`, err);
        }
        return;
      }

      // Get peer metadata
      const sessions = walletKit.getActiveSessions();
      const session = sessions[topic];
      const peerMeta = session?.peer?.metadata;

      // Parse request params
      let requestParams = request.params;
      if (Array.isArray(requestParams)) {
        requestParams = requestParams[0] || {};
      }

      // Handle wallet_sendCalls (EIP-5792)
      if (request.method === "wallet_sendCalls") {
        const calls: CallParams[] = (requestParams?.calls || []).map(
          (call: { to?: string; value?: string; data?: string }) => ({
            to: call.to,
            value: call.value,
            data: call.data,
          })
        );

        const batchId = `0x${Date.now()
          .toString(16)
          .padStart(16, "0")}${Math.random()
          .toString(16)
          .slice(2)
          .padStart(48, "0")}`;
        const requestChainId = requestParams?.chainId || chainId;

        const sessionRequest: SessionRequest = {
          id,
          topic,
          method: request.method,
          chainId: requestChainId,
          params: { from: requestParams?.from },
          calls,
          batchId,
          timestamp: Date.now(),
          peerMeta,
        };

        const initialStatus: BatchCallStatus = {
          batchId,
          chainId: requestChainId,
          status: 100,
          atomic: true,
        };

        batchStatusesRef.current.set(batchId, initialStatus);
        setSessionRequests((prev) => [...prev, sessionRequest]);

        // Respond with batch ID immediately
        try {
          await walletKit.respondSessionRequest({
            topic,
            response: {
              id,
              result: { id: batchId },
              jsonrpc: "2.0" as const,
            },
          });
        } catch (err) {
          console.error("Failed to send wallet_sendCalls response:", err);
        }
        return;
      }

      // Handle signing methods - queue for user approval
      if (
        [
          "personal_sign",
          "eth_sign",
          "eth_signTypedData",
          "eth_signTypedData_v4",
        ].includes(request.method)
      ) {
        const sessionRequest: SessionRequest = {
          id,
          topic,
          method: request.method,
          chainId,
          params: requestParams,
          timestamp: Date.now(),
          peerMeta,
        };

        setSessionRequests((prev) => [...prev, sessionRequest]);
        return;
      }

      // Standard eth_sendTransaction handling
      if (request.method === "eth_sendTransaction") {
        const sessionRequest: SessionRequest = {
          id,
          topic,
          method: request.method,
          chainId,
          params: {
            from: requestParams?.from,
            to: requestParams?.to,
            value: requestParams?.value,
            data: requestParams?.data,
            gas: requestParams?.gas || requestParams?.gasLimit,
            gasPrice: requestParams?.gasPrice,
          },
          timestamp: Date.now(),
          peerMeta,
        };

        setSessionRequests((prev) => [...prev, sessionRequest]);
      }
    };

    // Handle session deletions
    const handleSessionDelete = (event: { topic: string }) => {
      console.log("Session deleted:", event);
      setActiveSessions((prev) => prev.filter((s) => s.topic !== event.topic));
      setSessionRequests((prev) => prev.filter((r) => r.topic !== event.topic));

      const sessions = walletKit.getActiveSessions();
      if (Object.keys(sessions).length === 0) {
        setStatus("ready");
      }
    };

    walletKit.on("session_proposal", handleSessionProposal);
    walletKit.on("session_request", handleSessionRequest);
    walletKit.on("session_delete", handleSessionDelete);

    return () => {
      walletKit.off("session_proposal", handleSessionProposal);
      walletKit.off("session_request", handleSessionRequest);
      walletKit.off("session_delete", handleSessionDelete);
    };
  }, [walletKit, smartWalletAddress]);

  // Pair with a dApp using WC URI
  const pair = useCallback(
    async (uri: string) => {
      if (!walletKit) {
        setError("WalletConnect not initialized");
        return;
      }

      if (!uri.startsWith("wc:")) {
        setError("Invalid WalletConnect URI");
        return;
      }

      setStatus("pairing");
      setError(null);

      try {
        await walletKit.pair({ uri });
      } catch (err) {
        console.error("Failed to pair:", err);
        setError(err instanceof Error ? err.message : "Failed to connect");
        setStatus(activeSessions.length > 0 ? "connected" : "ready");
      }
    },
    [walletKit, activeSessions.length]
  );

  // Disconnect a session
  const disconnect = useCallback(
    async (topic: string) => {
      if (!walletKit) return;

      try {
        await walletKit.disconnectSession({
          topic,
          reason: getSdkError("USER_DISCONNECTED"),
        });

        setActiveSessions((prev) => prev.filter((s) => s.topic !== topic));
        setSessionRequests((prev) => prev.filter((r) => r.topic !== topic));

        const sessions = walletKit.getActiveSessions();
        if (Object.keys(sessions).length === 0) {
          setStatus("ready");
        }
      } catch (err) {
        console.error("Failed to disconnect:", err);
      }
    },
    [walletKit]
  );

  // Disconnect all sessions
  const disconnectAll = useCallback(async () => {
    if (!walletKit) return;

    const sessions = walletKit.getActiveSessions();
    for (const topic of Object.keys(sessions)) {
      try {
        await walletKit.disconnectSession({
          topic,
          reason: getSdkError("USER_DISCONNECTED"),
        });
      } catch (err) {
        console.error("Failed to disconnect session:", topic, err);
      }
    }

    setActiveSessions([]);
    setSessionRequests([]);
    setStatus("ready");
  }, [walletKit]);

  // Clear a session request
  const clearRequest = useCallback((requestId: number) => {
    setSessionRequests((prev) => prev.filter((r) => r.id !== requestId));
  }, []);

  // Approve a request with a result
  const approveRequest = useCallback(
    async (requestId: number, topic: string, result: string) => {
      if (!walletKit) return;

      try {
        const response = { id: requestId, result, jsonrpc: "2.0" as const };
        await walletKit.respondSessionRequest({ topic, response });
        console.log("Request approved, response sent:", result);
        setSessionRequests((prev) => prev.filter((r) => r.id !== requestId));
      } catch (err) {
        console.error("Failed to send approval response:", err);
        throw err;
      }
    },
    [walletKit]
  );

  // Reject a request
  const rejectRequest = useCallback(
    async (requestId: number, topic: string) => {
      if (!walletKit) return;

      try {
        const response = {
          id: requestId,
          jsonrpc: "2.0" as const,
          error: { code: 5000, message: "User rejected." },
        };
        await walletKit.respondSessionRequest({ topic, response });
        console.log("Request rejected");
        setSessionRequests((prev) => prev.filter((r) => r.id !== requestId));
      } catch (err) {
        console.error("Failed to send rejection response:", err);
        throw err;
      }
    },
    [walletKit]
  );

  // Update batch status
  const updateBatchStatus = useCallback(
    (batchId: string, updates: Partial<BatchCallStatus>) => {
      const current = batchStatusesRef.current.get(batchId);
      if (!current) return;

      const updated = { ...current, ...updates };
      batchStatusesRef.current.set(batchId, updated);
    },
    []
  );

  return {
    status,
    error,
    pair,
    disconnect,
    disconnectAll,
    sessionRequests,
    activeSessions,
    clearRequest,
    approveRequest,
    rejectRequest,
    updateBatchStatus,
    isReady: status === "ready" || status === "connected",
    isConnected: status === "connected",
  };
};
