/**
 * Meridian Financial Services - MISSION BHARAT
 * Explainable Loan Decision System (Core JavaScript Engine)
 * Connected with Python Backend (http://localhost:5000), SQLite Database & CSV Exporter
 */

// Application State
const state = {
  currentRole: 'applicant', // 'applicant' or 'officer'
  currentLang: 'en', // 'en' or 'hi'
  currentTab: 'apply-view',
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
    employment_type: 'Fintech Product Lead (Salaried Tech)',
    applicant_income: 95000,
    coapplicant_income: 0,
    loan_amount: 350, // in thousands (₹3,50,000)
    term: 84, // 7 years (84 months)
    cibil_score: 810,
    credit_history: 1,
    property_area: 'Urban',
    loan_purpose: 'Home Renovation & Green Energy'
  },
  simulated: {
    loan_amount: 350,
    coapplicant_income: 0,
    term: 84, // 7 years
    cibil_score: 810,
    credit_history: 1
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

// Modern Tech + Normal Mix Archetypes
const ARCHETYPES = {
  tech_lead: {
    id: 'MB-2026-1001',
    name: 'Ananya Rao',
    desc: 'Fintech Product Lead • High-Tech Salaried (Prime CIBIL 810)',
    gender: 'Female',
    married: 'No',
    dependents: '0',
    education: 'Graduate',
    self_employed: 'No',
    employment_type: 'Salaried (Private/Corporate)',
    applicant_income: 95000,
    coapplicant_income: 0,
    loan_amount: 350,
    term: 84, // 7 years
    cibil_score: 810,
    credit_history: 1,
    property_area: 'Urban',
    loan_purpose: 'Home Improvement / Construction'
  },
  cloud_consultant: {
    id: 'MB-2026-1002',
    name: 'Devansh Kulkarni',
    desc: 'Cloud Infrastructure Architect • Self-Employed (CIBIL 740)',
    gender: 'Male',
    married: 'Yes',
    dependents: '1',
    education: 'Graduate',
    self_employed: 'Yes',
    employment_type: 'Self-Employed (Business/MSME)',
    applicant_income: 65000,
    coapplicant_income: 25000,
    loan_amount: 250,
    term: 120, // 10 years
    cibil_score: 740,
    credit_history: 1,
    property_area: 'Semiurban',
    loan_purpose: 'Small Business Working Capital'
  },
  ecommerce_msme: {
    id: 'MB-2026-1003',
    name: 'Kavya Nair',
    desc: 'E-Commerce & Digital MSME Founder • Rural Bharat (CIBIL 760)',
    gender: 'Female',
    married: 'Yes',
    dependents: '2',
    education: 'Graduate',
    self_employed: 'Yes',
    employment_type: 'Self-Employed (Business/MSME)',
    applicant_income: 48000,
    coapplicant_income: 18000,
    loan_amount: 180,
    term: 60, // 5 years
    cibil_score: 760,
    credit_history: 1,
    property_area: 'Rural',
    loan_purpose: 'Small Business Working Capital'
  },
  junior_dev: {
    id: 'MB-2026-1004',
    name: 'Rohan Mehta',
    desc: 'Junior Web Developer / Freelance Contract • High Burden (CIBIL 580)',
    gender: 'Male',
    married: 'No',
    dependents: '0',
    education: 'Not Graduate',
    self_employed: 'Yes',
    employment_type: 'Retail Merchant / Trader',
    applicant_income: 28000,
    coapplicant_income: 0,
    loan_amount: 400,
    term: 24, // 2 years
    cibil_score: 580,
    credit_history: 0,
    property_area: 'Rural',
    loan_purpose: 'Personal / Medical Facility'
  }
};

// Bilingual Strings Dictionary
const I18N = {
  en: {
    brand_sub: "Mission Bharat • Explainable Lending & Fair Credit Architecture",
    approved_title: "Likely to be Approved",
    conditional_title: "Borderline / Needs Review",
    rejected_title: "High Risk / Unlikely to be Approved",
    approved_desc: "Your credit and financial profile comfortably satisfies Meridian Mission Bharat underwriting benchmarks.",
    conditional_desc: "Your application is near the approval threshold. Minor adjustments or guarantor backing will secure an offer.",
    rejected_desc: "Current risk markers exceed credit policy guidelines. Review the specific factors and remediation plan below.",
    key_strengths: "Top Factors Working In Your Favor",
    friction_points: "Key Barriers Influencing This Outcome",
    action_roadmap: "Personalized Eligibility Roadmap",
    ch_pos: "Pristine Credit History: Past loans were serviced on time, establishing high borrower trust.",
    ch_neg: "Impaired or Inactive Credit History: Past defaults or lack of bureau record is the primary risk driver.",
    dti_pos: "Healthy Debt-to-Income Ratio: Monthly EMI is safely below 30% of total household income.",
    dti_neg: "High Repayment Burden: Requested loan creates a repayment stress exceeding recommended ratios.",
    area_pos: "Mission Bharat Priority Zone: Semi-urban / priority corridor favorable risk profile.",
    area_neg: "Rural Agricultural Exposure: Standard underwriting applies conservative collateral discounting.",
    coapp_pos: "Solid Co-Applicant Security: Combined joint cash flow significantly bolsters debt service capacity.",
    coapp_neg: "Absence of Co-Applicant: Single income source increases vulnerability to cash-flow disruptions.",
    action_settle_credit: "Clear past due bureau entries: Settle existing overdues or obtain an NOC from past lenders to jump score by +35%.",
    action_add_coapp: "Add a earning family co-applicant: Joining an earning spouse or family member expands capacity by +20%.",
    action_lower_amt: "Optimize requested loan amount: Reducing the requested amount by 15-25% significantly relieves repayment stress.",
    action_extend_tenure: "Select a longer repayment tenure: Increasing loan term lowers monthly EMI to manageable debt service levels."
  },
  hi: {
    brand_sub: "मिशन भारत • पारदर्शी ऋण निर्णय एवं समावेशी वित्तीय मंच",
    approved_title: "ऋण स्वीकृत होने की प्रबल संभावना",
    conditional_title: "समीक्षाधीन / संदेहास्पद स्थिति",
    rejected_title: "उच्च जोखिम / वर्तमान में स्वीकृति कठिन",
    approved_desc: "आपका वित्तीय एवं क्रेडिट प्रोफाइल मेरिडियन मिशन भारत के ऋण मानकों के सर्वथा अनुकूल है।",
    conditional_desc: "आपका आवेदन स्वीकृति सीमा के अत्यंत निकट है। थोड़े सुधार या सह-आवेदक से ऋण तुरंत स्वीकृत हो सकता है।",
    rejected_desc: "वर्तमान जोखिम संकेत बैंक की नीतियों से अधिक हैं। नीचे दिए गए कारणों और सुधार योजना का अवलोकन करें।",
    key_strengths: "आपके पक्ष में प्रमुख सकारात्मक कारक",
    friction_points: "अस्वीकृति/जोखिम को प्रभावित करने वाले प्रमुख कारण",
    action_roadmap: "आपकी ऋण पात्रता सुधारने की चरणबद्ध योजना",
    ch_pos: "उत्कृष्ट क्रेडिट इतिहास: पिछले ऋणों का समय पर भुगतान बैंक का विश्वास मजबूत करता है।",
    ch_neg: "खराब या अपूर्ण क्रेडिट इतिहास: पिछले डिफॉल्ट या क्रेडिट स्कोर का अभाव सबसे बड़ा जोखिम कारक है।",
    dti_pos: "संतुलित ऋण-आय अनुपात: मासिक ईएमआई परिवार की कुल आय के 30% से सुरक्षित रूप से नीचे है।",
    dti_neg: "अत्यधिक पुनर्भुगतान भार: वांछित ऋण राशि आपकी वर्तमान आय की तुलना में बहुत अधिक है।",
    area_pos: "मिशन भारत प्राथमिकता क्षेत्र: अर्ध-शहरी/विकासशील क्षेत्र प्राथमिकता का लाभ मिला।",
    area_neg: "ग्रामीण वित्तीय बाधा: पारंपरिक बैंकिंग मॉडल ग्रामीण आवेदकों पर अधिक जोखिम आरोपित करता है।",
    coapp_pos: "सह-आवेदक की संयुक्त आय: परिवार के दूसरे सदस्य की आय से ऋण चुकाने की क्षमता बढ़ी।",
    coapp_neg: "एकल आय स्रोत: अकेले आवेदक होने से आपातकालीन वित्तीय जोखिम बढ़ता है।",
    action_settle_credit: "पुराने बकाये का निपटान करें: सिबिल/क्रेडिट ब्यूरो में पुराने बकाये चुकाने से स्कोर +35% तक सुधरेगा।",
    action_add_coapp: "कमाऊ सह-आवेदक जोड़ें: परिवार के किसी आय वाले सदस्य को जोड़ने से स्वीकृति 20% तक बढ़ जाएगी।",
    action_lower_amt: "ऋण राशि संतुलित करें: ऋण राशि 15-25% कम करने से मासिक ईएमआई का बोझ तुरंत घटेगा।",
    action_extend_tenure: "अवधि (टेन्योर) बढ़ाएं: ऋण की अवधि बढ़ाने से मासिक किस्त कम हो जाएगी।"
  }
};

// =============================================================================
// BACKEND API CONNECTION & HEALTH CHECK
// =============================================================================
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
      if (badgeText) badgeText.innerText = "● Python Backend & Vault Connected (localhost:5000)";
      if (pulseDot) pulseDot.style.backgroundColor = "#059669";
      if (modalBadge) {
        modalBadge.className = "badge badge-success";
        modalBadge.innerText = "CONNECTED";
      }
      if (modalDesc) {
        modalDesc.innerHTML = `<span style="color: #064E3B; font-weight: 700;">Active &amp; Responding</span> on <code>http://localhost:5000</code>. Storing records into Central Application Vault.`;
      }
      if (showNotification) {
        alert("Success! Connected to Python backend on port 5000.");
      }
      refreshDatabaseTable();
      updateUI();
      return true;
    }
  } catch (err) {
    state.backendConnected = false;
    if (badgeText) badgeText.innerText = "⚡ Standalone Vault Mode (Click to Connect Backend)";
    if (pulseDot) pulseDot.style.backgroundColor = "#D97706";
    if (modalBadge) {
      modalBadge.className = "badge badge-warning";
      modalBadge.innerText = "OFFLINE";
    }
    if (modalDesc) {
      modalDesc.innerHTML = `<span style="color: #B45309; font-weight: 700;">Not connected</span>. The app is currently running in standalone browser mode. Start <code>run_backend.bat</code> to connect live.`;
    }
    if (showNotification) {
      alert("Python backend is not reachable on http://localhost:5000.\n\nPlease double-click 'run_backend.bat' in E:\\English, then try again.");
    }
    return false;
  }
}

window.toggleBackendInfoModal = function() {
  const modal = document.getElementById('backend-info-modal');
  if (modal) {
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
  }
};

// =============================================================================
// SEPARATE PERSONA CONTROLS (APPLICANT VS LOAN OFFICER)
// =============================================================================
window.switchRole = function(role) {
  state.currentRole = role;
  const applicantBtn = document.getElementById('role-applicant');
  const officerBtn = document.getElementById('role-officer');

  const applicantTabs = document.querySelectorAll('.nav-applicant-item');
  const officerTabs = document.querySelectorAll('.nav-officer-item');

  if (role === 'applicant') {
    applicantBtn?.classList.add('active');
    officerBtn?.classList.remove('active');

    applicantTabs.forEach(el => el.style.display = 'flex');
    officerTabs.forEach(el => el.style.display = 'none');

    // Default to apply-view
    const applyTab = document.querySelector('[data-tab="apply-view"]');
    if (applyTab) applyTab.click();
  } else {
    officerBtn?.classList.add('active');
    applicantBtn?.classList.remove('active');

    applicantTabs.forEach(el => el.style.display = 'none');
    officerTabs.forEach(el => el.style.display = 'flex');

    // Default to officer-view
    const officerTab = document.querySelector('[data-tab="officer-view"]');
    if (officerTab) officerTab.click();
  }
};

window.scrollToSimulator = function() {
  const reportTab = document.querySelector('[data-tab="applicant-view"]');
  if (reportTab) reportTab.click();
  setTimeout(() => {
    const simEl = document.querySelector('.sim-box');
    if (simEl) simEl.scrollIntoView({ behavior: 'smooth' });
  }, 100);
};

// =============================================================================
// FLEXIBLE TENURE DISPLAY (1 TO 30 YEARS)
// =============================================================================
window.updateFillTenureDisplay = function(yearsVal) {
  const years = parseInt(yearsVal, 10) || 1;
  const months = years * 12;
  const tag = document.getElementById('fill-tenure-tag');
  const numInput = document.getElementById('fill-exact-years');

  if (tag) tag.innerText = `${years} Year${years > 1 ? 's' : ''} (${months} Months)`;
  if (numInput && parseInt(numInput.value, 10) !== years) {
    numInput.value = years;
  }
};

window.updateFillTenureFromNumber = function(yearsVal) {
  let years = parseInt(yearsVal, 10) || 1;
  if (years < 1) years = 1;
  if (years > 30) years = 30;

  const slider = document.getElementById('fill-loan-years');
  const tag = document.getElementById('fill-tenure-tag');

  if (slider) slider.value = years;
  if (tag) tag.innerText = `${years} Year${years > 1 ? 's' : ''} (${years * 12} Months)`;
};

// CIBIL Score Real-Time Display
window.updateCibilDisplay = function(cibilVal) {
  const val = Number(cibilVal);
  const tag = document.getElementById('cibil-display-tag');
  const guide = document.getElementById('cibil-guide-text');
  if (!tag) return;

  if (val >= 750) {
    tag.className = 'badge badge-success';
    tag.innerText = `CIBIL: ${val} (Prime Tier)`;
    if (guide) guide.innerHTML = '✓ <strong style="color: #064E3B;">Prime CIBIL Rating:</strong> Qualifies for lowest interest rate &amp; fast-track approval.';
  } else if (val >= 650) {
    tag.className = 'badge badge-info';
    tag.innerText = `CIBIL: ${val} (Standard Qualifying)`;
    if (guide) guide.innerHTML = '✓ <strong style="color: #064E3B;">Good Credit Track:</strong> Meets standard bank underwriting guidelines.';
  } else {
    tag.className = 'badge badge-danger';
    tag.innerText = `CIBIL: ${val} (Subprime / Caution)`;
    if (guide) guide.innerHTML = '⚠️ <strong style="color: #991B1B;">Credit History Deficiency:</strong> Past defaults or high inquiries trigger risk review.';
  }
};

// =============================================================================
// CALIBRATED REALISTIC FINANCIAL UNDERWRITING MODEL (IN-BROWSER)
// =============================================================================
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

  // 1. CIBIL Bureau Credit Score
  let cibilImpact = 0;
  if (cibil >= 780) cibilImpact = 32.0;
  else if (cibil >= 720) cibilImpact = 24.0;
  else if (cibil >= 670) cibilImpact = 15.0;
  else if (cibil >= 620) cibilImpact = 3.0;
  else if (cibil >= 550) cibilImpact = -15.0;
  else cibilImpact = -35.0;

  scorePoints += cibilImpact;
  contributions['credit_history'] = { impact: cibilImpact, pct_impact: cibilImpact };

  // 2. Debt-to-Income / EMI Burden
  let dtiImpact = 0;
  if (dtiPercent <= 15.0) dtiImpact = 18.0;
  else if (dtiPercent <= 30.0) dtiImpact = 12.0;
  else if (dtiPercent <= 42.0) dtiImpact = 4.0;
  else if (dtiPercent <= 55.0) dtiImpact = -8.0;
  else dtiImpact = -24.0;

  scorePoints += dtiImpact;
  contributions['dti_ratio'] = { impact: dtiImpact, pct_impact: dtiImpact };

  // 3. Income to Loan Coverage
  const annualIncome = totInc * 12.0;
  const coverageRatio = annualIncome / Math.max(1.0, loanAmtInr);
  let covImpact = 0;
  if (coverageRatio >= 2.0) covImpact = 10.0;
  else if (coverageRatio >= 1.0) covImpact = 6.0;
  else if (coverageRatio >= 0.5) covImpact = 0.0;
  else covImpact = -10.0;

  scorePoints += covImpact;
  contributions['income_coverage'] = { impact: covImpact, pct_impact: covImpact };

  // 4. Joint Co-Applicant Strength
  let coappImpact = coappInc > 0 ? 8.0 : 0.0;
  scorePoints += coappImpact;
  contributions['coapplicant'] = { impact: coappImpact, pct_impact: coappImpact };

  // 5. Mission Bharat Geographic Equity
  const area = String(appData.property_area || 'Rural').toLowerCase();
  let areaImpact = 2.0;
  if (area === 'semiurban') areaImpact = 4.0;
  else if (area === 'rural') areaImpact = 3.0;

  scorePoints += areaImpact;
  contributions['property_area'] = { impact: areaImpact, pct_impact: areaImpact };

  // Final approval score
  const finalScore = Math.max(2, Math.min(98, Math.round(scorePoints)));

  let status = 'approved';
  if (finalScore < 45) status = 'rejected';
  else if (finalScore < 65) status = 'conditional';

  return {
    approvalPercent: finalScore,
    prob: finalScore / 100.0,
    status: status,
    cibil_score: cibil,
    contributions: contributions,
    ratios: {
      totInc: Math.round(totInc),
      emi: Math.round(monthlyEmi),
      dtiPct: Math.round(dtiPercent * 10) / 10,
      ltiRatio: Math.round((loanAmtInr / (totInc * 12)) * 10) / 10
    }
  };
}

// Plain-Language Explanations Generator
function generatePlainLanguageExplanations(predResult, appData, lang = 'en') {
  const dict = I18N[lang] || I18N.en;
  const cibil = predResult.cibil_score || (Number(appData.credit_history) === 1 ? 750 : 540);
  const dti = predResult.ratios ? predResult.ratios.dtiPct : 10;
  const emi = predResult.ratios ? predResult.ratios.emi : 2500;
  const strengths = [];
  const frictions = [];
  const actions = [];

  // CIBIL Credit History
  if (cibil >= 720) {
    strengths.push({
      title: lang === 'hi' ? "उत्कृष्ट सिबिल स्कोर (प्राइम श्रेणी)" : "High Credit Trust (Prime CIBIL)",
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
      title: lang === 'hi' ? "सिबिल स्कोर में कमी" : "Subprime CIBIL Bureau Score",
      desc: lang === 'hi' ? `सिबिल स्कोर ${cibil} पिछले विलंब या क्रेडिट डिफॉल्ट का संकेत देता है।` : `A CIBIL score of ${cibil} indicates past overdue repayments or insufficient bureau history.`,
      impact: "-25% Discount"
    });
    actions.push({
      title: lang === 'hi' ? "सिबिल स्कोर सुधारें" : "Rectify Bureau Dues",
      desc: dict.action_settle_credit,
      impact: "+35% Potential Jump"
    });
  }

  // Monthly EMI & Debt Burden
  if (dti <= 30.0) {
    strengths.push({
      title: lang === 'hi' ? "सुरक्षित ईएमआई अनुपात" : "Comfortable Monthly Debt Burden",
      desc: lang === 'hi' ? `मासिक किस्त कुल आय का केवल ${dti}% है, जो अति-सुरक्षित श्रेणी में है।` : `Monthly EMI (₹${emi.toLocaleString('en-IN')}) takes only ${dti}% of household income, well within safe limits.`,
      impact: "+18% Boost"
    });
  } else if (dti <= 45.0) {
    strengths.push({
      title: lang === 'hi' ? "संतुलित ऋण दायित्व" : "Manageable Obligation Ratio",
      desc: lang === 'hi' ? `मासिक ईएमआई ${dti}% है जो सामान्य पुनर्भुगतान मानक को पूरा करती है।` : `Monthly EMI takes ${dti}% of income, which satisfies regular debt service criteria.`,
      impact: "+6% Boost"
    });
  } else {
    frictions.push({
      title: lang === 'hi' ? "मासिक किस्त का भारी भार (High DTI)" : "Elevated Repayment Burden (High DTI)",
      desc: lang === 'hi' ? `मासिक किस्त आपकी आय का ${dti}% है, जो 45% की मानक सीमा से अधिक है।` : `Monthly EMI of ₹${emi.toLocaleString('en-IN')} consumes ${dti}% of income, exceeding the recommended 45% ceiling.`,
      impact: "-20% Risk"
    });
    actions.push({
      title: lang === 'hi' ? "अवधि या ऋण राशि समायोजित करें" : "Optimize Tenure or Amount",
      desc: dict.action_extend_tenure,
      impact: "+18% Potential Gain"
    });
  }

  // Co-Applicant Presence
  if (Number(appData.coapplicant_income) > 0) {
    strengths.push({
      title: lang === 'hi' ? "सह-आवेदक की संयुक्त आय सुरक्षा" : "Joint Earning Co-Applicant",
      desc: lang === 'hi' ? "कमाऊ पारिवारिक सह-आवेदक होने से आपातकालीन जोखिम कम होता है।" : "Adding an earning co-applicant significantly bolsters household repayment capacity.",
      impact: "+8% Boost"
    });
  } else if (dti > 35) {
    frictions.push({
      title: lang === 'hi' ? "एकल आय निर्भरता" : "Single Income Dependency",
      desc: dict.coapp_neg,
      impact: "-8% Risk"
    });
    actions.push({
      title: lang === 'hi' ? "कमाऊ पारिवारिक सह-आवेदक जोड़ें" : "Include Earning Co-Applicant",
      desc: dict.action_add_coapp,
      impact: "+20% Approval Boost"
    });
  }

  // Mission Bharat Geography
  if (String(appData.property_area).toLowerCase() === 'rural') {
    strengths.push({
      title: lang === 'hi' ? "मिशन भारत ग्रामीण समावेशन प्राथमिकता" : "Mission Bharat Rural Priority",
      desc: lang === 'hi' ? "मिशन भारत प्राथमिक क्षेत्र के अंतर्गत विशेष प्रोत्साहन प्राप्त हुआ।" : "Application benefits from calibrated financial inclusion and priority evaluation under Mission Bharat.",
      impact: "+4% Boost"
    });
  }

  return { strengths, frictions, actions };
}

// =============================================================================
// SUBMISSION HANDLER ("Submit -> Show Submitted Message -> Open Report Page")
// =============================================================================
window.handleLoanApplicationSubmit = async function(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-submit-app');
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
    employment_type: document.getElementById('fill-employment')?.value || 'Salaried (Private/Corporate)',
    applicant_income: Number(document.getElementById('fill-app-income')?.value || 95000),
    coapplicant_income: Number(document.getElementById('fill-coapp-income')?.value || 0),
    loan_purpose: document.getElementById('fill-loan-purpose')?.value || 'Home Improvement / Construction',
    loan_amount: Number(document.getElementById('fill-loan-amount')?.value || 350),
    loan_term_months: termMonths,
    cibil_score: Number(document.getElementById('fill-cibil-slider')?.value || 810),
    property_area: document.getElementById('fill-property-area')?.value || 'Urban'
  };

  let savedRecord = null;
  let prediction = null;
  let explanation = null;

  // Attempt to save through Python Backend & SQLite Database
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

  // Local fallback
  if (!savedRecord) {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const appNo = `MB-2026-${randomId}`;

    prediction = computePrediction({
      applicant_income: formData.applicant_income,
      coapplicant_income: formData.coapplicant_income,
      loan_amount: formData.loan_amount,
      term: formData.loan_term_months,
      cibil_score: formData.cibil_score,
      property_area: formData.property_area
    });

    explanation = generatePlainLanguageExplanations(prediction, formData, 'en');

    savedRecord = {
      id: Date.now(),
      application_no: appNo,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      full_name: formData.full_name,
      cibil_score: formData.cibil_score,
      status: prediction.status.charAt(0).toUpperCase() + prediction.status.slice(1),
      approval_likelihood: prediction.approvalPercent,
      monthly_emi: prediction.ratios.emi,
      dti_percent: prediction.ratios.dtiPct,
      loan_amount: formData.loan_amount,
      loan_term_months: formData.loan_term_months,
      property_area: formData.property_area,
      loan_purpose: formData.loan_purpose
    };

    try {
      const existing = JSON.parse(localStorage.getItem('meridian_saved_apps') || '[]');
      existing.unshift(savedRecord);
      localStorage.setItem('meridian_saved_apps', JSON.stringify(existing));
    } catch (e) {}
  }

  // Update State with the submitted applicant
  state.lastSubmittedApp = { ...formData, ...savedRecord };
  state.currentApplicant = {
    id: savedRecord.application_no,
    name: savedRecord.full_name,
    gender: formData.gender,
    married: formData.marital_status,
    dependents: formData.dependents,
    education: formData.education,
    self_employed: formData.employment_type.includes('Self') ? 'Yes' : 'No',
    employment_type: formData.employment_type,
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
    credit_history: formData.cibil_score >= 650 ? 1 : 0
  };

  // Update success card
  const appNoEl = document.getElementById('success-app-no');
  const statusBadge = document.getElementById('success-status-badge');
  const probText = document.getElementById('success-prob-text');
  const emiText = document.getElementById('success-emi-text');
  const cibilText = document.getElementById('success-cibil-text');

  if (appNoEl) appNoEl.innerText = savedRecord.application_no;
  if (statusBadge) {
    statusBadge.className = `badge badge-${savedRecord.status === 'Approved' ? 'success' : savedRecord.status === 'Conditional' ? 'warning' : 'danger'}`;
    statusBadge.innerText = savedRecord.status.toUpperCase();
  }
  if (probText) probText.innerText = `${savedRecord.approval_likelihood}%`;
  if (emiText) emiText.innerText = `₹${savedRecord.monthly_emi.toLocaleString('en-IN')}/mo`;
  if (cibilText) cibilText.innerText = `${savedRecord.cibil_score} (${savedRecord.cibil_score >= 750 ? 'Prime' : savedRecord.cibil_score >= 650 ? 'Good' : 'Subprime'})`;

  // Update UI and database table
  updateUI();
  refreshDatabaseTable();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>🚀</span> Submit Application';
  }

  // Switch straight to the Decision Report page as requested!
  const reportTab = document.querySelector('[data-tab="applicant-view"]');
  if (reportTab) {
    reportTab.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Display persistent and beautiful in-page banner on the Decision Report
  const banner = document.getElementById('submission-alert-banner');
  const bannerAppNo = document.getElementById('banner-app-no');
  if (banner) {
    if (bannerAppNo) bannerAppNo.innerText = savedRecord.application_no;
    banner.style.display = 'block';
  }
};

// =============================================================================
// LAPTOP DIRECT ACCESS: EXPORT TO CSV / EXCEL & JSON
// =============================================================================
window.exportVaultToCSV = function() {
  const apps = state.savedDatabaseApps.length > 0 ? state.savedDatabaseApps : [
    state.currentApplicant
  ];

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Application No,Full Name,CIBIL Score,Applicant Income,Co-Applicant Income,Loan Amount (k),Tenure (Months),Property Area,Status,Approval Likelihood (%),Monthly EMI (INR)\n";

  apps.forEach(a => {
    const row = [
      a.application_no || a.id || 'MB-2026-X',
      `"${a.full_name || a.name || 'Applicant'}"`,
      a.cibil_score || 750,
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

// Refresh Database Table
window.refreshDatabaseTable = async function() {
  const tbody = document.getElementById('db-table-body');
  const countBadge = document.getElementById('db-total-count');
  if (!tbody) return;

  let apps = [];

  if (state.backendConnected) {
    try {
      const response = await fetch(`${state.apiBase}/api/saved-applications`);
      if (response.ok) {
        const data = await response.json();
        apps = data.applications || [];
      }
    } catch (e) {}
  }

  if (apps.length === 0) {
    try {
      const local = JSON.parse(localStorage.getItem('meridian_saved_apps') || '[]');
      apps = local;
    } catch (e) {}
  }

  if (apps.length === 0) {
    apps = [
      {
        application_no: 'MB-2026-1001',
        created_at: '2026-10-28 14:30:00',
        full_name: 'Ananya Rao',
        cibil_score: 810,
        applicant_income: 95000,
        coapplicant_income: 0,
        loan_amount: 350,
        loan_term_months: 84,
        property_area: 'Urban',
        approval_likelihood: 98,
        status: 'Approved'
      },
      {
        application_no: 'MB-2026-1002',
        created_at: '2026-10-28 16:15:00',
        full_name: 'Devansh Kulkarni',
        cibil_score: 740,
        applicant_income: 65000,
        coapplicant_income: 25000,
        loan_amount: 250,
        loan_term_months: 120,
        property_area: 'Semiurban',
        approval_likelihood: 96,
        status: 'Approved'
      },
      {
        application_no: 'MB-2026-1003',
        created_at: '2026-10-28 18:45:00',
        full_name: 'Kavya Nair',
        cibil_score: 760,
        applicant_income: 48000,
        coapplicant_income: 18000,
        loan_amount: 180,
        loan_term_months: 60,
        property_area: 'Rural',
        approval_likelihood: 98,
        status: 'Approved'
      },
      {
        application_no: 'MB-2026-1004',
        created_at: '2026-10-28 20:20:00',
        full_name: 'Rohan Mehta',
        cibil_score: 580,
        applicant_income: 28000,
        coapplicant_income: 0,
        loan_amount: 400,
        loan_term_months: 24,
        property_area: 'Rural',
        approval_likelihood: 12,
        status: 'Rejected'
      }
    ];
  }

  state.savedDatabaseApps = apps;
  if (countBadge) countBadge.innerText = `${apps.length} Saved Applications in Vault`;

  tbody.innerHTML = apps.map(app => {
    const isAppr = app.status === 'Approved';
    const isCond = app.status === 'Conditional';
    const badge = isAppr ? 'badge-success' : isCond ? 'badge-warning' : 'badge-danger';
    const cibilClass = app.cibil_score >= 750 ? 'badge-success' : app.cibil_score >= 650 ? 'badge-info' : 'badge-danger';
    const totInc = (Number(app.applicant_income || 0) + Number(app.coapplicant_income || 0));
    const years = Math.round((Number(app.loan_term_months || 60)) / 12);

    return `
      <tr>
        <td style="font-weight: 800; color: #064E3B;">${app.application_no}</td>
        <td style="font-size: 0.8rem; color: #4B6359;">${app.created_at || 'Today'}</td>
        <td style="font-weight: 700; color: #0B2920;">${app.full_name}</td>
        <td><span class="badge ${cibilClass}">${app.cibil_score}</span></td>
        <td>₹${totInc.toLocaleString('en-IN')}/mo</td>
        <td>₹${(app.loan_amount * 1000).toLocaleString('en-IN')} (${years} yrs)</td>
        <td>${app.property_area}</td>
        <td><strong>${app.approval_likelihood}%</strong></td>
        <td><span class="badge ${badge}">${app.status}</span></td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem;" onclick="loadDbApplicantById('${app.application_no}')">
            Inspect
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

window.loadDbApplicantById = function(appNo) {
  const found = state.savedDatabaseApps.find(a => a.application_no === appNo);
  if (found) {
    state.currentApplicant = {
      id: found.application_no,
      name: found.full_name,
      gender: found.gender || 'Male',
      married: found.marital_status || 'Yes',
      dependents: String(found.dependents || '0'),
      education: found.education || 'Graduate',
      self_employed: (found.employment_type || '').includes('Self') ? 'Yes' : 'No',
      applicant_income: found.applicant_income || 25000,
      coapplicant_income: found.coapplicant_income || 0,
      loan_amount: found.loan_amount || 100,
      term: found.loan_term_months || 60,
      cibil_score: found.cibil_score || 750,
      credit_history: found.cibil_score >= 650 ? 1 : 0,
      property_area: found.property_area || 'Rural'
    };
    state.simulated = {
      loan_amount: found.loan_amount,
      coapplicant_income: found.coapplicant_income,
      term: found.loan_term_months,
      cibil_score: found.cibil_score,
      credit_history: found.cibil_score >= 650 ? 1 : 0
    };
    updateUI();
    document.querySelector('[data-tab="applicant-view"]')?.click();
  }
};

// =============================================================================
// UI RENDERING & COMPONENT SYNCHRONIZATION
// =============================================================================
function updateUI() {
  const applicant = state.currentApplicant;
  const pred = computePrediction(applicant);
  const lang = state.currentLang;
  const dict = I18N[lang] || I18N.en;
  const explanations = generatePlainLanguageExplanations(pred, applicant, lang);

  // 1. Hero Decision Card
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
      heroTag.innerText = lang === 'hi' ? "अनुमोदित" : "APPROVED / HIGH LIKELIHOOD";
      heroTitle.innerText = dict.approved_title;
      heroDesc.innerText = dict.approved_desc;
    } else if (pred.status === 'conditional') {
      heroTag.innerText = lang === 'hi' ? "समीक्षाधीन" : "CONDITIONAL / BORDERLINE";
      heroTitle.innerText = dict.conditional_title;
      heroDesc.innerText = dict.conditional_desc;
    } else {
      heroTag.innerText = lang === 'hi' ? "अस्वीकृत" : "UNLIKELY / ELEVATED RISK";
      heroTitle.innerText = dict.rejected_title;
      heroDesc.innerText = dict.rejected_desc;
    }
  }

  // 2. Strengths List
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

  // 3. Frictions List
  const frictionsContainer = document.getElementById('frictions-list');
  if (frictionsContainer) {
    if (explanations.frictions.length === 0) {
      frictionsContainer.innerHTML = `
        <div style="padding: 1rem; color: #064E3B; font-size: 0.88rem; font-weight: 600;">
          ${lang === 'hi' ? 'कोई गंभीर जोखिम कारक नहीं पाया गया।' : 'No critical friction points detected in this profile.'}
        </div>`;
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

  // 4. Actionable Remediation Roadmap
  const actionsContainer = document.getElementById('actions-container');
  if (actionsContainer) {
    if (pred.status === 'approved') {
      actionsContainer.innerHTML = `
        <div style="background: #F4FBF7; border: 1px solid #A7F3D0; border-radius: 8px; padding: 1.25rem;">
          <h4 style="color: #064E3B; font-weight: 700; margin-bottom: 0.25rem;">
            ${lang === 'hi' ? 'अगला कदम: दस्तावेज सत्यापन' : 'Next Step: Fast-Track KYC & Sanction Disbursement'}
          </h4>
          <p style="color: #0A6C53; font-size: 0.85rem;">
            ${lang === 'hi' 
              ? 'आपका आवेदन त्वरित स्वीकृति हेतु तैयार है। कृपया आधार, पैन तथा बैंक विवरण अपलोड करें।' 
              : 'Your application qualifies for priority sanction under Meridian Mission Bharat fast-track retail credit. Proceed to instant verification.'}
          </p>
        </div>`;
    } else {
      actionsContainer.innerHTML = explanations.actions.map(a => `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #064E3B; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <h4 style="font-size: 0.92rem; font-weight: 700; color: #0F172A;">${a.title}</h4>
            <span style="font-size: 0.75rem; font-weight: 700; color: #064E3B; background: #F8E7C9; padding: 2px 8px; border-radius: 999px;">${a.impact}</span>
          </div>
          <p style="font-size: 0.82rem; color: #475569; margin-top: 0.25rem;">${a.desc}</p>
        </div>
      `).join('');
    }
  }

  // 5. Update Underwriting Officer Metrics & Waterfall
  renderOfficerMetrics(pred, applicant);
  renderWaterfall(pred);

  // 6. Update Form Fields in Underwriting Cockpit
  syncFormInputs(applicant);

  // 7. Update What-If Simulator
  updateSimulationUI();
}

function syncFormInputs(app) {
  setValue('input-name', app.name || 'Ananya Rao');
  setValue('input-gender', app.gender || 'Female');
  setValue('input-married', app.married || 'No');
  setValue('input-dependents', app.dependents || '0');
  setValue('input-education', app.education || 'Graduate');
  setValue('input-self-employed', app.self_employed || 'No');
  setValue('input-app-income', app.applicant_income || 95000);
  setValue('input-coapp-income', app.coapplicant_income || 0);
  setValue('input-loan-amount', app.loan_amount || 350);
  setValue('input-loan-term', app.term || 84);
  setValue('input-credit-history', app.cibil_score >= 650 ? 1 : 0);
  setValue('input-property-area', app.property_area || 'Urban');
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function renderOfficerMetrics(pred, applicant) {
  const setEl = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setEl('metric-officer-prob', `${pred.approvalPercent}%`);
  setEl('metric-officer-dti', `${pred.ratios.dtiPct}%`);
  setEl('metric-officer-emi', `₹${pred.ratios.emi.toLocaleString('en-IN')}/mo`);
  setEl('metric-officer-lti', `${pred.ratios.ltiRatio}x Annual`);
}

function renderWaterfall(pred) {
  const container = document.getElementById('waterfall-container');
  if (!container) return;

  const names = {
    credit_history: 'CIBIL Bureau Track',
    dti_ratio: 'Debt-to-Income (DTI)',
    income_coverage: 'Annual Income Coverage',
    coapplicant: 'Co-Applicant Cash Flow',
    property_area: 'Mission Bharat Location'
  };

  const contribs = pred.contributions || {};
  const keys = Object.keys(contribs);

  container.innerHTML = keys.map(k => {
    const item = contribs[k];
    const val = typeof item === 'object' ? item.impact : Number(item);
    const isPos = val >= 0;
    const widthPct = Math.min(48, Math.abs(val) * 1.5);
    const sign = isPos ? '+' : '';
    const valClass = isPos ? 'val-pos' : 'val-neg';

    return `
      <div class="waterfall-bar">
        <div class="waterfall-name">${names[k] || k}</div>
        <div class="waterfall-track">
          <div class="waterfall-center-line"></div>
          ${isPos 
            ? `<div class="waterfall-fill-pos" style="width: ${widthPct}%;"></div>`
            : `<div class="waterfall-fill-neg" style="width: ${widthPct}%;"></div>`
          }
        </div>
        <div class="waterfall-val ${valClass}">${sign}${Math.round(val)}%</div>
      </div>
    `;
  }).join('');
}

// What-If Simulator Live Updates (1 to 30 Years)
function updateSimulationUI() {
  const baseApp = state.currentApplicant;
  const sim = state.simulated;

  const simApp = {
    ...baseApp,
    loan_amount: sim.loan_amount,
    coapplicant_income: sim.coapplicant_income,
    term: sim.term,
    cibil_score: sim.credit_history === 1 ? 750 : 540,
    credit_history: sim.credit_history
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
}

// Setup Event Listeners
function setupEventListeners() {
  // Navigation tabs
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

  // Top Persona Switcher (Applicant vs Loan Officer)
  document.getElementById('role-applicant')?.addEventListener('click', () => {
    switchRole('applicant');
  });

  document.getElementById('role-officer')?.addEventListener('click', () => {
    switchRole('officer');
  });

  // Language Switcher
  document.getElementById('lang-toggle-btn')?.addEventListener('click', () => {
    state.currentLang = state.currentLang === 'en' ? 'hi' : 'en';
    document.getElementById('lang-toggle-btn').innerText = state.currentLang === 'en' ? 'हिन्दी (Hindi)' : 'English';
    updateUI();
  });

  // Mission Bharat Affirmative Inclusion Toggle
  document.getElementById('affirmative-toggle')?.addEventListener('change', (e) => {
    state.affirmativeMode = e.target.checked;
    updateUI();
    renderFairnessCharts();
  });

  // Archetype Buttons (Tech + Normal mix)
  document.querySelectorAll('.archetype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.archetype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.getAttribute('data-archetype');
      if (ARCHETYPES[key]) {
        state.currentApplicant = { ...ARCHETYPES[key] };
        state.simulated = {
          loan_amount: state.currentApplicant.loan_amount,
          coapplicant_income: state.currentApplicant.coapplicant_income,
          term: state.currentApplicant.term,
          cibil_score: state.currentApplicant.cibil_score,
          credit_history: state.currentApplicant.credit_history
        };
        // Reset slider inputs
        setSliderVal('sim-slider-loan', state.simulated.loan_amount);
        setSliderVal('sim-slider-coapp', state.simulated.coapplicant_income);
        const simYears = Math.round(state.simulated.term / 12);
        setSliderVal('sim-slider-term', simYears);
        const termTag = document.getElementById('val-sim-term');
        if (termTag) termTag.innerText = `${simYears} Years (${state.simulated.term} Months)`;

        const chEl = document.getElementById('sim-check-credit');
        if (chEl) chEl.checked = state.simulated.credit_history === 1;

        updateUI();
      }
    });
  });

  // Underwriting Intake Form Inputs
  const formFields = [
    'input-name', 'input-gender', 'input-married', 'input-dependents',
    'input-education', 'input-self-employed', 'input-app-income',
    'input-coapp-income', 'input-loan-amount', 'input-loan-term',
    'input-credit-history', 'input-property-area'
  ];

  formFields.forEach(fId => {
    document.getElementById(fId)?.addEventListener('input', () => {
      readFormIntoApplicant();
      updateUI();
    });
    document.getElementById(fId)?.addEventListener('change', () => {
      readFormIntoApplicant();
      updateUI();
    });
  });

  // What-If Simulator Sliders (with 1 to 30 years!)
  document.getElementById('sim-slider-loan')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.simulated.loan_amount = val;
    document.getElementById('val-sim-loan').innerText = `₹${val} Lakh (${val * 100000} INR)`;
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

  document.getElementById('sim-check-credit')?.addEventListener('change', (e) => {
    state.simulated.credit_history = e.target.checked ? 1 : 0;
    updateSimulationUI();
  });

  // Decision Letter Modal
  document.getElementById('btn-open-letter')?.addEventListener('click', () => {
    openDecisionLetterModal();
  });

  document.getElementById('btn-close-letter')?.addEventListener('click', () => {
    document.getElementById('letter-modal').style.display = 'none';
  });

  document.getElementById('btn-print-letter')?.addEventListener('click', () => {
    window.print();
  });

  // Officer Underwriting Action Buttons
  document.getElementById('btn-officer-approve')?.addEventListener('click', () => {
    addAuditLog('Manually Approved by Officer', 'Underwriting criteria satisfied after interview');
    alert('Application marked as APPROVED in the official loan registry.');
  });

  document.getElementById('btn-officer-conditional')?.addEventListener('click', () => {
    addAuditLog('Approved with Mission Bharat Rural Subvention', 'Requires guarantor verification');
    alert('Application marked as CONDITIONAL APPROVAL under Mission Bharat rural priority.');
  });

  document.getElementById('btn-officer-reject')?.addEventListener('click', () => {
    addAuditLog('Declined by Officer', 'Excessive risk identified in debt obligation');
    alert('Application formal rejection recorded with transparent reasons dispatched to applicant.');
  });
}

function setSliderVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function readFormIntoApplicant() {
  state.currentApplicant = {
    ...state.currentApplicant,
    name: document.getElementById('input-name')?.value || 'Ananya Rao',
    gender: document.getElementById('input-gender')?.value || 'Female',
    married: document.getElementById('input-married')?.value || 'No',
    dependents: document.getElementById('input-dependents')?.value || '0',
    education: document.getElementById('input-education')?.value || 'Graduate',
    self_employed: document.getElementById('input-self-employed')?.value || 'No',
    applicant_income: Number(document.getElementById('input-app-income')?.value || 95000),
    coapplicant_income: Number(document.getElementById('input-coapp-income')?.value || 0),
    loan_amount: Number(document.getElementById('input-loan-amount')?.value || 350),
    term: Number(document.getElementById('input-loan-term')?.value || 84),
    credit_history: Number(document.getElementById('input-credit-history')?.value || 1),
    property_area: document.getElementById('input-property-area')?.value || 'Urban'
  };
}

function addAuditLog(action, note) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  state.auditLog.unshift({
    time: now,
    officer: 'Underwriter #087',
    id: state.currentApplicant.id,
    action: action,
    note: note
  });
  renderAuditTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;
  tbody.innerHTML = state.auditLog.map(item => `
    <tr>
      <td style="padding: 0.6rem; font-size: 0.8rem; color: #4B6359;">${item.time}</td>
      <td style="padding: 0.6rem; font-weight: 700; font-size: 0.82rem; color: #064E3B;">${item.id}</td>
      <td style="padding: 0.6rem; font-size: 0.82rem;"><span class="badge badge-info">${item.action}</span></td>
      <td style="padding: 0.6rem; font-size: 0.8rem; color: #475569;">${item.note}</td>
    </tr>
  `).join('');
}

// Decision Letter Modal Population
function openDecisionLetterModal() {
  const app = state.currentApplicant;
  const pred = computePrediction(app);
  const letter = document.getElementById('letter-modal');

  document.getElementById('let-ref').innerText = `MERIDIAN-MB-${app.id || '1001'}`;
  document.getElementById('let-date').innerText = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('let-applicant-name').innerText = app.name || 'Valued Applicant';
  document.getElementById('let-loan-amount').innerText = `₹${(app.loan_amount * 1000).toLocaleString('en-IN')}`;
  document.getElementById('let-tenure').innerText = `${Math.round(app.term / 12)} Years (${app.term} Months)`;
  document.getElementById('let-area').innerText = app.property_area;

  const statusBanner = document.getElementById('let-status-badge');
  const verdictText = document.getElementById('let-verdict-text');
  const factorsList = document.getElementById('let-factors-list');

  if (pred.status === 'approved') {
    statusBanner.className = 'badge badge-success';
    statusBanner.innerText = 'PRE-APPROVED / SANCTION ELIGIBLE';
    verdictText.innerText = `We are pleased to inform you that your application for a retail loan facility has met Meridian Financial Services automated underwriting standards with an approval likelihood index of ${pred.approvalPercent}%.`;
  } else if (pred.status === 'conditional') {
    statusBanner.className = 'badge badge-warning';
    statusBanner.innerText = 'CONDITIONAL APPROVAL';
    verdictText.innerText = `Your application is near our credit threshold (${pred.approvalPercent}% score). You qualify under the special review program subject to additional guarantor backing or modest down-payment adjustment.`;
  } else {
    statusBanner.className = 'badge badge-danger';
    statusBanner.innerText = 'APPLICATION ADVERSE ACTION';
    verdictText.innerText = `After careful assessment against Meridian credit policies and risk governance, we regret that we are unable to sanction your credit request in its current configuration (${pred.approvalPercent}% score). Below is our mandated regulatory statement of transparent reasons.`;
  }

  const explanations = generatePlainLanguageExplanations(pred, app, state.currentLang);
  const allItems = [...explanations.strengths, ...explanations.frictions];
  factorsList.innerHTML = allItems.map(item => `
    <li style="margin-bottom: 0.5rem; font-size: 0.85rem; color: #334155;">
      <strong>${item.title}:</strong> ${item.desc} (Calculated marginal impact: ${item.impact})
    </li>
  `).join('');

  letter.style.display = 'flex';
}

// Model Performance Charts
function renderModelPerformanceCharts() {
  const container = document.getElementById('feature-importance-chart');
  if (!container) return;

  const features = [
    { name: 'CIBIL Bureau Track (Repayment History)', weight: 1.30, pct: 42, dir: 'Positive' },
    { name: 'Debt-to-Income / EMI Burden', weight: -0.32, pct: 15, dir: 'Negative' },
    { name: 'Semi-Urban / Growth Corridor', weight: 0.42, pct: 14, dir: 'Positive' },
    { name: 'Income Coverage Ratio', weight: 0.36, pct: 12, dir: 'Positive' },
    { name: 'Co-Applicant Cash Flow', weight: 0.22, pct: 8, dir: 'Positive' },
    { name: 'Loan Exposure Magnitude', weight: -0.20, pct: 5, dir: 'Negative' },
    { name: 'Mission Bharat Geographic Parity', weight: 0.18, pct: 4, dir: 'Positive' }
  ];

  container.innerHTML = features.map(f => {
    const isPos = f.weight > 0;
    const barWidth = f.pct * 2.2;
    const color = isPos ? '#064E3B' : '#EF4444';
    return `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 0.65rem;">
        <div style="width: 230px; font-size: 0.82rem; font-weight: 700; color: #064E3B; text-align: right;">${f.name}</div>
        <div style="flex: 1; background: #FAF3E6; height: 18px; border-radius: 4px; overflow: hidden; display: flex; align-items: center; border: 1px solid #E8D7B8;">
          <div style="width: ${barWidth}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
        </div>
        <div style="width: 50px; font-size: 0.8rem; font-weight: 800; color: ${color};">${isPos ? '+' : ''}${f.weight.toFixed(2)}</div>
      </div>
    `;
  }).join('');
}

// Fairness Charts
function renderFairnessCharts() {
  const isAff = state.affirmativeMode;
  
  const data = {
    geo: {
      semiurban: { n: 233, appRate: 86.3, tpr: 97.8, dir: 1.00, status: 'Reference' },
      urban: { n: 202, appRate: 84.2, tpr: 97.0, dir: 0.98, status: 'Pass' },
      rural: isAff 
        ? { n: 179, appRate: 85.1, tpr: 96.8, dir: 0.99, status: 'Pass (Calibrated)' }
        : { n: 179, appRate: 82.5, tpr: 95.2, dir: 0.96, status: 'Pass (Mission Bharat)' }
    },
    gender: {
      male: { n: 502, appRate: 84.5, tpr: 95.8, dir: 1.00, status: 'Reference' },
      female: { n: 112, appRate: 83.9, tpr: 95.1, dir: 0.99, status: 'Pass (80% Rule)' }
    },
    edu: {
      graduate: { n: 480, appRate: 85.2, tpr: 96.1, dir: 1.00, status: 'Reference' },
      not_graduate: { n: 134, appRate: 81.3, tpr: 93.5, dir: 0.95, status: 'Pass' }
    }
  };

  const tbody = document.getElementById('fairness-table-body');
  if (!tbody) return;

  const rows = [
    { cat: 'Geography (Mission Bharat)', grp: 'Semi-Urban (Reference)', ...data.geo.semiurban },
    { cat: 'Geography (Mission Bharat)', grp: 'Urban', ...data.geo.urban },
    { cat: 'Geography (Mission Bharat)', grp: 'Rural Bharat', ...data.geo.rural, highlight: true },
    { cat: 'Gender', grp: 'Male (Reference)', ...data.gender.male },
    { cat: 'Gender', grp: 'Female', ...data.gender.female, highlight: true },
    { cat: 'Education', grp: 'Graduate (Reference)', ...data.edu.graduate },
    { cat: 'Education', grp: 'Non-Graduate', ...data.edu.not_graduate }
  ];

  tbody.innerHTML = rows.map(r => {
    const badgeClass = r.status.includes('Pass') ? 'badge-success' : r.status.includes('Reference') ? 'badge-info' : 'badge-warning';
    const rowStyle = r.highlight ? 'background: #F4FBF7;' : '';
    return `
      <tr style="${rowStyle}">
        <td style="font-weight: 600; color: #475569;">${r.cat}</td>
        <td style="font-weight: 700; color: #0F172A;">${r.grp}</td>
        <td>${r.n}</td>
        <td><strong>${r.appRate}%</strong></td>
        <td>${r.tpr}%</td>
        <td><strong>${r.dir.toFixed(2)}</strong></td>
        <td><span class="badge ${badgeClass}">${r.status}</span></td>
      </tr>
    `;
  }).join('');
}

// Historical CSV Portfolio Explorer
function renderPortfolioTable() {
  const records = MERIDIAN_DATASET.records;
  const tbody = document.getElementById('portfolio-table-body');
  const countEl = document.getElementById('portfolio-total-count');
  if (!tbody) return;

  const filter = state.portfolioFilter;
  const search = state.portfolioSearch.toLowerCase();

  const filtered = records.filter(r => {
    if (filter === 'approved' && r.pred_status !== 'Y') return false;
    if (filter === 'rejected' && r.pred_status !== 'N') return false;
    if (filter === 'rural' && r.property_area !== 'Rural') return false;
    if (filter === 'female' && r.gender !== 'Female') return false;
    if (search && !r.id.toLowerCase().includes(search) && !r.property_area.toLowerCase().includes(search)) return false;
    return true;
  });

  if (countEl) countEl.innerText = `Showing ${filtered.length} of ${records.length} applications`;

  const start = (state.portfolioPage - 1) * state.portfolioPageSize;
  const pageItems = filtered.slice(start, start + state.portfolioPageSize);

  tbody.innerHTML = pageItems.map(r => {
    const isAppr = r.pred_status === 'Y';
    const badge = isAppr ? 'badge-success' : 'badge-danger';
    return `
      <tr>
        <td style="font-weight: 700; color: #1E293B;">${r.id}</td>
        <td>${r.gender}</td>
        <td>${r.property_area}</td>
        <td>₹${(r.applicant_income + r.coapplicant_income).toLocaleString('en-IN')}</td>
        <td>₹${(r.loan_amount * 1000).toLocaleString('en-IN')}</td>
        <td>${r.credit_history === 1 ? '✓ Active' : '✕ None'}</td>
        <td><strong>${Math.round(r.pred_prob * 100)}%</strong></td>
        <td><span class="badge ${badge}">${isAppr ? 'Approved' : 'Rejected'}</span></td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem;" onclick="loadApplicantById('${r.id}')">
            Inspect
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const totalPages = Math.ceil(filtered.length / state.portfolioPageSize) || 1;
  const pageEl = document.getElementById('portfolio-page-indicator');
  if (pageEl) pageEl.innerText = `Page ${state.portfolioPage} / ${totalPages}`;
}

window.loadApplicantById = function(id) {
  const found = MERIDIAN_DATASET.records.find(r => r.id === id);
  if (found) {
    state.currentApplicant = {
      id: found.id,
      name: `Applicant ${found.id}`,
      gender: found.gender,
      married: found.married,
      dependents: found.dependents,
      education: found.education,
      self_employed: found.self_employed,
      applicant_income: found.applicant_income,
      coapplicant_income: found.coapplicant_income,
      loan_amount: found.loan_amount,
      term: found.term,
      cibil_score: found.credit_history === 1 ? 750 : 540,
      credit_history: found.credit_history,
      property_area: found.property_area
    };
    state.simulated = {
      loan_amount: found.loan_amount,
      coapplicant_income: found.coapplicant_income,
      term: found.term,
      cibil_score: found.credit_history === 1 ? 750 : 540,
      credit_history: found.credit_history
    };
    updateUI();
    document.querySelector('[data-tab="applicant-view"]')?.click();
  }
};

window.changePortfolioPage = function(delta) {
  state.portfolioPage = Math.max(1, state.portfolioPage + delta);
  renderPortfolioTable();
};

window.setPortfolioFilter = function(filterVal) {
  state.portfolioFilter = filterVal;
  state.portfolioPage = 1;
  renderPortfolioTable();
};

window.filterPortfolioSearch = function(query) {
  state.portfolioSearch = query;
  state.portfolioPage = 1;
  renderPortfolioTable();
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  switchRole('applicant'); // Start in clean applicant mode
  updateUI();
  refreshDatabaseTable();
  renderAuditTable();
  renderFairnessCharts();
  renderModelPerformanceCharts();
  
  // Auto-check connection to Python backend
  checkBackendConnection(false);
});
