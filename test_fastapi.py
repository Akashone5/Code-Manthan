import os
import sys
import uuid
from fastapi.testclient import TestClient
from main import app
from src.api import email_service

client = TestClient(app)

def run_tests():
    print("=" * 70)
    print("  MERIDIAN FAIRLEND FASTAPI ENDPOINT VALIDATION SUITE")
    print("=" * 70)

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

    res = client.get("/")
    assert res.status_code == 200 and "Meridian" in res.text
    assert "gw-btn-applicant" in res.text and "gw-btn-officer" in res.text
    print("[PASS] 4. GET / -> 200 index.html & segregated portals served")

    res = client.get("/styles.css")
    assert res.status_code == 200
    print("[PASS] 5. GET /styles.css -> 200 CSS stylesheet served")

    res = client.get("/app.js")
    assert res.status_code == 200
    assert "applyWhatIfScenario" in res.text and "downloadSqliteBackup" in res.text
    print("[PASS] 6. GET /app.js -> 200 JavaScript application served")

    res = client.get("/dataset_data.js")
    assert res.status_code == 200
    print("[PASS] 7. GET /dataset_data.js -> 200 Dataset bundle served")

    res = client.get("/favicon.ico")
    assert res.status_code == 200 and "<svg" in res.text
    print("[PASS] 7b. GET /favicon.ico -> 200 SVG icon served")

    res = client.get("/robots.txt")
    assert res.status_code == 200 and "User-agent:" in res.text
    print("[PASS] 7b2. GET /robots.txt -> 200 Robots directive served")

    res = client.options("/api/predict", headers={
        "Origin": "https://meridian-client.netlify.app",
        "Access-Control-Request-Method": "POST"
    })
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == "*"
    print("[PASS] 7c. OPTIONS /api/predict -> CORS wildcard enabled")

    res = client.post("/api/auth/signup", json={
        "full_name": "Test User",
        "email": "test@example.com",
        "password": "Password@123",
        "confirm_password": "WrongPassword",
        "role": "applicant"
    })
    assert res.status_code == 400
    print("[PASS] 8. POST /api/auth/signup -> 400 Password mismatch blocked")

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

    res = client.post("/api/auth/signin", json={
        "email": "applicant@meridianbank.in",
        "password": "Applicant@123",
        "expected_role": "applicant"
    })
    assert res.status_code == 200, f"Applicant signin failed: {res.text}"
    app_data = res.json()
    assert app_data["success"] is True
    assert app_data["user"]["role"] == "applicant"
    applicant_id = str(app_data["user"]["id"])
    applicant_token = app_data.get("token", "")
    assert applicant_token, "Applicant signin did not issue Bearer token"
    app_headers = {
        "Authorization": f"Bearer {applicant_token}",
        "X-User-Id": applicant_id,
        "X-User-Role": "applicant"
    }
    print(f"[PASS] 10. POST /api/auth/signin -> 200 Applicant authenticated with Bearer token ({app_data['user']['email']})")

    res = client.post("/api/auth/signin", json={
        "email": "applicant@meridianbank.in",
        "password": "Applicant@123",
        "expected_role": "officer"
    })
    assert res.status_code == 403
    print("[PASS] 11. POST /api/auth/signin -> 403 Applicant rejected at Officer gateway")

    officer_pwd = os.environ.get("OFFICER_ADMIN_PASSWORD", "Officer@2026")
    res = client.post("/api/auth/signin", json={
        "email": "officer@meridianbank.in",
        "password": officer_pwd,
        "expected_role": "officer"
    })
    assert res.status_code == 200, f"Officer signin failed: {res.text}"
    off_data = res.json()
    assert off_data["user"]["role"] == "officer"
    officer_id = str(off_data["user"]["id"])
    officer_token = off_data.get("token", "")
    assert officer_token, "Officer signin did not issue Bearer token"
    off_headers = {
        "Authorization": f"Bearer {officer_token}",
        "X-User-Id": officer_id,
        "X-User-Role": "officer"
    }
    print(f"[PASS] 12. POST /api/auth/signin -> 200 Officer authenticated with Bearer token ({off_data['user']['email']})")

    res = client.post("/api/auth/signin", json={
        "email": "officer@meridianbank.in",
        "password": "IncorrectPassword"
    })
    assert res.status_code == 401
    print("[PASS] 13. POST /api/auth/signin -> 401 Invalid password rejected")

    res = client.post("/api/auth/forgot-password", json={"email": "applicant@meridianbank.in"})
    assert res.status_code == 200 and res.json()["success"] is True
    print("[PASS] 14. POST /api/auth/forgot-password -> 200 Reset instructions dispatched")

    res = client.get("/api/auth/session")
    assert res.status_code == 401
    res = client.get("/api/auth/session", headers={"Authorization": f"Bearer {applicant_token}"})
    assert res.status_code == 200 and res.json()["user"]["role"] == "applicant"
    res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {applicant_token}"})
    assert res.status_code == 200 and res.json()["success"] is True
    res = client.get("/api/auth/session", headers={"Authorization": f"Bearer {applicant_token}"})
    assert res.status_code == 401, "Revoked Bearer session token should return 401"
    print("[PASS] 15. POST /api/auth/logout -> Bearer session token persistently revoked (subsequent GET -> 401)")

    res = client.post("/api/auth/signin", json={
        "email": "applicant@meridianbank.in",
        "password": "Applicant@123",
        "expected_role": "applicant"
    })
    assert res.status_code == 200
    applicant_token = res.json()["token"]
    app_headers = {
        "Authorization": f"Bearer {applicant_token}",
        "X-User-Id": applicant_id,
        "X-User-Role": "applicant"
    }
    res = client.get("/api/auth/session", headers={"Authorization": f"Bearer {applicant_token}"})
    assert res.status_code == 200 and res.json()["user"]["role"] == "applicant"
    print("[PASS] 15b. GET /api/auth/session -> 200 Fresh Bearer session verified")

    sample_app = {
        "full_name": "Pooja Verma",
        "applicant_income": 48000,
        "coapplicant_income": 12000,
        "loan_amount": 160000,
        "loan_term_months": 360,
        "cibil_score": 775,
        "property_area": "Semiurban",
        "salary_slip": "Yes",
        "employment_type": "Salaried (Private)",
        "user_id": applicant_id
    }

    res = client.post("/api/predict", json=sample_app, headers=app_headers)
    assert res.status_code == 200
    pred_data = res.json()
    assert "prediction" in pred_data and "explanation" in pred_data
    assert pred_data["prediction"]["requested_loan_inr"] == 160000

    res_flex = client.post("/api/predict", json={**sample_app, "loan_amount": 2500, "loan_term_months": 12}, headers=app_headers)
    assert res_flex.status_code == 200 and res_flex.json()["prediction"]["requested_loan_inr"] == 2500
    print(f"[PASS] 16. POST /api/predict -> 200 Decision: {pred_data['prediction']['status']} ({pred_data['prediction']['approval_likelihood']}%, flexible INR verified)")

    res = client.post("/api/what-if", json={
        "base": sample_app,
        "adjustments": {"loan_amount": 120000, "loan_term_months": 240}
    }, headers=app_headers)
    assert res.status_code == 200
    sim_data = res.json()
    assert "simulation" in sim_data and "deltas" in sim_data["simulation"]
    assert sim_data["simulation"]["simulated"]["requested_loan_inr"] == 120000
    print(f"[PASS] 17. POST /api/what-if -> 200 Simulation Score Delta: {sim_data['simulation']['deltas']['score_change']:+d}")

    res = client.post("/api/apply", json=sample_app, headers=off_headers)
    assert res.status_code == 403, f"Officer should be blocked from submitting loan applications: {res.status_code}"
    res = client.post("/api/apply", json=sample_app, headers=app_headers)
    assert res.status_code == 201, f"Apply failed: {res.text}"
    apply_res = res.json()
    assert apply_res["success"] is True
    created_app_no = apply_res["application"]["application_no"]
    print(f"[PASS] 18. POST /api/apply -> 403 for Officer, 201 Application Vaulted for Applicant ({created_app_no})")

    same_uid = uuid.uuid4().hex[:8]
    same_email_a = f"samename.a.{same_uid}@example.com"
    same_email_b = f"samename.b.{same_uid}@example.com"
    res_su1 = client.post("/api/auth/signup", json={
        "full_name": "SameName Test",
        "email": same_email_a,
        "phone": "9811100011",
        "password": "Password@123",
        "confirm_password": "Password@123",
        "role": "applicant"
    })
    assert res_su1.status_code == 201, res_su1.text
    res_su2 = client.post("/api/auth/signup", json={
        "full_name": "SameName Test",
        "email": same_email_b,
        "phone": "9811100022",
        "password": "Password@123",
        "confirm_password": "Password@123",
        "role": "applicant"
    })
    assert res_su2.status_code == 201, res_su2.text
    res_si1 = client.post("/api/auth/signin", json={"email": same_email_a, "password": "Password@123", "expected_role": "applicant"})
    res_si2 = client.post("/api/auth/signin", json={"email": same_email_b, "password": "Password@123", "expected_role": "applicant"})
    assert res_si1.status_code == 200 and res_si2.status_code == 200
    hdr_a = {"Authorization": f"Bearer {res_si1.json()['token']}"}
    hdr_b = {"Authorization": f"Bearer {res_si2.json()['token']}"}
    res_app_a = client.post("/api/apply", json={**sample_app, "full_name": "SameName Test"}, headers=hdr_a)
    assert res_app_a.status_code == 201
    app_a_no = res_app_a.json()["application"]["application_no"]
    assert client.get(f"/api/application/{app_a_no}").status_code == 401
    assert client.get(f"/api/application/{app_a_no}", headers=hdr_b).status_code == 403
    vault_b = client.get("/api/saved-applications", headers=hdr_b).json()["applications"]
    assert not any(r["application_no"] == app_a_no for r in vault_b)
    assert client.get(f"/api/application/{app_a_no}", headers=hdr_a).status_code == 200
    assert client.get(f"/api/application/{app_a_no}", headers=off_headers).status_code == 200
    print(f"[PASS] 18b. Strict cross-applicant portal isolation verified across same-named users ({app_a_no})")

    assert client.get(f"/api/application/{created_app_no}").status_code == 401
    res = client.get(f"/api/application/{created_app_no}", headers=app_headers)
    assert res.status_code == 200 and res.json()["application"]["application_no"] == created_app_no
    print(f"[PASS] 19. GET /api/application/{created_app_no} -> 401 anonymous, 200 authenticated owner")

    assert client.patch(f"/api/application/{created_app_no}", json={"loan_amount": 135000}).status_code == 401
    assert client.patch(f"/api/application/{created_app_no}", json={"loan_amount": 135000}, headers=hdr_b).status_code == 403
    res_patch_app = client.patch(
        f"/api/application/{created_app_no}",
        json={"loan_amount": 135000, "loan_term_months": 240},
        headers=app_headers
    )
    assert res_patch_app.status_code == 200, res_patch_app.text
    reloaded_app = client.get(f"/api/application/{created_app_no}", headers=app_headers).json()["application"]
    assert float(reloaded_app["loan_amount"]) == 135000.0 and int(reloaded_app["loan_term_months"]) == 240
    res_patch_off = client.patch(
        f"/api/application/{created_app_no}",
        json={"loan_term_months": 180},
        headers=off_headers
    )
    assert res_patch_off.status_code == 200, res_patch_off.text
    reloaded_after_off = client.get(f"/api/application/{created_app_no}", headers=off_headers).json()["application"]
    assert int(reloaded_after_off["loan_term_months"]) == 180 and float(reloaded_after_off["loan_amount"]) == 135000.0
    print(f"[PASS] 19b. PATCH /api/application/{created_app_no} -> Persistent parameter updates & audit entry verified")

    res = client.get("/api/saved-applications", headers=app_headers)
    assert res.status_code == 200
    app_vault = res.json()["applications"]
    assert any(a["application_no"] == created_app_no for a in app_vault)
    print(f"[PASS] 20. GET /api/saved-applications -> 200 Applicant isolated list ({len(app_vault)} records)")

    res = client.get("/api/saved-applications")
    assert res.status_code == 401
    res = client.get("/api/saved-applications?role=officer", headers=app_headers)
    assert res.status_code == 403

    res = client.get("/api/saved-applications?role=officer", headers=off_headers)
    assert res.status_code == 200
    off_vault = res.json()["applications"]
    assert len(off_vault) >= len(app_vault)
    print(f"[PASS] 21. GET /api/saved-applications -> 200 Officer full portfolio ({len(off_vault)} records)")

    res = client.post("/api/officer/sanction", json={
        "application_no": created_app_no,
        "status": "Approved",
        "officer_role": "applicant"
    }, headers=app_headers)
    assert res.status_code == 403

    res = client.post("/api/officer/sanction", json={
        "application_no": created_app_no,
        "status": "Approved",
        "officer_role": "officer"
    }, headers=app_headers)
    assert res.status_code == 403

    res = client.post("/api/officer/sanction", json={
        "application_no": created_app_no,
        "status": "Approved",
        "officer_role": "officer"
    })
    assert res.status_code == 403
    print("[PASS] 22. POST /api/officer/sanction -> 403 Unauthorized & spoofed requests blocked")

    res = client.post("/api/officer/sanction", json={
        "application_no": created_app_no,
        "status": "Approved",
        "remarks": "Credit verified with positive CIBIL and compliant DTI ratio.",
        "officer_role": "officer"
    }, headers=off_headers)
    assert res.status_code == 200
    assert res.json()["success"] is True
    print("[PASS] 23. POST /api/officer/sanction -> 200 Decision recorded with audit remarks")

    assert client.get("/api/officer/audit-logs").status_code == 403
    assert client.get("/api/officer/audit-logs", headers=app_headers).status_code == 403
    assert client.post("/api/officer/audit-logs", json={"application_no": created_app_no, "action": "TEST"}, headers=app_headers).status_code == 403
    res_log_post = client.post("/api/officer/audit-logs", json={
        "application_no": created_app_no,
        "action": "COMPLIANCE_REVIEW",
        "notes": "Verified income proof",
        "remarks": "DTI compliant"
    }, headers=off_headers)
    assert res_log_post.status_code == 201
    res_log_get = client.get("/api/officer/audit-logs", headers=off_headers)
    assert res_log_get.status_code == 200
    logs_list = res_log_get.json()["logs"]
    log_actions = {(l.get("application_no"), l.get("action")) for l in logs_list}
    assert (created_app_no, "COMPLIANCE_REVIEW") in log_actions
    assert (created_app_no, "Officer Updated Terms") in log_actions
    assert any(
        l.get("application_no") == created_app_no
        and l.get("action") == "Officer Updated Terms"
        and "₹135,000" in (l.get("notes") or "")
        for l in logs_list
    ), "Expected INR formatted audit note for Officer Updated Terms"
    print("[PASS] 23b. GET/POST /api/officer/audit-logs -> 403 for Applicant/anon, 200/201 persistent log for Officer")

    assert client.get("/api/officer/backup?format=json").status_code == 403
    assert client.get("/api/officer/backup?format=json", headers=app_headers).status_code == 403
    assert client.get("/api/officer/backup?format=sqlite", headers=app_headers).status_code == 403
    res_bk_json = client.get("/api/officer/backup?format=json", headers=off_headers)
    assert res_bk_json.status_code == 200
    bk_body = res_bk_json.json()
    assert "applications" in bk_body and "audit_logs" in bk_body
    res_bk_sql = client.get("/api/officer/backup?format=sqlite", headers=off_headers)
    assert res_bk_sql.status_code == 200
    assert res_bk_sql.content[:15] == b"SQLite format 3"
    print("[PASS] 23c. GET /api/officer/backup -> 403 for Applicant, 200 JSON & valid SQLite3 backup for Officer")

    assert client.get("/api/fairness").status_code == 403
    assert client.get("/api/fairness", headers=app_headers).status_code == 403
    res = client.get("/api/fairness", headers=off_headers)
    assert res.status_code == 200
    fairness = res.json()
    assert "gender_fairness" in fairness and "territory_fairness" in fairness
    print(f"[PASS] 24. GET /api/fairness -> 403 Applicant, 200 Officer (DIR Gender: {fairness['gender_fairness']['disparate_impact_ratio']})")

    res = client.get("/api/fairness?affirmative=true", headers=off_headers)
    assert res.status_code == 200
    aff_fairness = res.json()
    assert aff_fairness.get("affirmative_calibration_active") is True
    assert aff_fairness["territory_fairness"]["disparate_impact_ratio"] >= fairness["territory_fairness"]["disparate_impact_ratio"]
    print(f"[PASS] 24b. GET /api/fairness?affirmative=true -> 200 DIR Territory: {aff_fairness['territory_fairness']['disparate_impact_ratio']}")

    assert client.get("/api/accuracy").status_code == 403
    assert client.get("/api/accuracy", headers=app_headers).status_code == 403
    res = client.get("/api/accuracy", headers=off_headers)
    assert res.status_code == 200
    acc = res.json()
    assert acc["overall_accuracy_percent"] > 80.0
    assert isinstance(acc.get("feature_weights"), list) and len(acc["feature_weights"]) > 0
    print(f"[PASS] 25. GET /api/accuracy -> 403 Applicant, 200 Officer ({acc['overall_accuracy_percent']}%)")

    assert client.get("/api/applicants").status_code == 403
    assert client.get("/api/applicants", headers=app_headers).status_code == 403
    res = client.get("/api/applicants", headers=off_headers)
    assert res.status_code == 200
    applicants = res.json()
    assert applicants["total_in_db"] > 0
    print(f"[PASS] 26. GET /api/applicants -> 403 Applicant, 200 Officer ({applicants['total_in_db']} records)")

    res = client.get("/api/system/availability")
    assert res.status_code == 200 and res.json()["online"] is True
    print("[PASS] 27. GET /api/system/availability -> 200 Website initially Online")

    res = client.post("/api/system/availability", json={"online": False}, headers=app_headers)
    assert res.status_code == 403
    print("[PASS] 28. POST /api/system/availability -> 403 Applicant blocked from toggling site mode")

    res = client.post(
        "/api/system/availability",
        json={"online": False, "maintenance_message": "Routine security upgrade in progress."},
        headers=off_headers
    )
    assert res.status_code == 200 and res.json()["online"] is False
    print("[PASS] 29. POST /api/system/availability -> 200 Officer switched website Offline")

    res = client.post("/api/auth/signin", json={"email": "applicant@meridianbank.in", "password": "Applicant@123", "expected_role": "applicant"})
    assert res.status_code == 503 and res.json().get("offline") is True
    res_acc_blocked = client.get("/api/accuracy", headers=app_headers)
    assert res_acc_blocked.status_code == 503 and res_acc_blocked.json().get("offline") is True
    res_fair_blocked = client.get("/api/fairness")
    assert res_fair_blocked.status_code == 503 and res_fair_blocked.json().get("offline") is True
    res_apply_blocked = client.post("/api/apply", json=sample_app, headers=app_headers)
    assert res_apply_blocked.status_code == 503 and res_apply_blocked.json().get("offline") is True
    res_acc_off = client.get("/api/accuracy", headers=off_headers)
    assert res_acc_off.status_code == 200
    res_fair_off = client.get("/api/fairness", headers=off_headers)
    assert res_fair_off.status_code == 200
    res_health = client.get("/api/health")
    assert res_health.status_code == 200 and res_health.json().get("site_online") is False
    res_off_login = client.post("/api/auth/signin", json={"email": "officer@meridianbank.in", "password": officer_pwd, "expected_role": "officer"})
    assert res_off_login.status_code == 200
    print("[PASS] 30. Offline Maintenance Gate -> 503 for public/applicant, 200 for /api/health & Officer Override + Analytics")

    configured_key = os.environ.get("OFFICER_REGISTRATION_KEY", "OFFICER-2026")
    res = client.post(
        "/api/system/availability",
        json={
            "online": True,
            "officer_key": configured_key,
            "title": "Portal Temporarily Offline",
            "maintenance_message": "Meridian FairLend AI is currently offline for scheduled maintenance. Online underwriting will resume shortly."
        }
    )
    assert res.status_code == 200 and res.json()["online"] is True
    print("[PASS] 31. POST /api/system/availability -> 200 Website restored Online cleanly")

    rate_ip = "203.0.113.77"
    for _ in range(8):
        r_fail = client.post(
            "/api/auth/signin",
            json={"email": "officer@meridianbank.in", "password": "BadPassword123"},
            headers={"X-Forwarded-For": rate_ip}
        )
        assert r_fail.status_code == 401
    r_blocked = client.post(
        "/api/auth/signin",
        json={"email": "officer@meridianbank.in", "password": "BadPassword123"},
        headers={"X-Forwarded-For": rate_ip}
    )
    assert r_blocked.status_code == 429

    key_ip = "203.0.113.88"
    for _ in range(8):
        k_fail = client.post(
            "/api/system/availability",
            json={"online": True, "officer_key": "WRONG-KEY-TEST"},
            headers={"X-Forwarded-For": key_ip}
        )
        assert k_fail.status_code == 403
    k_blocked = client.post(
        "/api/system/availability",
        json={"online": True, "officer_key": "WRONG-KEY-TEST"},
        headers={"X-Forwarded-For": key_ip}
    )
    assert k_blocked.status_code == 429
    print("[PASS] 32. Rate Limiting -> 429 Too Many Requests enforced on repeated auth & passkey failures")

    otp_env_keys = [
        "EMAIL_PROVIDER", "BREVO_API_KEY", "RESEND_API_KEY",
        "EMAIL_WEBHOOK_URL", "EMAIL_WEBHOOK_SECRET",
        "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD",
        "EMAIL_FROM", "REQUIRE_EMAIL_OTP", "OTP_ALLOW_DEV_PREVIEW"
    ]
    saved_env = {k: os.environ.get(k) for k in otp_env_keys}
    orig_send_otp = email_service.send_otp_email
    run_uid = uuid.uuid4().hex[:8]

    def _restore_otp_env():
        email_service.send_otp_email = orig_send_otp
        for k, v in saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    try:
        for k in otp_env_keys:
            os.environ.pop(k, None)

        r_status_off = client.get("/api/auth/otp-status")
        assert r_status_off.status_code == 200
        st_off = r_status_off.json()
        assert st_off["email_otp_configured"] is False
        assert st_off["require_otp_on_forgot_password"] is True

        r_send_unconf = client.post(
            "/api/auth/send-otp",
            json={"email": f"otp.unconf.{run_uid}@example.com", "purpose": "signup", "lang": "en"},
            headers={"X-Forwarded-For": "198.51.100.33"}
        )
        assert r_send_unconf.status_code == 503
        assert r_send_unconf.json().get("code") == "EMAIL_PROVIDER_NOT_CONFIGURED"
        print("[PASS] 33. GET /api/auth/otp-status & fail-closed 503 when email provider unconfigured")

        dispatched_emails = []

        def _mock_send_otp(to_email, otp_code, purpose, lang="en"):
            dispatched_emails.append({
                "to": to_email,
                "otp_code": otp_code,
                "purpose": purpose,
                "lang": lang
            })
            return True, "sent"

        os.environ["BREVO_API_KEY"] = "test-brevo-key-000"
        os.environ["EMAIL_FROM"] = "no-reply@meridianbank.in"
        os.environ["REQUIRE_EMAIL_OTP"] = "true"
        email_service.send_otp_email = _mock_send_otp

        r_status_on = client.get("/api/auth/otp-status")
        assert r_status_on.status_code == 200
        st_on = r_status_on.json()
        assert st_on["email_otp_configured"] is True
        assert st_on["provider"] == "brevo"
        assert st_on["require_otp_on_signup"] is True
        assert st_on["require_otp_on_application"] is True

        r_dup = client.post(
            "/api/auth/send-otp",
            json={"email": "applicant@meridianbank.in", "purpose": "signup", "lang": "en"},
            headers={"X-Forwarded-For": "198.51.100.34"}
        )
        assert r_dup.status_code == 409

        su_email = f"otp.signup.{run_uid}@example.com"
        r_no_otp_su = client.post("/api/auth/signup", json={
            "full_name": "OTP Verified Borrower",
            "email": su_email,
            "phone": "9811554433",
            "password": "Password@123",
            "confirm_password": "Password@123",
            "role": "applicant"
        })
        assert r_no_otp_su.status_code == 400
        assert r_no_otp_su.json().get("code") == "EMAIL_OTP_REQUIRED"

        email_service.send_otp_email = lambda *args, **kwargs: (False, "Simulated upstream SMTP outage")
        r_502 = client.post(
            "/api/auth/send-otp",
            json={"email": su_email, "purpose": "signup", "lang": "en"},
            headers={"X-Forwarded-For": "198.51.100.35"}
        )
        assert r_502.status_code == 502 and r_502.json().get("code") == "EMAIL_DELIVERY_FAILED"
        email_service.send_otp_email = _mock_send_otp

        r_send_su = client.post(
            "/api/auth/send-otp",
            json={"email": su_email, "purpose": "signup", "lang": "hi"},
            headers={"X-Forwarded-For": "198.51.100.34"}
        )
        assert r_send_su.status_code == 200
        send_body = r_send_su.json()
        assert send_body["dispatched"] is True and "dev_preview_otp" not in send_body
        assert len(dispatched_emails) == 1 and dispatched_emails[-1]["lang"] == "hi"
        su_otp_code = dispatched_emails[-1]["otp_code"]

        r_cooldown = client.post(
            "/api/auth/send-otp",
            json={"email": su_email, "purpose": "signup", "lang": "en"},
            headers={"X-Forwarded-For": "198.51.100.34"}
        )
        assert r_cooldown.status_code == 429 and int(r_cooldown.headers.get("Retry-After", "0")) >= 1

        bad_su_code = "000000" if su_otp_code != "000000" else "111111"
        r_bad_v = client.post(
            "/api/auth/verify-otp",
            json={"email": su_email, "purpose": "signup", "otp": bad_su_code},
            headers={"X-Forwarded-For": "198.51.100.34"}
        )
        assert r_bad_v.status_code == 400

        r_ok_v = client.post(
            "/api/auth/verify-otp",
            json={"email": su_email, "purpose": "signup", "otp": su_otp_code},
            headers={"X-Forwarded-For": "198.51.100.34"}
        )
        assert r_ok_v.status_code == 200
        su_vtok = r_ok_v.json()["verification_token"]
        assert su_vtok.startswith("vtok-")

        r_ok_su = client.post("/api/auth/signup", json={
            "full_name": "OTP Verified Borrower",
            "email": su_email,
            "phone": "9811554433",
            "password": "Password@123",
            "confirm_password": "Password@123",
            "role": "applicant",
            "otp_verification_token": su_vtok
        })
        assert r_ok_su.status_code == 201 and r_ok_su.json().get("email_verified") is True

        r_replay_su = client.post("/api/auth/signup", json={
            "full_name": "Replay Attacker",
            "email": f"replay.{run_uid}@example.com",
            "phone": "9811554434",
            "password": "Password@123",
            "confirm_password": "Password@123",
            "role": "applicant",
            "otp_verification_token": su_vtok
        })
        assert r_replay_su.status_code == 400
        print("[PASS] 34. Real Email OTP Signup -> 502 rollback, 409 duplicate, 429 cooldown, Hindi dispatch, 201 verified signup & replay block")

        r_si_new = client.post(
            "/api/auth/signin",
            json={"email": su_email, "password": "Password@123", "expected_role": "applicant"},
            headers={"X-Forwarded-For": "198.51.100.36"}
        )
        assert r_si_new.status_code == 200
        su_session_tok = r_si_new.json()["token"]
        su_headers = {"Authorization": f"Bearer {su_session_tok}"}
        assert client.get("/api/auth/session", headers=su_headers).status_code == 200

        before_fp_count = len(dispatched_emails)
        r_unknown_fp = client.post(
            "/api/auth/send-otp",
            json={"email": f"missing.user.{run_uid}@example.com", "purpose": "forgot_password", "lang": "en"},
            headers={"X-Forwarded-For": "198.51.100.36"}
        )
        assert r_unknown_fp.status_code == 200 and r_unknown_fp.json()["dispatched"] is True
        assert len(dispatched_emails) == before_fp_count

        r_send_fp = client.post(
            "/api/auth/send-otp",
            json={"email": su_email, "purpose": "forgot_password", "lang": "en"},
            headers={"X-Forwarded-For": "198.51.100.36"}
        )
        assert r_send_fp.status_code == 200
        assert len(dispatched_emails) == before_fp_count + 1
        fp_otp_code = dispatched_emails[-1]["otp_code"]

        r_ver_fp = client.post(
            "/api/auth/verify-otp",
            json={"email": su_email, "purpose": "forgot_password", "otp": fp_otp_code},
            headers={"X-Forwarded-For": "198.51.100.36"}
        )
        assert r_ver_fp.status_code == 200
        fp_vtok = r_ver_fp.json()["verification_token"]

        r_reset_ok = client.post(
            "/api/auth/reset-password",
            json={
                "email": su_email,
                "verification_token": fp_vtok,
                "password": "NewPassword@789",
                "confirm_password": "NewPassword@789"
            },
            headers={"X-Forwarded-For": "198.51.100.36"}
        )
        assert r_reset_ok.status_code == 200 and r_reset_ok.json()["success"] is True

        assert client.get("/api/auth/session", headers=su_headers).status_code == 401
        r_old_si = client.post(
            "/api/auth/signin",
            json={"email": su_email, "password": "Password@123", "expected_role": "applicant"},
            headers={"X-Forwarded-For": "198.51.100.37"}
        )
        assert r_old_si.status_code == 401
        r_new_si = client.post(
            "/api/auth/signin",
            json={"email": su_email, "password": "NewPassword@789", "expected_role": "applicant"},
            headers={"X-Forwarded-For": "198.51.100.38"}
        )
        assert r_new_si.status_code == 200
        su_new_headers = {"Authorization": f"Bearer {r_new_si.json()['token']}"}
        print("[PASS] 35. Forgot Password Real Email OTP -> anti-enumeration, password updated & prior Bearer sessions revoked")

        r_app_no_otp = client.post("/api/apply", json={**sample_app, "email": su_email}, headers=su_new_headers)
        assert r_app_no_otp.status_code == 400 and r_app_no_otp.json().get("code") == "EMAIL_OTP_REQUIRED"

        r_send_app_otp = client.post(
            "/api/auth/send-otp",
            json={"email": su_email, "purpose": "application", "lang": "en"},
            headers={"X-Forwarded-For": "198.51.100.39"}
        )
        assert r_send_app_otp.status_code == 200
        app_otp_code = dispatched_emails[-1]["otp_code"]

        r_ver_app_otp = client.post(
            "/api/auth/verify-otp",
            json={"email": su_email, "purpose": "application", "otp": app_otp_code},
            headers={"X-Forwarded-For": "198.51.100.39"}
        )
        assert r_ver_app_otp.status_code == 200
        app_vtok = r_ver_app_otp.json()["verification_token"]

        r_apply_ok = client.post(
            "/api/apply",
            json={**sample_app, "email": su_email, "otp_verification_token": app_vtok},
            headers=su_new_headers
        )
        assert r_apply_ok.status_code == 201
        apply_body = r_apply_ok.json()
        assert apply_body["email_otp_verified"] is True
        assert int(apply_body["application"].get("email_otp_verified") or 0) == 1

        r_apply_replay = client.post(
            "/api/apply",
            json={**sample_app, "email": su_email, "otp_verification_token": app_vtok},
            headers=su_new_headers
        )
        assert r_apply_replay.status_code == 400

        os.environ["REQUIRE_EMAIL_OTP"] = "false"
        for k in ("EMAIL_PROVIDER", "BREVO_API_KEY", "RESEND_API_KEY", "EMAIL_WEBHOOK_URL", "EMAIL_WEBHOOK_SECRET", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"):
            os.environ.pop(k, None)
        r_forge = client.post(
            "/api/apply",
            json={**sample_app, "email": "applicant@meridianbank.in", "applicant_email": "applicant@meridianbank.in"},
            headers=su_new_headers
        )
        assert r_forge.status_code == 201
        assert r_forge.json()["application"]["applicant_email"] == su_email
        print("[PASS] 36. Application Check Real Email OTP -> verified submit (201), replay block (400) & cross-account email forgery blocked")

        orig_requests_post = email_service.requests.post
        try:
            webhook_calls = []

            class _FakeWebhookResp:
                def __init__(self, code, body, is_json=True):
                    self.status_code = code
                    self.text = body
                    self._is_json = is_json

                def json(self):
                    if not self._is_json:
                        raise ValueError("not json")
                    return __import__("json").loads(self.text)

            def _fake_wh_post(url, headers=None, json=None, timeout=15):
                webhook_calls.append({"url": url, "json": json})
                return _FakeWebhookResp(200, '{"status":"success"}')

            os.environ["RESEND_API_KEY"] = "re_dummy_123"
            os.environ["EMAIL_WEBHOOK_URL"] = "https://script.google.com/macros/s/dummy-id/exec"
            os.environ["EMAIL_WEBHOOK_SECRET"] = "sec-xyz-99"
            email_service.send_otp_email = orig_send_otp
            email_service.requests.post = _fake_wh_post

            assert email_service.get_configured_provider() == "webhook"
            wh_ok, _ = email_service.send_otp_email("anyone@yahoo.com", "654321", "signup", "en")
            assert wh_ok is True
            assert len(webhook_calls) == 1
            assert webhook_calls[0]["json"]["to"] == "anyone@yahoo.com"
            assert webhook_calls[0]["json"]["secret"] == "sec-xyz-99"
            assert "654321" in webhook_calls[0]["json"]["htmlBody"]

            email_service.requests.post = lambda *a, **kw: _FakeWebhookResp(200, "<!doctype html><html>Sign in</html>", False)
            wh_html_ok, wh_html_msg = email_service.send_otp_email("anyone@yahoo.com", "654321", "signup", "en")
            assert wh_html_ok is False and "Anyone" in wh_html_msg

            email_service.requests.post = lambda *a, **kw: _FakeWebhookResp(200, '{"status":"error","message":"Bad secret"}')
            wh_err_ok, wh_err_msg = email_service.send_otp_email("anyone@yahoo.com", "654321", "signup", "en")
            assert wh_err_ok is False and "Bad secret" in wh_err_msg
            print("[PASS] 37. Global Email Webhook Relay (Apps Script) -> priority, payload secret, HTML guard & error handling verified")
        finally:
            email_service.requests.post = orig_requests_post
    finally:
        _restore_otp_env()

    print("=" * 70)
    print("ALL FASTAPI ENDPOINTS & POLICIES VALIDATED SUCCESSFULLY (100% PASS)")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
