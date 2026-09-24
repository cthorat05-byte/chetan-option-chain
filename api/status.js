function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith(name + "="));

  return match ? decodeURIComponent(match.split("=")[1]) : "";
}

module.exports = async (req, res) => {
  const token = getCookie(req, "fyers_access_token");

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    connected: !!token
  });
};
