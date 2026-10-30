const state = {
  currentRole: 'applicant', 
  currentLang: localStorage.getItem('meridian_lang') || 'en', 
  currentTab: 'apply-view',
  hasApplied: false,
  affirmativeMode: false,
  backendConnected: false,
  apiBase: 'http://localhost:5000',
  currentApplicant: {
    id: 'MB-2026-1001',
    name: 'Ananya Rao',
    gender: 'Female',
    married: 'No',
    dependents: '0',
    education: 'Graduate',
    self_employed: 'No',
    employment_type: 'Freelancing / Gig Economy / Contractor',
    salary_slip: 'Yes',
    applicant_income: 75000,
    coapplicant_income: 20000,
    loan_amount: 250, 
    term: 84, 
    cibil_score: 780,
    credit_history: 1,
    property_area: 'Semiurban',
    loan_purpose: 'Commercial Workstation & Cloud Lab'
  },
  simulated: {
    loan_amount: 250,
    coapplicant_income: 20000,
    term: 84,
    cibil_score: 780,
    credit_history: 1,
    salary_slip: true
  },
  savedDatabaseApps: [],
  lastSubmittedApp: null,
  auditLog: [
    { time: '2026-10-28 20:15', officer: 'Underwriter #402', id: 'MB-2026-1004', action: 'System Rejected', note: 'Subprime credit score (CIBIL 580) and 59.5% DTI' },
    { time: '2026-10-28 20:42', officer: 'Underwriter #108', id: 'MB-2026-1002', action: 'Approved', note: 'Standard prime underwriting pass' },
    { time: '2026-10-28 21:10', officer: 'Underwriter #304', id: 'MB-2026-1003', action: 'Mission Bharat Pass', note: 'Rural women digital MSME priority incentive applied' }
  ],
  portfolioPage: 1,
  portfolioPageSize: 10,
  portfolioFilter: 'all',
  portfolioSearch: ''
};

<<<<<<< HEAD

// ============================================================================
// AUTHENTICATION & ROLE-BASED ACCESS CONTROL (SUPABASE & PERSISTENT SESSION)
// ============================================================================
let currentAuthUser = null;
let currentAuthToken = null;

window.switchAuthTab = function(tabName) {
  const btnSignin = document.getElementById('tab-btn-signin');
  const btnSignup = document.getElementById('tab-btn-signup');
  const formSignin = document.getElementById('form-signin');
  const formSignup = document.getElementById('form-signup');
  const alertEl = document.getElementById('auth-alert');

  if (alertEl) alertEl.style.display = 'none';

  if (tabName === 'signin') {
    btnSignin?.classList.add('active');
    btnSignup?.classList.remove('active');
    if (formSignin) formSignin.style.display = 'block';
    if (formSignup) formSignup.style.display = 'none';
  } else {
    btnSignup?.classList.add('active');
    btnSignin?.classList.remove('active');
    if (formSignup) formSignup.style.display = 'block';
    if (formSignin) formSignin.style.display = 'none';
=======
const DEFAULT_BASELINE_APPLICATIONS = [
  {
    application_no: 'MB-2026-1001',
    created_at: '2026-10-28 14:30:00',
    full_name: 'Ananya Rao',
    gender: 'Female',
    marital_status: 'No',
    dependents: '0',
    education: 'Graduate',
    employment_type: 'Private Sector (Salaried)',
    salary_slip: 'Yes',
    applicant_income: 95000,
    coapplicant_income: 0,
    loan_amount: 350,
    loan_term_months: 84,
    property_area: 'Urban',
    loan_purpose: 'Home Improvement / Construction',
    cibil_score: 810,
    credit_history: 1,
    approval_likelihood: 98,
    monthly_emi: 4166,
    dti_percent: 4.38,
    status: 'Approved',
    officer_notes: 'Prime applicant with strong savings and clear credit track record.'
  },
  {
    application_no: 'MB-2026-1002',
    created_at: '2026-10-28 16:15:00',
    full_name: 'Devansh Kulkarni',
    gender: 'Male',
    marital_status: 'Yes',
    dependents: '2',
    education: 'Graduate',
    employment_type: 'Freelancing / Self-Employed',
    salary_slip: 'No',
    applicant_income: 75000,
    coapplicant_income: 20000,
    loan_amount: 250,
    loan_term_months: 120,
    property_area: 'Semiurban',
    loan_purpose: 'Small Business Working Capital',
    cibil_score: 755,
    credit_history: 1,
    approval_likelihood: 96,
    monthly_emi: 2083,
    dti_percent: 2.19,
    status: 'Approved',
    officer_notes: 'Self-employed IT freelancer with high co-applicant support.'
  },
  {
    application_no: 'MB-2026-1003',
    created_at: '2026-10-28 18:45:00',
    full_name: 'Kavya Nair',
    gender: 'Female',
    marital_status: 'Yes',
    dependents: '1',
    education: 'Graduate',
    employment_type: 'Government / PSU Employee',
    salary_slip: 'Yes',
    applicant_income: 48000,
    coapplicant_income: 18000,
    loan_amount: 180,
    loan_term_months: 60,
    property_area: 'Rural',
    loan_purpose: 'Agricultural Equipment & Inputs',
    cibil_score: 760,
    credit_history: 1,
    approval_likelihood: 98,
    monthly_emi: 3000,
    dti_percent: 4.54,
    status: 'Approved',
    officer_notes: 'Rural agri-business loan backed by public sector employment.'
  },
  {
    application_no: 'MB-2026-1004',
    created_at: '2026-10-28 20:20:00',
    full_name: 'Rohan Mehta',
    gender: 'Male',
    marital_status: 'Yes',
    dependents: '3+',
    education: 'Not Graduate',
    employment_type: 'Informal / Cash Economy',
    salary_slip: 'No',
    applicant_income: 28000,
    coapplicant_income: 0,
    loan_amount: 400,
    loan_term_months: 24,
    property_area: 'Rural',
    loan_purpose: 'Personal / Medical Facility',
    cibil_score: 580,
    credit_history: 0,
    approval_likelihood: 12,
    monthly_emi: 16666,
    dti_percent: 59.52,
    status: 'Rejected',
    officer_notes: 'High DTI (60%) and prior default history. Advised credit rehabilitation.'
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
  }
];

<<<<<<< HEAD
window.selectSignupRole = function(role) {
  const labelApp = document.getElementById('role-label-applicant');
  const labelOff = document.getElementById('role-label-officer');
  const keyGroup = document.getElementById('officer-key-group');
  const radioApp = document.querySelector('input[name="signup-role"][value="applicant"]');
  const radioOff = document.querySelector('input[name="signup-role"][value="officer"]');

  if (role === 'officer') {
    if (radioOff) radioOff.checked = true;
    labelOff?.classList.add('selected');
    labelApp?.classList.remove('selected');
    if (keyGroup) keyGroup.style.display = 'block';
    document.getElementById('signup-officer-key')?.focus();
  } else {
    if (radioApp) radioApp.checked = true;
    labelApp?.classList.add('selected');
    labelOff?.classList.remove('selected');
    if (keyGroup) keyGroup.style.display = 'none';
  }
};

window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerText = '👁️‍🗨️';
  } else {
    input.type = 'password';
    btn.innerText = '👁️';
  }
};

window.quickFillCreds = function(email, password) {
  const em = document.getElementById('signin-email');
  const pw = document.getElementById('signin-password');
  if (em) em.value = email;
  if (pw) pw.value = password;
  window.switchAuthTab('signin');
  em?.focus();
};

window.showAuthAlert = function(msg, isError = true) {
  const alertEl = document.getElementById('auth-alert');
  if (!alertEl) return;
  alertEl.className = isError ? 'auth-alert auth-alert-error' : 'auth-alert auth-alert-success';
  alertEl.innerHTML = (isError ? '⚠️ ' : '✅ ') + msg;
  alertEl.style.display = 'block';
};

window.handleSignIn = async function(e) {
  e.preventDefault();
  const email = document.getElementById('signin-email')?.value.trim();
  const password = document.getElementById('signin-password')?.value.trim();
  const btn = document.getElementById('btn-signin-submit');

  if (!email || !password) {
    window.showAuthAlert('Please enter both email address and password.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Verifying Credentials...';
  }

  try {
    const res = await fetch(`${state.apiBase}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      window.applyAuthenticatedSession(data.user, data.token);
    } else {
      window.showAuthAlert(data.error || 'Authentication failed. Please verify credentials.');
    }
  } catch (err) {
    // Offline local fallback verification
    if (email.toLowerCase() === 'applicant@meridianbank.in' && password === 'Applicant@123') {
      const fallbackUser = { id: '03416d3d-ff2b-4101-9453-7509939590fc', email, full_name: 'Ananya Rao', phone: '9876543210', role: 'applicant' };
      window.applyAuthenticatedSession(fallbackUser, 'offline-token-applicant');
    } else if (email.toLowerCase() === 'officer@meridianbank.in' && password === 'Officer@2026') {
      const fallbackUser = { id: '80ac8a07-45a2-40ec-aff5-5b605e4ca044', email, full_name: 'Vikram Sharma (Lead Credit Officer)', phone: '9811223344', role: 'officer' };
      window.applyAuthenticatedSession(fallbackUser, 'offline-token-officer');
    } else {
      window.showAuthAlert('Unable to reach server. Please run python server.py or verify credentials.');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔐</span> Sign In to Meridian';
    }
  }
};

window.handleSignUp = async function(e) {
  e.preventDefault();
  const fullName = document.getElementById('signup-fullname')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim();
  const phone = document.getElementById('signup-phone')?.value.trim();
  const role = document.querySelector('input[name="signup-role"]:checked')?.value || 'applicant';
  const officerKey = document.getElementById('signup-officer-key')?.value.trim();
  const password = document.getElementById('signup-password')?.value;
  const confirmPassword = document.getElementById('signup-confirm-password')?.value;
  const btn = document.getElementById('btn-signup-submit');

  if (password !== confirmPassword) {
    window.showAuthAlert('Passwords do not match. Please re-enter.');
    return;
  }

  if (password.length < 8) {
    window.showAuthAlert('Password must be at least 8 characters long.');
    return;
  }

  if (role === 'officer' && !officerKey) {
    window.showAuthAlert('Officer Clearance Key is required for loan officer account creation.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Registering Account...';
  }

  try {
    const res = await fetch(`${state.apiBase}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        email: email,
        phone: phone,
        role: role,
        officer_key: officerKey,
        password: password,
        confirm_password: confirmPassword
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      window.showAuthAlert('Account created successfully! Redirecting to Sign In...', false);
      setTimeout(() => {
        window.switchAuthTab('signin');
        window.quickFillCreds(email, password);
      }, 1200);
    } else {
      window.showAuthAlert(data.error || 'Account registration failed.');
    }
  } catch (err) {
    window.showAuthAlert('Network error during registration. Ensure backend server is running on localhost:5000.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✨</span> Create Verified Account';
    }
  }
};

window.handleLogout = function() {
  currentAuthUser = null;
  currentAuthToken = null;
  try {
    localStorage.removeItem('meridian_auth_user');
    localStorage.removeItem('meridian_auth_token');
    sessionStorage.removeItem('meridian_auth_user');
    sessionStorage.removeItem('meridian_auth_token');
  } catch (e) {}

  const shell = document.getElementById('app-shell');
  const portal = document.getElementById('auth-portal');
  if (shell) shell.style.display = 'none';
  if (portal) portal.style.display = 'flex';
  window.switchAuthTab('signin');
};

window.openForgotPassword = function() {
  const email = prompt("Enter your registered email address to receive password recovery instructions:");
  if (email && email.trim()) {
    fetch(`${state.apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() })
    }).then(r => r.json()).then(data => {
      alert(data.message || `Password recovery link dispatched to ${email}.`);
    }).catch(() => {
      alert(`Password recovery instructions sent to ${email}. Please check your inbox.`);
    });
  }
};

window.applyAuthenticatedSession = function(user, token) {
  currentAuthUser = user;
  currentAuthToken = token;

  try {
    localStorage.setItem('meridian_auth_user', JSON.stringify(user));
    if (token) localStorage.setItem('meridian_auth_token', token);
  } catch (e) {}

  // Update UI Widget
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  if (nameEl) nameEl.innerText = user.full_name || user.email;
  if (roleEl) {
    roleEl.innerText = user.role === 'officer' ? 'LOAN OFFICER' : 'APPLICANT';
    roleEl.className = `user-auth-role-badge ${user.role}`;
  }

  // Hide Auth Portal, Reveal Dashboard Shell
  const portal = document.getElementById('auth-portal');
  const shell = document.getElementById('app-shell');
  if (portal) portal.style.display = 'none';
  if (shell) shell.style.display = 'block';

  // Role segregation
  state.currentRole = user.role;

  if (user.role === 'applicant') {
    // Auto-fill applicant form with profile information
    const nameInput = document.getElementById('fill-name');
    const phoneInput = document.getElementById('fill-phone');
    if (nameInput && !nameInput.value) nameInput.value = user.full_name || '';
    if (phoneInput && !phoneInput.value) phoneInput.value = user.phone || '';

    // Hide officer tabs
    document.querySelectorAll('.nav-officer-item').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-common-item').forEach(el => el.style.display = 'flex');

    // Rename Tab 3 for applicant
    const dbTab = document.querySelector('[data-tab="database-view"]');
    if (dbTab) dbTab.innerHTML = '<span>🗄️</span> 3. My Applications Vault';

    // Open Apply View
    document.querySelector('[data-tab="apply-view"]')?.click();
  } else {
    // Officer view: full access
    document.querySelectorAll('.nav-officer-item').forEach(el => el.style.display = 'flex');
    document.querySelectorAll('.nav-common-item').forEach(el => el.style.display = 'flex');

    // Rename Tab 3 for officer
    const dbTab = document.querySelector('[data-tab="database-view"]');
    if (dbTab) dbTab.innerHTML = '<span>🗄️</span> 3. Central Application Vault (Institution-Wide)';

    // Open Central Vault
    document.querySelector('[data-tab="database-view"]')?.click();
  }

  window.refreshDatabaseTable();
};

window.checkExistingSession = function() {
  try {
    const stored = localStorage.getItem('meridian_auth_user');
    const token = localStorage.getItem('meridian_auth_token');
    if (stored) {
      const user = JSON.parse(stored);
      if (user && user.email) {
        window.applyAuthenticatedSession(user, token);
        return;
      }
    }
  } catch (e) {}

  // If no session, show Auth Portal
  const portal = document.getElementById('auth-portal');
  const shell = document.getElementById('app-shell');
  if (portal) portal.style.display = 'flex';
  if (shell) shell.style.display = 'none';
};

const DEFAULT_BASELINE_APPLICATIONS = [
  {
    application_no: 'MB-2026-1001',
    created_at: '2026-10-28 14:30:00',
    full_name: 'Ananya Rao',
    gender: 'Female',
    marital_status: 'No',
    dependents: '0',
    education: 'Graduate',
    employment_type: 'Private Sector (Salaried)',
    salary_slip: 'Yes',
    applicant_income: 95000,
    coapplicant_income: 0,
    loan_amount: 350,
    loan_term_months: 84,
    property_area: 'Urban',
    loan_purpose: 'Home Improvement / Construction',
    cibil_score: 810,
    credit_history: 1,
    approval_likelihood: 98,
    monthly_emi: 4166,
    dti_percent: 4.38,
    status: 'Approved',
    officer_notes: 'Prime applicant with strong savings and clear credit track record.'
  },
  {
    application_no: 'MB-2026-1002',
    created_at: '2026-10-28 16:15:00',
    full_name: 'Devansh Kulkarni',
    gender: 'Male',
    marital_status: 'Yes',
    dependents: '2',
    education: 'Graduate',
    employment_type: 'Freelancing / Self-Employed',
    salary_slip: 'No',
    applicant_income: 75000,
    coapplicant_income: 20000,
    loan_amount: 250,
    loan_term_months: 120,
    property_area: 'Semiurban',
    loan_purpose: 'Small Business Working Capital',
    cibil_score: 755,
    credit_history: 1,
    approval_likelihood: 96,
    monthly_emi: 2083,
    dti_percent: 2.19,
    status: 'Approved',
    officer_notes: 'Self-employed IT freelancer with high co-applicant support.'
  },
  {
    application_no: 'MB-2026-1003',
    created_at: '2026-10-28 18:45:00',
    full_name: 'Kavya Nair',
    gender: 'Female',
    marital_status: 'Yes',
    dependents: '1',
    education: 'Graduate',
    employment_type: 'Government / PSU Employee',
    salary_slip: 'Yes',
    applicant_income: 48000,
    coapplicant_income: 18000,
    loan_amount: 180,
    loan_term_months: 60,
    property_area: 'Rural',
    loan_purpose: 'Agricultural Equipment & Inputs',
    cibil_score: 760,
    credit_history: 1,
    approval_likelihood: 98,
    monthly_emi: 3000,
    dti_percent: 4.54,
    status: 'Approved',
    officer_notes: 'Rural agri-business loan backed by public sector employment.'
  },
  {
    application_no: 'MB-2026-1004',
    created_at: '2026-10-28 20:20:00',
    full_name: 'Rohan Mehta',
    gender: 'Male',
    marital_status: 'Yes',
    dependents: '3+',
    education: 'Not Graduate',
    employment_type: 'Informal / Cash Economy',
    salary_slip: 'No',
    applicant_income: 28000,
    coapplicant_income: 0,
    loan_amount: 400,
    loan_term_months: 24,
    property_area: 'Rural',
    loan_purpose: 'Personal / Medical Facility',
    cibil_score: 580,
    credit_history: 0,
    approval_likelihood: 12,
    monthly_emi: 16666,
    dti_percent: 59.52,
    status: 'Rejected',
    officer_notes: 'High DTI (60%) and prior default history. Advised credit rehabilitation.'
  }
];

=======
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
const I18N = {
  en: {
    lang_btn: "🇮🇳 हिन्दी (Hindi)",
    brand_title: "Meridian FairLend AI",
    brand_badge: "Mission Bharat",
    brand_sub: "AI-Powered Explainable Lending & Demographic Equity Platform",
    nav_apply: "📝 1. Apply for a Loan",
    nav_report: "📊 2. My Decision Report & Explanations",
    nav_sim: "🎛️ 3. \"What-If\" Live Simulator",
    nav_officer: "⚙️ Underwriting Cockpit & SHAP Waterfall",
    nav_vault: "🗄️ Application Vault & Registry",
    nav_accuracy: "🎯 Model Accuracy Report",
    nav_fairness: "⚖️ Fairness Across Groups",
<<<<<<< HEAD
    nav_portfolio: "📁 Historical Portfolio",
=======
    nav_portfolio: "📁 Historical Portfolio (614 Cases)",
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
    apply_heading: "Submit a Retail Loan Application",
    apply_subheading: "Fill in your personal profile, monthly earnings, CIBIL score, and requested facility. Your application is automatically analyzed by AI and permanently recorded in the Meridian Application Vault & Registry.",
    sec_personal: "1. Personal & Demographic Profile",
    lbl_name: "Full Name of Applicant *",
    lbl_phone: "Contact Mobile Number *",
    lbl_gender: "Gender *",
    lbl_married: "Marital Status *",
    lbl_dependents: "Number of Dependents *",
    lbl_education: "Highest Education Level *",
    lbl_employment: "Primary Employment & Livelihood *",
    lbl_salary_slip: "Official Salary Slip Available? *",
    txt_slip_yes: "✓ Yes (Salary Slip Available)",
    txt_slip_no: "✕ No (Bank Statement / Digital Invoices)",
    lbl_area: "Property & Residence Territory *",
    sec_financial: "2. Earnings, Loan Request & CIBIL Bureau",
    lbl_app_income: "Applicant Monthly Income (₹) *",
    lbl_coapp_income: "Co-Applicant Monthly Income (₹)",
    lbl_purpose: "Loan Facility Purpose *",
    lbl_loan_amount: "Requested Loan (in Thousands ₹) *",
    lbl_tenure: "Loan Tenure (1 to 30 Years) *",
    lbl_cibil: "CIBIL Credit Bureau Score *",
    btn_submit_app: "🚀 Submit Application",
    sim_title: "🎛️ Interactive \"What-If\" Counterfactual Simulator",
    sim_sub: "Simulate changes to your loan amount, tenure, co-applicant income, CIBIL, and salary slip to see exact real-time approval adjustments.",
    lbl_sim_likelihood: "Simulated Likelihood:",
    lbl_sim_emi: "Simulated Monthly EMI:",
    lbl_sim_dti: "Simulated Debt Burden (DTI):",
    lbl_sim_cibil_tier: "Credit Rating Tier:",
    lbl_sim_doc_status: "Income Documentation:",
    lbl_sim_loan: "Requested Loan Amount:",
    lbl_sim_coapp: "Co-Applicant Monthly Income:",
    lbl_sim_term: "Loan Tenure (Duration):",
    lbl_sim_cibil: "Simulated CIBIL Score:",
    lbl_sim_slip_toggle: "Salary Slip Attached in Simulation:",
    btn_apply_whatif: "⚡ Apply This Scenario to My Application",
    btn_reset_whatif: "↺ Reset to Baseline",
    strengths_title: "Top Factors Working In Your Favor",
    frictions_title: "Top Barriers Influencing This Outcome",
    roadmap_title: "Personalized Eligibility Roadmap",
    btn_open_letter: "View & Download Official Sanction Letter",
    prompt_apply_letter: "Apply for a loan to generate and download your official RBI-compliant Sanction Letter.",
    btn_apply_loan_link: "Apply for Loan →",
    approved_title: "Likely to be Approved",
    conditional_title: "Borderline / Needs Review",
    rejected_title: "High Risk / Unlikely to be Approved",
    approved_desc: "Your credit and financial profile comfortably satisfies Meridian Mission Bharat underwriting benchmarks.",
    conditional_desc: "Your application is near the approval threshold. Minor adjustments or guarantor backing will secure an offer.",
    rejected_desc: "Current risk markers exceed credit policy guidelines. Review the specific factors and remediation plan below.",
    footer_eyebrow: "MISSION BHARAT • THE BIGGER PICTURE",
    footer_heading: "India's Credit Inclusion Snapshot",
    footer_subtitle: "Progress is real. Access to fair, understandable credit still matters.",
    footer_mission_badge: "OUR MISSION",
    footer_mission_statement: "Make every credit decision easier to understand.",
    footer_mission_supporting: "Explain the decision. Identify improvement opportunities. Evaluate fairness responsibly.",
    footer_disclaimer: "© 2026 Meridian FairLend. Operating in compliance with the Reserve Bank of India (RBI) Regulatory Framework for Digital Lending."
  },
  hi: {
    lang_btn: "🇬🇧 English",
    brand_title: "मेरिडियन फेयरलेंड एआई (Meridian FairLend AI)",
    brand_badge: "मिशन भारत",
    brand_sub: "एआई-संचालित पारदर्शी ऋण निर्णय एवं सामाजिक समानता मंच",
    nav_apply: "📝 1. ऋण के लिए आवेदन करें",
    nav_report: "📊 2. मेरा निर्णय एवं पात्रता रिपोर्ट",
    nav_sim: "🎛️ 3. 'व्हाट-इफ' लाइव सिमुलेटर",
    nav_officer: "⚙️ ऋण अधिकारी कॉकपिट एवं SHAP विश्लेषण",
    nav_vault: "🗄️ आवेदन वॉल्ट एवं रजिस्ट्री",
    nav_accuracy: "🎯 मॉडल सटीकता रिपोर्ट",
    nav_fairness: "⚖️ समूह समानता एवं निष्पक्षता",
<<<<<<< HEAD
    nav_portfolio: "📁 ऐतिहासिक पोर्टफोलियो",
=======
    nav_portfolio: "📁 ऐतिहासिक पोर्टफोलियो (614 मामले)",
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
    apply_heading: "खुदरा ऋण आवेदन पत्र जमा करें",
    apply_subheading: "अपना विवरण, मासिक आय, सिबिल स्कोर और ऋण राशि भरें। आपका आवेदन एआई द्वारा विश्लेषित होकर मेरिडियन सुरक्षित वॉल्ट एवं डेटाबेस में स्थायी रूप से सुरक्षित होगा।",
    sec_personal: "1. व्यक्तिगत एवं जनसांख्यिकीय विवरण",
    lbl_name: "आवेदक का पूरा नाम *",
    lbl_phone: "मोबाइल नंबर *",
    lbl_gender: "लिंग *",
    lbl_married: "वैवाहिक स्थिति *",
    lbl_dependents: "आश्रितों की संख्या *",
    lbl_education: "शिक्षा स्तर *",
    lbl_employment: "रोजगार एवं आजीविका का प्रकार *",
    lbl_salary_slip: "क्या आधिकारिक वेतन पर्ची (Salary Slip) उपलब्ध है? *",
    txt_slip_yes: "✓ हाँ (वेतन पर्ची संलग्न है)",
    txt_slip_no: "✕ नहीं (बैंक विवरण / डिजिटल इनवॉइस)",
    lbl_area: "निवास / संपत्ति क्षेत्र *",
    sec_financial: "2. आय, ऋण मांग एवं सिबिल ब्यूरो",
    lbl_app_income: "आवेदक की मासिक आय (₹) *",
    lbl_coapp_income: "सह-आवेदक की मासिक आय (₹)",
    lbl_purpose: "ऋण सुविधा का उद्देश्य *",
    lbl_loan_amount: "वांछित ऋण राशि (हजारों ₹ में) *",
    lbl_tenure: "ऋण अवधि (1 से 30 वर्ष) *",
    lbl_cibil: "सिबिल क्रेडिट स्कोर (300 से 900) *",
    btn_submit_app: "🚀 ऋण आवेदन जमा करें",
    sim_title: "🎛️ इंटरएक्टिव 'व्हाट-इफ' ऋण सिमुलेटर",
    sim_sub: "ऋण राशि, अवधि, सह-आवेदक आय, सिबिल और वेतन पर्ची बदलकर देखें कि आपकी ऋण स्वीकृति संभावना पर क्या प्रभाव पड़ता है।",
    lbl_sim_likelihood: "अनुमानित स्वीकृति संभावना:",
    lbl_sim_emi: "अनुमानित मासिक किस्त (EMI):",
    lbl_sim_dti: "मासिक ऋण भार (DTI):",
    lbl_sim_cibil_tier: "क्रेडिट रेटिंग श्रेणी:",
    lbl_sim_doc_status: "आय सत्यापन दस्तावेज:",
    lbl_sim_loan: "वांछित ऋण राशि:",
    lbl_sim_coapp: "सह-आवेदक की मासिक आय:",
    lbl_sim_term: "ऋण अवधि (वर्ष):",
    lbl_sim_cibil: "अनुमानित सिबिल स्कोर:",
    lbl_sim_slip_toggle: "सिमुलेटर में वेतन पर्ची स्थिति:",
    btn_apply_whatif: "⚡ यह विकल्प मेरे आवेदन पर लागू करें",
    btn_reset_whatif: "↺ मूल स्थिति पर रीसेट करें",
    strengths_title: "आपके पक्ष में प्रमुख सकारात्मक कारक",
    frictions_title: "स्वीकृति में प्रमुख बाधाएं / जोखिम कारक",
    roadmap_title: "ऋण पात्रता सुधारने की चरणबद्ध योजना",
    btn_open_letter: "आधिकारिक ऋण स्वीकृति पत्र देखें एवं डाउनलोड करें",
    prompt_apply_letter: "अपना आधिकारिक स्वीकृति पत्र डाउनलोड करने के लिए ऋण आवेदन जमा करें।",
    btn_apply_loan_link: "ऋण आवेदन करें →",
    approved_title: "ऋण स्वीकृत होने की प्रबल संभावना",
    conditional_title: "समीक्षाधीन / संदेहास्पद स्थिति",
    rejected_title: "उच्च जोखिम / वर्तमान में स्वीकृति कठिन",
    approved_desc: "आपका वित्तीय एवं क्रेडिट प्रोफाइल मेरिडियन मिशन भारत के ऋण मानकों के सर्वथा अनुकूल है।",
    conditional_desc: "आपका आवेदन स्वीकृति सीमा के अत्यंत निकट है। थोड़े सुधार या सह-आवेदक से ऋण तुरंत स्वीकृत हो सकता है।",
    rejected_desc: "वर्तमान जोखिम संकेत बैंक की नीतियों से अधिक हैं। नीचे दिए गए कारणों और सुधार योजना का अवलोकन करें।",
    footer_eyebrow: "मिशन भारत • वृहद परिप्रेक्ष्य",
    footer_heading: "भारत में वित्तीय समावेशन की वास्तविक स्थिति",
    footer_subtitle: "प्रगति वास्तविक है। पारदर्शी एवं न्यायसंगत ऋण तक सभी की पहुंच अभी भी अत्यंत आवश्यक है।",
    footer_mission_badge: "हमारा संकल्प",
    footer_mission_statement: "प्रत्येक ऋण निर्णय को समझने में सरल एवं पारदर्शी बनाना।",
    footer_mission_supporting: "निर्णय का स्पष्ट कारण बताएं। सुधार के अवसर पहचानें। निष्पक्षता का जिम्मेदारी से मूल्यांकन करें।",
    footer_disclaimer: "© 2026 मेरिडियन फेयरलेंड। भारतीय रिज़र्व बैंक (RBI) डिजिटल लेंडिंग दिशा-निर्देशों के पूर्णतः अनुपालन में संचालित।"
  }
};

async function checkBackendConnection(showNotification = false) {
  const badgeText = document.getElementById('backend-status-text');
  const pulseDot = document.getElementById('backend-pulse-dot');
  const modalBadge = document.getElementById('modal-backend-status-badge');
  const modalDesc = document.getElementById('modal-backend-status-desc');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${state.apiBase}/api`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      state.backendConnected = true;
      if (pulseDot) pulseDot.style.background = '#10B981';
      if (badgeText) badgeText.innerText = 'Python Backend & SQLite Database Active (Port 5000)';
      if (modalBadge) {
        modalBadge.className = 'badge badge-success';
        modalBadge.innerText = 'ONLINE & CONNECTED';
      }
      if (modalDesc) modalDesc.innerText = 'Your browser is currently communicating with the Python REST API server (server.py) and saving directly to meridian_loans.db.';
      return true;
    }
  } catch (err) {

  }

  state.backendConnected = false;
  if (pulseDot) pulseDot.style.background = '#F59E0B';
  if (badgeText) badgeText.innerText = 'Local Standalone Mode (In-Browser Calculation)';
  if (modalBadge) {
    modalBadge.className = 'badge badge-warning';
    modalBadge.innerText = 'STANDALONE IN-BROWSER MODE';
  }
  if (modalDesc) modalDesc.innerText = 'The Python backend server is currently offline or unreachable. The app is running seamlessly using its built-in client-side underwriting engine.';
  return false;
}

window.toggleLanguage = function() {
  state.currentLang = state.currentLang === 'en' ? 'hi' : 'en';
  try {
    localStorage.setItem('meridian_lang', state.currentLang);
  } catch (e) {}

  applyTranslations();
  updateUI();
  updateSimulationUI();
};

function applyTranslations() {
  const lang = state.currentLang;
  const dict = I18N[lang] || I18N.en;

  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) langBtn.innerText = dict.lang_btn;

  const setText = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = text;
  };

  setText('[data-tab="apply-view"]', dict.nav_apply);
  setText('[data-tab="applicant-view"]', dict.nav_report);
  setText('[data-tab="officer-view"]', dict.nav_officer);
  setText('[data-tab="database-view"]', dict.nav_vault);
  setText('[data-tab="model-view"]', `${dict.nav_accuracy} <span class="tag">80% Accuracy</span>`);
  setText('[data-tab="fairness-view"]', `${dict.nav_fairness} <span class="tag">80% Rule</span>`);
  setText('[data-tab="portfolio-view"]', dict.nav_portfolio);

  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setElText('form-heading-text', dict.apply_heading);
  setElText('form-subheading-text', dict.apply_subheading);
  setElText('lbl-sec-personal', dict.sec_personal);
  setElText('lbl-fill-name', dict.lbl_name);
  setElText('lbl-fill-phone', dict.lbl_phone);
  setElText('lbl-fill-gender', dict.lbl_gender);
  setElText('lbl-fill-married', dict.lbl_married);
  setElText('lbl-fill-dependents', dict.lbl_dependents);
  setElText('lbl-fill-education', dict.lbl_education);
  setElText('lbl-fill-employment', dict.lbl_employment);
  setElText('lbl-fill-salary-slip', dict.lbl_salary_slip);
  setElText('txt-slip-yes', dict.txt_slip_yes);
  setElText('txt-slip-no', dict.txt_slip_no);
  setElText('lbl-fill-area', dict.lbl_area);
  setElText('lbl-sec-financial', dict.sec_financial);
  setElText('lbl-fill-app-income', dict.lbl_app_income);
  setElText('lbl-fill-coapp-income', dict.lbl_coapp_income);
  setElText('lbl-fill-purpose', dict.lbl_purpose);
  setElText('lbl-fill-loan-amount', dict.lbl_loan_amount);
  setElText('lbl-fill-tenure', dict.lbl_tenure);
  setElText('lbl-fill-cibil', dict.lbl_cibil);

  const submitBtn = document.getElementById('fill-submit-btn');
  if (submitBtn) submitBtn.innerHTML = `<span>🚀</span> ${dict.btn_submit_app}`;

  setElText('sim-main-title', dict.sim_title);
  setElText('sim-main-sub', dict.sim_sub);
  setElText('lbl-sim-likelihood', dict.lbl_sim_likelihood);
  setElText('lbl-sim-emi', dict.lbl_sim_emi);
  setElText('lbl-sim-dti', dict.lbl_sim_dti);
  setElText('lbl-sim-cibil-tier', dict.lbl_sim_cibil_tier);
  setElText('lbl-sim-doc-status', dict.lbl_sim_doc_status);
  setElText('lbl-sim-slider-loan', dict.lbl_sim_loan);
  setElText('lbl-sim-slider-coapp', dict.lbl_sim_coapp);
  setElText('lbl-sim-slider-term', dict.lbl_sim_term);
  setElText('lbl-sim-slider-cibil', dict.lbl_sim_cibil);
  setElText('lbl-sim-slip-toggle', dict.lbl_sim_slip_toggle);
  setElText('txt-apply-whatif', dict.btn_apply_whatif);
  setElText('txt-reset-whatif', dict.btn_reset_whatif);

  setElText('lbl-strengths-title', dict.strengths_title);
  setElText('lbl-frictions-title', dict.frictions_title);
  setElText('lbl-roadmap-title', dict.roadmap_title);
  const openLetterBtn = document.getElementById('btn-open-letter');
  if (openLetterBtn) openLetterBtn.innerHTML = `<span>📄</span> ${dict.btn_open_letter}`;
  if (dict.prompt_apply_letter) setElText('prompt-apply-text', dict.prompt_apply_letter);
  if (dict.btn_apply_loan_link) setElText('btn-apply-loan-link', dict.btn_apply_loan_link);

  if (dict.footer_eyebrow) setElText('footer-eyebrow', dict.footer_eyebrow);
  if (dict.footer_heading) setElText('footer-heading', dict.footer_heading);
  if (dict.footer_subtitle) setElText('footer-subtitle', dict.footer_subtitle);
  if (dict.footer_mission_badge) setElText('footer-mission-badge', dict.footer_mission_badge);
  if (dict.footer_mission_statement) setElText('footer-mission-statement', dict.footer_mission_statement);
  if (dict.footer_mission_supporting) setElText('footer-mission-supporting', dict.footer_mission_supporting);
  if (dict.footer_disclaimer) setElText('footer-disclaimer', dict.footer_disclaimer);
}

window.setSalarySlipChoice = function(val) {
  const hidden = document.getElementById('fill-salary-slip');
  if (hidden) hidden.value = val;

  const btnYes = document.getElementById('btn-slip-yes');
  const btnNo = document.getElementById('btn-slip-no');

  if (val === 'Yes') {
    if (btnYes) {
      btnYes.style.border = '2px solid #064E3B';
      btnYes.style.background = '#F8E7C9';
      btnYes.style.color = '#064E3B';
      btnYes.style.fontWeight = '700';
    }
    if (btnNo) {
      btnNo.style.border = '2px solid #CBD5E1';
      btnNo.style.background = '#FFFFFF';
      btnNo.style.color = '#475569';
      btnNo.style.fontWeight = '600';
    }
  } else {
    if (btnYes) {
      btnYes.style.border = '2px solid #CBD5E1';
      btnYes.style.background = '#FFFFFF';
      btnYes.style.color = '#475569';
      btnYes.style.fontWeight = '600';
    }
    if (btnNo) {
      btnNo.style.border = '2px solid #064E3B';
      btnNo.style.background = '#F8E7C9';
      btnNo.style.color = '#064E3B';
      btnNo.style.fontWeight = '700';
    }
  }

  const expl = document.getElementById('salary-slip-expl');
  if (expl) {
    if (val === 'Yes') {
      expl.innerText = state.currentLang === 'hi'
        ? '✓ वेतन पर्ची संलग्न है: औपचारिक नियमित आय का प्रमाण (+5% स्वीकृति लाभ)।'
        : '✓ Salary slip attached: Provides formal verification of recurring compensation (+5% boost).';
    } else {
      expl.innerText = state.currentLang === 'hi'
        ? '✓ वेतन पर्ची उपलब्ध नहीं: मिशन भारत के तहत 6 माह के बैंक विवरण / डिजिटल कैश-फ्लो से सत्यापन।'
        : '✓ No salary slip: Assessed via 6-month bank statement / digital cash flows under Mission Bharat gig inclusion.';
    }
  }
};

window.setSimSalarySlip = function(hasSlip) {
  state.simulated.salary_slip = hasSlip;
  const btnYes = document.getElementById('sim-btn-slip-yes');
  const btnNo = document.getElementById('sim-btn-slip-no');
  const textEl = document.getElementById('sim-slip-status-text');

  if (hasSlip) {
    if (btnYes) {
      btnYes.style.border = '1.5px solid #064E3B';
      btnYes.style.background = '#F8E7C9';
      btnYes.style.color = '#064E3B';
      btnYes.style.fontWeight = '700';
    }
    if (btnNo) {
      btnNo.style.border = '1.5px solid #CBD5E1';
      btnNo.style.background = '#FFFFFF';
      btnNo.style.color = '#475569';
      btnNo.style.fontWeight = '600';
    }
    if (textEl) {
      textEl.innerText = state.currentLang === 'hi'
        ? 'औपचारिक वेतन पर्ची से ऋण स्वीकृति में +5% का अतिरिक्त लाभ मिलता है।'
        : 'Official pay slip adds +5% underwriting boost.';
    }
  } else {
    if (btnYes) {
      btnYes.style.border = '1.5px solid #CBD5E1';
      btnYes.style.background = '#FFFFFF';
      btnYes.style.color = '#475569';
      btnYes.style.fontWeight = '600';
    }
    if (btnNo) {
      btnNo.style.border = '1.5px solid #064E3B';
      btnNo.style.background = '#F8E7C9';
      btnNo.style.color = '#064E3B';
      btnNo.style.fontWeight = '700';
    }
    if (textEl) {
      textEl.innerText = state.currentLang === 'hi'
        ? 'वेतन पर्ची के बिना: 6 माह के बैंक स्टेटमेंट के आधार पर सत्यापन।'
        : 'Without salary slip: Evaluated via 6-month bank statement cash flows.';
    }
  }

  updateSimulationUI();
};

function computePrediction(appData) {
  const appInc = parseFloat(appData.applicant_income || 0);
  const coappInc = parseFloat(appData.coapplicant_income || 0);
  const totInc = Math.max(1.0, appInc + coappInc);

  let loanAmtInr = parseFloat(appData.loan_amount || 100);
  if (loanAmtInr <= 1000) {
    loanAmtInr = loanAmtInr * 1000.0;
  }

  let termMonths = parseFloat(appData.term || appData.loan_term_months || 60);
  if (termMonths <= 0) termMonths = 60.0;

  const monthlyEmi = loanAmtInr / termMonths;
  const dtiPercent = (monthlyEmi / totInc) * 100.0;

  let cibil = 750;
  if (appData.cibil_score !== undefined && appData.cibil_score !== null && appData.cibil_score !== '') {
    cibil = parseInt(appData.cibil_score, 10);
  } else if (appData.credit_history !== undefined) {
    cibil = Number(appData.credit_history) === 1 ? 750 : 530;
  }

  let scorePoints = 50.0;
  const contributions = {};

  let cibilImpact = 0;
  if (cibil >= 780) cibilImpact = 32.0;
  else if (cibil >= 720) cibilImpact = 24.0;
  else if (cibil >= 670) cibilImpact = 15.0;
  else if (cibil >= 620) cibilImpact = 3.0;
  else if (cibil >= 550) cibilImpact = -15.0;
  else cibilImpact = -35.0;

  scorePoints += cibilImpact;
  contributions['credit_history'] = { impact: cibilImpact, pct_impact: cibilImpact };

  let dtiImpact = 0;
  if (dtiPercent <= 15.0) dtiImpact = 18.0;
  else if (dtiPercent <= 30.0) dtiImpact = 12.0;
  else if (dtiPercent <= 42.0) dtiImpact = 4.0;
  else if (dtiPercent <= 55.0) dtiImpact = -8.0;
  else dtiImpact = -24.0;

  scorePoints += dtiImpact;
  contributions['dti_ratio'] = { impact: dtiImpact, pct_impact: dtiImpact };

  const annualIncome = totInc * 12.0;
  const coverageRatio = annualIncome / Math.max(1.0, loanAmtInr);
  let covImpact = 0;
  if (coverageRatio >= 2.0) covImpact = 10.0;
  else if (coverageRatio >= 1.0) covImpact = 6.0;
  else if (coverageRatio >= 0.5) covImpact = 0.0;
  else covImpact = -10.0;

  scorePoints += covImpact;
  contributions['income_coverage'] = { impact: covImpact, pct_impact: covImpact };

  let coappImpact = 0;
  if (coappInc > 0) {
    coappImpact = 8.0;
    scorePoints += coappImpact;
  }
  contributions['coapplicant'] = { impact: coappImpact, pct_impact: coappImpact };

  const salarySlip = String(appData.salary_slip || 'Yes').trim().toLowerCase();
  const empType = String(appData.employment_type || '').toLowerCase();
  const isFreelance = empType.includes('freelanc') || empType.includes('gig') || empType.includes('contract');

  let slipImpact = 0;
  if (salarySlip === 'yes' || salarySlip === 'true' || salarySlip === '1') {
    slipImpact = 5.0;
  } else {

    if (isFreelance || empType.includes('self') || empType.includes('farm')) {
      slipImpact = 0.0;
    } else {
      slipImpact = -6.0;
    }
  }
  scorePoints += slipImpact;
  contributions['salary_slip'] = { impact: slipImpact, pct_impact: slipImpact };

  let empImpact = 1.0;
  if (isFreelance) {
    empImpact = 3.0; 
  } else if (empType.includes('salaried')) {
    empImpact = 3.0;
  }
  scorePoints += empImpact;
  contributions['employment_type'] = { impact: empImpact, pct_impact: empImpact };

  const area = String(appData.property_area || 'Rural').toLowerCase();
  let areaImpact = 2.0;
  if (area === 'semiurban') areaImpact = 4.0;
  else if (area === 'rural') areaImpact = 2.0;

  scorePoints += areaImpact;
  contributions['property_area'] = { impact: areaImpact, pct_impact: areaImpact };

  const finalScore = Math.max(2, Math.min(98, Math.round(scorePoints)));

  let status = 'approved';
  if (finalScore < 45) status = 'rejected';
  else if (finalScore < 65) status = 'conditional';

  return {
    approvalPercent: finalScore,
    prob: finalScore / 100.0,
    status: status,
    cibil_score: cibil,
    salary_slip: salarySlip === 'yes' || salarySlip === 'true' || salarySlip === '1' ? 'Yes' : 'No',
    is_freelance: isFreelance,
    contributions: contributions,
    ratios: {
      totInc: Math.round(totInc),
      emi: Math.round(monthlyEmi),
      dtiPct: Math.round(dtiPercent * 10) / 10,
      ltiRatio: Math.round((loanAmtInr / (totInc * 12)) * 10) / 10
    }
  };
}

function generatePlainLanguageExplanations(predResult, appData, lang = 'en') {
  const dict = I18N[lang] || I18N.en;
  const cibil = predResult.cibil_score || (Number(appData.credit_history) === 1 ? 750 : 540);
  const dti = predResult.ratios ? predResult.ratios.dtiPct : 10;
  const emi = predResult.ratios ? predResult.ratios.emi : 2500;
  const salarySlip = predResult.salary_slip || 'Yes';
  const isFreelance = predResult.is_freelance || String(appData.employment_type || '').toLowerCase().includes('freelanc');

  const strengths = [];
  const frictions = [];
  const actions = [];

  if (cibil >= 720) {
    strengths.push({
      title: lang === 'hi' ? "उच्च सिबिल क्रेडिट प्रतिष्ठा (प्राइम)" : "High Credit Trust (Prime CIBIL)",
      desc: lang === 'hi' ? `आपका सिबिल स्कोर ${cibil} उत्कृष्ट क्रेडिट प्रतिष्ठा को प्रमाणित करता है।` : `Your CIBIL score of ${cibil} shows a stellar track record of paying past debts on time.`,
      impact: "+24% Boost"
    });
  } else if (cibil >= 650) {
    strengths.push({
      title: lang === 'hi' ? "मानक सिबिल क्रेडिट रिकॉर्ड" : "Good Qualifying CIBIL Track",
      desc: lang === 'hi' ? `आपका सिबिल स्कोर ${cibil} बैंक मानकों के पूर्णतः अनुकूल है।` : `Your CIBIL score of ${cibil} comfortably meets retail lending credit criteria.`,
      impact: "+15% Boost"
    });
  } else {
    frictions.push({
      title: lang === 'hi' ? "कम सिबिल स्कोर (सबप्राइम)" : "Subprime CIBIL Bureau Score",
      desc: lang === 'hi' ? `सिबिल स्कोर ${cibil} पूर्व विलंबित भुगतानों या सीमित क्रेडिट रिकॉर्ड को दर्शाता है।` : `A CIBIL score of ${cibil} indicates past overdue repayments or insufficient bureau history.`,
      impact: "-25% Discount"
    });
    actions.push(lang === 'hi' ? "पुराने बकाये का निपटान करें: क्रेडिट ब्यूरो में पिछले बकाये का भुगतान कर एनओसी प्राप्त करें।" : "Clear outstanding overdue payments on prior credit facilities or obtain a No-Objection Certificate (NOC).");
  }

  if (dti <= 30.0) {
    strengths.push({
      title: lang === 'hi' ? "संतुलित ऋण-आय अनुपात" : "Comfortable Monthly Debt Burden",
      desc: lang === 'hi' ? `मासिक ईएमआई (₹${emi.toLocaleString('en-IN')}) कुल आय का केवल ${dti}% है, जो सुरक्षित सीमा में है।` : `Monthly EMI (₹${emi.toLocaleString('en-IN')}) takes only ${dti}% of household income, well within safe limits.`,
      impact: "+18% Boost"
    });
  } else if (dti <= 45.0) {
    strengths.push({
      title: lang === 'hi' ? "प्रबंधनीय ऋण दायित्व" : "Manageable Obligation Ratio",
      desc: lang === 'hi' ? `मासिक ईएमआई आय का ${dti}% है, जो सामान्य ऋण मानकों के अनुरूप है।` : `Monthly EMI takes ${dti}% of income, which satisfies regular debt service criteria.`,
      impact: "+6% Boost"
    });
  } else {
    frictions.push({
      title: lang === 'hi' ? "अत्यधिक पुनर्भुगतान भार (उच्च DTI)" : "Elevated Repayment Burden (High DTI)",
      desc: lang === 'hi' ? `मासिक ईएमआई ₹${emi.toLocaleString('en-IN')} आपकी आय का ${dti}% है, जो 45% की सुरक्षित सीमा से अधिक है।` : `Monthly EMI of ₹${emi.toLocaleString('en-IN')} consumes ${dti}% of your monthly income, exceeding the recommended 45% ceiling.`,
      impact: "-20% Risk"
    });
    actions.push(lang === 'hi' ? "ऋण अवधि बढ़ाएं: टेन्योर 1 से 30 वर्ष के बीच बढ़ाकर मासिक किस्त कम करें।" : "Extend loan tenure (e.g. increase years from 1 to 30) or reduce loan amount to lower monthly EMI below 40%.");
  }

  if (salarySlip === 'Yes') {
    strengths.push({
      title: lang === 'hi' ? "सत्यापित आय (वेतन पर्ची संलग्न)" : "Verified Income (Salary Slip)",
      desc: lang === 'hi' ? "आधिकारिक वेतन पर्ची संलग्न है, जिससे नियमित और पुष्ट आय की पुष्टि होती है।" : "Official salary slip submitted, confirming verifiable recurring compensation.",
      impact: "+5% Boost"
    });
  } else {
    if (isFreelance) {
      strengths.push({
        title: lang === 'hi' ? "मिशन भारत फ्रीलांसिंग समावेशन" : "Mission Bharat Gig Inclusivity",
        desc: lang === 'hi' ? "वेतन पर्ची के अभाव में फ्रीलांस/गिग आय का 6-माह के बैंक विवरण व डिजिटल कैश-फ्लो से मूल्यांकन।" : "Freelance income assessed via 6-month digital banking cash flows & client invoices in lieu of pay slip.",
        impact: "Alternative Assessment"
      });
      actions.push(lang === 'hi' ? "6 माह का बैंक विवरण या क्लाइंट इनवॉइस प्रस्तुत करें।" : "Submit 6-month digital bank statement or client invoice records in lieu of salary slip.");
    } else {
      frictions.push({
        title: lang === 'hi' ? "वेतन पर्ची अनुपलब्ध" : "Absence of Formal Salary Slip",
        desc: lang === 'hi' ? "वेतन पर्ची संलग्न नहीं है। अनौपचारिक आय के लिए बैंक विवरण आवश्यक है।" : "No salary slip attached. Verification requires secondary bank statement submission.",
        impact: "-6% Friction"
      });
      actions.push(lang === 'hi' ? "औपचारिक बैंक खाता विवरण या नियोक्ता प्रमाण पत्र संलग्न करें।" : "Provide 6-month formal bank account statement or employer certificate in lieu of pay slip.");
    }
  }

  if (isFreelance) {
    strengths.push({
      title: lang === 'hi' ? "डिजिटल अर्थव्यवस्था योगदानकर्ता (फ्रीलांसिंग)" : "Digital Gig Economy Contributor",
      desc: lang === 'hi' ? "फ्रीलांसिंग / स्वतंत्र पेशेवर आय स्रोतों को मिशन भारत की समावेशी नीतियों का समर्थन।" : "Freelance / Independent contractor livelihood supported under Mission Bharat progressive inclusion guidelines.",
      impact: "+3% Inclusion"
    });
  }

  const coapp = parseFloat(appData.coapplicant_income || 0);
  if (coapp > 0) {
    strengths.push({
      title: lang === 'hi' ? "संयुक्त अर्जक सह-आवेदक" : "Joint Earning Co-Applicant",
      desc: lang === 'hi' ? `कमाऊ सह-आवेदक (₹${Math.round(coapp).toLocaleString('en-IN')}/माह) से परिवार की चुकौती क्षमता मजबूत हुई।` : `Adding an earning co-applicant (₹${Math.round(coapp).toLocaleString('en-IN')}/month) enhances household cash flow security.`,
      impact: "+8% Boost"
    });
  } else if (dti > 35.0) {
    frictions.push({
      title: lang === 'hi' ? "एकल आय निर्भरता" : "Single Income Dependency",
      desc: lang === 'hi' ? "अकेले आवेदक होने से आपातकालीन वित्तीय व्यवधान का जोखिम बढ़ता है।" : "Relying on a single income stream increases risk during unexpected financial disruptions.",
      impact: "-8% Risk"
    });
    actions.push(lang === 'hi' ? "कमाऊ सह-आवेदक जोड़ें: परिवार के किसी आय वाले सदस्य को जोड़ने से ऋण स्वीकृति बढ़ेगी।" : "Include an earning spouse or family member as a co-applicant to expand repayment capacity.");
  }

  return {
    strengths: strengths,
    frictions: frictions,
    actions: actions
  };
}

window.handleLoanApplicationSubmit = async function(event) {
  if (event) event.preventDefault();

  const submitBtn = document.getElementById('fill-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> Recording in Vault...';
  }

  const yearsVal = parseInt(document.getElementById('fill-loan-years')?.value || 5, 10);
  const termMonths = yearsVal * 12;

  const formData = {
    full_name: document.getElementById('fill-full-name')?.value || 'Ananya Rao',
    phone: document.getElementById('fill-phone')?.value || '9876543210',
    gender: document.getElementById('fill-gender')?.value || 'Female',
    marital_status: document.getElementById('fill-married')?.value || 'No',
    dependents: document.getElementById('fill-dependents')?.value || '0',
    education: document.getElementById('fill-education')?.value || 'Graduate',
    employment_type: document.getElementById('fill-employment')?.value || 'Freelancing / Gig Economy / Contractor',
    salary_slip: document.getElementById('fill-salary-slip')?.value || 'Yes',
    applicant_income: Number(document.getElementById('fill-app-income')?.value || 75000),
    coapplicant_income: Number(document.getElementById('fill-coapp-income')?.value || 20000),
    loan_purpose: document.getElementById('fill-loan-purpose')?.value || 'Home Improvement / Construction',
    loan_amount: Number(document.getElementById('fill-loan-amount')?.value || 250),
    loan_term_months: termMonths,
    cibil_score: Number(document.getElementById('fill-cibil-slider')?.value || 780),
<<<<<<< HEAD
    property_area: document.getElementById('fill-property-area')?.value || 'Semiurban',
    user_id: currentAuthUser ? currentAuthUser.id : null,
    applicant_id: currentAuthUser ? currentAuthUser.id : null
=======
    property_area: document.getElementById('fill-property-area')?.value || 'Semiurban'
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
  };

  let savedRecord = null;
  let prediction = null;
  let explanation = null;

  if (state.backendConnected) {
    try {
      const response = await fetch(`${state.apiBase}/api/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const resData = await response.json();
        savedRecord = resData.application;
        prediction = resData.prediction;
        explanation = resData.explanation;
      }
    } catch (err) {
      console.warn("Backend apply API offline, saving to local vault:", err);
    }
  }

  if (!savedRecord) {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const appNo = `MB-2026-${randomId}`;

    prediction = computePrediction({
      applicant_income: formData.applicant_income,
      coapplicant_income: formData.coapplicant_income,
      loan_amount: formData.loan_amount,
      term: formData.loan_term_months,
      cibil_score: formData.cibil_score,
      salary_slip: formData.salary_slip,
      employment_type: formData.employment_type,
      property_area: formData.property_area
    });

    explanation = generatePlainLanguageExplanations(prediction, formData, state.currentLang);

    savedRecord = {
      id: Date.now(),
      application_no: appNo,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      full_name: formData.full_name,
      cibil_score: formData.cibil_score,
      salary_slip: formData.salary_slip,
      status: prediction.status.charAt(0).toUpperCase() + prediction.status.slice(1),
      approval_likelihood: prediction.approvalPercent,
      monthly_emi: prediction.ratios.emi,
      dti_percent: prediction.ratios.dtiPct,
      loan_amount: formData.loan_amount,
      loan_term_months: formData.loan_term_months,
      property_area: formData.property_area,
      loan_purpose: formData.loan_purpose,
      employment_type: formData.employment_type
    };

    try {
      const existing = JSON.parse(localStorage.getItem('meridian_saved_apps') || '[]');
      const existingMap = new Map();
      DEFAULT_BASELINE_APPLICATIONS.forEach(a => existingMap.set(a.application_no, a));
      if (Array.isArray(existing)) {
        existing.forEach(a => { if (a && a.application_no) existingMap.set(a.application_no, a); });
      }
      existingMap.set(savedRecord.application_no, savedRecord);
      const updatedList = Array.from(existingMap.values());
      updatedList.sort((a, b) => {
        const timeA = a.created_at || '';
        const timeB = b.created_at || '';
        if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA);
        return (b.application_no || '').localeCompare(a.application_no || '');
      });
      localStorage.setItem('meridian_saved_apps', JSON.stringify(updatedList));
    } catch (e) {}
  }

  state.hasApplied = true;
  state.lastSubmittedApp = { ...formData, ...savedRecord };
  state.currentApplicant = {
    id: savedRecord.application_no,
    name: savedRecord.full_name,
    gender: formData.gender,
    married: formData.marital_status,
    dependents: formData.dependents,
    education: formData.education,
    self_employed: (formData.employment_type || '').includes('Freelanc') || (formData.employment_type || '').includes('Self') ? 'Yes' : 'No',
    employment_type: formData.employment_type,
    salary_slip: formData.salary_slip,
    applicant_income: formData.applicant_income,
    coapplicant_income: formData.coapplicant_income,
    loan_amount: formData.loan_amount,
    term: formData.loan_term_months,
    cibil_score: formData.cibil_score,
    credit_history: formData.cibil_score >= 650 ? 1 : 0,
    property_area: formData.property_area,
    loan_purpose: formData.loan_purpose
  };

  state.simulated = {
    loan_amount: formData.loan_amount,
    coapplicant_income: formData.coapplicant_income,
    term: formData.loan_term_months,
    cibil_score: formData.cibil_score,
    credit_history: formData.cibil_score >= 650 ? 1 : 0,
    salary_slip: formData.salary_slip === 'Yes'
  };

  setSliderVal('sim-slider-loan', state.simulated.loan_amount);
  setSliderVal('sim-slider-coapp', state.simulated.coapplicant_income);
  setSliderVal('sim-slider-term', Math.round(state.simulated.term / 12));
  setSliderVal('sim-slider-cibil', state.simulated.cibil_score);
  setSimSalarySlip(state.simulated.salary_slip);

  updateUI();
  updateSimulationUI();
  refreshDatabaseTable();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>🚀</span> ${I18N[state.currentLang]?.btn_submit_app || 'Submit Application'}`;
  }

  const reportTab = document.querySelector('[data-tab="applicant-view"]');
  if (reportTab) {
    reportTab.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const banner = document.getElementById('submission-alert-banner');
  const bannerAppNo = document.getElementById('banner-app-no');
  if (banner) {
    if (bannerAppNo) bannerAppNo.innerText = savedRecord.application_no;
    banner.style.display = 'block';
  }
};

window.applyWhatIfScenario = function() {
  const sim = state.simulated;

  state.currentApplicant.loan_amount = sim.loan_amount;
  state.currentApplicant.coapplicant_income = sim.coapplicant_income;
  state.currentApplicant.term = sim.term;
  state.currentApplicant.cibil_score = sim.cibil_score;
  state.currentApplicant.salary_slip = sim.salary_slip ? 'Yes' : 'No';

  setValue('fill-loan-amount', sim.loan_amount);
  setValue('fill-coapp-income', sim.coapplicant_income);
  const years = Math.round(sim.term / 12);
  setValue('fill-loan-years', years);
  updateFillTenureDisplay(years);
  setValue('fill-cibil-slider', sim.cibil_score);
  updateCibilDisplay(sim.cibil_score);
  setSalarySlipChoice(sim.salary_slip ? 'Yes' : 'No');

  updateUI();

  const heroCard = document.getElementById('decision-hero-card');
  if (heroCard) {
    heroCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    heroCard.style.outline = '3px solid #D97706';
    setTimeout(() => { heroCard.style.outline = 'none'; }, 2000);
  }

  const msg = state.currentLang === 'hi'
    ? '✨ व्हाट-इफ परिदृश्य सफलतापूर्वक लागू किया गया! आपकी निर्णय रिपोर्ट और मासिक किस्त अपडेट हो गई है।'
    : '✨ What-If Scenario applied! Your active applicant parameters and Decision Report have been recalculated.';
  alert(msg);
};

window.resetWhatIfToBaseline = function() {
  const base = state.currentApplicant;
  state.simulated = {
    loan_amount: base.loan_amount || 150,
    coapplicant_income: base.coapplicant_income || 15000,
    term: base.term || 60,
    cibil_score: base.cibil_score || 760,
    credit_history: (base.cibil_score || 760) >= 650 ? 1 : 0,
    salary_slip: (base.salary_slip || 'Yes') === 'Yes'
  };

  setSliderVal('sim-slider-loan', state.simulated.loan_amount);
  document.getElementById('val-sim-loan').innerText = `₹${(state.simulated.loan_amount / 100).toFixed(1)} Lakh (₹${(state.simulated.loan_amount * 1000).toLocaleString('en-IN')})`;

  setSliderVal('sim-slider-coapp', state.simulated.coapplicant_income);
  document.getElementById('val-sim-coapp').innerText = `₹${state.simulated.coapplicant_income.toLocaleString('en-IN')}/mo`;

  const years = Math.round(state.simulated.term / 12);
  setSliderVal('sim-slider-term', years);
  document.getElementById('val-sim-term').innerText = `${years} Year${years > 1 ? 's' : ''} (${state.simulated.term} Months)`;

  setSliderVal('sim-slider-cibil', state.simulated.cibil_score);
  document.getElementById('val-sim-cibil').innerText = `${state.simulated.cibil_score} (${state.simulated.cibil_score >= 750 ? 'Prime' : 'Standard'})`;

  setSimSalarySlip(state.simulated.salary_slip);
  updateSimulationUI();
};

function updateSimulationUI() {
  const baseApp = state.currentApplicant;
  const sim = state.simulated;

  const simApp = {
    ...baseApp,
    loan_amount: sim.loan_amount,
    coapplicant_income: sim.coapplicant_income,
    term: sim.term,
    cibil_score: sim.cibil_score,
    salary_slip: sim.salary_slip ? 'Yes' : 'No'
  };

  const basePred = computePrediction(baseApp);
  const simPred = computePrediction(simApp);
  const delta = simPred.approvalPercent - basePred.approvalPercent;

  const simProbEl = document.getElementById('sim-current-prob');
  const simDeltaEl = document.getElementById('sim-delta-badge');
  const simStatusEl = document.getElementById('sim-status-label');

  if (simProbEl) simProbEl.innerText = `${simPred.approvalPercent}%`;
  if (simDeltaEl) {
    if (delta > 0) {
      simDeltaEl.innerText = `+${delta}% Gain`;
      simDeltaEl.className = 'badge badge-success';
    } else if (delta < 0) {
      simDeltaEl.innerText = `${delta}% Drop`;
      simDeltaEl.className = 'badge badge-danger';
    } else {
      simDeltaEl.innerText = `Baseline`;
      simDeltaEl.className = 'badge badge-info';
    }
  }

  if (simStatusEl) {
    simStatusEl.innerText = simPred.status.toUpperCase();
    simStatusEl.className = `badge badge-${simPred.status === 'approved' ? 'success' : simPred.status === 'conditional' ? 'warning' : 'danger'}`;
  }

  const emiEl = document.getElementById('sim-metric-emi');
  const dtiEl = document.getElementById('sim-metric-dti');
  const cibilEl = document.getElementById('sim-metric-cibil');
  const docEl = document.getElementById('sim-metric-doc');

  if (emiEl) emiEl.innerText = `₹${simPred.ratios.emi.toLocaleString('en-IN')}/mo`;
  if (dtiEl) {
    const dtiSafe = simPred.ratios.dtiPct <= 30 ? (state.currentLang === 'hi' ? 'सुरक्षित' : 'Safe') : simPred.ratios.dtiPct <= 45 ? (state.currentLang === 'hi' ? 'मध्यम' : 'Moderate') : (state.currentLang === 'hi' ? 'अत्यधिक' : 'High');
    dtiEl.innerText = `${simPred.ratios.dtiPct}% (${dtiSafe})`;
  }
  if (cibilEl) {
    const tier = sim.cibil_score >= 750 ? 'Prime' : sim.cibil_score >= 650 ? 'Qualifying' : 'Subprime';
    cibilEl.innerText = `${tier} (${sim.cibil_score})`;
  }
  if (docEl) {
    docEl.innerText = sim.salary_slip 
      ? (state.currentLang === 'hi' ? 'वेतन पर्ची संलग्न (+5%)' : 'Salary Slip Attached (+5%)')
      : (state.currentLang === 'hi' ? 'बैंक स्टेटमेंट सत्यापन' : 'Bank Statement Verified');
  }

  const tipEl = document.getElementById('sim-smart-tip');
  if (tipEl) {
    if (simPred.approvalPercent >= 75) {
      tipEl.style.background = '#F0FDF4';
      tipEl.style.borderLeft = '4px solid #059669';
      tipEl.style.color = '#064E3B';
      tipEl.innerHTML = state.currentLang === 'hi'
        ? '✨ <strong>उत्कृष्ट वित्तीय संतुलन:</strong> यह कॉन्फ़िगरेशन कम ईएमआई और मजबूत सिबिल के साथ आपके आवेदन को <strong>स्वीकृत श्रेणी (Approved Tier)</strong> में रखता है।'
        : '✨ <strong>Optimal Underwriting Sweet Spot:</strong> This balanced configuration comfortably qualifies your file in the <strong>Approved Tier</strong> with safe repayment margins.';
    } else if (simPred.ratios.dtiPct > 45) {
      tipEl.style.background = '#FFFBEB';
      tipEl.style.borderLeft = '4px solid #D97706';
      tipEl.style.color = '#92400E';
      tipEl.innerHTML = state.currentLang === 'hi'
        ? '⚠️ <strong>मासिक ऋण भार अधिक है:</strong> ईएमआई आय का 45% से अधिक ले रही है। अवधि (टेन्योर) को 8-12 वर्ष तक बढ़ाकर या ऋण राशि 15% घटाकर स्वीकृति तुरंत प्राप्त करें।'
        : '⚠️ <strong>Elevated Monthly Obligation:</strong> Monthly EMI takes over 45% of income. Try extending tenure to 8–12 years or reducing loan amount to drop DTI below 40%.';
    } else if (sim.cibil_score < 650) {
      tipEl.style.background = '#FEF2F2';
      tipEl.style.borderLeft = '4px solid #DC2626';
      tipEl.style.color = '#991B1B';
      tipEl.innerHTML = state.currentLang === 'hi'
        ? '⚠️ <strong>सिबिल स्कोर चुनौती:</strong> 650 से कम सिबिल स्कोर मुख्य रुकावट है। सिबिल स्कोर को 680+ तक सुधारने से तुरंत स्वीकृति संभव होगी।'
        : '⚠️ <strong>Bureau Score Barrier:</strong> A CIBIL bureau score below 650 is the primary risk driver. Clearing past overdues to reach 680+ will unlock full sanction.';
    } else {
      tipEl.style.background = '#EFF6FF';
      tipEl.style.borderLeft = '4px solid #2563EB';
      tipEl.style.color = '#1E40AF';
      tipEl.innerHTML = state.currentLang === 'hi'
        ? '💡 <strong>समीक्षाधीन स्थिति:</strong> आवेदन स्वीकृति सीमा के निकट है। सह-आवेदक आय जोड़ने या वेतन पर्ची संलग्न करने से स्वीकृति सुनिश्चित होगी।'
        : '💡 <strong>Borderline Threshold:</strong> Application is close to standard pass criteria. Adding a family co-applicant will easily elevate your likelihood above 80%.';
    }
  }
}

window.exportVaultToCSV = function() {
  const apps = state.savedDatabaseApps.length > 0 ? state.savedDatabaseApps : [
    state.currentApplicant
  ];

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Application No,Full Name,CIBIL Score,Salary Slip,Applicant Income,Co-Applicant Income,Loan Amount (k),Tenure (Months),Property Area,Status,Approval Likelihood (%),Monthly EMI (INR)\n";

  apps.forEach(a => {
    const row = [
      a.application_no || a.id || 'MB-2026-X',
      `"${a.full_name || a.name || 'Applicant'}"`,
      a.cibil_score || 750,
      `"${a.salary_slip || 'Yes'}"`,
      a.applicant_income || 0,
      a.coapplicant_income || 0,
      a.loan_amount || 100,
      a.loan_term_months || a.term || 60,
      `"${a.property_area || 'Urban'}"`,
      a.status || 'Approved',
      a.approval_likelihood || 95,
      a.monthly_emi || 2500
    ].join(",");
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `meridian_loan_applications_${new Date().toISOString().substring(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.exportVaultToJSON = function() {
  const apps = state.savedDatabaseApps.length > 0 ? state.savedDatabaseApps : [state.currentApplicant];
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(apps, null, 2));
  const link = document.createElement("a");
  link.setAttribute("href", dataStr);
  link.setAttribute("download", `meridian_loan_vault_backup_${new Date().toISOString().substring(0,10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.refreshDatabaseTable = async function() {
  const tbody = document.getElementById('db-table-body');
  const countBadge = document.getElementById('db-total-count');
  if (!tbody) return;

  const appMap = new Map();

  DEFAULT_BASELINE_APPLICATIONS.forEach(app => {
    appMap.set(app.application_no, { ...app });
  });

  try {
    const localStored = JSON.parse(localStorage.getItem('meridian_saved_apps') || '[]');
    if (Array.isArray(localStored)) {
      localStored.forEach(app => {
        if (app && app.application_no) {
          appMap.set(app.application_no, { ...(appMap.get(app.application_no) || {}), ...app });
        }
      });
    }
  } catch (e) {}

  if (state.backendConnected) {
    try {
      const queryParams = (currentAuthUser && currentAuthUser.role === 'applicant') 
        ? `?user_id=${currentAuthUser.id}&role=applicant&email=${encodeURIComponent(currentAuthUser.email)}`
        : `?role=officer`;
      const response = await fetch(`${state.apiBase}/api/saved-applications${queryParams}`);
      if (response.ok) {
        const data = await response.json();
        if (data.applications && Array.isArray(data.applications)) {
          data.applications.forEach(app => {
            if (app && app.application_no) {
              appMap.set(app.application_no, { ...(appMap.get(app.application_no) || {}), ...app });
            }
          });
        }
      }
    } catch (e) {}
  }

  let allApps = Array.from(appMap.values());

  allApps.sort((a, b) => {
    const timeA = a.created_at || '';
    const timeB = b.created_at || '';
    if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA);
    return (b.application_no || '').localeCompare(a.application_no || '');
  });

<<<<<<< HEAD
  
  // Strict Role-Based Filtering
  if (currentAuthUser && currentAuthUser.role === 'applicant') {
    allApps = allApps.filter(app => {
      if (!app) return false;
      const uidMatch = app.user_id && String(app.user_id) === String(currentAuthUser.id);
      const aidMatch = app.applicant_id && String(app.applicant_id) === String(currentAuthUser.id);
      const emailMatch = currentAuthUser.email && app.email && app.email.toLowerCase() === currentAuthUser.email.toLowerCase();
      const nameMatch = currentAuthUser.full_name && app.full_name && app.full_name.toLowerCase() === currentAuthUser.full_name.toLowerCase();
      return uidMatch || aidMatch || emailMatch || nameMatch;
    });
  }

  state.savedDatabaseApps = allApps;

  try {
    localStorage.setItem('meridian_saved_apps', JSON.stringify(allApps));
  } catch (e) {}

  if (countBadge) {
    countBadge.innerText = `${allApps.length} Saved Applications (Old + New)`;
  }

=======
  state.savedDatabaseApps = allApps;

  try {
    localStorage.setItem('meridian_saved_apps', JSON.stringify(allApps));
  } catch (e) {}

  if (countBadge) {
    countBadge.innerText = `${allApps.length} Saved Applications (Old + New)`;
  }

>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
  tbody.innerHTML = allApps.map(app => {
    const badge = app.status === 'Approved' ? 'badge-success' : app.status === 'Conditional' ? 'badge-warning' : 'badge-danger';
    const cibilVal = app.cibil_score || (app.credit_history === 1 ? 750 : 540);
    const cibilClass = cibilVal >= 750 ? 'badge-success' : cibilVal >= 650 ? 'badge-info' : 'badge-danger';
    const totInc = (parseFloat(app.applicant_income) || 0) + (parseFloat(app.coapplicant_income) || 0);
    const termMonths = app.loan_term_months || app.term || 60;
    const years = Math.max(1, Math.round(termMonths / 12));
    const isSlip = app.salary_slip === 'Yes' || app.salary_slip === true;
    const slipTag = isSlip 
      ? '<span style="color: #059669; font-weight: 700;">✓ Slip</span>' 
      : '<span style="color: #D97706; font-weight: 700;">✕ No Slip</span>';
    const loanAmt = parseFloat(app.loan_amount) || 150;
    const loanDisplay = loanAmt > 1000 ? `₹${loanAmt.toLocaleString('en-IN')}` : `₹${(loanAmt * 1000).toLocaleString('en-IN')}`;

    return `
      <tr>
        <td style="font-weight: 800; color: #064E3B;">${app.application_no}</td>
        <td style="font-size: 0.8rem; color: #4B6359;">${app.created_at ? app.created_at.substring(0, 16) : 'Today'}</td>
        <td style="font-weight: 700; color: #0B2920;">${app.full_name || 'Applicant'}</td>
        <td><span class="badge ${cibilClass}">${cibilVal}</span></td>
        <td style="font-size: 0.8rem;">${slipTag}</td>
        <td>₹${totInc.toLocaleString('en-IN')}/mo</td>
        <td>${loanDisplay} (${years} yrs)</td>
        <td>${app.property_area || 'Urban'}</td>
        <td><strong>${app.approval_likelihood || 85}%</strong></td>
        <td><span class="badge ${badge}">${app.status || 'Approved'}</span></td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem;" onclick="loadDbApplicantById('${app.application_no}')">
            🔍 Inspect
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

window.loadDbApplicantById = function(appNo) {
  state.hasApplied = true;
  const found = (state.savedDatabaseApps || []).find(a => a.application_no === appNo) ||
                DEFAULT_BASELINE_APPLICATIONS.find(a => a.application_no === appNo);
  if (found) {
    state.currentApplicant = {
      id: found.application_no,
      name: found.full_name || 'Applicant',
      gender: found.gender || 'Male',
      married: found.marital_status || 'Yes',
      dependents: String(found.dependents || '0'),
      education: found.education || 'Graduate',
      self_employed: (found.employment_type || '').includes('Self') || (found.employment_type || '').includes('Freelanc') ? 'Yes' : 'No',
      employment_type: found.employment_type || 'Freelancing / Gig Economy / Contractor',
      salary_slip: found.salary_slip || 'Yes',
      applicant_income: found.applicant_income || 35000,
      coapplicant_income: found.coapplicant_income || 0,
      loan_amount: found.loan_amount || 150,
      term: found.loan_term_months || found.term || 60,
      cibil_score: found.cibil_score || 750,
      credit_history: (found.cibil_score >= 650 || found.credit_history === 1) ? 1 : 0,
      property_area: found.property_area || 'Rural',
      status: found.status || 'Approved'
    };
    state.simulated = {
      loan_amount: found.loan_amount || 150,
      coapplicant_income: found.coapplicant_income || 0,
      term: found.loan_term_months || found.term || 60,
      cibil_score: found.cibil_score || 750,
      credit_history: (found.cibil_score >= 650 || found.credit_history === 1) ? 1 : 0,
      salary_slip: (found.salary_slip || 'Yes') === 'Yes'
    };
    updateUI();
    updateSimulationUI();
    const targetTab = state.currentRole === 'officer' ? 'officer-view' : 'applicant-view';
    const tabEl = document.querySelector(`[data-tab="${targetTab}"]`);
    if (tabEl) tabEl.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    addAuditLog('VAULT_INSPECT', `Inspected application ${appNo} (${found.full_name}) from central vault`);
  }
};

window.goToDatabaseTab = function() {
  switchRole('officer');
  const dbTab = document.querySelector('[data-tab="database-view"]');
  if (dbTab) dbTab.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.inspectSubmittedApp = function() {
  const targetTab = state.currentRole === 'officer' ? 'officer-view' : 'applicant-view';
  const tabBtn = document.querySelector(`[data-tab="${targetTab}"]`);
  if (tabBtn) tabBtn.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function updateUI() {
  const applicant = state.currentApplicant;
  const pred = computePrediction(applicant);
  const lang = state.currentLang;
  const dict = I18N[lang] || I18N.en;
  const explanations = generatePlainLanguageExplanations(pred, applicant, lang);

  const heroCard = document.getElementById('decision-hero-card');
  const heroTitle = document.getElementById('hero-decision-title');
  const heroDesc = document.getElementById('hero-decision-desc');
  const heroTag = document.getElementById('hero-status-tag');
  const heroPct = document.getElementById('hero-approval-pct');
  const heroBar = document.getElementById('hero-progress-fill');

  if (heroCard) heroCard.className = `decision-hero ${pred.status}`;
  if (heroPct) heroPct.innerText = `${pred.approvalPercent}%`;
  if (heroBar) heroBar.style.width = `${pred.approvalPercent}%`;

  if (heroTag && heroTitle && heroDesc) {
    if (pred.status === 'approved') {
      heroTag.innerText = lang === 'hi' ? "अनुमोदित / उच्च संभावना" : "APPROVED / HIGH LIKELIHOOD";
      heroTitle.innerText = dict.approved_title;
      heroDesc.innerText = dict.approved_desc;
    } else if (pred.status === 'conditional') {
      heroTag.innerText = lang === 'hi' ? "समीक्षाधीन / संदेहास्पद स्थिति" : "CONDITIONAL / BORDERLINE";
      heroTitle.innerText = dict.conditional_title;
      heroDesc.innerText = dict.conditional_desc;
    } else {
      heroTag.innerText = lang === 'hi' ? "अस्वीकृत / उच्च वित्तीय जोखिम" : "UNLIKELY / ELEVATED RISK";
      heroTitle.innerText = dict.rejected_title;
      heroDesc.innerText = dict.rejected_desc;
    }
  }

  const strengthsContainer = document.getElementById('strengths-list');
  if (strengthsContainer) {
    strengthsContainer.innerHTML = explanations.strengths.map(s => `
      <div class="factor-item positive">
        <div class="factor-left">
          <div class="factor-icon">✓</div>
          <div>
            <div class="factor-title">${s.title}</div>
            <div class="factor-desc">${s.desc}</div>
          </div>
        </div>
        <div class="factor-impact">${s.impact}</div>
      </div>
    `).join('');
  }

  const frictionsContainer = document.getElementById('frictions-list');
  if (frictionsContainer) {
    if (explanations.frictions.length === 0) {
      frictionsContainer.innerHTML = `
        <div style="padding: 1rem; color: #064E3B; font-size: 0.88rem; font-weight: 600;">
          ${lang === 'hi' ? "✓ कोई गंभीर जोखिम कारक नहीं मिला। आपका प्रोफाइल स्वीकृत मानकों के अनुरूप है।" : "✓ No primary risk friction factors identified. Profile comfortably satisfies credit guidelines."}
        </div>
      `;
    } else {
      frictionsContainer.innerHTML = explanations.frictions.map(f => `
        <div class="factor-item negative">
          <div class="factor-left">
            <div class="factor-icon">✕</div>
            <div>
              <div class="factor-title">${f.title}</div>
              <div class="factor-desc">${f.desc}</div>
            </div>
          </div>
          <div class="factor-impact">${f.impact}</div>
        </div>
      `).join('');
    }
  }

  const actionsContainer = document.getElementById('actions-container');
  if (actionsContainer) {
    if (explanations.actions.length === 0) {
      actionsContainer.innerHTML = `
        <div style="padding: 1rem; color: #064E3B; font-size: 0.9rem; font-weight: 600;">
          ${lang === 'hi' ? "🎉 कोई सुधार कार्रवाई आवश्यक नहीं है! आपका आवेदन डिजिटल वितरण के लिए सीधे योग्य है।" : "🎉 No remediation required! Your file satisfies high-confidence underwriting standards for immediate sanction."}
        </div>
      `;
    } else {
      actionsContainer.innerHTML = explanations.actions.map(action => `
        <div class="action-card">
          <div class="action-num">→</div>
          <div class="action-content">
            <div class="action-title">${lang === 'hi' ? "अनुशंसा" : "Recommended Step"}</div>
            <div class="action-desc">${action}</div>
          </div>
        </div>
      `).join('');
    }
  }

  const downloadGroup = document.getElementById('letter-download-btn-group');
  const applyPrompt = document.getElementById('letter-apply-prompt');
  if (downloadGroup && applyPrompt) {
    if (state.hasApplied) {
      downloadGroup.style.display = 'flex';
      applyPrompt.style.display = 'none';
    } else {
      downloadGroup.style.display = 'none';
      applyPrompt.style.display = 'flex';
    }
  }

  const openLetterBtn = document.getElementById('btn-open-letter');
  if (openLetterBtn && state.hasApplied) {
    if (pred.status === 'rejected') {
      openLetterBtn.innerHTML = `<span>📄</span> ${lang === 'hi' ? 'आधिकारिक प्रतिकूल निर्णय सूचना (Adverse Notice)' : 'View & Download Adverse Action Notice'}`;
    } else {
      openLetterBtn.innerHTML = `<span>📄</span> ${lang === 'hi' ? 'आधिकारिक ऋण स्वीकृति पत्र देखें एवं डाउनलोड करें' : 'View & Download Official Sanction Letter'}`;
    }
  }

  renderOfficerMetrics(pred, applicant);
  renderWaterfall(pred);
  syncFormInputs(applicant);
}

function syncFormInputs(app) {
  setValue('input-name', app.name || 'Ananya Rao');
  setValue('input-gender', app.gender || 'Female');
  setValue('input-married', app.married || 'No');
  setValue('input-dependents', app.dependents || '0');
  setValue('input-education', app.education || 'Graduate');
  setValue('input-self-employed', app.self_employed || 'No');
  setValue('input-app-income', app.applicant_income || 75000);
  setValue('input-coapp-income', app.coapplicant_income || 20000);
  setValue('input-loan-amount', app.loan_amount || 250);
  setValue('input-loan-term', app.term || 84);
  setValue('input-credit-history', app.cibil_score >= 650 ? 1 : 0);
  setValue('input-property-area', app.property_area || 'Semiurban');
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function renderOfficerMetrics(pred, applicant) {
  const setHtml = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  setHtml('metric-officer-prob', `${pred.approvalPercent}%`);
  setHtml('metric-officer-dti', `${pred.ratios.dtiPct}%`);
  setHtml('metric-officer-emi', `₹${pred.ratios.emi.toLocaleString('en-IN')}<span style="font-size: 0.72rem; font-weight: 600; opacity: 0.85;">/mo</span>`);
  setHtml('metric-officer-lti', `${pred.ratios.ltiRatio}x <span style="font-size: 0.72rem; font-weight: 600; opacity: 0.85;">Annual</span>`);
}

function renderWaterfall(pred) {
  const container = document.getElementById('waterfall-bars');
  if (!container) return;

  const basePoints = 50;
  const contribs = pred.contributions || {};

  const items = [
    { label: 'Baseline Underwriting Anchor', val: basePoints, type: 'neutral' },
    { label: 'CIBIL Bureau Track Record', val: contribs.credit_history?.impact || 0, type: contribs.credit_history?.impact >= 0 ? 'pos' : 'neg' },
    { label: 'Monthly Debt Burden (DTI / FOIR)', val: contribs.dti_ratio?.impact || 0, type: contribs.dti_ratio?.impact >= 0 ? 'pos' : 'neg' },
    { label: 'Income Coverage Ratio', val: contribs.income_coverage?.impact || 0, type: contribs.income_coverage?.impact >= 0 ? 'pos' : 'neg' },
    { label: 'Salary Slip Verification', val: contribs.salary_slip?.impact || 0, type: contribs.salary_slip?.impact >= 0 ? 'pos' : 'neg' },
    { label: 'Joint Co-Applicant Support', val: contribs.coapplicant?.impact || 0, type: contribs.coapplicant?.impact > 0 ? 'pos' : 'neutral' },
    { label: 'Mission Bharat Geographic Equity', val: contribs.property_area?.impact || 0, type: 'pos' },
    { label: 'Final Approval Likelihood', val: pred.approvalPercent, type: 'final' }
  ];

  container.innerHTML = items.map(item => {
    const sign = item.val > 0 && item.type !== 'final' && item.type !== 'neutral' ? '+' : '';
    let barColor = '#64748B';
    if (item.type === 'pos') barColor = '#059669';
    else if (item.type === 'neg') barColor = '#DC2626';
    else if (item.type === 'final') barColor = '#064E3B';

    const widthPct = Math.min(100, Math.max(10, Math.abs(item.val)));

    return `
      <div style="margin-bottom: 0.85rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 3px;">
          <span style="font-weight: 600; color: #1E293B;">${item.label}</span>
          <span style="font-weight: 800; color: ${barColor};">${sign}${item.val}%</span>
        </div>
        <div style="background: #E2E8F0; height: 10px; border-radius: 5px; overflow: hidden;">
          <div style="background: ${barColor}; height: 100%; width: ${widthPct}%; border-radius: 5px;"></div>
        </div>
      </div>
    `;
  }).join('');
}

window.officerSanctionLoan = async function(newStatus, note) {
  const appNo = state.currentApplicant.id || 'MB-2026-1001';
  const applicantName = state.currentApplicant.name || 'Applicant';

  if (state.backendConnected) {
    try {
      const res = await fetch(`${state.apiBase}/api/officer/sanction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_no: appNo,
          status: newStatus,
<<<<<<< HEAD
          note: note,
          remarks: document.getElementById('officer-remarks-input')?.value.trim() || note,
          officer_role: currentAuthUser ? currentAuthUser.role : 'officer'
=======
          note: note
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
        })
      });
      if (res.ok) {
        console.log(`[OK] Backend SQLite & Excel CSV updated for ${appNo} -> ${newStatus}`);
      }
    } catch (e) {
      console.warn("Backend sanction sync error:", e);
    }
  }

  state.currentApplicant.status = newStatus;
  const matchingSaved = state.savedDatabaseApps.find(a => a.application_no === appNo);
  if (matchingSaved) {
    matchingSaved.status = newStatus;
    matchingSaved.officer_notes = note;
  }

  try {
    const existing = JSON.parse(localStorage.getItem('meridian_saved_apps') || '[]');
    const idx = existing.findIndex(a => a.application_no === appNo);
    if (idx >= 0) {
      existing[idx].status = newStatus;
      existing[idx].officer_notes = note;
      localStorage.setItem('meridian_saved_apps', JSON.stringify(existing));
    }
  } catch (e) {}

  addAuditLog(`Officer ${newStatus}`, note);

  updateUI();
  refreshDatabaseTable();

  const alertMsg = state.currentLang === 'hi'
    ? `✅ ऋण निर्णय दर्ज हुआ!\n\nआवेदन: ${appNo}\nआवेदक: ${applicantName}\nस्थिति: ${newStatus}\n\nयह निर्णय SQLite डेटाबेस (meridian_loans.db) और Excel CSV फाइल में तुरंत दर्ज हो गया है!`
    : `✅ Loan Decision Recorded!\n\nApplication No: ${appNo}\nApplicant: ${applicantName}\nStatus: ${newStatus}\n\nUpdated in SQLite database (meridian_loans.db) and Excel CSV file!`;
  alert(alertMsg);
};

function setupEventListeners() {

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const tabId = item.getAttribute('data-tab');
      state.currentTab = tabId;

      document.querySelectorAll('.tab-section').forEach(sec => sec.style.display = 'none');
      const activeSec = document.getElementById(tabId);
      if (activeSec) activeSec.style.display = 'block';

      if (tabId === 'fairness-view') {
        renderFairnessCharts();
      } else if (tabId === 'model-view') {
        renderModelPerformanceCharts();
      } else if (tabId === 'portfolio-view') {
        renderPortfolioTable();
      } else if (tabId === 'database-view') {
        refreshDatabaseTable();
      }
    });
  });

  document.getElementById('role-applicant')?.addEventListener('click', () => {
    switchRole('applicant');
  });

  document.getElementById('role-officer')?.addEventListener('click', () => {
    switchRole('officer');
  });

  document.getElementById('sim-slider-loan')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.simulated.loan_amount = val;
    document.getElementById('val-sim-loan').innerText = `₹${(val / 100).toFixed(1)} Lakh (₹${(val * 1000).toLocaleString('en-IN')})`;
    updateSimulationUI();
  });

  document.getElementById('sim-slider-coapp')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.simulated.coapplicant_income = val;
    document.getElementById('val-sim-coapp').innerText = `₹${val.toLocaleString('en-IN')}/mo`;
    updateSimulationUI();
  });

  document.getElementById('sim-slider-term')?.addEventListener('input', (e) => {
    const years = Number(e.target.value);
    const months = years * 12;
    state.simulated.term = months;
    document.getElementById('val-sim-term').innerText = `${years} Year${years > 1 ? 's' : ''} (${months} Months)`;
    updateSimulationUI();
  });

  document.getElementById('sim-slider-cibil')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.simulated.cibil_score = val;
    const tier = val >= 750 ? 'Prime' : val >= 650 ? 'Qualifying' : 'Subprime';
    document.getElementById('val-sim-cibil').innerText = `${val} (${tier})`;
    updateSimulationUI();
  });

  document.getElementById('btn-open-letter')?.addEventListener('click', () => {
    openDecisionLetterModal();
  });

  document.getElementById('btn-close-letter')?.addEventListener('click', () => {
    document.getElementById('letter-modal').style.display = 'none';
  });

  document.getElementById('btn-print-letter')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-officer-approve')?.addEventListener('click', () => {
    officerSanctionLoan('Approved', 'Sanctioned by Loan Officer - Underwriting criteria satisfied');
  });

  document.getElementById('btn-officer-conditional')?.addEventListener('click', () => {
    officerSanctionLoan('Conditional', 'Approved with Mission Bharat Rural Subvention Pass');
  });

  document.getElementById('btn-officer-reject')?.addEventListener('click', () => {
    officerSanctionLoan('Rejected', 'Formal decline recorded due to debt burden criteria');
  });
}

function setSliderVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function switchRole(role) {
  state.currentRole = role;
  const btnApp = document.getElementById('role-applicant');
  const btnOff = document.getElementById('role-officer');

  if (role === 'applicant') {
    if (btnApp) btnApp.classList.add('active');
    if (btnOff) btnOff.classList.remove('active');

<<<<<<< HEAD
    document.querySelectorAll('.nav-common-item').forEach(el => el.style.display = 'flex');
=======
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
    document.querySelectorAll('.nav-applicant-item').forEach(el => el.style.display = 'flex');
    document.querySelectorAll('.nav-officer-item').forEach(el => el.style.display = 'none');

    document.querySelector('[data-tab="apply-view"]')?.click();
  } else {
    if (btnOff) btnOff.classList.add('active');
    if (btnApp) btnApp.classList.remove('active');

<<<<<<< HEAD
    document.querySelectorAll('.nav-common-item').forEach(el => el.style.display = 'flex');
    document.querySelectorAll('.nav-applicant-item').forEach(el => el.style.display = 'flex');
=======
    document.querySelectorAll('.nav-applicant-item').forEach(el => el.style.display = 'none');
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
    document.querySelectorAll('.nav-officer-item').forEach(el => el.style.display = 'flex');

    document.querySelector('[data-tab="officer-view"]')?.click();
  }
}

window.scrollToSimulator = function() {
  document.querySelector('[data-tab="applicant-view"]')?.click();
  setTimeout(() => {
    const simCard = document.getElementById('what-if-card');
    if (simCard) simCard.scrollIntoView({ behavior: 'smooth' });
  }, 100);
};

window.updateFillTenureDisplay = function(years) {
  const months = years * 12;
  const tag = document.getElementById('fill-tenure-tag');
  if (tag) tag.innerText = `${years} Year${years > 1 ? 's' : ''} (${months} Months)`;
  const numInput = document.getElementById('fill-exact-years');
  if (numInput) numInput.value = years;
};

window.updateFillTenureFromNumber = function(years) {
  let y = parseInt(years, 10);
  if (isNaN(y) || y < 1) y = 1;
  if (y > 30) y = 30;
  const slider = document.getElementById('fill-loan-years');
  if (slider) slider.value = y;
  const months = y * 12;
  const tag = document.getElementById('fill-tenure-tag');
  if (tag) tag.innerText = `${y} Year${y > 1 ? 's' : ''} (${months} Months)`;
};

window.updateCibilDisplay = function(val) {
  const tag = document.getElementById('cibil-display-tag');
  const guide = document.getElementById('cibil-guide-text');
  let rating = 'Poor';
  let badgeClass = 'badge-danger';
  let guideText = '⚠️ CIBIL score is below 650. Settle past overdues to secure pre-approval.';

  if (val >= 750) {
    rating = 'Prime (Excellent)';
    badgeClass = 'badge-success';
    guideText = '✓ CIBIL score ≥ 750 qualifies for lowest interest rates and fast-track processing.';
  } else if (val >= 650) {
    rating = 'Good (Standard)';
    badgeClass = 'badge-info';
    guideText = '✓ CIBIL score ≥ 650 meets standard banking credit guidelines.';
  }

  if (tag) {
    tag.innerText = `CIBIL: ${val} (${rating})`;
    tag.className = `badge ${badgeClass}`;
  }
  if (guide) guide.innerText = guideText;
};

window.openDecisionLetterModal = function() {
  if (!state.hasApplied) {
    alert(state.currentLang === 'hi' 
      ? "कृपया आधिकारिक स्वीकृति पत्र डाउनलोड करने के लिए पहले ऋण आवेदन जमा करें।" 
      : "Please submit your loan application first to generate and download your official Sanction Letter.");
    const applyTab = document.querySelector('[data-tab="apply-view"]');
    if (applyTab) applyTab.click();
    return;
  }
  const modal = document.getElementById('letter-modal');
  if (!modal) return;

  const app = state.currentApplicant;
  const pred = computePrediction(app);

  const setEl = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  let loanAmtInr = parseFloat(app.loan_amount || 150);
  if (loanAmtInr <= 1000) loanAmtInr = loanAmtInr * 1000;

  const termMonths = parseFloat(app.term || app.loan_term_months || 60);
  const years = (termMonths / 12).toFixed(1).replace('.0', '');

  const annualRate = 0.0925;
  const monthlyRate = annualRate / 12;
  const emiVal = Math.round(
    (loanAmtInr * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1)
  ) || pred.ratios.emi;

  const totalRepay = emiVal * termMonths;
  const totalInterest = Math.max(0, totalRepay - loanAmtInr);

  setEl('let-applicant-name', app.name || 'Applicant');
  setEl('let-ref', `MERIDIAN-${app.id || 'MB-2026-1001'}`);
  setEl('let-date', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }));
  setEl('let-loan-amount', `₹${loanAmtInr.toLocaleString('en-IN')}`);
  setEl('let-tenure', `${termMonths} Months (${years} Years)`);
  setEl('let-area', `${app.property_area || 'Urban'} Territory`);

  setEl('kfs-loan-amt', `₹${loanAmtInr.toLocaleString('en-IN')}`);
  setEl('kfs-apr', '9.25% p.a. (Fixed Reducing per RBI Guidelines)');
  setEl('kfs-tenure', `${termMonths} Months (${years} Years)`);
  setEl('kfs-emi', `₹${emiVal.toLocaleString('en-IN')} / month`);
  setEl('kfs-total-interest', `₹${totalInterest.toLocaleString('en-IN')}`);
  setEl('kfs-total-repayment', `₹${totalRepay.toLocaleString('en-IN')}`);

  const statusBadge = document.getElementById('let-status-badge');
  const verdictText = document.getElementById('let-verdict-text');
  if (statusBadge) {
    if (pred.status === 'approved') {
      statusBadge.innerText = 'OFFICIAL IN-PRINCIPLE APPROVAL';
      statusBadge.className = 'badge badge-success';
      if (verdictText) {
        verdictText.innerHTML = `We are pleased to inform you that your application <strong>${app.id || 'MB-2026-1001'}</strong> has satisfied all underwriting benchmarks under the <strong>RBI Fair Practices Code</strong>. Below is your official <strong>Key Fact Statement (KFS)</strong> and explainable eligibility breakdown.`;
      }
    } else if (pred.status === 'conditional') {
      statusBadge.innerText = 'CONDITIONAL IN-PRINCIPLE SANCTION';
      statusBadge.className = 'badge badge-warning';
      if (verdictText) {
        verdictText.innerHTML = `Your application <strong>${app.id || 'MB-2026-1001'}</strong> qualifies for in-principle sanction subject to primary KYC verification or co-guarantor endorsement under the <strong>RBI Digital Lending Guidelines</strong>.`;
      }
    } else {
      statusBadge.innerText = 'ADVERSE ACTION NOTICE (DECLINED)';
      statusBadge.className = 'badge badge-danger';
      if (verdictText) {
        verdictText.innerHTML = `In compliance with the <strong>Reserve Bank of India Fair Practices Code</strong> on automated lending decisions, we provide below the transparent factor determination detailing the specific credit parameters that led to this adverse decision.`;
      }
    }
  }

  const factorsList = document.getElementById('let-factors-list');
  if (factorsList) {
    const cibilVal = app.cibil_score || (app.credit_history === 1 ? 750 : 540);
    const dtiVal = pred.ratios.dtiPct;
    let items = [];

    if (cibilVal >= 650) {
      items.push(`<li><strong>Credit Bureau Reliability (CIBIL ${cibilVal}):</strong> Clean bureau repayment record substantially elevated underwriting score (+28.4%).</li>`);
    } else {
      items.push(`<li><strong>Credit Bureau Alert (CIBIL ${cibilVal}):</strong> Historical default or subprime score below qualifying threshold (-32.1%).</li>`);
    }

    if (dtiVal <= 35) {
      items.push(`<li><strong>Debt-to-Income (DTI ${dtiVal}%):</strong> Requested installment is well within RBI prudential comfort ceiling of 45%.</li>`);
    } else {
      items.push(`<li><strong>Debt Burden (DTI ${dtiVal}%):</strong> Monthly installment consumes elevated percentage of household cashflow, presenting leverage risk.</li>`);
    }

    if (app.salary_slip === 'Yes' || app.salary_slip === true) {
      items.push(`<li><strong>Income Verifiability:</strong> Formal institutional salary slips validated stable disposable cashflow.</li>`);
    } else {
      items.push(`<li><strong>Informal / Freelance Earnings:</strong> Assessed via surrogate cashflow & bank metrics under Mission Bharat Financial Inclusion.</li>`);
    }

    const explanations = generatePlainLanguageExplanations(pred, app, state.currentLang);
    if (explanations && explanations.recommendations && explanations.recommendations.length > 0) {
      items.push(`<li><strong>Remediation / Guidance:</strong> ${explanations.recommendations[0]}</li>`);
    }

    factorsList.innerHTML = items.join('');
  }

  modal.style.display = 'flex';
}

function addAuditLog(action, note) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  state.auditLog.unshift({
    time: now,
    officer: 'Current Officer',
    id: state.currentApplicant.id,
    action: action,
    note: note,
          remarks: document.getElementById('officer-remarks-input')?.value.trim() || note,
          officer_role: currentAuthUser ? currentAuthUser.role : 'officer'
  });
  renderAuditTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  tbody.innerHTML = state.auditLog.slice(0, 8).map(log => `
    <tr>
      <td style="font-size: 0.78rem; color: #64748B;">${log.time}</td>
      <td style="font-weight: 600;">${log.officer}</td>
      <td style="font-weight: 700; color: #064E3B;">${log.id}</td>
      <td><span class="badge badge-info">${log.action}</span></td>
      <td style="font-size: 0.82rem;">${log.note}</td>
    </tr>
  `).join('');
}

function renderModelPerformanceCharts() {

}

function renderFairnessCharts() {

}

function renderPortfolioTable() {
  const tbody = document.getElementById('portfolio-table-body');
  const countLabel = document.getElementById('portfolio-total-count');
  const pageIndicator = document.getElementById('portfolio-page-indicator');
  if (!tbody) return;

  if (typeof MERIDIAN_DATASET === 'undefined' || !MERIDIAN_DATASET.records) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #DC2626;">Historical dataset not loaded from dataset_data.js</td></tr>`;
    return;
  }

  let records = MERIDIAN_DATASET.records;

  const f = state.portfolioFilter || 'all';
  if (f === 'approved') {
    records = records.filter(r => r.pred_status === 'Y' || r.actual_status === 'Y');
  } else if (f === 'rejected') {
    records = records.filter(r => r.pred_status === 'N' || r.actual_status === 'N');
  } else if (f === 'rural') {
    records = records.filter(r => (r.property_area || '').toLowerCase() === 'rural');
  } else if (f === 'female') {
    records = records.filter(r => (r.gender || '').toLowerCase() === 'female');
  }

  const s = (state.portfolioSearch || '').trim().toLowerCase();
  if (s) {
    records = records.filter(r => {
      return (r.id && r.id.toLowerCase().includes(s)) ||
             (r.property_area && r.property_area.toLowerCase().includes(s)) ||
             (r.gender && r.gender.toLowerCase().includes(s)) ||
             (r.education && r.education.toLowerCase().includes(s)) ||
             (r.self_employed && r.self_employed.toLowerCase().includes(s));
    });
  }

  const totalFiltered = records.length;
  const pageSize = state.portfolioPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  if (state.portfolioPage < 1) state.portfolioPage = 1;
  if (state.portfolioPage > totalPages) state.portfolioPage = totalPages;

  const startIdx = (state.portfolioPage - 1) * pageSize;
  const pageRecords = records.slice(startIdx, startIdx + pageSize);

  if (countLabel) {
<<<<<<< HEAD
    countLabel.innerText = `Historical Portfolio Applications${f !== 'all' ? ` (Filtered: ${f.toUpperCase()})` : ''}`;
  }
  if (pageIndicator) {
    pageIndicator.innerText = `Page ${state.portfolioPage} / ${totalPages}`;
=======
    countLabel.innerText = `Showing ${totalFiltered} of ${MERIDIAN_DATASET.records.length} historical applications${f !== 'all' ? ` (Filtered: ${f.toUpperCase()})` : ''}`;
  }
  if (pageIndicator) {
    pageIndicator.innerText = `Page ${state.portfolioPage} / ${totalPages} (${totalFiltered} total)`;
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
  }

  if (pageRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #64748B;">No matching records found in historical portfolio.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageRecords.map(r => {
    const isApproved = r.pred_status === 'Y' || r.actual_status === 'Y';
    const statusBadge = isApproved 
      ? '<span class="badge badge-success">APPROVED</span>' 
      : '<span class="badge badge-danger">REJECTED</span>';

    const probVal = r.pred_prob !== undefined ? (r.pred_prob * 100).toFixed(1) : (isApproved ? '85.0' : '22.0');
    const probColor = probVal >= 70 ? '#059669' : probVal >= 40 ? '#D97706' : '#DC2626';

    const isClean = r.credit_history === 1 || r.credit_history === undefined || r.credit_history === null;
    const cHistory = isClean 
      ? '<span class="badge badge-success">Clean (1.0)</span>' 
      : '<span class="badge badge-danger">Default (0.0)</span>';

    const totalIncome = ((r.applicant_income || 0) + (r.coapplicant_income || 0));
    const formattedIncome = totalIncome > 0 ? `₹${totalIncome.toLocaleString('en-IN')}` : '₹35,000';
    const loanAmt = r.loan_amount || 100;

    return `
      <tr>
        <td style="font-weight: 800; color: #064E3B;">${r.id}</td>
        <td>${r.gender || 'Not Disclosed'}</td>
        <td><span class="badge ${r.property_area === 'Rural' ? 'badge-warning' : 'badge-info'}">${r.property_area || 'Urban'}</span></td>
        <td>${formattedIncome}</td>
        <td>₹${loanAmt}k <span style="font-size:0.75rem; color:#64748B;">(₹${(loanAmt * 1000).toLocaleString('en-IN')})</span></td>
        <td>${cHistory}</td>
        <td><strong style="color: ${probColor};">${probVal}%</strong></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.75rem;" onclick="loadHistoricalCase('${r.id}')">
            🔍 Inspect &amp; Simulate
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.setPortfolioFilter = function(filter) {
  state.portfolioFilter = filter;
  state.portfolioPage = 1;
  document.querySelectorAll('#portfolio-view .btn-outline, #portfolio-view .btn-primary').forEach(btn => {
    const oc = btn.getAttribute('onclick') || '';
    if (oc.includes(`'${filter}'`)) {
      btn.className = 'btn btn-primary';
    } else if (oc.includes('setPortfolioFilter')) {
      btn.className = 'btn btn-outline';
    }
  });
  renderPortfolioTable();
};

window.filterPortfolioSearch = function(val) {
  state.portfolioSearch = (val || '').trim().toLowerCase();
  state.portfolioPage = 1;
  renderPortfolioTable();
};

window.changePortfolioPage = function(delta) {
  state.portfolioPage += delta;
  renderPortfolioTable();
};

window.loadHistoricalCase = function(caseId) {
  state.hasApplied = true;
  if (typeof MERIDIAN_DATASET === 'undefined' || !MERIDIAN_DATASET.records) return;
  const r = MERIDIAN_DATASET.records.find(rec => rec.id === caseId);
  if (!r) return;

  const appInc = r.applicant_income ? r.applicant_income * 10 : 35000;
  const coappInc = r.coapplicant_income ? r.coapplicant_income * 10 : 0;
  const isClean = r.credit_history === 1 || r.credit_history === undefined || r.credit_history === null;
  const cibil = isClean ? 760 : 540;

  state.currentApplicant = {
    id: r.id,
    name: `Historical Borrower (${r.id})`,
    gender: r.gender || 'Male',
    married: r.married || 'No',
    dependents: String(r.dependents || '0'),
    education: r.education || 'Graduate',
    self_employed: r.self_employed || 'No',
    primary_employment: r.self_employed === 'Yes' ? 'Freelancing / Self-Employed' : 'Private Sector (Salaried)',
    applicant_income: appInc,
    coapplicant_income: coappInc,
    loan_amount: r.loan_amount || 150,
    term: r.term || 360,
    credit_history: isClean ? 1 : 0,
    cibil_score: cibil,
    salary_slip: r.self_employed === 'Yes' ? 'No' : 'Yes',
    property_area: r.property_area || 'Urban',
    status: (r.pred_status === 'Y' || r.actual_status === 'Y') ? 'Approved' : 'Rejected'
  };

  window.resetWhatIfToBaseline();
  updateUI();
  updateSimulationUI();

  const targetTab = state.currentRole === 'officer' ? 'officer-view' : 'applicant-view';
  const tabBtn = document.querySelector(`[data-tab="${targetTab}"]`);
  if (tabBtn) tabBtn.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  addAuditLog('PORTFOLIO_INSPECT', `Inspected historical case ${caseId} (${r.gender}, ${r.property_area}, Loan ₹${r.loan_amount}k)`);
};

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
<<<<<<< HEAD
  checkExistingSession();
=======
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
  checkBackendConnection();
  applyTranslations();
  updateUI();
  updateSimulationUI();
  refreshDatabaseTable();
  renderPortfolioTable();
  renderAuditTable();
});
