"use client";

import { RefreshCw, Wallet, AlertCircle, Copy, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type WalletStatusData = {
  authenticated: boolean;
  address?: string;
  chain?: string;
  error?: string;
};

type NetworkAccount = {
  network: string;
  address: string;
  balance: number;
  depositLink: string;
};

type WalletBalanceData = {
  totalBalance: string;
  asset: string;
  accounts?: NetworkAccount[];
  error?: string;
};

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function fmt(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export function WalletStatus() {
  const [status, setStatus] = useState<WalletStatusData | null>(null);
  const [balance, setBalance] = useState<WalletBalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const lastFetchRef = useRef(0);
  const DEBOUNCE_MS = 30_000;

  const fetchWalletData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < DEBOUNCE_MS) return;
    lastFetchRef.current = now;

    setLoading(true);
    try {
      const [statusRes, balanceRes] = await Promise.all([
        fetch("/api/wallet/status").then((r) => r.json()),
        fetch("/api/wallet/balance").then((r) => r.json()),
      ]);
      setStatus(statusRes);
      setBalance(balanceRes);
    } catch {
      setStatus({ authenticated: false, error: "Failed to connect" });
      setBalance({ totalBalance: "0", asset: "USDC" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData(true);
    const onFocus = () => fetchWalletData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchWalletData]);

  const handleCopyAddress = async () => {
    if (status?.address) {
      await navigator.clipboard.writeText(status.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex h-9 items-center gap-1.5 rounded-full border bg-secondary px-3 text-xs text-muted-foreground">
        <Wallet className="size-3.5" />
        <span className="hidden sm:inline">Loading...</span>
      </div>
    );
  }

  if (!status?.authenticated) {
    return <WalletNotConnected />;
  }

  const total = balance?.totalBalance ?? "0";
  const hasBalance = parseFloat(total) > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
            "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            "cursor-pointer"
          )}
        >
          <Wallet className={cn("size-3.5", hasBalance ? "text-green-500" : "text-amber-500")} />
          <span className="hidden sm:inline font-mono">
            {fmt(total)} {balance?.asset ?? "USDC"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Wallet</h4>
            <Button
              className="h-6 w-6"
              onClick={() => fetchWalletData(true)}
              size="icon"
              variant="ghost"
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Address</span>
              <button
                className="flex items-center gap-1 font-mono text-xs hover:text-primary"
                onClick={handleCopyAddress}
              >
                {status.address ? truncateAddress(status.address) : "Unknown"}
                {copied ? (
                  <Check className="size-3 text-green-500" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Balance</span>
              <span className="font-mono font-medium">
                {fmt(total)} {balance?.asset ?? "USDC"}
              </span>
            </div>
          </div>

          {/* Per-network breakdown */}
          {balance?.accounts && balance.accounts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Networks
              </p>
              {balance.accounts.map((account) => (
                <div
                  key={account.network}
                  className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs"
                >
                  <span className="capitalize">{account.network}</span>
                  <span className={cn(
                    "font-mono",
                    account.balance > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                  )}>
                    {fmt(account.balance)} USDC
                  </span>
                </div>
              ))}
            </div>
          )}

          {!hasBalance && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs">
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Wallet is empty
              </p>
              <p className="mt-1 text-muted-foreground">
                Get free credits at agentcash.dev/onboard
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WalletNotConnected() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
            "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400",
            "hover:bg-amber-500/10 cursor-pointer"
          )}
        >
          <AlertCircle className="size-3.5" />
          <span className="hidden sm:inline">No wallet</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-amber-500" />
            <h4 className="font-medium text-sm">Wallet not connected</h4>
          </div>
          <p className="text-muted-foreground text-xs">
            Flow uses AgentCash to pay for x402 services. Set up your wallet to
            get started:
          </p>
          <div className="space-y-2">
            <div className="rounded-md border bg-muted/50 p-2.5">
              <p className="mb-1 font-medium text-xs">1. Get free credits</p>
              <p className="text-[10px] text-muted-foreground mb-1">Visit agentcash.dev/onboard to claim up to $25 free</p>
            </div>
            <div className="rounded-md border bg-muted/50 p-2.5">
              <p className="mb-1 font-medium text-xs">2. Set up wallet</p>
              <code className="block rounded bg-muted px-1.5 py-1 font-mono text-[10px]">
                npx agentcash onboard YOUR_CODE
              </code>
            </div>
            <div className="rounded-md border bg-muted/50 p-2.5">
              <p className="mb-1 font-medium text-xs">3. Add MCP to Claude Code</p>
              <code className="block rounded bg-muted px-1.5 py-1 font-mono text-[10px]">
                claude mcp add agentcash -- npx -y agentcash@latest
              </code>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
