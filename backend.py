import os
import csv
import json
from typing import List, Dict, Any, Optional

from src.preprocess import normalize_applicant
from src.train import predict_loan
from src.explain import explain_decision
from src.fairness import check_fairness

_DATASET_CACHE: List[Dict[str, Any]] = []

def _load_from_dataset_js(js_path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(js_path):
        return []
    try:
        with open(js_path, mode='r', encoding='utf-8') as f:
            raw = f.read().strip()
        start = raw.find('{')
        end = raw.rfind('}')
        if start == -1 or end == -1:
            return []
        parsed = json.loads(raw[start:end + 1])
        records = parsed.get('records', [])
        applicants: List[Dict[str, Any]] = []
        for r in records:
            ch = float(r.get('credit_history') if r.get('credit_history') is not None else 1)
            raw_loan = float(r.get('loan_amount') or 150)
            loan_inr = raw_loan * 1000.0 if raw_loan <= 1000.0 else raw_loan
            applicants.append({
                'id': r.get('id', 'UNKNOWN'),
                'gender': r.get('gender') or 'Male',
                'married': r.get('married') or 'Yes',
                'dependents': str(r.get('dependents') or '0'),
                'education': r.get('education') or 'Graduate',
                'self_employed': r.get('self_employed') or 'No',
                'applicant_income': float(r.get('applicant_income') or 3000),
                'coapplicant_income': float(r.get('coapplicant_income') or 0),
                'loan_amount': loan_inr,
                'term': float(r.get('term') or 360),
                'credit_history': ch,
                'cibil_score': 760 if ch >= 1 else 540,
                'salary_slip': 'No' if str(r.get('self_employed', 'No')).lower() == 'yes' else 'Yes',
                'property_area': r.get('property_area') or 'Rural'
            })
        return applicants
    except Exception:
        return []

def load_sample_dataset(csv_path: Optional[str] = None) -> List[Dict[str, Any]]:
    global _DATASET_CACHE
    if _DATASET_CACHE and not csv_path:
        return _DATASET_CACHE

    base_dir = os.path.dirname(os.path.abspath(__file__))

    target_paths = [
        csv_path,
        os.path.join(base_dir, 'data', 'train.csv'),
        os.path.join(base_dir, 'train.csv'),
        r'E:\archive\train_u6lujuX_CVtuZ9i (1).csv',
        os.path.join(base_dir, 'scored_loan_predictions_367.csv'),
        os.path.join(base_dir, 'cleaned_loan_data.csv')
    ]

    if not csv_path and not any(p and os.path.exists(p) for p in target_paths[:4]):
        js_applicants = _load_from_dataset_js(os.path.join(base_dir, 'dataset_data.js'))
        if js_applicants:
            _DATASET_CACHE = js_applicants
            return js_applicants

    resolved_path = None
    for p in target_paths:
        if p and os.path.exists(p):
            resolved_path = p
            break

    if not resolved_path:
        return _load_from_dataset_js(os.path.join(base_dir, 'dataset_data.js'))

    applicants: List[Dict[str, Any]] = []
    with open(resolved_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                inc = float(row.get('ApplicantIncome') or 3000)
                coinc = float(row.get('CoapplicantIncome') or 0)
                if row.get('LoanAmount_INR') not in (None, ''):
                    loan = float(row.get('LoanAmount_INR'))
                else:
                    raw_loan = float(row.get('LoanAmount') or row.get('LoanAmount_Thousands') or 150)
                    loan = raw_loan * 1000.0 if raw_loan <= 1000.0 else raw_loan
                term = float(row.get('Loan_Amount_Term') or row.get('Loan_Amount_Term_Months') or 360)
                ch_val = row.get('Credit_History')
                ch = float(ch_val) if (ch_val is not None and str(ch_val).strip() != '') else 1.0

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
