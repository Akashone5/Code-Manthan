import os
import re
import hmac
import json
import uuid
import shutil
import random
import hashlib
import datetime
import sqlite3
import csv
from typing import List, Dict, Any, Optional, Tuple

from .supabase_client import get_supabase_client

_ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
_SEED_DB_FILE = os.path.join(_ROOT_DIR, 'meridian_loans.db')

def _resolve_db_and_export_paths() -> Tuple[str, str]:
    explicit_db = os.environ.get('SQLITE_DB_PATH', '').strip()
    volume_mount = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH', '').strip()
    if explicit_db:
        db_path = os.path.abspath(explicit_db)
    elif volume_mount:
        db_path = os.path.abspath(os.path.join(volume_mount, 'meridian_loans.db'))
    else:
        db_path = _SEED_DB_FILE

    explicit_csv = os.environ.get('EXPORT_CSV_PATH', '').strip()
    if explicit_csv:
        csv_path = os.path.abspath(explicit_csv)
    else:
        csv_dir = os.path.dirname(db_path) or _ROOT_DIR
        csv_path = os.path.join(csv_dir, 'meridian_loan_applications_export.csv')
    return db_path, csv_path

DB_FILE, EXPORT_CSV = _resolve_db_and_export_paths()

def _ensure_db_storage_ready():
    parent_dir = os.path.dirname(DB_FILE)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
    if (
        os.path.abspath(DB_FILE) != os.path.abspath(_SEED_DB_FILE)
        and not os.path.exists(DB_FILE)
        and os.path.exists(_SEED_DB_FILE)
    ):
        try:
            shutil.copy2(_SEED_DB_FILE, DB_FILE)
        except Exception:
            pass

def get_sqlite_conn() -> sqlite3.Connection:
    _ensure_db_storage_ready()
    conn = sqlite3.connect(DB_FILE, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn

def _hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    if not salt:
        salt = uuid.uuid4().hex
    pwd_bytes = password.encode('utf-8')
    salt_bytes = salt.encode('utf-8')
    key = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt_bytes, 100000)
    return key.hex(), salt

def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    computed_hash, _ = _hash_password(password, salt)
    return hmac.compare_digest(computed_hash, stored_hash)

def _get_configured_officer_key() -> str:
    configured = os.environ.get('OFFICER_REGISTRATION_KEY', '').strip()
    if configured:
        return configured
    env_name = os.environ.get('ENVIRONMENT', '').strip().lower()
    if env_name == 'production' or os.environ.get('RAILWAY_ENVIRONMENT'):
        return ''
    return 'OFFICER-2026'

def init_db():
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()

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

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_by TEXT,
                updated_at TEXT NOT NULL
            )
        ''')

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("SELECT setting_key, setting_value FROM system_settings")
        existing_settings = {row['setting_key']: row['setting_value'] for row in cursor.fetchall()}

        force_site_env = os.environ.get("FORCE_SITE_ONLINE", "").strip()
        raw_site_env = os.environ.get("SITE_ONLINE")

        if force_site_env:
            forced_val = "false" if force_site_env.lower() in ("0", "false", "no", "off", "offline") else "true"
            cursor.execute('''
                INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = excluded.setting_value,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
            ''', ("site_online", forced_val, "Environment Variable (FORCE_SITE_ONLINE)", now_str))
        elif raw_site_env is not None and raw_site_env.strip():
            env_online = "false" if raw_site_env.strip().lower() in ("0", "false", "no", "off", "offline") else "true"
            last_env = existing_settings.get("site_online_env_last")
            if "site_online" not in existing_settings or last_env != env_online:
                cursor.execute('''
                    INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(setting_key) DO UPDATE SET
                        setting_value = excluded.setting_value,
                        updated_by = excluded.updated_by,
                        updated_at = excluded.updated_at
                ''', ("site_online", env_online, "Environment Variable (SITE_ONLINE)", now_str))
                cursor.execute('''
                    INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(setting_key) DO UPDATE SET
                        setting_value = excluded.setting_value,
                        updated_by = excluded.updated_by,
                        updated_at = excluded.updated_at
                ''', ("site_online_env_last", env_online, "System Startup", now_str))
        else:
            cursor.execute('''
                INSERT OR IGNORE INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                VALUES (?, ?, ?, ?)
            ''', ("site_online", "true", "System Startup", now_str))

        for k, v, actor in [
            ("maintenance_title", "Portal Temporarily Offline", "System Startup"),
            ("maintenance_message", "Meridian FairLend AI is currently offline for scheduled maintenance. Online underwriting will resume shortly.", "System Startup"),
        ]:
            cursor.execute('''
                INSERT OR IGNORE INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                VALUES (?, ?, ?, ?)
            ''', (k, v, actor, now_str))

        cursor.execute("SELECT COUNT(*) FROM profiles")
        count = cursor.fetchone()[0]
        if count == 0:
            app_hash, app_salt = _hash_password("Applicant@123")
            cursor.execute('''
                INSERT INTO profiles (id, full_name, email, phone, password_hash, salt, role, is_verified_officer, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (str(uuid.uuid4()), "Ananya Rao", "applicant@meridianbank.in", "9876543210", app_hash, app_salt, "applicant", 0, now_str, now_str))

            seed_officer_pwd = os.environ.get("OFFICER_ADMIN_PASSWORD", "").strip() or "Officer@2026"
            off_hash, off_salt = _hash_password(seed_officer_pwd)
            cursor.execute('''
                INSERT INTO profiles (id, full_name, email, phone, password_hash, salt, role, is_verified_officer, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (str(uuid.uuid4()), "Vikram Sharma (Lead Credit Officer)", "officer@meridianbank.in", "9811223344", off_hash, off_salt, "officer", 1, now_str, now_str))
            if os.environ.get("OFFICER_ADMIN_PASSWORD", "").strip():
                pwd_fp = hashlib.sha256(seed_officer_pwd.encode()).hexdigest()
                cursor.execute('''
                    INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(setting_key) DO UPDATE SET
                        setting_value = excluded.setting_value,
                        updated_by = excluded.updated_by,
                        updated_at = excluded.updated_at
                ''', ("officer_pwd_env_last", pwd_fp, "System Startup", now_str))
        else:
            admin_pwd_env = os.environ.get("OFFICER_ADMIN_PASSWORD", "").strip()
            if admin_pwd_env:
                pwd_fp = hashlib.sha256(admin_pwd_env.encode()).hexdigest()
                if existing_settings.get("officer_pwd_env_last") != pwd_fp:
                    off_hash, off_salt = _hash_password(admin_pwd_env)
                    cursor.execute('''
                        UPDATE profiles
                        SET password_hash = ?, salt = ?, is_verified_officer = 1, updated_at = ?
                        WHERE email = ? AND role = 'officer'
                    ''', (off_hash, off_salt, now_str, "officer@meridianbank.in"))
                    cursor.execute('''
                        INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(setting_key) DO UPDATE SET
                            setting_value = excluded.setting_value,
                            updated_by = excluded.updated_by,
                            updated_at = excluded.updated_at
                    ''', ("officer_pwd_env_last", pwd_fp, "Environment Variable (OFFICER_ADMIN_PASSWORD)", now_str))

def validate_email_format(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email.strip()))

def validate_password_strength(password: str) -> Tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not any(c.isalpha() for c in password):
        return False, "Password must contain at least one letter."
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number."
    return True, "Strong password."

def create_user_profile(full_name: str, email: str, phone: str, password: str,
                        role: str = 'applicant', officer_key: Optional[str] = None) -> Dict[str, Any]:
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

    is_verified_officer = False
    if role == 'officer':
        configured_key = _get_configured_officer_key()
        candidate = (officer_key or "").strip()
        if not configured_key or not candidate or not hmac.compare_digest(candidate, configured_key):
            raise ValueError("Unauthorized: Invalid Officer Authorization Passkey. Officer registration requires institutional clearance.")
        is_verified_officer = True

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM profiles WHERE email = ?", (email,))
        if cursor.fetchone():
            raise ValueError(f"An account with email '{email}' already exists. Please sign in.")

    user_id = str(uuid.uuid4())
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

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
    email = email.strip().lower()
    password = password.strip()

    if not email or not password:
        return {'success': False, 'error': 'Email and password are required.'}

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

                role = user_meta.get('role', 'applicant')
                full_name = user_meta.get('full_name', sb_user.get('email', 'User'))
                phone = user_meta.get('phone', '')

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

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE email = ?", (email,))
        row = cursor.fetchone()

        if not row:
            return {'success': False, 'error': 'Account not found. Please register or check your email.'}

        record = dict(row)
        if not _verify_password(password, record['password_hash'], record['salt']):
            return {'success': False, 'error': 'Invalid password. Please try again.'}

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
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE email = ?", (email.strip().lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def sync_csv_export():
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
    is_applicant = (role == 'applicant')

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

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        if is_applicant and user_id:
            cursor.execute('''
                SELECT * FROM loan_applications 
                WHERE user_id = ? OR applicant_id = ?
                ORDER BY id DESC
            ''', (str(user_id), str(user_id)))
        elif is_applicant and user_email:
            cursor.execute('''
                SELECT * FROM loan_applications 
                WHERE user_id = ? OR applicant_id = ?
                ORDER BY id DESC
            ''', (str(user_id or ''), str(user_id or '')))
        else:
            cursor.execute('SELECT * FROM loan_applications ORDER BY id DESC')

        rows = cursor.fetchall()
        return [dict(r) for r in rows]

def get_application_by_number(application_no: str) -> Optional[Dict[str, Any]]:
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

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE loan_applications
            SET status = ?, officer_status = ?, officer_remarks = ?, officer_notes = ?
            WHERE application_no = ?
        ''', (new_status, new_status, officer_remarks, officer_remarks, application_no))

    sync_csv_export()
    return get_application_by_number(application_no)

DEFAULT_MAINTENANCE_TITLE = "Portal Temporarily Offline"
DEFAULT_MAINTENANCE_MESSAGE = (
    "Meridian FairLend AI is currently offline for scheduled maintenance. "
    "Online underwriting will resume shortly."
)

def is_verified_officer(
    user_id: Optional[str] = None,
    user_role: Optional[str] = None,
    officer_key: Optional[str] = None
) -> Tuple[bool, str]:
    configured_key = _get_configured_officer_key()
    candidate = (officer_key or "").strip()
    if configured_key and candidate and hmac.compare_digest(candidate, configured_key):
        return True, "Officer Clearance Passkey"

    if user_id and (not user_role or str(user_role).strip().lower() == 'officer'):
        profile = get_user_profile(str(user_id).strip())
        if profile and str(profile.get('role', '')).strip().lower() == 'officer':
            display_actor = profile.get('full_name') or profile.get('email') or 'Loan Officer'
            return True, str(display_actor)

    return False, ""

def get_site_availability() -> Dict[str, Any]:
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    default_online = os.environ.get("SITE_ONLINE", "true").strip().lower() not in ("0", "false", "no", "off", "offline")
    settings: Dict[str, Dict[str, str]] = {}

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT setting_key, setting_value, updated_by, updated_at FROM system_settings")
        for row in cursor.fetchall():
            settings[row['setting_key']] = {
                'value': row['setting_value'],
                'updated_by': row['updated_by'] or 'System Administrator',
                'updated_at': row['updated_at'] or now_str
            }

    online_raw = settings.get('site_online', {}).get('value', 'true' if default_online else 'false')
    is_online = str(online_raw).strip().lower() in ('true', '1', 'yes', 'on', 'online')
    title = settings.get('maintenance_title', {}).get('value', DEFAULT_MAINTENANCE_TITLE)
    message = settings.get('maintenance_message', {}).get('value', DEFAULT_MAINTENANCE_MESSAGE)
    updated_by = settings.get('site_online', {}).get('updated_by', 'System Administrator')
    updated_at = settings.get('site_online', {}).get('updated_at', now_str)

    return {
        'online': is_online,
        'status': 'online' if is_online else 'offline',
        'title': title,
        'maintenance_message': message,
        'updated_by': updated_by,
        'updated_at': updated_at
    }

def set_site_availability(
    online: bool,
    message: Optional[str] = None,
    title: Optional[str] = None,
    updated_by: str = "Loan Officer"
) -> Dict[str, Any]:
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    actor = (updated_by or "Loan Officer").strip()
    online_str = "true" if online else "false"

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(setting_key) DO UPDATE SET
                setting_value = excluded.setting_value,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at
        ''', ("site_online", online_str, actor, now_str))

        if title is not None and title.strip():
            cursor.execute('''
                INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = excluded.setting_value,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
            ''', ("maintenance_title", title.strip(), actor, now_str))

        if message is not None and message.strip():
            cursor.execute('''
                INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = excluded.setting_value,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
            ''', ("maintenance_message", message.strip(), actor, now_str))

    return get_site_availability()

init_db()
