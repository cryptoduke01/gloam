import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

const EXPLORER_API = "https://explorer.testnet.chain.robinhood.com/api";

export const dynamic = "force-dynamic";

type TxRow = {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError: string;
};

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  try {
    // Cap server fetch; UI paginates client-side (PAGE_SIZE=5)
    const url = `${EXPLORER_API}?module=account&action=txlist&address=${address}&page=1&offset=40&sort=desc`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { txs: [], error: "explorer_unavailable" },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      result?: TxRow[] | string;
    };
    const rows = Array.isArray(data.result) ? data.result : [];
    const txs = rows.map((t) => ({
      hash: t.hash,
      from: t.from,
      to: t.to,
      valueWei: t.value,
      timestamp: Number(t.timeStamp) * 1000,
      ok: t.isError === "0",
    }));

    return NextResponse.json({ txs, address });
  } catch {
    return NextResponse.json(
      { txs: [], error: "fetch_failed" },
      { status: 502 }
    );
  }
}
