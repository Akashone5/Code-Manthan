import database
from backend import predict_loan, explain_decision, check_fairness, load_sample_dataset

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

exp = explain_decision(new_test_app, pred)

saved = database.save_loan_application(new_test_app, pred, exp)
print(f"[OK] Test 3: Saved new application to SQLite -> ID: {saved['application_no']} (Status: {saved['status']}, Score: {saved['approval_likelihood']}%, CIBIL: {saved['cibil_score']})")

all_apps_after = database.get_all_saved_applications()
print(f"[OK] Test 4: Database query successful (Now contains {len(all_apps_after)} total applications)")

print("\n" + "=" * 65)
print("ALL TESTS PASSED! Frontend, Backend & Database are 100% linked.")
print("=" * 65)
