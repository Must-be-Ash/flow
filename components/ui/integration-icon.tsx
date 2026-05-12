"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntegrationIconProps {
  integration: string;
  className?: string;
}

export function IntegrationIcon({
  integration: _integration,
  className = "h-3 w-3",
}: IntegrationIconProps) {
  // Stub — static plugins removed; x402 services will provide their own icons
  return <HelpCircle className={cn("text-foreground", className)} />;
}
