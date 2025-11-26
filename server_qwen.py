"""
Compatibility shim so `python3 server_qwen.py` still runs the app in main.py.
"""
from main import app  # noqa: F401
import os

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 5000))
    ssl_keyfile = "certs/key.pem"
    ssl_certfile = "certs/cert.pem"
    use_https = os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile)

    run_options = {
        "host": "0.0.0.0",
        "port": port,
        "reload": False,
        "access_log": False,
        "log_level": "info",
    }

    if use_https:
        run_options["ssl_keyfile"] = ssl_keyfile
        run_options["ssl_certfile"] = ssl_certfile
        print("🔒 SSL is enabled (server_qwen shim)")
    else:
        print("⚠️ SSL certificates not found; running over HTTP (server_qwen shim)")

    uvicorn.run("main:app", **run_options)
