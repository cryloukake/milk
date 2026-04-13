"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import CircuitBackground from "../../components/CircuitBackground";
import ShieldPanel from "../../components/ShieldPanel";
import TransferPanel from "../../components/TransferPanel";
import UnshieldPanel from "../../components/UnshieldPanel";

const WalletProvider = dynamic(
  () => import("../../components/WalletProvider"),
  { ssr: false }
);

type Tab = "shield" | "transfer" | "unshield";

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: "shield", label: "SHIELD", emoji: "+" },
  { key: "transfer", label: "TRANSFER", emoji: ">" },
  { key: "unshield", label: "UNSHIELD", emoji: "-" },
];

function AppContent() {
  const [tab, setTab] = useState<Tab>("shield");

  return (
    <>
      <CircuitBackground />

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-6 sm:py-10">
        {/* Everything constrained to 480px */}
        <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>

          {/* Header */}
          <div className="flex items-center justify-between mb-6 sm:mb-8 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Image
                src="/logo.jpg"
                alt="MILK"
                width={42}
                height={42}
                className="rounded-xl border-2 border-[var(--border)] shadow-[4px_4px_0px_#000] shrink-0"
              />
              <div className="min-w-0">
                <h1
                  className="font-arcade text-xl sm:text-2xl tracking-wider text-[var(--gold)]"
                  style={{ textShadow: "3px 3px 0px #000, 0 0 20px rgba(245,200,66,0.3)" }}
                >
                  MILK
                </h1>
                <p className="text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] text-[var(--text-dim)] uppercase font-body truncate">
                  Memory Isolation Layer Kit
                </p>
              </div>
            </div>
            <WalletMultiButton
              style={{
                background: "#222",
                height: "38px",
                fontSize: "12px",
                borderRadius: "8px",
                border: "2px solid #333",
                color: "#f5c842",
                fontFamily: "'Fredoka', sans-serif",
                fontWeight: 600,
                boxShadow: "3px 3px 0px #000",
                padding: "0 12px",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            />
          </div>

          {/* Tagline */}
          <p className="text-[var(--text-dim)] text-xs sm:text-sm mb-6 sm:mb-8 text-center font-body">
            Privacy is a state transition, not a place.
          </p>

          {/* Main arcade panel */}
          <div className="arcade-panel animate-bounce-in">
            {/* Tabs */}
            <div className="flex border-b-2 border-[var(--border)]">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 py-3 sm:py-4 font-arcade text-[10px] sm:text-xs tracking-wider transition-all relative ${
                    tab === t.key
                      ? "tab-active"
                      : "text-[var(--text-dim)] hover:text-[var(--cream)]"
                  }`}
                >
                  <span className="mr-0.5 sm:mr-1 font-mono text-[var(--purple)]">{t.emoji}</span>
                  {t.label}
                  {tab === t.key && (
                    <div className="absolute bottom-0 left-[10%] right-[10%] sm:left-[15%] sm:right-[15%] tab-bar" />
                  )}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="p-4 sm:p-6">
              {tab === "shield" && <ShieldPanel />}
              {tab === "transfer" && <TransferPanel />}
              {tab === "unshield" && <UnshieldPanel />}
            </div>
          </div>

          {/* Network badge */}
          <div className="mt-6 flex justify-center">
            <div className="flex items-center gap-2 arcade-panel px-4 py-2" style={{ boxShadow: "3px 3px 0px #000" }}>
              <div className="w-2 h-2 rounded-full bg-[var(--sky)] shadow-[0_0_8px_var(--sky)] animate-pulse" />
              <span className="text-[11px] text-[var(--sky)] uppercase tracking-wider font-mono font-semibold">
                Devnet
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 sm:mt-10 pb-4 text-center space-y-2">
            <p className="text-[11px] sm:text-[12px] text-[var(--text-dim)] font-body">
              Zero pools &middot; Zero relayers &middot; Zero trust
            </p>
            <p className="font-mono text-[10px] text-[#444]">
              v0.2.0 &middot; open source &middot; solana-native
            </p>
            <button
              onClick={() => {
                localStorage.removeItem("milk_tree_state");
                window.location.reload();
              }}
              className="text-[10px] text-[#444] hover:text-[var(--pink)] font-mono transition-colors cursor-pointer"
            >
              Reset local state
            </button>
          </div>

        </div>{/* end 480px container */}
      </div>
    </>
  );
}

export default function Home() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
