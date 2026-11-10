from src.database.database_operations import (
    create_user_profile,
    authenticate_user,
    verify_session_token,
    revoke_session_token,
    get_user_profile,
    get_user_by_email,
    save_application,
    update_application_details,
    get_all_applications,
    get_application_by_number,
    update_application_status,
    add_audit_log,
    get_audit_logs,
    get_full_vault_snapshot,
    sync_csv_export,
    get_sqlite_conn,
    checkpoint_db,
    get_sqlite_backup_bytes,
    get_site_availability,
    set_site_availability,
    is_verified_officer,
    validate_email_format,
    validate_password_strength,
    create_email_otp,
    delete_email_otp,
    verify_email_otp,
    validate_otp_verification_token,
    consume_otp_verification_token,
    reset_password_with_otp,
    init_db,
    DB_FILE,
    EXPORT_CSV
)

def register_user(full_name, email, phone, password, role='applicant', officer_key=None):
    return create_user_profile(full_name, email, phone, password, role=role, officer_key=officer_key)

def login_user(email, password):
    return authenticate_user(email, password)

def get_db_connection():
    return get_sqlite_conn()

def export_to_csv_file():
    sync_csv_export()

def save_loan_application(applicant_data, prediction_result, explanation_result, user_id=None):
    return save_application(applicant_data, prediction_result, explanation_result, user_id=user_id)

def update_status(app_no, new_status, officer_note='', officer_id=None, officer_name='Loan Officer'):
    return update_application_status(
        app_no,
        new_status,
        officer_remarks=officer_note,
        officer_id=officer_id,
        officer_name=officer_name
    )

def get_all_saved_applications(user_id=None, role='officer', user_email=None):
    return get_all_applications(user_id=user_id, role=role, user_email=user_email)

def get_application_by_no(application_no):
    return get_application_by_number(application_no)

__all__ = [
    'register_user',
    'login_user',
    'verify_session_token',
    'revoke_session_token',
    'get_user_profile',
    'get_user_by_email',
    'save_loan_application',
    'update_application_details',
    'update_status',
    'get_all_saved_applications',
    'get_application_by_number',
    'get_application_by_no',
    'add_audit_log',
    'get_audit_logs',
    'get_full_vault_snapshot',
    'get_db_connection',
    'checkpoint_db',
    'get_sqlite_backup_bytes',
    'export_to_csv_file',
    'get_site_availability',
    'set_site_availability',
    'is_verified_officer',
    'validate_email_format',
    'validate_password_strength',
    'create_email_otp',
    'delete_email_otp',
    'verify_email_otp',
    'validate_otp_verification_token',
    'consume_otp_verification_token',
    'reset_password_with_otp',
    'init_db',
    'DB_FILE',
    'EXPORT_CSV'
]
