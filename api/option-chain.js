export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const appId = process.env.FYERS_APP_ID;
  const accessToken = process.env.FYERS_ACCESS_TOKEN;

  if (!appId || !accessToken) {
    return res.status(500).json({
      error: "FYERS credentials are not configured on the server."
    });
  }

  const symbolMap = {
    NIFTY: "NSE:NIFTY50-INDEX",
    BANKNIFTY: "NSE:NIFTYBANK-INDEX",
    FINNIFTY: "NSE:FINNIFTY-INDEX"
  };

  const symbol = symbolMap[String(req.query.symbol || "NIFTY").toUpperCase()];
  const expiryIndex = Math.max(0, parseInt(req.query.expiry || "0", 10) || 0);

  if (!symbol) {
    return res.status(400).json({ error: "Unsupported index." });
  }

  const headers = {
    Authorization: `${appId}:${accessToken}`
  };

  try {
    // First request: get expiryData and a small chain.
    const firstUrl =
      `https://api-t1.fyers.in/data/options-chain-v3` +
      `?symbol=${encodeURIComponent(symbol)}&strikecount=1`;

    const firstResp = await fetch(firstUrl, { headers });
    const first = await firstResp.json();

    if (!firstResp.ok || first.s !== "ok") {
      return res.status(502).json({
        error: first.message || "FYERS option-chain request failed.",
        fyers: first
      });
    }

    const expiries = first?.data?.expiryData || [];
    const selected = expiries[expiryIndex] || expiries[0];

    // Use the selected expiry timestamp when available.
    let url =
      `https://api-t1.fyers.in/data/options-chain-v3` +
      `?symbol=${encodeURIComponent(symbol)}&strikecount=10`;

    if (selected?.expiry) {
      url += `&timestamp=${encodeURIComponent(selected.expiry)}`;
    }

    const resp = await fetch(url, { headers });
    const body = await resp.json();

    if (!resp.ok || body.s !== "ok") {
      return res.status(502).json({
        error: body.message || "FYERS option-chain request failed.",
        fyers: body
      });
    }

    const data = body.data || {};
    const options = data.optionsChain || [];

    const spotItem = options.find(x => x.option_type === "");
    const spot = Number(spotItem?.ltp || 0);

    const rows = {};
    for (const x of options) {
      if (!["CE", "PE"].includes(x.option_type)) continue;

      const strike = Number(x.strike_price);
      if (!Number.isFinite(strike)) continue;

      if (!rows[strike]) rows[strike] = { s: strike };

      const oi = Number(x.oi || 0);
      // FYERS option-chain responses can expose change in OI as chg_oi.
      const chgOi = Number(x.chg_oi ?? x.change_oi ?? 0);
      const ltp = Number(x.ltp || 0);

      if (x.option_type === "CE") {
        rows[strike].ceoi = oi;
        rows[strike].ced = chgOi;
        rows[strike].cel = ltp;
      } else {
        rows[strike].peoi = oi;
        rows[strike].ped = chgOi;
        rows[strike].pel = ltp;
      }
    }

    const chain = Object.values(rows)
      .sort((a, b) => a.s - b.s)
      .map(x => ({
        ceoi: x.ceoi || 0,
        ced: x.ced || 0,
        cel: x.cel || 0,
        s: x.s,
        pel: x.pel || 0,
        ped: x.ped || 0,
        peoi: x.peoi || 0
      }));

    const callOi = Number(data.callOi || chain.reduce((a, x) => a + x.ceoi, 0));
    const putOi = Number(data.putOi || chain.reduce((a, x) => a + x.peoi, 0));
    const pcr = callOi ? putOi / callOi : 0;

    // Max pain: strike where total option-holder payout is minimum.
    let maxPain = null;
    let bestPain = Infinity;

    for (const candidate of chain.map(x => x.s)) {
      let pain = 0;
      for (const row of chain) {
        pain += Math.max(0, candidate - row.s) * row.ceoi;
        pain += Math.max(0, row.s - candidate) * row.peoi;
      }
      if (pain < bestPain) {
        bestPain = pain;
        maxPain = candidate;
      }
    }

    const strikes = chain.map(x => x.s);
    const atm = strikes.length && Number.isFinite(spot)
      ? strikes.reduce((best, s) =>
          Math.abs(s - spot) < Math.abs(best - spot) ? s : best
        , strikes[0])
      : null;

    return res.status(200).json({
      source: "FYERS",
      symbol,
      expiry: selected || null,
      spot,
      atm,
      pcr,
      maxPain,
      chain
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error while reading FYERS data.",
      detail: String(err?.message || err)
    });
  }
}
