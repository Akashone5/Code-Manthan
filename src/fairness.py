"""
Algorithmic Fairness & Demographic Parity Auditor
Audits underwriting decisions against the Four-Fifths (80%) Rule for adverse impact.
Monitors demographic equity across Gender, Property Territory, and Educational Background.
"""

from typing import List, Dict, Any
from .train import predict_loan

def check_fairness(applicants_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates Disparate Impact Ratio (DIR) across protected and benchmark groups in an O(N) single pass.
    Verifies adherence to equal credit opportunity standards and the 80% rule.
    """
    groups = {
        'male': {'total': 0, 'approved': 0},
        'female': {'total': 0, 'approved': 0},
        'semiurban': {'total': 0, 'approved': 0},
        'rural': {'total': 0, 'approved': 0},
        'urban': {'total': 0, 'approved': 0},
        'graduate': {'total': 0, 'approved': 0},
        'non_graduate': {'total': 0, 'approved': 0}
    }

    for app in applicants_list:
        pred = predict_loan(app)
        is_approved = (pred.get('status') == 'Approved')

        # Gender
        gender = str(app.get('gender', '')).strip().lower()
        if gender == 'male':
            groups['male']['total'] += 1
            if is_approved: groups['male']['approved'] += 1
        elif gender == 'female':
            groups['female']['total'] += 1
            if is_approved: groups['female']['approved'] += 1

        # Property Area
        area = str(app.get('property_area', '')).strip().lower()
        if area == 'semiurban':
            groups['semiurban']['total'] += 1
            if is_approved: groups['semiurban']['approved'] += 1
        elif area == 'rural':
            groups['rural']['total'] += 1
            if is_approved: groups['rural']['approved'] += 1
        elif area == 'urban':
            groups['urban']['total'] += 1
            if is_approved: groups['urban']['approved'] += 1

        # Education
        edu = str(app.get('education', '')).strip().lower()
        if 'not' in edu or 'non' in edu:
            groups['non_graduate']['total'] += 1
            if is_approved: groups['non_graduate']['approved'] += 1
        elif 'grad' in edu:
            groups['graduate']['total'] += 1
            if is_approved: groups['graduate']['approved'] += 1

    def _calc_stats(grp_data: Dict[str, int]) -> Dict[str, Any]:
        tot = grp_data['total']
        appr = grp_data['approved']
        rate = (appr / tot * 100.0) if tot > 0 else 0.0
        return {
            'total': tot,
            'approved': appr,
            'approval_rate_percent': round(rate, 2)
        }

    male_stats = _calc_stats(groups['male'])
    female_stats = _calc_stats(groups['female'])
    gender_di = (
        round(female_stats['approval_rate_percent'] / male_stats['approval_rate_percent'], 3)
        if male_stats['approval_rate_percent'] > 0 else 1.0
    )

    semiurban_stats = _calc_stats(groups['semiurban'])
    rural_stats = _calc_stats(groups['rural'])
    urban_stats = _calc_stats(groups['urban'])
    rural_di = (
        round(rural_stats['approval_rate_percent'] / semiurban_stats['approval_rate_percent'], 3)
        if semiurban_stats['approval_rate_percent'] > 0 else 1.0
    )

    grad_stats = _calc_stats(groups['graduate'])
    nongrad_stats = _calc_stats(groups['non_graduate'])
    edu_di = (
        round(nongrad_stats['approval_rate_percent'] / grad_stats['approval_rate_percent'], 3)
        if grad_stats['approval_rate_percent'] > 0 else 1.0
    )

    all_pass = (gender_di >= 0.80 and rural_di >= 0.80 and edu_di >= 0.80)

    return {
        'portfolio_fairness_summary': {
            'overall_status': 'Compliant' if all_pass else 'Under Review',
            'four_fifths_threshold': 0.80
        },
        'gender_fairness': {
            'male_benchmark': male_stats,
            'female_protected': female_stats,
            'disparate_impact_ratio': gender_di,
            'passes_80_rule': gender_di >= 0.80
        },
        'territory_fairness': {
            'semiurban_benchmark': semiurban_stats,
            'rural_protected': rural_stats,
            'urban': urban_stats,
            'disparate_impact_ratio': rural_di,
            'passes_80_rule': rural_di >= 0.80
        },
        'education_fairness': {
            'graduate_benchmark': grad_stats,
            'non_graduate_protected': nongrad_stats,
            'disparate_impact_ratio': edu_di,
            'passes_80_rule': edu_di >= 0.80
        }
    }
