import html as html_lib
import json
import os
import re
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

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
app.add_middleware(GZipMiddleware, minimum_size=500)

DEFAULT_CANONICAL_BASE = "https://meridian-fairlend-production.up.railway.app"
SITE_LASTMOD = "2026-11-11"

SLUG_SEO_META: Dict[str, Dict[str, str]] = {
    "/": {
        "title": "Meridian FairLend AI • MISSION BHARAT | Explainable Loan Decision System",
        "description": "Meridian FairLend Mission Bharat: Transparent credit underwriting, SHAP explainability, counterfactual scenario simulation, and algorithmic equity portal.",
        "crumb": "Home",
        "priority": "1.0",
    },
    "/applicant": {
        "title": "Applicant Loan Portal • Apply & Track Loans | Meridian FairLend AI",
        "description": "Sign in or register as an Applicant on Meridian FairLend AI to submit loan requests, test interactive What-If scenarios, and download RBI Key Fact Statements.",
        "crumb": "Applicant Portal",
        "priority": "0.95",
    },
    "/officer": {
        "title": "Loan Officer Institutional Portal & Cockpit | Meridian FairLend AI",
        "description": "Institutional Loan Officer portal for real-time SHAP underwriting inspection, regulatory audit trails, portfolio analytics, and 80% fairness calibration.",
        "crumb": "Officer Portal",
        "priority": "0.95",
    },
    "/apply": {
        "title": "Apply for a Retail Loan • Direct Borrower Intake | Meridian FairLend AI",
        "description": "Submit a transparent retail credit application in INR with CIBIL calibration, 1-to-30 year flexible tenure, and instant AI underwriting assessment.",
        "crumb": "Apply for a Loan",
        "priority": "0.90",
    },
    "/decision-report": {
        "title": "Decision Report & Counterfactual Simulator | Meridian FairLend AI",
        "description": "Inspect plain-language AI decision breakdowns, adjust interactive loan What-If sliders, and print official RBI Key Fact Statement (KFS) letters.",
        "crumb": "Decision Report",
        "priority": "0.85",
    },
    "/vault": {
        "title": "Application Vault & Registry | Meridian FairLend AI",
        "description": "Access permanently archived loan applications, CSV/JSON/SQLite exports, and live officer sanction statuses in the Meridian Vault.",
        "crumb": "Application Vault",
        "priority": "0.85",
    },
    "/underwriting-cockpit": {
        "title": "Underwriting Cockpit & SHAP Waterfall | Meridian FairLend AI",
        "description": "Evaluate borrower variables live with additive SHAP attribution, DTI ratios, and institutional sanction recording.",
        "crumb": "Underwriting Cockpit",
        "priority": "0.80",
    },
    "/portfolio": {
        "title": "Historical Lending Portfolio Analytics | Meridian FairLend AI",
        "description": "Browse, search, and audit historical retail loan records across rural, semi-urban, and metropolitan Mission Bharat segments.",
        "crumb": "Historical Portfolio",
        "priority": "0.80",
    },
    "/model-accuracy": {
        "title": "Model Accuracy & Confusion Matrix Report | Meridian FairLend AI",
        "description": "Review holdout validation accuracy, ROC-AUC metrics, confusion matrix breakdowns, and global feature weights for regulatory governance.",
        "crumb": "Model Accuracy",
        "priority": "0.80",
    },
    "/fairness-audit": {
        "title": "Demographic Parity & 80% Fairness Audit | Meridian FairLend AI",
        "description": "Monitor four-fifths (80%) Disparate Impact Ratios and Equal Opportunity TPR parity across gender, territory, and education groups.",
        "crumb": "Fairness Audit",
        "priority": "0.80",
    },
    "/privacy": {
        "title": "Privacy Policy & DPDP Act 2023 Compliance | Meridian FairLend AI",
        "description": "Read how Meridian FairLend AI protects borrower identity, CIBIL disclosures, PBKDF2 security, and Digital Personal Data Protection compliance.",
        "crumb": "Privacy Policy",
        "priority": "0.70",
    },
    "/terms": {
        "title": "Terms of Service & RBI Digital Lending Framework | Meridian FairLend AI",
        "description": "Review lending terms, statutory 3-day cooling-off period rights, zero processing fees, and Fair Practices Code obligations.",
        "crumb": "Terms of Service",
        "priority": "0.70",
    },
    "/grievance": {
        "title": "Grievance Redressal & RBI Ombudsman | Meridian FairLend AI",
        "description": "Contact the Nodal Grievance Officer on toll-free 1800-209-4000 or grievance.bharat@meridian.fin and escalate via the RBI Integrated Ombudsman Scheme (14448).",
        "crumb": "Grievance Redressal",
        "priority": "0.75",
    },
    "/forgot-password": {
        "title": "Reset Account Password via Email OTP | Meridian FairLend AI",
        "description": "Recover access to your Meridian FairLend AI Applicant or Loan Officer account using 6-digit verified email OTP.",
        "crumb": "Reset Password",
        "priority": "0.50",
    },
}


def get_public_base_url(request: Request) -> str:
    env_base = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if env_base:
        return env_base
    fwd_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    host = fwd_host or (request.headers.get("host") or "").strip()
    fwd_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    proto = fwd_proto or request.url.scheme or "https"
    if host and host not in ("testserver", "testclient"):
        return f"{proto}://{host}".rstrip("/")
    return DEFAULT_CANONICAL_BASE


def build_json_ld_payload(base_url: str, canonical_url: str, slug_path: str, crumb_label: str) -> str:
    og_img = f"{base_url}/icons/og-share.png"
    logo_img = f"{base_url}/icons/icon-512.png"
    breadcrumb_items = [
        {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": f"{base_url}/",
        }
    ]
    if slug_path != "/":
        breadcrumb_items.append(
            {
                "@type": "ListItem",
                "position": 2,
                "name": crumb_label,
                "item": canonical_url,
            }
        )

    payload = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": f"{base_url}/#organization",
                "name": "Meridian FairLend AI",
                "url": f"{base_url}/",
                "logo": {
                    "@type": "ImageObject",
                    "url": logo_img,
                    "width": 512,
                    "height": 512,
                },
                "telephone": "+91-1800-209-4000",
                "email": "grievance.bharat@meridian.fin",
            },
            {
                "@type": ["FinancialService", "LocalBusiness"],
                "@id": f"{base_url}/#localbusiness",
                "name": "Meridian FairLend AI — Mission Bharat",
                "description": "AI-powered explainable retail credit underwriting and demographic fairness lending institution operating under RBI Digital Lending Directions.",
                "url": f"{base_url}/",
                "image": [og_img, logo_img],
                "telephone": "+91-1800-209-4000",
                "email": "grievance.bharat@meridian.fin",
                "priceRange": "₹0 Processing Fee",
                "areaServed": "IN",
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "Inclusive Retail Credit Division, Nariman Point",
                    "addressLocality": "Mumbai",
                    "addressRegion": "MH",
                    "postalCode": "400021",
                    "addressCountry": "IN",
                },
                "geo": {
                    "@type": "GeoCoordinates",
                    "latitude": 18.9256,
                    "longitude": 72.8242,
                },
                "openingHoursSpecification": [
                    {
                        "@type": "OpeningHoursSpecification",
                        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                        "opens": "09:00",
                        "closes": "19:00",
                    }
                ],
                "contactPoint": {
                    "@type": "ContactPoint",
                    "telephone": "+91-1800-209-4000",
                    "email": "grievance.bharat@meridian.fin",
                    "contactType": "customer service",
                    "areaServed": "IN",
                    "availableLanguage": ["en", "hi"],
                },
            },
            {
                "@type": "WebSite",
                "@id": f"{base_url}/#website",
                "url": f"{base_url}/",
                "name": "Meridian FairLend AI",
                "publisher": {"@id": f"{base_url}/#organization"},
                "inLanguage": ["en-IN", "hi-IN"],
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{canonical_url}#breadcrumb",
                "itemListElement": breadcrumb_items,
            },
        ],
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def inject_seo_into_html(html_text: str, base_url: str, slug_path: str) -> str:
    meta = SLUG_SEO_META.get(slug_path, SLUG_SEO_META["/"])
    title_esc = html_lib.escape(meta["title"])
    desc_esc = html_lib.escape(meta["description"])
    canonical_url = f"{base_url}/" if slug_path == "/" else f"{base_url}{slug_path}"
    canonical_esc = html_lib.escape(canonical_url)
    og_image_esc = html_lib.escape(f"{base_url}/icons/og-share.png")
    json_ld = build_json_ld_payload(base_url, canonical_url, slug_path, meta["crumb"])

    out = re.sub(r"<title>.*?</title>", f"<title>{title_esc}</title>", html_text, count=1, flags=re.DOTALL)
    out = re.sub(
        r'<meta name="description" content="[^"]*">',
        f'<meta name="description" content="{desc_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<link rel="canonical" href="[^"]*">',
        f'<link rel="canonical" href="{canonical_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<meta property="og:title" content="[^"]*">',
        f'<meta property="og:title" content="{title_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<meta property="og:description" content="[^"]*">',
        f'<meta property="og:description" content="{desc_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<meta property="og:url" content="[^"]*">',
        f'<meta property="og:url" content="{canonical_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<meta property="og:image" content="[^"]*">',
        f'<meta property="og:image" content="{og_image_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<meta name="twitter:title" content="[^"]*">',
        f'<meta name="twitter:title" content="{title_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<meta name="twitter:description" content="[^"]*">',
        f'<meta name="twitter:description" content="{desc_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<meta name="twitter:image" content="[^"]*">',
        f'<meta name="twitter:image" content="{og_image_esc}">',
        out,
        count=1,
    )
    out = re.sub(
        r'<script id="structured-data-jsonld" type="application/ld\+json">.*?</script>',
        f'<script id="structured-data-jsonld" type="application/ld+json">{json_ld}</script>',
        out,
        count=1,
        flags=re.DOTALL,
    )
    return out


def render_404_page(request: Request) -> HTMLResponse:
    base_url = get_public_base_url(request)
    f404 = os.path.join(BASE_DIR, "404.html")
    if os.path.exists(f404):
        with open(f404, "r", encoding="utf-8") as fh:
            content = fh.read()
        content = content.replace(DEFAULT_CANONICAL_BASE, base_url)
        return HTMLResponse(content=content, status_code=status.HTTP_404_NOT_FOUND)
    return HTMLResponse(
        content="<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><title>404 — Page Not Found | Meridian FairLend AI</title></head><body><h1>404 — Page Not Found</h1><p><a href='/'>Return Home</a></p></body></html>",
        status_code=status.HTTP_404_NOT_FOUND,
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    path = request.url.path or "/"
    if path.startswith("/api/") or path.startswith("/downloads/") or path.startswith("/icons/"):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.detail},
        )
    if exc.status_code == status.HTTP_404_NOT_FOUND:
        return render_404_page(request)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
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
@app.get("/applicant", include_in_schema=False)
@app.get("/officer", include_in_schema=False)
@app.get("/apply", include_in_schema=False)
@app.get("/decision-report", include_in_schema=False)
@app.get("/vault", include_in_schema=False)
@app.get("/underwriting-cockpit", include_in_schema=False)
@app.get("/portfolio", include_in_schema=False)
@app.get("/model-accuracy", include_in_schema=False)
@app.get("/fairness-audit", include_in_schema=False)
@app.get("/privacy", include_in_schema=False)
@app.get("/terms", include_in_schema=False)
@app.get("/grievance", include_in_schema=False)
@app.get("/forgot-password", include_in_schema=False)
async def serve_index(request: Request):
    index_file = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as fh:
            raw_html = fh.read()
        raw_path = (request.url.path or "/").rstrip("/") or "/"
        slug_path = "/" if raw_path == "/index.html" else raw_path
        base_url = get_public_base_url(request)
        rendered = inject_seo_into_html(raw_html, base_url, slug_path)
        return HTMLResponse(
            content=rendered,
            status_code=status.HTTP_200_OK,
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "index.html not found"}
    )


@app.get("/404.html", include_in_schema=False)
async def serve_custom_404_file(request: Request):
    return render_404_page(request)

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
    "favicon-32x32.png": "image/png",
    "og-share.png": "image/png",
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
            "version": "3.0.0",
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
async def serve_robots(request: Request):
    base_url = get_public_base_url(request)
    robots_body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /downloads/\n"
        f"Sitemap: {base_url}/sitemap.xml\n"
    )
    return Response(
        content=robots_body,
        media_type="text/plain; charset=utf-8",
        status_code=status.HTTP_200_OK
    )


@app.get("/sitemap.xml", include_in_schema=False)
async def serve_sitemap(request: Request):
    base_url = get_public_base_url(request)
    url_nodes = []
    for slug_path, meta in SLUG_SEO_META.items():
        if slug_path == "/forgot-password":
            continue
        loc = f"{base_url}/" if slug_path == "/" else f"{base_url}{slug_path}"
        url_nodes.append(
            f"  <url>\n"
            f"    <loc>{html_lib.escape(loc)}</loc>\n"
            f"    <lastmod>{SITE_LASTMOD}</lastmod>\n"
            f"    <changefreq>weekly</changefreq>\n"
            f"    <priority>{meta.get('priority', '0.7')}</priority>\n"
            f"  </url>"
        )
    xml_doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(url_nodes)
        + "\n</urlset>\n"
    )
    return Response(
        content=xml_doc,
        media_type="application/xml; charset=utf-8",
        status_code=status.HTTP_200_OK
    )


@app.get("/urllist.txt", include_in_schema=False)
async def serve_urllist(request: Request):
    base_url = get_public_base_url(request)
    lines = [
        f"{base_url}/" if slug_path == "/" else f"{base_url}{slug_path}"
        for slug_path in SLUG_SEO_META.keys()
        if slug_path != "/forgot-password"
    ]
    return Response(
        content="\n".join(lines) + "\n",
        media_type="text/plain; charset=utf-8",
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
