import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";

// Helper to generate random bytes
export function generateRandomBytes(length: number): ArrayBuffer {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array.buffer as ArrayBuffer;
}

// Helper to convert ArrayBuffer to base64url string
export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Parse ASN.1 DER signature to extract r and s values
export function parseAsn1Signature(signature: ArrayBuffer): {
  r: bigint;
  s: bigint;
} {
  const bytes = new Uint8Array(signature);
  let offset = 0;

  // Check for SEQUENCE tag (0x30)
  if (bytes[offset++] !== 0x30) {
    throw new Error("Invalid ASN.1 signature: expected SEQUENCE");
  }

  // Skip sequence length
  let seqLen = bytes[offset++];
  if (seqLen & 0x80) {
    offset += seqLen & 0x7f;
  }

  // Parse r INTEGER
  if (bytes[offset++] !== 0x02) {
    throw new Error("Invalid ASN.1 signature: expected INTEGER for r");
  }
  let rLen = bytes[offset++];
  let rBytes = bytes.slice(offset, offset + rLen);
  offset += rLen;
  // Remove leading zero if present (for positive number representation)
  if (rBytes[0] === 0x00 && rBytes.length > 32) {
    rBytes = rBytes.slice(1);
  }

  // Parse s INTEGER
  if (bytes[offset++] !== 0x02) {
    throw new Error("Invalid ASN.1 signature: expected INTEGER for s");
  }
  let sLen = bytes[offset++];
  let sBytes = bytes.slice(offset, offset + sLen);
  // Remove leading zero if present
  if (sBytes[0] === 0x00 && sBytes.length > 32) {
    sBytes = sBytes.slice(1);
  }

  // Pad to 32 bytes if needed
  const rPadded = new Uint8Array(32);
  const sPadded = new Uint8Array(32);
  rPadded.set(rBytes, 32 - rBytes.length);
  sPadded.set(sBytes, 32 - sBytes.length);

  const r = BigInt(
    "0x" +
      Array.from(rPadded)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
  );
  const s = BigInt(
    "0x" +
      Array.from(sPadded)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
  );

  return { r, s };
}

// Normalize s value to low-s form (required by secp256r1)
export function normalizeS(s: bigint): bigint {
  const curveOrder = BigInt(
    "0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551"
  );
  const halfOrder = curveOrder / BigInt(2);
  return s > halfOrder ? curveOrder - s : s;
}

// Extract public key coordinates from SPKI format (what getPublicKey() returns)
export function extractPublicKeyFromSpki(spkiKey: ArrayBuffer): {
  qx: `0x${string}`;
  qy: `0x${string}`;
} {
  const bytes = new Uint8Array(spkiKey);

  // SPKI format for EC P-256:
  // - ASN.1 header (variable length, typically 26-27 bytes)
  // - 0x04 (uncompressed point indicator)
  // - X coordinate (32 bytes)
  // - Y coordinate (32 bytes)
  // Total: header + 65 bytes for the point

  // The last 65 bytes contain: 0x04 + X (32) + Y (32)
  if (bytes.length < 65) {
    throw new Error("SPKI key too short");
  }

  // Find the uncompressed point marker (0x04) followed by 64 bytes
  let pointStart = -1;
  for (let i = 0; i < bytes.length - 64; i++) {
    if (bytes[i] === 0x04) {
      // Verify this looks like a valid position (near the end)
      if (bytes.length - i === 65) {
        pointStart = i;
        break;
      }
    }
  }

  if (pointStart === -1) {
    // Fallback: assume last 64 bytes are X and Y (without 0x04 marker)
    // This can happen with some key formats
    const qx = bytes.slice(bytes.length - 64, bytes.length - 32);
    const qy = bytes.slice(bytes.length - 32);

    return {
      qx: ("0x" +
        Array.from(qx)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")) as `0x${string}`,
      qy: ("0x" +
        Array.from(qy)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")) as `0x${string}`,
    };
  }

  // Skip 0x04 marker and extract X and Y
  const qx = bytes.slice(pointStart + 1, pointStart + 33);
  const qy = bytes.slice(pointStart + 33, pointStart + 65);

  return {
    qx: ("0x" +
      Array.from(qx)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`,
    qy: ("0x" +
      Array.from(qy)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`,
  };
}

// Convert base64url string to Uint8Array
function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Convert bytes to hex string
function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ("0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;
}

// Derive PRF output using WebAuthn PRF extension
export async function derivePrfOutput(
  credentialRawId: string,
  salt: string = "ethereum-key-derivation-v1"
): Promise<Uint8Array> {
  // Convert credential ID from base64url to bytes
  const credentialId = base64urlToBytes(credentialRawId);

  // Create salt from fixed string
  const encoder = new TextEncoder();
  const saltBytes = encoder.encode(salt);

  // Get rpId from current hostname
  const rpId = window.location.hostname;

  // Perform WebAuthn authentication with PRF extension
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId,
      allowCredentials: [
        {
          type: "public-key",
          id: credentialId,
        },
      ],
      userVerification: "required",
      extensions: {
        // @ts-expect-error PRF extension not in standard TypeScript types yet
        prf: {
          eval: {
            first: saltBytes,
          },
        },
      },
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("Authentication cancelled");
  }

  // Extract PRF result from extension outputs
  const extensionResults = assertion.getClientExtensionResults() as {
    prf?: {
      results?: {
        first?: ArrayBuffer;
      };
    };
  };

  if (!extensionResults.prf?.results?.first) {
    throw new Error(
      "PRF extension not supported by this passkey or browser. " +
        "PRF requires Chrome 116+, Safari 17.4+, or Firefox 122+."
    );
  }

  return new Uint8Array(extensionResults.prf.results.first);
}

// Convert PRF output to Ethereum private key and derive address
export function prfOutputToEthereumKey(prfOutput: Uint8Array): {
  privateKey: `0x${string}`;
  address: `0x${string}`;
} {
  if (prfOutput.length !== 32) {
    throw new Error("PRF output must be 32 bytes");
  }

  // Use PRF output directly as private key (it's already 32 bytes of entropy)
  const privateKey = bytesToHex(prfOutput);

  // Derive public key from private key using secp256k1
  const publicKey = getPublicKey(prfOutput, false); // false = uncompressed

  // Derive Ethereum address: keccak256(publicKey[1:65])[12:32]
  // Skip the 0x04 prefix (1 byte), take 64 bytes (x and y coordinates)
  const publicKeyWithoutPrefix = publicKey.slice(1);
  const hash = keccak_256(publicKeyWithoutPrefix);
  const addressBytes = hash.slice(12); // Last 20 bytes

  const address = bytesToHex(addressBytes);

  return { privateKey, address };
}

// Full flow: derive Ethereum key from passkey using PRF
export async function deriveEthereumKeyFromPasskey(
  credentialRawId: string,
  salt: string = "ethereum-key-derivation-v1"
): Promise<{
  privateKey: `0x${string}`;
  address: `0x${string}`;
}> {
  const prfOutput = await derivePrfOutput(credentialRawId, salt);
  return prfOutputToEthereumKey(prfOutput);
}
