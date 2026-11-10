"""Read-only health/security check. Never creates applicants, classes or payments."""
import argparse
import json
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://localhost:3000")
args = parser.parse_args()
base = args.url.rstrip("/")

def get(path):
    try:
        response = urllib.request.urlopen(base + path, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()

assert get("/")[0] == 200, "Frontend did not load"
assert get("/api/health")[0] == 200, "Backend/database unhealthy"
assert get("/api/classes")[0] == 200, "Class listing failed"
assert get("/api/auth/csrf")[0] == 200, "Antiforgery session unavailable"
for path in ("/api/me/holds", "/api/auth/me", "/api/admin/overview", "/api/profile/documents", "/api/payments/mine"):
    assert get(path)[0] == 401, f"Anonymous access was not rejected: {path}"
print("Read-only portal health and anonymous-access checks passed")
