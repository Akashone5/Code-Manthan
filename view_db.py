"""
Meridian Financial Services - Mission Bharat
Database Viewer & Excel/CSV Exporter
"""
import os
import sys
import sqlite3
import csv

DB_PATH = os.path.join(os.path.dirname(__file__), 'meridian_loans.db')
EXPORT_CSV = os.path.join(os.path.dirname(__file__), 'meridian_loan_applications_export.csv')

def view_and_export():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database file not found at: {DB_PATH}")
        return

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

    print("=" * 96)
    print("  MERIDIAN FINANCIAL SERVICES - MISSION BHARAT")
    print("  CENTRAL LOAN APPLICATION DATABASE & REGISTRY")
    print("=" * 96)
    print(f"Total Applications in Vault: {len(rows)}\n")

    header = f"{'App No':<15} | {'Applicant Name':<18} | {'CIBIL':<6} | {'Amount':<11} | {'Tenure':<8} | {'Score':<6} | {'Status':<12}"
    print(header)
    print("-" * len(header))

    for r in rows:
        app_no = r['application_no'] or ''
        name = (r['full_name'] or 'Applicant')[:18]
        cibil = str(r['cibil_score'] or '')
        loan_k = float(r['loan_amount'] or 0)
        amt = f"Rs.{int(loan_k * 1000):,}" if loan_k <= 1000 else f"Rs.{int(loan_k):,}"
        months = int(r['loan_term_months'] or 60)
        tenure = f"{months // 12} yrs" if months % 12 == 0 else f"{months} mos"
        score = f"{r['approval_likelihood']}%"
        status = r['status'] or ''
        print(f"{app_no:<15} | {name:<18} | {cibil:<6} | {amt:<11} | {tenure:<8} | {score:<6} | {status:<12}")

    # Export to CSV for Excel / Google Sheets
    with open(EXPORT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'Application No', 'Submission Date', 'Full Name', 'Phone', 'Gender',
            'Marital Status', 'Dependents', 'Education', 'Employment Type',
            'Monthly Income (INR)', 'Co-Applicant Income (INR)', 'Loan Amount (k)',
            'Tenure (Months)', 'CIBIL Score', 'Property Area', 'AI Approval Score (%)',
            'Status', 'Estimated EMI (INR)', 'DTI (%)', 'Explanation Summary', 'Officer Notes'
        ])
        for r in rows:
            writer.writerow([
                r['application_no'], r['created_at'], r['full_name'], r['phone'],
                r['gender'], r['marital_status'], r['dependents'], r['education'],
                r['employment_type'], r['applicant_income'], r['coapplicant_income'],
                r['loan_amount'], r['loan_term_months'], r['cibil_score'],
                r['property_area'], r['approval_likelihood'], r['status'],
                r['monthly_emi'], r['dti_percent'], r['explanation_summary'],
                r['officer_notes']
            ])

    conn.close()
    print("-" * len(header))
    print(f"\n[OK] Excel/CSV File Created: {EXPORT_CSV}")
    print("Direct Laptop Access: Double-click 'meridian_loan_applications_export.csv' to open in Microsoft Excel or Google Sheets!")

if __name__ == '__main__':
    view_and_export()
