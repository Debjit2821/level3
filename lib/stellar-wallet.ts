import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

let isInitialized = false;

export function getWalletKit(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!isInitialized) {
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      modules: defaultModules(),
    });
    isInitialized = true;
  }
}

export class WalletError extends Error {
  constructor(
    public code: "NOT_FOUND" | "REJECTED" | "INSUFFICIENT_BALANCE" | "NETWORK_MISMATCH" | "UNKNOWN",
    message: string
  ) {
    super(message);
    this.name = "WalletError";
  }
}

export function parseWalletError(error: any): WalletError {
  console.error("Wallet operation failed. Details:", error);
  const errMsg = error?.message || error?.toString() || "";

  if (
    errMsg.toLowerCase().includes("reject") ||
    errMsg.toLowerCase().includes("cancel") ||
    errMsg.toLowerCase().includes("declined") ||
    error === "blocked"
  ) {
    return new WalletError("REJECTED", "Transaction was rejected by the user in the wallet.");
  }

  if (
    errMsg.toLowerCase().includes("install") ||
    errMsg.toLowerCase().includes("not found") ||
    errMsg.toLowerCase().includes("not installed")
  ) {
    return new WalletError("NOT_FOUND", "The requested wallet extension was not found or is disabled.");
  }

  if (
    errMsg.toLowerCase().includes("insufficient") ||
    errMsg.toLowerCase().includes("balance") ||
    errMsg.toLowerCase().includes("underfunded")
  ) {
    return new WalletError("INSUFFICIENT_BALANCE", "Your account balance is insufficient for gas fees or contract transfer.");
  }

  if (
    errMsg.toLowerCase().includes("network") ||
    errMsg.toLowerCase().includes("passphrase") ||
    errMsg.toLowerCase().includes("mismatch")
  ) {
    return new WalletError("NETWORK_MISMATCH", "Your wallet is set to a different network. Please switch to Stellar Testnet.");
  }

  return new WalletError("UNKNOWN", errMsg || "An unexpected error occurred during the wallet session.");
}

export async function connectWallet(): Promise<string> {
  getWalletKit();
  try {
    const { address } = await StellarWalletsKit.authModal();
    if (!address) {
      throw new Error("No address returned from wallet session.");
    }
    return address;
  } catch (error) {
    throw parseWalletError(error);
  }
}

export async function disconnectWallet(): Promise<void> {
  getWalletKit();
  try {
    await StellarWalletsKit.disconnect();
  } catch (error) {
    console.error("Disconnect error:", error);
  }
}

export async function signTx(xdr: string, address: string): Promise<string> {
  getWalletKit();
  try {
    const result = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase: "Test Stellar Network ; September 2015", // Testnet passphrase
    });
    return result.signedTxXdr;
  } catch (error) {
    throw parseWalletError(error);
  }
}
