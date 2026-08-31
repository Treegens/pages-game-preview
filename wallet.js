// =============================================================================
// wallet.js — the real-money bridge, READ-ONLY by design.
//  · Live $TGN price from DexScreener (fallback: config display price)
//  · Real on-chain TGN balance via public Base RPC (eth_call balanceOf)
//  · Watch = paste a public address; no wallet permission or signature request
//  · Buying happens on the user's own live on-ramp (buytgn.xyz) — the game
//    NEVER initiates transactions, signs, or moves funds. Ever.
// =============================================================================

const Wallet = (() => {
  // mainnet.base.org rate-limits aggressively (verified 2026-08-06: 3 rapid
  // eth_calls -> -32016 "over rate limit"). Try nodes in order so one throttled
  // provider never blanks a player's balance.
  const RPCS = [
    "https://mainnet.base.org",
    "https://1rpc.io/base",
    "https://base.llamarpc.com",
  ];
  const DECIMALS = 18n;

  async function rpc(method, params) {
    let lastErr = null;
    for (const url of RPCS) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const j = await r.json();
        if (j.error) { lastErr = new Error(j.error.message); continue; }
        return j.result;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("all Base RPCs unreachable");
  }

  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");

  // ERC-20 balanceOf(address) — selector 0x70a08231
  async function balanceOf(addr) {
    const data = "0x70a08231" + addr.toLowerCase().replace("0x", "").padStart(64, "0");
    const hex = await rpc("eth_call", [{ to: CONFIG.token.address, data }, "latest"]);
    if (!hex || hex === "0x") return 0;
    const whole = BigInt(hex) / (10n ** (DECIMALS - 4n)); // keep 4 decimals
    return Number(whole) / 10000;
  }

  // Live price with a short cache; falls back to the config display price.
  let priceCache = { v: null, t: 0 };
  async function livePrice() {
    if (priceCache.v && Date.now() - priceCache.t < 120000) return priceCache.v;
    try {
      const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + CONFIG.token.address);
      const j = await r.json();
      // Median across pairs with real liquidity, never pairs[0]: a thin
      // Hydrex pool prices TGN ~8x high and DexScreener's ordering is not
      // guaranteed (same guard pollenfi uses).
      const prices = (j?.pairs || [])
        .filter((pr) => (pr?.liquidity?.usd || 0) >= 5000)
        .map((pr) => parseFloat(pr?.priceUsd))
        .filter((p) => p > 0)
        .sort((a, b) => a - b);
      const p = prices.length ? prices[Math.floor(prices.length / 2)] : parseFloat(j?.pairs?.[0]?.priceUsd);
      if (p > 0) { priceCache = { v: p, t: Date.now() }; return p; }
    } catch (e) {}
    return CONFIG.token.usd;
  }

  // Paste-only by design. Even a read-only account request creates a wallet
  // permission surface that an educational game does not need.
  async function connect(promptFn) {
    let addr = promptFn ? await promptFn() : null;
    if (addr) addr = addr.trim();
    if (!isAddr(addr)) return { ok: false, reason: addr ? "bad-address" : "cancelled" };
    const bal = await balanceOf(addr).catch(() => null);
    const s = State.get();
    s.wallet = { addr, bal: bal ?? 0, t: Date.now() };
    State.save();
    return { ok: true, addr, bal: bal ?? 0 };
  }

  async function refresh() {
    const s = State.get();
    if (!s.wallet?.addr) return null;
    const bal = await balanceOf(s.wallet.addr).catch(() => null);
    if (bal !== null) { s.wallet.bal = bal; s.wallet.t = Date.now(); State.save(); }
    return s.wallet;
  }

  function disconnect() {
    const s = State.get();
    s.wallet = null;
    State.save();
  }

  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

  // The one and only purchase path: the user's own live on-ramp, in a new tab.
  function openBuyPage() {
    window.open(CONFIG.buyUrl, "_blank", "noopener");
  }

  return { connect, refresh, disconnect, balanceOf, livePrice, isAddr, short, openBuyPage };
})();
window.Wallet = Wallet;
