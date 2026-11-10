"""
Comprehensive FastAPI Test Suite
Validates all REST endpoints, OpenAPI docs, multi-tenant role authorization,
credit scoring, factor explainability, and database persistence.
"""

import sys
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def run_tests():
    print("=" * 70)
    print("  MERIDIAN FAIRLEND FASTAPI ENDPOINT VALIDATION SUITE")
    print("=" * 70)

    # 1. Health & Hub Endpoints
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    assert res.json()["status"] == "healthy"
    print("[PASS] 1. GET /api/health -> 200 Healthy")

    res = client.get("/api")
    assert res.status_code == 200, f"API hub failed: {res.text}"
    assert "Meridian FairLend" in res.text
    print("[PASS] 2. GET /api -> 200 Interactive Dashboard")

    res = client.get("/docs")
    assert res.status_code == 200, "Swagger docs failed"
    print("[PASS] 3. GET /docs -> 200 OpenAPI Interactive Swagger UI")

    # 2. Static Asset Delivery
    res = client.get("/")
    assert res.status_code == 200 and "Meridian" in res.text
    print("[PASS] 4. GET / -> 200 index.html served")

    res = client.get("/styles.css")
    assert res.status_code == 200
    print("[PASS] 5. GET /styles.css -> 200 CSS stylesheet served")

    res = client.get("/app.js")
    assert res.status_code == 200
    print("[PASS] 6. GET /app.js -> 200 JavaScript application served")

    res = client.get("/dataset_data.js")
    assert res.status_code == 200
    print("[PASS] 7. GET /dataset_data.js -> 200 Dataset bundle served")

    res = client.get("/favicon.ico")
    assert res.status_code == 204
    print("[PASS] 7b. GET /favicon.ico -> 204 No Content")

    res = client.options("/api/predict", headers={
        "Origin": "https://meridian-client.netlify.app",
        "Access-Control-Request-Method": "POST"
    })
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == "*"
    print("[PASS] 7c. OPTIONS /api/predict -> CORS wildcard enabled")

    # 3. Authentication Validation
    # Mismatched password
    res = client.post("/api/auth/signup", json={
        "full_name": "Test User",
        "email": "test@example.com",
        "password": "Password@123",
        "confirm_password": "WrongPassword",
        "role": "applicant"
    })
    assert res.status_code == 400
    print("[PASS] 8. POST /api/auth/signup -> 400 Password mismatch blocked")

    # Officer registration without key
    res = client.post("/api/auth/signup", json={
        "full_name": "Test Officer",
        "email": "officer.test.unauth@example.com",
        "password": "Password@123",
        "confirm_password": "Password@123",
        "role": "officer",
        "officer_key": "WRONG_KEY"
    })
    assert res.status_code == 400
    print("[PASS] 9. POST /api/auth/signup -> 400 Unauthorized officer blocked")

    # Sign In: Applicant
    res = client.post("/api/auth/signin", json={
        "email": "applicant@meridianbank.in",
        "password": "Applicant@123",
        "expected_role": "applicant"
    })
    assert res.status_code == 200, f"Applicant signin failed: {res.text}"
    app_data = res.json()
    assert app_data["success"] is True
    assert app_data["user"]["role"] == "applicant"
    applicant_id = app_data["user"]["id"]
    print(f"[PASS] 10. POST /api/auth/signin -> 200 Applicant authenticated ({app_data['user']['email']})")

    # Role gateway enforcement: Applicant attempting officer login -> 403
    res = client.post("/api/auth/signin", json={
        "email": "applicant@meridianbank.in",
        "password": "Applicant@123",
        "expected_role": "officer"
    })
    assert res.status_code == 403
    print("[PASS] 11. POST /api/auth/signin -> 403 Applicant rejected at Officer gateway")

    # Sign In: Officer
    res = client.post("/api/auth/signin", json={
        "email": "officer@meridianbank.in",
        "password": "Officer@2026",
        "expected_role": "officer"
    })
    assert res.status_code == 200, f"Officer signin failed: {res.text}"
    off_data = res.json()
    assert off_data["user"]["role"] == "officer"
    print(f"[PASS] 12. POST /api/auth/signin -> 200 Officer authenticated ({off_data['user']['email']})")

    # Invalid credentials -> 401
    res = client.post("/api/auth/signin", json={
        "email": "officer@meridianbank.in",
        "password": "IncorrectPassword"
    })
    assert res.status_code == 401
    print("[PASS] 13. POST /api/auth/signin -> 401 Invalid password rejected")

    # Forgot password
    res = client.post("/api/auth/forgot-password", json={"email": "applicant@meridianbank.in"})
    assert res.status_code == 200 and res.json()["success"] is True
    print("[PASS] 14. POST /api/auth/forgot-password -> 200 Reset instructions dispatched")

    # Logout
    res = client.post("/api/auth/logout")
    assert res.status_code == 200 and res.json()["success"] is True
    print("[PASS] 15. POST /api/auth/logout -> 200 Logout acknowledged")

    # Session verification
    res = client.get(f"/api/auth/session?user_id={applicant_id}")
    assert res.status_code == 200 and res.json()["user"]["role"] == "applicant"
    print("[PASS] 15b. GET /api/auth/session -> 200 Session verified")

    # 4. Underwriting & Scoring
    sample_app = {
        "full_name": "Pooja Verma",
        "applicant_income": 48000,
        "coapplicant_income": 12000,
        "loan_amount": 160,
        "loan_term_months": 360,
        "cibil_score": 775,
        "property_area": "Semiurban",
        "salary_slip": "Yes",
        "employment_type": "Salaried (Private)",
        "user_id": applicant_id
    }

    # Instant scoring & XAI
    res = client.post("/api/predict", json=sample_app)
    assert res.status_code == 200
    pred_data = res.json()
    assert "prediction" in pred_data and "explanation" in pred_data
    print(f"[PASS] 16. POST /api/predict -> 200 Decision: {pred_data['prediction']['status']} ({pred_data['prediction']['approval_likelihood']}%)")

    # Counterfactual simulation
    res = client.post("/api/what-if", json={
        "base": sample_app,
        "adjustments": {"loan_amount": 120, "loan_term_months": 240}
    })
    assert res.status_code == 200
    sim_data = res.json()
    assert "simulation" in sim_data and "deltas" in sim_data["simulation"]
    print(f"[PASS] 17. POST /api/what-if -> 200 Simulation Score Delta: {sim_data['simulation']['deltas']['score_change']:+d}")

    # Full Application Intake & Persistence
    res = client.post("/api/apply", json=sample_app)
    assert res.status_code == 201, f"Apply failed: {res.text}"
    apply_res = res.json()
    assert apply_res["success"] is True
    created_app_no = apply_res["application"]["application_no"]
    print(f"[PASS] 18. POST /api/apply -> 201 Application Vaulted ({created_app_no})")

    # Lookup single application
    res = client.get(f"/api/application/{created_app_no}")
    assert res.status_code == 200
    assert res.json()["application"]["application_no"] == created_app_no
    print(f"[PASS] 19. GET /api/application/{created_app_no} -> 200 Record fetched")

    # Saved applications: Applicant isolation
    res = client.get(f"/api/saved-applications?user_id={applicant_id}&role=applicant")
    assert res.status_code == 200
    app_vault = res.json()["applications"]
    assert any(a["application_no"] == created_app_no for a in app_vault)
    print(f"[PASS] 20. GET /api/saved-applications -> 200 Applicant isolated list ({len(app_vault)} records)")

    # Saved applications: Officer full portfolio
    res = client.get("/api/saved-applications?role=officer")
    assert res.status_code == 200
    off_vault = res.json()["applications"]
    assert len(off_vault) >= len(app_vault)
    print(f"[PASS] 21. GET /api/saved-applications -> 200 Officer full portfolio ({len(off_vault)} records)")

    # Officer Sanction Security: Applicant cannot sanction -> 403
    res = client.post("/api/officer/sanction", json={
        "application_no": created_app_no,
        "status": "Approved",
        "officer_role": "applicant"
    })
    assert res.status_code == 403
    print("[PASS] 22. POST /api/officer/sanction -> 403 Unauthorized applicant blocked")

    # Officer Sanction Authorized
    res = client.post("/api/officer/sanction", json={
        "application_no": created_app_no,
        "status": "Approved",
        "remarks": "Credit verified with positive CIBIL and compliant DTI ratio.",
        "officer_role": "officer"
    })
    assert res.status_code == 200
    assert res.json()["success"] is True
    print(f"[PASS] 23. POST /api/officer/sanction -> 200 Decision recorded with audit remarks")

    # 5. Algorithmic Equity & Performance
    res = client.get("/api/fairness")
    assert res.status_code == 200
    fairness = res.json()
    assert "gender_fairness" in fairness and "territory_fairness" in fairness
    print(f"[PASS] 24. GET /api/fairness -> 200 DIR Gender: {fairness['gender_fairness']['disparate_impact_ratio']}")

    res = client.get("/api/fairness?affirmative=true")
    assert res.status_code == 200
    aff_fairness = res.json()
    assert aff_fairness.get("affirmative_calibration_active") is True
    assert aff_fairness["territory_fairness"]["disparate_impact_ratio"] >= fairness["territory_fairness"]["disparate_impact_ratio"]
    print(f"[PASS] 24b. GET /api/fairness?affirmative=true -> 200 DIR Territory: {aff_fairness['territory_fairness']['disparate_impact_ratio']}")

    res = client.get("/api/accuracy")
    assert res.status_code == 200
    acc = res.json()
    assert acc["overall_accuracy_percent"] > 80.0
    assert isinstance(acc.get("feature_weights"), list) and len(acc["feature_weights"]) > 0
    print(f"[PASS] 25. GET /api/accuracy -> 200 Accuracy: {acc['overall_accuracy_percent']}% ({len(acc['feature_weights'])} feature weights)")

    res = client.get("/api/applicants")
    assert res.status_code == 200
    applicants = res.json()
    assert applicants["total_in_db"] > 0
    print(f"[PASS] 26. GET /api/applicants -> 200 Total cached: {applicants['total_in_db']}")

    print("=" * 70)
    print("ALL 26 FASTAPI ENDPOINTS & POLICIES VALIDATED SUCCESSFULLY (100% PASS)")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
