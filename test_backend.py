import os
import sqlite3
import tempfile
import uuid
from src.preprocess import normalize_applicant
from src.train import predict_loan
from src.explain import explain_decision
from src.fairness import check_fairness
from backend import load_sample_dataset, simulate_what_if
from src.database import database_operations as db_ops
import database

def run_tests():
    print("=" * 70)
    print("  RINDRISTI FAIRLEND SYSTEM VALIDATION & TEST SUITE")
    print("=" * 70)

    dataset = load_sample_dataset()
    assert len(dataset) > 0, "Failed to load sample dataset"
    assert all(float(r['loan_amount']) > 1000.0 for r in dataset[:20]), "Historical dataset should convert to INR"
    print("[OK] Test 1: Historical portfolio loaded successfully in INR")

    raw_sample = {
        'ApplicantIncome': '45,000',
        'CoapplicantIncome': '15,000',
        'LoanAmount': '150',
        'Loan_Amount_Term': '360',
        'cibil_score': '760',
        'property_area': 'Semiurban',
        'salary_slip': 'Yes'
    }
    norm = normalize_applicant(raw_sample)
    assert norm['total_income'] == 60000.0, "Total income calculation mismatch"
    assert norm['loan_amount_inr'] == 150000.0, f"Legacy LoanAmount conversion mismatch: {norm['loan_amount_inr']}"
    assert norm['monthly_emi'] > 0, "Monthly EMI calculation mismatch"
    assert norm['dti_percent'] < 10.0, "DTI calculation mismatch"

    flex_direct = normalize_applicant({'applicant_income': 50000, 'loan_amount': 150000, 'loan_term_months': 60, 'cibil_score': 760})
    assert flex_direct['loan_amount_inr'] == 150000.0, "Direct INR loan amount mismatch"
    flex_small = normalize_applicant({'applicant_income': 20000, 'loan_amount': 1000, 'loan_term_months': 12, 'cibil_score': 760})
    assert flex_small['loan_amount_inr'] == 1000.0, f"Small flexible INR loan should remain Rs.1000, got {flex_small['loan_amount_inr']}"
    print(f"[OK] Test 2: Feature normalization pipeline verified (DTI: {norm['dti_percent']}%, EMI: Rs. {norm['monthly_emi']})")

    pred = predict_loan(norm)
    assert pred['status'] in ['Approved', 'Conditional', 'Rejected'], "Invalid decision status"
    assert 2 <= pred['approval_likelihood'] <= 98, "Score points outside valid range"
    pred_roundtrip = predict_loan(normalize_applicant({'applicant_income': 60000, 'loan_amount': 250000, 'loan_term_months': 120, 'cibil_score': 780}))
    assert pred_roundtrip['requested_loan_inr'] == 250000, f"Roundtrip loan INR mismatch: {pred_roundtrip['requested_loan_inr']}"
    print(f"[OK] Test 3: Underwriting scoring engine operational ({pred['status']}, Likelihood: {pred['approval_likelihood']}%)")

    exp = explain_decision(norm, pred)
    assert 'positive_factors' in exp and len(exp['positive_factors']) > 0, "Missing positive factors"
    assert 'verdict_summary' in exp, "Missing verdict summary"
    print(f"[OK] Test 4: Explainability engine verified ({len(exp['positive_factors'])} positive drivers, {len(exp['negative_factors'])} friction points)")

    fairness = check_fairness(dataset[:100])
    assert 'gender_fairness' in fairness, "Missing gender fairness audit"
    assert 'territory_fairness' in fairness, "Missing territory fairness audit"
    print(f"[OK] Test 5: Algorithmic fairness auditor verified (DIR Gender: {fairness['gender_fairness']['disparate_impact_ratio']})")

    sim = simulate_what_if(norm, {'loan_amount': 100000, 'loan_term_months': 240})
    assert 'deltas' in sim, "Missing simulation deltas"
    assert sim['simulated']['requested_loan_inr'] == 100000, f"Simulated INR mismatch: {sim['simulated']['requested_loan_inr']}"
    print(f"[OK] Test 6: Scenario simulator operational (Score delta: {sim['deltas']['score_change']:+d})")

    app_login = database.login_user('applicant@rindristi.in', 'Applicant@123')
    assert app_login.get('success'), "Applicant login failed"
    assert app_login['user']['role'] == 'applicant', "Applicant role mismatch"

    officer_pwd = os.environ.get('OFFICER_ADMIN_PASSWORD', 'Officer@2026')
    off_login = database.login_user('officer@rindristi.in', officer_pwd)
    assert off_login.get('success'), "Officer login failed"
    assert off_login['user']['role'] == 'officer', "Officer role mismatch"
    print(f"[OK] Test 7: Authentication verified for Applicant ({app_login['user']['email']}) and Officer ({off_login['user']['email']})")

    try:
        database.register_user('Fake Officer', 'fake.officer.test@example.com', '9811000000', 'Password@123', 'officer', 'INVALID_KEY')
        assert False, "Should have rejected unauthorized officer registration"
    except ValueError:
        pass
    print("[OK] Test 8: Security clearance verified (unauthorized officer registration blocked)")

    test_applicant = {
        'full_name': 'Kavita Patel',
        'phone': '9811223344',
        'gender': 'Female',
        'marital_status': 'Yes',
        'dependents': '1',
        'education': 'Graduate',
        'employment_type': 'Self-Employed (Small Business)',
        'applicant_income': 35000,
        'coapplicant_income': 20000,
        'loan_purpose': 'Business Expansion',
        'loan_amount': 140000,
        'loan_term_months': 360,
        'cibil_score': 790,
        'property_area': 'Semiurban',
        'salary_slip': 'Yes'
    }
    saved = database.save_loan_application(test_applicant, pred, exp, user_id=app_login['user']['id'])
    assert saved.get('application_no'), "Failed to persist application"
    assert float(saved['loan_amount']) == 140000.0, f"Saved loan amount mismatch: {saved['loan_amount']}"
    print(f"[OK] Test 9: Persistence verified -> Application No: {saved['application_no']} (Linked to User ID: {app_login['user']['id']})")

    app_vault = database.get_all_saved_applications(user_id=app_login['user']['id'], role='applicant')
    off_vault = database.get_all_saved_applications(role='officer')
    assert len(app_vault) <= len(off_vault), "Applicant should not see more applications than officer"
    print(f"[OK] Test 10: Role-based isolation verified (Applicant visible: {len(app_vault)}, Officer visible: {len(off_vault)})")

    updated_fields = {
        'loan_amount': 110000,
        'loan_term_months': 240,
        'cibil_score': 810,
        'salary_slip': 'Yes'
    }
    merged_for_score = {**test_applicant, **updated_fields}
    new_pred = predict_loan(merged_for_score)
    new_exp = explain_decision(merged_for_score, new_pred)
    patched = database.update_application_details(saved['application_no'], updated_fields, new_pred, new_exp)
    assert patched is not None, "update_application_details returned None"
    assert float(patched['loan_amount']) == 110000.0, "Updated loan amount did not persist"
    assert int(patched['loan_term_months']) == 240, "Updated tenure did not persist"
    assert int(patched['cibil_score']) == 810, "Updated CIBIL score did not persist"
    reloaded = database.get_application_by_number(saved['application_no'])
    assert reloaded is not None and float(reloaded['loan_amount']) == 110000.0, "Reloaded record mismatch after patch"
    print(f"[OK] Test 11: update_application_details persisted & verified ({saved['application_no']} -> Rs.110,000 / 240m)")

    log_entry = database.add_audit_log(
        application_no=saved['application_no'],
        action='VAULT_INSPECT',
        notes='Automated compliance verification entry',
        remarks='Verified CIBIL 810',
        officer_id=off_login['user']['id'],
        officer_name=off_login['user']['full_name'],
        officer_role='officer'
    )
    assert log_entry.get('id') is not None, "Audit log failed to insert"
    recent_logs = database.get_audit_logs(limit=20)
    assert any(l.get('application_no') == saved['application_no'] and l.get('action') == 'VAULT_INSPECT' for l in recent_logs), "Audit log not found on readback"
    print(f"[OK] Test 12: add_audit_log & get_audit_logs verified ({len(recent_logs)} log entries retrieved)")

    tok = app_login.get('token', '')
    assert tok, "Login did not issue a session token"
    verified_sess = database.verify_session_token(f"Bearer {tok}")
    assert verified_sess is not None and verified_sess['email'] == 'applicant@rindristi.in', "Session token failed verification"
    revoked = database.revoke_session_token(f"Bearer {tok}")
    assert revoked is True, "Session token revocation returned False"
    assert database.verify_session_token(tok) is None, "Revoked session token still accepted"
    print("[OK] Test 13: Server-side session issuance, verification & revocation verified")

    iso_uid = uuid.uuid4().hex[:8]
    user_a = database.register_user('Rohan Mehta', f'rohan.a.{iso_uid}@example.com', '9811100001', 'Password@123', 'applicant')
    user_b = database.register_user('Rohan Mehta', f'rohan.b.{iso_uid}@example.com', '9811100002', 'Password@123', 'applicant')
    app_a_data = {**test_applicant, 'full_name': 'Rohan Mehta', 'applicant_email': user_a['email']}
    saved_a = database.save_loan_application(app_a_data, pred, exp, user_id=user_a['id'])
    vault_a = database.get_all_saved_applications(user_id=user_a['id'], role='applicant', user_email=user_a['email'])
    vault_b = database.get_all_saved_applications(user_id=user_b['id'], role='applicant', user_email=user_b['email'])
    assert any(r['application_no'] == saved_a['application_no'] for r in vault_a), "Owner A missing own application"
    assert not any(r['application_no'] == saved_a['application_no'] for r in vault_b), "Same full_name user B leaked User A application!"
    print("[OK] Test 14: Zero full_name cross-user leakage verified across same-named applicants")

    orig_db, orig_csv = db_ops.DB_FILE, db_ops.EXPORT_CSV
    try:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmpdir:
            tmp_db = os.path.join(tmpdir, "mig_test.db")
            tmp_csv = os.path.join(tmpdir, "mig_test.csv")
            db_ops.DB_FILE = tmp_db
            db_ops.EXPORT_CSV = tmp_csv
            db_ops.init_db()
            c = sqlite3.connect(tmp_db)
            try:
                c.execute("DELETE FROM system_settings WHERE setting_key = 'loan_amount_inr_migrated'")
                c.execute("DELETE FROM loan_applications")
                c.execute('''
                    INSERT INTO loan_applications (
                        application_no, created_at, updated_at, full_name, phone, gender,
                        marital_status, dependents, education, employment_type, salary_slip,
                        applicant_income, coapplicant_income, loan_amount, loan_term_months,
                        cibil_score, credit_history, property_area, loan_purpose,
                        approval_likelihood, status, monthly_emi, dti_percent
                    ) VALUES (
                        'MB-MIG-LEGACY', '2026-10-01 10:00:00', '2026-10-01 10:00:00', 'Legacy Row',
                        '9999999999', 'Female', 'No', '0', 'Graduate', 'Salaried', 'Yes',
                        40000, 0, 350.0, 84, 760, 1, 'Rural', 'Home', 85, 'Approved', 4167.0, 10.4
                    )
                ''')
                c.commit()
            finally:
                c.close()
            db_ops.init_db()
            c2 = sqlite3.connect(tmp_db)
            try:
                mig_val = c2.execute("SELECT loan_amount FROM loan_applications WHERE application_no = 'MB-MIG-LEGACY'").fetchone()[0]
                assert float(mig_val) == 350000.0, f"Legacy migration failed: got {mig_val}"
                flag = c2.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'loan_amount_inr_migrated'").fetchone()[0]
                assert flag == "true", "Migration completion flag not set"
            finally:
                c2.close()

            small_flex_app = {**test_applicant, 'loan_amount': 1000, 'loan_term_months': 12}
            small_pred = predict_loan(small_flex_app)
            small_exp = explain_decision(small_flex_app, small_pred)
            saved_small = db_ops.save_application(small_flex_app, small_pred, small_exp, user_id=app_login['user']['id'])
            assert float(saved_small['loan_amount']) == 1000.0, f"Small flexible loan mismatch: {saved_small['loan_amount']}"
            db_ops.init_db()
            reloaded_small = db_ops.get_application_by_number(saved_small['application_no'])
            assert float(reloaded_small['loan_amount']) == 1000.0, "Idempotent re-run must not re-scale flexible INR row"
            db_ops.checkpoint_db('TRUNCATE')
    finally:
        db_ops.DB_FILE = orig_db
        db_ops.EXPORT_CSV = orig_csv
    print("[OK] Test 15: Idempotent legacy thousands -> INR DB migration & flexible small loan integrity verified")

    orig_db, orig_csv = db_ops.DB_FILE, db_ops.EXPORT_CSV
    try:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmpdir:
            tmp_db = os.path.join(tmpdir, "otp_test.db")
            tmp_csv = os.path.join(tmpdir, "otp_test.csv")
            db_ops.DB_FILE = tmp_db
            db_ops.EXPORT_CSV = tmp_csv
            db_ops.init_db()

            c_schema = sqlite3.connect(tmp_db)
            try:
                tbls = {r[0] for r in c_schema.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
                assert "email_otps" in tbls, "email_otps table missing after init_db()"
                cols = {r[1] for r in c_schema.execute("PRAGMA table_info(loan_applications)").fetchall()}
                assert "email_otp_verified" in cols, "email_otp_verified column missing after init_db()"
            finally:
                c_schema.close()

            otp1 = database.create_email_otp('otp.cooldown@example.com', 'signup', ttl_seconds=600, cooldown_seconds=60)
            assert len(otp1['otp_code']) == 6 and otp1['otp_code'].isdigit(), "OTP code must be 6 numeric digits"
            try:
                database.create_email_otp('otp.cooldown@example.com', 'signup', ttl_seconds=600, cooldown_seconds=60)
                assert False, "Expected immediate second OTP request to trigger cooldown"
            except ValueError as err:
                assert str(err).startswith("COOLDOWN:"), f"Expected COOLDOWN error, got: {err}"

            wrong_code = "000000" if otp1['otp_code'] != "000000" else "111111"
            for attempt_idx in range(5):
                try:
                    database.verify_email_otp('otp.cooldown@example.com', 'signup', wrong_code)
                    assert False, "Wrong OTP should fail verification"
                except ValueError as err:
                    if attempt_idx < 4:
                        assert "remaining" in str(err), f"Expected remaining attempts notice, got: {err}"
                    else:
                        assert "Maximum attempts" in str(err), f"Expected lockout after 5 bad attempts, got: {err}"
            try:
                database.verify_email_otp('otp.cooldown@example.com', 'signup', otp1['otp_code'])
                assert False, "Correct OTP must remain locked after 5 wrong attempts"
            except ValueError as err:
                assert "Maximum verification attempts reached" in str(err)

            otp2 = database.create_email_otp('otp.verify@example.com', 'forgot_password', ttl_seconds=600, cooldown_seconds=60)
            ver2 = database.verify_email_otp('otp.verify@example.com', 'forgot_password', otp2['otp_code'])
            assert ver2['verified'] is True and ver2['verification_token'].startswith('vtok-')
            assert database.validate_otp_verification_token('otp.verify@example.com', 'forgot_password', ver2['verification_token']) is True
            try:
                database.validate_otp_verification_token('otp.verify@example.com', 'signup', ver2['verification_token'])
                assert False, "Token purpose mismatch should fail"
            except ValueError:
                pass
            assert database.consume_otp_verification_token('otp.verify@example.com', 'forgot_password', ver2['verification_token']) is True
            try:
                database.consume_otp_verification_token('otp.verify@example.com', 'forgot_password', ver2['verification_token'])
                assert False, "Single-use verification token replay must be rejected"
            except ValueError:
                pass
            try:
                database.create_email_otp('otp.apply@example.com', 'application', ttl_seconds=600, cooldown_seconds=60)
                assert False, "Application OTP purpose must be rejected"
            except ValueError:
                pass

            database.register_user('OTP Reset User', 'otp.reset@example.com', '9811998877', 'OldPass@123', 'applicant')
            pre_login = database.login_user('otp.reset@example.com', 'OldPass@123')
            assert pre_login.get('success') and pre_login.get('token')
            old_tok = pre_login['token']
            assert database.verify_session_token(old_tok) is not None

            fp_otp = database.create_email_otp('otp.reset@example.com', 'forgot_password', ttl_seconds=600, cooldown_seconds=60)
            reset_res = database.reset_password_with_otp('otp.reset@example.com', 'NewPass@456', otp_code=fp_otp['otp_code'])
            assert reset_res['success'] is True
            assert database.verify_session_token(old_tok) is None, "Password reset must revoke active sessions"
            assert database.login_user('otp.reset@example.com', 'OldPass@123').get('success') is False
            post_login = database.login_user('otp.reset@example.com', 'NewPass@456')
            assert post_login.get('success') is True

            saved_ver = db_ops.save_application(
                {**test_applicant, 'applicant_email': 'otp.verify@example.com', 'email_otp_verified': True},
                pred,
                exp,
                user_id=post_login['user']['id']
            )
            assert int(saved_ver.get('email_otp_verified') or 0) == 1
            reloaded_ver = db_ops.get_application_by_number(saved_ver['application_no'])
            assert int(reloaded_ver.get('email_otp_verified') or 0) == 1
            db_ops.checkpoint_db('TRUNCATE')
    finally:
        db_ops.DB_FILE = orig_db
        db_ops.EXPORT_CSV = orig_csv
    print("[OK] Test 16: Real Email OTP DB lifecycle, cooldown, lockout, single-use tokens & password reset session revocation verified")

    orig_db, orig_csv = db_ops.DB_FILE, db_ops.EXPORT_CSV
    try:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmpdir:
            tmp_db = os.path.join(tmpdir, "profile_test.db")
            tmp_csv = os.path.join(tmpdir, "profile_test.csv")
            db_ops.DB_FILE = tmp_db
            db_ops.EXPORT_CSV = tmp_csv
            db_ops.init_db()

            app_reg = database.register_user("Initial Applicant", "init.app@example.com", "9811001122", "Applicant@123", "applicant")
            off_reg = database.register_user(
                "Initial Officer",
                "init.off@example.com",
                "9811001133",
                "Officer@123",
                "officer",
                officer_key=os.environ.get("OFFICER_REGISTRATION_KEY", "OFFICER-2026"),
            )
            app_uid = app_reg["id"]
            off_uid = off_reg["id"]

            saved_prof_app = db_ops.save_application(
                {**test_applicant, "applicant_email": "init.app@example.com"},
                pred,
                exp,
                user_id=app_uid,
            )

            upd_app = db_ops.update_user_profile(app_uid, "Renamed Applicant", "UPDATED.APP@example.com")
            assert upd_app["full_name"] == "Renamed Applicant"
            assert upd_app["email"] == "updated.app@example.com"
            assert database.login_user("init.app@example.com", "Applicant@123").get("success") is False
            assert database.login_user("UPDATED.APP@example.com", "Applicant@123").get("success") is True

            reloaded_app = db_ops.get_application_by_number(saved_prof_app["application_no"])
            assert reloaded_app["applicant_email"] == "updated.app@example.com"

            upd_off = db_ops.update_user_profile(off_uid, "Renamed Officer", "updated.off@example.com")
            assert upd_off["full_name"] == "Renamed Officer"
            assert upd_off["email"] == "updated.off@example.com"
            assert database.login_user("updated.off@example.com", "Officer@123").get("success") is True

            try:
                db_ops.update_user_profile(off_uid, "Renamed Officer", "updated.app@example.com")
                assert False, "Duplicate email across accounts must raise DUPLICATE_EMAIL ValueError"
            except ValueError as dup_err:
                assert str(dup_err).startswith("DUPLICATE_EMAIL:")

            try:
                db_ops.update_user_profile(app_uid, "A", "updated.app@example.com")
                assert False, "Short name must fail validation"
            except ValueError:
                pass

            db_ops.checkpoint_db("TRUNCATE")
    finally:
        db_ops.DB_FILE = orig_db
        db_ops.EXPORT_CSV = orig_csv
    print("[OK] Test 17: Applicant & Officer profile name/email update, Vault email sync & duplicate email guard verified")

    assert db_ops.SESSION_IDLE_TIMEOUT_SECONDS == 600, "Session idle timeout must be 600 seconds (10 minutes)"
    idle_login = database.login_user('applicant@rindristi.in', 'Applicant@123')
    idle_tok = idle_login.get('token', '')
    assert idle_tok and database.verify_session_token(idle_tok) is not None
    with db_ops.get_sqlite_conn() as conn:
        conn.execute(
            "UPDATE user_sessions SET last_seen_at = DATETIME('now', '-605 seconds') WHERE token = ?",
            (idle_tok,)
        )
    assert database.verify_session_token(idle_tok) is None, "Session idle > 10 minutes must expire and return None"
    print("[OK] Test 18: 10-minute session inactivity expiry verified (600s idle timeout)")

    print("-" * 70)
    print("ALL 18 SYSTEM VALIDATION SUITES PASSED CLEANLY (100% OPERATIONAL)")
    print("=" * 70)

if __name__ == '__main__':
    run_tests()
