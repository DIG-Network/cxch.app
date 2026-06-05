"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { cxch_asset_id } from "../lib/wasm";

// Prominently displays the canonical cXCH CAT asset id. Clicking it copies the
// full asset id to the clipboard.
export function AssetId() {
  const assetId = cxch_asset_id();
  const [copied, setCopied] = useState(false);

  // Show a shortened form, but copy the full value.
  const short = `${assetId.slice(0, 10)}…${assetId.slice(-8)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(assetId);
      setCopied(true);
      toast.success("Asset ID copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <button
      onClick={copy}
      title={`${assetId}\n(click to copy)`}
      className="group w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-left transition hover:border-[var(--accent)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-gray-400">cXCH Asset ID</span>
        <span className="text-xs text-gray-500 group-hover:text-[var(--accent)]">
          {copied ? "Copied ✓" : "Click to copy"}
        </span>
      </div>
      <div className="mt-1 font-mono text-sm break-all sm:hidden">{assetId}</div>
      <div className="mt-1 hidden font-mono text-lg sm:block">{short}</div>
    </button>
  );
}
