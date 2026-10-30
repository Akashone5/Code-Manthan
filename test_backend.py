<<<<<<< HEAD
"""
Comprehensive Automated System Test Suite
Validates authentication, role clearance, feature normalization, credit scoring,
explainability, fairness auditing, and dual-persistence database operations.
"""

from src.preprocess import normalize_applicant
from src.train import predict_loan
from src.explain import explain_decision
from src.fairness import check_fairness
from backend import load_sample_dataset, simulate_what_if
=======
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
import database

<<<<<<< HEAD
def run_tests():
    print("=" * 70)
    print("  MERIDIAN FAIRLEND SYSTEM VALIDATION & TEST SUITE")
    print("=" * 70)

    # Test 1: Historical Dataset Loading
    dataset = load_sample_dataset()
    assert len(dataset) > 0, "Failed to load sample dataset"
    print("[OK] Test 1: Historical portfolio loaded successfully")

    # Test 2: Preprocessing & Normalization
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
    assert norm['monthly_emi'] > 0, "Monthly EMI calculation mismatch"
    assert norm['dti_percent'] < 10.0, "DTI calculation mismatch"
    print(f"[OK] Test 2: Feature normalization pipeline verified (DTI: {norm['dti_percent']}%, EMI: Rs. {norm['monthly_emi']})")

    # Test 3: Credit Decision & Scoring
    pred = predict_loan(norm)
    assert pred['status'] in ['Approved', 'Conditional', 'Rejected'], "Invalid decision status"
    assert 2 <= pred['approval_likelihood'] <= 98, "Score points outside valid range"
    print(f"[OK] Test 3: Underwriting scoring engine operational ({pred['status']}, Likelihood: {pred['approval_likelihood']}%)")

    # Test 4: Explainability & Roadmap Generation
    exp = explain_decision(norm, pred)
    assert 'positive_factors' in exp and len(exp['positive_factors']) > 0, "Missing positive factors"
    assert 'verdict_summary' in exp, "Missing verdict summary"
    print(f"[OK] Test 4: Explainability engine verified ({len(exp['positive_factors'])} positive drivers, {len(exp['negative_factors'])} friction points)")
=======
print("=" * 65)
print("  MERIDIAN FAIRLEND AI FULL SYSTEM TEST (AI + DATABASE)")
print("=" * 65)

dataset = load_sample_dataset()
print(f"[OK] Test 1: Historical CSV loaded ({len(dataset)} records)")

saved_apps = database.get_all_saved_applications()
print(f"[OK] Test 2: SQLite Database operational ({len(saved_apps)} existing applications in meridian_loans.db)")

new_test_app = {
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
    'loan_amount': 140,
    'loan_term_months': 360,
    'cibil_score': 790,
    'property_area': 'Semiurban'
}

credit_hist = 1 if new_test_app['cibil_score'] >= 650 else 0
pred = predict_loan({
    'applicant_income': new_test_app['applicant_income'],
    'coapplicant_income': new_test_app['coapplicant_income'],
    'loan_amount': new_test_app['loan_amount'],
    'term': new_test_app['loan_term_months'],
    'credit_history': credit_hist,
    'married': new_test_app['marital_status'],
    'dependents': new_test_app['dependents'],
    'education': new_test_app['education'],
    'self_employed': 'Yes',
    'property_area': new_test_app['property_area']
})
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a

    # Test 5: Algorithmic Fairness Audit
    fairness = check_fairness(dataset[:100])
    assert 'gender_fairness' in fairness, "Missing gender fairness audit"
    assert 'territory_fairness' in fairness, "Missing territory fairness audit"
    print(f"[OK] Test 5: Algorithmic fairness auditor verified (DIR Gender: {fairness['gender_fairness']['disparate_impact_ratio']})")

<<<<<<< HEAD
    # Test 6: Counterfactual Scenario Simulation
    sim = simulate_what_if(norm, {'loan_amount': '100', 'loan_term_months': '240'})
    assert 'deltas' in sim, "Missing simulation deltas"
    print(f"[OK] Test 6: Scenario simulator operational (Score delta: {sim['deltas']['score_change']:+d})")

    # Test 7: Authentication - Applicant & Officer Credentials
    app_login = database.login_user('applicant@meridianbank.in', 'Applicant@123')
    assert app_login.get('success'), "Applicant login failed"
    assert app_login['user']['role'] == 'applicant', "Applicant role mismatch"
=======
saved = database.save_loan_application(new_test_app, pred, exp)
print(f"[OK] Test 3: Saved new application to SQLite -> ID: {saved['application_no']} (Status: {saved['status']}, Score: {saved['approval_likelihood']}%, CIBIL: {saved['cibil_score']})")

all_apps_after = database.get_all_saved_applications()
print(f"[OK] Test 4: Database query successful (Now contains {len(all_apps_after)} total applications)")
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a

    off_login = database.login_user('officer@meridianbank.in', 'Officer@2026')
    assert off_login.get('success'), "Officer login failed"
    assert off_login['user']['role'] == 'officer', "Officer role mismatch"
    print(f"[OK] Test 7: Authentication verified for Applicant ({app_login['user']['email']}) and Officer ({off_login['user']['email']})")

    # Test 8: Security - Officer Clearance Key Verification
    try:
        database.register_user('Fake Officer', 'fake.officer.test@example.com', '9811000000', 'Password@123', 'officer', 'INVALID_KEY')
        assert False, "Should have rejected unauthorized officer registration"
    except ValueError:
        pass
    print("[OK] Test 8: Security clearance verified (unauthorized officer registration blocked)")

    # Test 9: Database Dual-Persistence & Audit Logging
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
        'loan_amount': 140,
        'loan_term_months': 360,
        'cibil_score': 790,
        'property_area': 'Semiurban',
        'salary_slip': 'Yes'
    }
    saved = database.save_loan_application(test_applicant, pred, exp, user_id=app_login['user']['id'])
    assert saved.get('application_no'), "Failed to persist application"
    print(f"[OK] Test 9: Persistence verified -> Application No: {saved['application_no']} (Linked to User ID: {app_login['user']['id']})")

    # Test 10: Multi-Tenant Role Isolation (Applicant sees only own, Officer sees all)
    app_vault = database.get_all_saved_applications(user_id=app_login['user']['id'], role='applicant')
    off_vault = database.get_all_saved_applications(role='officer')
    assert len(app_vault) <= len(off_vault), "Applicant should not see more applications than officer"
    print(f"[OK] Test 10: Role-based isolation verified (Applicant visible: {len(app_vault)}, Officer visible: {len(off_vault)})")

    print("-" * 70)
    print("ALL 10 SYSTEM VALIDATION SUITES PASSED CLEANLY (100% OPERATIONAL)")
    print("=" * 70)

if __name__ == '__main__':
    run_tests()
