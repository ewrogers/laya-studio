"""Exercise the actual Compose backend (downloads model weights on first use).

python3 tests/smoke.py --web http://localhost:3010
Set LAYA_API_KEY when authentication is enabled.
"""

import argparse
import json
import os
import urllib.request


def call(base, path, payload=None):
    headers = {"Content-Type": "application/json"}
    if os.environ.get("LAYA_API_KEY"):
        headers["Authorization"] = "Bearer " + os.environ["LAYA_API_KEY"]
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=json.dumps(payload).encode() if payload else None,
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=600) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--web", default="http://localhost:3000")
    parser.add_argument("--api", default="http://localhost:8000")
    args = parser.parse_args()
    for base in (args.api, args.web + "/api"):
        assert call(base, "/health")["status"] == "ok"
    body = {
        "state": "I was charged twice for my subscription. Please refund the duplicate charge.",
        "model": "typed-decisions",
        "questions": {
            "department": {
                "type": "choice",
                "instructions": "Which department should handle this request?",
                "criteria": {
                    "billing": "invoices, payments, refunds",
                    "technical": "bugs, outages, system errors",
                    "sales": "pricing, new contracts",
                },
            },
            "urgency": {
                "type": "score",
                "instructions": "How urgent is this request?",
                "criteria": ["not urgent", "needs attention soon", "critical deadline"],
            },
            "refund": {
                "type": "noul",
                "instructions": "Does the user request a refund?",
                "criteria": {
                    "true": "The user asks for money back",
                    "false": "The user does not ask for money back",
                },
            },
        },
    }
    # Exercise both published API and the browser's same-origin proxy.
    for base in (args.api, args.web + "/api"):
        result = call(base, "/v1/systemone", body)
        answers = result["answers"]
        assert answers["department"]["choice"] in body["questions"]["department"]["criteria"]
        assert abs(sum(answers["department"]["probabilities"].values()) - 1) < 0.002
        assert 0 <= answers["urgency"]["score"] <= 2
        assert 0 <= answers["refund"]["noul"] <= 1
        assert result["usage"]["input_tokens"] > 0
        assert result["usage"]["output_tokens"] == 0
        print(f"PASS {base}: choice={answers['department']['choice']}, "
              f"score={answers['urgency']['score']}, P(true)={answers['refund']['noul']}")
    print("Live health, choice, score, yes/no, and proxy checks passed.")


if __name__ == "__main__":
    main()
