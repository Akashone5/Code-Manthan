from typing import Optional
from fastapi import APIRouter, Query, Header, Request, status
from fastapi.responses import JSONResponse
import database
from src.database.supabase_client import get_supabase_client
from src.api import email_service
from src.api.rate_limit import auth_rate_limiter, otp_send_rate_limiter, get_client_ip
from src.api.schemas import (
    SignUpRequest,
    SignInRequest,
    ForgotPasswordRequest,
    SendOtpRequest,
    VerifyOtpRequest,
    ResetPasswordRequest,
    ProfileUpdateRequest,
    AuthSuccessResponse,
    BaseMessageResponse
)

router = APIRouter(prefix="/api/auth", tags=["Authentication & Identity"])

@router.get(
    "/otp-status",
    summary="Retrieve email OTP configuration and enforcement status"
)
async def otp_status():
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, **email_service.get_email_otp_status()}
    )

@router.post(
    "/send-otp",
    summary="Send a 6-digit verification OTP to the user email"
)
async def send_otp(payload: SendOtpRequest, request: Request):
    client_ip = get_client_ip(request)
    email = (payload.email or "").strip().lower()
    purpose = (payload.purpose or "signup").strip().lower()
    lang = (payload.lang or "en").strip().lower()

    if purpose not in ("signup", "forgot_password", "application"):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Invalid OTP verification purpose."}
        )

    if not database.validate_email_format(email):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Please enter a valid email address."}
        )

    if purpose == "application":
        avail = database.get_site_availability()
        if not avail["online"]:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "success": False,
                    "offline": True,
                    "error": avail["maintenance_message"],
                    "maintenance_message": avail["maintenance_message"]
                }
            )

    scope = f"send_otp:{purpose}"
    blocked, retry_after = otp_send_rate_limiter.is_blocked(client_ip, scope)
    if blocked:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            content={
                "success": False,
                "cooldown_seconds": retry_after,
                "error": f"Too many OTP requests. Please wait {retry_after} seconds before requesting another code."
            }
        )

    configured = email_service.is_configured()
    dev_preview = email_service.is_dev_preview_enabled()
    if not configured and not dev_preview:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success": False,
                "code": "EMAIL_PROVIDER_NOT_CONFIGURED",
                "provider_configured": False,
                "error": "Real Email OTP is not active yet on the server. Add BREVO_API_KEY and EMAIL_FROM (free HTTPS API) or RESEND_API_KEY in Railway Variables."
            }
        )

    if purpose == "signup" and database.get_user_by_email(email):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "success": False,
                "error": f"An account with email '{email}' already exists. Please sign in or reset your password."
            }
        )

    if purpose == "forgot_password" and not database.get_user_by_email(email):
        otp_send_rate_limiter.record_failure(client_ip, scope)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "dispatched": True,
                "email": email,
                "purpose": purpose,
                "expires_in_seconds": 600,
                "cooldown_seconds": 60,
                "message": f"If an account exists for {email}, a 6-digit verification OTP has been sent. Check Inbox and Spam."
            }
        )

    try:
        otp_record = database.create_email_otp(
            email=email,
            purpose=purpose,
            ttl_seconds=600,
            cooldown_seconds=60
        )
    except ValueError as val_err:
        err_str = str(val_err)
        if err_str.startswith("COOLDOWN:"):
            wait_sec = max(1, int(err_str.split(":", 1)[1]))
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(wait_sec)},
                content={
                    "success": False,
                    "cooldown_seconds": wait_sec,
                    "error": f"Please wait {wait_sec} seconds before requesting another OTP."
                }
            )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": err_str}
        )

    otp_send_rate_limiter.record_failure(client_ip, scope)

    if configured:
        sent_ok, send_info = email_service.send_otp_email(
            to_email=email,
            otp_code=otp_record["otp_code"],
            purpose=purpose,
            lang=lang
        )
        if not sent_ok and not dev_preview:
            database.delete_email_otp(otp_record["otp_id"])
            return JSONResponse(
                status_code=status.HTTP_502_BAD_GATEWAY,
                content={
                    "success": False,
                    "code": "EMAIL_DELIVERY_FAILED",
                    "error": f"Unable to deliver verification email: {send_info}"
                }
            )

    body = {
        "success": True,
        "dispatched": True,
        "email": email,
        "purpose": purpose,
        "provider": email_service.get_configured_provider() or ("dev-preview" if dev_preview else None),
        "expires_in_seconds": otp_record["expires_in_seconds"],
        "cooldown_seconds": otp_record["cooldown_seconds"],
        "message": (
            f"If an account exists for {email}, a 6-digit verification OTP has been sent. Check Inbox and Spam."
            if purpose == "forgot_password"
            else f"A 6-digit verification OTP has been sent to {email}. Valid for 10 minutes."
        )
    }
    if dev_preview and not configured:
        body["dev_preview_otp"] = otp_record["otp_code"]

    return JSONResponse(status_code=status.HTTP_200_OK, content=body)

@router.post(
    "/verify-otp",
    summary="Verify 6-digit email OTP and issue a single-use verification token"
)
async def verify_otp(payload: VerifyOtpRequest, request: Request):
    client_ip = get_client_ip(request)
    purpose = (payload.purpose or "signup").strip().lower()
    scope = f"verify_otp:{purpose}"
    blocked, retry_after = auth_rate_limiter.is_blocked(client_ip, scope)
    if blocked:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            content={
                "success": False,
                "error": f"Too many failed verification attempts. Please wait {retry_after} seconds."
            }
        )

    try:
        result = database.verify_email_otp(
            email=payload.email,
            purpose=purpose,
            otp_code=payload.otp
        )
        auth_rate_limiter.reset(client_ip, scope)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Email verified successfully.",
                **result
            }
        )
    except ValueError as val_err:
        auth_rate_limiter.record_failure(client_ip, scope)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": str(val_err)}
        )

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
    clean_role = (payload.role or "applicant").strip().lower()
    if clean_role == "officer":
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
    if not avail["online"] and clean_role != "officer":
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

    clean_name = (payload.full_name or "").strip()
    clean_email = (payload.email or "").strip().lower()
    if not clean_name:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Full Name is required."}
        )
    if not database.validate_email_format(clean_email):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Invalid email address format."}
        )

    is_strong, pwd_msg = database.validate_password_strength(payload.password or "")
    if not is_strong:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": pwd_msg}
        )

    if clean_role == "officer":
        key_valid, _ = database.is_verified_officer(officer_key=payload.officer_key)
        if not key_valid:
            auth_rate_limiter.record_failure(client_ip, "signup_officer")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "success": False,
                    "error": "Unauthorized: Invalid Officer Authorization Passkey. Officer registration requires institutional clearance."
                }
            )

    if database.get_user_by_email(clean_email):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": f"An account with email '{clean_email}' already exists. Please sign in."}
        )

    otp_enforced = email_service.is_otp_enforced_for_actions()
    otp_tok = (payload.otp_verification_token or "").strip()
    otp_code = (payload.otp_code or "").strip()
    email_verified = False

    if otp_enforced or otp_tok or otp_code:
        try:
            if otp_tok:
                database.consume_otp_verification_token(clean_email, "signup", otp_tok)
                email_verified = True
            elif otp_code:
                verified = database.verify_email_otp(clean_email, "signup", otp_code)
                database.consume_otp_verification_token(clean_email, "signup", verified["verification_token"])
                email_verified = True
            else:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={
                        "success": False,
                        "code": "EMAIL_OTP_REQUIRED",
                        "error": "Email OTP verification is required to create an account. Click 'Send OTP' and verify your email first."
                    }
                )
        except ValueError as val_err:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"success": False, "code": "EMAIL_OTP_INVALID", "error": str(val_err)}
            )

    try:
        profile = database.register_user(
            full_name=clean_name,
            email=clean_email,
            phone=payload.phone or "",
            password=payload.password,
            role=clean_role,
            officer_key=payload.officer_key
        )
        if clean_role == "officer":
            auth_rate_limiter.reset(client_ip, "signup_officer")
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "email_verified": email_verified,
                "message": f"Account created successfully for {profile['full_name']} as {profile['role'].capitalize()}.",
                "user": profile
            }
        )
    except ValueError as val_err:
        if clean_role == "officer" and "Passkey" in str(val_err):
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
    summary="Dispatch password recovery notification or OTP",
    response_model=BaseMessageResponse
)
async def forgot_password(payload: ForgotPasswordRequest):
    email = payload.email.strip().lower()
    if not email:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Email is required."}
        )

    if email_service.is_configured() and database.validate_email_format(email) and database.get_user_by_email(email):
        try:
            otp_record = database.create_email_otp(
                email=email,
                purpose="forgot_password",
                ttl_seconds=600,
                cooldown_seconds=60
            )
            sent_ok, _ = email_service.send_otp_email(
                to_email=email,
                otp_code=otp_record["otp_code"],
                purpose="forgot_password",
                lang="en"
            )
            if not sent_ok:
                database.delete_email_otp(otp_record["otp_id"])
        except Exception:
            pass

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
            "message": f"If an account exists for {email}, password recovery instructions or OTP verification have been dispatched."
        }
    )

@router.post(
    "/reset-password",
    summary="Reset account password after verifying 6-digit email OTP",
    response_model=BaseMessageResponse
)
async def reset_password(payload: ResetPasswordRequest, request: Request):
    client_ip = get_client_ip(request)
    blocked, retry_after = auth_rate_limiter.is_blocked(client_ip, "reset_password")
    if blocked:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            content={
                "success": False,
                "error": f"Too many password reset attempts. Please wait {retry_after} seconds."
            }
        )

    clean_email = (payload.email or "").strip().lower()
    if not database.validate_email_format(clean_email):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Please enter a valid email address."}
        )

    if payload.confirm_password is not None and payload.password != payload.confirm_password:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Passwords do not match."}
        )

    is_strong, pwd_msg = database.validate_password_strength(payload.password or "")
    if not is_strong:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": pwd_msg}
        )

    try:
        result = database.reset_password_with_otp(
            email=clean_email,
            new_password=payload.password,
            otp_code=payload.otp,
            verification_token=payload.verification_token
        )
        auth_rate_limiter.reset(client_ip, "reset_password")
        auth_rate_limiter.reset(client_ip, "signin")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Your password has been reset successfully. Please sign in with your new password.",
                "email": result["email"],
                "role": result["role"]
            }
        )
    except ValueError as val_err:
        auth_rate_limiter.record_failure(client_ip, "reset_password")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": str(val_err)}
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "error": f"Password reset failed: {str(e)}"}
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

@router.patch(
    "/profile",
    summary="Update authenticated user's full name and email address"
)
async def update_profile(
    payload: ProfileUpdateRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_session_token: Optional[str] = Header(default=None, alias="X-Session-Token")
):
    session_token = _extract_session_token(authorization, x_session_token, None)
    if not session_token:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "error": "Authentication required to update profile details."}
        )

    verified_user = database.verify_session_token(session_token)
    if not verified_user:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "error": "Session expired or invalid. Please sign in again."}
        )

    try:
        updated = database.update_user_profile(
            user_id=str(verified_user["id"]),
            full_name=payload.full_name,
            email=payload.email
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Profile name and email updated successfully.",
                "user": updated
            }
        )
    except ValueError as val_err:
        err_msg = str(val_err)
        if err_msg.startswith("DUPLICATE_EMAIL:"):
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={"success": False, "error": err_msg.split(":", 1)[1]}
            )
        if err_msg.startswith("NOT_FOUND:"):
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"success": False, "error": err_msg.split(":", 1)[1]}
            )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": err_msg}
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "error": f"Failed to update profile: {str(e)}"}
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
