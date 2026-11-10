"""
System Health and Hub Router
Provides service diagnostic checks and interactive engine status view.
"""

from fastapi import APIRouter, status
from fastapi.responses import HTMLResponse, JSONResponse
import database
from src.database.supabase_client import get_supabase_client
from src.api.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["System & Diagnostics"])


@router.get(
    "/health",
    summary="Service health and database synchronization check",
    response_model=HealthResponse
)
async def health_check():
    """
    Returns API runtime health, service identifier, and database persistence status.
    Used by load balancers, container orchestrators, and frontend connectivity checks.
    """
    sb = get_supabase_client()
    db_mode = "dual-sync (Supabase + SQLite)" if sb.is_configured() else "sqlite-local"
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "healthy",
            "service": "Meridian FairLend",
            "database": db_mode
        }
    )


@router.get(
    "",
    summary="Interactive Credit Underwriting Hub and Service Overview",
    response_class=HTMLResponse
)
async def api_hub():
    """
    Renders the live system status card and REST API directory.
    """
    saved_apps = database.get_all_saved_applications(role="officer")
    sb = get_supabase_client()
    db_badge = "FASTAPI REST &bull; SUPABASE + SQLITE SYNCED" if sb.is_configured() else "FASTAPI REST &bull; SQLITE PERSISTENCE ACTIVE"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Meridian FairLend - Credit Underwriting Hub</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #0F172A; color: #F8FAFC; }}
        .card {{ background: #1E293B; padding: 28px; border-radius: 12px; border: 1.5px solid #334155; max-width: 680px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }}
        h1 {{ margin-top: 0; color: #38BDF8; font-size: 1.6rem; }}
        code {{ background: #0F172A; color: #38BDF8; padding: 3px 6px; border-radius: 4px; font-weight: 600; font-size: 0.9rem; }}
        .badge {{ background: #0284C7; color: white; padding: 4px 12px; border-radius: 99px; font-weight: 600; font-size: 0.85rem; }}
        ul {{ line-height: 1.8; }}
        a {{ color: #38BDF8; text-decoration: none; }}
        .docs-link {{ display: inline-block; margin-top: 15px; padding: 8px 16px; background: #0284C7; color: #FFFFFF; border-radius: 6px; font-weight: 600; margin-right: 10px; }}
        .docs-link:hover {{ background: #0369A1; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Meridian FairLend - Credit Underwriting Hub</h1>
        <p>Engine Status: <span class="badge">{db_badge}</span></p>
        <p>Active Applications in Vault: <strong>{len(saved_apps)} records</strong></p>
        <a href="/docs" class="docs-link" target="_blank">Open Interactive Swagger API Docs &rarr;</a>
        <a href="/" class="docs-link" style="background: #059669;">Launch Web Portal &rarr;</a>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
        <h3>Authentication &amp; Production API Endpoints:</h3>
        <ul>
            <li><code>POST /api/auth/signup</code> - Register new Applicant or Officer (Requires Passkey)</li>
            <li><code>POST /api/auth/signin</code> - Authenticate user credentials &amp; issue session</li>
            <li><code>POST /api/auth/logout</code> - Terminate active session</li>
            <li><code>GET /api/saved-applications</code> - Role-based application retrieval</li>
            <li><code>POST /api/apply</code> - Submit loan application linked to authenticated user</li>
            <li><code>POST /api/predict</code> - Credit decision &amp; factor explainability</li>
            <li><code>POST /api/what-if</code> - Counterfactual scenario simulator</li>
            <li><code>POST /api/officer/sanction</code> - Authorized officer decisioning &amp; remarks</li>
            <li><code>GET /api/fairness</code> - Four-fifths (80%) demographic parity audit</li>
            <li><code>GET /api/accuracy</code> - Underwriting validation performance report</li>
            <li><code>GET /api/health</code> - JSON uptime health probe</li>
            <li><code>GET /docs</code> - Interactive Swagger UI documentation</li>
            <li><code>GET /redoc</code> - Detailed ReDoc specifications</li>
        </ul>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html_content, status_code=200)
