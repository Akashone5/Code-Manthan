"""
Meridian Credit Underwriting & Risk Assessment Engine
Mission Bharat Retail Lending Division
"""

from .preprocess import normalize_applicant
from .train import predict_loan
from .explain import explain_decision
from .fairness import check_fairness

__all__ = [
    'normalize_applicant',
    'predict_loan',
    'explain_decision',
    'check_fairness'
]
