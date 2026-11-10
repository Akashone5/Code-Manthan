"""
Loan Underwriting and Decisioning Router
Exposes scoring, SHAP explainability, scenario simulation, and vault operations.
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Header, Query, Request, status
from fastapi.responses import JSONResponse

from backend import predict_loan, explain_decision, simulate_what_if
import database
from src.api.schemas import (
    WhatIfRequest,
    OfficerSanctionRequest,
    SavedApplicationsResponse,
    SingleApplicationResponse
)

router = APIRouter(prefix="/api", tags=["Loan Underwriting & Decisioning"])


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
        503: {"description": "Portal is temporarily offline for maintenance"},
        500: {"description": "Underwriting processing error"}
    }
)
async def submit_application(
    request: Request,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    """
    Submits a loan application. Executes machine learning risk assessment,
    generates SHAP factor explanations, and persists the record to PostgreSQL and SQLite.
    """
    guard_resp = _offline_guard(x_user_id=x_user_id, x_user_role=x_user_role)
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
        user_id = payload.get("user_id") or payload.get("applicant_id") or x_user_id

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
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    """
    Evaluates credit probability and returns explainable positive and friction factor drivers.
    """
    guard_resp = _offline_guard(x_user_id=x_user_id, x_user_role=x_user_role)
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
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    """
    Simulates changes to loan quantum, co-applicant income, or tenure to compute
    instant score and EMI deltas.
    """
    guard_resp = _offline_guard(x_user_id=x_user_id, x_user_role=x_user_role)
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
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    """
    Allows authorized credit officers to sanction, conditionally approve, or reject loan files,
    recording an audit log with remarks.
    """
    role = payload.officer_role or x_user_role
    if role != "officer":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "success": False,
                "error": "Forbidden: Only authorized Loan Officers can sanction or modify applications."
            }
        )

    remarks = payload.remarks or payload.note or "Sanctioned by Loan Officer"
    updated = database.update_status(payload.application_no, payload.status, remarks)

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
    "/saved-applications",
    summary="Retrieve role-isolated loan applications vault",
    response_model=SavedApplicationsResponse
)
async def list_saved_applications(
    user_id: Optional[str] = Query(default=None, description="Applicant profile ID filter"),
    role: Optional[str] = Query(default=None, description="Viewer role: applicant or officer"),
    email: Optional[str] = Query(default=None, description="Optional email filter"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role")
):
    """
    Retrieves saved applications. Applicants only receive their own records;
    Officers receive the full portfolio vault.
    """
    resolved_user_id = user_id or x_user_id
    resolved_role = role or x_user_role or ("applicant" if resolved_user_id else "officer")

    if resolved_role != "officer":
        guard_resp = _offline_guard(x_user_id=resolved_user_id, x_user_role=resolved_role)
        if guard_resp is not None:
            return guard_resp

    saved_apps = database.get_all_saved_applications(
        user_id=resolved_user_id,
        role=resolved_role
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
        404: {"description": "Application not found"}
    }
)
async def get_application(application_no: str):
    """
    Fetches full dossier for a specific application reference number.
    """
    app = database.get_application_by_number(application_no)
    if app:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"success": True, "application": app}
        )
    else:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": f"Application {application_no} not found"}
        )
