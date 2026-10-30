<<<<<<< HEAD
"""
Meridian Database Viewer & Audit Exporter
Interactive terminal utility to inspect loan records and synchronize the Excel/CSV audit mirror.
"""
=======
import os
import sys
import sqlite3
import csv
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a

import os
from src.database.database_operations import get_all_applications, sync_csv_export, EXPORT_CSV

def view_and_export():
    rows = get_all_applications()

<<<<<<< HEAD
    print("=" * 105)
    print("  MERIDIAN FAIRLEND - MISSION BHARAT")
=======
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM loan_applications ORDER BY id DESC")
        rows = cursor.fetchall()
    except Exception as e:
        print(f"[ERROR] Failed to query database: {e}")
        conn.close()
        return

    print("=" * 105)
    print("  MERIDIAN FAIRLEND AI - MISSION BHARAT")
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
    print("  CENTRAL LOAN APPLICATION DATABASE & REGISTRY")
    print("=" * 105)
    print(f"Total Applications in Vault: {len(rows)}\n")

    header = f"{'App No':<14} | {'Applicant Name':<18} | {'CIBIL':<6} | {'Pay Slip':<8} | {'Amount':<11} | {'Tenure':<8} | {'Score':<6} | {'Status':<11}"
    print(header)
    print("-" * len(header))

    for r in rows:
<<<<<<< HEAD
        app_no = r.get('application_no') or ''
        name = (r.get('full_name') or 'Applicant')[:18]
        cibil = str(r.get('cibil_score') or '')
        slip = str(r.get('salary_slip') or 'Yes')
        loan_k = float(r.get('loan_amount') or 0)
=======
        app_no = r['application_no'] or ''
        name = (r['full_name'] or 'Applicant')[:18]
        cibil = str(r['cibil_score'] or '')
        slip = str(r['salary_slip'] or 'Yes') if 'salary_slip' in r.keys() else 'Yes'
        loan_k = float(r['loan_amount'] or 0)
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
        amt = f"Rs.{int(loan_k * 1000):,}" if loan_k <= 1000 else f"Rs.{int(loan_k):,}"
        months = int(r.get('loan_term_months') or 60)
        tenure = f"{months // 12} yrs" if months % 12 == 0 else f"{months} mos"
<<<<<<< HEAD
        score = f"{r.get('approval_likelihood')}%"
        status = r.get('status') or ''
        print(f"{app_no:<14} | {name:<18} | {cibil:<6} | {slip:<8} | {amt:<11} | {tenure:<8} | {score:<6} | {status:<11}")

    sync_csv_export()
    print("-" * len(header))
    print(f"\n[OK] Excel/CSV File Updated: {EXPORT_CSV}")
    print("Direct Access: Open 'meridian_loan_applications_export.csv' in Microsoft Excel or Google Sheets.")
=======
        score = f"{r['approval_likelihood']}%"
        status = r['status'] or ''
        print(f"{app_no:<14} | {name:<18} | {cibil:<6} | {slip:<8} | {amt:<11} | {tenure:<8} | {score:<6} | {status:<11}")

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
    print("-" * len(header))
    print(f"\n[OK] Excel/CSV File Updated: {EXPORT_CSV}")
    print("Direct Laptop Access: Double-click 'meridian_loan_applications_export.csv' to open in Microsoft Excel or Google Sheets!")
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a

if __name__ == '__main__':
    view_and_export()
