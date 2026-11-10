from typing import Optional, Dict, Any, Tuple
from fastapi import APIRouter, Header, Query, Request, Response, status
from fastapi.responses import JSONResponse

from backend import predict_loan, explain_decision, simulate_what_if
import database
from src.api.schemas import (
    WhatIfRequest,
    OfficerSanctionRequest,
    ApplicationUpdateRequest,
    AuditLogCreateRequest,
    SavedApplicationsResponse,
    SingleApplicationResponse
)

router = APIRouter(prefix="/api", tags=["Loan Underwriting & Decisioning"])

def _resolve_caller(
    authorization: Optional[str] = None,
    x_user_id: Optional[str] = None,
    x_user_role: Optional[str] = None
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    if authorization and authorization.strip():
        verified = database.verify_session_token(authorization)
        if not verified:
            return None, None, None, None
        uid = str(verified.get("id") or "").strip() or None
        role = str(verified.get("role") or "applicant").strip().lower()
        email = str(verified.get("email") or "").strip().lower() or None
        name = str(verified.get("full_name") or verified.get("email") or "User")
        return uid, role, email, name

    clean_uid = (x_user_id or "").strip() or None
    clean_role = (x_user_role or "").strip().lower() or None
    if clean_uid:
        profile = database.get_user_profile(clean_uid)
        if profile:
            prof_role = str(profile.get("role") or clean_role or "applicant").strip().lower()
            prof_email = str(profile.get("email") or "").strip().lower() or None
            prof_name = str(profile.get("full_name") or prof_email or "User")
            return str(profile["id"]), prof_role, prof_email, prof_name
    return clean_uid, clean_role, None, None

def _offline_guard(x_user_id: Optional[str] = None, x_user_role: Optional[str] = None, officer_key: Optional[str] = None):
    avail = database.get_site_availability()
    if avail["online"]:
        return None
    is_off, _ = database.is_verified_officer(user_id=x_user_id, user_role=x_user_role, officer_key=officer_key)
    if is_off:
        return None
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "success": False,
            "offline": True,
            "status": "offline",
            "error": avail["maintenance_message"],
            "maintenance_message": avail["maintenance_message"]
        }
    )

@router.post(
    "/apply",
    summary="Submit loan application with automated scoring and persistence",
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Application recorded and decision rendered"},
        403: {"description": "Forbidden for Officer portal accounts"},
        503: {"description": "Portal is temporarily offline for maintenance"},
        500: {"description": "Underwriting processing error"}
    }
)
async def submit_application(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    caller_uid, caller_role, caller_email, _ = _resolve_caller(authorization, x_user_id, x_user_role)
    guard_resp = _offline_guard(x_user_id=caller_uid, x_user_role=caller_role)
    if guard_resp is not None:
        return guard_resp
    if caller_role == "officer":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "success": False,
                "error": "Forbidden: Loan submission belongs exclusively to the Applicant Application Portal."
            }
        )
    try:
        payload = await request.json()
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": f"Invalid JSON payload: {str(e)}"}
        )

    try:
        if caller_uid:
            user_id = caller_uid
            if caller_email and not payload.get("applicant_email"):
                payload["applicant_email"] = caller_email
        else:
            user_id = payload.get("user_id") or payload.get("applicant_id")
        prediction = predict_loan(payload)
        explanation = explain_decision(payload, prediction)

        saved_record = database.save_loan_application(
            payload,
            prediction,
            explanation,
            user_id=user_id
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "message": "Loan application successfully submitted and recorded in Meridian Vault.",
                "application": saved_record,
                "prediction": prediction,
                "explanation": explanation
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "error": str(e)}
        )

@router.post(
    "/predict",
    summary="Execute instant credit risk assessment & factor explainability",
    responses={
        200: {"description": "Prediction and explanation evaluated"},
        503: {"description": "Portal is temporarily offline for maintenance"},
        500: {"description": "Model scoring error"}
    }
)
async def predict_decision(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    caller_uid, caller_role, _, _ = _resolve_caller(authorization, x_user_id, x_user_role)
    guard_resp = _offline_guard(x_user_id=caller_uid, x_user_role=caller_role)
    if guard_resp is not None:
        return guard_resp
    try:
        payload = await request.json()
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": f"Invalid JSON payload: {str(e)}"}
        )

    try:
        prediction = predict_loan(payload)
        explanation = explain_decision(payload, prediction)
        applicant_name = payload.get("full_name") or payload.get("name", "Applicant")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "applicant_name": applicant_name,
                "prediction": prediction,
                "explanation": explanation
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "error": str(e)}
        )

@router.post(
    "/what-if",
    summary="Simulate counterfactual scenario underwriting adjustments",
    responses={
        200: {"description": "Counterfactual scenario evaluated"},
        503: {"description": "Portal is temporarily offline for maintenance"},
        500: {"description": "Simulation failure"}
    }
)
async def scenario_simulation(
    payload: WhatIfRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    caller_uid, caller_role, _, _ = _resolve_caller(authorization, x_user_id, x_user_role)
    guard_resp = _offline_guard(x_user_id=caller_uid, x_user_role=caller_role)
    if guard_resp is not None:
        return guard_resp
    try:
        sim_res = simulate_what_if(payload.base, payload.adjustments)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"success": True, "simulation": sim_res}
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "error": str(e)}
        )

@router.post(
    "/officer/sanction",
    summary="Officer final adjudication, status update, and audit remarks",
    responses={
        200: {"description": "Application status successfully updated"},
        403: {"description": "Forbidden: Officer clearance required"},
        404: {"description": "Application record not found"}
    }
)
async def officer_sanction(
    payload: OfficerSanctionRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    caller_uid, caller_role, _, caller_name = _resolve_caller(authorization, x_user_id, x_user_role)
    role = payload.officer_role or caller_role
    is_officer, actor_name = database.is_verified_officer(
        user_id=caller_uid,
        user_role=role,
        officer_key=x_officer_key
    )
    if not is_officer:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "success": False,
                "error": "Forbidden: Only authorized Loan Officers can sanction or modify applications."
            }
        )

    remarks = payload.remarks or payload.note or "Sanctioned by Loan Officer"
    updated = database.update_status(
        payload.application_no,
        payload.status,
        remarks,
        officer_id=caller_uid,
        officer_name=actor_name or caller_name or "Loan Officer"
    )

    if updated:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": f"Application {payload.application_no} decision recorded as {payload.status}.",
                "application": updated
            }
        )
    else:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": f"Application {payload.application_no} not found"}
        )

@router.get(
    "/officer/audit-logs",
    summary="Retrieve persistent compliance audit trail (Officer Only)"
)
async def list_officer_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    caller_uid, caller_role, _, _ = _resolve_caller(authorization, x_user_id, x_user_role)
    is_officer, _ = database.is_verified_officer(user_id=caller_uid, user_role=caller_role, officer_key=x_officer_key)
    if not is_officer:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"success": False, "error": "Forbidden: Officer clearance required to view audit logs."}
        )
    logs = database.get_audit_logs(limit=limit)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "total": len(logs), "logs": logs}
    )

@router.post(
    "/officer/audit-logs",
    summary="Record persistent compliance audit event (Officer Only)",
    status_code=status.HTTP_201_CREATED
)
async def create_officer_audit_log(
    payload: AuditLogCreateRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    caller_uid, caller_role, _, caller_name = _resolve_caller(authorization, x_user_id, x_user_role)
    is_officer, actor_name = database.is_verified_officer(user_id=caller_uid, user_role=caller_role, officer_key=x_officer_key)
    if not is_officer:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"success": False, "error": "Forbidden: Officer clearance required to append audit logs."}
        )
    entry = database.add_audit_log(
        application_no=payload.application_no,
        action=payload.action,
        notes=payload.notes or "",
        remarks=payload.remarks or payload.notes or "",
        officer_id=caller_uid,
        officer_name=actor_name or caller_name or "Loan Officer",
        officer_role="officer"
    )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"success": True, "log": entry}
    )

@router.get(
    "/officer/backup",
    summary="Download atomic full vault snapshot (Officer Only)"
)
async def export_officer_vault_backup(
    format: str = Query(default="json", description="Backup format: 'json' or 'sqlite'"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    caller_uid, caller_role, _, _ = _resolve_caller(authorization, x_user_id, x_user_role)
    is_officer, _ = database.is_verified_officer(user_id=caller_uid, user_role=caller_role, officer_key=x_officer_key)
    if not is_officer:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"success": False, "error": "Forbidden: Officer clearance required for vault backup."}
        )
    if format.strip().lower() == "sqlite":
        db_bytes = database.get_sqlite_backup_bytes()
        return Response(
            content=db_bytes,
            media_type="application/x-sqlite3",
            headers={"Content-Disposition": "attachment; filename=meridian_loans_backup.db"}
        )
    snapshot = database.get_full_vault_snapshot()
    return JSONResponse(status_code=status.HTTP_200_OK, content={"success": True, **snapshot})

@router.get(
    "/saved-applications",
    summary="Retrieve role-isolated loan applications vault",
    response_model=SavedApplicationsResponse
)
async def list_saved_applications(
    user_id: Optional[str] = Query(default=None, description="Applicant profile ID filter"),
    role: Optional[str] = Query(default=None, description="Viewer role: applicant or officer"),
    email: Optional[str] = Query(default=None, description="Optional email filter"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    caller_uid, caller_role, caller_email, _ = _resolve_caller(authorization, x_user_id, x_user_role)
    requested_role = (role or "").strip().lower()

    if caller_uid and caller_role == "applicant":
        if requested_role == "officer":
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={
                    "success": False,
                    "error": "Forbidden: Verified Loan Officer clearance required for portfolio-wide vault access."
                }
            )
        resolved_user_id = caller_uid
        resolved_role = "applicant"
        resolved_email = caller_email
    else:
        resolved_user_id = caller_uid or user_id
        resolved_role = (requested_role or caller_role or ("applicant" if resolved_user_id else "")).strip().lower()
        resolved_email = caller_email or email

        if resolved_role == "officer":
            is_officer, _ = database.is_verified_officer(
                user_id=resolved_user_id,
                user_role=resolved_role,
                officer_key=x_officer_key
            )
            if not is_officer:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "success": False,
                        "error": "Forbidden: Verified Loan Officer clearance required for portfolio-wide vault access."
                    }
                )
        elif not resolved_user_id:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "success": False,
                    "error": "Authentication required to access saved applications."
                }
            )
        else:
            profile = database.get_user_profile(str(resolved_user_id))
            if not profile:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"success": False, "error": "Invalid applicant identity."}
                )
            resolved_role = "applicant"
            resolved_email = profile.get("email")

    if resolved_role != "officer":
        guard_resp = _offline_guard(x_user_id=resolved_user_id, x_user_role=resolved_role)
        if guard_resp is not None:
            return guard_resp

    saved_apps = database.get_all_saved_applications(
        user_id=resolved_user_id,
        role=resolved_role,
        user_email=resolved_email
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "role": resolved_role,
            "total_saved": len(saved_apps),
            "applications": saved_apps
        }
    )

@router.get(
    "/application/{application_no}",
    summary="Retrieve single loan application file details",
    response_model=SingleApplicationResponse,
    responses={
        200: {"description": "Application retrieved"},
        401: {"description": "Authentication required"},
        403: {"description": "Forbidden across applicant portals"},
        404: {"description": "Application not found"}
    }
)
async def get_application(
    application_no: str,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    caller_uid, caller_role, caller_email, _ = _resolve_caller(authorization, x_user_id, x_user_role)
    guard_resp = _offline_guard(x_user_id=caller_uid, x_user_role=caller_role, officer_key=x_officer_key)
    if guard_resp is not None:
        return guard_resp

    is_officer, _ = database.is_verified_officer(user_id=caller_uid, user_role=caller_role, officer_key=x_officer_key)
    if not is_officer and not caller_uid:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "error": "Authentication required to inspect application records."}
        )

    app_record = database.get_application_by_number(application_no)
    if not app_record:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": f"Application {application_no} not found"}
        )

    if not is_officer:
        uid_match = caller_uid and (
            str(app_record.get("user_id") or "") == str(caller_uid)
            or str(app_record.get("applicant_id") or "") == str(caller_uid)
        )
        email_match = caller_email and str(app_record.get("applicant_email") or "").strip().lower() == caller_email
        if not (uid_match or email_match):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"success": False, "error": "Forbidden: You can only inspect your own submitted loan applications."}
            )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "application": app_record}
    )

@router.patch(
    "/application/{application_no}",
    summary="Persist modified scenario or underwriting terms on an existing application",
    responses={
        200: {"description": "Application updated and recalculated"},
        401: {"description": "Authentication required"},
        403: {"description": "Forbidden across applicant portals"},
        404: {"description": "Application not found"}
    }
)
async def update_application(
    application_no: str,
    payload: ApplicationUpdateRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
    x_officer_key: Optional[str] = Header(default=None, alias="X-Officer-Key")
):
    caller_uid, caller_role, caller_email, caller_name = _resolve_caller(authorization, x_user_id, x_user_role)
    guard_resp = _offline_guard(x_user_id=caller_uid, x_user_role=caller_role, officer_key=x_officer_key)
    if guard_resp is not None:
        return guard_resp

    is_officer, actor_name = database.is_verified_officer(user_id=caller_uid, user_role=caller_role, officer_key=x_officer_key)
    if not is_officer and not caller_uid:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "error": "Authentication required to update application parameters."}
        )

    existing = database.get_application_by_number(application_no)
    if not existing:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": f"Application {application_no} not found"}
        )

    if not is_officer:
        uid_match = caller_uid and (
            str(existing.get("user_id") or "") == str(caller_uid)
            or str(existing.get("applicant_id") or "") == str(caller_uid)
        )
        email_match = caller_email and str(existing.get("applicant_email") or "").strip().lower() == caller_email
        if not (uid_match or email_match):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"success": False, "error": "Forbidden: You can only update your own submitted loan applications."}
            )

    raw_updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    merged = {**existing, **raw_updates}
    prediction = predict_loan(merged)
    explanation = explain_decision(merged, prediction)

    updated = database.update_application_details(application_no, raw_updates, prediction, explanation)
    if is_officer:
        raw_amt = merged.get('loan_amount')
        try:
            amt_label = f"₹{int(round(float(raw_amt))):,}"
        except (TypeError, ValueError):
            amt_label = f"₹{raw_amt}"
        database.add_audit_log(
            application_no=application_no,
            action="Officer Updated Terms",
            notes=f"Adjusted facility parameters (Amount: {amt_label}, Term: {merged.get('loan_term_months')}m)",
            remarks=f"Score updated to {prediction.get('approval_likelihood')}%",
            officer_id=caller_uid,
            officer_name=actor_name or caller_name or "Loan Officer",
            officer_role="officer"
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "message": f"Application {application_no} parameters saved persistently.",
            "application": updated,
            "prediction": prediction,
            "explanation": explanation
        }
    )
