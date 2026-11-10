"""Read-only checks of the default PDF flow. Does not create classes, users, holds or payments."""
import argparse
import json
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://localhost:3000")
args = parser.parse_args()
base = args.url.rstrip("/")

def request(method, path, identity=None, body=None):
    headers = {"Content-Type": "application/json"}
    if identity:
        headers["X-Student-Id"] = identity
    req = urllib.request.Request(base + path, method=method, headers=headers,
        data=json.dumps(body).encode() if body is not None else None)
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()

assert request("GET", "/")[0] == 200, "Frontend did not load"
assert request("GET", "/api/health")[0] == 200, "Backend/database unhealthy"
assert request("GET", "/api/classes")[0] == 200, "Class listing failed"
assert request("GET", "/api/me/holds", "00000000000000000")[0] == 200, "Header identity must work without login"
assert request("GET", "/api/me/holds")[0] == 400, "Missing identity must return 400"
assert request("GET", "/api/holds/assessment_smoke_missing")[0] == 404, "Public hold endpoint must not require login"
assert request("POST", "/api/holds/assessment_smoke_missing/confirm", "00000000000000000")[0] == 404, "Confirmation must be available without cookies/CSRF"
assert request("DELETE", "/api/holds/assessment_smoke_missing", "00000000000000000")[0] == 404, "Cancellation must accept header identity"
assert request("POST", "/api/classes", body={})[0] == 400, "Class creation must validate input without requiring authentication"
assert request("GET", "/api/auth/me")[0] == 404, "Portal auth routes must not leak into assessment mode"
print("Read-only PDF flow, API identity and health checks passed")
