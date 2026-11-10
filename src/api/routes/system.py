"""
System Health and Hub Router
Provides service diagnostic checks and interactive engine status view.
"""

from typing import Optional
from fastapi import APIRouter, Header, status
from fastapi.responses import HTMLResponse, JSONResponse
import database
from src.database.supabase_client import get_supabase_client
from src.api.schemas import (
    HealthResponse,
    SiteAvailabilityUpdateRequest,
    SiteAvailabilityResponse
)

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
    avail = database.get_site_availability()
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "healthy",
            "service": "Meridian FairLend",
            "database": db_mode,
            "site_online": avail["online"],
            "site_status": avail["status"]
        }
    )


@router.get(
    "/system/availability",
    summary="Check whether the portal is publicly online or in maintenance mode",
    response_model=SiteAvailabilityResponse
)
async def get_system_availability():
    """
    Returns the persisted website availability state (online vs offline maintenance mode)
    so clients can render either the live portal or the branded offline notice.
    """
    avail = database.get_site_availability()
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, **avail}
    )


@router.post(
    "/system/availability",
    summary="Switch the public website Online or Offline (Officer / Admin Only)",
    response_model=SiteAvailabilityResponse,
    responses={
        200: {"description": "Website availability state updated"},
        403: {"description": "Forbidden: Verified Loan Officer clearance required"}
    }
)
async def update_system_availability(
    payload: SiteAvailabilityUpdateRequest,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    """
    Allows authorized Loan Officers (verified in DB) or institutional passkey holders
    to take the website publicly Offline (Maintenance Mode) or bring it back Online.
    """
    key_candidate = payload.officer_key or x_officer_key
    allowed, actor_name = database.is_verified_officer(
        user_id=x_user_id,
        user_role=x_user_role,
        officer_key=key_candidate
    )
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "success": False,
                "error": "Forbidden: Verified Loan Officer credentials or Officer Passkey required to change website availability."
            }
        )

    updated = database.set_site_availability(
        online=payload.online,
        message=payload.maintenance_message,
        title=payload.title,
        updated_by=actor_name
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, **updated}
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
    avail = database.get_site_availability()
    db_badge = "FASTAPI REST &bull; SUPABASE + SQLITE SYNCED" if sb.is_configured() else "FASTAPI REST &bull; SQLITE PERSISTENCE ACTIVE"
    site_badge = "PUBLIC WEBSITE: ONLINE" if avail["online"] else "PUBLIC WEBSITE: OFFLINE (MAINTENANCE MODE)"
    site_badge_bg = "#059669" if avail["online"] else "#DC2626"

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
        <p>Engine Status: <span class="badge">{db_badge}</span> <span class="badge" style="background: {site_badge_bg}; margin-left: 6px;">{site_badge}</span></p>
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
            <li><code>GET /api/system/availability</code> - Check public Online/Offline website state</li>
            <li><code>POST /api/system/availability</code> - Switch website Online or Offline (Officer/Admin only)</li>
            <li><code>GET /docs</code> - Interactive Swagger UI documentation</li>
            <li><code>GET /redoc</code> - Detailed ReDoc specifications</li>
        </ul>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html_content, status_code=200)
