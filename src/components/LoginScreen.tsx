import React from "react";

interface LoginScreenProps {
  onGenerate: () => void;
  onConnect: () => void;
  isLoading: boolean;
  status: string;
}

export function LoginScreen({
  onGenerate,
  onConnect,
  isLoading,
  status,
}: LoginScreenProps) {
  return (
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
          onClick={onGenerate}
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
          onClick={onConnect}
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
  );
}
