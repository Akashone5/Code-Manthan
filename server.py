"""
Meridian FairLend - Legacy Entrypoint Wrapper
Delegates HTTP serving cleanly to the FastAPI ASGI application (main:app).
Supports both `python server.py` and `uvicorn server:app`.
"""

import os
import uvicorn
from main import app


def run_server():
    port = int(os.environ.get("PORT", 5000))
    print("=" * 70)
    print("  Meridian FairLend - FastAPI Underwriting Server")
    print(f"  Listening on: http://0.0.0.0:{port}")
    print(f"  Interactive OpenAPI Docs: http://0.0.0.0:{port}/docs")
    print("  Press Ctrl+C to stop.")
    print("=" * 70)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    run_server()
