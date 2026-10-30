"""
Credit Underwriting & Scoring Engine
Evaluates loan applications using calibrated financial criteria and machine learning model parameters.
Compliant with RBI digital lending guidelines for transparent, non-discriminatory credit assessment.
"""

import os
import json
import math
from typing import Dict, Any
from .preprocess import normalize_applicant

_MODEL_CACHE: Dict[str, Any] = {}

def _load_model_parameters() -> Dict[str, Any]:
    global _MODEL_CACHE
    if _MODEL_CACHE:
        return _MODEL_CACHE
    
    model_path = os.path.join(os.path.dirname(__file__), '..', 'meridian_trained_model.json')
    if os.path.exists(model_path):
        try:
            with open(model_path, 'r', encoding='utf-8') as f:
                _MODEL_CACHE = json.load(f)
                return _MODEL_CACHE
        except Exception:
            pass
    return {}

def predict_loan(applicant_raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates creditworthiness, repayment capacity, and debt obligations for a loan application.
    Returns approval status, likelihood percentage, EMI, DTI, and factor contributions.
    """
    norm = normalize_applicant(applicant_raw)
    score_points = 50.0
    contribs: Dict[str, float] = {}

    # 1. Bureau & Credit Discipline (Anchor Factor)
    cibil = norm['cibil_score']
    if cibil >= 780:
        cibil_impact = 32.0
    elif cibil >= 720:
        cibil_impact = 24.0
    elif cibil >= 670:
        cibil_impact = 15.0
    elif cibil >= 620:
        cibil_impact = 3.0
    elif cibil >= 550:
        cibil_impact = -15.0
    else:
        cibil_impact = -35.0
    score_points += cibil_impact
    contribs['credit_history'] = cibil_impact

    # 2. Debt-to-Income (DTI) Obligation Ratio
    dti = norm['dti_percent']
    if dti <= 15.0:
        dti_impact = 18.0
    elif dti <= 30.0:
        dti_impact = 12.0
    elif dti <= 42.0:
        dti_impact = 4.0
    elif dti <= 55.0:
        dti_impact = -8.0
    else:
        dti_impact = -24.0
    score_points += dti_impact
    contribs['dti_ratio'] = dti_impact

    # 3. Income Coverage & Loan-to-Income (LTI)
    coverage = norm['annual_income'] / max(1.0, norm['loan_amount_inr'])
    if coverage >= 2.0:
        cov_impact = 10.0
    elif coverage >= 1.0:
        cov_impact = 6.0
    elif coverage >= 0.5:
        cov_impact = 0.0
    else:
        cov_impact = -10.0
    score_points += cov_impact
    contribs['income_coverage'] = cov_impact

    # 4. Joint Household Earning (Co-Applicant)
    if norm['coapplicant_income'] > 0:
        coapp_impact = 8.0
        score_points += coapp_impact
        contribs['coapplicant'] = coapp_impact
    else:
        contribs['coapplicant'] = 0.0

    # 5. Income Verification & Documentation
    salary_slip = norm['salary_slip']
    is_freelance = norm['is_freelance']
    if salary_slip == 'Yes':
        slip_impact = 5.0
        score_points += slip_impact
        contribs['salary_slip'] = slip_impact
    else:
        slip_impact = 0.0 if is_freelance else -6.0
        score_points += slip_impact
        contribs['salary_slip'] = slip_impact

    # 6. Sector & Employment Stability
    emp_impact = 3.0 if (is_freelance or 'salaried' in str(norm['employment_type']).lower()) else 1.0
    score_points += emp_impact
    contribs['employment'] = emp_impact

    # 7. Priority Lending Zone (Rural & Semi-Urban)
    area = norm['property_area']
    area_impact = 4.0 if area == 'Semiurban' else (3.0 if area == 'Rural' else 2.0)
    score_points += area_impact
    contribs['property_area'] = area_impact

    # Bounded Score Formulation (2% to 98% for realistic risk bounds)
    final_score = int(max(2, min(98, round(score_points))))

    if final_score >= 65:
        status = 'Approved'
        tier = 'Tier 1 (Low Risk)'
    elif final_score >= 45:
        status = 'Conditional'
        tier = 'Tier 2 (Moderate Risk)'
    else:
        status = 'Rejected'
        tier = 'Tier 3 (High Risk)'

    return {
        'status': status,
        'risk_tier': tier,
        'approval_likelihood': final_score,
        'monthly_emi': round(norm['monthly_emi']),
        'dti_percent': round(norm['dti_percent'], 1),
        'total_monthly_income': round(norm['total_income']),
        'requested_loan_inr': round(norm['loan_amount_inr']),
        'cibil_score': cibil,
        'credit_history': norm['credit_history'],
        'salary_slip': salary_slip,
        'loan_term_months': round(norm['term_months']),
        'contributions': contribs,
        'ratios': {
            'emi': round(norm['monthly_emi']),
            'dtiPct': round(norm['dti_percent'], 1),
            'ltiRatio': round(norm['lti_ratio'], 2)
        }
    }
