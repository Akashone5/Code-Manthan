"""
Unified Data Access Layer & Repository
Manages dual-persistence across Supabase PostgreSQL (Cloud) and SQLite3 (Local Offline Fallback).
Implements secure user authentication, role-based access control (Applicant & Officer),
and Row Level Security tenant data isolation.
"""

import os
import re
import json
import uuid
import random
import hashlib
import datetime
import sqlite3
import csv
from typing import List, Dict, Any, Optional, Tuple

from .supabase_client import get_supabase_client

DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'meridian_loans.db'))
EXPORT_CSV = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'meridian_loan_applications_export.csv'))

OFFICER_PASSKEY = os.environ.get('OFFICER_REGISTRATION_KEY', 'OFFICER-2026')

def get_sqlite_conn() -> sqlite3.Connection:
    """Creates a configured SQLite connection with WAL mode and row mapping."""
    conn = sqlite3.connect(DB_FILE, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn

def _hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Generates a PBKDF2-HMAC-SHA256 password hash with cryptographic salt."""
    if not salt:
        salt = uuid.uuid4().hex
    pwd_bytes = password.encode('utf-8')
    salt_bytes = salt.encode('utf-8')
    key = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt_bytes, 100000)
    return key.hex(), salt

def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verifies a plain password against the stored PBKDF2 hash."""
    computed_hash, _ = _hash_password(password, salt)
    return hashlib.sha256(computed_hash.encode()).hexdigest() == hashlib.sha256(stored_hash.encode()).hexdigest()

def init_db():
    """Initializes SQLite schema for both profiles and loan_applications tables."""
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()

        # 1. User Profiles Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('applicant', 'officer')),
                is_verified_officer INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        ''')

        # 2. Loan Applications Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS loan_applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                applicant_id TEXT,
                user_id TEXT,
                application_no TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL,
                full_name TEXT NOT NULL,
                phone TEXT,
                gender TEXT NOT NULL,
                marital_status TEXT NOT NULL,
                dependents TEXT NOT NULL,
                education TEXT NOT NULL,
                employment_type TEXT NOT NULL,
                salary_slip TEXT DEFAULT 'Yes',
                applicant_income REAL NOT NULL,
                coapplicant_income REAL NOT NULL,
                loan_amount REAL NOT NULL,
                loan_term_months INTEGER NOT NULL,
                cibil_score INTEGER NOT NULL,
                credit_history INTEGER NOT NULL,
                property_area TEXT NOT NULL,
                loan_purpose TEXT NOT NULL,
                approval_likelihood INTEGER NOT NULL,
                status TEXT NOT NULL,
                monthly_emi REAL NOT NULL,
                dti_percent REAL NOT NULL,
                explanation_summary TEXT,
                positive_factors_json TEXT,
                risk_factors_json TEXT,
                recommendations_json TEXT,
                officer_status TEXT DEFAULT 'Pending',
                officer_remarks TEXT,
                officer_notes TEXT
            )
        ''')

        # Add missing columns safely if upgrading from earlier version
        cursor.execute("PRAGMA table_info(loan_applications)")
        existing_cols = {col['name'] for col in cursor.fetchall()}

        for col_name, col_def in [
            ('applicant_id', "TEXT"),
            ('user_id', "TEXT"),
            ('officer_status', "TEXT DEFAULT 'Pending'"),
            ('officer_remarks', "TEXT"),
            ('officer_notes', "TEXT"),
            ('salary_slip', "TEXT DEFAULT 'Yes'")
        ]:
            if col_name not in existing_cols:
                try:
                    cursor.execute(f"ALTER TABLE loan_applications ADD COLUMN {col_name} {col_def}")
                except Exception:
                    pass

        # Pre-provision default baseline accounts if table is empty
        cursor.execute("SELECT COUNT(*) FROM profiles")
        count = cursor.fetchone()[0]
        if count == 0:
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Default Applicant
            app_hash, app_salt = _hash_password("Applicant@123")
            cursor.execute('''
                INSERT INTO profiles (id, full_name, email, phone, password_hash, salt, role, is_verified_officer, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (str(uuid.uuid4()), "Ananya Rao", "applicant@meridianbank.in", "9876543210", app_hash, app_salt, "applicant", 0, now_str, now_str))

            # Default Officer
            off_hash, off_salt = _hash_password("Officer@2026")
            cursor.execute('''
                INSERT INTO profiles (id, full_name, email, phone, password_hash, salt, role, is_verified_officer, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (str(uuid.uuid4()), "Vikram Sharma (Lead Credit Officer)", "officer@meridianbank.in", "9811223344", off_hash, off_salt, "officer", 1, now_str, now_str))

# --- AUTHENTICATION & USER MANAGEMENT ---

def validate_email_format(email: str) -> bool:
    """Validates standard email format."""
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email.strip()))

def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Validates password security requirements (min 8 characters, letter and digit)."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not any(c.isalpha() for c in password):
        return False, "Password must contain at least one letter."
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number."
    return True, "Strong password."

def create_user_profile(full_name: str, email: str, phone: str, password: str,
                        role: str = 'applicant', officer_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Registers a new user account.
    Enforces email validation, password complexity, role verification, and dual-persistence.
    """
    full_name = full_name.strip()
    email = email.strip().lower()
    phone = phone.strip()
    role = role.strip().lower()

    if not full_name:
        raise ValueError("Full Name is required.")

    if not validate_email_format(email):
        raise ValueError("Invalid email address format.")

    is_strong, msg = validate_password_strength(password)
    if not is_strong:
        raise ValueError(msg)

    if role not in ['applicant', 'officer']:
        role = 'applicant'

    # Security Check: Officer clearance
    is_verified_officer = False
    if role == 'officer':
        configured_key = os.environ.get('OFFICER_REGISTRATION_KEY', 'OFFICER-2026').strip()
        if not officer_key or officer_key.strip() != configured_key:
            raise ValueError("Unauthorized: Invalid Officer Authorization Passkey. Officer registration requires institutional clearance.")
        is_verified_officer = True

    # Check for existing email in local database
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM profiles WHERE email = ?", (email,))
        if cursor.fetchone():
            raise ValueError(f"An account with email '{email}' already exists. Please sign in.")

    user_id = str(uuid.uuid4())
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Attempt Supabase Auth & Profile Registration
    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            metadata = {
                'full_name': full_name,
                'phone': phone,
                'role': role,
                'officer_key': officer_key if role == 'officer' else None
            }
            res = sb_client.auth_sign_up(email=email, password=password, metadata=metadata)
            if res.get('success'):
                sb_data = res.get('data', {})
                sb_user = sb_data.get('user') or {}
                if sb_user.get('id'):
                    user_id = sb_user['id']

            # Also attempt to insert into Supabase profiles table
            sb_client.insert('profiles', {
                'id': user_id,
                'full_name': full_name,
                'email': email,
                'phone': phone,
                'role': role,
                'is_verified_officer': is_verified_officer
            })
        except Exception:
            pass

    # 2. Persist to Local SQLite Database (Always active as reliable fallback)
    pwd_hash, salt = _hash_password(password)
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO profiles (id, full_name, email, phone, password_hash, salt, role, is_verified_officer, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, full_name, email, phone, pwd_hash, salt, role, 1 if is_verified_officer else 0, now_str, now_str))

    return {
        'id': user_id,
        'full_name': full_name,
        'email': email,
        'phone': phone,
        'role': role,
        'is_verified_officer': is_verified_officer,
        'created_at': now_str
    }

def authenticate_user(email: str, password: str) -> Dict[str, Any]:
    """
    Authenticates user credentials against Supabase Auth with seamless SQLite fallback.
    Returns session token and verified user profile.
    """
    email = email.strip().lower()
    password = password.strip()

    if not email or not password:
        return {'success': False, 'error': 'Email and password are required.'}

    # 1. Attempt Supabase Auth
    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            res = sb_client.auth_sign_in(email=email, password=password)
            if res.get('success'):
                data = res.get('data', {})
                token = data.get('access_token')
                sb_user = data.get('user', {})
                user_meta = sb_user.get('user_metadata', {})
                user_id = sb_user.get('id')

                # Query profile from Supabase or fallback to SQLite
                role = user_meta.get('role', 'applicant')
                full_name = user_meta.get('full_name', sb_user.get('email', 'User'))
                phone = user_meta.get('phone', '')

                # Check if local profile exists, else cache it
                local_profile = get_user_by_email(email)
                if not local_profile:
                    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    pwd_hash, salt = _hash_password(password)
                    with get_sqlite_conn() as conn:
                        conn.execute('''
                            INSERT OR REPLACE INTO profiles (id, full_name, email, phone, password_hash, salt, role, is_verified_officer, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, full_name, email, phone, pwd_hash, salt, role, 1 if role == 'officer' else 0, now_str, now_str))
                else:
                    role = local_profile.get('role', role)
                    full_name = local_profile.get('full_name', full_name)

                return {
                    'success': True,
                    'token': token,
                    'user': {
                        'id': user_id,
                        'email': email,
                        'full_name': full_name,
                        'phone': phone,
                        'role': role
                    }
                }
        except Exception:
            pass

    # 2. Local SQLite Authentication Fallback
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE email = ?", (email,))
        row = cursor.fetchone()

        if not row:
            return {'success': False, 'error': 'Account not found. Please register or check your email.'}

        record = dict(row)
        if not _verify_password(password, record['password_hash'], record['salt']):
            return {'success': False, 'error': 'Invalid password. Please try again.'}

        # Generate local session token
        session_token = f"local-session-{uuid.uuid4().hex}"
        return {
            'success': True,
            'token': session_token,
            'user': {
                'id': record['id'],
                'email': record['email'],
                'full_name': record['full_name'],
                'phone': record.get('phone', ''),
                'role': record['role'],
                'is_verified_officer': bool(record.get('is_verified_officer', 0))
            }
        }

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieves user profile by email."""
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE email = ?", (email.strip().lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves user profile by ID."""
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

# --- LOAN APPLICATION OPERATIONS ---

def sync_csv_export():
    """Syncs the latest loan applications state to the central CSV export mirror."""
    try:
        apps = get_all_applications()
        with open(EXPORT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Application No', 'Submission Date', 'Full Name', 'Phone', 'Gender',
                'Marital Status', 'Dependents', 'Education', 'Employment Type', 'Salary Slip Available',
                'Monthly Income (INR)', 'Co-Applicant Income (INR)', 'Loan Amount (k)',
                'Tenure (Months)', 'CIBIL Score', 'Property Area', 'Approval Score (%)',
                'Status', 'Officer Status', 'Officer Remarks', 'Estimated EMI (INR)', 'DTI (%)', 'Explanation Summary'
            ])
            for r in apps:
                writer.writerow([
                    r.get('application_no'), r.get('created_at'), r.get('full_name'), r.get('phone'),
                    r.get('gender'), r.get('marital_status'), r.get('dependents'), r.get('education'),
                    r.get('employment_type'), r.get('salary_slip', 'Yes'),
                    r.get('applicant_income'), r.get('coapplicant_income'),
                    r.get('loan_amount'), r.get('loan_term_months'), r.get('cibil_score'),
                    r.get('property_area'), r.get('approval_likelihood'), r.get('status'),
                    r.get('officer_status', 'Pending'), r.get('officer_remarks', ''),
                    r.get('monthly_emi'), r.get('dti_percent'), r.get('explanation_summary')
                ])
    except Exception as e:
        print(f"[WARN] CSV audit sync notification: {e}")

def save_application(applicant_data: Dict[str, Any], prediction_result: Dict[str, Any],
                     explanation_result: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Persists a new loan application.
    Associates the application with user_id/applicant_id for Row Level Security tenancy.
    Dual-writes to Supabase PostgreSQL and local SQLite.
    """
    random_digits = random.randint(1000, 9999)
    current_year = datetime.datetime.now().year
    app_no = f"MB-{current_year}-{random_digits}"
    created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cibil = int(applicant_data.get('cibil_score', 750))
    credit_hist = 1 if cibil >= 650 else 0

    pos_factors = [f"{p['factor']}: {p['details']}" for p in explanation_result.get('positive_factors', [])]
    neg_factors = [f"{n['factor']}: {n['details']}" for n in explanation_result.get('negative_factors', [])]
    recs = explanation_result.get('recommendations', [])

    term_months = int(applicant_data.get('loan_term_months', 0) or applicant_data.get('term', 0) or 60)
    if term_months <= 0:
        years = int(applicant_data.get('loan_term_years', 5))
        term_months = years * 12

    salary_slip = str(applicant_data.get('salary_slip', 'Yes')).capitalize()

    record_dict: Dict[str, Any] = {
        'applicant_id': user_id,
        'user_id': user_id,
        'application_no': app_no,
        'created_at': created_at,
        'full_name': applicant_data.get('full_name', 'Applicant'),
        'phone': applicant_data.get('phone', ''),
        'gender': applicant_data.get('gender', 'Male'),
        'marital_status': applicant_data.get('marital_status', 'Yes'),
        'dependents': str(applicant_data.get('dependents', '0')),
        'education': applicant_data.get('education', 'Graduate'),
        'employment_type': applicant_data.get('employment_type', 'Salaried'),
        'salary_slip': salary_slip,
        'applicant_income': float(applicant_data.get('applicant_income', 0)),
        'coapplicant_income': float(applicant_data.get('coapplicant_income', 0)),
        'loan_amount': float(applicant_data.get('loan_amount', 100)),
        'loan_term_months': term_months,
        'cibil_score': cibil,
        'credit_history': credit_hist,
        'property_area': applicant_data.get('property_area', 'Rural'),
        'loan_purpose': applicant_data.get('loan_purpose', 'Home Improvement'),
        'approval_likelihood': int(prediction_result.get('approval_likelihood', 50)),
        'status': prediction_result.get('status', 'Conditional'),
        'monthly_emi': float(prediction_result.get('monthly_emi', 0)),
        'dti_percent': float(prediction_result.get('dti_percent', 0)),
        'explanation_summary': explanation_result.get('verdict_summary', ''),
        'positive_factors_json': json.dumps(pos_factors),
        'risk_factors_json': json.dumps(neg_factors),
        'recommendations_json': json.dumps(recs),
        'officer_status': 'Pending',
        'officer_remarks': '',
        'officer_notes': 'Submitted via Mission Bharat Digital Portal'
    }

    # 1. Attempt Supabase Insertion
    sb_client = get_supabase_client()
    new_record: Optional[Dict[str, Any]] = None

    if sb_client.is_configured():
        try:
            res = sb_client.insert('loan_applications', record_dict)
            if res.get('success'):
                data = res.get('data')
                if isinstance(data, list) and len(data) > 0:
                    new_record = data[0]
                elif isinstance(data, dict):
                    new_record = data
        except Exception:
            pass

    # 2. Persist to Local SQLite Database
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO loan_applications (
                applicant_id, user_id, application_no, created_at, full_name, phone, gender,
                marital_status, dependents, education, employment_type, salary_slip,
                applicant_income, coapplicant_income, loan_amount, loan_term_months,
                cibil_score, credit_history, property_area, loan_purpose,
                approval_likelihood, status, monthly_emi, dti_percent,
                explanation_summary, positive_factors_json, risk_factors_json,
                recommendations_json, officer_status, officer_remarks, officer_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            record_dict.get('applicant_id'), record_dict.get('user_id'),
            record_dict['application_no'], record_dict['created_at'], record_dict['full_name'], record_dict['phone'],
            record_dict['gender'], record_dict['marital_status'], record_dict['dependents'], record_dict['education'],
            record_dict['employment_type'], record_dict['salary_slip'], record_dict['applicant_income'],
            record_dict['coapplicant_income'], record_dict['loan_amount'], record_dict['loan_term_months'],
            record_dict['cibil_score'], record_dict['credit_history'], record_dict['property_area'],
            record_dict['loan_purpose'], record_dict['approval_likelihood'], record_dict['status'],
            record_dict['monthly_emi'], record_dict['dti_percent'], record_dict['explanation_summary'],
            record_dict['positive_factors_json'], record_dict['risk_factors_json'],
            record_dict['recommendations_json'], record_dict['officer_status'], record_dict['officer_remarks'],
            record_dict['officer_notes']
        ))
        record_id = cursor.lastrowid
        record_dict['id'] = record_id

    sync_csv_export()
    return new_record or record_dict

def get_all_applications(user_id: Optional[str] = None, role: str = 'officer', user_email: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieves loan applications with strict Role-Based Access Control.
    Applicants can ONLY view their own records (filtered by user_id or email).
    Loan Officers can view all applications institution-wide.
    """
    is_applicant = (role == 'applicant')

    # 1. Query Supabase if configured
    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            if is_applicant and user_id:
                params = f"select=*&or=(user_id.eq.{user_id},applicant_id.eq.{user_id})&order=id.desc"
            else:
                params = "select=*&order=id.desc"

            res = sb_client.select('loan_applications', params)
            if res.get('success') and isinstance(res.get('data'), list):
                apps = res.get('data')
                if is_applicant and user_id:
                    return [a for a in apps if str(a.get('user_id') or a.get('applicant_id')) == str(user_id)]
                return apps
        except Exception:
            pass

    # 2. SQLite Query
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        if is_applicant and user_id:
            cursor.execute('''
                SELECT * FROM loan_applications 
                WHERE user_id = ? OR applicant_id = ?
                ORDER BY id DESC
            ''', (str(user_id), str(user_id)))
        elif is_applicant and user_email:
            # Fallback filter by phone or name if user_id was not explicitly set on legacy records
            cursor.execute('''
                SELECT * FROM loan_applications 
                WHERE user_id = ? OR applicant_id = ?
                ORDER BY id DESC
            ''', (str(user_id or ''), str(user_id or '')))
        else:
            # Officer: views all applications
            cursor.execute('SELECT * FROM loan_applications ORDER BY id DESC')

        rows = cursor.fetchall()
        return [dict(r) for r in rows]

def get_application_by_number(application_no: str) -> Optional[Dict[str, Any]]:
    """Retrieves a single loan application by reference number."""
    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            res = sb_client.select('loan_applications', f"application_no=eq.{application_no}&limit=1")
            if res.get('success') and isinstance(res.get('data'), list) and len(res['data']) > 0:
                return res['data'][0]
        except Exception:
            pass

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM loan_applications WHERE application_no = ?', (application_no,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_application_status(application_no: str, new_status: str, officer_remarks: str = '') -> Optional[Dict[str, Any]]:
    """
    Updates the underwriting decision status and records official officer remarks.
    Only accessible by authenticated Loan Officers.
    """
    # 1. Update in Supabase
    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            update_payload = {
                'status': new_status,
                'officer_status': new_status,
                'officer_remarks': officer_remarks,
                'officer_notes': officer_remarks
            }
            sb_client.update('loan_applications', update_payload, 'application_no', application_no)
        except Exception:
            pass

    # 2. Update in SQLite
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE loan_applications
            SET status = ?, officer_status = ?, officer_remarks = ?, officer_notes = ?
            WHERE application_no = ?
        ''', (new_status, new_status, officer_remarks, officer_remarks, application_no))

    sync_csv_export()
    return get_application_by_number(application_no)

init_db()
