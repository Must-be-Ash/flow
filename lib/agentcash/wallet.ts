/**
 * AgentCash wallet reader
 *
 * Reads wallet state from ~/.agentcash/wallet.json and the agentcash CLI.
 * Uses `npx agentcash balance` for total balance across all networks.
 * Docs: https://agentcash.dev/docs/tools/get-balance
 */

import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { agentcash, AgentCashCliError } from "./cli";

const WALLET_PATH = join(homedir(), ".agentcash", "wallet.json");

export type WalletInfo = {
  address?: string;
  chain?: string;
  network?: string;
};

export type WalletStatus = {
  authenticated: boolean;
  address?: string;
  chain?: string;
  error?: string;
};

export type NetworkAccount = {
  network: string;
  address: string;
  balance: number;
  depositLink: string;
};

export type WalletBalance = {
  totalBalance: string;
  asset: string;
  accounts?: NetworkAccount[];
  error?: string;
};

// Simple per-request cache
let cachedWallet: WalletInfo | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5_000;

/**
 * Read wallet.json from disk.
 */
export async function readWallet(): Promise<WalletInfo | null> {
  const now = Date.now();
  if (cachedWallet && now - cacheTimestamp < CACHE_TTL) {
    return cachedWallet;
  }

  try {
    const raw = await readFile(WALLET_PATH, "utf-8");
    const data = JSON.parse(raw);
    cachedWallet = {
      address: data.address || data.walletAddress,
      chain: data.chain || data.network || "base",
      network: data.network,
    };
    cacheTimestamp = now;
    return cachedWallet;
  } catch {
    return null;
  }
}

/**
 * Get wallet status — tries reading wallet.json first (fast),
 * falls back to agentcash CLI.
 */
export async function getStatus(): Promise<WalletStatus> {
  const wallet = await readWallet();
  if (wallet?.address) {
    return {
      authenticated: true,
      address: wallet.address,
      chain: wallet.chain,
    };
  }

  try {
    const result = await agentcash(["balance"], { timeout: 15_000 });
    const data = result.json as Record<string, unknown> | null;
    if (data) {
      return {
        authenticated: true,
        address: (data.address || data.walletAddress) as string | undefined,
        chain: "all",
      };
    }
    return { authenticated: false, error: "No wallet found" };
  } catch (err) {
    return {
      authenticated: false,
      error: err instanceof AgentCashCliError
        ? "AgentCash not configured. Run: npx agentcash onboard"
        : (err instanceof Error ? err.message : "Unknown error"),
    };
  }
}

/**
 * Get wallet balance — returns TOTAL across all networks plus per-network breakdown.
 * Uses `npx agentcash accounts` to get full account list with balances.
 */
export async function getBalance(): Promise<WalletBalance> {
  try {
    // Try accounts command first for per-network breakdown
    // CLI returns: { success, data: { accounts: [...], totalBalance } }
    const result = await agentcash(["accounts"], { timeout: 15_000 });
    const raw = result.json as Record<string, unknown> | null;
    const payload = (raw?.data || raw) as Record<string, unknown> | null;

    if (payload && Array.isArray(payload.accounts)) {
      const accounts: NetworkAccount[] = (payload.accounts as Array<Record<string, unknown>>).map((a) => ({
        network: String(a.network || ""),
        address: String(a.address || ""),
        balance: Number(a.balance ?? 0),
        depositLink: String(a.depositLink || ""),
      }));

      const totalBalance = payload.totalBalance != null
        ? String(payload.totalBalance)
        : String(accounts.reduce((sum, a) => sum + a.balance, 0));

      return {
        totalBalance,
        asset: "USDC",
        accounts,
      };
    }

    // Fallback: try simple balance command
    // CLI returns: { success, data: { balance: 20 } }
    const balResult = await agentcash(["balance"], { timeout: 15_000 });
    const balRaw = balResult.json as Record<string, unknown> | null;
    const balData = (balRaw?.data || balRaw) as Record<string, unknown> | null;

    if (balData) {
      return {
        totalBalance: String(balData.balance ?? balData.totalBalance ?? "0"),
        asset: "USDC",
      };
    }

    return { totalBalance: "0", asset: "USDC" };
  } catch (err) {
    return {
      totalBalance: "0",
      asset: "USDC",
      error: err instanceof Error ? err.message : "Failed to fetch balance",
    };
  }
}

/**
 * Truncate address for display: 0x1234...5678
 */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
