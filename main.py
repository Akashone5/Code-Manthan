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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@asynccontextmanager
async def lifespan(app: FastAPI):
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

    try:
        database.checkpoint_db('TRUNCATE')
        print("[INFO] Database WAL checkpointed cleanly on shutdown.")
    except Exception as e:
        print(f"[WARN] Shutdown DB checkpoint notice: {e}")

    print("[INFO] Meridian FairLend API shutdown complete.")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

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

app.include_router(auth_router)
app.include_router(underwriting_router)
app.include_router(analytics_router)
app.include_router(system_router)

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

@app.get("/manifest.webmanifest", include_in_schema=False)
async def serve_manifest():
    manifest_file = os.path.join(BASE_DIR, "manifest.webmanifest")
    if os.path.exists(manifest_file):
        return FileResponse(
            manifest_file,
            media_type="application/manifest+json",
            headers={"Cache-Control": "public, max-age=3600"}
        )
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "manifest.webmanifest not found"}
    )

@app.get("/sw.js", include_in_schema=False)
async def serve_service_worker():
    sw_file = os.path.join(BASE_DIR, "sw.js")
    if os.path.exists(sw_file):
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"}
        )
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "sw.js not found"}
    )

ALLOWED_ICONS = {
    "icon-192.png": "image/png",
    "icon-512.png": "image/png",
    "icon-maskable-512.png": "image/png",
    "apple-touch-icon.png": "image/png",
    "app-icon.ico": "image/x-icon",
}

@app.get("/icons/{icon_name}", include_in_schema=False)
async def serve_icon(icon_name: str):
    clean_name = os.path.basename(icon_name or "")
    mime = ALLOWED_ICONS.get(clean_name)
    if not mime or clean_name != icon_name:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "Icon not found"}
        )
    icon_path = os.path.join(BASE_DIR, "icons", clean_name)
    if os.path.exists(icon_path):
        return FileResponse(
            icon_path,
            media_type=mime,
            headers={"Cache-Control": "public, max-age=86400"}
        )
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "Icon file missing"}
    )

@app.get("/.well-known/assetlinks.json", include_in_schema=False)
async def serve_assetlinks():
    asset_file = os.path.join(BASE_DIR, ".well-known", "assetlinks.json")
    if os.path.exists(asset_file):
        return FileResponse(
            asset_file,
            media_type="application/json",
            headers={"Cache-Control": "public, max-age=3600"}
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=[])

ALLOWED_DOWNLOADS = {
    "MeridianFairLend-Windows.exe": "application/vnd.microsoft.portable-executable",
    "MeridianFairLend-Mac.zip": "application/zip",
    "MeridianFairLend-Android.apk": "application/vnd.android.package-archive",
}

@app.get("/api/downloads/info", tags=["System & Diagnostics"], summary="Check available downloadable app installers across Laptop and Phone")
async def get_downloads_info():
    dl_dir = os.path.join(BASE_DIR, "downloads")
    def _file_meta(fname: str):
        fpath = os.path.join(dl_dir, fname)
        exists = os.path.isfile(fpath)
        return {
            "available": exists,
            "filename": fname,
            "url": f"/downloads/{fname}",
            "size_bytes": os.path.getsize(fpath) if exists else 0
        }

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "app_name": "Meridian FairLend AI",
            "version": "2.0.0",
            "pwa_ready": (
                os.path.isfile(os.path.join(BASE_DIR, "manifest.webmanifest"))
                and os.path.isfile(os.path.join(BASE_DIR, "sw.js"))
            ),
            "platforms": {
                "windows": _file_meta("MeridianFairLend-Windows.exe"),
                "android": _file_meta("MeridianFairLend-Android.apk"),
                "mac": _file_meta("MeridianFairLend-Mac.zip"),
                "ios": {
                    "available": True,
                    "mode": "safari-home-screen",
                    "apple_touch_icon": "/icons/apple-touch-icon.png"
                }
            }
        }
    )

@app.get("/downloads/{file_name}", include_in_schema=False)
async def serve_download_binary(file_name: str):
    clean_name = os.path.basename(file_name or "")
    mime = ALLOWED_DOWNLOADS.get(clean_name)
    if not mime or clean_name != file_name:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": "Requested installer not found"}
        )
    file_path = os.path.join(BASE_DIR, "downloads", clean_name)
    if not os.path.isfile(file_path):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": f"{clean_name} is not built yet"}
        )
    return FileResponse(
        file_path,
        media_type=mime,
        filename=clean_name,
        headers={"Content-Disposition": f'attachment; filename="{clean_name}"'}
    )

@app.get("/favicon.svg", include_in_schema=False)
async def serve_favicon_svg():
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

@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    ico_path = os.path.join(BASE_DIR, "icons", "app-icon.ico")
    if os.path.isfile(ico_path):
        return FileResponse(ico_path, media_type="image/x-icon", headers={"Cache-Control": "public, max-age=86400"})
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
