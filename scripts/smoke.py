"""Exercise the deployed contract, then optionally verify it survived compose down/up."""
import argparse
import concurrent.futures
import json
import pathlib
import urllib.error
import urllib.request
import uuid


def request(base, method, path, body=None, student=None):
    headers = {"Content-Type": "application/json"}
    if student:
        headers["X-Student-Id"] = student
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8080")
    parser.add_argument("--secondary-api", help="Optional second API process sharing the same database")
    parser.add_argument("--frontend", default="http://localhost:3000")
    parser.add_argument("--persistence-file", type=pathlib.Path, default=pathlib.Path(".local/smoke-state.json"))
    parser.add_argument("--verify-persistence", action="store_true")
    args = parser.parse_args()
    check(request(args.api, "GET", "/health")[0] == 200, "Backend is unhealthy")
    if args.secondary_api:
        check(request(args.secondary_api, "GET", "/health")[0] == 200, "Second backend is unhealthy")
    with urllib.request.urlopen(args.frontend, timeout=10) as page:
        check(b"School Admission System" in page.read(), "Frontend HTML did not load")
    if args.verify_persistence:
        state = json.loads(args.persistence_file.read_text())
        status, hold = request(args.api, "GET", f"/holds/{state['holdId']}")
        check(status == 200 and hold["status"] == "CONFIRMED", "Confirmed admission did not survive restart")
        print("Persistence smoke test passed")
        return
    status, cls = request(args.api, "POST", "/classes", {"name": f"Smoke {uuid.uuid4().hex}", "totalSeats": 5})
    check(status == 201, f"Class creation failed: {status} {cls}")
    class_id = cls["id"]

    def reserve(index):
        student = f"2026{index:013d}"
        base = args.secondary_api if args.secondary_api and index % 2 else args.api
        status, hold = request(base, "POST", f"/classes/{class_id}/holds", student=student)
        return status, hold, student

    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as pool:
        responses = list(pool.map(reserve, range(30)))
    winners = [result for result in responses if result[0] == 201]
    check(len(winners) == 5, f"Expected 5 successful holds, got {len(winners)}")
    check(sum(result[0] == 409 for result in responses) == 25, "Excess reservations must return 409")
    _, hold, student = winners[0]
    status, held = request(args.api, "GET", f"/holds/{hold['holdId']}")
    check(status == 200 and held["status"] == "HELD", "Hold lookup failed")
    for _ in range(2):
        status, confirmed = request(args.api, "POST", f"/holds/{hold['holdId']}/confirm", student=student)
        check(status == 200 and confirmed["status"] == "CONFIRMED", "Confirmation is not idempotent")
    _, cancelled, owner = winners[1]
    check(request(args.api, "DELETE", f"/holds/{cancelled['holdId']}", student=owner)[0] == 204, "Cancellation failed")
    status, history = request(args.api, "GET", "/me/holds", student=student)
    check(status == 200 and any(item["holdId"] == hold["holdId"] for item in history), "Student history missing")
    status, state = request(args.api, "GET", f"/classes/{class_id}")
    check(status == 200 and state["confirmedSeats"] == 1 and state["heldSeats"] == 3
          and state["availableSeats"] == 1, f"Incorrect seat counts: {state}")
    status, classes = request(args.api, "GET", "/classes")
    check(status == 200 and any(item["id"] == class_id for item in classes), "Class list missing created class")
    args.persistence_file.parent.mkdir(parents=True, exist_ok=True)
    args.persistence_file.write_text(json.dumps({"holdId": hold["holdId"]}))
    print("API contract and concurrency smoke tests passed")


if __name__ == "__main__":
    main()
