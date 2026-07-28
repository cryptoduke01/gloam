"use client";

import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  getActiveTurnkeyAccount,
  onTurnkeyAccountChange,
} from "@/lib/turnkeyBridge";

/**
 * Lives inside WagmiProvider. When the passkey signer becomes available it
 * connects the wagmi Turnkey connector, so the app's existing wagmi hooks
 * (useAccount / useWriteContract) transact through the embedded wallet.
 * Disconnects again on logout. Renders nothing.
 */
export function TurnkeyAutoConnect() {
  const { connect, connectors } = useConnect();
  const { connector: current } = useAccount();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const sync = () => {
      const account = getActiveTurnkeyAccount();
      const turnkey = connectors.find((c) => c.id === "gloam-turnkey");
      if (!turnkey) return;
      if (account) {
        if (current?.id !== "gloam-turnkey") connect({ connector: turnkey });
      } else if (current?.id === "gloam-turnkey") {
        disconnect();
      }
    };
    sync();
    return onTurnkeyAccountChange(sync);
  }, [connect, connectors, current, disconnect]);

  return null;
}
