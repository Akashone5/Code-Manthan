<<<<<<< HEAD
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
=======
import math
import os
import csv

def predict_loan(applicant):
    app_inc = float(applicant.get('applicant_income', 0))
    coapp_inc = float(applicant.get('coapplicant_income', 0))
    tot_inc = max(1.0, app_inc + coapp_inc)

    loan_raw = float(applicant.get('loan_amount', 100))
    if loan_raw <= 1000:
        loan_amt_inr = loan_raw * 1000.0
    else:
        loan_amt_inr = loan_raw

    term_months = float(applicant.get('term', 60) or applicant.get('loan_term_months', 60))
    if term_months <= 0:
        term_months = 60.0

    monthly_emi = loan_amt_inr / term_months
    dti_percent = (monthly_emi / tot_inc) * 100.0

    if 'cibil_score' in applicant and applicant['cibil_score']:
        cibil = int(applicant['cibil_score'])
    else:
        ch = float(applicant.get('credit_history', 1))
        cibil = 750 if ch == 1 else 530

    score_points = 50.0
    contribs = {}

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

    if dti_percent <= 15.0:
        dti_impact = 18.0
    elif dti_percent <= 30.0:
        dti_impact = 12.0
    elif dti_percent <= 42.0:
        dti_impact = 4.0
    elif dti_percent <= 55.0:
        dti_impact = -8.0
    else:
        dti_impact = -24.0
    score_points += dti_impact
    contribs['dti_ratio'] = dti_impact

    annual_income = tot_inc * 12.0
    coverage_ratio = annual_income / max(1.0, loan_amt_inr)
    if coverage_ratio >= 2.0:
        cov_impact = 10.0
    elif coverage_ratio >= 1.0:
        cov_impact = 6.0
    elif coverage_ratio >= 0.5:
        cov_impact = 0.0
    else:
        cov_impact = -10.0
    score_points += cov_impact
    contribs['income_coverage'] = cov_impact

    if coapp_inc > 0:
        coapp_impact = 8.0
        score_points += coapp_impact
        contribs['coapplicant'] = coapp_impact
    else:
        contribs['coapplicant'] = 0.0

    salary_slip = str(applicant.get('salary_slip', 'Yes')).strip().capitalize()
    emp_type = str(applicant.get('employment_type', '')).lower()
    is_freelance = any(w in emp_type for w in ['freelanc', 'gig', 'contract', 'consult'])

    if salary_slip in ['Yes', 'True', '1']:
        slip_impact = 5.0
        score_points += slip_impact
        contribs['salary_slip'] = slip_impact
    else:
        if is_freelance or 'self' in emp_type or 'farm' in emp_type:
            slip_impact = 0.0
        else:
            slip_impact = -6.0
        score_points += slip_impact
        contribs['salary_slip'] = slip_impact

    if is_freelance:
        score_points += 3.0
        contribs['employment'] = 3.0
    elif 'salaried' in emp_type:
        score_points += 3.0
        contribs['employment'] = 3.0
    else:
        score_points += 1.0
        contribs['employment'] = 1.0

    area = str(applicant.get('property_area', 'Rural')).capitalize()
    if area == 'Semiurban':
        score_points += 4.0
        contribs['property_area'] = 4.0
    elif area == 'Rural':
        score_points += 2.0
        contribs['property_area'] = 2.0
    else:
        score_points += 2.0
        contribs['property_area'] = 2.0

    final_score = int(max(2, min(98, round(score_points))))

    if final_score >= 65:
        status = 'Approved'
    elif final_score >= 45:
        status = 'Conditional'
    else:
        status = 'Rejected'

    return {
        'status': status,
        'approval_likelihood': final_score,
        'monthly_emi': round(monthly_emi),
        'dti_percent': round(dti_percent, 1),
        'total_monthly_income': round(tot_inc),
        'requested_loan_inr': round(loan_amt_inr),
        'cibil_score': cibil,
        'salary_slip': salary_slip,
        'loan_term_months': round(term_months),
        'contributions': contribs
    }

def explain_decision(applicant, prediction):
    cibil = prediction['cibil_score']
    dti = prediction['dti_percent']
    tot_inc = prediction['total_monthly_income']
    emi = prediction['monthly_emi']
    salary_slip = prediction.get('salary_slip', 'Yes')
    emp_type = str(applicant.get('employment_type', '')).lower()
    is_freelance = any(w in emp_type for w in ['freelanc', 'gig', 'contract', 'consult'])

    positive_factors = []
    negative_factors = []
    recommendations = []

    if cibil >= 720:
        positive_factors.append({
            'factor': 'High Credit Trust (Prime CIBIL)',
            'details': f'Your CIBIL score of {cibil} shows a stellar track record of paying past commitments on time.',
            'impact': '+24% Boost'
        })
    elif cibil >= 650:
        positive_factors.append({
            'factor': 'Good Qualifying CIBIL Track',
            'details': f'Your CIBIL score of {cibil} comfortably meets retail lending credit criteria.',
            'impact': '+15% Boost'
        })
    else:
        negative_factors.append({
            'factor': 'Subprime CIBIL Bureau Score',
            'details': f'A CIBIL score of {cibil} indicates past overdue repayments or insufficient bureau history.',
            'impact': '-25% Discount'
        })
        recommendations.append(
            'Clear outstanding overdue payments on prior credit facilities or obtain a No-Objection Certificate (NOC) to lift CIBIL above 680.'
        )

    if dti <= 30.0:
        positive_factors.append({
            'factor': 'Comfortable Monthly Debt Burden',
            'details': f'Monthly EMI (Rs. {emi:,}) takes only {dti}% of household income, well within safe repayment limits.',
            'impact': '+18% Boost'
        })
    elif dti <= 45.0:
        positive_factors.append({
            'factor': 'Manageable Obligation Ratio',
            'details': f'Monthly EMI takes {dti}% of income, which satisfies regular debt service criteria.',
            'impact': '+6% Boost'
        })
    else:
        negative_factors.append({
            'factor': 'Elevated Repayment Burden (High DTI)',
            'details': f'Monthly EMI of Rs. {emi:,} consumes {dti}% of your monthly income, exceeding the recommended 45% ceiling.',
            'impact': '-20% Risk'
        })
        recommendations.append(
            'Extend loan tenure (e.g. increase years) or reduce loan amount by 15-20% to lower monthly EMI below 40% of income.'
        )

    if salary_slip in ['Yes', 'True', '1']:
        positive_factors.append({
            'factor': 'Verified Income (Salary Slip)',
            'details': 'Official salary slip submitted, confirming stable and verifiable monthly compensation.',
            'impact': '+5% Boost'
        })
    else:
        if is_freelance:
            positive_factors.append({
                'factor': 'Mission Bharat Gig Inclusivity',
                'details': 'Freelance income assessed via 6-month digital banking cash flows & client invoice records in lieu of salary slip.',
                'impact': 'Alternative Verification'
            })
            recommendations.append(
                'Submit 6-month digital bank statement or GST/client invoices to verify your active freelance cash flows.'
            )
        else:
            negative_factors.append({
                'factor': 'Absence of Formal Salary Slip',
                'details': 'No salary slip attached. Informal cash earnings require secondary bank statement substantiation.',
                'impact': '-6% Friction'
            })
            recommendations.append(
                'Provide 6-month formal bank account statement or employer certificate in lieu of pay slip.'
            )

    if is_freelance:
        positive_factors.append({
            'factor': 'Freelance / Digital Gig Economy Contributor',
            'details': 'Independent contractor / freelance income streams recognized under Mission Bharat progressive inclusion guidelines.',
            'impact': '+3% Inclusion'
        })

    coapp = float(applicant.get('coapplicant_income', 0))
    if coapp > 0:
        positive_factors.append({
            'factor': 'Joint Earning Co-Applicant',
            'details': f'Adding an earning co-applicant (Rs. {int(coapp):,}/month) significantly enhances household cash flow security.',
            'impact': '+8% Boost'
        })
    else:
        if dti > 35.0:
            negative_factors.append({
                'factor': 'Single Income Dependency',
                'details': 'Relying on a single income stream increases risk during unexpected financial disruptions.',
                'impact': '-8% Risk'
            })
            recommendations.append(
                'Include an earning spouse or family member as a co-applicant to expand repayment capacity and raise approval chances.'
            )

    area = str(applicant.get('property_area', 'Rural')).capitalize()
    if area == 'Rural':
        positive_factors.append({
            'factor': 'Mission Bharat Rural Priority',
            'details': 'Application benefits from calibrated financial inclusion and priority sector evaluation under Mission Bharat.',
            'impact': '+4% Boost'
        })
    elif area == 'Semiurban':
        positive_factors.append({
            'factor': 'Developing Semi-Urban Corridor',
            'details': 'Located in a rapid commercial expansion zone with strong property appreciation.',
            'impact': '+4% Boost'
        })

    status = prediction['status']
    score = prediction['approval_likelihood']
    if status == 'Approved':
        summary = f"Congratulations! With an approval likelihood of {score}%, your file easily qualifies under Meridian Mission Bharat lending standards."
    elif status == 'Conditional':
        summary = f"Your application is in the review corridor ({score}% score). Minor adjustments to loan amount or adding a co-applicant will secure sanction."
    else:
        summary = f"Your application is currently rated high risk ({score}% score). Follow the transparent remediation roadmap below to qualify."

    return {
        'verdict_summary': summary,
        'positive_factors': positive_factors,
        'negative_factors': negative_factors,
        'recommendations': recommendations
    }

def check_fairness(applicants_list):
    def group_stats(group_key, group_val):
        group_total = 0
        group_approved = 0
        for app in applicants_list:
            if str(app.get(group_key, '')).lower() == str(group_val).lower():
                group_total += 1
                pred = predict_loan(app)
                if pred['status'] == 'Approved':
                    group_approved += 1
        rate = (group_approved / group_total * 100.0) if group_total > 0 else 0.0
        return {
            'total': group_total,
            'approved': group_approved,
            'approval_rate_percent': round(rate, 2)
        }

    male = group_stats('gender', 'Male')
    female = group_stats('gender', 'Female')
    gender_di = round(female['approval_rate_percent'] / male['approval_rate_percent'], 3) if male['approval_rate_percent'] > 0 else 1.0

    semiurban = group_stats('property_area', 'Semiurban')
    rural = group_stats('property_area', 'Rural')
    urban = group_stats('property_area', 'Urban')
    rural_di = round(rural['approval_rate_percent'] / semiurban['approval_rate_percent'], 3) if semiurban['approval_rate_percent'] > 0 else 1.0

    grad = group_stats('education', 'Graduate')
    non_grad = group_stats('education', 'Not Graduate')
    edu_di = round(non_grad['approval_rate_percent'] / grad['approval_rate_percent'], 3) if grad['approval_rate_percent'] > 0 else 1.0

    return {
        'gender_fairness': {
            'male_benchmark': male,
            'female_protected': female,
            'disparate_impact_ratio': gender_di,
            'passes_80_rule': gender_di >= 0.80
        },
        'territory_fairness': {
            'semiurban_benchmark': semiurban,
            'rural_protected': rural,
            'urban': urban,
            'disparate_impact_ratio': rural_di,
            'passes_80_rule': rural_di >= 0.80
        },
        'education_fairness': {
            'graduate_benchmark': grad,
            'non_graduate_protected': non_grad,
            'disparate_impact_ratio': edu_di,
            'passes_80_rule': edu_di >= 0.80
        }
    }

def load_sample_dataset(csv_path=None):
    if not csv_path:
        csv_path = r'E:\archive\train_u6lujuX_CVtuZ9i (1).csv'

    applicants = []
    if os.path.exists(csv_path):
        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    inc = float(row.get('ApplicantIncome') or 3000)
                    coinc = float(row.get('CoapplicantIncome') or 0)
                    loan = float(row.get('LoanAmount') or 100)
                    term = float(row.get('Loan_Amount_Term') or 360)
                    ch = float(row.get('Credit_History') or 1)

                    applicants.append({
                        'id': row.get('Loan_ID'),
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
                        'cibil_score': 760 if ch == 1 else 540,
                        'salary_slip': 'Yes',
                        'property_area': row.get('Property_Area') or 'Rural'
                    })
                except Exception:
                    continue
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
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
