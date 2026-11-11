import os
import re
import hmac
import json
import uuid
import shutil
import random
import secrets
import hashlib
import datetime
import sqlite3
import csv
import tempfile
from contextlib import contextmanager
from typing import List, Dict, Any, Optional, Tuple, Iterator

from .supabase_client import get_supabase_client

VALID_OTP_PURPOSES = ('signup', 'forgot_password', 'application')

def _utc_now_dt() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

def _utc_now_str() -> str:
    return _utc_now_dt().strftime("%Y-%m-%d %H:%M:%S")

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

@contextmanager
def get_sqlite_conn() -> Iterator[sqlite3.Connection]:
    _ensure_db_storage_ready()
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = FULL;")
        conn.execute("PRAGMA busy_timeout = 10000;")
        conn.execute("PRAGMA foreign_keys = ON;")
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass

def checkpoint_db(mode: str = 'TRUNCATE') -> bool:
    safe_mode = mode if mode in ('PASSIVE', 'FULL', 'RESTART', 'TRUNCATE') else 'TRUNCATE'
    try:
        with get_sqlite_conn() as conn:
            conn.execute(f"PRAGMA wal_checkpoint({safe_mode});")
        return True
    except Exception:
        return False

def get_sqlite_backup_bytes() -> bytes:
    _ensure_db_storage_ready()
    checkpoint_db('TRUNCATE')
    fd, tmp_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    try:
        src = sqlite3.connect(DB_FILE, timeout=30.0)
        dst = sqlite3.connect(tmp_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        with open(tmp_path, 'rb') as f:
            return f.read()
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

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
    migrated_loan_count = 0
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
                applicant_email TEXT,
                application_no TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT,
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
                officer_notes TEXT,
                email_otp_verified INTEGER DEFAULT 0
            )
        ''')

        cursor.execute("PRAGMA table_info(loan_applications)")
        existing_cols = {col['name'] for col in cursor.fetchall()}

        for col_name, col_def in [
            ('applicant_id', "TEXT"),
            ('user_id', "TEXT"),
            ('applicant_email', "TEXT"),
            ('updated_at', "TEXT"),
            ('officer_status', "TEXT DEFAULT 'Pending'"),
            ('officer_remarks', "TEXT"),
            ('officer_notes', "TEXT"),
            ('salary_slip', "TEXT DEFAULT 'Yes'"),
            ('email_otp_verified', "INTEGER DEFAULT 0")
        ]:
            if col_name not in existing_cols:
                try:
                    cursor.execute(f"ALTER TABLE loan_applications ADD COLUMN {col_name} {col_def}")
                except Exception:
                    pass

        cursor.execute('''
            UPDATE loan_applications
            SET updated_at = COALESCE(updated_at, created_at)
            WHERE updated_at IS NULL
        ''')

        cursor.execute('''
            UPDATE loan_applications
            SET applicant_email = (
                SELECT p.email FROM profiles p
                WHERE p.id = COALESCE(loan_applications.user_id, loan_applications.applicant_id)
            )
            WHERE (applicant_email IS NULL OR applicant_email = '')
              AND COALESCE(user_id, applicant_id) IS NOT NULL
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_by TEXT,
                updated_at TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                officer_id TEXT,
                officer_name TEXT NOT NULL,
                officer_role TEXT DEFAULT 'officer',
                application_no TEXT NOT NULL,
                action TEXT NOT NULL,
                notes TEXT,
                remarks TEXT
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS email_otps (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                purpose TEXT NOT NULL CHECK(purpose IN ('signup', 'forgot_password', 'application')),
                otp_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                attempts_left INTEGER NOT NULL DEFAULT 5,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                verified_at TEXT,
                verification_token TEXT,
                token_expires_at TEXT,
                token_consumed_at TEXT
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_email_otps_lookup
            ON email_otps (email, purpose, created_at)
        ''')

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("SELECT setting_value FROM system_settings WHERE setting_key = ?", ("loan_amount_inr_migrated",))
        migrated_row = cursor.fetchone()
        if not migrated_row or str(migrated_row['setting_value']).strip().lower() != "true":
            cursor.execute('''
                UPDATE loan_applications
                SET loan_amount = ROUND(loan_amount * 1000.0, 2)
                WHERE loan_amount > 0
                  AND loan_amount <= 1000.0
                  AND (
                      COALESCE(monthly_emi, 0) <= 0
                      OR ABS((loan_amount * 1000.0 / CASE WHEN loan_term_months > 0 THEN loan_term_months ELSE 1 END) - monthly_emi)
                         < ABS((loan_amount / CASE WHEN loan_term_months > 0 THEN loan_term_months ELSE 1 END) - monthly_emi)
                  )
            ''')
            migrated_loan_count = cursor.rowcount or 0
            cursor.execute('''
                INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = excluded.setting_value,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
            ''', ("loan_amount_inr_migrated", "true", "System Migration", now_str))
            if migrated_loan_count > 0:
                print(f"[MIGRATION] Upgraded {migrated_loan_count} loan_amount rows from thousands to direct INR.")

        cursor.execute("SELECT COUNT(*) FROM audit_logs")
        if cursor.fetchone()[0] == 0:
            baseline_audits = [
                ("2026-10-28 21:10:00", None, "Underwriter #304", "officer", "MB-2026-1003", "Mission Bharat Pass", "Rural women digital MSME priority incentive applied", "Verified under Mission Bharat guidelines"),
                ("2026-10-28 20:42:00", None, "Underwriter #108", "officer", "MB-2026-1002", "Approved", "Standard prime underwriting pass", "CIBIL & DTI ratios within prime ceiling"),
                ("2026-10-28 20:15:00", None, "Underwriter #402", "officer", "MB-2026-1004", "System Rejected", "Subprime credit score (CIBIL 580) and 59.5% DTI", "Credit rehabilitation recommended")
            ]
            cursor.executemany('''
                INSERT INTO audit_logs (created_at, officer_id, officer_name, officer_role, application_no, action, notes, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', baseline_audits)

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

    if migrated_loan_count > 0:
        checkpoint_db('TRUNCATE')
        sync_csv_export()

def _persist_session(token: str, user_id: str, role: str):
    if not token or not user_id:
        return
    now_dt = datetime.datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    exp_str = (now_dt + datetime.timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
    with get_sqlite_conn() as conn:
        conn.execute('''
            INSERT OR REPLACE INTO user_sessions (token, user_id, role, created_at, expires_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (token, str(user_id), str(role), now_str, exp_str, now_str))

def verify_session_token(token: str) -> Optional[Dict[str, Any]]:
    clean = (token or "").strip()
    if clean.lower().startswith("bearer "):
        clean = clean[7:].strip()
    if not clean:
        return None

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.token, s.user_id, s.role, s.expires_at,
                   p.id, p.full_name, p.email, p.phone, p.role AS profile_role, p.is_verified_officer, p.created_at
            FROM user_sessions s
            JOIN profiles p ON p.id = s.user_id
            WHERE s.token = ?
        ''', (clean,))
        row = cursor.fetchone()
        if not row:
            return None
        rec = dict(row)
        if rec.get('expires_at') and rec['expires_at'] < now_str:
            cursor.execute("DELETE FROM user_sessions WHERE token = ?", (clean,))
            return None
        cursor.execute("UPDATE user_sessions SET last_seen_at = ? WHERE token = ?", (now_str, clean))
        return {
            'id': rec['id'],
            'full_name': rec['full_name'],
            'email': rec['email'],
            'phone': rec.get('phone', ''),
            'role': rec['profile_role'],
            'is_verified_officer': bool(rec.get('is_verified_officer', 0)),
            'created_at': rec['created_at']
        }

def revoke_session_token(token: str) -> bool:
    clean = (token or "").strip()
    if clean.lower().startswith("bearer "):
        clean = clean[7:].strip()
    if not clean:
        return False
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_sessions WHERE token = ?", (clean,))
        return cursor.rowcount > 0

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

def _normalize_otp_purpose(purpose: str) -> str:
    clean = str(purpose or '').strip().lower()
    if clean not in VALID_OTP_PURPOSES:
        raise ValueError("Invalid OTP verification purpose.")
    return clean

def _hash_otp_code(email: str, purpose: str, otp_code: str, salt: str) -> str:
    msg = f"{email}:{purpose}:{otp_code}".encode('utf-8')
    return hmac.new(salt.encode('utf-8'), msg, hashlib.sha256).hexdigest()

def create_email_otp(
    email: str,
    purpose: str,
    ttl_seconds: int = 600,
    cooldown_seconds: int = 60
) -> Dict[str, Any]:
    clean_email = (email or '').strip().lower()
    if not validate_email_format(clean_email):
        raise ValueError("Invalid email address format.")
    clean_purpose = _normalize_otp_purpose(purpose)

    now_dt = _utc_now_dt()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    safe_ttl = max(60, int(ttl_seconds))
    exp_str = (now_dt + datetime.timedelta(seconds=safe_ttl)).strftime("%Y-%m-%d %H:%M:%S")
    prune_cutoff = (now_dt - datetime.timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")

    otp_code = f"{secrets.randbelow(1000000):06d}"
    salt = secrets.token_hex(16)
    otp_id = str(uuid.uuid4())
    otp_hash = _hash_otp_code(clean_email, clean_purpose, otp_code, salt)
    cooldown_wait = 0

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM email_otps WHERE created_at < ?",
            (prune_cutoff,)
        )
        if cooldown_seconds > 0:
            cursor.execute('''
                SELECT created_at, token_consumed_at FROM email_otps
                WHERE LOWER(email) = ? AND purpose = ?
                ORDER BY created_at DESC LIMIT 1
            ''', (clean_email, clean_purpose))
            prev = cursor.fetchone()
            if prev and prev['token_consumed_at'] is None:
                try:
                    prev_dt = datetime.datetime.strptime(prev['created_at'], "%Y-%m-%d %H:%M:%S")
                    elapsed = (now_dt - prev_dt).total_seconds()
                    if 0 <= elapsed < cooldown_seconds:
                        cooldown_wait = max(1, int(cooldown_seconds - elapsed))
                except Exception:
                    pass

        if cooldown_wait == 0:
            cursor.execute('''
                DELETE FROM email_otps
                WHERE LOWER(email) = ? AND purpose = ? AND token_consumed_at IS NULL
            ''', (clean_email, clean_purpose))
            cursor.execute('''
                INSERT INTO email_otps (
                    id, email, purpose, otp_hash, salt, attempts_left,
                    created_at, expires_at, verified_at, verification_token,
                    token_expires_at, token_consumed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
            ''', (otp_id, clean_email, clean_purpose, otp_hash, salt, 5, now_str, exp_str))

    if cooldown_wait > 0:
        raise ValueError(f"COOLDOWN:{cooldown_wait}")

    return {
        'otp_id': otp_id,
        'email': clean_email,
        'purpose': clean_purpose,
        'otp_code': otp_code,
        'expires_in_seconds': safe_ttl,
        'cooldown_seconds': max(0, int(cooldown_seconds))
    }

def delete_email_otp(otp_id: str) -> None:
    clean_id = (otp_id or '').strip()
    if not clean_id:
        return
    with get_sqlite_conn() as conn:
        conn.execute("DELETE FROM email_otps WHERE id = ?", (clean_id,))

def verify_email_otp(
    email: str,
    purpose: str,
    otp_code: str,
    token_ttl_seconds: int = 900
) -> Dict[str, Any]:
    clean_email = (email or '').strip().lower()
    if not validate_email_format(clean_email):
        raise ValueError("Invalid email address format.")
    clean_purpose = _normalize_otp_purpose(purpose)
    clean_code = re.sub(r'\s+', '', str(otp_code or ''))
    if len(clean_code) != 6 or not clean_code.isdigit():
        raise ValueError("Please enter the 6-digit numeric OTP sent to your email.")

    now_dt = _utc_now_dt()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    safe_token_ttl = max(60, int(token_ttl_seconds))
    tok_exp_str = (now_dt + datetime.timedelta(seconds=safe_token_ttl)).strftime("%Y-%m-%d %H:%M:%S")

    err_msg: Optional[str] = None
    verification_token: Optional[str] = None

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM email_otps
            WHERE LOWER(email) = ? AND purpose = ? AND token_consumed_at IS NULL
            ORDER BY created_at DESC LIMIT 1
        ''', (clean_email, clean_purpose))
        row = cursor.fetchone()
        if not row:
            err_msg = "No active OTP found for this email. Please click 'Send OTP' first."
        else:
            rec = dict(row)
            if rec['expires_at'] < now_str:
                err_msg = "OTP has expired. Please request a new verification code."
            elif int(rec.get('attempts_left') or 0) <= 0:
                err_msg = "Maximum verification attempts reached. Please request a new OTP."
            else:
                expected_hash = _hash_otp_code(clean_email, clean_purpose, clean_code, rec['salt'])
                if not hmac.compare_digest(expected_hash, rec['otp_hash']):
                    remaining = max(0, int(rec['attempts_left']) - 1)
                    cursor.execute(
                        "UPDATE email_otps SET attempts_left = ? WHERE id = ?",
                        (remaining, rec['id'])
                    )
                    if remaining > 0:
                        err_msg = f"Invalid OTP code. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
                    else:
                        err_msg = "Invalid OTP code. Maximum attempts reached; please request a new OTP."
                else:
                    verification_token = f"vtok-{secrets.token_urlsafe(32)}"
                    cursor.execute('''
                        UPDATE email_otps
                        SET verified_at = ?, verification_token = ?, token_expires_at = ?
                        WHERE id = ?
                    ''', (now_str, verification_token, tok_exp_str, rec['id']))

    if err_msg:
        raise ValueError(err_msg)

    return {
        'verified': True,
        'email': clean_email,
        'purpose': clean_purpose,
        'verification_token': verification_token,
        'expires_in_seconds': safe_token_ttl
    }

def validate_otp_verification_token(email: str, purpose: str, verification_token: str) -> bool:
    clean_email = (email or '').strip().lower()
    if not validate_email_format(clean_email):
        raise ValueError("Invalid email address format.")
    clean_purpose = _normalize_otp_purpose(purpose)
    clean_tok = (verification_token or '').strip()
    if not clean_tok:
        raise ValueError("Email OTP verification is required before continuing.")

    now_str = _utc_now_str()
    err_msg: Optional[str] = None

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM email_otps WHERE verification_token = ? LIMIT 1",
            (clean_tok,)
        )
        row = cursor.fetchone()
        if not row:
            err_msg = "Email verification token is invalid or missing. Please verify your email with a new OTP."
        else:
            rec = dict(row)
            if rec['email'].strip().lower() != clean_email:
                err_msg = "Verified OTP email does not match the submitted email address."
            elif rec['purpose'] != clean_purpose:
                err_msg = "OTP verification token was issued for a different action."
            elif not rec.get('verified_at'):
                err_msg = "OTP has not been verified yet."
            elif rec.get('token_consumed_at'):
                err_msg = "This OTP verification has already been used. Please request a fresh OTP."
            elif not rec.get('token_expires_at') or rec['token_expires_at'] < now_str:
                err_msg = "Email verification expired. Please request and verify a new OTP."

    if err_msg:
        raise ValueError(err_msg)
    return True

def consume_otp_verification_token(email: str, purpose: str, verification_token: str) -> bool:
    clean_email = (email or '').strip().lower()
    clean_purpose = _normalize_otp_purpose(purpose)
    clean_tok = (verification_token or '').strip()
    if not clean_tok:
        raise ValueError("Email verification token is missing.")

    now_str = _utc_now_str()
    validate_otp_verification_token(clean_email, clean_purpose, clean_tok)

    consumed = False
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE email_otps
            SET token_consumed_at = ?
            WHERE verification_token = ?
              AND LOWER(email) = ?
              AND purpose = ?
              AND verified_at IS NOT NULL
              AND token_consumed_at IS NULL
              AND token_expires_at >= ?
        ''', (now_str, clean_tok, clean_email, clean_purpose, now_str))
        consumed = cursor.rowcount == 1

    if not consumed:
        raise ValueError("Email verification token has expired or already been used. Please request a fresh OTP.")
    return True

def reset_password_with_otp(
    email: str,
    new_password: str,
    otp_code: Optional[str] = None,
    verification_token: Optional[str] = None
) -> Dict[str, Any]:
    clean_email = (email or '').strip().lower()
    if not validate_email_format(clean_email):
        raise ValueError("Invalid email address format.")

    is_strong, msg = validate_password_strength(new_password or '')
    if not is_strong:
        raise ValueError(msg)

    clean_tok = (verification_token or '').strip()
    clean_otp = (otp_code or '').strip()
    if not clean_tok and not clean_otp:
        raise ValueError("Please enter the 6-digit OTP sent to your email.")

    profile = get_user_by_email(clean_email)
    if not profile:
        if clean_tok:
            validate_otp_verification_token(clean_email, 'forgot_password', clean_tok)
        else:
            verify_email_otp(clean_email, 'forgot_password', clean_otp)
        raise ValueError("Account not found for this email address.")

    if clean_tok:
        validate_otp_verification_token(clean_email, 'forgot_password', clean_tok)
        consume_otp_verification_token(clean_email, 'forgot_password', clean_tok)
    else:
        verified = verify_email_otp(clean_email, 'forgot_password', clean_otp)
        consume_otp_verification_token(clean_email, 'forgot_password', verified['verification_token'])

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    pwd_hash, salt = _hash_password(new_password.strip())
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE profiles
            SET password_hash = ?, salt = ?, updated_at = ?
            WHERE id = ?
        ''', (pwd_hash, salt, now_str, profile['id']))
        cursor.execute(
            "DELETE FROM user_sessions WHERE user_id = ?",
            (profile['id'],)
        )

    checkpoint_db('PASSIVE')
    return {
        'success': True,
        'email': clean_email,
        'role': profile.get('role', 'applicant')
    }

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
        cursor.execute("SELECT id FROM profiles WHERE LOWER(email) = ?", (email,))
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

    checkpoint_db('PASSIVE')
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
                token = data.get('access_token') or f"sb-session-{uuid.uuid4().hex}"
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
                    user_id = local_profile.get('id', user_id)

                _persist_session(token, str(user_id), role)
                return {
                    'success': True,
                    'token': token,
                    'user': {
                        'id': user_id,
                        'email': email,
                        'full_name': full_name,
                        'phone': phone,
                        'role': role,
                        'is_verified_officer': (role == 'officer')
                    }
                }
        except Exception:
            pass

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE LOWER(email) = ?", (email,))
        row = cursor.fetchone()

        if not row:
            return {'success': False, 'error': 'Account not found. Please register or check your email.'}

        record = dict(row)
        if not _verify_password(password, record['password_hash'], record['salt']):
            return {'success': False, 'error': 'Invalid password. Please try again.'}

        session_token = f"local-session-{uuid.uuid4().hex}"
    _persist_session(session_token, record['id'], record['role'])
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
        cursor.execute("SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE LOWER(email) = ?", (email.strip().lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_user_profile(user_id: str, full_name: str, email: str) -> Dict[str, Any]:
    clean_uid = str(user_id or '').strip()
    clean_name = (full_name or '').strip()
    clean_email = (email or '').strip().lower()

    if not clean_uid:
        raise ValueError("User identifier is required.")
    if len(clean_name) < 2:
        raise ValueError("Full Name must be at least 2 characters.")
    if not validate_email_format(clean_email):
        raise ValueError("Please enter a valid email address.")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    apps_updated = 0

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE id = ?",
            (clean_uid,)
        )
        existing_row = cursor.fetchone()
        if not existing_row:
            raise ValueError("NOT_FOUND:User profile not found.")
        existing = dict(existing_row)
        old_email = str(existing.get('email') or '').strip().lower()
        user_role = str(existing.get('role') or 'applicant').strip().lower()

        cursor.execute(
            "SELECT id FROM profiles WHERE LOWER(email) = ? AND id != ?",
            (clean_email, clean_uid)
        )
        if cursor.fetchone():
            raise ValueError(f"DUPLICATE_EMAIL:An account with email '{clean_email}' already exists.")

        cursor.execute('''
            UPDATE profiles
            SET full_name = ?, email = ?, updated_at = ?
            WHERE id = ?
        ''', (clean_name, clean_email, now_str, clean_uid))

        if old_email != clean_email:
            if user_role == 'applicant' and old_email:
                cursor.execute('''
                    UPDATE loan_applications
                    SET applicant_email = ?, updated_at = ?
                    WHERE user_id = ?
                       OR applicant_id = ?
                       OR ((user_id IS NULL OR user_id = '') AND LOWER(applicant_email) = ?)
                ''', (clean_email, now_str, clean_uid, clean_uid, old_email))
            else:
                cursor.execute('''
                    UPDATE loan_applications
                    SET applicant_email = ?, updated_at = ?
                    WHERE user_id = ? OR applicant_id = ?
                ''', (clean_email, now_str, clean_uid, clean_uid))
            apps_updated = cursor.rowcount or 0

        cursor.execute(
            "SELECT id, full_name, email, phone, role, is_verified_officer, created_at FROM profiles WHERE id = ?",
            (clean_uid,)
        )
        updated_row = dict(cursor.fetchone())

    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            sb_client.update('profiles', {'full_name': clean_name, 'email': clean_email}, 'id', clean_uid)
            if old_email != clean_email:
                sb_client.update('loan_applications', {'applicant_email': clean_email, 'updated_at': now_str}, 'user_id', clean_uid)
        except Exception:
            pass

    checkpoint_db('PASSIVE')
    if apps_updated > 0:
        sync_csv_export()

    return {
        'id': updated_row['id'],
        'full_name': updated_row['full_name'],
        'email': updated_row['email'],
        'phone': updated_row.get('phone', ''),
        'role': updated_row['role'],
        'is_verified_officer': bool(updated_row.get('is_verified_officer', 0)),
        'created_at': updated_row.get('created_at')
    }

def sync_csv_export():
    try:
        apps = get_all_applications(role='officer')
        with open(EXPORT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Application No', 'Submission Date', 'Updated At', 'Full Name', 'Email', 'Phone', 'Gender',
                'Marital Status', 'Dependents', 'Education', 'Employment Type', 'Salary Slip Available',
                'Monthly Income (INR)', 'Co-Applicant Income (INR)', 'Loan Amount (INR)',
                'Tenure (Months)', 'CIBIL Score', 'Property Area', 'Approval Score (%)',
                'Status', 'Officer Status', 'Officer Remarks', 'Estimated EMI (INR)', 'DTI (%)', 'Explanation Summary'
            ])
            for r in apps:
                writer.writerow([
                    r.get('application_no'), r.get('created_at'), r.get('updated_at'), r.get('full_name'),
                    r.get('applicant_email', ''), r.get('phone'),
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

def _generate_unique_application_no() -> str:
    current_year = datetime.datetime.now().year
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        for _ in range(25):
            candidate = f"MB-{current_year}-{random.randint(1000, 9999)}"
            cursor.execute("SELECT 1 FROM loan_applications WHERE application_no = ?", (candidate,))
            if not cursor.fetchone():
                return candidate
    return f"MB-{current_year}-{uuid.uuid4().hex[:6].upper()}"

def _parse_loan_amount_inr(
    data: Dict[str, Any],
    prediction_result: Optional[Dict[str, Any]] = None,
    fallback: float = 150000.0
) -> float:
    unit = str(data.get('loan_amount_unit') or '').strip().lower()
    raw = data.get('loan_amount')
    if raw not in (None, ''):
        try:
            val = float(str(raw).replace(',', '').replace('₹', '').replace('Rs.', '').replace('Rs', '').strip())
            if unit in ('k', 'thousands') and val <= 1000.0:
                return round(val * 1000.0, 2)
            if val > 0:
                return round(val, 2)
        except (TypeError, ValueError):
            pass
    if prediction_result and prediction_result.get('requested_loan_inr') not in (None, ''):
        try:
            pred_val = float(prediction_result['requested_loan_inr'])
            if pred_val > 0:
                return round(pred_val, 2)
        except (TypeError, ValueError):
            pass
    return float(fallback)

def save_application(applicant_data: Dict[str, Any], prediction_result: Dict[str, Any],
                     explanation_result: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    app_no = _generate_unique_application_no()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    resolved_email = (
        applicant_data.get('applicant_email')
        or applicant_data.get('email')
        or ''
    ).strip().lower()
    if not resolved_email and user_id:
        profile = get_user_profile(str(user_id))
        if profile and profile.get('email'):
            resolved_email = str(profile['email']).strip().lower()

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
        'applicant_email': resolved_email,
        'application_no': app_no,
        'created_at': now_str,
        'updated_at': now_str,
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
        'loan_amount': _parse_loan_amount_inr(applicant_data, prediction_result, fallback=150000.0),
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
        'officer_notes': 'Submitted via Mission Bharat Digital Portal',
        'email_otp_verified': 1 if applicant_data.get('email_otp_verified') else 0
    }

    sb_client = get_supabase_client()
    new_record: Optional[Dict[str, Any]] = None

    if sb_client.is_configured():
        try:
            sb_record = {k: v for k, v in record_dict.items() if k != 'email_otp_verified'}
            res = sb_client.insert('loan_applications', sb_record)
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
                applicant_id, user_id, applicant_email, application_no, created_at, updated_at, full_name, phone, gender,
                marital_status, dependents, education, employment_type, salary_slip,
                applicant_income, coapplicant_income, loan_amount, loan_term_months,
                cibil_score, credit_history, property_area, loan_purpose,
                approval_likelihood, status, monthly_emi, dti_percent,
                explanation_summary, positive_factors_json, risk_factors_json,
                recommendations_json, officer_status, officer_remarks, officer_notes,
                email_otp_verified
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            record_dict.get('applicant_id'), record_dict.get('user_id'), record_dict.get('applicant_email'),
            record_dict['application_no'], record_dict['created_at'], record_dict['updated_at'],
            record_dict['full_name'], record_dict['phone'],
            record_dict['gender'], record_dict['marital_status'], record_dict['dependents'], record_dict['education'],
            record_dict['employment_type'], record_dict['salary_slip'], record_dict['applicant_income'],
            record_dict['coapplicant_income'], record_dict['loan_amount'], record_dict['loan_term_months'],
            record_dict['cibil_score'], record_dict['credit_history'], record_dict['property_area'],
            record_dict['loan_purpose'], record_dict['approval_likelihood'], record_dict['status'],
            record_dict['monthly_emi'], record_dict['dti_percent'], record_dict['explanation_summary'],
            record_dict['positive_factors_json'], record_dict['risk_factors_json'],
            record_dict['recommendations_json'], record_dict['officer_status'], record_dict['officer_remarks'],
            record_dict['officer_notes'], record_dict['email_otp_verified']
        ))
        record_id = cursor.lastrowid
        record_dict['id'] = record_id

    checkpoint_db('PASSIVE')
    sync_csv_export()
    return new_record or record_dict

def update_application_details(
    application_no: str,
    updated_fields: Dict[str, Any],
    prediction_result: Dict[str, Any],
    explanation_result: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    existing = get_application_by_number(application_no)
    if not existing:
        return None

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cibil = int(updated_fields.get('cibil_score', existing.get('cibil_score', 750)))
    credit_hist = 1 if cibil >= 650 else 0
    salary_slip = str(updated_fields.get('salary_slip', existing.get('salary_slip', 'Yes'))).capitalize()
    term_months = int(
        updated_fields.get('loan_term_months')
        or updated_fields.get('term')
        or existing.get('loan_term_months', 60)
    )
    if term_months <= 0:
        term_months = 60

    pos_factors = [f"{p['factor']}: {p['details']}" for p in explanation_result.get('positive_factors', [])]
    neg_factors = [f"{n['factor']}: {n['details']}" for n in explanation_result.get('negative_factors', [])]
    recs = explanation_result.get('recommendations', [])

    update_payload: Dict[str, Any] = {
        'updated_at': now_str,
        'applicant_income': float(updated_fields.get('applicant_income', existing.get('applicant_income', 0))),
        'coapplicant_income': float(updated_fields.get('coapplicant_income', existing.get('coapplicant_income', 0))),
        'loan_amount': _parse_loan_amount_inr(updated_fields, fallback=float(existing.get('loan_amount') or 150000.0)),
        'loan_term_months': term_months,
        'cibil_score': cibil,
        'credit_history': credit_hist,
        'salary_slip': salary_slip,
        'property_area': str(updated_fields.get('property_area') or existing.get('property_area', 'Rural')),
        'employment_type': str(updated_fields.get('employment_type') or existing.get('employment_type', 'Salaried')),
        'loan_purpose': str(updated_fields.get('loan_purpose') or existing.get('loan_purpose', 'Home Improvement')),
        'approval_likelihood': int(prediction_result.get('approval_likelihood', existing.get('approval_likelihood', 50))),
        'status': str(prediction_result.get('status', existing.get('status', 'Conditional'))),
        'monthly_emi': float(prediction_result.get('monthly_emi', existing.get('monthly_emi', 0))),
        'dti_percent': float(prediction_result.get('dti_percent', existing.get('dti_percent', 0))),
        'explanation_summary': explanation_result.get('verdict_summary', ''),
        'positive_factors_json': json.dumps(pos_factors),
        'risk_factors_json': json.dumps(neg_factors),
        'recommendations_json': json.dumps(recs)
    }

    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            sb_client.update('loan_applications', update_payload, 'application_no', application_no)
        except Exception:
            pass

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE loan_applications
            SET updated_at = ?,
                applicant_income = ?,
                coapplicant_income = ?,
                loan_amount = ?,
                loan_term_months = ?,
                cibil_score = ?,
                credit_history = ?,
                salary_slip = ?,
                property_area = ?,
                employment_type = ?,
                loan_purpose = ?,
                approval_likelihood = ?,
                status = ?,
                monthly_emi = ?,
                dti_percent = ?,
                explanation_summary = ?,
                positive_factors_json = ?,
                risk_factors_json = ?,
                recommendations_json = ?
            WHERE application_no = ?
        ''', (
            update_payload['updated_at'],
            update_payload['applicant_income'],
            update_payload['coapplicant_income'],
            update_payload['loan_amount'],
            update_payload['loan_term_months'],
            update_payload['cibil_score'],
            update_payload['credit_history'],
            update_payload['salary_slip'],
            update_payload['property_area'],
            update_payload['employment_type'],
            update_payload['loan_purpose'],
            update_payload['approval_likelihood'],
            update_payload['status'],
            update_payload['monthly_emi'],
            update_payload['dti_percent'],
            update_payload['explanation_summary'],
            update_payload['positive_factors_json'],
            update_payload['risk_factors_json'],
            update_payload['recommendations_json'],
            application_no
        ))

    checkpoint_db('PASSIVE')
    sync_csv_export()
    return get_application_by_number(application_no)

def get_all_applications(user_id: Optional[str] = None, role: str = 'officer', user_email: Optional[str] = None) -> List[Dict[str, Any]]:
    is_applicant = (str(role).strip().lower() == 'applicant')
    clean_uid = str(user_id).strip() if user_id else ''
    clean_email = str(user_email).strip().lower() if user_email else ''
    if is_applicant and clean_uid and not clean_email:
        prof = get_user_profile(clean_uid)
        if prof and prof.get('email'):
            clean_email = str(prof['email']).strip().lower()

    if is_applicant and not clean_uid and not clean_email:
        return []

    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            if is_applicant and clean_uid:
                params = f"select=*&or=(user_id.eq.{clean_uid},applicant_id.eq.{clean_uid})&order=id.desc"
            else:
                params = "select=*&order=id.desc"

            res = sb_client.select('loan_applications', params)
            if res.get('success') and isinstance(res.get('data'), list):
                apps = res.get('data')
                if is_applicant:
                    filtered = []
                    for a in apps:
                        uid_m = clean_uid and (str(a.get('user_id') or '') == clean_uid or str(a.get('applicant_id') or '') == clean_uid)
                        em_m = clean_email and str(a.get('applicant_email') or '').strip().lower() == clean_email
                        if uid_m or em_m:
                            filtered.append(a)
                    return filtered
                return apps
        except Exception:
            pass

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        if is_applicant:
            if clean_uid and clean_email:
                cursor.execute('''
                    SELECT * FROM loan_applications
                    WHERE user_id = ? OR applicant_id = ? OR LOWER(applicant_email) = ?
                    ORDER BY id DESC
                ''', (clean_uid, clean_uid, clean_email))
            elif clean_uid:
                cursor.execute('''
                    SELECT * FROM loan_applications
                    WHERE user_id = ? OR applicant_id = ?
                    ORDER BY id DESC
                ''', (clean_uid, clean_uid))
            else:
                cursor.execute('''
                    SELECT * FROM loan_applications
                    WHERE LOWER(applicant_email) = ?
                    ORDER BY id DESC
                ''', (clean_email,))
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

def add_audit_log(
    application_no: str,
    action: str,
    notes: str = '',
    remarks: str = '',
    officer_id: Optional[str] = None,
    officer_name: str = 'Loan Officer',
    officer_role: str = 'officer'
) -> Dict[str, Any]:
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = {
        'created_at': now_str,
        'officer_id': officer_id,
        'officer_name': (officer_name or 'Loan Officer').strip(),
        'officer_role': (officer_role or 'officer').strip(),
        'application_no': (application_no or 'SYSTEM').strip(),
        'action': (action or 'EVENT').strip(),
        'notes': (notes or '').strip(),
        'remarks': (remarks or notes or '').strip()
    }

    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            sb_client.insert('audit_logs', entry)
        except Exception:
            pass

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO audit_logs (created_at, officer_id, officer_name, officer_role, application_no, action, notes, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            entry['created_at'], entry['officer_id'], entry['officer_name'],
            entry['officer_role'], entry['application_no'], entry['action'],
            entry['notes'], entry['remarks']
        ))
        entry['id'] = cursor.lastrowid
    return entry

def get_audit_logs(limit: int = 100) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(500, int(limit)))
    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            res = sb_client.select('audit_logs', f"select=*&order=id.desc&limit={safe_limit}")
            if res.get('success') and isinstance(res.get('data'), list) and len(res['data']) > 0:
                return res['data']
        except Exception:
            pass

    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', (safe_limit,))
        return [dict(r) for r in cursor.fetchall()]

def update_application_status(
    application_no: str,
    new_status: str,
    officer_remarks: str = '',
    officer_id: Optional[str] = None,
    officer_name: str = 'Loan Officer'
) -> Optional[Dict[str, Any]]:
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sb_client = get_supabase_client()
    if sb_client.is_configured():
        try:
            update_payload = {
                'status': new_status,
                'officer_status': new_status,
                'officer_remarks': officer_remarks,
                'officer_notes': officer_remarks,
                'updated_at': now_str
            }
            sb_client.update('loan_applications', update_payload, 'application_no', application_no)
        except Exception:
            pass

    updated_count = 0
    with get_sqlite_conn() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE loan_applications
            SET status = ?, officer_status = ?, officer_remarks = ?, officer_notes = ?, updated_at = ?
            WHERE application_no = ?
        ''', (new_status, new_status, officer_remarks, officer_remarks, now_str, application_no))
        updated_count = cursor.rowcount

    if updated_count > 0:
        add_audit_log(
            application_no=application_no,
            action=f"Officer {new_status}",
            notes=officer_remarks or f"Decision recorded as {new_status}",
            remarks=officer_remarks,
            officer_id=officer_id,
            officer_name=officer_name,
            officer_role='officer'
        )
        checkpoint_db('PASSIVE')
        sync_csv_export()

    return get_application_by_number(application_no)

def get_full_vault_snapshot() -> Dict[str, Any]:
    apps = get_all_applications(role='officer')
    audits = get_audit_logs(limit=500)
    avail = get_site_availability()
    return {
        'exported_at': datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        'storage_backend': os.path.basename(DB_FILE),
        'total_applications': len(apps),
        'total_audit_logs': len(audits),
        'site_availability': avail,
        'applications': apps,
        'audit_logs': audits
    }

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
    updated_by: str = "Loan Officer",
    officer_id: Optional[str] = None
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

    add_audit_log(
        application_no="SYSTEM",
        action="SITE_ONLINE" if online else "SITE_OFFLINE",
        notes=f"Public portal switched {'ONLINE' if online else 'OFFLINE'} by {actor}",
        remarks=(message or '').strip() or DEFAULT_MAINTENANCE_MESSAGE,
        officer_id=officer_id,
        officer_name=actor,
        officer_role='officer'
    )
    checkpoint_db('PASSIVE')
    return get_site_availability()

init_db()
