"""
Meridian FairLend - Streamlit Web Application
Mission Bharat • Retail Credit Underwriting & Algorithmic Equity Platform
Features Supabase Authentication, Row Level Security, Explainability (XAI), and Fairness Auditing.
"""

import os
import json
try:
    import pandas as pd
    import streamlit as st
except ImportError as _imp_err:
    print(f"[NOTE] Streamlit interface requires: pip install streamlit pandas")
    print(f"       Missing package: {_imp_err}")
    pd = None
    st = None

from src.preprocess import normalize_applicant
from src.train import predict_loan
from src.explain import explain_decision
from src.fairness import check_fairness
from backend import load_sample_dataset, simulate_what_if
from src.database.supabase_client import get_supabase_client
from src.database.database_operations import (
    save_application,
    get_all_applications,
    update_application_status,
    create_user_profile,
    authenticate_user
)

# Page configuration
if st is None:
    import sys
    sys.exit(0)

st.set_page_config(
    page_title="Explainable Loan Decision System - Meridian FairLend",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize Session State
if 'user' not in st.session_state:
    st.session_state.user = None
if 'user_token' not in st.session_state:
    st.session_state.user_token = None
if 'current_app' not in st.session_state:
    st.session_state.current_app = None
if 'last_prediction' not in st.session_state:
    st.session_state.last_prediction = None
if 'last_explanation' not in st.session_state:
    st.session_state.last_explanation = None

sb_client = get_supabase_client()

# ============================================================================
# 1. AUTHENTICATION LANDING SCREEN (If User Not Authenticated)
# ============================================================================
if not st.session_state.user:
    st.markdown("""
    <style>
    /* Match inner website theme */
    .stApp {
        background-color: #F7F3EB;
    }
    div[data-testid="stVerticalBlockBorderWrapper"] {
        background-color: #FFFFFF;
        border: 1.5px solid #E6DDCF !important;
        border-radius: 16px !important;
        box-shadow: 0 10px 25px -3px rgba(6, 78, 59, 0.1) !important;
    }
    button[kind="primary"] {
        background: linear-gradient(135deg, #064E3B 0%, #032C21 100%) !important;
        color: #F8E7C9 !important;
        border: 1.5px solid #F8E7C9 !important;
        border-radius: 10px !important;
        font-weight: 700 !important;
        box-shadow: 0 4px 14px rgba(6, 78, 59, 0.25) !important;
    }
    button[kind="primary"]:hover {
        background: linear-gradient(135deg, #0A6C53 0%, #064E3B 100%) !important;
        transform: translateY(-1px);
    }
    button[kind="secondary"] {
        background: #FAF3E6 !important;
        border: 1px solid #E8D7B8 !important;
        color: #064E3B !important;
        font-weight: 600 !important;
        border-radius: 10px !important;
    }
    button[kind="secondary"]:hover {
        background: #F8E7C9 !important;
        border-color: #064E3B !important;
    }
    </style>
    <div style="background: linear-gradient(135deg, #064E3B 0%, #032C21 100%); padding: 1.6rem 2rem; border-radius: 16px; border-bottom: 3.5px solid #F8E7C9; margin-bottom: 1.75rem; text-align: center; box-shadow: 0 4px 14px rgba(6,78,59,0.25);">
        <div style="display: inline-block; width: 44px; height: 44px; background: linear-gradient(135deg, #F8E7C9 0%, #E8CCA0 100%); border-radius: 10px; font-weight: 900; font-size: 1.45rem; color: #064E3B; line-height: 44px; box-shadow: 0 4px 12px rgba(248, 231, 201, 0.45); margin-bottom: 0.5rem;">M</div>
        <h1 style="color: #FFFFFF; font-size: 1.75rem; margin: 0; font-weight: 800; letter-spacing: -0.01em;">Explainable Loan Decision System</h1>
        <div style="margin-top: 6px;">
            <span style="background: rgba(248, 231, 201, 0.18); border: 1px solid #F8E7C9; color: #F8E7C9; font-size: 0.72rem; font-weight: 700; padding: 2px 10px; border-radius: 99px; text-transform: uppercase;">Mission Bharat Credit</span>
        </div>
        <p style="color: #F8E7C9; opacity: 0.9; margin: 0.6rem auto 0; font-size: 0.88rem; max-width: 620px;">
            AI-Powered Explainable Credit Underwriting &amp; Algorithmic Equity Platform (RBI Digital Lending Compliant)
        </p>
    </div>
    """, unsafe_allow_html=True)

    c_center = st.columns([1, 2, 1])[1]
    with c_center:
        auth_card = st.container(border=True)
        with auth_card:
            auth_mode = st.radio(
                "Access Portal",
                ["👤 Applicant Sign In", "🛡️ Loan Officer Sign In", "✨ Create Account", "❓ Forgot Password"],
                horizontal=True
            )

            # 1. APPLICANT SIGN IN
            if auth_mode == "👤 Applicant Sign In":
                st.subheader("Applicant Access Portal")
                st.caption("Access your personal credit applications, status tracking & explainability results.")
                login_email = st.text_input("Applicant Email Address", key="login_app_email", placeholder="applicant@domain.com")
                login_password = st.text_input("Password", type="password", key="login_app_password")

                if st.button("Sign In as Applicant", type="primary", use_container_width=True):
                    if login_email and login_password:
                        res = authenticate_user(login_email, login_password)
                        if res.get('success'):
                            if res['user'].get('role') == 'officer':
                                st.warning("Notice: This account has Loan Officer clearance. Please sign in using the '🛡️ Loan Officer Sign In' tab.")
                            else:
                                st.session_state.user = res['user']
                                st.session_state.user_token = res.get('token')
                                st.success("Authenticated successfully as Applicant!")
                                st.rerun()
                        else:
                            st.error(res.get('error', 'Invalid email or password.'))
                    else:
                        st.warning("Please enter your applicant email and password.")

                st.markdown("---")
                st.caption("Applicant Demo Account:")
                if st.button("👤 Quick Demo: Ananya Rao (Applicant)", use_container_width=True):
                    res = authenticate_user("applicant@meridianbank.in", "Applicant@123")
                    if res.get('success'):
                        st.session_state.user = res['user']
                        st.session_state.user_token = res.get('token')
                        st.rerun()

            # 2. LOAN OFFICER SIGN IN
            elif auth_mode == "🛡️ Loan Officer Sign In":
                st.subheader("Loan Officer Terminal")
                st.caption("Institutional access for credit underwriting, portfolio audit & algorithmic equity.")
                login_email = st.text_input("Institutional Officer Email", key="login_off_email", placeholder="officer@meridianbank.in")
                login_password = st.text_input("Officer Password", type="password", key="login_off_password")

                if st.button("Sign In as Loan Officer", type="primary", use_container_width=True):
                    if login_email and login_password:
                        res = authenticate_user(login_email, login_password)
                        if res.get('success'):
                            if res['user'].get('role') != 'officer':
                                st.error("Access Denied: This account is registered as an Applicant. Please use the '👤 Applicant Sign In' tab.")
                            else:
                                st.session_state.user = res['user']
                                st.session_state.user_token = res.get('token')
                                st.success("Clearance verified. Welcome to the Underwriting Terminal!")
                                st.rerun()
                        else:
                            st.error(res.get('error', 'Invalid officer email or password.'))
                    else:
                        st.warning("Please enter your officer email and password.")

                st.markdown("---")
                st.caption("Loan Officer Demo Account:")
                if st.button("🛡️ Quick Demo: Vikram Sharma (Lead Officer)", use_container_width=True):
                    res = authenticate_user("officer@meridianbank.in", "Officer@2026")
                    if res.get('success'):
                        st.session_state.user = res['user']
                        st.session_state.user_token = res.get('token')
                        st.rerun()

            # SIGN UP
            elif auth_mode == "✨ Create Account":
                st.subheader("Create a New Account")
                su_name = st.text_input("Full Name", placeholder="e.g. Ananya Rao")
                su_email = st.text_input("Email Address", placeholder="applicant@domain.com")
                su_phone = st.text_input("Mobile Number", placeholder="10-digit mobile number")
                su_role = st.selectbox("Account Type", ["Applicant", "Loan Officer"])

                su_officer_key = ""
                if su_role == "Loan Officer":
                    su_officer_key = st.text_input("Officer Clearance Passkey", type="password", help="Requires institutional clearance. Default: OFFICER-2026")

                su_pwd = st.text_input("Create Password", type="password", help="Minimum 8 characters with letter and number")
                su_confirm_pwd = st.text_input("Confirm Password", type="password")

                if st.button("Create Verified Account", type="primary", use_container_width=True):
                    if su_pwd != su_confirm_pwd:
                        st.error("Passwords do not match.")
                    else:
                        role_clean = 'officer' if su_role == "Loan Officer" else 'applicant'
                        try:
                            new_profile = create_user_profile(
                                full_name=su_name,
                                email=su_email,
                                phone=su_phone,
                                password=su_pwd,
                                role=role_clean,
                                officer_key=su_officer_key
                            )
                            st.success(f"Account created successfully for {new_profile['full_name']}! You can now sign in.")
                        except ValueError as ve:
                            st.error(str(ve))
                        except Exception as e:
                            st.error(f"Registration error: {e}")

            # FORGOT PASSWORD
            elif auth_mode == "❓ Forgot Password":
                st.subheader("Password Recovery")
                fp_email = st.text_input("Registered Email Address")
                if st.button("Send Recovery Instructions", use_container_width=True):
                    if fp_email:
                        st.info(f"Password recovery instructions dispatched to {fp_email}. Check your inbox.")
                    else:
                        st.warning("Please provide your email address.")

    st.stop()

# ============================================================================
# 2. AUTHENTICATED USER DASHBOARD
# ============================================================================

current_user = st.session_state.user
user_role = current_user.get('role', 'applicant')
user_name = current_user.get('full_name', current_user.get('email', 'User'))

# Sidebar User Information & Logout
with st.sidebar:
    st.markdown("### 🏛️ Meridian FairLend")
    st.caption("Explainable Loan Decision System")

    st.markdown(f"**Welcome, {user_name}**")
    role_badge = "🛡️ LOAN OFFICER" if user_role == 'officer' else "👤 APPLICANT"
    st.info(role_badge)

    conn_status, conn_msg = sb_client.test_connection()
    if conn_status:
        st.success("🟢 Cloud DB Synced", icon="✅")
    else:
        st.warning("🟡 Local Fallback Mode", icon="⚠️")

    if st.button("🚪 Log Out", use_container_width=True):
        st.session_state.user = None
        st.session_state.user_token = None
        st.rerun()

    st.markdown("---")
    st.markdown("### 🧭 Navigation")

    if user_role == 'applicant':
        menu = st.radio("Go to:", [
            "1. Apply for a Loan",
            "2. My Decision Report",
            "3. Live 'What-If' Simulator",
            "4. My Applications Vault"
        ])
    else:
        menu = st.radio("Go to:", [
            "1. Central Application Vault (All Applicants)",
            "2. Underwriting Cockpit & XAI",
            "3. Live 'What-If' Simulator",
            "4. Algorithmic Demographic Fairness",
            "5. Batch Scoring & Portfolio",
            "6. Apply on Behalf of Citizen"
        ])

# ----------------------------------------------------------------------------
# APPLICANT / INTAKE FORM
# ----------------------------------------------------------------------------
if menu in ["1. Apply for a Loan", "6. Apply on Behalf of Citizen"]:
    st.header("📝 Retail Credit Intake Application")
    st.caption("Compliant with Reserve Bank of India (RBI) Digital Lending Directives")

    with st.form("loan_application_form"):
        col1, col2, col3 = st.columns(3)
        with col1:
            full_name = st.text_input("Full Name", value=user_name if user_role == 'applicant' else "Ananya Rao")
            phone = st.text_input("Mobile Number", value=current_user.get('phone', '9876543210'))
            gender = st.selectbox("Gender", ["Female", "Male", "Other"])
            married = st.selectbox("Marital Status", ["Yes", "No"])
            dependents = st.selectbox("Dependents", ["0", "1", "2", "3+"])
        with col2:
            education = st.selectbox("Education Qualification", ["Graduate", "Not Graduate"])
            employment = st.selectbox("Employment Classification", [
                "Private Sector (Salaried)",
                "Freelancing / Gig Economy / Contractor",
                "Government / PSU Employee",
                "Self-Employed / MSME Founder",
                "Agricultural / Farmer"
            ])
            salary_slip = st.selectbox("Verifiable Salary Slip Attached?", ["Yes", "No"])
            app_income = st.number_input("Primary Monthly Income (₹)", min_value=1000, value=75000, step=5000)
            coapp_income = st.number_input("Co-Applicant Monthly Income (₹)", min_value=0, value=20000, step=5000)
        with col3:
            loan_purpose = st.selectbox("Loan Purpose", [
                "Home Improvement / Construction",
                "Commercial Workstation & Cloud Lab",
                "Small Business Working Capital",
                "Education & Upskilling",
                "Green Energy / Solar Installation"
            ])
            loan_amount_k = st.number_input("Requested Facility (₹ in Thousands, e.g. 250 = ₹2.5 Lakh)", min_value=10, value=250, step=10)
            tenure_years = st.slider("Loan Tenure (Years)", min_value=1, max_value=30, value=5)
            cibil_score = st.slider("CIBIL Bureau Credit Score", min_value=300, max_value=900, value=780)
            property_area = st.selectbox("Property Territory", ["Semiurban", "Urban", "Rural"])

        rbi_consent = st.checkbox("I hereby grant statutory consent to process this credit profile under RBI Digital Lending Guidelines.", value=True)
        submitted = st.form_submit_button("🚀 Submit Loan Application & Analyze", type="primary", use_container_width=True)

    if submitted:
        if not rbi_consent:
            st.error("Statutory consent is required before credit analysis.")
        else:
            with st.spinner("Analyzing credit parameters and saving application..."):
                app_data = {
                    'full_name': full_name,
                    'phone': phone,
                    'gender': gender,
                    'marital_status': married,
                    'dependents': dependents,
                    'education': education,
                    'employment_type': employment,
                    'salary_slip': salary_slip,
                    'applicant_income': app_income,
                    'coapplicant_income': coapp_income,
                    'loan_purpose': loan_purpose,
                    'loan_amount': loan_amount_k,
                    'loan_term_months': tenure_years * 12,
                    'cibil_score': cibil_score,
                    'property_area': property_area
                }

                pred = predict_loan(app_data)
                exp = explain_decision(app_data, pred)
                saved_rec = save_application(app_data, pred, exp, user_id=current_user.get('id'))

                st.session_state.current_app = app_data
                st.session_state.last_prediction = pred
                st.session_state.last_explanation = exp

                st.success(f"🎉 Application Recorded! Reference No: **{saved_rec['application_no']}**")
                st.balloons()

# ----------------------------------------------------------------------------
# DECISION & XAI REPORT
# ----------------------------------------------------------------------------
elif menu in ["2. My Decision Report", "2. Underwriting Cockpit & XAI"]:
    st.header("📊 Credit Decision & Factor Explainability Report")
    st.caption("Regulatory-Compliant Attribution Decomposition")

    app = st.session_state.current_app
    pred = st.session_state.last_prediction
    exp = st.session_state.last_explanation

    if not pred or not app:
        st.info("No active application evaluated in this session. Please submit an application or select one from the vault.")
    else:
        status_color = "#10B981" if pred['status'] == 'Approved' else ("#F59E0B" if pred['status'] == 'Conditional' else "#EF4444")
        st.markdown(f"""
        <div style="background-color: {status_color}; color: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
            <h2 style="color: white; margin: 0;">Decision: {pred['status'].upper()} ({pred['approval_likelihood']}% Score)</h2>
            <p style="margin: 0.5rem 0 0 0; font-size: 1.1rem;">{exp.get('verdict_summary', '')}</p>
        </div>
        """, unsafe_allow_html=True)

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Estimated EMI", f"₹{pred['monthly_emi']:,}/mo")
        m2.metric("Debt-to-Income (DTI)", f"{pred['dti_percent']}%", delta="Safe (<45%)" if pred['dti_percent'] <= 45 else "High Debt Burden")
        m3.metric("CIBIL Bureau Score", f"{pred['cibil_score']}", delta="Prime" if pred['cibil_score'] >= 750 else "Subprime")
        m4.metric("Risk Assessment Tier", pred.get('risk_tier', 'Tier 1'))

        st.markdown("---")
        col_driv, col_fric = st.columns(2)
        with col_driv:
            st.markdown("#### 🌟 Top Approval Drivers")
            for d in exp.get('positive_factors', []):
                st.success(f"**{d['factor']}** ({d.get('impact', '+Score')})\n\n{d['details']}")

        with col_fric:
            st.markdown("#### ⚠️ Key Risk Factors")
            frictions = exp.get('negative_factors', [])
            if not frictions:
                st.info("✓ No significant risk frictions identified.")
            else:
                for f in frictions:
                    st.error(f"**{f['factor']}** ({f.get('impact', '-Risk')})\n\n{f['details']}")

        if exp.get('recommendations'):
            st.markdown("#### 🎯 Personalized Remediation Roadmap")
            for idx, rec in enumerate(exp['recommendations'], 1):
                st.warning(f"**Step {idx}:** {rec}")

# ----------------------------------------------------------------------------
# LIVE WHAT-IF SIMULATOR
# ----------------------------------------------------------------------------
elif menu == "3. Live 'What-If' Simulator":
    st.header("🎛️ Counterfactual Scenario Simulator")
    st.caption("Discover what parameters you can adjust to maximize your credit approval likelihood")

    app = st.session_state.current_app or {
        'full_name': user_name,
        'applicant_income': 75000,
        'coapplicant_income': 20000,
        'loan_amount': 250,
        'loan_term_months': 60,
        'cibil_score': 780,
        'salary_slip': 'Yes',
        'property_area': 'Semiurban',
        'employment_type': 'Salaried'
    }
    base_pred = predict_loan(app)

    sc1, sc2 = st.columns([1, 2])
    with sc1:
        st.markdown("#### Adjust Parameters")
        sim_loan = st.slider("Loan Amount (₹k)", 20, 1000, int(app.get('loan_amount', 250)), step=10)
        sim_years = st.slider("Tenure (Years)", 1, 30, max(1, int(app.get('loan_term_months', 60) // 12)))
        sim_coapp = st.number_input("Co-Applicant Income (₹/mo)", 0, 200000, int(app.get('coapplicant_income', 20000)), step=5000)
        sim_cibil = st.slider("Target CIBIL Score", 300, 900, int(app.get('cibil_score', 780)))
        sim_slip = st.selectbox("Salary Slip Attached", ["Yes", "No"], index=0 if app.get('salary_slip') == 'Yes' else 1)

    sim_app = {
        **app,
        'loan_amount': sim_loan,
        'loan_term_months': sim_years * 12,
        'coapplicant_income': sim_coapp,
        'cibil_score': sim_cibil,
        'salary_slip': sim_slip
    }
    sim_pred = predict_loan(sim_app)
    delta = sim_pred['approval_likelihood'] - base_pred['approval_likelihood']

    with sc2:
        st.markdown("#### Simulation Impact")
        sm1, sm2, sm3 = st.columns(3)
        sm1.metric("Simulated Score", f"{sim_pred['approval_likelihood']}%", delta=f"{'+' if delta>0 else ''}{delta}%")
        sm2.metric("Simulated Status", f"{sim_pred['status'].upper()}")
        sm3.metric("Simulated Monthly EMI", f"₹{sim_pred['monthly_emi']:,}/mo")

        if delta > 0:
            st.success(f"✨ This combination boosts your approval likelihood by **+{delta}%**!")
        elif delta < 0:
            st.error(f"⚠️ This combination lowers your approval likelihood by **{delta}%**.")
        else:
            st.info("Parameters match the current baseline.")

# ----------------------------------------------------------------------------
# APPLICATIONS VAULT (ROLE ISOLATED)
# ----------------------------------------------------------------------------
elif menu in ["4. My Applications Vault", "1. Central Application Vault (All Applicants)"]:
    vault_title = "Central Loan Application Vault (Institution-Wide)" if user_role == 'officer' else "My Submitted Loan Applications (Vault)"
    st.header(f"🗄️ {vault_title}")
    
    if user_role == 'applicant':
        st.caption("Secure Personal Vault — Restricted strictly to your authenticated records.")
    else:
        st.caption("Credit Officer Cockpit — Review, sanction, and record regulatory compliance remarks.")

    # Role-based query filtering
    if user_role == 'applicant':
        apps = get_all_applications(user_id=current_user['id'], role='applicant')
    else:
        apps = get_all_applications(role='officer')

    st.write(f"Total Applications Visible: **{len(apps)}**")
    if apps:
        df = pd.DataFrame(apps)
        display_cols = [c for c in [
            'application_no', 'full_name', 'created_at', 'status',
            'officer_status', 'approval_likelihood', 'monthly_emi', 'dti_percent',
            'cibil_score', 'loan_amount', 'property_area', 'officer_remarks'
        ] if c in df.columns]
        st.dataframe(df[display_cols], use_container_width=True)

        st.markdown("---")
        st.subheader("📋 Application Inspection & Officer Decisioning")
        selected_app_no = st.selectbox("Select Application Reference", df['application_no'].tolist())
        selected_record = next((a for a in apps if a.get('application_no') == selected_app_no), None)

        if selected_record:
            with st.expander(f"Full Record Details: {selected_app_no}", expanded=True):
                st.json(selected_record)

            # Officer Action Controls (Restricted to Loan Officers)
            if user_role == 'officer':
                st.markdown("#### 🛡️ Officer Underwriting Actions")
                c_rem, c_act = st.columns([2, 1])
                with c_rem:
                    officer_remarks = st.text_input("Official Remarks / Compliance Justification", value=selected_record.get('officer_remarks') or "Underwriting review completed.")
                with c_act:
                    action_choice = st.selectbox("Decision Status", ["Approved", "Conditional", "Rejected"])
                    if st.button("Submit Official Decision", type="primary"):
                        updated = update_application_status(selected_app_no, action_choice, officer_remarks=officer_remarks)
                        st.success(f"Application {selected_app_no} updated to {action_choice} with remarks recorded!")
                        st.rerun()
    else:
        st.info("No applications found in this vault.")

# ----------------------------------------------------------------------------
# FAIRNESS AUDITOR (OFFICER ONLY)
# ----------------------------------------------------------------------------
elif menu == "4. Algorithmic Demographic Fairness":
    st.header("⚖️ Algorithmic Demographic Equity Auditor")
    st.caption("Evaluated across Historical Cases using the Statutory 80% Disparate Impact Rule")

    dataset = load_sample_dataset()
    fairness = check_fairness(dataset)

    f_col1, f_col2, f_col3 = st.columns(3)
    with f_col1:
        g = fairness['gender_fairness']
        st.metric("Gender Disparate Impact", f"{g['disparate_impact_ratio']}x", delta="Passes 80% Rule" if g['passes_80_rule'] else "Failed")
        st.write(f"Female Approval: **{g['female_protected']['approval_rate_percent']}%**")
        st.write(f"Male Approval: **{g['male_benchmark']['approval_rate_percent']}%**")
    with f_col2:
        t = fairness['territory_fairness']
        st.metric("Territory Disparate Impact", f"{t['disparate_impact_ratio']}x", delta="Passes 80% Rule" if t['passes_80_rule'] else "Failed")
        st.write(f"Rural Approval: **{t['rural_protected']['approval_rate_percent']}%**")
        st.write(f"Semiurban Approval: **{t['semiurban_benchmark']['approval_rate_percent']}%**")
    with f_col3:
        e = fairness['education_fairness']
        st.metric("Education Disparate Impact", f"{e['disparate_impact_ratio']}x", delta="Passes 80% Rule" if e['passes_80_rule'] else "Failed")
        st.write(f"Non-Graduate Approval: **{e['non_graduate_protected']['approval_rate_percent']}%**")
        st.write(f"Graduate Approval: **{e['graduate_benchmark']['approval_rate_percent']}%**")

# ----------------------------------------------------------------------------
# BATCH SCORING (OFFICER ONLY)
# ----------------------------------------------------------------------------
elif menu == "5. Batch Scoring & Portfolio":
    st.header("📂 Batch Scoring & Portfolio Explorer")
    st.caption("Evaluate institution-wide underwriting metrics")

    dataset = load_sample_dataset()
    st.caption("Access and inspect institutional borrower files from the historical lending pool.")

    if st.button("Score First 20 Historical Records"):
        scored = []
        for r in dataset[:20]:
            p = predict_loan(r)
            scored.append({
                'ID': r.get('id'),
                'Gender': r.get('gender'),
                'Income': r.get('applicant_income'),
                'Loan (k)': r.get('loan_amount'),
                'CIBIL': r.get('cibil_score'),
                'Status': p['status'],
                'Likelihood': f"{p['approval_likelihood']}%",
                'EMI': f"₹{p['monthly_emi']:,}"
            })
        st.dataframe(pd.DataFrame(scored), use_container_width=True)
