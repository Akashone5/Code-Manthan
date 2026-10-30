"""
Central Database Access Facade
Provides backward-compatible database operations delegating to the unified src.database repository.
Includes authentication, user profiles, and loan application management.
"""

from src.database.database_operations import (
    create_user_profile,
    authenticate_user,
    get_user_profile,
    get_user_by_email,
    save_application,
    get_all_applications,
    get_application_by_number,
    update_application_status,
    sync_csv_export,
    get_sqlite_conn,
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

def update_status(app_no, new_status, officer_note=''):
    return update_application_status(app_no, new_status, officer_remarks=officer_note)

def get_all_saved_applications(user_id=None, role='officer'):
    return get_all_applications(user_id=user_id, role=role)

def get_application_by_no(application_no):
    return get_application_by_number(application_no)

__all__ = [
    'register_user',
    'login_user',
    'get_user_profile',
    'get_user_by_email',
    'save_loan_application',
    'update_status',
    'get_all_saved_applications',
    'get_application_by_number',
    'get_application_by_no',
    'get_db_connection',
    'export_to_csv_file',
    'init_db',
    'DB_FILE',
    'EXPORT_CSV'
]
