"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { cmojo_asset_id } from "../lib/wasm";

// Prominently displays the canonical cMojo CAT asset id. Clicking it copies the
// full asset id to the clipboard.
export function AssetId() {
  const assetId = cmojo_asset_id();
  const [copied, setCopied] = useState(false);

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
        <span className="text-xs uppercase tracking-wide text-gray-400">cMojo Asset ID</span>
        <span className="text-xs text-gray-500 group-hover:text-[var(--accent)]">
          {copied ? "Copied ✓" : "Click to copy"}
        </span>
      </div>
      {/* Always show the FULL asset id — never truncated. */}
      <div className="mt-1 break-all font-mono text-sm">{assetId}</div>
    </button>
  );
}
