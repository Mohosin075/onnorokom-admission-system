"""Verify explicitly enabled local demo accounts; never prints passwords or session tokens."""
import http.cookiejar
import json
import pathlib
import urllib.error
import urllib.request

config = dict(line.split("=", 1) for line in pathlib.Path(".env").read_text().splitlines() if "=" in line and not line.startswith("#"))
assert config.get("ASPNETCORE_ENVIRONMENT") == "Development"
assert config.get("DEMO_ACCOUNTS_ENABLED") == "true"
base = "http://localhost:3000/api"
for email, role in (("admin@demo.invalid", "Admin"), ("student@demo.invalid", "Student")):
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def get(path):
        with client.open(base + path, timeout=15) as response:
            return json.load(response)
    token = get("/auth/csrf")["token"]
    login = urllib.request.Request(base + "/auth/login", data=json.dumps({"email": email, "password": config["DEMO_ACCOUNTS_PASSWORD"]}).encode(), headers={"Content-Type": "application/json", "X-CSRF-TOKEN": token})
    with client.open(login, timeout=15) as response:
        assert json.load(response)["role"] == role
    if role == "Admin":
        assert get("/admin/overview")["applications"] == 0
    else:
        assert get("/me/holds") == []
        try:
            get("/admin/overview")
            raise AssertionError("Student was given administrator access")
        except urllib.error.HTTPError as error:
            assert error.code == 403
    assert get("/classes") == []
    token = get("/auth/csrf")["token"]
    logout = urllib.request.Request(base + "/auth/logout", data=b"", headers={"X-CSRF-TOKEN": token})
    with client.open(logout, timeout=15) as response:
        assert response.status == 204
print("Both local demo logins and role permissions verified; no classes or applications seeded")
