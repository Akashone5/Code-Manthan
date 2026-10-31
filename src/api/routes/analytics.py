"""
Algorithmic Equity and Analytics Router
Exposes fairness auditing (four-fifths rule), model accuracy evaluation, and portfolio datasets.
"""

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from backend import check_fairness, load_sample_dataset
from src.api.schemas import AccuracyMetricsResponse

router = APIRouter(prefix="/api", tags=["Algorithmic Equity & Analytics"])

# Load portfolio records cache
APPLICANTS_DB = load_sample_dataset()


@router.get(
    "/fairness",
    summary="Conduct demographic fairness audit (80% Four-Fifths Rule)",
    responses={200: {"description": "Fairness audit report generated"}}
)
async def get_fairness_audit():
    """
    Evaluates disparate impact ratio (DIR) across protected demographic attributes:
    Gender parity and Territory / Geographic parity.
    """
    global APPLICANTS_DB
    if not APPLICANTS_DB:
        APPLICANTS_DB = load_sample_dataset()

    fairness_report = check_fairness(APPLICANTS_DB)
    return JSONResponse(status_code=status.HTTP_200_OK, content=fairness_report)


@router.get(
    "/accuracy",
    summary="Retrieve underwriting model validation performance metrics",
    response_model=AccuracyMetricsResponse
)
async def get_accuracy_metrics():
    """
    Returns validation performance benchmarks including Accuracy, Precision,
    Recall (Sensitivity), F1-Score, ROC-AUC, and the test confusion matrix.
    """
    accuracy_report = {
        "model_name": "L2-Regularized Transparent Logistic Scoring Engine",
        "overall_accuracy_percent": 84.55,
        "precision_percent": 83.65,
        "recall_sensitivity_percent": 97.75,
        "f1_score": 90.16,
        "roc_auc_score": 0.862,
        "confusion_matrix": {
            "true_positives": 87,
            "false_negatives": 2,
            "false_positives": 17,
            "true_negatives": 17
        },
        "total_validation_samples": 123
    }
    return JSONResponse(status_code=status.HTTP_200_OK, content=accuracy_report)


@router.get(
    "/applicants",
    summary="Retrieve portfolio sample records for testing",
    responses={200: {"description": "Portfolio sample records list"}}
)
async def get_sample_applicants():
    """
    Returns sample records from the historical underwriting portfolio.
    """
    global APPLICANTS_DB
    if not APPLICANTS_DB:
        APPLICANTS_DB = load_sample_dataset()

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "total_in_db": len(APPLICANTS_DB),
            "sample_applicants": APPLICANTS_DB[:50]
        }
    )
