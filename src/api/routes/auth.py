"""
Authentication and Identity Router
Handles registration, role-gated sign-in, password reset, and session management.
"""

from typing import Optional
from fastapi import APIRouter, Query, Header, status
from fastapi.responses import JSONResponse
import database
from src.database.supabase_client import get_supabase_client
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
        500: {"description": "Registration server error"}
    }
)
async def signup(payload: SignUpRequest):
    """
    Registers a new user account with Supabase Auth / PostgreSQL and local SQLite backup.
    Officers must present the authorized officer clearance key.
    """
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
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "message": f"Account created successfully for {profile['full_name']} as {profile['role'].capitalize()}.",
                "user": profile
            }
        )
    except ValueError as val_err:
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
        403: {"description": "Role mismatch with target portal"}
    }
)
async def signin(payload: SignInRequest):
    """
    Authenticates email and password against Supabase Auth and local hash storage.
    Enforces strict role gateways so Applicants cannot access Officer portals and vice-versa.
    Allows Officer sign-in even during Maintenance Mode so admins can restore site availability.
    """
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
        return JSONResponse(status_code=status.HTTP_200_OK, content=auth_res)
    else:
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content=auth_res)


@router.post(
    "/forgot-password",
    summary="Dispatch password recovery notification",
    response_model=BaseMessageResponse
)
async def forgot_password(payload: ForgotPasswordRequest):
    """
    Initiates password recovery instructions to the specified email.
    """
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


@router.get(
    "/session",
    summary="Verify stored user profile and role state"
)
async def verify_session(
    user_id: Optional[str] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id")
):
    """
    Validates a persisted user session identifier against stored profile records.
    """
    uid = user_id or x_user_id
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
async def logout():
    """
    Terminates the active user session.
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "message": "Logged out successfully."}
    )
