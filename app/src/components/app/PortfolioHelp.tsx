"use client";

import { useNetwork } from "./NetworkProvider";
import { openOnboarding } from "./OnboardingCard";
import { TempoFaucetButton } from "./TempoFaucetButton";
import { faucetFor } from "@/lib/faucet";

const quiet = "btn btn-quiet btn-sm text-mute hover:text-foreground";

/**
 * Portfolio's page header: the testnet helpers, kept out of the balance card.
 * Test funds where the network has a faucet (testnets only) and the getting
 * started steps, both quiet, beside the page title like Payroll's guide.
 */
export function PortfolioHelp() {
  const { network } = useNetwork();
  const faucet = faucetFor(network.key);
  const external = faucet?.url.startsWith("http") ?? false;
  return (
    <>
      {network.key === "tempo" ? (
        <TempoFaucetButton className={quiet} />
      ) : faucet ? (
        <a
          href={faucet.url}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className={quiet}
          title={faucet.blurb}
        >
          Get test funds
        </a>
      ) : null}
      <button type="button" onClick={openOnboarding} className={quiet}>
        Getting started
      </button>
    </>
  );
}
