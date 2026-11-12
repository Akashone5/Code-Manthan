from typing import Optional
from fastapi import APIRouter, Header, Request, status
from fastapi.responses import HTMLResponse, JSONResponse
import database
from src.database.supabase_client import get_supabase_client
from src.api.rate_limit import auth_rate_limiter, get_client_ip
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
    sb = get_supabase_client()
    db_mode = "dual-sync (Supabase + SQLite)" if sb.is_configured() else "sqlite-local"
    avail = database.get_site_availability()
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "healthy",
            "service": "RinDristi FairLend",
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
        403: {"description": "Forbidden: Verified Loan Officer clearance required"},
        429: {"description": "Too many failed authorization attempts"}
    }
)
async def update_system_availability(
    payload: SiteAvailabilityUpdateRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    client_ip = get_client_ip(request)
    blocked, retry_after = auth_rate_limiter.is_blocked(client_ip, "availability_key")
    if blocked:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            content={
                "success": False,
                "error": f"Too many unauthorized attempts. Please wait {retry_after} seconds."
            }
        )

    actor_uid = x_user_id
    actor_role = x_user_role
    if authorization and authorization.strip():
        verified = database.verify_session_token(authorization)
        if verified:
            actor_uid = str(verified.get("id") or "") or None
            actor_role = str(verified.get("role") or "") or None
        else:
            actor_uid = None
            actor_role = None

    key_candidate = payload.officer_key or x_officer_key
    allowed, actor_name = database.is_verified_officer(
        user_id=actor_uid,
        user_role=actor_role,
        officer_key=key_candidate
    )
    if not allowed:
        auth_rate_limiter.record_failure(client_ip, "availability_key")
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "success": False,
                "error": "Forbidden: Verified Loan Officer credentials or Officer Passkey required to change website availability."
            }
        )

    auth_rate_limiter.reset(client_ip, "availability_key")
    updated = database.set_site_availability(
        online=payload.online,
        message=payload.maintenance_message,
        title=payload.title,
        updated_by=actor_name,
        officer_id=actor_uid
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
    saved_apps = database.get_all_saved_applications(role="officer")
    sb = get_supabase_client()
    avail = database.get_site_availability()
    db_badge = "FASTAPI REST &bull; SUPABASE + SQLITE SYNCED" if sb.is_configured() else "FASTAPI REST &bull; SQLITE PERSISTENCE ACTIVE"
    site_badge = "PUBLIC WEBSITE: ONLINE" if avail["online"] else "PUBLIC WEBSITE: OFFLINE (MAINTENANCE MODE)"
    site_badge_bg = "#059669" if avail["online"] else "#DC2626"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>RinDristi FairLend - Credit Underwriting Hub</title>
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
        <h1>RinDristi FairLend - Credit Underwriting Hub</h1>
        <p>Engine Status: <span class="badge">{db_badge}</span> <span class="badge" style="background: {site_badge_bg}; margin-left: 6px;">{site_badge}</span></p>
        <p>Active Applications in Vault: <strong>{len(saved_apps)} records</strong></p>
        <a href="/docs" class="docs-link" target="_blank">Open Interactive Swagger API Docs &rarr;</a>
        <a href="/" class="docs-link" style="background: #059669;">Launch Web Portal &rarr;</a>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
        <h3>Authentication &amp; Production API Endpoints:</h3>
        <ul>
            <li><code>POST /api/auth/signup</code> - Register new Applicant or Officer (Requires Passkey)</li>
            <li><code>POST /api/auth/signin</code> - Authenticate user credentials &amp; issue persistent session</li>
            <li><code>GET /api/auth/session</code> - Verify stored Bearer / session token state</li>
            <li><code>PATCH /api/auth/profile</code> - Update account name and email address</li>
            <li><code>POST /api/auth/logout</code> - Terminate &amp; revoke active session</li>
            <li><code>GET /api/saved-applications</code> - Strict role-isolated application retrieval</li>
            <li><code>POST /api/apply</code> - Submit loan application (Applicant Portal only)</li>
            <li><code>GET/PATCH /api/application/{{application_no}}</code> - Fetch or persist What-If underwriting updates</li>
            <li><code>POST /api/predict</code> - Credit decision &amp; factor explainability</li>
            <li><code>POST /api/what-if</code> - Counterfactual scenario simulator</li>
            <li><code>POST /api/officer/sanction</code> - Authorized officer decisioning &amp; remarks</li>
            <li><code>GET/POST /api/officer/audit-logs</code> - Persistent compliance audit trail (Officer only)</li>
            <li><code>GET /api/officer/backup</code> - Atomic SQLite / JSON vault snapshot (Officer only)</li>
            <li><code>GET /api/fairness</code> - Four-fifths (80%) demographic parity audit (Officer only)</li>
            <li><code>GET /api/accuracy</code> - Underwriting validation performance report (Officer only)</li>
            <li><code>GET /api/applicants</code> - Institutional portfolio sample records (Officer only)</li>
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
