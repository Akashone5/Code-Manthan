from typing import Optional
from fastapi import APIRouter, Query, Header, Request, status
from fastapi.responses import JSONResponse
import database
from src.database.supabase_client import get_supabase_client
from src.api.rate_limit import auth_rate_limiter, get_client_ip
from src.api.schemas import (
    SignUpRequest,
    SignInRequest,
    ForgotPasswordRequest,
    AuthSuccessResponse,
    BaseMessageResponse
)

router = APIRouter(prefix="/api/auth", tags=["Authentication & Identity"])

@router.post(
    "/signup",
    summary="Register a new Applicant or Loan Officer",
    response_model=AuthSuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Account registered successfully"},
        400: {"description": "Validation error or invalid officer key"},
        429: {"description": "Too many failed attempts"},
        500: {"description": "Registration server error"}
    }
)
async def signup(payload: SignUpRequest, request: Request):
    client_ip = get_client_ip(request)
    if payload.role == "officer":
        blocked, retry_after = auth_rate_limiter.is_blocked(client_ip, "signup_officer")
        if blocked:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(retry_after)},
                content={
                    "success": False,
                    "error": f"Too many invalid clearance attempts. Please wait {retry_after} seconds."
                }
            )

    avail = database.get_site_availability()
    if not avail["online"] and payload.role != "officer":
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success": False,
                "offline": True,
                "error": avail["maintenance_message"],
                "maintenance_message": avail["maintenance_message"]
            }
        )

    if payload.confirm_password and payload.password != payload.confirm_password:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Passwords do not match."}
        )

    try:
        profile = database.register_user(
            full_name=payload.full_name,
            email=payload.email,
            phone=payload.phone or "",
            password=payload.password,
            role=payload.role,
            officer_key=payload.officer_key
        )
        if payload.role == "officer":
            auth_rate_limiter.reset(client_ip, "signup_officer")
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "message": f"Account created successfully for {profile['full_name']} as {profile['role'].capitalize()}.",
                "user": profile
            }
        )
    except ValueError as val_err:
        if payload.role == "officer" and "Passkey" in str(val_err):
            auth_rate_limiter.record_failure(client_ip, "signup_officer")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": str(val_err)}
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "error": f"Registration failed: {str(e)}"}
        )

@router.post(
    "/signin",
    summary="Authenticate credentials with role gateway enforcement",
    responses={
        200: {"description": "Authentication successful"},
        401: {"description": "Invalid email or password"},
        403: {"description": "Role mismatch with target portal"},
        429: {"description": "Too many failed login attempts"}
    }
)
async def signin(payload: SignInRequest, request: Request):
    client_ip = get_client_ip(request)
    blocked, retry_after = auth_rate_limiter.is_blocked(client_ip, "signin")
    if blocked:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            content={
                "success": False,
                "error": f"Too many failed login attempts. Please wait {retry_after} seconds and try again."
            }
        )

    expected_role = payload.expected_role or payload.role
    avail = database.get_site_availability()
    if not avail["online"] and expected_role == "applicant":
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success": False,
                "offline": True,
                "error": avail["maintenance_message"],
                "maintenance_message": avail["maintenance_message"]
            }
        )

    auth_res = database.login_user(email=payload.email, password=payload.password)

    if auth_res.get("success"):
        user_role = auth_res.get("user", {}).get("role", "applicant")
        if not avail["online"] and user_role != "officer":
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "success": False,
                    "offline": True,
                    "error": avail["maintenance_message"],
                    "maintenance_message": avail["maintenance_message"]
                }
            )
        if expected_role and user_role != expected_role:
            auth_rate_limiter.record_failure(client_ip, "signin")
            if expected_role == "officer":
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "success": False,
                        "error": "Access Denied: This account is registered as an Applicant. Please use the Applicant Sign In tab."
                    }
                )
            else:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "success": False,
                        "error": "Notice: This account has Loan Officer clearance. Please use the Officer Sign In tab."
                    }
                )
        auth_rate_limiter.reset(client_ip, "signin")
        return JSONResponse(status_code=status.HTTP_200_OK, content=auth_res)
    else:
        auth_rate_limiter.record_failure(client_ip, "signin")
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content=auth_res)

@router.post(
    "/forgot-password",
    summary="Dispatch password recovery notification",
    response_model=BaseMessageResponse
)
async def forgot_password(payload: ForgotPasswordRequest):
    email = payload.email.strip().lower()
    if not email:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Email is required."}
        )

    sb = get_supabase_client()
    if sb.is_configured():
        try:
            sb.auth_reset_password(email)
        except Exception:
            pass

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "message": f"Password recovery instructions have been dispatched to {email}. If verified, follow the secure link."
        }
    )

def _extract_session_token(
    authorization: Optional[str] = None,
    x_session_token: Optional[str] = None,
    token: Optional[str] = None
) -> str:
    if authorization and authorization.strip():
        raw = authorization.strip()
        if raw.lower().startswith("bearer "):
            return raw[7:].strip()
        return raw
    if x_session_token and x_session_token.strip():
        return x_session_token.strip()
    if token and token.strip():
        return token.strip()
    return ""

@router.get(
    "/session",
    summary="Verify stored user profile and role state"
)
async def verify_session(
    user_id: Optional[str] = Query(default=None),
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_session_token: Optional[str] = Header(default=None, alias="X-Session-Token"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id")
):
    session_token = _extract_session_token(authorization, x_session_token, token)
    uid = user_id or x_user_id

    if session_token:
        verified_user = database.verify_session_token(session_token)
        if not verified_user:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"success": False, "error": "Session expired or revoked. Please sign in again."}
            )
        if uid and str(verified_user.get("id", "")) != str(uid).strip():
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"success": False, "error": "Session identity mismatch."}
            )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"success": True, "user": verified_user}
        )

    if not uid:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "error": "No active user identifier provided."}
        )

    profile = database.get_user_profile(uid)
    if not profile:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": "Session user profile not found."}
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "user": profile}
    )

@router.post(
    "/logout",
    summary="Terminate active session",
    response_model=BaseMessageResponse
)
async def logout(
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_session_token: Optional[str] = Header(default=None, alias="X-Session-Token")
):
    session_token = _extract_session_token(authorization, x_session_token, token)
    if session_token:
        database.revoke_session_token(session_token)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "message": "Logged out successfully."}
    )
