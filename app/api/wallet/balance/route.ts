import { NextResponse } from "next/server";
import { getBalance } from "@/lib/agentcash/wallet";

export async function GET() {
  try {
    const balance = await getBalance();
    return NextResponse.json(balance);
  } catch (error) {
    return NextResponse.json(
      {
        totalBalance: "0",
        asset: "USDC",
        error: error instanceof Error ? error.message : "Failed to get balance",
      },
      { status: 500 }
    );
  }
}
