"""
Meridian Financial Services - Mission Bharat
Core Underwriting & Explainable AI (XAI) Engine
"""

import math
import os
import csv

# =============================================================================
# 1. UNDERWRITING & SCORING LOGIC
# =============================================================================
def predict_loan(applicant):
    """
    Evaluates loan applicant data using balanced banking underwriting rules:
    - CIBIL Bureau Credit Score (300 to 900)
    - Debt-to-Income / EMI Burden (FOIR)
    - Income Coverage against requested loan magnitude
    - Co-applicant joint financial strength
    - Flexible tenure from 1 to 30 years (12 to 360 months)
    - Primary Employment (including Freelancing / Gig Economy)
    - Official Salary Slip verification
    - Mission Bharat Geographic Inclusion

    Returns:
    - approval_likelihood (0 to 100%)
    - status ('Approved', 'Conditional', or 'Rejected')
    - monthly_emi (estimated monthly repayment)
    - dti_percent (EMI as percentage of monthly income)
    - contributions (breakdown of factor impacts)
    """
    app_inc = float(applicant.get('applicant_income', 0))
    coapp_inc = float(applicant.get('coapplicant_income', 0))
    tot_inc = max(1.0, app_inc + coapp_inc)

    # Loan Amount in INR (if entered in thousands, e.g. 150 = 150,000 INR)
    loan_raw = float(applicant.get('loan_amount', 100))
    if loan_raw <= 1000:
        loan_amt_inr = loan_raw * 1000.0
    else:
        loan_amt_inr = loan_raw

    # Loan Term in Months (from 12 months up to 360 months / 1 to 30 years)
    term_months = float(applicant.get('term', 60) or applicant.get('loan_term_months', 60))
    if term_months <= 0:
        term_months = 60.0

    # Calculate Monthly EMI & Debt-to-Income
    monthly_emi = loan_amt_inr / term_months
    dti_percent = (monthly_emi / tot_inc) * 100.0

    # Read CIBIL Score (defaults to 750 if credit_history is 1, 530 if 0)
    if 'cibil_score' in applicant and applicant['cibil_score']:
        cibil = int(applicant['cibil_score'])
    else:
        ch = float(applicant.get('credit_history', 1))
        cibil = 750 if ch == 1 else 530

    # Base Starting Score
    score_points = 50.0
    contribs = {}

    # 1. CIBIL Bureau Score Evaluation
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

    # 2. Debt-to-Income Ratio (DTI / Repayment Burden)
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

    # 3. Income to Loan Coverage (Annual Income vs Total Loan Magnitude)
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

    # 4. Joint Co-Applicant Strength
    if coapp_inc > 0:
        coapp_impact = 8.0
        score_points += coapp_impact
        contribs['coapplicant'] = coapp_impact
    else:
        contribs['coapplicant'] = 0.0

    # 5. Salary Slip Verification & Employment Diversity (Mission Bharat Gig / Freelance Policy)
    salary_slip = str(applicant.get('salary_slip', 'Yes')).strip().capitalize()
    emp_type = str(applicant.get('employment_type', '')).lower()
    is_freelance = any(w in emp_type for w in ['freelanc', 'gig', 'contract', 'consult'])

    if salary_slip in ['Yes', 'True', '1']:
        slip_impact = 5.0
        score_points += slip_impact
        contribs['salary_slip'] = slip_impact
    else:
        # If no salary slip:
        # Freelancers and small businesses are supported under alternative digital cash-flow underwriting
        if is_freelance or 'self' in emp_type or 'farm' in emp_type:
            slip_impact = 0.0 # Neutral: alternative verification applied
        else:
            slip_impact = -6.0
        score_points += slip_impact
        contribs['salary_slip'] = slip_impact

    # 6. Primary Employment Livelihood Impact
    if is_freelance:
        # Digital economy diversity bonus under Mission Bharat
        score_points += 3.0
        contribs['employment'] = 3.0
    elif 'salaried' in emp_type:
        score_points += 3.0
        contribs['employment'] = 3.0
    else:
        score_points += 1.0
        contribs['employment'] = 1.0

    # 7. Mission Bharat Geographic Equity
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

    # Clamped 0% to 100% Score
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


# =============================================================================
# 2. PLAIN-ENGLISH EXPLANATION ENGINE
# =============================================================================
def explain_decision(applicant, prediction):
    """
    Translates underwriting metrics into plain, conversational language.
    """
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

    # 1. CIBIL Bureau Credit History
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

    # 2. Monthly EMI & Repayment Burden (DTI)
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

    # 3. Income Documentation & Salary Slip Verification
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

    # 4. Employment & Livelihood
    if is_freelance:
        positive_factors.append({
            'factor': 'Freelance / Digital Gig Economy Contributor',
            'details': 'Independent contractor / freelance income streams recognized under Mission Bharat progressive inclusion guidelines.',
            'impact': '+3% Inclusion'
        })

    # 5. Co-Applicant Strength
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

    # 6. Mission Bharat Geographic Inclusion
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

    # Verdict Summary
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


# =============================================================================
# 3. GROUP FAIRNESS AUDIT (80% DISPARATE IMPACT RULE)
# =============================================================================
def check_fairness(applicants_list):
    """
    Computes approval rates across protected groups and checks the 80% Rule.
    """
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

    # 1. Gender Fairness
    male = group_stats('gender', 'Male')
    female = group_stats('gender', 'Female')
    gender_di = round(female['approval_rate_percent'] / male['approval_rate_percent'], 3) if male['approval_rate_percent'] > 0 else 1.0

    # 2. Geographic Territory Fairness
    semiurban = group_stats('property_area', 'Semiurban')
    rural = group_stats('property_area', 'Rural')
    urban = group_stats('property_area', 'Urban')
    rural_di = round(rural['approval_rate_percent'] / semiurban['approval_rate_percent'], 3) if semiurban['approval_rate_percent'] > 0 else 1.0

    # 3. Education Fairness
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
    """Loads historical loan records."""
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
    return applicants
