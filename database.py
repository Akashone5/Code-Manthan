"""
=============================================================================
MERIDIAN - MISSION BHARAT
Central Loan Application Vault (Database Engine)
=============================================================================

Secure persistent storage for all loan applications.
Records applicant details, financial metrics, CIBIL scores, and AI decisions.
=============================================================================
"""

import sqlite3
import os
import random
import datetime

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'meridian_loans.db')


def get_db_connection():
    """Returns a connection to the SQLite database with dictionary row access and timeout."""
    conn = sqlite3.connect(DB_FILE, timeout=15.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes the database schema and pre-populates initial records if empty."""
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

    cursor.execute('SELECT COUNT(*) as count FROM loan_applications')
    count = cursor.fetchone()['count']

    # If empty or only old dummy data, seed fresh modern tech/normal records
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
                95000,
                0,
                350,
                84, # 7 years
                810,
                1,
                'Urban',
                'Home Renovation & Green Energy',
                98,
                'Approved',
                4167,
                4.4,
                'Outstanding financial profile with prime CIBIL track record and robust income coverage.',
                '["High Credit Trust (Prime CIBIL 810)", "Comfortable Debt-to-Income (4.4%)"]',
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
                'Cloud Infrastructure Consultant (Self-Employed)',
                65000,
                25000,
                250,
                120, # 10 years
                740,
                1,
                'Semiurban',
                'Commercial Workstation & Cloud Lab',
                96,
                'Approved',
                2083,
                2.3,
                'Solid multi-stream income with co-applicant stability and qualifying bureau score.',
                '["Good Qualifying CIBIL Track (740)", "Joint Co-Applicant Strength", "Semi-Urban Priority"]',
                '[]',
                '["Proceed to instant KYC verification"]',
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
                48000,
                18000,
                180,
                60, # 5 years
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
                'Junior Web Developer (Contract Freelance)',
                28000,
                0,
                400,
                24, # 2 years
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
                dependents, education, employment_type, applicant_income, coapplicant_income,
                loan_amount, loan_term_months, cibil_score, credit_history, property_area,
                loan_purpose, approval_likelihood, status, monthly_emi, dti_percent,
                explanation_summary, positive_factors_json, risk_factors_json,
                recommendations_json, officer_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', initial_samples)

    conn.commit()
    conn.close()


def save_loan_application(applicant_data, prediction_result, explanation_result):
    """
    Saves a completed loan application form into the database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    random_digits = random.randint(1000, 9999)
    current_year = datetime.datetime.now().year
    app_no = f"MB-{current_year}-{random_digits}"
    created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cibil = int(applicant_data.get('cibil_score', 750))
    credit_hist = 1 if cibil >= 650 else 0

    import json
    pos_json = json.dumps([f"{p['factor']}: {p['details']}" for p in explanation_result.get('positive_factors', [])])
    neg_json = json.dumps([f"{n['factor']}: {n['details']}" for n in explanation_result.get('negative_factors', [])])
    rec_json = json.dumps(explanation_result.get('recommendations', []))

    # Support flexible term: could be 'loan_term_months' or 'term' or 'loan_term_years' * 12
    term_months = int(applicant_data.get('loan_term_months', 0) or applicant_data.get('term', 0) or 60)
    if term_months <= 0:
        years = int(applicant_data.get('loan_term_years', 5))
        term_months = years * 12

    cursor.execute('''
        INSERT INTO loan_applications (
            application_no, created_at, full_name, phone, gender, marital_status,
            dependents, education, employment_type, applicant_income, coapplicant_income,
            loan_amount, loan_term_months, cibil_score, credit_history, property_area,
            loan_purpose, approval_likelihood, status, monthly_emi, dti_percent,
            explanation_summary, positive_factors_json, risk_factors_json,
            recommendations_json, officer_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    return {
        'id': new_id,
        'application_no': app_no,
        'created_at': created_at,
        'full_name': applicant_data.get('full_name'),
        'cibil_score': cibil,
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


def get_all_saved_applications():
    """Retrieves all submitted applications."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM loan_applications ORDER BY id DESC')
    rows = cursor.fetchall()
    
    import json
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
    """Retrieves a single application by reference number."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM loan_applications WHERE application_no = ?', (application_no,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


init_db()
