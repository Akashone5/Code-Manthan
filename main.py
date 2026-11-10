"""
Meridian FairLend - Production FastAPI Application
Mission Bharat • Explainable Credit Decision & Algorithmic Equity Platform
"""

import os
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError

from backend import load_sample_dataset
import database
from src.api.routes import (
    auth_router,
    underwriting_router,
    analytics_router,
    system_router
)

# Base directory for resolving static frontend assets
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager. Initializes portfolio data caches
    and ensures SQLite / Supabase tables are ready on startup.
    """
    print("[INFO] Initializing portfolio dataset cache...")
    try:
        load_sample_dataset()
        print("[INFO] Portfolio dataset cache loaded successfully.")
    except Exception as e:
        print(f"[WARN] Failed to preload portfolio dataset: {e}")

    try:
        database.init_db()
        print("[INFO] Database repository initialized and synchronized.")
    except Exception as e:
        print(f"[WARN] Database initialization notice: {e}")

    yield

    print("[INFO] Meridian FairLend API shutdown complete.")


# FastAPI Application Definition with OpenAPI Metadata
app = FastAPI(
    title="Meridian FairLend - Credit Decision & Underwriting API",
    description=(
        "Production-grade RESTful API for automated, transparent retail credit underwriting. "
        "Provides multi-tenant authentication (Applicant & Loan Officer gateways), "
        "L2-regularized logistic scoring, SHAP factor attribution, counterfactual scenario simulation, "
        "and four-fifths (80%) algorithmic equity auditing."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Authentication & Identity", "description": "User registration, role-gated sign-in, and session controls."},
        {"name": "Loan Underwriting & Decisioning", "description": "Credit evaluation, SHAP explainability, scenario simulation, and officer adjudication."},
        {"name": "Algorithmic Equity & Analytics", "description": "Demographic parity auditing, performance benchmarks, and portfolio datasets."},
        {"name": "System & Diagnostics", "description": "Health verification and interactive API hub."},
    ]
)

# Cross-Origin Resource Sharing (CORS) Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Global Exception Handlers for Standardized JSON Responses
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": "Validation error in request payload.",
            "details": exc.errors()
        }
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": f"Internal server error: {str(exc)}"
        }
    )


# Include Domain Routers
app.include_router(auth_router)
app.include_router(underwriting_router)
app.include_router(analytics_router)
app.include_router(system_router)


# Static File Routes for the Frontend Web Application
@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
async def serve_index():
    index_file = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type="text/html")
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "index.html not found"}
    )


@app.get("/styles.css", include_in_schema=False)
async def serve_css():
    css_file = os.path.join(BASE_DIR, "styles.css")
    if os.path.exists(css_file):
        return FileResponse(css_file, media_type="text/css")
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "styles.css not found"}
    )


@app.get("/app.js", include_in_schema=False)
async def serve_app_js():
    js_file = os.path.join(BASE_DIR, "app.js")
    if os.path.exists(js_file):
        return FileResponse(js_file, media_type="application/javascript")
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "app.js not found"}
    )


@app.get("/dataset_data.js", include_in_schema=False)
async def serve_dataset_js():
    data_file = os.path.join(BASE_DIR, "dataset_data.js")
    if os.path.exists(data_file):
        return FileResponse(data_file, media_type="application/javascript")
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "dataset_data.js not found"}
    )


@app.get("/favicon.svg", include_in_schema=False)
@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    svg_icon = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#064E3B"/><stop offset="100%" stop-color="#032C21"/>'
        '</linearGradient></defs>'
        '<rect width="64" height="64" rx="14" fill="url(#g)" stroke="#F8E7C9" stroke-width="3"/>'
        '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" '
        'font-family="Arial,sans-serif" font-weight="900" font-size="36" fill="#F8E7C9">M</text>'
        '</svg>'
    )
    return Response(content=svg_icon, media_type="image/svg+xml", status_code=status.HTTP_200_OK)


@app.get("/robots.txt", include_in_schema=False)
async def serve_robots():
    return Response(
        content="User-agent: *\nAllow: /\nDisallow: /api/\n",
        media_type="text/plain",
        status_code=status.HTTP_200_OK
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 5000))
    print("=" * 70)
    print("  Meridian FairLend - Production FastAPI Server")
    print(f"  Listening on: http://localhost:{port}")
    print(f"  Interactive OpenAPI Docs: http://localhost:{port}/docs")
    print(f"  ReDoc API Reference: http://localhost:{port}/redoc")
    print("=" * 70)
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
