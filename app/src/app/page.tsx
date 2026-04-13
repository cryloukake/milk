"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

function GridOverlay() {
  return (
    <>
      <div className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(245,200,66,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(245,200,66,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse, rgba(245,200,66,0.12) 0%, transparent 70%)" }}
      />
      <div className="fixed top-[30%] right-[-200px] w-[600px] h-[600px] pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(71,212,255,0.06) 0%, transparent 70%)" }}
      />
      <div className="fixed bottom-[-100px] left-[-150px] w-[500px] h-[500px] pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(180,126,255,0.05) 0%, transparent 70%)" }}
      />
    </>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="arcade-panel p-5" style={{ boxShadow: "6px 6px 0px #000" }}>
      <div className="font-arcade text-lg text-[var(--gold)] mb-2 opacity-70">{icon}</div>
      <h3 className="font-arcade text-sm text-[var(--gold)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-dim)] font-body leading-relaxed">{desc}</p>
    </div>
  );
}

function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="font-arcade text-2xl text-[var(--gold)] shrink-0 w-10 h-10 flex items-center justify-center border-2 border-[var(--border)] rounded-lg bg-[#111]"
        style={{ boxShadow: "3px 3px 0px #000" }}>
        {num}
      </div>
      <div>
        <h4 className="font-arcade text-xs text-[var(--cream)] mb-1">{title}</h4>
        <p className="text-sm text-[var(--text-dim)] font-body">{desc}</p>
      </div>
    </div>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-arcade text-xl sm:text-2xl text-[var(--gold)]"
        style={{ textShadow: "2px 2px 0px #000" }}>
        {value}
      </div>
      <div className="text-xs text-[var(--text-dim)] font-body mt-1">{label}</div>
    </div>
  );
}

export default function Landing() {
  return (
    <>
      <GridOverlay />

      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="MILK" width={36} height={36}
              className="rounded-lg border-2 border-[var(--border)]"
              style={{ boxShadow: "3px 3px 0px #000" }} />
            <span className="font-arcade text-lg text-[var(--gold)]"
              style={{ textShadow: "2px 2px 0px #000" }}>
              MILK
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/cryloukake/milk" target="_blank" rel="noopener"
              className="text-[var(--text-dim)] hover:text-[var(--cream)] text-sm font-body transition-colors">
              GitHub
            </a>
            <Link href="/dapp"
              className="btn-arcade !w-auto !px-5 !py-2.5 text-xs inline-block">
              LAUNCH APP
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="text-center px-6 pt-16 pb-20 max-w-3xl mx-auto">
          <div className="mb-6">
            <Image src="/logo.jpg" alt="MILK" width={100} height={100}
              className="mx-auto rounded-2xl border-2 border-[var(--border)]"
              style={{ boxShadow: "8px 8px 0px #000" }} />
          </div>
          <h1 className="font-arcade text-3xl sm:text-5xl text-[var(--gold)] mb-4 leading-tight"
            style={{ textShadow: "4px 4px 0px #000, 0 0 30px rgba(245,200,66,0.2)" }}>
            PRIVATE SOL
            <br />
            TRANSFERS
          </h1>
          <p className="text-[var(--text-dim)] text-lg sm:text-xl font-body mb-3 max-w-lg mx-auto">
            Zero-knowledge privacy on Solana.
            <br />
            No pools. No relayers. No trust.
          </p>
          <p className="text-[var(--gold-dark)] text-sm font-body italic mb-10">
            Privacy is a state transition, not a place.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/dapp"
              className="btn-arcade !w-auto !px-8 !py-3.5 text-sm inline-block">
              LAUNCH APP
            </Link>
            <a href="https://github.com/cryloukake/milk" target="_blank" rel="noopener"
              className="chip !px-8 !py-3.5 text-sm inline-block !border-[var(--border)] hover:!border-[var(--gold-dark)]">
              VIEW CODE
            </a>
          </div>
        </section>

        {/* Stats */}
        <section className="py-12 border-y-2 border-[var(--border)]">
          <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 px-6">
            <StatBox value="~5K" label="ZK constraints" />
            <StatBox value="$0.01" label="Per transaction" />
            <StatBox value="~5s" label="Proof generation" />
            <StatBox value="0" label="Servers needed" />
          </div>
        </section>

        {/* Features */}
        <section className="py-20 px-6 max-w-4xl mx-auto">
          <h2 className="font-arcade text-xl text-[var(--gold)] text-center mb-12"
            style={{ textShadow: "3px 3px 0px #000" }}>
            WHY MILK?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon="[X]"
              title="NO POOLS"
              desc="Your tokens stay in your control. No shared liquidity pool, no locked funds, no pool risk."
            />
            <FeatureCard
              icon="{ZK}"
              title="CLIENT-SIDE ZK"
              desc="Groth16 proofs generated entirely in your browser. No middlemen, no trust assumptions."
            />
            <FeatureCard
              icon="<*>"
              title="ANY AMOUNT"
              desc="Send any amount of SOL privately. No fixed denominations — UTXO model with change."
            />
            <FeatureCard
              icon="///"
              title="GROWING PRIVACY"
              desc="Anonymity set = entire commitment tree. Every user makes everyone more private."
            />
            <FeatureCard
              icon=">>>"
              title="SOLANA-NATIVE"
              desc="Built on SPL Account Compression and altbn254 syscalls. $0.01 per transaction."
            />
            <FeatureCard
              icon="</>"
              title="OPEN SOURCE"
              desc="Fully auditable Circom circuits, Anchor program, and Next.js frontend. Trust the code."
            />
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6 border-t-2 border-[var(--border)]">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-arcade text-xl text-[var(--gold)] text-center mb-12"
              style={{ textShadow: "3px 3px 0px #000" }}>
              HOW IT WORKS
            </h2>
            <div className="space-y-8">
              <StepCard num="1" title="SHIELD"
                desc="Connect your wallet and deposit any amount of SOL. A private commitment is created and stored in the Merkle tree. You receive a secret note — save it!" />
              <StepCard num="2" title="TRANSFER"
                desc="Paste your secret note and enter the amount to send. A ZK proof verifies balance conservation in your browser. Two new notes are created — one for the recipient, one for your change. No SOL moves on-chain." />
              <StepCard num="3" title="UNSHIELD"
                desc="The recipient pastes their secret note and withdraws SOL to any wallet. A ZK proof verifies ownership without revealing the original sender. The link is broken." />
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section className="py-20 px-6 border-t-2 border-[var(--border)]">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-arcade text-xl text-[var(--gold)] text-center mb-12"
              style={{ textShadow: "3px 3px 0px #000" }}>
              ARCHITECTURE
            </h2>

            {/* Commitment formula */}
            <div className="text-center mb-10">
              <div className="inline-block arcade-panel px-6 py-3" style={{ boxShadow: "4px 4px 0px #000" }}>
                <span className="font-mono text-sm text-[var(--gold)]">
                  Commitment = Poseidon(amount, nullifier, secret)
                </span>
              </div>
            </div>

            {/* Top row: Browser → Solana Program */}
            <div className="grid sm:grid-cols-2 gap-6 mb-4">
              <div className="arcade-panel p-5" style={{ boxShadow: "6px 6px 0px #000" }}>
                <h4 className="font-arcade text-xs text-[var(--sky)] mb-3">BROWSER</h4>
                <ul className="space-y-1.5 font-mono text-sm text-[var(--text-dim)]">
                  <li className="flex items-center gap-2"><span className="text-[var(--gold)] text-xs">{">"}</span> Poseidon hashing</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gold)] text-xs">{">"}</span> snarkjs proof gen</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gold)] text-xs">{">"}</span> Groth16 circuits</li>
                </ul>
              </div>
              <div className="arcade-panel p-5" style={{ boxShadow: "6px 6px 0px #000" }}>
                <h4 className="font-arcade text-xs text-[var(--sky)] mb-3">SOLANA PROGRAM</h4>
                <ul className="space-y-1.5 font-mono text-sm text-[var(--text-dim)]">
                  <li className="flex items-center gap-2"><span className="text-[var(--gold)] text-xs">{">"}</span> Poseidon Merkle tree</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gold)] text-xs">{">"}</span> Root history (30)</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gold)] text-xs">{">"}</span> Nullifier PDAs</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gold)] text-xs">{">"}</span> SOL vault</li>
                </ul>
              </div>
            </div>

            {/* Arrow down */}
            <div className="flex justify-around mb-4">
              <div className="font-arcade text-[var(--gold)] text-lg opacity-50">V</div>
              <div className="font-arcade text-[var(--gold)] text-lg opacity-50">V</div>
            </div>

            {/* Bottom row: ZK Circuit / Groth16 Verify */}
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="arcade-panel p-4 text-center" style={{ boxShadow: "6px 6px 0px #000" }}>
                <h4 className="font-arcade text-xs text-[var(--purple)] mb-1">ZK CIRCUIT</h4>
                <p className="font-mono text-xs text-[var(--text-dim)]">Circom 2.0</p>
              </div>
              <div className="arcade-panel p-4 text-center" style={{ boxShadow: "6px 6px 0px #000" }}>
                <h4 className="font-arcade text-xs text-[var(--purple)] mb-1">GROTH16 VERIFY</h4>
                <p className="font-mono text-xs text-[var(--text-dim)]">alt_bn128 syscall</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 text-center border-t-2 border-[var(--border)]">
          <h2 className="font-arcade text-2xl sm:text-3xl text-[var(--gold)] mb-4"
            style={{ textShadow: "3px 3px 0px #000" }}>
            READY?
          </h2>
          <p className="text-[var(--text-dim)] font-body mb-8 max-w-md mx-auto">
            Start making private transfers on Solana. Your browser generates the proofs. Nobody sees who sent what to whom.
          </p>
          <Link href="/dapp"
            className="btn-arcade !w-auto !px-10 !py-4 text-base inline-block">
            LAUNCH APP
          </Link>
        </section>

        {/* Footer */}
        <footer className="py-10 px-6 border-t-2 border-[var(--border)]">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image src="/logo.jpg" alt="MILK" width={24} height={24} className="rounded" />
              <span className="font-arcade text-sm text-[var(--gold)]">MILK</span>
              <span className="text-[var(--text-dim)] text-xs font-body">Memory Isolation Layer Kit</span>
            </div>
            <div className="flex gap-6 text-sm font-body text-[var(--text-dim)]">
              <a href="https://github.com/cryloukake/milk" target="_blank" rel="noopener"
                className="hover:text-[var(--cream)] transition-colors">
                GitHub
              </a>
              <Link href="/dapp" className="hover:text-[var(--cream)] transition-colors">
                App
              </Link>
            </div>
            <p className="text-xs text-[#444] font-mono">
              Zero pools · Zero relayers · Zero trust
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
