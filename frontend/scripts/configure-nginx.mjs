import { readFileSync, writeFileSync } from "node:fs";

const api = process.env.VITE_API_URL || "/api";
let origin = "";
if (!api.startsWith("/")) {
  const url = new URL(api);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "VITE_API_URL must be a relative path or an HTTP(S) URL without credentials.",
    );
  }
  origin = url.origin;
}
writeFileSync(
  "nginx.generated.conf",
  readFileSync("nginx.conf", "utf8").replace("__API_ORIGIN__", origin),
);
