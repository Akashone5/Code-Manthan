"""
Underwriting & Risk Analysis Domain Service
Unified interface exposing credit prediction, explainable attribution, fairness auditing,
and scenario simulation. Powered by the modular src/ domain pipeline.
"""

import os
import csv
from typing import List, Dict, Any, Optional

from src.preprocess import normalize_applicant
from src.train import predict_loan
from src.explain import explain_decision
from src.fairness import check_fairness

_DATASET_CACHE: List[Dict[str, Any]] = []

def load_sample_dataset(csv_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Loads and parses historical portfolio loan records with in-memory caching.
    """
    global _DATASET_CACHE
    if _DATASET_CACHE and not csv_path:
        return _DATASET_CACHE

    target_paths = [
        csv_path,
        r'E:\archive\train_u6lujuX_CVtuZ9i (1).csv',
        os.path.join(os.path.dirname(__file__), 'data', 'train.csv'),
        os.path.join(os.path.dirname(__file__), 'train.csv')
    ]

    resolved_path = None
    for p in target_paths:
        if p and os.path.exists(p):
            resolved_path = p
            break

    if not resolved_path:
        return []

    applicants: List[Dict[str, Any]] = []
    with open(resolved_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                inc = float(row.get('ApplicantIncome') or 3000)
                coinc = float(row.get('CoapplicantIncome') or 0)
                loan = float(row.get('LoanAmount') or 100)
                term = float(row.get('Loan_Amount_Term') or 360)
                ch = float(row.get('Credit_History') or 1)

                applicants.append({
                    'id': row.get('Loan_ID', 'UNKNOWN'),
                    'gender': row.get('Gender') or 'Male',
                    'married': row.get('Married') or 'Yes',
                    'dependents': row.get('Dependents') or '0',
                    'education': row.get('Education') or 'Graduate',
                    'self_employed': row.get('Self_Employed') or 'No',
                    'applicant_income': inc,
                    'coapplicant_income': coinc,
                    'loan_amount': loan,
                    'term': term,
                    'credit_history': ch,
                    'cibil_score': 760 if ch >= 1 else 540,
                    'salary_slip': 'Yes',
                    'property_area': row.get('Property_Area') or 'Rural'
                })
            except Exception:
                continue

    if not csv_path:
        _DATASET_CACHE = applicants
    return applicants

def simulate_what_if(base_applicant: Dict[str, Any], adjustments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simulates counterfactual underwriting scenarios to evaluate the impact of adjustments
    (e.g., adding co-applicant, extending tenure, or adjusting loan quantum).
    """
    simulated = dict(base_applicant)
    simulated.update(adjustments)

    baseline_pred = predict_loan(base_applicant)
    simulated_pred = predict_loan(simulated)
    simulated_exp = explain_decision(simulated, simulated_pred)

    score_delta = simulated_pred['approval_likelihood'] - baseline_pred['approval_likelihood']
    emi_delta = simulated_pred['monthly_emi'] - baseline_pred['monthly_emi']
    dti_delta = round(simulated_pred['dti_percent'] - baseline_pred['dti_percent'], 1)

    return {
        'baseline': baseline_pred,
        'simulated': simulated_pred,
        'deltas': {
            'score_change': score_delta,
            'emi_change': emi_delta,
            'dti_change': dti_delta
        },
        'explanation': simulated_exp
    }

__all__ = [
    'predict_loan',
    'explain_decision',
    'check_fairness',
    'load_sample_dataset',
    'simulate_what_if',
    'normalize_applicant'
]
