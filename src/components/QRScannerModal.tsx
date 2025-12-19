import React, { useEffect, useRef, useState, useCallback } from "react";
import { isNativeApp } from "../config";
import { isPotentialENSName } from "../utils/ens";

// Capacitor ML Kit Barcode Scanner
import {
  BarcodeScanner,
  BarcodeFormat,
} from "@capacitor-mlkit/barcode-scanning";

// Web-based QR scanner
import { Html5Qrcode, CameraDevice } from "html5-qrcode";

interface QRScannerModalProps {
  onScan: (address: string) => void;
  onWalletConnect?: (uri: string) => void;
  onClose: () => void;
}

const CAMERA_STORAGE_KEY = "qr_scanner_preferred_camera";

// Validate if the scanned content is a valid Ethereum address, ENS name, or WalletConnect URI
function isValidScanResult(value: string): boolean {
  // Check for valid Ethereum address
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return true;
  }
  // Check for potential ENS name
  if (isPotentialENSName(value)) {
    return true;
  }
  // Check for ethereum: URI format (EIP-681)
  if (value.startsWith("ethereum:")) {
    const match = value.match(/^ethereum:(0x[a-fA-F0-9]{40})/);
    if (match) {
      return true;
    }
  }
  // Check for WalletConnect URI
  if (value.startsWith("wc:")) {
    return true;
  }
  return false;
}

// Extract address from scanned content (handles ethereum: URIs)
function extractAddress(value: string): string {
  if (value.startsWith("ethereum:")) {
    const match = value.match(/^ethereum:(0x[a-fA-F0-9]{40})/);
    if (match) {
      return match[1];
    }
  }
  return value;
}

export function QRScannerModal({
  onScan,
  onWalletConnect,
  onClose,
}: QRScannerModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [isLoadingCameras, setIsLoadingCameras] = useState(true);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [useWebScanner, setUseWebScanner] = useState(!isNativeApp);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isScannerRunningRef = useRef(false);
  const scannerContainerId = "qr-scanner-container";

  // Ref to always access the latest onWalletConnect callback
  // This prevents stale closure issues in async native scanner flow
  const onWalletConnectRef = useRef(onWalletConnect);

  // Keep ref synced with prop
  useEffect(() => {
    onWalletConnectRef.current = onWalletConnect;
  }, [onWalletConnect]);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Handle successful scan
  const handleScanSuccess = useCallback(
    (scannedValue: string) => {
      // Check for WalletConnect URI first
      if (scannedValue.startsWith("wc:")) {
        // Use ref to access latest callback, avoiding stale closure in async native scanner
        if (onWalletConnectRef.current) {
          onWalletConnectRef.current(scannedValue);
          onClose();
        } else {
          setError(
            "WalletConnect QR code detected, but WalletConnect is not available."
          );
        }
        return;
      }

      if (isValidScanResult(scannedValue)) {
        const address = extractAddress(scannedValue);
        onScan(address);
        onClose();
      } else {
        setError(
          "Invalid QR code. Please scan a valid Ethereum address or ENS name."
        );
      }
    },
    [onScan, onClose]
  );

  // Enumerate available cameras (web scanner)
  useEffect(() => {
    if (!useWebScanner) {
      setIsLoadingCameras(false);
      return;
    }

    Html5Qrcode.getCameras()
      .then((devices) => {
        setCameras(devices);

        // Check for saved camera preference
        const savedCameraId = localStorage.getItem(CAMERA_STORAGE_KEY);
        const savedCamera = savedCameraId
          ? devices.find((d) => d.id === savedCameraId)
          : null;

        if (savedCamera) {
          // Use saved preference if camera is still available
          setSelectedCameraId(savedCamera.id);
        } else {
          // Fall back to back camera if available, otherwise first camera
          const backCamera = devices.find(
            (d) =>
              d.label.toLowerCase().includes("back") ||
              d.label.toLowerCase().includes("rear") ||
              d.label.toLowerCase().includes("environment")
          );
          setSelectedCameraId(backCamera?.id || devices[0]?.id || null);
        }

        setIsLoadingCameras(false);
      })
      .catch((err) => {
        console.error("Failed to enumerate cameras:", err);
        setError("Failed to access cameras. Please grant camera permission.");
        setIsLoadingCameras(false);
      });
  }, [useWebScanner]);

  // Native scanning using Capacitor ML Kit
  const startNativeScan = async () => {
    try {
      setIsScanning(true);
      setError(null);

      // Check and request permissions
      const { camera } = await BarcodeScanner.checkPermissions();
      if (camera !== "granted") {
        const { camera: newPermission } =
          await BarcodeScanner.requestPermissions();
        if (newPermission !== "granted") {
          setError("Camera permission is required to scan QR codes");
          setIsScanning(false);
          return;
        }
      }

      // Start scanning
      const result = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
      });

      if (result.barcodes.length > 0) {
        const scannedValue = result.barcodes[0].rawValue;
        if (scannedValue) {
          handleScanSuccess(scannedValue);
        }
      }
    } catch (err: any) {
      console.error("Native scan error:", err);

      // If native plugin isn't implemented, fall back to web scanner
      if (
        err?.message?.includes("not implemented") ||
        err?.message?.includes("not available")
      ) {
        console.log(
          "Native scanner not available, falling back to web scanner"
        );
        setUseWebScanner(true);
        setIsScanning(false);
        return;
      }

      setError(err.message || "Failed to scan QR code");
    } finally {
      setIsScanning(false);
    }
  };

  // Stop the current scanner safely
  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current && isScannerRunningRef.current) {
      isScannerRunningRef.current = false;
      try {
        await html5QrCodeRef.current.stop();
      } catch (e: any) {
        // Ignore AbortError and other stop errors - these are expected during camera switches
        if (e?.name !== "AbortError") {
          console.log("Scanner stop (expected):", e?.message);
        }
      }
    }
  }, []);

  // Initialize scanner instance once
  useEffect(() => {
    if (!useWebScanner || isLoadingCameras) return;

    // Create instance once DOM is ready
    const timeout = setTimeout(() => {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
      }
    }, 50);

    return () => {
      clearTimeout(timeout);
      // Cleanup on unmount
      if (html5QrCodeRef.current) {
        if (isScannerRunningRef.current) {
          html5QrCodeRef.current.stop().catch(() => {});
        }
        html5QrCodeRef.current = null;
      }
    };
  }, [useWebScanner, isLoadingCameras]);

  // Web scanning using html5-qrcode
  const startWebScan = useCallback(
    async (cameraId: string) => {
      if (!cameraId) {
        setError("No camera available");
        return;
      }

      // Wait for instance to be created
      if (!html5QrCodeRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!html5QrCodeRef.current) {
          html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
        }
      }

      try {
        // Stop if already running
        if (isScannerRunningRef.current) {
          await stopScanner();
          // Wait for camera to fully release
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        setIsScanning(true);
        setError(null);

        await html5QrCodeRef.current.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // Stop scanning before processing result
            if (html5QrCodeRef.current && isScannerRunningRef.current) {
              isScannerRunningRef.current = false;
              html5QrCodeRef.current.stop().catch(() => {});
              handleScanSuccess(decodedText);
            }
          },
          () => {
            // QR code not found in frame - this is expected
          }
        );

        isScannerRunningRef.current = true;
      } catch (err: any) {
        // Ignore AbortError - it's expected during camera switches
        if (err?.name === "AbortError") {
          return;
        }
        console.error("Web scan error:", err);
        setError(
          err.message ||
            "Failed to start camera. Please ensure camera permissions are granted."
        );
        setIsScanning(false);
      }
    },
    [stopScanner, handleScanSuccess]
  );

  // Handle camera change - full teardown and reinitialize for iOS compatibility
  const handleCameraChange = async (newCameraId: string) => {
    if (newCameraId === selectedCameraId) return;

    // Save preference to localStorage
    localStorage.setItem(CAMERA_STORAGE_KEY, newCameraId);

    setIsSwitchingCamera(true);
    setSelectedCameraId(newCameraId);

    try {
      // Full teardown - stop and destroy instance
      if (html5QrCodeRef.current) {
        if (isScannerRunningRef.current) {
          isScannerRunningRef.current = false;
          try {
            await html5QrCodeRef.current.stop();
          } catch (e) {
            // Ignore stop errors
          }
        }
        // Destroy the instance completely
        html5QrCodeRef.current = null;
      }

      // Longer delay for iOS to fully release the camera
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create fresh instance
      html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);

      // Start with new camera
      setError(null);
      await html5QrCodeRef.current.start(
        newCameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          if (html5QrCodeRef.current && isScannerRunningRef.current) {
            isScannerRunningRef.current = false;
            html5QrCodeRef.current.stop().catch(() => {});
            handleScanSuccess(decodedText);
          }
        },
        () => {}
      );
      isScannerRunningRef.current = true;
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Camera switch error:", err);
        setError("Failed to switch camera. Please try again.");
      }
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  // Start scanning based on platform (initial start only)
  useEffect(() => {
    if (!useWebScanner) {
      // Try native scanner first
      startNativeScan();
      return;
    }

    // Wait for cameras to be loaded and selected
    if (isLoadingCameras || !selectedCameraId) {
      return;
    }

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      startWebScan(selectedCameraId);
    }, 150);

    return () => {
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useWebScanner, isLoadingCameras, selectedCameraId]);

  // Handle close and cleanup
  const handleClose = useCallback(async () => {
    if (html5QrCodeRef.current && isScannerRunningRef.current) {
      isScannerRunningRef.current = false;
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        // Ignore errors on close
      }
    }
    onClose();
  }, [onClose]);

  // For native apps (when web scanner not needed), show loading state while native scanner is active
  if (!useWebScanner) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div
          className="modal qr-scanner-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h3>Scan QR Code</h3>
            <button className="modal-close" onClick={handleClose}>
              ×
            </button>
          </div>
          <div className="modal-content scanner-content">
            {isScanning ? (
              <div className="scanner-loading">
                <div className="spinner"></div>
                <p>Opening camera...</p>
              </div>
            ) : error ? (
              <div className="scanner-error">
                <p>{error}</p>
                <button className="btn btn-secondary" onClick={startNativeScan}>
                  Try Again
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Web scanner modal with camera viewfinder
  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal qr-scanner-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Scan QR Code</h3>
          <button className="modal-close" onClick={handleClose}>
            ×
          </button>
        </div>
        <div className="modal-content scanner-content">
          {isLoadingCameras ? (
            <div className="scanner-loading">
              <div className="spinner"></div>
              <p>Detecting cameras...</p>
            </div>
          ) : error ? (
            <div className="scanner-error">
              <p>{error}</p>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  selectedCameraId && startWebScan(selectedCameraId)
                }
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {cameras.length > 1 && (
                <div className="camera-selector">
                  <label htmlFor="camera-select">Camera:</label>
                  <select
                    id="camera-select"
                    value={selectedCameraId || ""}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="camera-select"
                    disabled={isSwitchingCamera}
                  >
                    {cameras.map((camera) => (
                      <option key={camera.id} value={camera.id}>
                        {camera.label || `Camera ${camera.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="scanner-viewfinder">
                {isSwitchingCamera && (
                  <div className="scanner-switching">
                    <div className="spinner"></div>
                  </div>
                )}
                <div id={scannerContainerId}></div>
              </div>
              <p className="scanner-hint">
                Point your camera at a QR code containing an Ethereum address
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
