const crypto = require("crypto");

module.exports = async (req, res) => {
  const appId = process.env.FYERS_APP_ID;
  const baseUrl =
    process.env.PUBLIC_BASE_URL ||
    `https://${req.headers.host}`;

  if (!appId) {
    return res.status(500).send("FYERS_APP_ID missing");
  }

  const redirectUri =
    `${baseUrl}/api/fyers/callback`;

  const state = crypto.randomBytes(16).toString("hex");

  res.setHeader(
    "Set-Cookie",
    `fyers_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  const url =
    "https://api-t1.fyers.in/api/v3/generate-authcode" +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  res.writeHead(302, { Location: url });
  res.end();
};
