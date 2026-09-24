const crypto = require("crypto");

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith(name + "="));

  return match ? decodeURIComponent(match.split("=")[1]) : "";
}

module.exports = async (req, res) => {
  try {
    const { code, state, error, message } = req.query || {};

    if (error || !code) {
      return res.status(400).send(
        `FYERS Login Failed: ${message || error || "Authorization code missing"}`
      );
    }

    const savedState = getCookie(req, "fyers_oauth_state");

    if (!state || !savedState || state !== savedState) {
      return res.status(400).send("Invalid OAuth state");
    }

    const appId = process.env.FYERS_APP_ID;
    const secret = process.env.FYERS_APP_SECRET;

    if (!appId || !secret) {
      return res.status(500).send("FYERS credentials missing");
    }

    const appIdHash = crypto
      .createHash("sha256")
      .update(`${appId}:${secret}`)
      .digest("hex");

    const response = await fetch(
      "https://api-t1.fyers.in/api/v3/validate-authcode",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          appIdHash: appIdHash,
          code: code
        })
      }
   
