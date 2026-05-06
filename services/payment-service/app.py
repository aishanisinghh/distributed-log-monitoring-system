from flask import Flask
import time
import random
import json
from datetime import datetime
import threading

app = Flask(__name__)

@app.route("/")
def home():
    return {"message": "Payment Service Running"}

@app.route("/health")
def health():
    return {"status": "UP"}


def generate_logs():
    while True:
        log = {
            "service": "payment-service",
            "level": random.choice(["INFO", "WARN", "ERROR"]),
            "message": random.choice([
                "Payment success",
                 "Payment failed",
                "Gateway timeout",
                  "Invalid card"
            ]),
            "timestamp": datetime.utcnow().isoformat()
        }

        print(json.dumps(log), flush=True)  # IMPORTANT
        time.sleep(3)


if __name__ == "__main__":
    threading.Thread(target=generate_logs).start()
    app.run(host="0.0.0.0", port=5000)
