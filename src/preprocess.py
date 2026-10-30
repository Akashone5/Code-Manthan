"""
Applicant Preprocessing & Normalization Pipeline
Standardizes raw financial, demographic, and bureau inputs into calibrated underwriting features.
"""

from typing import Dict, Any

def _safe_float(val: Any, default: float = 0.0) -> float:
    if val is None or val == '':
        return default
    try:
        cleaned = str(val).replace(',', '').replace('₹', '').replace('Rs.', '').replace('Rs', '').strip()
        return float(cleaned)
    except (ValueError, TypeError):
        return default

def _safe_int(val: Any, default: int = 0) -> int:
    if val is None or val == '':
        return default
    try:
        cleaned = str(val).replace(',', '').replace('₹', '').replace('Rs.', '').replace('Rs', '').strip()
        return int(float(cleaned))
    except (ValueError, TypeError):
        return default

def normalize_applicant(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes applicant data from heterogeneous sources (REST API, Web Intake, Streamlit, CSV).
    Handles key aliases, currency representations, and derived credit risk ratios.
    """
    app_inc = _safe_float(
        raw_data.get('applicant_income') or raw_data.get('ApplicantIncome') or raw_data.get('income'),
        default=0.0
    )
    coapp_inc = _safe_float(
        raw_data.get('coapplicant_income') or raw_data.get('CoapplicantIncome') or raw_data.get('coapplicant'),
        default=0.0
    )
    tot_inc = max(1.0, app_inc + coapp_inc)

    # Loan Amount parsing (Standard convention: values <= 1000 represent thousands in INR)
    loan_raw = _safe_float(
        raw_data.get('loan_amount') or raw_data.get('LoanAmount') or raw_data.get('requested_loan'),
        default=100.0
    )
    if loan_raw <= 1000.0:
        loan_amt_inr = loan_raw * 1000.0
        loan_amount_k = loan_raw
    else:
        loan_amt_inr = loan_raw
        loan_amount_k = loan_raw / 1000.0

    # Loan Tenure (Months)
    term_months = _safe_float(
        raw_data.get('loan_term_months') or raw_data.get('Loan_Amount_Term') or raw_data.get('term') or raw_data.get('tenure'),
        default=360.0
    )
    if term_months <= 0.0:
        years = _safe_float(raw_data.get('loan_term_years'), default=30.0)
        term_months = years * 12.0

    # Derived Prudential Underwriting Ratios
    monthly_emi = loan_amt_inr / max(1.0, term_months)
    dti_percent = (monthly_emi / tot_inc) * 100.0
    annual_income = tot_inc * 12.0
    lti_ratio = loan_amt_inr / max(1.0, annual_income)

    # Bureau & Credit History
    raw_cibil = raw_data.get('cibil_score') or raw_data.get('credit_score')
    if raw_cibil is not None and str(raw_cibil).strip() != '':
        cibil = _safe_int(raw_cibil, default=750)
    else:
        raw_ch = raw_data.get('credit_history') or raw_data.get('Credit_History')
        ch_val = _safe_float(raw_ch, default=1.0)
        cibil = 750 if ch_val >= 1.0 else 530

    credit_history = 1 if cibil >= 650 else 0

    # Employment & Income Verification
    emp_type = str(raw_data.get('employment_type') or raw_data.get('Self_Employed') or 'Salaried').strip()
    emp_lower = emp_type.lower()
    is_freelance = any(w in emp_lower for w in ['freelanc', 'gig', 'contract', 'consult'])
    is_self_employed = 'Yes' if any(w in emp_lower for w in ['self', 'business', 'farmer', 'artisan', 'trader', 'freelanc']) else 'No'

    raw_slip = str(raw_data.get('salary_slip') or raw_data.get('has_salary_slip') or 'Yes').strip().capitalize()
    salary_slip = 'Yes' if raw_slip in ['Yes', 'True', '1'] else 'No'

    # Demographic & Property
    raw_area = str(raw_data.get('property_area') or raw_data.get('Property_Area') or 'Rural').strip().capitalize()
    property_area = raw_area if raw_area in ['Urban', 'Semiurban', 'Rural'] else 'Rural'

    full_name = str(raw_data.get('full_name') or raw_data.get('name') or 'Applicant').strip()
    gender = str(raw_data.get('gender') or raw_data.get('Gender') or 'Male').strip().capitalize()
    marital_status = str(raw_data.get('marital_status') or raw_data.get('Married') or 'Yes').strip().capitalize()

    deps_str = str(raw_data.get('dependents') or raw_data.get('Dependents') or '0').strip()
    dependents = '3+' if '3' in deps_str else deps_str

    education = str(raw_data.get('education') or raw_data.get('Education') or 'Graduate').strip()

    return {
        'applicant_income': round(app_inc, 2),
        'coapplicant_income': round(coapp_inc, 2),
        'total_income': round(tot_inc, 2),
        'loan_amount_k': round(loan_amount_k, 2),
        'loan_amount_inr': round(loan_amt_inr, 2),
        'term_months': round(term_months),
        'monthly_emi': round(monthly_emi, 2),
        'dti_percent': round(dti_percent, 2),
        'annual_income': round(annual_income, 2),
        'lti_ratio': round(lti_ratio, 2),
        'cibil_score': cibil,
        'credit_history': credit_history,
        'is_freelance': is_freelance,
        'is_self_employed': is_self_employed,
        'salary_slip': salary_slip,
        'property_area': property_area,
        'full_name': full_name,
        'gender': gender,
        'marital_status': marital_status,
        'dependents': dependents,
        'education': education,
        'employment_type': emp_type,
        'phone': str(raw_data.get('phone', '')).strip(),
        'loan_purpose': str(raw_data.get('loan_purpose', 'Home Improvement')).strip()
    }
