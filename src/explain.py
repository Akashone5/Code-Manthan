"""
Explainable Credit Underwriting (XAI) Engine
Generates transparent factor attributions, risk friction points, and remediation roadmaps.
Designed in compliance with RBI digital lending requirements for adverse action notifications.
"""

from typing import Dict, Any, List

def explain_decision(applicant: Dict[str, Any], prediction: Dict[str, Any]) -> Dict[str, Any]:
    """
    Decomposes the credit underwriting decision into clear, human-understandable positive drivers,
    risk factors, and practical steps for loan qualification.
    """
    cibil = prediction.get('cibil_score', 750)
    dti = prediction.get('dti_percent', 0.0)
    emi = prediction.get('monthly_emi', 0)
    salary_slip = prediction.get('salary_slip', 'Yes')
    status = prediction.get('status', 'Conditional')
    score = prediction.get('approval_likelihood', 50)

    emp_type = str(applicant.get('employment_type', '')).lower()
    is_freelance = any(w in emp_type for w in ['freelanc', 'gig', 'contract', 'consult'])
    coapp = float(applicant.get('coapplicant_income', 0) or 0)
    area = str(applicant.get('property_area', 'Rural')).capitalize()

    positive_factors: List[Dict[str, str]] = []
    negative_factors: List[Dict[str, str]] = []
    recommendations: List[str] = []

    # 1. Credit History Analysis
    if cibil >= 720:
        positive_factors.append({
            'factor': 'Prime Credit Bureau Record',
            'details': f'Your CIBIL score of {cibil} reflects exemplary financial discipline and timely repayment history.',
            'impact': '+24% Score Boost'
        })
    elif cibil >= 650:
        positive_factors.append({
            'factor': 'Satisfactory Credit Track',
            'details': f'Your CIBIL score of {cibil} meets the standard retail lending eligibility criteria.',
            'impact': '+15% Score Boost'
        })
    else:
        negative_factors.append({
            'factor': 'Subprime Credit Bureau Score',
            'details': f'A CIBIL score of {cibil} indicates past payment delinquencies or insufficient bureau seasoning.',
            'impact': '-25% Risk Adjustment'
        })
        recommendations.append(
            'Settle any outstanding overdue accounts or obtain a formal No-Objection Certificate (NOC) to elevate your bureau score above 680.'
        )

    # 2. Debt-to-Income (DTI) Analysis
    if dti <= 30.0:
        positive_factors.append({
            'factor': 'Comfortable Debt Service Coverage',
            'details': f'Monthly EMI of ₹{emi:,} consumes only {dti}% of household income, well below the 45% prudential ceiling.',
            'impact': '+18% Score Boost'
        })
    elif dti <= 45.0:
        positive_factors.append({
            'factor': 'Manageable Debt Burden',
            'details': f'Monthly EMI consumes {dti}% of income, which satisfies regular debt service criteria.',
            'impact': '+6% Score Boost'
        })
    else:
        negative_factors.append({
            'factor': 'Elevated Debt-to-Income Ratio',
            'details': f'Monthly EMI of ₹{emi:,} requires {dti}% of total monthly cash flow, exceeding recommended debt guidelines.',
            'impact': '-20% Risk Adjustment'
        })
        recommendations.append(
            'Extend loan tenure or moderate the requested loan amount to bring your monthly obligation below 40% of income.'
        )

    # 3. Income Substantiation
    if salary_slip in ['Yes', 'True', '1']:
        positive_factors.append({
            'factor': 'Verified Formal Income',
            'details': 'Submitted formal pay documentation verifies steady compensation and regular employer cash flows.',
            'impact': '+5% Score Boost'
        })
    else:
        if is_freelance:
            positive_factors.append({
                'factor': 'Digital Economy Cash Flow Recognition',
                'details': 'Independent contractor / freelance income assessed via 6-month banking statement analysis.',
                'impact': 'Alternative Verification'
            })
            recommendations.append(
                'Provide 6-month digital banking statements or verified client invoices to corroborate recurring cash flows.'
            )
        else:
            negative_factors.append({
                'factor': 'Absence of Formal Salary Slip',
                'details': 'Informal earnings require secondary verification through bank account statements or GST returns.',
                'impact': '-6% Verification Friction'
            })
            recommendations.append(
                'Submit formal bank account statements or an employer certification letter in lieu of salary slips.'
            )

    # 4. Joint Household Cash Flow
    if coapp > 0:
        positive_factors.append({
            'factor': 'Earning Co-Applicant Strength',
            'details': f'Joint co-applicant income (₹{int(coapp):,}/month) significantly diversifies and reinforces repayment stability.',
            'impact': '+8% Score Boost'
        })
    elif dti > 35.0:
        negative_factors.append({
            'factor': 'Single Income Household Reliance',
            'details': 'Relying exclusively on a single earner increases vulnerability to unanticipated financial shocks.',
            'impact': '-8% Risk Adjustment'
        })
        recommendations.append(
            'Add an earning family member or spouse as a joint co-applicant to expand eligible debt service capacity.'
        )

    # 5. Priority Lending Territory
    if area == 'Rural':
        positive_factors.append({
            'factor': 'Mission Bharat Rural Corridor Priority',
            'details': 'Application qualifies for priority sector consideration and financial inclusion benefits.',
            'impact': '+4% Score Boost'
        })
    elif area == 'Semiurban':
        positive_factors.append({
            'factor': 'Developing Semi-Urban Growth Zone',
            'details': 'Property is located in a high-growth commercial corridor with strong collateral appreciation.',
            'impact': '+4% Score Boost'
        })

    # Decision Summary
    if status == 'Approved':
        summary = (
            f"Loan approved. With a credit assessment score of {score}%, the application fulfills "
            "institutional underwriting standards and debt repayment guidelines."
        )
    elif status == 'Conditional':
        summary = (
            f"Application recommended for conditional review ({score}% score). "
            "Minor tenure restructuring or adding a co-applicant will finalize full sanction."
        )
    else:
        summary = (
            f"Application rated high risk at current parameters ({score}% score). "
            "Follow the structured remediation roadmap below to qualify for sanction."
        )

    return {
        'verdict_summary': summary,
        'positive_factors': positive_factors,
        'negative_factors': negative_factors,
        'recommendations': recommendations
    }
