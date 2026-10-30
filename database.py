<<<<<<< HEAD
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
=======
import sqlite3
import datetime
import os
import random
import csv
import json

DB_FILE = os.path.join(os.path.dirname(__file__), 'meridian_loans.db')
EXPORT_CSV = os.path.join(os.path.dirname(__file__), 'meridian_loan_applications_export.csv')

def get_db_connection():
    conn = sqlite3.connect(DB_FILE, timeout=15.0)
    conn.row_factory = sqlite3.Row
    return conn

def export_to_csv_file():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM loan_applications ORDER BY id DESC")
        rows = cursor.fetchall()

        with open(EXPORT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Application No', 'Submission Date', 'Full Name', 'Phone', 'Gender',
                'Marital Status', 'Dependents', 'Education', 'Employment Type', 'Salary Slip Available',
                'Monthly Income (INR)', 'Co-Applicant Income (INR)', 'Loan Amount (k)',
                'Tenure (Months)', 'CIBIL Score', 'Property Area', 'AI Approval Score (%)',
                'Status', 'Estimated EMI (INR)', 'DTI (%)', 'Explanation Summary', 'Officer Notes'
            ])
            for r in rows:
                slip_val = str(r['salary_slip'] or 'Yes') if 'salary_slip' in r.keys() else 'Yes'
                writer.writerow([
                    r['application_no'], r['created_at'], r['full_name'], r['phone'],
                    r['gender'], r['marital_status'], r['dependents'], r['education'],
                    r['employment_type'], slip_val,
                    r['applicant_income'], r['coapplicant_income'],
                    r['loan_amount'], r['loan_term_months'], r['cibil_score'],
                    r['property_area'], r['approval_likelihood'], r['status'],
                    r['monthly_emi'], r['dti_percent'], r['explanation_summary'],
                    r['officer_notes']
                ])
        conn.close()
    except Exception as e:
        print(f"[WARN] Failed to auto-sync CSV export: {e}")

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS loan_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            officer_notes TEXT
        )
    ''')

    cursor.execute("PRAGMA table_info(loan_applications)")
    cols = [col['name'] for col in cursor.fetchall()]
    if 'salary_slip' not in cols:
        try:
            cursor.execute("ALTER TABLE loan_applications ADD COLUMN salary_slip TEXT DEFAULT 'Yes'")
            conn.commit()
        except Exception:
            pass

    cursor.execute('SELECT COUNT(*) as count FROM loan_applications')
    count = cursor.fetchone()['count']

    if count == 0:
        initial_samples = [
            (
                'MB-2026-1001',
                '2026-10-28 14:30:00',
                'Ananya Rao',
                '9876543210',
                'Female',
                'No',
                '0',
                'Graduate',
                'Fintech Product Lead (Salaried Tech)',
                'Yes',
                95000,
                0,
                350,
                84,
                810,
                1,
                'Urban',
                'Home Renovation & Green Energy',
                98,
                'Approved',
                4167,
                4.4,
                'Outstanding financial profile with prime CIBIL track record and verified salary slip.',
                '["High Credit Trust (Prime CIBIL 810)", "Comfortable Debt-to-Income (4.4%)", "Verified Income Documentation (Salary Slip)"]',
                '[]',
                '["Eligible for Mission Bharat Green Energy Concession"]',
                'Pre-approved for fast-track digital disbursement'
            ),
            (
                'MB-2026-1002',
                '2026-10-28 16:15:00',
                'Devansh Kulkarni',
                '9123456780',
                'Male',
                'Yes',
                '1',
                'Graduate',
                'Freelancing / Gig Economy / Tech Freelancer',
                'No',
                75000,
                20000,
                250,
                120,
                755,
                1,
                'Semiurban',
                'Commercial Workstation & Cloud Lab',
                96,
                'Approved',
                2083,
                2.2,
                'Solid freelance earnings backed by digital cash-flow analysis under Mission Bharat gig inclusion.',
                '["Good Qualifying CIBIL Track (755)", "Joint Co-Applicant Strength", "Mission Bharat Gig Inclusivity"]',
                '[]',
                '["Proceed to instant KYC and 6-month bank statement verification"]',
                'Sanction letter generated'
            ),
            (
                'MB-2026-1003',
                '2026-10-28 18:45:00',
                'Kavya Nair',
                '9988776655',
                'Female',
                'Yes',
                '2',
                'Graduate',
                'E-Commerce & Digital MSME Founder',
                'Yes',
                48000,
                18000,
                180,
                60,
                760,
                1,
                'Rural',
                'Inventory & Fulfillment Warehouse',
                98,
                'Approved',
                3000,
                4.5,
                'Strong enterprise cash flows and prime bureau track record under Mission Bharat rural initiative.',
                '["Prime CIBIL (760)", "Comfortable EMI (4.5% DTI)", "Mission Bharat Rural Priority"]',
                '[]',
                '["Apply under Meridian Women Entrepreneur Subsidy Scheme"]',
                'Fast-track approved under Mission Bharat Women MSME category'
            ),
            (
                'MB-2026-1004',
                '2026-10-28 20:20:00',
                'Rohan Mehta',
                '9711223344',
                'Male',
                'No',
                '0',
                'Not Graduate',
                'Freelancing / Gig Economy / Tech Freelancer',
                'No',
                28000,
                0,
                400,
                24,
                580,
                0,
                'Rural',
                'Personal Equipment & Hardware',
                12,
                'Rejected',
                16667,
                59.5,
                'High repayment burden (59.5% DTI) combined with subprime credit bureau score.',
                '[]',
                '["Subprime CIBIL Score (580)", "Excessive EMI Burden (59.5% of income)"]',
                '["Increase loan tenure from 2 years to 7-10 years to reduce monthly EMI", "Clear existing overdue bureau records"]',
                'Borrower informed with detailed remediation plan'
            )
        ]

        cursor.executemany('''
            INSERT INTO loan_applications (
                application_no, created_at, full_name, phone, gender, marital_status,
                dependents, education, employment_type, salary_slip, applicant_income, coapplicant_income,
                loan_amount, loan_term_months, cibil_score, credit_history, property_area,
                loan_purpose, approval_likelihood, status, monthly_emi, dti_percent,
                explanation_summary, positive_factors_json, risk_factors_json,
                recommendations_json, officer_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', initial_samples)

    conn.commit()
    conn.close()

    export_to_csv_file()

def save_loan_application(applicant_data, prediction_result, explanation_result):
    conn = get_db_connection()
    cursor = conn.cursor()

    random_digits = random.randint(1000, 9999)
    current_year = datetime.datetime.now().year
    app_no = f"MB-{current_year}-{random_digits}"
    created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cibil = int(applicant_data.get('cibil_score', 750))
    credit_hist = 1 if cibil >= 650 else 0

    pos_json = json.dumps([f"{p['factor']}: {p['details']}" for p in explanation_result.get('positive_factors', [])])
    neg_json = json.dumps([f"{n['factor']}: {n['details']}" for n in explanation_result.get('negative_factors', [])])
    rec_json = json.dumps(explanation_result.get('recommendations', []))

    term_months = int(applicant_data.get('loan_term_months', 0) or applicant_data.get('term', 0) or 60)
    if term_months <= 0:
        years = int(applicant_data.get('loan_term_years', 5))
        term_months = years * 12

    salary_slip = str(applicant_data.get('salary_slip', 'Yes')).capitalize()

    cursor.execute('''
        INSERT INTO loan_applications (
            application_no, created_at, full_name, phone, gender, marital_status,
            dependents, education, employment_type, salary_slip, applicant_income, coapplicant_income,
            loan_amount, loan_term_months, cibil_score, credit_history, property_area,
            loan_purpose, approval_likelihood, status, monthly_emi, dti_percent,
            explanation_summary, positive_factors_json, risk_factors_json,
            recommendations_json, officer_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        app_no,
        created_at,
        applicant_data.get('full_name', 'Applicant'),
        applicant_data.get('phone', ''),
        applicant_data.get('gender', 'Male'),
        applicant_data.get('marital_status', 'Yes'),
        str(applicant_data.get('dependents', '0')),
        applicant_data.get('education', 'Graduate'),
        applicant_data.get('employment_type', 'Salaried'),
        salary_slip,
        float(applicant_data.get('applicant_income', 0)),
        float(applicant_data.get('coapplicant_income', 0)),
        float(applicant_data.get('loan_amount', 100)),
        term_months,
        cibil,
        credit_hist,
        applicant_data.get('property_area', 'Rural'),
        applicant_data.get('loan_purpose', 'Home Improvement'),
        int(prediction_result.get('approval_likelihood', 50)),
        prediction_result.get('status', 'Conditional'),
        float(prediction_result.get('monthly_emi', 0)),
        float(prediction_result.get('dti_percent', 0)),
        explanation_result.get('verdict_summary', ''),
        pos_json,
        neg_json,
        rec_json,
        'Submitted online via Mission Bharat portal'
    ))

    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    export_to_csv_file()

    return {
        'id': new_id,
        'application_no': app_no,
        'created_at': created_at,
        'full_name': applicant_data.get('full_name'),
        'cibil_score': cibil,
        'salary_slip': salary_slip,
        'status': prediction_result.get('status'),
        'approval_likelihood': prediction_result.get('approval_likelihood'),
        'monthly_emi': prediction_result.get('monthly_emi'),
        'dti_percent': prediction_result.get('dti_percent'),
        'loan_amount': applicant_data.get('loan_amount'),
        'loan_term_months': term_months,
        'property_area': applicant_data.get('property_area'),
        'loan_purpose': applicant_data.get('loan_purpose'),
        'explanation_summary': explanation_result.get('verdict_summary')
    }

def update_application_status(app_no, new_status, officer_note=''):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE loan_applications
        SET status = ?, officer_notes = ?
        WHERE application_no = ?
    ''', (new_status, officer_note, app_no))
    conn.commit()
    conn.close()

    export_to_csv_file()
    return get_application_by_number(app_no)

def get_all_saved_applications():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM loan_applications ORDER BY id DESC')
    rows = cursor.fetchall()

    apps = []
    for r in rows:
        d = dict(r)
        try:
            d['positive_factors'] = json.loads(d.get('positive_factors_json') or '[]')
            d['negative_factors'] = json.loads(d.get('risk_factors_json') or '[]')
            d['recommendations'] = json.loads(d.get('recommendations_json') or '[]')
        except Exception:
            pass
        apps.append(d)

    conn.close()
    return apps

def get_application_by_number(application_no):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM loan_applications WHERE application_no = ?', (application_no,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

init_db()
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
