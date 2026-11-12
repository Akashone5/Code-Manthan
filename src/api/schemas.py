from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict

class SignUpRequest(BaseModel):
    full_name: str = Field(..., description="Full legal name of the user", min_length=2)
    email: str = Field(..., description="Unique email address for authentication")
    phone: Optional[str] = Field(default="", description="Contact mobile number")
    password: str = Field(..., description="Secret login password", min_length=8)
    confirm_password: Optional[str] = Field(default=None, description="Password confirmation")
    role: str = Field(default="applicant", description="Account classification: 'applicant' or 'officer'")
    officer_key: Optional[str] = Field(default=None, description="Clearance key required for officer provisioning")
    otp_verification_token: Optional[str] = Field(default=None, description="Verified email OTP token")
    otp_code: Optional[str] = Field(default=None, description="Optional 6-digit email OTP code")

class SignInRequest(BaseModel):
    email: str = Field(..., description="Registered account email")
    password: str = Field(..., description="Account password")
    expected_role: Optional[str] = Field(default=None, description="Target gateway role verification ('applicant' or 'officer')")
    role: Optional[str] = Field(default=None, description="Fallback alias for expected_role")

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="Email address for dispatching password reset instructions")

class SendOtpRequest(BaseModel):
    email: str = Field(..., description="Recipient email address for 6-digit OTP delivery")
    purpose: str = Field(default="signup", description="Verification scope: signup, forgot_password, or email_change")
    lang: str = Field(default="en", description="Preferred email language: en or hi")

class VerifyOtpRequest(BaseModel):
    email: str = Field(..., description="Email address receiving the OTP")
    purpose: str = Field(default="signup", description="Verification scope: signup, forgot_password, or email_change")
    otp: str = Field(..., description="6-digit OTP verification code")

class ResetPasswordRequest(BaseModel):
    email: str = Field(..., description="Registered account email address")
    otp: Optional[str] = Field(default=None, description="6-digit OTP code from email")
    verification_token: Optional[str] = Field(default=None, description="Verified OTP token from /api/auth/verify-otp")
    password: str = Field(..., description="New account password", min_length=8)
    confirm_password: Optional[str] = Field(default=None, description="Confirmation of new password")

class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., description="Updated full name of the account holder")
    email: str = Field(..., description="Updated account email address")
    otp_verification_token: Optional[str] = Field(default=None, description="Verified email OTP token required when changing email")
    otp_code: Optional[str] = Field(default=None, description="Optional 6-digit email OTP code required when changing email")

class UserProfileResponse(BaseModel):
    id: str
    full_name: str
    email: str
    phone: Optional[str] = ""
    role: str
    created_at: Optional[str] = None

class AuthSuccessResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None
    user: Optional[Dict[str, Any]] = None
    token: Optional[str] = None
    session_id: Optional[str] = None

class BaseMessageResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None

class LoanApplicationRequest(BaseModel):
    model_config = ConfigDict(extra='allow')

    full_name: Optional[str] = Field(default="Applicant", description="Borrower legal name")
    phone: Optional[str] = Field(default=None, description="Borrower phone")
    email: Optional[str] = Field(default=None, description="Borrower email")
    gender: Optional[str] = Field(default="Male", description="Gender identity")
    marital_status: Optional[str] = Field(default="No", description="Marital status (Yes/No)")
    dependents: Optional[str] = Field(default="0", description="Number of financial dependents")
    education: Optional[str] = Field(default="Graduate", description="Education level (Graduate / Not Graduate)")
    employment_type: Optional[str] = Field(default="Salaried (Private)", description="Employment classification")
    applicant_income: float = Field(default=35000.0, description="Monthly applicant primary income in INR")
    coapplicant_income: float = Field(default=0.0, description="Monthly co-applicant secondary income in INR")
    loan_purpose: Optional[str] = Field(default="Home Purchase", description="Intended purpose for credit")
    loan_amount: float = Field(default=150000.0, description="Requested principal amount in INR (e.g. 150000)")
    loan_term_months: float = Field(default=360.0, description="Repayment tenure in months")
    cibil_score: float = Field(default=750.0, description="Bureau credit score (300 - 900)")
    property_area: Optional[str] = Field(default="Semiurban", description="Property location tier: Urban, Semiurban, Rural")
    salary_slip: Optional[str] = Field(default="Yes", description="Income proof document availability (Yes/No)")
    user_id: Optional[str] = Field(default=None, description="Foreign key linking to authenticated profile")
    applicant_id: Optional[str] = Field(default=None, description="Alias for user_id")

class WhatIfRequest(BaseModel):
    base: Dict[str, Any] = Field(..., description="Baseline applicant feature set")
    adjustments: Dict[str, Any] = Field(..., description="Proposed counterfactual adjustments (e.g. tenure, income)")

class OfficerSanctionRequest(BaseModel):
    application_no: str = Field(..., description="Unique application identifier (e.g. RD-2026-1001)")
    status: str = Field(default="Approved", description="Decision verdict: Approved, Conditional, or Rejected")
    remarks: Optional[str] = Field(default=None, description="Officer analytical remarks and justification")
    note: Optional[str] = Field(default=None, description="Alternative field for officer remarks")
    officer_role: Optional[str] = Field(default=None, description="Role verification parameter")

class ApplicationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='allow')

    applicant_income: Optional[float] = Field(default=None, description="Updated monthly applicant income in INR")
    coapplicant_income: Optional[float] = Field(default=None, description="Updated monthly co-applicant income in INR")
    loan_amount: Optional[float] = Field(default=None, description="Updated requested loan amount in INR")
    loan_term_months: Optional[int] = Field(default=None, description="Updated repayment tenure in months")
    cibil_score: Optional[int] = Field(default=None, description="Updated bureau CIBIL score")
    salary_slip: Optional[str] = Field(default=None, description="Updated salary slip availability (Yes/No)")
    property_area: Optional[str] = Field(default=None, description="Updated property territory")
    employment_type: Optional[str] = Field(default=None, description="Updated employment classification")
    loan_purpose: Optional[str] = Field(default=None, description="Updated loan purpose")

class AuditLogCreateRequest(BaseModel):
    application_no: str = Field(default="SYSTEM", description="Target application number or scope")
    action: str = Field(..., description="Audit action identifier")
    notes: Optional[str] = Field(default="", description="Audit event notes")
    remarks: Optional[str] = Field(default="", description="Audit regulatory remarks")

class SavedApplicationsResponse(BaseModel):
    success: bool = True
    role: str
    total_saved: int
    applications: List[Dict[str, Any]]

class SingleApplicationResponse(BaseModel):
    success: bool = True
    application: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class FairnessReportResponse(BaseModel):
    total_audited_records: int
    gender_fairness: Dict[str, Any]
    territory_fairness: Dict[str, Any]
    equity_certification: str

class AccuracyMetricsResponse(BaseModel):
    model_name: str
    overall_accuracy_percent: float
    precision_percent: float
    recall_sensitivity_percent: float
    f1_score: float
    roc_auc_score: float
    confusion_matrix: Dict[str, int]
    total_validation_samples: int

class HealthResponse(BaseModel):
    status: str
    service: str
    database: str
    site_online: bool = True
    site_status: str = "online"

class SiteAvailabilityUpdateRequest(BaseModel):
    online: bool = Field(..., description="True to make portal publicly online, False for maintenance/offline mode")
    title: Optional[str] = Field(default=None, description="Custom heading displayed when portal is offline")
    maintenance_message: Optional[str] = Field(default=None, description="Custom maintenance notice shown to visitors")
    officer_key: Optional[str] = Field(default=None, description="Optional officer clearance key when toggling from maintenance overlay")

class SiteAvailabilityResponse(BaseModel):
    success: bool = True
    online: bool
    status: str
    title: str
    maintenance_message: str
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None
