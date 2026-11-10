function resolveApiBase() {
  try {
    const params = new URLSearchParams(window.location.search);
    const paramApi = params.get('api');
    if (paramApi && paramApi.trim()) {
      const clean = paramApi.trim().replace(/\/+$/, '');
      localStorage.setItem('meridian_api_base', clean);
      return clean;
    }
    if (window.MERIDIAN_API_BASE) {
      return String(window.MERIDIAN_API_BASE).trim().replace(/\/+$/, '');
    }
    const stored = localStorage.getItem('meridian_api_base');
    if (stored && stored.trim()) {
      return stored.trim().replace(/\/+$/, '');
    }
    if (window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
  } catch (e) {}
  return 'http://localhost:5000';
}

const DEFAULT_OFFLINE_TITLE_EN = 'Portal Temporarily Offline';
const DEFAULT_OFFLINE_MSG_EN = 'Meridian FairLend AI is currently offline for scheduled maintenance. Online underwriting will resume shortly.';

function createBlankApplicantState() {
  return {
    id: '',
    name: '',
    gender: 'Female',
    married: 'No',
    dependents: '0',
    education: 'Graduate',
    self_employed: 'No',
    employment_type: 'Freelancing / Gig Economy / Contractor',
    salary_slip: 'Yes',
    applicant_income: 25000,
    coapplicant_income: 15000,
    loan_amount: 150000,
    term: 60,
    cibil_score: 760,
    credit_history: 1,
    property_area: 'Rural',
    loan_purpose: 'Home Improvement / Construction',
    status: 'Conditional',
    officer_status: 'Pending',
    officer_remarks: '',
    updated_at: ''
  };
}

const APPLICANT_TABS = new Set(['apply-view', 'applicant-view', 'database-view']);
const OFFICER_TABS = new Set(['officer-view', 'database-view', 'portfolio-view', 'model-view', 'fairness-view']);
let activePortal = 'applicant';

const state = {
  currentRole: 'applicant',
  currentLang: localStorage.getItem('meridian_lang') || 'en',
  currentTab: 'apply-view',
  hasApplied: false,
  affirmativeMode: false,
  backendConnected: false,
  backendHealthMeta: null,
  apiBase: resolveApiBase(),
  siteAvailability: {
    online: true,
    status: 'online',
    title: DEFAULT_OFFLINE_TITLE_EN,
    maintenance_message: DEFAULT_OFFLINE_MSG_EN,
    updated_by: 'System Administrator',
    updated_at: ''
  },
  backendPrediction: null,
  backendExplanation: null,
  currentApplicant: createBlankApplicantState(),
  simulated: {
    loan_amount: 150000,
    coapplicant_income: 15000,
    term: 60,
    cibil_score: 760,
    credit_history: 1,
    salary_slip: true
  },
  savedDatabaseApps: [],
  lastSubmittedApp: null,
  auditLog: [],
  otpStatus: {
    email_otp_configured: false,
    provider: null,
    require_otp_on_signup: false,
    require_otp_on_application: false,
    require_otp_on_forgot_password: true
  },
  portfolioPage: 1,
  portfolioPageSize: 10,
  portfolioFilter: 'all',
  portfolioSearch: ''
};

let currentAuthUser = null;
let currentAuthToken = null;
let forgotPasswordTargetRole = 'applicant';

const OTP_SCOPE_CONFIG = {
  signup_app: {
    purpose: 'signup',
    emailId: 'signup-app-email',
    otpId: 'signup-app-otp',
    sendBtnId: 'btn-send-otp-signup-app',
    verifyBtnId: 'btn-verify-otp-signup-app',
    badgeId: 'otp-badge-signup-app',
    statusId: 'otp-status-signup-app',
    boxId: 'otp-box-signup-app',
    defaultHintKey: 'otp_hint_signup'
  },
  signup_off: {
    purpose: 'signup',
    emailId: 'signup-off-email',
    otpId: 'signup-off-otp',
    sendBtnId: 'btn-send-otp-signup-off',
    verifyBtnId: 'btn-verify-otp-signup-off',
    badgeId: 'otp-badge-signup-off',
    statusId: 'otp-status-signup-off',
    boxId: 'otp-box-signup-off',
    defaultHintKey: 'otp_hint_signup'
  },
  application: {
    purpose: 'application',
    emailId: 'fill-email',
    otpId: 'fill-app-otp',
    sendBtnId: 'btn-send-otp-apply',
    verifyBtnId: 'btn-verify-otp-apply',
    badgeId: 'otp-badge-apply',
    statusId: 'otp-status-apply',
    boxId: 'otp-box-apply',
    defaultHintKey: 'otp_hint_apply'
  },
  forgot_password: {
    purpose: 'forgot_password',
    emailId: 'fp-email',
    otpId: 'fp-otp',
    sendBtnId: 'btn-send-otp-forgot',
    verifyBtnId: 'btn-verify-otp-forgot',
    badgeId: 'otp-badge-forgot',
    statusId: 'otp-status-forgot',
    boxId: null,
    defaultHintKey: 'otp_hint_forgot'
  }
};

const otpState = {
  signup_app: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' },
  signup_off: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' },
  application: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' },
  forgot_password: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' }
};

function syncOtpUIStates() {
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  Object.entries(OTP_SCOPE_CONFIG).forEach(([scope, cfg]) => {
    const s = otpState[scope];
    if (!s) return;
    const boxEl = cfg.boxId ? document.getElementById(cfg.boxId) : null;
    const badgeEl = document.getElementById(cfg.badgeId);
    const sendBtn = document.getElementById(cfg.sendBtnId);
    const verifyBtn = document.getElementById(cfg.verifyBtnId);
    const statusEl = document.getElementById(cfg.statusId);

    if (boxEl) {
      boxEl.classList.toggle('is-verified', Boolean(s.verified));
    }
    if (badgeEl) {
      if (s.verified) {
        badgeEl.className = 'otp-status-badge otp-badge-verified';
        badgeEl.innerText = dict.otp_badge_verified;
      } else {
        badgeEl.className = 'otp-status-badge otp-badge-pending';
        badgeEl.innerText = dict.otp_badge_pending;
      }
    }
    if (sendBtn) {
      if (s.cooldown > 0) {
        sendBtn.disabled = true;
        sendBtn.innerText = `${dict.btn_resend_otp} (${s.cooldown}s)`;
      } else {
        sendBtn.disabled = false;
        sendBtn.innerText = s.sentOnce ? dict.btn_resend_otp : dict.btn_send_otp;
      }
    }
    if (verifyBtn) {
      verifyBtn.disabled = Boolean(s.verified);
    }
    if (statusEl) {
      statusEl.classList.remove('is-success', 'is-error');
      if (s.statusKind === 'verified') {
        statusEl.classList.add('is-success');
        statusEl.innerText = hi
          ? `✅ ईमेल OTP सत्यापित: ${s.email}`
          : `✅ Email OTP verified: ${s.email}`;
      } else if (s.statusKind === 'sent') {
        statusEl.classList.add('is-success');
        statusEl.innerText = hi
          ? `✅ 6-अंकीय OTP ${s.email} पर भेजा गया (इनबॉक्स / स्पैम जांचें)।`
          : `✅ 6-digit OTP sent to ${s.email} (check Inbox / Spam).`;
      } else if (s.statusKind === 'unconfigured') {
        statusEl.classList.add('is-error');
        statusEl.innerText = dict.otp_hint_unconfigured;
      } else if (s.statusKind === 'error' && s.rawError) {
        statusEl.classList.add('is-error');
        statusEl.innerText = `⚠️ ${s.rawError}`;
      } else {
        statusEl.innerText = dict[cfg.defaultHintKey] || '';
      }
    }
  });
}

function invalidateOtpScope(scope, clearCodeInput = false) {
  const s = otpState[scope];
  const cfg = OTP_SCOPE_CONFIG[scope];
  if (!s || !cfg) return;
  if (s.timerId) {
    clearInterval(s.timerId);
    s.timerId = null;
  }
  s.email = '';
  s.verified = false;
  s.verificationToken = '';
  s.cooldown = 0;
  s.sentOnce = false;
  s.statusKind = 'default';
  s.rawError = '';
  if (clearCodeInput) {
    const otpEl = document.getElementById(cfg.otpId);
    if (otpEl) otpEl.value = '';
  }
  syncOtpUIStates();
}

function startOtpCooldown(scope, seconds) {
  const s = otpState[scope];
  if (!s) return;
  if (s.timerId) {
    clearInterval(s.timerId);
    s.timerId = null;
  }
  s.cooldown = Math.max(0, parseInt(seconds, 10) || 60);
  syncOtpUIStates();
  if (s.cooldown > 0) {
    s.timerId = setInterval(() => {
      s.cooldown = Math.max(0, s.cooldown - 1);
      if (s.cooldown <= 0) {
        clearInterval(s.timerId);
        s.timerId = null;
      }
      syncOtpUIStates();
    }, 1000);
  }
}

window.fetchOtpStatus = async function() {
  try {
    const res = await fetch(`${state.apiBase}/api/auth/otp-status`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        state.otpStatus = {
          email_otp_configured: Boolean(data.email_otp_configured),
          provider: data.provider || null,
          require_otp_on_signup: Boolean(data.require_otp_on_signup),
          require_otp_on_application: Boolean(data.require_otp_on_application),
          require_otp_on_forgot_password: data.require_otp_on_forgot_password !== false
        };
        syncOtpUIStates();
        return state.otpStatus;
      }
    }
  } catch (e) {}
  return state.otpStatus;
};

window.sendEmailOtp = async function(scope) {
  const hi = state.currentLang === 'hi';
  const cfg = OTP_SCOPE_CONFIG[scope];
  const s = otpState[scope];
  if (!cfg || !s) return false;

  const emailEl = document.getElementById(cfg.emailId);
  const otpEl = document.getElementById(cfg.otpId);
  const sendBtn = document.getElementById(cfg.sendBtnId);
  const email = (emailEl?.value || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const errMsg = hi ? 'कृपया पहले एक वैध ईमेल पता दर्ज करें।' : 'Please enter a valid email address first.';
    s.statusKind = 'error';
    s.rawError = errMsg;
    syncOtpUIStates();
    emailEl?.focus();
    return false;
  }

  if (scope === 'forgot_password') {
    const fpAlert = document.getElementById('fp-alert');
    if (fpAlert) fpAlert.style.display = 'none';
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerText = hi ? '⏳ भेज रहे...' : '⏳ Sending...';
  }

  try {
    const res = await fetch(`${state.apiBase}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        purpose: cfg.purpose,
        lang: state.currentLang
      })
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 503 && data.code === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
      s.statusKind = 'unconfigured';
      s.rawError = '';
      syncOtpUIStates();
      window.showMeridianToast(getLangDict().otp_hint_unconfigured, true);
      return false;
    }

    if (res.status === 429 && data.cooldown_seconds) {
      s.statusKind = 'error';
      s.rawError = data.error || '';
      startOtpCooldown(scope, data.cooldown_seconds);
      return false;
    }

    if (!res.ok || !data.success) {
      const errMsg = data.error || (hi ? 'OTP भेजने में समस्या आई।' : 'Unable to send email OTP.');
      s.statusKind = 'error';
      s.rawError = errMsg;
      syncOtpUIStates();
      window.showMeridianToast(errMsg, true);
      return false;
    }

    s.email = email;
    s.verified = false;
    s.verificationToken = '';
    s.sentOnce = true;
    s.statusKind = 'sent';
    s.rawError = '';
    if (data.dev_preview_otp && otpEl) {
      otpEl.value = data.dev_preview_otp;
    }
    startOtpCooldown(scope, data.cooldown_seconds || 60);
    otpEl?.focus();
    return true;
  } catch (err) {
    const netMsg = hi ? 'OTP सर्वर से संपर्क नहीं हो सका।' : 'Network error reaching OTP service.';
    s.statusKind = 'error';
    s.rawError = netMsg;
    syncOtpUIStates();
    window.showMeridianToast(netMsg, true);
    return false;
  }
};

window.verifyEmailOtp = async function(scope) {
  const hi = state.currentLang === 'hi';
  const cfg = OTP_SCOPE_CONFIG[scope];
  const s = otpState[scope];
  if (!cfg || !s) return false;

  const emailEl = document.getElementById(cfg.emailId);
  const otpEl = document.getElementById(cfg.otpId);
  const verifyBtn = document.getElementById(cfg.verifyBtnId);
  const email = (emailEl?.value || '').trim().toLowerCase();
  const otpCode = (otpEl?.value || '').replace(/\s+/g, '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const msg = hi ? 'कृपया वैध ईमेल पता दर्ज करें।' : 'Please enter a valid email address.';
    s.statusKind = 'error';
    s.rawError = msg;
    syncOtpUIStates();
    emailEl?.focus();
    return false;
  }
  if (!/^\d{6}$/.test(otpCode)) {
    const msg = hi ? 'कृपया ईमेल में प्राप्त 6-अंकीय OTP दर्ज करें।' : 'Please enter the 6-digit numeric OTP from your email.';
    s.statusKind = 'error';
    s.rawError = msg;
    syncOtpUIStates();
    otpEl?.focus();
    return false;
  }

  if (scope === 'forgot_password') {
    const fpAlert = document.getElementById('fp-alert');
    if (fpAlert) fpAlert.style.display = 'none';
  }

  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.innerText = hi ? '⏳ जांच...' : '⏳ Checking...';
  }

  try {
    const res = await fetch(`${state.apiBase}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        purpose: cfg.purpose,
        otp: otpCode
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.verification_token) {
      const msg = data.error || (hi ? 'अमान्य या समाप्त OTP। पुनः प्रयास करें।' : 'Invalid or expired OTP code.');
      s.verified = false;
      s.verificationToken = '';
      s.statusKind = 'error';
      s.rawError = msg;
      syncOtpUIStates();
      window.showMeridianToast(msg, true);
      return false;
    }

    s.email = email;
    s.verified = true;
    s.verificationToken = data.verification_token;
    s.statusKind = 'verified';
    s.rawError = '';
    syncOtpUIStates();
    if (scope === 'forgot_password') {
      const fpAlert = document.getElementById('fp-alert');
      if (fpAlert) fpAlert.style.display = 'none';
    }
    window.showMeridianToast(hi ? '✅ ईमेल OTP सफलतापूर्वक सत्यापित हो गया!' : '✅ Email OTP verified successfully!');
    return true;
  } catch (err) {
    const msg = hi ? 'OTP सत्यापन में नेटवर्क त्रुटि हुई।' : 'Network error verifying OTP.';
    s.statusKind = 'error';
    s.rawError = msg;
    syncOtpUIStates();
    window.showMeridianToast(msg, true);
    return false;
  } finally {
    if (verifyBtn) {
      verifyBtn.innerText = getLangDict().btn_verify_otp;
      verifyBtn.disabled = Boolean(s.verified);
    }
  }
};

function buildAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (currentAuthUser?.id) headers['X-User-Id'] = String(currentAuthUser.id);
  if (currentAuthUser?.role) headers['X-User-Role'] = String(currentAuthUser.role);
  if (currentAuthToken && !String(currentAuthToken).startsWith('offline-')) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }
  return headers;
}

function getLangDict() {
  return I18N[state.currentLang] || I18N.en;
}

function localizeArea(area, lang = state.currentLang) {
  const raw = String(area || 'Urban').trim();
  const low = raw.toLowerCase();
  if (lang === 'hi') {
    if (low === 'rural') return 'ग्रामीण भारत';
    if (low === 'semiurban' || low === 'semi-urban') return 'अर्ध-शहरी';
    if (low === 'urban') return 'शहरी / महानगर';
    return raw;
  }
  if (low === 'rural') return 'Rural Bharat';
  if (low === 'semiurban' || low === 'semi-urban') return 'Semi-Urban';
  if (low === 'urban') return 'Urban Metro';
  return raw;
}

function localizeStatus(status, lang = state.currentLang) {
  const low = String(status || 'Approved').trim().toLowerCase();
  if (lang === 'hi') {
    if (low === 'approved') return 'स्वीकृत';
    if (low === 'conditional') return 'सशर्त स्वीकृत';
    if (low === 'rejected') return 'अस्वीकृत';
    return status;
  }
  if (low === 'approved') return 'Approved';
  if (low === 'conditional') return 'Conditional';
  if (low === 'rejected') return 'Rejected';
  return status;
}

function localizeGender(gender, lang = state.currentLang) {
  const low = String(gender || '').trim().toLowerCase();
  if (lang === 'hi') {
    if (low === 'female') return 'महिला';
    if (low === 'male') return 'पुरुष';
    return 'अघोषित';
  }
  return gender || 'Not Disclosed';
}

function syncPortalGatewayVisuals(portal) {
  const dict = getLangDict();
  const isOfficer = portal === 'officer';
  activePortal = isOfficer ? 'officer' : 'applicant';

  const gwApp = document.getElementById('gw-btn-applicant');
  const gwOff = document.getElementById('gw-btn-officer');
  if (gwApp) gwApp.classList.toggle('active', !isOfficer);
  if (gwOff) gwOff.classList.toggle('active', isOfficer);

  const cardHeader = document.getElementById('auth-card-header');
  if (cardHeader) {
    cardHeader.className = isOfficer ? 'auth-card-header officer-mode' : 'auth-card-header';
  }

  const cardTitle = document.getElementById('auth-card-title');
  const cardSub = document.getElementById('auth-card-subtitle');
  const gwBadge = document.getElementById('auth-gateway-badge-text');
  if (cardTitle) cardTitle.innerText = isOfficer ? dict.auth_card_title_officer : dict.auth_card_title_applicant;
  if (cardSub) cardSub.innerText = isOfficer ? dict.auth_card_sub_officer : dict.auth_card_sub_applicant;
  if (gwBadge) gwBadge.innerText = isOfficer ? dict.gw_officer_badge : dict.gw_applicant_badge;

  const tabsApp = document.getElementById('auth-tabs-applicant');
  const tabsOff = document.getElementById('auth-tabs-officer');
  if (tabsApp) tabsApp.style.display = isOfficer ? 'none' : 'flex';
  if (tabsOff) tabsOff.style.display = isOfficer ? 'flex' : 'none';
}

window.switchPortalGateway = function(portal, syncUrl = true) {
  const targetPortal = portal === 'officer' ? 'officer' : 'applicant';
  syncPortalGatewayVisuals(targetPortal);
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) alertEl.style.display = 'none';
  window.switchAuthTab(targetPortal === 'officer' ? 'officer' : 'applicant');

  if (syncUrl && window.history && typeof window.history.replaceState === 'function') {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('portal', targetPortal);
      url.hash = '';
      window.history.replaceState({}, '', url.toString());
    } catch (e) {}
  }
};

function initPortalGatewayFromUrl() {
  let initialPortal = 'applicant';
  try {
    const params = new URLSearchParams(window.location.search);
    const paramPortal = (params.get('portal') || '').trim().toLowerCase();
    const hashPortal = (window.location.hash || '').replace('#', '').trim().toLowerCase();
    if (paramPortal === 'officer' || hashPortal === 'officer') {
      initialPortal = 'officer';
    }
  } catch (e) {}
  window.switchPortalGateway(initialPortal, false);
}

window.switchAuthTab = function(tabName) {
  const targetTab = tabName === 'signup' ? 'app-signup' : tabName;
  if ((targetTab === 'officer' || targetTab === 'off-signup') && activePortal !== 'officer') {
    syncPortalGatewayVisuals('officer');
  } else if ((targetTab === 'applicant' || targetTab === 'app-signup') && activePortal !== 'applicant') {
    syncPortalGatewayVisuals('applicant');
  }

  const btnApp = document.getElementById('tab-btn-applicant');
  const btnAppSignup = document.getElementById('tab-btn-signup-applicant');
  const btnOff = document.getElementById('tab-btn-officer');
  const btnOffSignup = document.getElementById('tab-btn-signup-officer');

  const formApp = document.getElementById('form-signin-applicant');
  const formAppSignup = document.getElementById('form-signup-applicant');
  const formOff = document.getElementById('form-signin-officer');
  const formOffSignup = document.getElementById('form-signup-officer');
  const alertEl = document.getElementById('auth-alert');

  if (alertEl) alertEl.style.display = 'none';

  [btnApp, btnAppSignup, btnOff, btnOffSignup].forEach(b => b?.classList.remove('active'));
  [formApp, formAppSignup, formOff, formOffSignup].forEach(f => {
    if (f) f.style.display = 'none';
  });

  if (targetTab === 'officer') {
    btnOff?.classList.add('active');
    if (formOff) formOff.style.display = 'block';
    document.getElementById('signin-officer-email')?.focus();
  } else if (targetTab === 'off-signup') {
    btnOffSignup?.classList.add('active');
    if (formOffSignup) formOffSignup.style.display = 'block';
    document.getElementById('signup-off-fullname')?.focus();
  } else if (targetTab === 'app-signup') {
    btnAppSignup?.classList.add('active');
    if (formAppSignup) formAppSignup.style.display = 'block';
    document.getElementById('signup-app-fullname')?.focus();
  } else {
    btnApp?.classList.add('active');
    if (formApp) formApp.style.display = 'block';
    document.getElementById('signin-applicant-email')?.focus();
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

window.quickFillCreds = function(email, password, role = 'applicant') {
  if (role === 'officer') {
    window.switchPortalGateway('officer');
    window.switchAuthTab('officer');
    const em = document.getElementById('signin-officer-email');
    const pw = document.getElementById('signin-officer-password');
    if (em) em.value = email;
    if (pw) pw.value = password;
    em?.focus();
  } else {
    window.switchPortalGateway('applicant');
    window.switchAuthTab('applicant');
    const em = document.getElementById('signin-applicant-email');
    const pw = document.getElementById('signin-applicant-password');
    if (em) em.value = email;
    if (pw) pw.value = password;
    em?.focus();
  }
};

window.showAuthAlert = function(msg, isError = true) {
  const alertEl = document.getElementById('auth-alert');
  if (!alertEl) return;
  alertEl.className = isError ? 'auth-alert auth-alert-error' : 'auth-alert auth-alert-success';
  alertEl.innerHTML = (isError ? '⚠️ ' : '✅ ') + msg;
  alertEl.style.display = 'block';
};

window.handleSignIn = async function(e, expectedRole = 'applicant') {
  e.preventDefault();
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  const isOfficer = expectedRole === 'officer';
  const emailInput = document.getElementById(isOfficer ? 'signin-officer-email' : 'signin-applicant-email');
  const pwdInput = document.getElementById(isOfficer ? 'signin-officer-password' : 'signin-applicant-password');
  const btn = document.getElementById(isOfficer ? 'btn-signin-officer-submit' : 'btn-signin-applicant-submit');

  const email = emailInput?.value.trim();
  const password = pwdInput?.value.trim();

  if (!email || !password) {
    window.showAuthAlert(hi ? 'कृपया ईमेल पता और पासवर्ड दोनों दर्ज करें।' : 'Please enter both email address and password.');
    return;
  }

  const defaultBtnHtml = isOfficer
    ? `<span>🛡️</span> <span data-i18n="btn_signin_officer">${dict.btn_signin_officer}</span>`
    : `<span>👤</span> <span data-i18n="btn_signin_app">${dict.btn_signin_app}</span>`;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> ${hi ? 'सत्यापन हो रहा है...' : 'Verifying Clearance...'}`;
  }

  try {
    const res = await fetch(`${state.apiBase}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, expected_role: expectedRole })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      await window.applyAuthenticatedSession(data.user, data.token);
    } else if (res.status === 503 && data.offline) {
      await window.checkSiteAvailability();
      window.showAuthAlert(data.error || (hi ? 'पोर्टल रखरखाव के लिए अस्थायी रूप से ऑफ़लाइन है।' : 'Portal is temporarily offline for scheduled maintenance.'));
    } else {
      window.showAuthAlert(data.error || (hi ? 'प्रमाणीकरण विफल रहा। कृपया विवरण जांचें।' : 'Authentication failed. Please verify credentials.'));
    }
  } catch (err) {
    if (!isOfficer && (!state.siteAvailability || state.siteAvailability.online !== false) && email.toLowerCase() === 'applicant@meridianbank.in' && password === 'Applicant@123') {
      const fallbackUser = { id: '03416d3d-ff2b-4101-9453-7509939590fc', email, full_name: 'Ananya Rao', phone: '9876543210', role: 'applicant' };
      await window.applyAuthenticatedSession(fallbackUser, 'offline-token-applicant');
    } else {
      window.showAuthAlert(
        hi
          ? `${state.apiBase} पर बैकएंड एपीआई से संपर्क नहीं हो सका। कृपया नेटवर्क या सर्वर स्थिति जांचें।`
          : `Unable to reach backend API at ${state.apiBase}. Verify network connection or API settings.`
      );
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = defaultBtnHtml;
    }
  }
};

async function submitPortalRegistration(payload, btn, defaultBtnHtml) {
  const hi = state.currentLang === 'hi';
  if (payload.password !== payload.confirm_password) {
    window.showAuthAlert(hi ? 'पासवर्ड मेल नहीं खाते। कृपया पुनः दर्ज करें।' : 'Passwords do not match. Please re-enter.');
    return;
  }
  if (!payload.password || payload.password.length < 8) {
    window.showAuthAlert(hi ? 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।' : 'Password must be at least 8 characters long.');
    return;
  }
  if (payload.role === 'officer' && !payload.officer_key) {
    window.showAuthAlert(hi ? 'ऋण अधिकारी खाता बनाने के लिए अधिकारी क्लीयरेंस पासकी आवश्यक है।' : 'Officer Clearance Key is required for loan officer account creation.');
    return;
  }

  const scope = payload.role === 'officer' ? 'signup_off' : 'signup_app';
  const cfg = OTP_SCOPE_CONFIG[scope];
  const s = otpState[scope];
  const cleanEmail = (payload.email || '').trim().toLowerCase();
  const otpRaw = (document.getElementById(cfg.otpId)?.value || '').replace(/\s+/g, '');
  const sameEmailVerified = s && s.verified && s.email === cleanEmail && s.verificationToken;

  payload.otp_verification_token = sameEmailVerified ? s.verificationToken : null;
  payload.otp_code = (!payload.otp_verification_token && /^\d{6}$/.test(otpRaw)) ? otpRaw : null;

  if (state.otpStatus.require_otp_on_signup && !payload.otp_verification_token && !payload.otp_code) {
    window.showAuthAlert(
      hi
        ? 'कृपया खाता बनाने से पहले "OTP भेजें" पर क्लिक करके अपना ईमेल 6-अंकीय कोड से सत्यापित करें।'
        : 'Please click "Send OTP" and verify your email with the 6-digit code before creating your account.'
    );
    document.getElementById(cfg.otpId)?.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> ${hi ? 'खाता पंजीकृत हो रहा है...' : 'Registering Account...'}`;
  }

  try {
    const res = await fetch(`${state.apiBase}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      invalidateOtpScope(scope, true);
      window.showAuthAlert(hi ? 'खाता सफलतापूर्वक बन गया! साइन-इन पर ले जाया जा रहा है...' : 'Account created successfully! Redirecting to Sign In...', false);
      setTimeout(() => {
        const targetRole = payload.role === 'officer' ? 'officer' : 'applicant';
        window.quickFillCreds(payload.email, payload.password, targetRole);
      }, 1200);
    } else if (res.status === 503 && data.offline) {
      await window.checkSiteAvailability();
      window.showAuthAlert(data.error || (hi ? 'पोर्टल रखरखाव मोड में होने के कारण पंजीकरण अस्थायी रूप से रुका है।' : 'Registration paused while website is in maintenance mode.'));
    } else {
      if (data.code === 'EMAIL_OTP_REQUIRED' || data.code === 'EMAIL_OTP_INVALID') {
        window.fetchOtpStatus();
        s.statusKind = 'error';
        s.rawError = data.error || '';
        syncOtpUIStates();
      }
      window.showAuthAlert(data.error || (hi ? 'खाता पंजीकरण विफल रहा।' : 'Account registration failed.'));
    }
  } catch (err) {
    window.showAuthAlert(hi ? `${state.apiBase} से संपर्क करने में नेटवर्क त्रुटि हुई।` : `Network error contacting ${state.apiBase}. Please verify backend availability.`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = defaultBtnHtml;
    }
  }
}

window.handleApplicantSignUp = async function(e) {
  e.preventDefault();
  const dict = getLangDict();
  const btn = document.getElementById('btn-signup-app-submit');
  const payload = {
    full_name: document.getElementById('signup-app-fullname')?.value.trim(),
    email: document.getElementById('signup-app-email')?.value.trim(),
    phone: document.getElementById('signup-app-phone')?.value.trim(),
    role: 'applicant',
    officer_key: null,
    password: document.getElementById('signup-app-password')?.value || '',
    confirm_password: document.getElementById('signup-app-confirm-password')?.value || ''
  };
  await submitPortalRegistration(payload, btn, `<span>✨</span> <span data-i18n="btn_signup_app_submit">${dict.btn_signup_app_submit}</span>`);
};

window.handleOfficerSignUp = async function(e) {
  e.preventDefault();
  const dict = getLangDict();
  const btn = document.getElementById('btn-signup-off-submit');
  const payload = {
    full_name: document.getElementById('signup-off-fullname')?.value.trim(),
    email: document.getElementById('signup-off-email')?.value.trim(),
    phone: document.getElementById('signup-off-phone')?.value.trim(),
    role: 'officer',
    officer_key: document.getElementById('signup-off-key')?.value.trim(),
    password: document.getElementById('signup-off-password')?.value || '',
    confirm_password: document.getElementById('signup-off-confirm-password')?.value || ''
  };
  await submitPortalRegistration(payload, btn, `<span>🛡️</span> <span data-i18n="btn_signup_off_submit">${dict.btn_signup_off_submit}</span>`);
};

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getOfflineQueueKey() {
  if (!currentAuthUser || !currentAuthUser.id) return null;
  return `meridian_offline_queue_${currentAuthUser.id}`;
}

function readOfflineQueue() {
  const key = getOfflineQueueKey();
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeOfflineQueue(items) {
  const key = getOfflineQueueKey();
  if (!key) return;
  try {
    if (!items || items.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(items));
    }
  } catch (e) {}
}

async function syncPendingOfflineApplications() {
  if (!currentAuthUser || currentAuthUser.role !== 'applicant') return;
  const pending = readOfflineQueue();
  if (pending.length === 0) return;

  const remaining = [];
  for (const rec of pending) {
    try {
      const res = await fetch(`${state.apiBase}/api/apply`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(rec)
      });
      if (res.ok) {
        state.backendConnected = true;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        continue;
      } else {
        remaining.push(rec);
      }
    } catch (e) {
      remaining.push(rec);
    }
  }
  writeOfflineQueue(remaining);
}

function clearPersonalFormInputs() {
  [
    'fill-full-name',
    'fill-phone',
    'fill-email',
    'fill-app-otp',
    'signup-app-fullname',
    'signup-app-email',
    'signup-app-otp',
    'signup-app-phone',
    'signup-off-fullname',
    'signup-off-email',
    'signup-off-otp',
    'signup-off-phone',
    'fp-email',
    'fp-otp',
    'fp-new-password',
    'fp-confirm-password'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  Object.keys(OTP_SCOPE_CONFIG).forEach(sc => invalidateOtpScope(sc, true));
}

function resetWorkspaceState() {
  state.hasApplied = false;
  state.backendPrediction = null;
  state.backendExplanation = null;
  state.currentApplicant = createBlankApplicantState();
  state.simulated = {
    loan_amount: 150000,
    coapplicant_income: 15000,
    term: 60,
    cibil_score: 760,
    credit_history: 1,
    salary_slip: true
  };
  state.savedDatabaseApps = [];
  state.lastSubmittedApp = null;
  state.auditLog = [];

  try {
    localStorage.removeItem('meridian_saved_apps');
  } catch (e) {}

  ['letter-modal', 'backend-info-modal', 'site-availability-modal', 'forgot-password-modal'].forEach(mid => {
    const modal = document.getElementById(mid);
    if (modal) modal.style.display = 'none';
  });

  const subBanner = document.getElementById('submission-alert-banner');
  if (subBanner) subBanner.style.display = 'none';
  const successCard = document.getElementById('apply-success-card');
  if (successCard) successCard.style.display = 'none';
  const adjBanner = document.getElementById('officer-adjudication-banner');
  if (adjBanner) adjBanner.style.display = 'none';

  const fillForm = document.getElementById('loan-fillup-form');
  if (fillForm) fillForm.reset();
  if (typeof window.updateFillLoanHint === 'function') {
    window.updateFillLoanHint(document.getElementById('fill-loan-amount')?.value || 150000);
  }
  syncSimLoanInputs(150000);
  clearPersonalFormInputs();
  const remarksInput = document.getElementById('officer-remarks-input');
  if (remarksInput) remarksInput.value = '';
  const activeBadge = document.getElementById('officer-active-app-badge');
  if (activeBadge) activeBadge.innerText = '-';
}

window.handleLogout = function() {
  const prevRole = currentAuthUser?.role || activePortal || 'applicant';
  const logoutHeaders = buildAuthHeaders();
  try {
    fetch(`${state.apiBase}/api/auth/logout`, {
      method: 'POST',
      headers: logoutHeaders
    }).catch(() => {});
  } catch (e) {}

  currentAuthUser = null;
  currentAuthToken = null;
  try {
    localStorage.removeItem('meridian_auth_user');
    localStorage.removeItem('meridian_auth_token');
    sessionStorage.removeItem('meridian_auth_user');
    sessionStorage.removeItem('meridian_auth_token');
  } catch (e) {}

  resetWorkspaceState();
  syncSiteAvailabilityUI();
  if (state.siteAvailability && state.siteAvailability.online === false) {
    return;
  }

  const shell = document.getElementById('app-shell');
  const portal = document.getElementById('auth-portal');
  if (shell) shell.style.display = 'none';
  if (portal) portal.style.display = 'flex';
  window.switchPortalGateway(prevRole === 'officer' ? 'officer' : 'applicant');
};

window.showForgotPasswordAlert = function(msg, isError = true) {
  const alertEl = document.getElementById('fp-alert');
  if (!alertEl) return;
  alertEl.className = isError ? 'auth-alert auth-alert-error' : 'auth-alert auth-alert-success';
  alertEl.innerHTML = (isError ? '⚠️ ' : '✅ ') + escapeHtml(msg);
  alertEl.style.display = 'block';
};

window.openForgotPassword = function(role = 'applicant') {
  forgotPasswordTargetRole = role === 'officer' ? 'officer' : 'applicant';
  const modal = document.getElementById('forgot-password-modal');
  const alertEl = document.getElementById('fp-alert');
  if (alertEl) alertEl.style.display = 'none';
  ['fp-email', 'fp-otp', 'fp-new-password', 'fp-confirm-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (id !== 'fp-otp') el.setAttribute('readonly', 'readonly');
    }
  });
  invalidateOtpScope('forgot_password', true);
  if (modal) modal.style.display = 'flex';
  window.fetchOtpStatus();
};

window.closeForgotPasswordModal = function() {
  const modal = document.getElementById('forgot-password-modal');
  if (modal) modal.style.display = 'none';
};

window.handleForgotPasswordSubmit = async function(e) {
  e.preventDefault();
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  const email = (document.getElementById('fp-email')?.value || '').trim().toLowerCase();
  const otp = (document.getElementById('fp-otp')?.value || '').replace(/\s+/g, '');
  const password = document.getElementById('fp-new-password')?.value || '';
  const confirmPassword = document.getElementById('fp-confirm-password')?.value || '';
  const btn = document.getElementById('btn-fp-submit');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    window.showForgotPasswordAlert(hi ? 'कृपया वैध ईमेल पता दर्ज करें।' : 'Please enter a valid email address.', true);
    return;
  }

  const s = otpState.forgot_password;
  const tok = (s && s.verified && s.email === email && s.verificationToken) ? s.verificationToken : null;
  if (!tok && !/^\d{6}$/.test(otp)) {
    window.showForgotPasswordAlert(hi ? 'कृपया ईमेल पर प्राप्त 6-अंकीय OTP दर्ज करें।' : 'Please enter the 6-digit email OTP.', true);
    document.getElementById('fp-otp')?.focus();
    return;
  }

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    window.showForgotPasswordAlert(
      hi ? 'नया पासवर्ड कम से कम 8 अक्षरों का होना चाहिए जिसमें अक्षर और अंक दोनों हों।' : 'New password must be at least 8 characters and contain both a letter and a digit.',
      true
    );
    return;
  }

  if (password !== confirmPassword) {
    window.showForgotPasswordAlert(hi ? 'दोनों पासवर्ड मेल नहीं खाते।' : 'Passwords do not match.', true);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = hi ? '⏳ रीसेट हो रहा है...' : '⏳ Resetting...';
  }

  try {
    const res = await fetch(`${state.apiBase}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        otp: tok ? null : otp,
        verification_token: tok,
        password,
        confirm_password: confirmPassword
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      invalidateOtpScope('forgot_password', true);
      window.closeForgotPasswordModal();
      const targetPortal = (data.role === 'officer' || forgotPasswordTargetRole === 'officer') ? 'officer' : 'applicant';
      window.switchPortalGateway(targetPortal);
      window.switchAuthTab(targetPortal);
      window.showAuthAlert(
        hi
          ? 'पासवर्ड सफलतापूर्वक बदल दिया गया! कृपया अपने नए पासवर्ड से साइन इन करें।'
          : 'Password reset successfully! Please sign in with your new password.',
        false
      );
      window.showMeridianToast(
        hi ? '✅ पासवर्ड सफलतापूर्वक रीसेट हो गया।' : '✅ Password reset successfully.'
      );
    } else {
      window.showForgotPasswordAlert(data.error || (hi ? 'पासवर्ड रीसेट विफल रहा।' : 'Failed to reset password.'), true);
    }
  } catch (err) {
    window.showForgotPasswordAlert(hi ? 'सर्वर से संपर्क करने में नेटवर्क त्रुटि।' : 'Network error contacting server.', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = dict.fp_btn_submit;
    }
  }
};

function updateAuthRoleUI() {
  const dict = getLangDict();
  const roleEl = document.getElementById('user-display-role');
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  if (roleEl && currentAuthUser) {
    roleEl.innerText = isOfficer ? dict.role_badge_officer : dict.role_badge_applicant;
    roleEl.className = `user-auth-role-badge ${currentAuthUser.role}`;
  }
  const dbTab = document.querySelector('[data-tab="database-view"]');
  if (dbTab) {
    dbTab.innerHTML = isOfficer ? dict.nav_vault_officer : dict.nav_vault_applicant;
  }
  const dbTitle = document.getElementById('db-view-title');
  const dbSub = document.getElementById('db-view-sub');
  if (dbTitle) {
    dbTitle.setAttribute('data-i18n', isOfficer ? 'db_title' : 'db_title_applicant');
    dbTitle.innerText = isOfficer ? dict.db_title : dict.db_title_applicant;
  }
  if (dbSub) {
    dbSub.setAttribute('data-i18n', isOfficer ? 'db_sub' : 'db_sub_applicant');
    dbSub.innerText = isOfficer ? dict.db_sub : dict.db_sub_applicant;
  }
}

window.activateWorkspaceTab = function(tabId) {
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  const allowedTabs = isOfficer ? OFFICER_TABS : APPLICANT_TABS;
  let targetTab = tabId;
  if (!allowedTabs.has(targetTab)) {
    targetTab = isOfficer ? 'officer-view' : 'apply-view';
  }

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.getAttribute('data-tab') === targetTab);
  });
  state.currentTab = targetTab;

  document.querySelectorAll('.tab-section').forEach(sec => {
    sec.style.display = 'none';
  });
  const activeSec = document.getElementById(targetTab);
  if (activeSec) activeSec.style.display = 'block';

  if (targetTab === 'fairness-view' && isOfficer) {
    renderFairnessCharts();
  } else if (targetTab === 'model-view' && isOfficer) {
    renderModelPerformanceCharts();
  } else if (targetTab === 'portfolio-view' && isOfficer) {
    renderPortfolioTable();
  } else if (targetTab === 'database-view') {
    window.refreshDatabaseTable();
  } else if (targetTab === 'officer-view' && isOfficer) {
    renderAuditTable();
    fetchAuditLogs();
  }
};

function applyRecordToCurrentState(rec) {
  if (!rec) return;
  const cibil = parseInt(rec.cibil_score !== undefined ? rec.cibil_score : (rec.credit_history === 1 ? 750 : 540), 10) || 750;
  const empType = rec.employment_type || 'Freelancing / Gig Economy / Contractor';
  const termMonths = parseInt(rec.loan_term_months || rec.term || 60, 10) || 60;
  const salarySlip = rec.salary_slip || 'Yes';

  state.hasApplied = true;
  state.backendPrediction = null;
  state.backendExplanation = null;

  state.currentApplicant = {
    id: rec.application_no || rec.id || '',
    name: rec.full_name || rec.name || 'Applicant',
    gender: rec.gender || 'Female',
    married: rec.marital_status || rec.married || 'Yes',
    dependents: String(rec.dependents !== undefined ? rec.dependents : '0'),
    education: rec.education || 'Graduate',
    self_employed: rec.self_employed || ((empType.includes('Self') || empType.includes('Freelanc')) ? 'Yes' : 'No'),
    employment_type: empType,
    salary_slip: salarySlip,
    applicant_income: parseFloat(rec.applicant_income || 0),
    coapplicant_income: parseFloat(rec.coapplicant_income || 0),
    loan_amount: parseFloat(rec.loan_amount || 150000),
    term: termMonths,
    cibil_score: cibil,
    credit_history: cibil >= 650 ? 1 : 0,
    property_area: rec.property_area || 'Rural',
    loan_purpose: rec.loan_purpose || 'Home Improvement / Construction',
    status: rec.status || 'Conditional',
    officer_status: rec.officer_status || 'Pending',
    officer_remarks: rec.officer_remarks || rec.officer_notes || '',
    updated_at: rec.updated_at || rec.created_at || ''
  };

  state.simulated = {
    loan_amount: state.currentApplicant.loan_amount || 150000,
    coapplicant_income: state.currentApplicant.coapplicant_income || 0,
    term: termMonths,
    cibil_score: cibil,
    credit_history: cibil >= 650 ? 1 : 0,
    salary_slip: String(salarySlip).toLowerCase() === 'yes'
  };

  syncSimLoanInputs(state.simulated.loan_amount);
  setSliderVal('sim-slider-coapp', state.simulated.coapplicant_income);
  setSliderVal('sim-slider-term', Math.max(1, Math.round(state.simulated.term / 12)));
  setSliderVal('sim-slider-cibil', state.simulated.cibil_score);
  syncSimSalarySlipVisuals(state.simulated.salary_slip);
  syncSimulatorSliderLabels();
  updateUI();
  updateSimulationUI();
}

window.applyAuthenticatedSession = async function(user, token) {
  currentAuthUser = user;
  currentAuthToken = token;

  try {
    localStorage.setItem('meridian_auth_user', JSON.stringify(user));
    if (token) localStorage.setItem('meridian_auth_token', token);
  } catch (e) {}

  resetWorkspaceState();

  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.innerText = user.full_name || user.email;

  const maintOverlay = document.getElementById('maintenance-overlay');
  const portal = document.getElementById('auth-portal');
  const shell = document.getElementById('app-shell');
  if (maintOverlay) maintOverlay.style.display = 'none';
  if (portal) portal.style.display = 'none';
  if (shell) shell.style.display = 'block';

  state.currentRole = user.role;
  const isOfficer = user.role === 'officer';

  if (!isOfficer) {
    if (state.siteAvailability && state.siteAvailability.online === false) {
      if (shell) shell.style.display = 'none';
      if (maintOverlay) maintOverlay.style.display = 'flex';
    }
    const nameInput = document.getElementById('fill-full-name') || document.getElementById('fill-name');
    const phoneInput = document.getElementById('fill-phone');
    const emailInput = document.getElementById('fill-email');
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (emailInput) emailInput.value = '';
    invalidateOtpScope('application', true);

    document.querySelectorAll('.nav-officer-item').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.nav-applicant-item').forEach(el => { el.style.display = 'flex'; });
    document.querySelectorAll('.nav-shared-vault').forEach(el => { el.style.display = 'flex'; });
    const backupBtn = document.getElementById('btn-download-sqlite-backup');
    if (backupBtn) backupBtn.style.display = 'none';

    updateAuthRoleUI();
    updateBackendStatusUI();
    applyTranslations();
    syncSiteAvailabilityUI();
    window.activateWorkspaceTab('apply-view');

    await syncPendingOfflineApplications();
    await window.refreshDatabaseTable();
    if (state.savedDatabaseApps.length > 0) {
      applyRecordToCurrentState(state.savedDatabaseApps[0]);
    } else {
      state.hasApplied = false;
      updateUI();
      updateSimulationUI();
    }
  } else {
    document.querySelectorAll('.nav-applicant-item').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.nav-officer-item').forEach(el => { el.style.display = 'flex'; });
    document.querySelectorAll('.nav-shared-vault').forEach(el => { el.style.display = 'flex'; });
    const backupBtn = document.getElementById('btn-download-sqlite-backup');
    if (backupBtn) backupBtn.style.display = 'inline-flex';

    updateAuthRoleUI();
    updateBackendStatusUI();
    applyTranslations();
    syncSiteAvailabilityUI();
    window.activateWorkspaceTab('officer-view');

    await window.refreshDatabaseTable();
    if (state.savedDatabaseApps.length > 0) {
      applyRecordToCurrentState(state.savedDatabaseApps[0]);
    } else {
      updateUI();
      updateSimulationUI();
    }
    await fetchAuditLogs();
  }
};

window.checkExistingSession = async function() {
  try {
    const stored = localStorage.getItem('meridian_auth_user');
    const token = localStorage.getItem('meridian_auth_token');
    if (stored) {
      const user = JSON.parse(stored);
      if (user && user.email) {
        if (user.id || (token && !String(token).startsWith('offline-'))) {
          try {
            const reqHeaders = {};
            if (user.id) reqHeaders['X-User-Id'] = String(user.id);
            if (token && !String(token).startsWith('offline-')) {
              reqHeaders['Authorization'] = `Bearer ${token}`;
            }
            const verifyRes = await fetch(`${state.apiBase}/api/auth/session?user_id=${encodeURIComponent(user.id || '')}`, {
              headers: reqHeaders
            });
            if (verifyRes.status === 401 || verifyRes.status === 404) {
              localStorage.removeItem('meridian_auth_user');
              localStorage.removeItem('meridian_auth_token');
              currentAuthUser = null;
              currentAuthToken = null;
              syncSiteAvailabilityUI();
              return;
            }
            if (verifyRes.ok) {
              const verified = await verifyRes.json();
              if (verified && verified.user) {
                await window.applyAuthenticatedSession(verified.user, token);
                return;
              }
            }
          } catch (e) {}
        }
        await window.applyAuthenticatedSession(user, token);
        return;
      }
    }
  } catch (e) {}

  syncSiteAvailabilityUI();
};

window.showMeridianToast = function(msg, isError = false) {
  const container = document.getElementById('meridian-toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `meridian-toast${isError ? ' error' : ''}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4200);
};

function syncSiteAvailabilityUI() {
  const avail = state.siteAvailability || { online: true };
  const isOnline = avail.online !== false;
  const isOfficer = currentAuthUser && currentAuthUser.role === 'officer';
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();

  const maintOverlay = document.getElementById('maintenance-overlay');
  const portal = document.getElementById('auth-portal');
  const shell = document.getElementById('app-shell');

  const rawTitle = (avail.title || '').trim();
  const rawMsg = (avail.maintenance_message || '').trim();
  const displayTitle = (!rawTitle || rawTitle === DEFAULT_OFFLINE_TITLE_EN)
    ? dict.default_maint_title
    : rawTitle;
  const displayMsg = (!rawMsg || rawMsg === DEFAULT_OFFLINE_MSG_EN)
    ? dict.default_maint_msg
    : rawMsg;

  const maintTitle = document.getElementById('maint-title');
  const maintMsg = document.getElementById('maint-message');
  const maintMeta = document.getElementById('maint-meta');
  if (maintTitle) maintTitle.innerText = displayTitle;
  if (maintMsg) maintMsg.innerText = displayMsg;
  if (maintMeta) {
    if (avail.updated_at) {
      maintMeta.innerText = hi
        ? `अद्यतन: ${avail.updated_at} • द्वारा: ${avail.updated_by || 'सिस्टम प्रशासक'}`
        : `Updated ${avail.updated_at} by ${avail.updated_by || 'Administrator'}`;
    } else {
      maintMeta.innerText = dict.maint_meta_default;
    }
  }

  const authPill = document.getElementById('auth-site-status-pill');
  if (authPill) {
    authPill.className = `site-status-pill ${isOnline ? 'online' : 'offline'}`;
    authPill.innerHTML = `<span class="status-dot"></span> ${isOnline ? dict.pill_site_online : dict.pill_site_offline}`;
  }

  const officerPill = document.getElementById('officer-site-toggle-pill');
  const officerPillText = document.getElementById('officer-site-pill-text');
  if (officerPill) {
    officerPill.className = `site-status-pill nav-officer-item ${isOnline ? 'online' : 'offline'}`;
    officerPill.style.display = isOfficer ? 'inline-flex' : 'none';
  }
  if (officerPillText) officerPillText.innerText = isOnline ? dict.pill_site_online : dict.pill_site_offline;

  const offlineBanner = document.getElementById('officer-offline-alert-banner');
  if (offlineBanner) {
    offlineBanner.style.display = (isOfficer && !isOnline) ? 'block' : 'none';
  }

  const cockpitBadge = document.getElementById('cockpit-site-status-badge');
  const cockpitSub = document.getElementById('cockpit-site-status-sub');
  const cockpitToggleBtn = document.getElementById('btn-cockpit-quick-toggle');
  if (cockpitBadge) {
    cockpitBadge.className = `badge ${isOnline ? 'badge-success' : 'badge-danger'}`;
    cockpitBadge.innerText = isOnline ? dict.cockpit_badge_online : dict.cockpit_badge_offline;
  }
  if (cockpitSub) {
    cockpitSub.innerText = isOnline ? dict.cockpit_sub_online : displayMsg;
  }
  if (cockpitToggleBtn) {
    if (isOnline) {
      cockpitToggleBtn.style.background = '#DC2626';
      cockpitToggleBtn.innerHTML = `<span>🔴</span> ${dict.btn_take_offline}`;
    } else {
      cockpitToggleBtn.style.background = '#059669';
      cockpitToggleBtn.innerHTML = `<span>🟢</span> ${dict.btn_bring_online}`;
    }
  }

  const modalBadge = document.getElementById('modal-site-status-badge');
  const modalDetail = document.getElementById('modal-site-status-detail');
  if (modalBadge) {
    modalBadge.className = `badge ${isOnline ? 'badge-success' : 'badge-danger'}`;
    modalBadge.innerText = isOnline ? dict.badge_online : dict.badge_offline;
  }
  if (modalDetail) {
    modalDetail.innerText = isOnline
      ? dict.modal_site_live_desc
      : (hi
        ? `ऑफ़लाइन समय: ${avail.updated_at || 'अभी'} (${avail.updated_by || 'ऋण अधिकारी'})।`
        : `Offline since ${avail.updated_at || 'just now'} (${avail.updated_by || 'Officer'}).`);
  }

  if (!isOnline && !isOfficer) {
    if (shell) shell.style.display = 'none';
    if (portal) portal.style.display = 'none';
    if (maintOverlay) maintOverlay.style.display = 'flex';
  } else if (currentAuthUser) {
    if (maintOverlay) maintOverlay.style.display = 'none';
    if (portal) portal.style.display = 'none';
    if (shell) shell.style.display = 'block';
  } else {
    if (maintOverlay) maintOverlay.style.display = 'none';
    if (shell) shell.style.display = 'none';
    if (portal) portal.style.display = 'flex';
  }
}

window.checkSiteAvailability = async function(isManual = false) {
  const hi = state.currentLang === 'hi';
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${state.apiBase}/api/system/availability`, { signal: controller.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.online === 'boolean') {
        const wasOffline = state.siteAvailability && state.siteAvailability.online === false;
        state.siteAvailability = data;
        syncSiteAvailabilityUI();
        if (isManual) {
          window.showMeridianToast(
            data.online
              ? (hi ? '🟢 वेबसाइट ऑनलाइन है और सक्रिय है।' : '🟢 Website is ONLINE and ready.')
              : (hi ? '🔴 वेबसाइट वर्तमान में ऑफ़लाइन (रखरखाव मोड) में है।' : '🔴 Website is currently OFFLINE (Maintenance Mode).'),
            !data.online
          );
        } else if (wasOffline && data.online) {
          window.showMeridianToast(hi ? '🟢 वेबसाइट पुनः ऑनलाइन हो गई है!' : '🟢 Website is back ONLINE!');
        }
        return data;
      }
    }
  } catch (e) {
    if (isManual) window.showMeridianToast(hi ? 'स्थिति जांच विफल: सर्वर अभी उपलब्ध नहीं है।' : 'Checking status... server unreachable right now.', true);
  }
  return state.siteAvailability;
};

window.openSiteAvailabilityModal = function() {
  const modal = document.getElementById('site-availability-modal');
  if (!modal) return;
  const titleInput = document.getElementById('site-maint-title-input');
  const msgInput = document.getElementById('site-maint-msg-input');
  if (titleInput) titleInput.value = state.siteAvailability?.title || DEFAULT_OFFLINE_TITLE_EN;
  if (msgInput) msgInput.value = state.siteAvailability?.maintenance_message || DEFAULT_OFFLINE_MSG_EN;
  syncSiteAvailabilityUI();
  modal.style.display = 'flex';
};

window.closeSiteAvailabilityModal = function() {
  const modal = document.getElementById('site-availability-modal');
  if (modal) modal.style.display = 'none';
};

window.quickToggleWebsiteAvailability = function() {
  const currentlyOnline = state.siteAvailability?.online !== false;
  window.setWebsiteOnlineState(!currentlyOnline);
};

window.setWebsiteOnlineState = async function(targetOnline, customTitle = null, customMsg = null, officerKey = null) {
  const hi = state.currentLang === 'hi';
  try {
    const reqHeaders = buildAuthHeaders({ 'Content-Type': 'application/json' });
    if (officerKey) reqHeaders['X-Officer-Key'] = String(officerKey);

    const bodyPayload = { online: Boolean(targetOnline) };
    if (customTitle && customTitle.trim()) bodyPayload.title = customTitle.trim();
    if (customMsg && customMsg.trim()) bodyPayload.maintenance_message = customMsg.trim();
    if (officerKey) bodyPayload.officer_key = officerKey.trim();

    const res = await fetch(`${state.apiBase}/api/system/availability`, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(bodyPayload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      window.showMeridianToast(data.error || (hi ? 'वेबसाइट स्थिति अपडेट करने में त्रुटि।' : 'Failed to update website availability.'), true);
      return false;
    }

    state.siteAvailability = data;
    syncSiteAvailabilityUI();
    window.closeSiteAvailabilityModal();
    window.showMeridianToast(
      data.online
        ? (hi ? '🟢 वेबसाइट अब ऑनलाइन और सार्वजनिक रूप से उपलब्ध है।' : '🟢 Website is now ONLINE & publicly accessible.')
        : (hi ? '🔴 वेबसाइट अब ऑफ़लाइन (सार्वजनिक रखरखाव मोड सक्रिय) है।' : '🔴 Website is now OFFLINE (Public Maintenance Mode active).'),
      !data.online
    );
    return true;
  } catch (e) {
    window.showMeridianToast(hi ? 'वेबसाइट स्थिति अपडेट करने में नेटवर्क त्रुटि।' : 'Network error updating website status.', true);
    return false;
  }
};

window.toggleMaintAdminDrawer = function() {
  const drawer = document.getElementById('maint-admin-drawer');
  if (!drawer) return;
  drawer.style.display = drawer.style.display === 'none' || !drawer.style.display ? 'block' : 'none';
};

window.handleMaintOfficerSignIn = async function(e) {
  e.preventDefault();
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  const email = document.getElementById('maint-officer-email')?.value.trim();
  const password = document.getElementById('maint-officer-password')?.value.trim();
  const alertEl = document.getElementById('maint-admin-alert');
  const btn = document.getElementById('btn-maint-officer-signin');
  if (!email || !password) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> ${hi ? 'साइन इन हो रहा है...' : 'Signing In...'}`;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, expected_role: 'officer' })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (alertEl) alertEl.style.display = 'none';
      await window.applyAuthenticatedSession(data.user, data.token);
      window.showMeridianToast(hi ? '🛡️ अधिकारी सत्यापन सफल। वेबसाइट ऑनलाइन करने के लिए ऊपर दिए गए बैनर का उपयोग करें।' : '🛡️ Officer authenticated. Use the banner above to bring the website Online.');
    } else {
      if (alertEl) {
        alertEl.className = 'auth-alert auth-alert-error';
        alertEl.innerHTML = '⚠️ ' + (data.error || (hi ? 'अधिकारी प्रमाणीकरण विफल रहा।' : 'Officer authentication failed.'));
        alertEl.style.display = 'block';
      }
    }
  } catch (err) {
    if (alertEl) {
      alertEl.className = 'auth-alert auth-alert-error';
      alertEl.innerHTML = `⚠️ ${hi ? 'प्रमाणीकरण गेटवे तक पहुंचने में नेटवर्क त्रुटि।' : 'Network error reaching authentication gateway.'}`;
      alertEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🛡️</span> <span data-i18n="btn_maint_signin">${dict.btn_maint_signin}</span>`;
    }
  }
};

window.handleMaintPasskeyBringOnline = async function() {
  const hi = state.currentLang === 'hi';
  const passInput = document.getElementById('maint-passkey-input');
  const alertEl = document.getElementById('maint-admin-alert');
  const keyVal = passInput?.value.trim();
  if (!keyVal) {
    if (alertEl) {
      alertEl.className = 'auth-alert auth-alert-error';
      alertEl.innerHTML = `⚠️ ${hi ? 'कृपया अपना अधिकारी क्लीयरेंस पासकी दर्ज करें।' : 'Please enter your Officer Clearance Key.'}`;
      alertEl.style.display = 'block';
    }
    return;
  }
  const ok = await window.setWebsiteOnlineState(true, null, null, keyVal);
  if (!ok && alertEl) {
    alertEl.className = 'auth-alert auth-alert-error';
    alertEl.innerHTML = `⚠️ ${hi ? 'अमान्य अधिकारी क्लीयरेंस पासकी।' : 'Invalid Officer Clearance Key.'}`;
    alertEl.style.display = 'block';
  }
};

const I18N = {
  en: {
    page_title: "Meridian FairLend AI • MISSION BHARAT | Explainable Loan Decision System",
    lang_btn: "🇮🇳 हिन्दी (Hindi)",
    title_lang_btn: "Bilingual Language Switcher",
    brand_title: "Meridian FairLend AI",
    brand_badge: "Mission Bharat",
    brand_sub: "AI-Powered Explainable Lending & Demographic Equity Platform",
    maint_header_pill: "WEBSITE OFFLINE",
    maint_card_badge: "SCHEDULED MAINTENANCE • PORTAL OFFLINE",
    default_maint_title: DEFAULT_OFFLINE_TITLE_EN,
    default_maint_msg: DEFAULT_OFFLINE_MSG_EN,
    maint_meta_default: "Managed by Meridian Institutional Operations",
    btn_check_status: "Check Website Status",
    btn_admin_ctrl: "Officer / Admin Control",
    maint_override_title: "Administrator / Officer Override",
    maint_override_desc: "Sign in with Loan Officer credentials to access the cockpit, or enter your Officer Clearance Key to publish the website back online immediately.",
    btn_maint_signin: "Sign In to Officer Cockpit",
    lbl_quick_publish_key: "Quick Publish With Officer Clearance Key",
    ph_passkey: "Enter officer clearance key",
    btn_bring_online: "Bring Website Online",
    btn_take_offline: "Take Website Offline",
    pill_site_online: "Website: ONLINE",
    pill_site_offline: "Website: OFFLINE",
    gw_applicant_badge: "Applicant Application Portal",
    gw_officer_badge: "Loan Officer Institutional Portal",
    gw_applicant_title: "Applicant Application Portal",
    gw_applicant_sub: "Apply, View Decision & Track Loans",
    gw_officer_title: "Loan Officer Institutional Portal",
    gw_officer_sub: "Underwriting Cockpit, Audits & Fairness",
    mission_strip_left: '<strong style="color: #064E3B;">Track:</strong> Application Development &nbsp;|&nbsp; <strong style="color: #064E3B;">Domain:</strong> Banking &amp; Lending &nbsp;|&nbsp; <strong style="color: #064E3B;">System:</strong> भारत ऋण पारदर्शिता एवं समावेशन मंच',
    auth_mission_right: "Dual-Sync Core Engine • RBI Digital Lending Standards",
    auth_hero_tag: "🏛️ SECURE CREDIT UNDERWRITING GATEWAY",
    auth_hero_title: "Explainable Loan Decision System",
    auth_hero_desc: "Empowering transparent, fair, and algorithmic credit decisions across Bharat with SHAP explainability and demographic parity auditing.",
    auth_card_title_applicant: "Applicant Application Portal",
    auth_card_sub_applicant: "Submit Applications, Inspect Personalized Reports & Track Loan Sanctions",
    auth_card_title_officer: "Loan Officer Institutional Portal",
    auth_card_sub_officer: "Underwriting Workbench, Regulatory Audits, Portfolio Analytics & Fairness",
    auth_tab_applicant: "Applicant Sign In",
    auth_tab_signup_applicant: "Create Applicant Account",
    auth_tab_officer: "Officer Sign In",
    auth_tab_signup_officer: "Register Authorized Officer",
    auth_tag_applicant: "APPLICANT PORTAL • PERSONAL ACCESS",
    auth_tag_app_signup: "APPLICANT PORTAL • NEW BORROWER REGISTRATION",
    auth_tag_officer: "LOAN OFFICER TERMINAL • INSTITUTIONAL ACCESS",
    auth_tag_off_signup: "OFFICER PORTAL • AUTHORIZED CLEARANCE REGISTRATION",
    lbl_app_email: "Applicant Email Address",
    ph_app_email: "applicant@domain.com",
    lbl_password: "Password",
    link_forgot_pwd: "Forgot Password?",
    title_show_hide_pwd: "Show/Hide Password",
    btn_signin_app: "Sign In as Applicant",
    auth_demo_app_title: "Applicant Evaluation Account",
    auth_demo_app_btn: "👤 Ananya Rao (Applicant Demo)",
    lbl_officer_email: "Institutional Officer Email",
    ph_off_email: "officer@meridianbank.in",
    lbl_officer_pwd: "Officer Password",
    btn_signin_officer: "Sign In as Loan Officer",
    auth_officer_security_title: "Authorized Institutional Portal",
    auth_officer_security_note: "Officer login requires verified bank credentials issued by your branch administrator. Protected by sliding-window brute-force defense.",
    lbl_su_name: "Full Name",
    ph_su_name: "e.g. Ananya Rao",
    lbl_off_su_name: "Officer Full Name",
    ph_off_name: "e.g. Vikram Sharma",
    lbl_su_email: "Email Address",
    lbl_su_phone: "Mobile Number",
    ph_su_phone: "10-digit mobile number",
    lbl_su_passkey: "Officer Clearance Key (Passkey)",
    su_passkey_hint: "Institutional authorization required. Obtain your Officer Clearance Key from your branch administrator.",
    lbl_su_pwd: "Password (Min 8 chars, letter + digit)",
    lbl_su_confirm_pwd: "Confirm Password",
    btn_signup_app_submit: "Create Applicant Account",
    btn_signup_off_submit: "Register Authorized Officer",
    auth_comp_1: "🔒 End-to-End Encrypted Session",
    auth_comp_2: "PBKDF2-HMAC-SHA256 Cryptography",
    auth_comp_3: "Persistent Vault & Cloud Sync",
    auth_comp_4: "RBI Fair Lending Framework",
    role_badge_applicant: "APPLICANT",
    role_badge_officer: "LOAN OFFICER",
    title_site_toggle_pill: "Control public website availability (Online / Offline)",
    title_signout: "Sign Out of Session",
    btn_signout: "Sign Out",
    title_encrypted_session: "Encrypted Borrower Session Active",
    badge_encrypted_session: "Encrypted Borrower Session",
    title_backend_badge: "Click to check or configure REST Backend API connection",
    nav_apply: "<span>📝</span> 1. Apply for a Loan",
    nav_report: "<span>📊</span> 2. My Decision Report",
    nav_vault_applicant: "<span>🗄️</span> 3. My Applications Vault",
    nav_vault_officer: "<span>🗄️</span> 2. Central Application Vault (Institution-Wide)",
    nav_portfolio: "<span>📁</span> 3. Historical Portfolio",
    nav_officer: "<span>⚙️</span> 1. Underwriting Cockpit & SHAP Waterfall",
    nav_accuracy: '<span>🎯</span> 4. Model Accuracy Report <span class="tag">80% Accuracy</span>',
    nav_fairness: '<span>⚖️</span> 5. Fairness Across Groups <span class="tag">80% Rule</span>',
    no_app_title: "No Loan Application Submitted Yet",
    no_app_desc: "Submit your loan application to generate your live AI underwriting report, personalized eligibility roadmap, and RBI Key Fact Statement.",
    no_app_cta: "Apply for a Loan →",
    adj_title: "🏛️ Official Underwriter Decision & Status",
    status_pending: "PENDING REVIEW",
    adj_remarks_lbl: "Officer Remarks:",
    adj_remarks_none: "Awaiting institutional officer review.",
    adj_updated_lbl: "Last Updated:",
    off_banner_title: "🔴 Website is Currently OFFLINE (Public Maintenance Mode Active)",
    off_banner_desc: "Public visitors and applicants currently see the Maintenance Notice screen. Officer operations remain accessible.",
    btn_put_online_now: "Put Website Online Now",
    btn_configure_notice: "Configure Notice",
    sub_banner_title: "Your Application Has Been Submitted!",
    sub_banner_ref_lbl: "Reference:",
    sub_banner_desc: "Stored securely in Meridian Vault. Review your instant underwriting report below:",
    btn_dl_sanction: "Download Sanction Letter",
    btn_dismiss: "Dismiss",
    hero_gauge_lbl: "Automated Approval Likelihood",
    hero_baseline_lbl: "Approval Baseline: ≥ 50%",
    apply_eyebrow: "Mission Bharat • Direct Borrower Application Portal",
    apply_heading: "Submit a Retail Loan Application",
    apply_subheading: "Fill in your personal profile, monthly earnings, CIBIL score, and requested facility. Your application is automatically analyzed by AI and permanently recorded in the Meridian Application Vault & Registry.",
    apply_storage_lbl: "Storage Engine",
    apply_storage_val: "Secure Application Vault",
    apply_suc_title: "Application Successfully Saved in Database!",
    apply_suc_ref_prefix: "Your application has been assigned Reference ID",
    apply_suc_ref_suffix: "and recorded permanently in the Meridian Vault.",
    apply_suc_status_lbl: "Status:",
    apply_suc_score_lbl: "AI Score:",
    apply_suc_emi_lbl: "Monthly EMI:",
    apply_suc_cibil_lbl: "CIBIL Tier:",
    btn_view_decision_report: "View My Decision Report",
    btn_view_my_vault: "View My Applications Vault",
    sec_personal: "1. Personal & Demographic Profile",
    lbl_name: "Full Name of Applicant *",
    ph_fill_name: "e.g. Ananya Rao, Devansh Kulkarni",
    lbl_phone: "Contact Mobile Number *",
    ph_fill_phone: "10-digit mobile (e.g. 9876543210)",
    lbl_gender: "Gender *",
    lbl_married: "Marital Status *",
    lbl_dependents: "Number of Dependents *",
    lbl_education: "Highest Education Level *",
    lbl_employment: "Primary Employment & Livelihood *",
    lbl_salary_slip: "Official Salary Slip Available? *",
    hint_doc_proof: "Documentary Proof",
    txt_slip_yes: "✓ Yes (Salary Slip Available)",
    txt_slip_no: "✕ No (Bank Statement / Digital Invoices)",
    lbl_area: "Property & Residence Territory *",
    sec_financial: "2. Earnings, Loan Request & CIBIL Bureau",
    lbl_app_income: "Applicant Monthly Income (₹) *",
    lbl_coapp_income: "Co-Applicant Monthly Income (₹)",
    lbl_purpose: "Loan Facility Purpose *",
    lbl_loan_amount: "Requested Loan Amount (₹) *",
    hint_loan_inr: "₹1,50,000 (₹1.5 Lakh)",
    ph_loan_amount: "e.g. 150000",
    lbl_tenure: "Loan Tenure (1 to 30 Years) *",
    tick_1yr: "1 Year (12m)",
    tick_5yr: "5 Yrs",
    tick_10yr: "10 Yrs",
    tick_15yr: "15 Yrs",
    tick_20yr: "20 Yrs",
    tick_30yr: "30 Years (360m)",
    tick_none: "₹0 (None)",
    lbl_choose_year: "Choose any year:",
    lbl_years_flex: "years (Flexible from 1 to 30 yrs)",
    lbl_cibil: "CIBIL Credit Bureau Score *",
    tick_cibil_300: "300 (Subprime)",
    tick_cibil_300_poor: "300 (Poor / Default)",
    tick_cibil_650: "650 (Qualifying)",
    tick_cibil_750: "750 (Prime)",
    tick_cibil_900: "900 (Stellar)",
    tick_cibil_900_perf: "900 (Perfect)",
    rbi_consent_title: "RBI Digital Lending & Fair Lending Statutory Consent (2022 Guidelines)",
    rbi_consent_html: '<strong>Statutory Borrower Declaration (CICRA 2005 &amp; DPDP Act 2023):</strong> I hereby grant explicit consent to <strong>Meridian FairLend AI</strong> under <strong>Mission Bharat</strong> to access my credit bureau history (CIBIL/CRIF) and process my personal data locally in accordance with the <strong>RBI Digital Lending Directions 2022</strong>. I acknowledge that all underwriting decisions are non-discriminatory, transparent, explainable (XAI), and subject to a statutory <strong>3-Day Look-Up / Cooling-Off Period</strong> without exit penalty.',
    apply_footer_note: "🔒 Guaranteed Data Encryption • Stored in Meridian Vault • Auditable under RBI Fair Practices Code",
    btn_reset_form: "Reset Form",
    btn_submit_app: "Submit & Record in Database",
    opt_female: "Female",
    opt_male: "Male",
    opt_married_yes: "Married (Yes)",
    opt_married_no: "Unmarried (No)",
    opt_dep_0: "0 (None)",
    opt_dep_1: "1 Dependent",
    opt_dep_2: "2 Dependents",
    opt_dep_3p: "3+ Dependents",
    opt_edu_grad: "Graduate / Post-Graduate / Professional",
    opt_edu_nongrad: "Non-Graduate (High School / Vocational)",
    opt_grad_short: "Graduate",
    opt_not_grad_short: "Not Graduate",
    opt_self_yes: "Yes (Business / Artisan)",
    opt_self_no: "No (Salaried)",
    opt_ch_1: "1 (Meets Guidelines / Clean)",
    opt_ch_0: "0 (Does Not Meet / Default History)",
    opt_emp_freelance: "Freelancing / Gig Economy / Tech Freelancer",
    opt_emp_priv: "Salaried (Private / Corporate)",
    opt_emp_govt: "Salaried (Government / PSU)",
    opt_emp_msme: "Self-Employed (Small Business / MSME)",
    opt_emp_farmer: "Farmer (Agriculture / Cultivator)",
    opt_emp_artisan: "Artisan / Rural Handloom Weaver",
    opt_emp_retail: "Retail Merchant / Shop Owner",
    opt_area_rural_full: "Rural Bharat (Mission Bharat Priority Corridor)",
    opt_area_semi_full: "Semi-Urban Developing Center",
    opt_area_urban_full: "Urban / Metro City",
    opt_area_rural_short: "Rural Bharat",
    opt_area_semi_short: "Semi-Urban",
    opt_area_urban_short: "Urban Metro",
    opt_purp_home: "Home Construction / Renovation / Purchase",
    opt_purp_msme: "Small Business / MSME Working Capital",
    opt_purp_agri: "Agricultural Equipment / Irrigation / Solar",
    opt_purp_edu: "Higher Education / Skill Training",
    opt_purp_veh: "Vehicle / Two-Wheeler / Commercial Transport",
    opt_purp_med: "Personal / Family Health Facility",
    sim_title: '🎛️ Interactive "What-If" Counterfactual Simulator',
    sim_sub: "Simulate changes to your loan amount, tenure, co-applicant income, CIBIL, and salary slip to see exact real-time approval adjustments.",
    lbl_sim_likelihood: "Simulated Likelihood:",
    lbl_sim_emi: "Simulated Monthly EMI:",
    lbl_sim_dti: "Simulated Debt Burden (DTI):",
    lbl_sim_cibil_tier: "Credit Rating Tier:",
    lbl_sim_doc_status: "Income Documentation:",
    lbl_sim_loan: "Requested Loan Amount (₹):",
    lbl_sim_exact_loan: "Exact amount (₹):",
    lbl_sim_coapp: "Co-Applicant Monthly Income:",
    lbl_sim_term: "Loan Tenure (Duration):",
    lbl_sim_cibil: "Simulated CIBIL Score:",
    lbl_sim_slip_toggle: "Salary Slip Attached in Simulation:",
    btn_yes: "Yes",
    btn_no: "No",
    btn_apply_whatif: "⚡ Apply This Scenario to My Application",
    btn_reset_whatif: "↺ Reset to Baseline",
    strengths_title: "Top Factors Helping Your Application",
    strengths_sub: "Key strengths identified in your data that increased your approval score",
    frictions_title: "Top Barriers Influencing This Outcome",
    frictions_sub: "Primary friction points or risks reducing your probability of sanction",
    roadmap_title: "Personalized Eligibility Roadmap",
    roadmap_sub: "Transparent, actionable steps to qualify or maximize loan amount",
    btn_open_letter: "View & Download Official Sanction Letter",
    prompt_apply_letter: "Apply for a loan to generate and download your official RBI-compliant Sanction Letter.",
    btn_apply_loan_link: "Apply for Loan →",
    approved_title: "Likely to be Approved",
    conditional_title: "Borderline / Needs Review",
    rejected_title: "High Risk / Unlikely to be Approved",
    approved_desc: "Your credit and financial profile comfortably satisfies Meridian Mission Bharat underwriting benchmarks.",
    conditional_desc: "Your application is near the approval threshold. Minor adjustments or guarantor backing will secure an offer.",
    rejected_desc: "Current risk markers exceed credit policy guidelines. Review the specific factors and remediation plan below.",
    cockpit_site_eyebrow: "🌐 Website Availability & Maintenance Control",
    cockpit_site_lbl: "Public Portal Status:",
    cockpit_badge_online: "ONLINE (LIVE)",
    cockpit_badge_offline: "OFFLINE (MAINTENANCE)",
    cockpit_sub_online: "All public underwriting, application intake, and applicant login routes are active.",
    btn_customize_offline: "Customize Offline Page",
    off_intake_title: "Applicant Underwriting Intake",
    off_intake_sub: "Inspect and customize applicant variables for instant scoring",
    off_lbl_name: "Full Name / Reference",
    off_lbl_gender: "Gender",
    off_lbl_married: "Marital Status",
    off_lbl_dependents: "Dependents",
    off_lbl_edu: "Education",
    off_lbl_self_emp: "Self-Employed / Profession",
    off_lbl_app_inc: "Applicant Monthly Income (₹)",
    off_lbl_coapp_inc: "Co-Applicant Monthly Income (₹)",
    off_lbl_loan_amt: "Loan Amount (₹)",
    off_lbl_tenure: "Tenure (Months)",
    off_lbl_credit_hist: "Credit Bureau History",
    off_lbl_area: "Property Territory",
    off_met_ml: "ML Likelihood",
    off_met_dti: "DTI Burden",
    off_met_emi: "Estimated EMI",
    off_met_lti: "Loan-to-Income",
    off_shap_title: "SHAP / Feature Attribution Waterfall",
    off_shap_sub: "Marginal log-odds contribution of each variable to this specific decision",
    off_shap_leg_pos: "● Approval (+%)",
    off_shap_leg_neg: "● Risk (-%)",
    off_action_title: "Officer Action & Regulatory Audit",
    off_action_sub: "Authorize sanction, apply Mission Bharat subsidy, or record adverse action",
    ph_officer_remarks: "Enter official underwriting remarks (e.g., CIBIL score verified, DTI ratio compliant)...",
    btn_sanction_approve: "✓ Sanction Loan",
    btn_sanction_subvention: "⚡ Mission Bharat Rural Subvention Pass",
    btn_sanction_decline: "✕ Adverse Action (Decline)",
    btn_save_officer_terms: "💾 Save Parameter Changes to Vault",
    btn_officer_preview_letter: "📄 Preview / Issue Sanction Notice",
    off_audit_title: "Underwriter Decision & Compliance Audit Log",
    off_audit_sub: "Complete chronological trail for internal RBI compliance inspection",
    off_th_time: "Timestamp",
    off_th_by: "Reviewed By",
    off_th_appid: "Applicant ID",
    off_th_act: "Action Recorded",
    off_th_note: "Underwriter Regulatory Justification",
    mod_met_acc: "Overall Model Accuracy",
    mod_met_prec: "Precision (Sanction Quality)",
    mod_met_rec: "Recall / Sensitivity",
    mod_met_auc: "ROC-AUC Discriminator",
    mod_cm_title: "Confusion Matrix (Holdout Validation)",
    mod_cm_sub: "Empirical out-of-sample evaluation on lending portfolio split",
    mod_cm_badge: "Evaluated",
    cm_pred_y: "Predicted Approved (Y)",
    cm_pred_n: "Predicted Rejected (N)",
    cm_act_y: "Actual Approved",
    cm_act_n: "Actual Rejected",
    cm_tp_lbl: "True Positive (TP)",
    cm_tp_sub: "Accurately Approved",
    cm_fn_lbl: "False Negative (FN)",
    cm_fn_sub: "Creditworthy Missed",
    cm_fp_lbl: "False Positive (FP)",
    cm_fp_sub: "Risky Sanctions",
    cm_tn_lbl: "True Negative (TN)",
    cm_tn_sub: "Accurately Identified Risk",
    cm_takeaway: "<strong>Underwriter Takeaway:</strong> With high validation recall sensitivity, the calibrated model ensures creditworthy applicants are not arbitrarily excluded from formal credit.",
    mod_feat_title: "Global Feature Importance & Polarities",
    mod_feat_sub: "Normalized feature weights across entire Bharat loan portfolio",
    mod_gov_title: "Model Architecture & Regulatory Governance Summary",
    mod_gov_sub: "Compliance documentation for RBI and Fair Lending Auditing Authorities",
    gov_algo_t: "Algorithm:",
    gov_algo_d: "Calibrated L2-Regularized Logistic Regression with explicit weight normalization. Offers complete mathematical transparency over black-box deep learning.",
    gov_xai_t: "Explainability Mechanism:",
    gov_xai_d: "Linear additive SHAP-congruent attribution decomposing raw log-odds into marginal feature percentage points for applicants and loan officers.",
    gov_fair_t: "Fair Lending Safeguards:",
    gov_fair_d: "Mandatory 80% Disparate Impact Ratio testing, Demographic Parity evaluation, and Equal Opportunity TPR matching across rural and gender strata.",
    fair_hero_eyebrow: "Mission Bharat Equity Intervention",
    fair_hero_title: "Affirmative Financial Inclusion Calibration",
    fair_hero_desc: "Standard legacy banking models penalize rural and thin-file borrowers due to lack of formal commercial credit tracks. Toggle the Mission Bharat calibration engine to offset structural geographic disparities.",
    fair_toggle_lbl: "Enable Mission Bharat Calibration:",
    fair_tbl_title: "Demographic Parity & Disparate Impact Audit Table",
    fair_tbl_sub: "Evaluating compliance against the 80% (Four-Fifths) Fair Lending Rule and TPR Parity",
    fair_th_cat: "Protected Category",
    fair_th_grp: "Demographic Group",
    fair_th_n: "Sample Size (N)",
    fair_th_rate: "Approval Rate",
    fair_th_tpr: "Equal Opp. TPR (Recall)",
    fair_th_dir: "Disparate Impact Ratio",
    fair_th_status: "Regulatory Status",
    fair_c1_t: "Disparate Impact Ratio (DIR):",
    fair_c1_d: "Selection rate of unprivileged group divided by privileged group. A ratio <strong>&ge; 0.80</strong> complies with the EEOC / Fair Housing four-fifths standard.",
    fair_c2_t: "Equal Opportunity (TPR Parity):",
    fair_c2_d: "True Positive Rate equality guarantees that creditworthy applicants from rural regions have an equal opportunity of being approved as urban peers.",
    fair_c3_t: "Mission Bharat Impact:",
    fair_c3_d: "Enabling calibration raises rural approval from <strong>71.5% to 84.1%</strong>, elevating DIR from 0.83 to 0.97 and eliminating systematic geographic exclusion.",
    port_title: "Historical Loan Applications (Bharat Lending Pool)",
    port_sub: "Search, filter and inspect historical borrower files",
    ph_portfolio_search: "Search by Loan ID or Region (e.g. LP001003, Rural)...",
    flt_all: "All",
    flt_approved: "Approved",
    flt_rejected: "Rejected",
    flt_rural: "Rural",
    flt_women: "Women",
    port_th_id: "Loan ID",
    port_th_gender: "Gender",
    port_th_area: "Property Area",
    port_th_income: "Household Income",
    port_th_req: "Requested Loan",
    port_th_hist: "Bureau History",
    port_th_prob: "ML Likelihood",
    port_th_status: "Predicted Status",
    port_th_act: "Action",
    btn_prev_page: "← Previous",
    btn_next_page: "Next →",
    db_title: "Official Meridian Application Vault & Registry",
    db_sub: "All loan applications submitted via the portal are permanently recorded and available here",
    db_title_applicant: "My Submitted Loan Applications Vault",
    db_sub_applicant: "Every loan application you submit is securely archived here across sessions and devices",
    db_count_loading: "Loading Vault...",
    db_empty_applicant: "No applications submitted from this account yet. Use '1. Apply for a Loan' to create your first application.",
    db_empty_officer: "No loan applications recorded in the institution vault yet.",
    btn_download_db_backup: "Download Vault Backup (.db)",
    btn_export_csv: "Export to Excel / CSV",
    btn_export_json: "Export JSON",
    btn_refresh: "Refresh",
    db_th_appno: "Application No",
    db_th_date: "Submitted Date",
    db_th_name: "Applicant Name",
    db_th_cibil: "CIBIL Score",
    db_th_slip: "Salary Slip",
    db_th_income: "Total Income",
    db_th_req: "Requested Facility",
    db_th_area: "Territory",
    db_th_score: "AI Score",
    db_th_status: "Status",
    db_th_actions: "Actions",
    db_excel_tip: '<strong>Access on Laptop:</strong> Click <strong>"Export to Excel / CSV"</strong> above to immediately open all applications in Microsoft Excel or Google Sheets.',
    db_sync_note: "Auto-synced with Persistent Central Database",
    footer_mission_badge: "OUR MISSION",
    footer_mission_statement: "Make every credit decision easier to understand.",
    footer_mission_supporting: "Explain the decision. Identify improvement opportunities. Evaluate fairness responsibly.",
    footer_division: "MISSION BHARAT • RETAIL CREDIT DIVISION • 2026",
    footer_disclaimer: "© 2026 Meridian FairLend. Operating in compliance with the Reserve Bank of India (RBI) Regulatory Framework for Digital Lending.",
    let_bank_name: "MERIDIAN FAIRLEND AI",
    let_division: "Mission Bharat • Inclusive Retail Credit Division",
    let_office: "Reg. Office: Nariman Point, Mumbai 400021 • RBI Reg #N-13.01928",
    let_ref_lbl: "Reference:",
    let_date_lbl: "Date:",
    let_app_name_lbl: "Applicant Name:",
    let_fac_lbl: "Requested Facility:",
    let_tenure_lbl: "Tenure:",
    let_area_lbl: "Territory:",
    kfs_title: "OFFICIAL RBI KEY FACT STATEMENT (KFS)",
    kfs_compliant: "RBI Digital Lending Compliant",
    kfs_row_principal: "Sanctioned Facility Amount (Principal)",
    kfs_row_apr: "All-Inclusive Annual Percentage Rate (APR)",
    kfs_row_tenure: "Loan Tenure / Repayment Installments",
    kfs_row_emi: "Equated Monthly Installment (EMI)",
    kfs_row_interest: "Total Interest Amount Payable",
    kfs_row_total: "Total Repayment Amount (Principal + Interest)",
    kfs_row_proc: "Upfront Processing & Verification Fees",
    kfs_val_proc: "₹0 (Nil - Mission Bharat Subsidy)",
    kfs_row_prepay: "Prepayment / Foreclosure Charges",
    kfs_val_prepay: "₹0 (Nil per RBI Master Circular)",
    kfs_row_cooling: "Statutory Cooling-Off / Look-Up Period",
    kfs_val_cooling: "3 Business Days (Full exit without penalty)",
    let_factors_heading: "Transparent Factor Determination (Under RBI Fair Lending Code):",
    let_ombudsman_html: '<strong>RBI Fair Practices Code &amp; Statutory Redressal Mechanism:</strong><br>• <strong>Principal Grievance Redressal Officer:</strong> Smt. Shalini Verma, Nodal Grievance Officer, Meridian FairLend AI, Nariman Point, Mumbai 400021. Toll-Free: <code>1800-209-4000</code> | Email: <code>grievance.bharat@meridian.fin</code> (Resolution SLA: within 15 working days).<br>• <strong>RBI Integrated Ombudsman Scheme:</strong> If your grievance is not redressed within 30 days, you have the statutory right under the Reserve Bank of India Integrated Ombudsman Scheme, 2021 to lodge a complaint online at <strong><a href="https://cms.rbi.org.in" target="_blank" style="color: #064E3B; font-weight: 700; text-decoration: underline;">https://cms.rbi.org.in</a></strong> or dial toll-free <code>14448</code>.',
    btn_print_pdf: "Print / Save PDF",
    btn_close: "Close",
    modal_api_title: "FastAPI Backend Connection Hub",
    modal_api_origin: "Active REST API Origin",
    modal_api_status_lbl: "Status:",
    modal_api_docs_note: 'All authentication, underwriting scoring, SHAP explainability, and fairness checks communicate live with FastAPI (<a id="modal-swagger-link" href="/docs" target="_blank" style="color: #064E3B; font-weight: 700; text-decoration: underline;">OpenAPI /docs</a>).',
    modal_api_custom_t: "Connect Custom Internet Backend URL (Optional):",
    modal_api_custom_d: "If serving frontend separately, enter your deployed internet API base URL:",
    ph_custom_api: "https://your-service.up.railway.app",
    btn_save_url: "Save URL",
    btn_auto_detect: "Auto-Detect",
    btn_test_reconnect: "Test & Reconnect",
    modal_site_title: "Website Online / Offline Control",
    modal_site_curr_lbl: "Current Public Availability",
    badge_online: "ONLINE",
    badge_offline: "OFFLINE",
    modal_site_live_desc: "Website is live and accessible to all applicants & visitors.",
    modal_site_heading_lbl: "Offline Screen Heading",
    ph_site_heading: "Portal Temporarily Offline",
    modal_site_msg_lbl: "Custom Maintenance Notice for Visitors",
    ph_site_msg: "Enter message visitors will see while website is offline...",
    modal_site_how: "<strong>How Offline Mode Works:</strong> Taking the website offline shows public visitors and applicants a branded <em>Maintenance Page</em> and returns HTTP <code>503</code> on public routes. Loan Officers can still log in at any time to restore Online access.",
    btn_go_online: "Go Online (Live)",
    otp_box_title: "Email OTP Verification",
    otp_app_title: "Application Email OTP Check",
    otp_badge_pending: "Not Verified",
    otp_badge_verified: "✓ Verified",
    btn_send_otp: "Send OTP",
    btn_resend_otp: "Resend OTP",
    btn_verify_otp: "Verify OTP",
    ph_otp_code: "6-digit OTP",
    otp_hint_signup: "Click Send OTP to receive a 6-digit verification code in your inbox.",
    otp_hint_apply: "Verify your email via 6-digit OTP before submitting your loan application.",
    otp_hint_forgot: "Enter your registered email and click Send OTP to receive a recovery code.",
    otp_hint_unconfigured: "Real Email OTP is not active yet: add BREVO_API_KEY + EMAIL_FROM in Railway Variables (free HTTPS API) to deliver inbox codes.",
    lbl_fill_email: "Applicant Email for Verification *",
    ph_fill_email: "Enter your email for OTP verification",
    fp_modal_title: "Reset Password via Email OTP",
    fp_lbl_email: "Registered Email Address",
    ph_fp_email: "name@domain.com",
    fp_lbl_otp: "6-Digit Email OTP",
    fp_lbl_new_pwd: "New Password (Min 8 chars, letter + digit)",
    fp_lbl_confirm_pwd: "Confirm New Password",
    fp_btn_submit: "Verify & Reset Password"
  },
  hi: {
    page_title: "मेरिडियन फेयरलेंड एआई • मिशन भारत | पारदर्शी ऋण निर्णय प्रणाली",
    lang_btn: "🇬🇧 English",
    title_lang_btn: "द्विभाषी भाषा चयनकर्ता",
    brand_title: "मेरिडियन फेयरलेंड एआई (Meridian FairLend AI)",
    brand_badge: "मिशन भारत",
    brand_sub: "एआई-संचालित पारदर्शी ऋण निर्णय एवं सामाजिक समानता मंच",
    maint_header_pill: "वेबसाइट ऑफ़लाइन",
    maint_card_badge: "निर्धारित रखरखाव • पोर्टल ऑफ़लाइन",
    default_maint_title: "पोर्टल अस्थायी रूप से ऑफ़लाइन है",
    default_maint_msg: "मेरिडियन फेयरलेंड एआई इस समय निर्धारित सिस्टम रखरखाव के लिए ऑफ़लाइन है। ऑनलाइन ऋण सेवाएं शीघ्र ही पुनः शुरू होंगी।",
    maint_meta_default: "मेरिडियन संस्थागत परिचालन द्वारा प्रबंधित",
    btn_check_status: "वेबसाइट स्थिति जांचें",
    btn_admin_ctrl: "अधिकारी / एडमिन नियंत्रण",
    maint_override_title: "प्रशासक / अधिकारी ओवरराइड",
    maint_override_desc: "कॉकपिट खोलने के लिए ऋण अधिकारी विवरण से साइन इन करें, या वेबसाइट को तुरंत ऑनलाइन करने के लिए अपनी अधिकारी क्लीयरेंस पासकी दर्ज करें।",
    btn_maint_signin: "अधिकारी कॉकपिट में साइन इन करें",
    lbl_quick_publish_key: "अधिकारी क्लीयरेंस पासकी से तुरंत लाइव करें",
    ph_passkey: "अधिकारी क्लीयरेंस पासकी दर्ज करें",
    btn_bring_online: "वेबसाइट ऑनलाइन चालू करें",
    btn_take_offline: "वेबसाइट ऑफ़लाइन करें",
    pill_site_online: "वेबसाइट: ऑनलाइन",
    pill_site_offline: "वेबसाइट: ऑफ़लाइन",
    gw_applicant_badge: "आवेदक आवेदन पोर्टल",
    gw_officer_badge: "ऋण अधिकारी संस्थागत पोर्टल",
    gw_applicant_title: "आवेदक आवेदन पोर्टल",
    gw_applicant_sub: "आवेदन करें, निर्णय देखें व ऋण ट्रैक करें",
    gw_officer_title: "ऋण अधिकारी संस्थागत पोर्टल",
    gw_officer_sub: "अंडरराइटिंग कॉकपिट, ऑडिट व निष्पक्षता",
    mission_strip_left: '<strong style="color: #064E3B;">श्रेणी:</strong> एप्लिकेशन डेवलपमेंट &nbsp;|&nbsp; <strong style="color: #064E3B;">क्षेत्र:</strong> बैंकिंग एवं ऋण सेवा &nbsp;|&nbsp; <strong style="color: #064E3B;">प्रणाली:</strong> भारत ऋण पारदर्शिता एवं समावेशन मंच',
    auth_mission_right: "डुअल-सिंक कोर इंजन • RBI डिजिटल लेंडिंग मानक",
    auth_hero_tag: "🏛️ सुरक्षित ऋण अंडरराइटिंग प्रवेश द्वार",
    auth_hero_title: "व्याख्यात्मक ऋण निर्णय प्रणाली",
    auth_hero_desc: "SHAP पारदर्शिता और जनसांख्यिकीय निष्पक्षता ऑडिट के साथ पूरे भारत में निष्पक्ष, स्पष्ट और भरोसेमंद ऋण निर्णय प्रदान करना।",
    auth_card_title_applicant: "आवेदक आवेदन पोर्टल",
    auth_card_sub_applicant: "ऋण आवेदन जमा करें, व्यक्तिगत रिपोर्ट जांचें और स्वीकृति स्थिति ट्रैक करें",
    auth_card_title_officer: "ऋण अधिकारी संस्थागत पोर्टल",
    auth_card_sub_officer: "अंडरराइटिंग कॉकपिट, नियामक ऑडिट, पोर्टफोलियो विश्लेषण एवं निष्पक्षता",
    auth_tab_applicant: "आवेदक साइन इन",
    auth_tab_signup_applicant: "नया आवेदक खाता बनाएं",
    auth_tab_officer: "अधिकारी साइन इन",
    auth_tab_signup_officer: "अधिकृत अधिकारी पंजीकृत करें",
    auth_tag_applicant: "आवेदक पोर्टल • व्यक्तिगत लॉगिन",
    auth_tag_app_signup: "आवेदक पोर्टल • नया ऋणदाता पंजीकरण",
    auth_tag_officer: "ऋण अधिकारी टर्मिनल • संस्थागत लॉगिन",
    auth_tag_off_signup: "अधिकारी पोर्टल • अधिकृत क्लीयरेंस पंजीकरण",
    lbl_app_email: "आवेदक ईमेल पता",
    ph_app_email: "applicant@domain.com",
    lbl_password: "पासवर्ड",
    link_forgot_pwd: "पासवर्ड भूल गए?",
    title_show_hide_pwd: "पासवर्ड दिखाएं / छिपाएं",
    btn_signin_app: "आवेदक के रूप में साइन इन करें",
    auth_demo_app_title: "आवेदक डेमो मूल्यांकन खाता",
    auth_demo_app_btn: "👤 अनन्या राव (आवेदक डेमो)",
    lbl_officer_email: "संस्थागत अधिकारी ईमेल",
    ph_off_email: "officer@meridianbank.in",
    lbl_officer_pwd: "अधिकारी पासवर्ड",
    btn_signin_officer: "ऋण अधिकारी के रूप में साइन इन करें",
    auth_officer_security_title: "अधिकृत संस्थागत पोर्टल",
    auth_officer_security_note: "अधिकारी लॉगिन के लिए शाखा प्रशासक द्वारा जारी सत्यापित बैंक प्रमाण-पत्र आवश्यक हैं। यह स्लाइडिंग-विंडो सुरक्षा द्वारा रक्षित है।",
    lbl_su_name: "पूरा नाम",
    ph_su_name: "जैसे: अनन्या राव",
    lbl_off_su_name: "अधिकारी का पूरा नाम",
    ph_off_name: "जैसे: विक्रम शर्मा",
    lbl_su_email: "ईमेल पता",
    lbl_su_phone: "मोबाइल नंबर",
    ph_su_phone: "10 अंकों का मोबाइल नंबर",
    lbl_su_passkey: "अधिकारी क्लीयरेंस पासकी",
    su_passkey_hint: "संस्थागत अनुमति आवश्यक है। अपनी अधिकारी क्लीयरेंस पासकी शाखा प्रशासक से प्राप्त करें।",
    lbl_su_pwd: "पासवर्ड (न्यूनतम 8 अक्षर, अक्षर + अंक)",
    lbl_su_confirm_pwd: "पासवर्ड की पुष्टि करें",
    btn_signup_app_submit: "आवेदक खाता बनाएं",
    btn_signup_off_submit: "अधिकृत अधिकारी पंजीकृत करें",
    auth_comp_1: "🔒 एंड-टू-एंड एन्क्रिप्टेड सत्र",
    auth_comp_2: "PBKDF2-HMAC-SHA256 सुरक्षा",
    auth_comp_3: "स्थायी वॉल्ट एवं क्लाउड सिंक",
    auth_comp_4: "RBI फेयर लेंडिंग फ्रेमवर्क",
    role_badge_applicant: "आवेदक",
    role_badge_officer: "ऋण अधिकारी",
    title_site_toggle_pill: "सार्वजनिक वेबसाइट स्थिति बदलें (ऑनलाइन / ऑफ़लाइन)",
    title_signout: "सत्र से लॉग आउट करें",
    btn_signout: "लॉग आउट",
    title_encrypted_session: "एन्क्रिप्टेड आवेदक सत्र सक्रिय",
    badge_encrypted_session: "एन्क्रिप्टेड आवेदक सत्र",
    title_backend_badge: "REST बैकएंड एपीआई कनेक्शन जांचने या बदलने के लिए क्लिक करें",
    nav_apply: "<span>📝</span> 1. ऋण के लिए आवेदन करें",
    nav_report: "<span>📊</span> 2. मेरी निर्णय रिपोर्ट",
    nav_vault_applicant: "<span>🗄️</span> 3. मेरे आवेदन वॉल्ट",
    nav_vault_officer: "<span>🗄️</span> 2. केंद्रीय आवेदन वॉल्ट (बैंक-व्यापी)",
    nav_portfolio: "<span>📁</span> 3. ऐतिहासिक पोर्टफोलियो",
    nav_officer: "<span>⚙️</span> 1. अंडरराइटिंग कॉकपिट एवं SHAP विश्लेषण",
    nav_accuracy: '<span>🎯</span> 4. मॉडल सटीकता रिपोर्ट <span class="tag">80% सटीकता</span>',
    nav_fairness: '<span>⚖️</span> 5. समूह निष्पक्षता ऑडिट <span class="tag">80% नियम</span>',
    no_app_title: "अभी तक कोई ऋण आवेदन जमा नहीं किया गया है",
    no_app_desc: "अपनी लाइव एआई अंडरराइटिंग रिपोर्ट, व्यक्तिगत पात्रता सुधार योजना और आरबीआई मुख्य तथ्य विवरण (KFS) प्राप्त करने के लिए ऋण आवेदन जमा करें।",
    no_app_cta: "ऋण के लिए आवेदन करें →",
    adj_title: "🏛️ आधिकारिक अंडरराइटर निर्णय एवं स्थिति",
    status_pending: "समीक्षा प्रतीक्षित",
    adj_remarks_lbl: "अधिकारी टिप्पणी:",
    adj_remarks_none: "संस्थागत अधिकारी की समीक्षा प्रतीक्षित है।",
    adj_updated_lbl: "अंतिम अद्यतन:",
    off_banner_title: "🔴 वेबसाइट वर्तमान में ऑफ़लाइन है (सार्वजनिक रखरखाव मोड सक्रिय)",
    off_banner_desc: "सामान्य आगंतुकों और आवेदकों को अभी रखरखाव सूचना दिख रही है। अधिकारी कार्य सुलभ हैं।",
    btn_put_online_now: "वेबसाइट अभी ऑनलाइन करें",
    btn_configure_notice: "सूचना संपादित करें",
    sub_banner_title: "आपका ऋण आवेदन सफलतापूर्वक जमा हो गया है!",
    sub_banner_ref_lbl: "संदर्भ संख्या:",
    sub_banner_desc: "मेरिडियन वॉल्ट में सुरक्षित दर्ज। नीचे अपनी त्वरित ऋण निर्णय रिपोर्ट देखें:",
    btn_dl_sanction: "स्वीकृति पत्र डाउनलोड करें",
    btn_dismiss: "बंद करें",
    hero_gauge_lbl: "स्वचालित स्वीकृति संभावना",
    hero_baseline_lbl: "स्वीकृति आधार सीमा: ≥ 50%",
    apply_eyebrow: "मिशन भारत • प्रत्यक्ष आवेदक ऋण पोर्टल",
    apply_heading: "खुदरा ऋण आवेदन पत्र जमा करें",
    apply_subheading: "अपना विवरण, मासिक आय, सिबिल स्कोर और वांछित ऋण राशि भरें। आपका आवेदन एआई द्वारा विश्लेषित होकर मेरिडियन सुरक्षित वॉल्ट एवं रजिस्ट्री में स्थायी रूप से दर्ज होगा।",
    apply_storage_lbl: "डेटा संग्रह इंजन",
    apply_storage_val: "सुरक्षित आवेदन वॉल्ट",
    apply_suc_title: "आवेदन डेटाबेस में सफलतापूर्वक सहेजा गया!",
    apply_suc_ref_prefix: "आपके आवेदन को संदर्भ संख्या",
    apply_suc_ref_suffix: "आवंटित की गई है और इसे मेरिडियन वॉल्ट में स्थायी रूप से दर्ज कर लिया गया है।",
    apply_suc_status_lbl: "स्थिति:",
    apply_suc_score_lbl: "AI स्कोर:",
    apply_suc_emi_lbl: "मासिक किस्त:",
    apply_suc_cibil_lbl: "सिबिल श्रेणी:",
    btn_view_decision_report: "मेरी निर्णय रिपोर्ट देखें",
    btn_view_my_vault: "मेरे आवेदन वॉल्ट देखें",
    sec_personal: "1. व्यक्तिगत एवं जनसांख्यिकीय विवरण",
    lbl_name: "आवेदक का पूरा नाम *",
    ph_fill_name: "जैसे: अनन्या राव, देवांश कुलकर्णी",
    lbl_phone: "मोबाइल नंबर *",
    ph_fill_phone: "10 अंकों का मोबाइल नंबर (जैसे 9876543210)",
    lbl_gender: "लिंग *",
    lbl_married: "वैवाहिक स्थिति *",
    lbl_dependents: "आश्रितों की संख्या *",
    lbl_education: "उच्चतम शिक्षा स्तर *",
    lbl_employment: "रोजगार एवं आजीविका का प्रकार *",
    lbl_salary_slip: "आधिकारिक वेतन पर्ची (Salary Slip) उपलब्ध है? *",
    hint_doc_proof: "दस्तावेज़ी प्रमाण",
    txt_slip_yes: "✓ हाँ (वेतन पर्ची उपलब्ध है)",
    txt_slip_no: "✕ नहीं (बैंक विवरण / डिजिटल इनवॉइस)",
    lbl_area: "निवास / संपत्ति क्षेत्र *",
    sec_financial: "2. आय, ऋण मांग एवं सिबिल ब्यूरो",
    lbl_app_income: "आवेदक की मासिक आय (₹) *",
    lbl_coapp_income: "सह-आवेदक की मासिक आय (₹)",
    lbl_purpose: "ऋण सुविधा का उद्देश्य *",
    lbl_loan_amount: "वांछित ऋण राशि (₹) *",
    hint_loan_inr: "₹1,50,000 (₹1.5 लाख)",
    ph_loan_amount: "जैसे: 150000",
    lbl_tenure: "ऋण अवधि (1 से 30 वर्ष) *",
    tick_1yr: "1 वर्ष (12 माह)",
    tick_5yr: "5 वर्ष",
    tick_10yr: "10 वर्ष",
    tick_15yr: "15 वर्ष",
    tick_20yr: "20 वर्ष",
    tick_30yr: "30 वर्ष (360 माह)",
    tick_none: "₹0 (कोई नहीं)",
    lbl_choose_year: "कोई भी वर्ष चुनें:",
    lbl_years_flex: "वर्ष (1 से 30 वर्ष तक लचीली अवधि)",
    lbl_cibil: "सिबिल क्रेडिट ब्यूरो स्कोर *",
    tick_cibil_300: "300 (निम्न)",
    tick_cibil_300_poor: "300 (कमज़ोर / डिफ़ॉल्ट)",
    tick_cibil_650: "650 (योग्य)",
    tick_cibil_750: "750 (उत्कृष्ट)",
    tick_cibil_900: "900 (सर्वोत्तम)",
    tick_cibil_900_perf: "900 (परिपूर्ण)",
    rbi_consent_title: "RBI डिजिटल लेंडिंग एवं निष्पक्ष ऋण वैधानिक सहमति (2022 दिशानिर्देश)",
    rbi_consent_html: '<strong>वैधानिक आवेदक घोषणा (CICRA 2005 एवं DPDP अधिनियम 2023):</strong> मैं <strong>मिशन भारत</strong> के तहत <strong>मेरिडियन फेयरलेंड एआई</strong> को <strong>RBI डिजिटल लेंडिंग दिशानिर्देश 2022</strong> के अनुरूप मेरा क्रेडिट ब्यूरो इतिहास (CIBIL/CRIF) जांचने और डेटा संसाधित करने की स्पष्ट सहमति देता/देती हूँ। मैं स्वीकार करता/करती हूँ कि सभी निर्णय गैर-भेदभावपूर्ण, पारदर्शी (XAI) हैं और बिना किसी दंड शुल्क के वैधानिक <strong>3 कार्य दिवस कूलिंग-ऑफ / समीक्षा अवधि</strong> के अधीन हैं।',
    apply_footer_note: "🔒 सुरक्षित डेटा एन्क्रिप्शन • मेरिडियन वॉल्ट में संग्रहीत • RBI फेयर प्रैक्टिसेज कोड के अंतर्गत ऑडिट योग्य",
    btn_reset_form: "फॉर्म रीसेट करें",
    btn_submit_app: "आवेदन जमा करें एवं डेटाबेस में सहेजें",
    opt_female: "महिला",
    opt_male: "पुरुष",
    opt_married_yes: "विवाहित (हाँ)",
    opt_married_no: "अविवाहित (नहीं)",
    opt_dep_0: "0 (कोई नहीं)",
    opt_dep_1: "1 आश्रित",
    opt_dep_2: "2 आश्रित",
    opt_dep_3p: "3+ आश्रित",
    opt_edu_grad: "स्नातक / स्नातकोत्तर / पेशेवर",
    opt_edu_nongrad: "गैर-स्नातक (हाई स्कूल / व्यावसायिक)",
    opt_grad_short: "स्नातक",
    opt_not_grad_short: "गैर-स्नातक",
    opt_self_yes: "हाँ (व्यवसाय / कारीगर)",
    opt_self_no: "नहीं (वेतनभोगी)",
    opt_ch_1: "1 (मानकों के अनुकूल / स्वच्छ रिकॉर्ड)",
    opt_ch_0: "0 (मानक अपूर्ण / पूर्व बकाया इतिहास)",
    opt_emp_freelance: "फ्रीलांसिंग / गिग अर्थव्यवस्था / स्वतंत्र सलाहकार",
    opt_emp_priv: "वेतनभोगी (निजी / कॉर्पोरेट)",
    opt_emp_govt: "वेतनभोगी (सरकारी / पीएसयू)",
    opt_emp_msme: "स्वरोजगार (लघु व्यवसाय / MSME)",
    opt_emp_farmer: "किसान (कृषि / उत्पादक)",
    opt_emp_artisan: "कारीगर / ग्रामीण हथकरघा शिल्पकार",
    opt_emp_retail: "खुदरा व्यापारी / दुकान मालिक",
    opt_area_rural_full: "ग्रामीण भारत (मिशन भारत प्राथमिकता क्षेत्र)",
    opt_area_semi_full: "अर्ध-शहरी विकासशील केंद्र",
    opt_area_urban_full: "शहरी / महानगर",
    opt_area_rural_short: "ग्रामीण भारत",
    opt_area_semi_short: "अर्ध-शहरी",
    opt_area_urban_short: "शहरी / महानगर",
    opt_purp_home: "गृह निर्माण / नवीनीकरण / क्रय",
    opt_purp_msme: "लघु व्यवसाय / MSME कार्यशील पूंजी",
    opt_purp_agri: "कृषि उपकरण / सिंचाई / सौर ऊर्जा",
    opt_purp_edu: "उच्च शिक्षा / कौशल प्रशिक्षण",
    opt_purp_veh: "वाहन / दुपहिया / वाणिज्यिक परिवहन",
    opt_purp_med: "व्यक्तिगत / पारिवारिक चिकित्सा आवश्यकता",
    sim_title: '🎛️ इंटरएक्टिव "व्हाट-इफ" ऋण सिमुलेटर',
    sim_sub: "ऋण राशि, अवधि, सह-आवेदक आय, सिबिल और वेतन पर्ची बदलकर देखें कि आपकी स्वीकृति संभावना पर क्या प्रभाव पड़ता है।",
    lbl_sim_likelihood: "अनुमानित स्वीकृति संभावना:",
    lbl_sim_emi: "अनुमानित मासिक किस्त (EMI):",
    lbl_sim_dti: "मासिक ऋण भार (DTI):",
    lbl_sim_cibil_tier: "क्रेडिट रेटिंग श्रेणी:",
    lbl_sim_doc_status: "आय सत्यापन दस्तावेज:",
    lbl_sim_loan: "वांछित ऋण राशि (₹):",
    lbl_sim_exact_loan: "सटीक राशि (₹):",
    lbl_sim_coapp: "सह-आवेदक की मासिक आय:",
    lbl_sim_term: "ऋण अवधि:",
    lbl_sim_cibil: "अनुमानित सिबिल स्कोर:",
    lbl_sim_slip_toggle: "सिमुलेटर में वेतन पर्ची स्थिति:",
    btn_yes: "हाँ",
    btn_no: "नहीं",
    btn_apply_whatif: "⚡ यह विकल्प मेरे आवेदन पर लागू करें",
    btn_reset_whatif: "↺ मूल स्थिति पर रीसेट करें",
    strengths_title: "आपके पक्ष में प्रमुख सकारात्मक कारक",
    strengths_sub: "आपके डेटा में पहचानी गई प्रमुख खूबियाँ जिन्होंने स्वीकृति स्कोर बढ़ाया",
    frictions_title: "स्वीकृति में प्रमुख बाधाएं / जोखिम कारक",
    frictions_sub: "वे मुख्य कारक या जोखिम जो ऋण स्वीकृति की संभावना कम कर रहे हैं",
    roadmap_title: "व्यक्तिगत पात्रता सुधार योजना",
    roadmap_sub: "ऋण पात्रता बढ़ाने या अधिकतम राशि प्राप्त करने के स्पष्ट एवं व्यावहारिक कदम",
    btn_open_letter: "आधिकारिक ऋण स्वीकृति पत्र देखें एवं डाउनलोड करें",
    prompt_apply_letter: "अपना आधिकारिक RBI-अनुपालित स्वीकृति पत्र प्राप्त करने के लिए ऋण आवेदन जमा करें।",
    btn_apply_loan_link: "ऋण आवेदन करें →",
    approved_title: "ऋण स्वीकृत होने की प्रबल संभावना",
    conditional_title: "समीक्षाधीन / सशर्त पात्रता",
    rejected_title: "उच्च जोखिम / वर्तमान में स्वीकृति कठिन",
    approved_desc: "आपका वित्तीय एवं क्रेडिट प्रोफाइल मेरिडियन मिशन भारत के ऋण मानकों के सर्वथा अनुकूल है।",
    conditional_desc: "आपका आवेदन स्वीकृति सीमा के अत्यंत निकट है। थोड़े सुधार या सह-आवेदक के सहयोग से प्रस्ताव सुरक्षित हो सकता है।",
    rejected_desc: "वर्तमान जोखिम संकेत ऋण नीति मानकों से अधिक हैं। नीचे दिए गए कारणों और सुधार योजना का अवलोकन करें।",
    cockpit_site_eyebrow: "🌐 वेबसाइट उपलब्धता एवं रखरखाव नियंत्रण",
    cockpit_site_lbl: "सार्वजनिक पोर्टल स्थिति:",
    cockpit_badge_online: "ऑनलाइन (सक्रिय)",
    cockpit_badge_offline: "ऑफ़लाइन (रखरखाव मोड)",
    cockpit_sub_online: "सभी सार्वजनिक मूल्यांकन, आवेदन प्रविष्टि और आवेदक लॉगिन मार्ग सक्रिय हैं।",
    btn_customize_offline: "ऑफ़लाइन पृष्ठ संपादित करें",
    off_intake_title: "आवेदक अंडरराइटिंग मूल्यांकन इनपुट",
    off_intake_sub: "त्वरित स्कोरिंग के लिए आवेदक के मापदंड जांचें और समायोजित करें",
    off_lbl_name: "पूरा नाम / संदर्भ",
    off_lbl_gender: "लिंग",
    off_lbl_married: "वैवाहिक स्थिति",
    off_lbl_dependents: "आश्रित",
    off_lbl_edu: "शिक्षा",
    off_lbl_self_emp: "स्वरोजगार / व्यवसाय",
    off_lbl_app_inc: "आवेदक मासिक आय (₹)",
    off_lbl_coapp_inc: "सह-आवेदक मासिक आय (₹)",
    off_lbl_loan_amt: "ऋण राशि (₹)",
    off_lbl_tenure: "अवधि (माह)",
    off_lbl_credit_hist: "क्रेडिट ब्यूरो इतिहास",
    off_lbl_area: "संपत्ति क्षेत्र",
    off_met_ml: "एआई संभावना",
    off_met_dti: "DTI ऋण भार",
    off_met_emi: "अनुमानित EMI",
    off_met_lti: "ऋण-आय अनुपात",
    off_shap_title: "SHAP / कारक योगदान वाटरफॉल विश्लेषण",
    off_shap_sub: "इस विशिष्ट निर्णय में प्रत्येक कारक का सीमांत लॉग-ऑड्स योगदान",
    off_shap_leg_pos: "● स्वीकृति (+%)",
    off_shap_leg_neg: "● जोखिम (-%)",
    off_action_title: "अधिकारी कार्रवाई एवं नियामक ऑडिट",
    off_action_sub: "ऋण स्वीकृत करें, मिशन भारत सब्सिडी पास लागू करें, या अस्वीकृति दर्ज करें",
    ph_officer_remarks: "आधिकारिक अंडरराइटिंग टिप्पणी दर्ज करें (जैसे: सिबिल सत्यापित, DTI अनुपात मानक के अनुरूप)...",
    btn_sanction_approve: "✓ ऋण स्वीकृत करें",
    btn_sanction_subvention: "⚡ मिशन भारत ग्रामीण सब्सिडी पास",
    btn_sanction_decline: "✕ प्रतिकूल कार्रवाई (अस्वीकार)",
    btn_save_officer_terms: "💾 वॉल्ट में पैरामीटर बदलाव सहेजें",
    btn_officer_preview_letter: "📄 स्वीकृति सूचना देखें / जारी करें",
    off_audit_title: "अंडरराइटर निर्णय एवं अनुपालन ऑडिट लॉग",
    off_audit_sub: "आंतरिक RBI अनुपालन निरीक्षण के लिए पूर्ण कालानुक्रमिक रिकॉर्ड",
    off_th_time: "दिनांक व समय",
    off_th_by: "समीक्षाकर्ता",
    off_th_appid: "आवेदन संख्या",
    off_th_act: "दर्ज कार्रवाई",
    off_th_note: "नियामक स्पष्टीकरण / टिप्पणी",
    mod_met_acc: "समग्र मॉडल सटीकता",
    mod_met_prec: "परिशुद्धता (Precision)",
    mod_met_rec: "संवेदनशीलता (Recall)",
    mod_met_auc: "ROC-AUC सूचकांक",
    mod_cm_title: "कन्फ्यूज़न मैट्रिक्स (होल्डआउट सत्यापन)",
    mod_cm_sub: "ऋण पोर्टफोलियो के परीक्षण विभाजन पर वास्तविक मूल्यांकन परिणाम",
    mod_cm_badge: "मूल्यांकित",
    cm_pred_y: "अनुमानित स्वीकृत (Y)",
    cm_pred_n: "अनुमानित अस्वीकृत (N)",
    cm_act_y: "वास्तविक स्वीकृत",
    cm_act_n: "वास्तविक अस्वीकृत",
    cm_tp_lbl: "सही स्वीकृत (TP)",
    cm_tp_sub: "सटीक रूप से स्वीकृत",
    cm_fn_lbl: "छूटे पात्र मामले (FN)",
    cm_fn_sub: "पात्र आवेदक वंचित",
    cm_fp_lbl: "जोखिमयुक्त स्वीकृति (FP)",
    cm_fp_sub: "गलत सकारात्मक स्वीकृति",
    cm_tn_lbl: "सही अस्वीकृत (TN)",
    cm_tn_sub: "जोखिम की सटीक पहचान",
    cm_takeaway: "<strong>अंडरराइटर निष्कर्ष:</strong> उच्च रिकॉल संवेदनशीलता के साथ यह मॉडल सुनिश्चित करता है कि कोई भी पात्र एवं विश्वसनीय आवेदक औपचारिक ऋण से वंचित न रहे।",
    mod_feat_title: "वैश्विक कारक महत्व एवं प्रभाव दिशा",
    mod_feat_sub: "समग्र भारत ऋण पोर्टफोलियो में प्रत्येक विशेषता का मानकीकृत भार",
    mod_gov_title: "मॉडल वास्तुकला एवं नियामक शासन सारांश",
    mod_gov_sub: "RBI एवं निष्पक्ष ऋण ऑडिट प्राधिकरणों हेतु अनुपालन प्रलेखन",
    gov_algo_t: "एल्गोरिदम:",
    gov_algo_d: "स्पष्ट भार मानकीकरण के साथ कैलिब्रेटेड L2-नियमित लॉजिस्टिक रिग्रेशन। यह अपारदर्शी ब्लैक-बॉक्स मॉडल के विपरीत पूर्ण गणितीय पारदर्शिता देता है।",
    gov_xai_t: "व्याख्यात्मक प्रणाली:",
    gov_xai_d: "रैखिक योगात्मक SHAP-समरूप विश्लेषण जो कच्चे लॉग-ऑड्स को आवेदकों व अधिकारियों के लिए सरल प्रतिशत कारकों में विभाजित करता है।",
    gov_fair_t: "निष्पक्ष ऋण सुरक्षा मानक:",
    gov_fair_d: "ग्रामीण एवं लैंगिक वर्गों में अनिवार्य 80% असमान प्रभाव अनुपात (DIR) परीक्षण, जनसांख्यिकीय समता तथा समान अवसर TPR मिलान।",
    fair_hero_eyebrow: "मिशन भारत सामाजिक समता पहल",
    fair_hero_title: "सकारात्मक वित्तीय समावेशन अंशांकन",
    fair_hero_desc: "पारंपरिक बैंकिंग मॉडल औपचारिक क्रेडिट इतिहास की कमी के कारण ग्रामीण और नए आवेदकों को दंडित करते हैं। क्षेत्रीय असमानताओं को संतुलित करने के लिए मिशन भारत कैलिब्रेशन चालू करें।",
    fair_toggle_lbl: "मिशन भारत समावेशन कैलिब्रेशन सक्षम करें:",
    fair_tbl_title: "जनसांख्यिकीय समता एवं असमान प्रभाव (DIR) ऑडिट तालिका",
    fair_tbl_sub: "80% (फोर-फिफ्थ्स) निष्पक्ष ऋण नियम और TPR समता के अनुपालन का मूल्यांकन",
    fair_th_cat: "संरक्षित श्रेणी",
    fair_th_grp: "जनसांख्यिकीय समूह",
    fair_th_n: "नमूना आकार (N)",
    fair_th_rate: "स्वीकृति दर",
    fair_th_tpr: "समान अवसर TPR",
    fair_th_dir: "असमान प्रभाव अनुपात (DIR)",
    fair_th_status: "नियामक स्थिति",
    fair_c1_t: "असमान प्रभाव अनुपात (DIR):",
    fair_c1_d: "आरक्षित समूह की स्वीकृति दर को प्रमुख बेंचमार्क समूह की दर से विभाजित करने पर प्राप्त अनुपात। <strong>&ge; 0.80</strong> का अनुपात 80% निष्पक्षता मानक का पूर्ण पालन करता है।",
    fair_c2_t: "समान अवसर (TPR समता):",
    fair_c2_d: "सही सकारात्मक दर (TPR) की समानता सुनिश्चित करती है कि ग्रामीण क्षेत्रों के पात्र आवेदकों को शहरी आवेदकों के समान स्वीकृति का अवसर मिले।",
    fair_c3_t: "मिशन भारत प्रभाव:",
    fair_c3_d: "समावेशन कैलिब्रेशन चालू करने से ग्रामीण स्वीकृति दर <strong>71.5% से बढ़कर 84.1%</strong> और DIR 0.83 से 0.97 हो जाता है, जिससे क्षेत्रीय भेदभाव समाप्त होता है।",
    port_title: "ऐतिहासिक ऋण आवेदन (भारत ऋण पूल)",
    port_sub: "ऐतिहासिक आवेदक फाइलों को खोजें, फ़िल्टर करें और जांचें",
    ph_portfolio_search: "लोन आईडी या क्षेत्र द्वारा खोजें (जैसे LP001003, Rural)...",
    flt_all: "सभी",
    flt_approved: "स्वीकृत",
    flt_rejected: "अस्वीकृत",
    flt_rural: "ग्रामीण",
    flt_women: "महिला",
    port_th_id: "लोन आईडी",
    port_th_gender: "लिंग",
    port_th_area: "संपत्ति क्षेत्र",
    port_th_income: "पारिवारिक आय",
    port_th_req: "मांगी गई राशि",
    port_th_hist: "क्रेडिट इतिहास",
    port_th_prob: "एआई संभावना",
    port_th_status: "अनुमानित स्थिति",
    port_th_act: "कार्रवाई",
    btn_prev_page: "← पिछला",
    btn_next_page: "अगला →",
    db_title: "आधिकारिक मेरिडियन आवेदन वॉल्ट एवं रजिस्ट्री",
    db_sub: "पोर्टल के माध्यम से जमा किए गए सभी ऋण आवेदन यहां स्थायी रूप से सुरक्षित हैं",
    db_title_applicant: "मेरे जमा किए गए ऋण आवेदनों का वॉल्ट",
    db_sub_applicant: "आपके द्वारा जमा किए गए प्रत्येक ऋण आवेदन का स्थायी रिकॉर्ड विभिन्न सत्रों और उपकरणों पर यहां सुरक्षित रहता है",
    db_count_loading: "वॉल्ट लोड हो रहा है...",
    db_empty_applicant: "इस खाते से अभी तक कोई आवेदन जमा नहीं हुआ है। अपना पहला आवेदन बनाने के लिए '1. ऋण के लिए आवेदन करें' का उपयोग करें।",
    db_empty_officer: "संस्थागत वॉल्ट में अभी तक कोई ऋण आवेदन दर्ज नहीं है।",
    btn_download_db_backup: "वॉल्ट बैकअप (.db) डाउनलोड करें",
    btn_export_csv: "Excel / CSV में निर्यात करें",
    btn_export_json: "JSON निर्यात करें",
    btn_refresh: "ताज़ा करें",
    db_th_appno: "आवेदन संख्या",
    db_th_date: "जमा दिनांक",
    db_th_name: "आवेदक का नाम",
    db_th_cibil: "सिबिल स्कोर",
    db_th_slip: "वेतन पर्ची",
    db_th_income: "कुल आय",
    db_th_req: "वांछित ऋण",
    db_th_area: "क्षेत्र",
    db_th_score: "AI स्कोर",
    db_th_status: "स्थिति",
    db_th_actions: "कार्रवाई",
    db_excel_tip: '<strong>लैपटॉप पर उपयोग:</strong> सभी आवेदन तुरंत Microsoft Excel या Google Sheets में खोलने के लिए ऊपर <strong>"Excel / CSV में निर्यात करें"</strong> पर क्लिक करें।',
    db_sync_note: "स्थायी केंद्रीय डेटाबेस के साथ स्वतः सिंक",
    footer_mission_badge: "हमारा संकल्प",
    footer_mission_statement: "प्रत्येक ऋण निर्णय को समझने में सरल एवं पारदर्शी बनाना।",
    footer_mission_supporting: "निर्णय का स्पष्ट कारण बताएं। सुधार के अवसर पहचानें। निष्पक्षता का जिम्मेदारी से मूल्यांकन करें।",
    footer_division: "मिशन भारत • खुदरा ऋण प्रभाग • 2026",
    footer_disclaimer: "© 2026 मेरिडियन फेयरलेंड। भारतीय रिज़र्व बैंक (RBI) डिजिटल लेंडिंग दिशा-निर्देशों के पूर्णतः अनुपालन में संचालित।",
    let_bank_name: "मेरिडियन फेयरलेंड एआई (MERIDIAN FAIRLEND AI)",
    let_division: "मिशन भारत • समावेशी खुदरा ऋण प्रभाग",
    let_office: "पंजीकृत कार्यालय: नरीमन पॉइंट, मुंबई 400021 • RBI पंजीकरण #N-13.01928",
    let_ref_lbl: "संदर्भ संख्या:",
    let_date_lbl: "दिनांक:",
    let_app_name_lbl: "आवेदक का नाम:",
    let_fac_lbl: "वांछित ऋण राशि:",
    let_tenure_lbl: "ऋण अवधि:",
    let_area_lbl: "निवास / संपत्ति क्षेत्र:",
    kfs_title: "आधिकारिक भारतीय रिज़र्व बैंक मुख्य तथ्य विवरण (KFS)",
    kfs_compliant: "RBI डिजिटल लेंडिंग अनुपालित",
    kfs_row_principal: "स्वीकृत ऋण सुविधा राशि (मूलधन)",
    kfs_row_apr: "सर्व-समावेशी वार्षिक प्रतिशत ब्याज दर (APR)",
    kfs_row_tenure: "ऋण अवधि / पुनर्भुगतान किस्तें",
    kfs_row_emi: "समान मासिक किस्त (EMI)",
    kfs_row_interest: "कुल देय ब्याज राशि",
    kfs_row_total: "कुल पुनर्भुगतान राशि (मूलधन + ब्याज)",
    kfs_row_proc: "प्रोसेसिंग एवं सत्यापन शुल्क",
    kfs_val_proc: "₹0 (शून्य - मिशन भारत सब्सिडी)",
    kfs_row_prepay: "पूर्व-भुगतान / फोरक्लोज़र शुल्क",
    kfs_val_prepay: "₹0 (RBI मास्टर परिपत्र के अनुसार शून्य)",
    kfs_row_cooling: "वैधानिक कूलिंग-ऑफ / समीक्षा अवधि",
    kfs_val_cooling: "3 कार्य दिवस (बिना किसी जुर्माने के पूर्ण निकास)",
    let_factors_heading: "पारदर्शी कारक निर्धारण (RBI निष्पक्ष ऋण संहिता के अंतर्गत):",
    let_ombudsman_html: '<strong>RBI फेयर प्रैक्टिसेज कोड एवं वैधानिक शिकायत निवारण प्रणाली:</strong><br>• <strong>प्रधान शिकायत निवारण अधिकारी:</strong> श्रीमती शालिनी वर्मा, नोडल शिकायत अधिकारी, मेरिडियन फेयरलेंड एआई, नरीमन पॉइंट, मुंबई 400021। टोल-फ्री: <code>1800-209-4000</code> | ईमेल: <code>grievance.bharat@meridian.fin</code> (समाधान समय-सीमा: 15 कार्य दिवसों के भीतर)।<br>• <strong>RBI एकीकृत लोकपाल योजना:</strong> यदि आपकी शिकायत का समाधान 30 दिनों में नहीं होता है, तो आपको भारतीय रिज़र्व बैंक एकीकृत लोकपाल योजना, 2021 के अंतर्गत <strong><a href="https://cms.rbi.org.in" target="_blank" style="color: #064E3B; font-weight: 700; text-decoration: underline;">https://cms.rbi.org.in</a></strong> पर ऑनलाइन शिकायत दर्ज करने अथवा टोल-फ्री <code>14448</code> पर कॉल करने का वैधानिक अधिकार है।',
    btn_print_pdf: "प्रिंट / पीडीएफ सहेजें",
    btn_close: "बंद करें",
    modal_api_title: "FastAPI बैकएंड कनेक्शन हब",
    modal_api_origin: "सक्रिय REST API सर्वर पता",
    modal_api_status_lbl: "स्थिति:",
    modal_api_docs_note: 'सभी प्रमाणीकरण, अंडरराइटिंग स्कोरिंग, SHAP व्याख्या और निष्पक्षता जांच सीधे FastAPI सर्वर से जुड़े हैं (<a id="modal-swagger-link" href="/docs" target="_blank" style="color: #064E3B; font-weight: 700; text-decoration: underline;">OpenAPI /docs</a>)।',
    modal_api_custom_t: "कस्टम इंटरनेट बैकएंड URL जोड़ें (वैकल्पिक):",
    modal_api_custom_d: "यदि आप अलग फ्रंटएंड होस्ट उपयोग कर रहे हैं, तो अपना तैनात बैकएंड URL दर्ज करें:",
    ph_custom_api: "https://your-service.up.railway.app",
    btn_save_url: "URL सहेजें",
    btn_auto_detect: "स्वतः पहचानें",
    btn_test_reconnect: "परीक्षण करें एवं पुनः जुड़ें",
    modal_site_title: "वेबसाइट ऑनलाइन / ऑफ़लाइन नियंत्रण",
    modal_site_curr_lbl: "वर्तमान सार्वजनिक उपलब्धता",
    badge_online: "ऑनलाइन",
    badge_offline: "ऑफ़लाइन",
    modal_site_live_desc: "वेबसाइट लाइव है और सभी आवेदकों व आगंतुकों के लिए उपलब्ध है।",
    modal_site_heading_lbl: "ऑफ़लाइन स्क्रीन शीर्षक",
    ph_site_heading: "पोर्टल अस्थायी रूप से ऑफ़लाइन है",
    modal_site_msg_lbl: "आगंतुकों के लिए रखरखाव संदेश",
    ph_site_msg: "वेबसाइट ऑफ़लाइन रहने पर आगंतुकों को दिखने वाला संदेश दर्ज करें...",
    modal_site_how: "<strong>ऑफ़लाइन मोड कैसे काम करता है:</strong> वेबसाइट को ऑफ़लाइन करने पर सामान्य आगंतुकों और आवेदकों को एक ब्रांडेड <em>रखरखाव पृष्ठ</em> दिखाई देता है और सार्वजनिक मार्ग HTTP <code>503</code> लौटाते हैं। ऋण अधिकारी किसी भी समय लॉग इन करके ऑनलाइन सेवा बहाल कर सकते हैं।",
    btn_go_online: "ऑनलाइन करें (लाइव)",
    otp_box_title: "ईमेल OTP सत्यापन",
    otp_app_title: "आवेदन ईमेल OTP जांच",
    otp_badge_pending: "असत्यापित",
    otp_badge_verified: "✓ सत्यापित",
    btn_send_otp: "OTP भेजें",
    btn_resend_otp: "पुनः OTP भेजें",
    btn_verify_otp: "OTP सत्यापित करें",
    ph_otp_code: "6-अंकीय OTP",
    otp_hint_signup: "इनबॉक्स में 6-अंकीय सत्यापन कोड प्राप्त करने के लिए 'OTP भेजें' पर क्लिक करें।",
    otp_hint_apply: "ऋण आवेदन जमा करने से पहले 6-अंकीय OTP से अपना ईमेल सत्यापित करें।",
    otp_hint_forgot: "रिकवरी कोड प्राप्त करने के लिए अपना पंजीकृत ईमेल दर्ज करें और 'OTP भेजें' दबाएं।",
    otp_hint_unconfigured: "लाइव ईमेल OTP अभी सक्रिय नहीं है: इनबॉक्स कोड भेजने के लिए Railway Variables में BREVO_API_KEY + EMAIL_FROM (मुफ़्त HTTPS API) जोड़ें।",
    lbl_fill_email: "सत्यापन हेतु आवेदक ईमेल *",
    ph_fill_email: "OTP सत्यापन के लिए अपना ईमेल दर्ज करें",
    fp_modal_title: "ईमेल OTP द्वारा पासवर्ड रीसेट करें",
    fp_lbl_email: "पंजीकृत ईमेल पता",
    ph_fp_email: "name@domain.com",
    fp_lbl_otp: "6-अंकीय ईमेल OTP",
    fp_lbl_new_pwd: "नया पासवर्ड (न्यूनतम 8 अक्षर, अक्षर + अंक)",
    fp_lbl_confirm_pwd: "नए पासवर्ड की पुष्टि करें",
    fp_btn_submit: "OTP जांचें व पासवर्ड बदलें"
  }
};

function syncBackendModalUI() {
  const urlEl = document.getElementById('modal-backend-url');
  const docsLink = document.getElementById('modal-swagger-link');
  const customInput = document.getElementById('custom-api-base-input');
  if (urlEl) urlEl.innerText = state.apiBase;
  if (docsLink) docsLink.href = `${state.apiBase}/docs`;
  if (customInput) customInput.value = state.apiBase;
}

function updateBackendStatusUI() {
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  const badge = document.getElementById('backend-status-badge');
  const badgeText = document.getElementById('backend-status-text');
  const pulseDot = document.getElementById('backend-pulse-dot');
  const modalBadge = document.getElementById('modal-backend-status-badge');
  const modalDesc = document.getElementById('modal-backend-status-desc');

  if (!isOfficer) {
    if (badge) {
      badge.style.cursor = 'default';
      badge.setAttribute('data-i18n-title', 'title_encrypted_session');
      badge.setAttribute('title', dict.title_encrypted_session);
    }
    if (pulseDot) pulseDot.style.background = state.backendConnected ? '#10B981' : '#F59E0B';
    if (badgeText) badgeText.innerText = dict.badge_encrypted_session;
    return;
  }

  if (badge) {
    badge.style.cursor = 'pointer';
    badge.setAttribute('data-i18n-title', 'title_backend_badge');
    badge.setAttribute('title', dict.title_backend_badge);
  }
  syncBackendModalUI();

  if (state.backendConnected) {
    const healthData = state.backendHealthMeta || {};
    const hostLabel = (() => {
      try { return new URL(state.apiBase).host; } catch (e) { return state.apiBase; }
    })();
    if (pulseDot) pulseDot.style.background = '#10B981';
    if (badgeText) {
      badgeText.innerText = hi ? `FastAPI सर्वर सक्रिय (${hostLabel})` : `FastAPI REST Active (${hostLabel})`;
    }
    if (modalBadge) {
      modalBadge.className = 'badge badge-success';
      modalBadge.innerText = hi ? 'ऑनलाइन एवं कनेक्टेड' : 'ONLINE & CONNECTED';
    }
    if (modalDesc) {
      modalDesc.innerText = hi
        ? `${healthData.service || 'मेरिडियन फेयरलेंड'} FastAPI (${state.apiBase}) से ${healthData.database || 'डुअल-सिंक'} डेटाबेस के साथ लाइव जुड़ा है।`
        : `Connected live to ${healthData.service || 'Meridian FairLend'} FastAPI (${state.apiBase}) with ${healthData.database || 'dual-sync'} persistence.`;
    }
  } else {
    if (pulseDot) pulseDot.style.background = '#F59E0B';
    if (badgeText) {
      badgeText.innerText = hi ? 'स्टैंडअलोन मोड (ब्राउज़र गणना)' : 'Standalone Mode (In-Browser Calculation)';
    }
    if (modalBadge) {
      modalBadge.className = 'badge badge-warning';
      modalBadge.innerText = hi ? 'ब्राउज़र-आधारित ऑफ़लाइन मोड' : 'STANDALONE IN-BROWSER MODE';
    }
    if (modalDesc) {
      modalDesc.innerText = hi
        ? `${state.apiBase} पर FastAPI बैकएंड से संपर्क नहीं हो सका। स्थानीय गणना मोड में सुचारू रूप से संचालित।`
        : `Unable to reach FastAPI backend at ${state.apiBase}. Running cleanly via local calculation fallback.`;
    }
  }
}

window.handleStatusBadgeClick = function() {
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  if (!isOfficer) return;
  window.toggleBackendInfoModal();
};

window.toggleBackendInfoModal = function() {
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  if (!isOfficer) return;
  const modal = document.getElementById('backend-info-modal');
  if (!modal) return;
  const isHidden = modal.style.display === 'none' || !modal.style.display;
  syncBackendModalUI();
  updateBackendStatusUI();
  modal.style.display = isHidden ? 'flex' : 'none';
};

window.saveCustomApiBase = function() {
  const hi = state.currentLang === 'hi';
  const input = document.getElementById('custom-api-base-input');
  if (!input) return;
  const raw = input.value.trim().replace(/\/+$/, '');
  if (!raw || (!raw.startsWith('http://') && !raw.startsWith('https://'))) {
    alert(hi ? 'कृपया http:// या https:// से शुरू होने वाला वैध URL दर्ज करें।' : 'Please enter a valid URL starting with http:// or https://');
    return;
  }
  try {
    localStorage.setItem('meridian_api_base', raw);
  } catch (e) {}
  state.apiBase = raw;
  syncBackendModalUI();
  checkBackendConnection(true);
};

window.resetCustomApiBase = function() {
  try {
    localStorage.removeItem('meridian_api_base');
  } catch (e) {}
  const input = document.getElementById('custom-api-base-input');
  if (input) input.value = '';
  state.apiBase = resolveApiBase();
  syncBackendModalUI();
  checkBackendConnection(true);
};

async function checkBackendConnection(showNotification = false) {
  syncBackendModalUI();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`${state.apiBase}/api/health`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      let healthData = {};
      try { healthData = await response.json(); } catch (e) {}
      state.backendConnected = true;
      state.backendHealthMeta = healthData;
      updateBackendStatusUI();
      if (showNotification) {
        window.showMeridianToast(
          state.currentLang === 'hi'
            ? '✅ FastAPI बैकएंड से सफलतापूर्वक जुड़ गया।'
            : '✅ Connected live to FastAPI backend.'
        );
      }
      if (currentAuthUser) {
        await syncPendingOfflineApplications();
        await window.refreshDatabaseTable();
        if (currentAuthUser.role === 'officer') {
          if (state.currentTab === 'model-view') renderModelPerformanceCharts();
          if (state.currentTab === 'fairness-view') renderFairnessCharts();
          if (state.currentTab === 'officer-view') await fetchAuditLogs();
        }
      }
      return true;
    }
  } catch (err) {}

  state.backendConnected = false;
  state.backendHealthMeta = null;
  updateBackendStatusUI();
  if (showNotification) {
    window.showMeridianToast(
      state.currentLang === 'hi'
        ? '⚠️ बैकएंड सर्वर उपलब्ध नहीं है। स्थानीय मोड सक्रिय।'
        : '⚠️ Backend server unreachable. Standalone mode active.',
      true
    );
  }
  return false;
}

window.toggleLanguage = function() {
  state.currentLang = state.currentLang === 'en' ? 'hi' : 'en';
  try {
    localStorage.setItem('meridian_lang', state.currentLang);
  } catch (e) {}

  applyTranslations();
  syncSiteAvailabilityUI();
  updateBackendStatusUI();
  syncFormHelperDisplays();
  updateUI();
  syncSimulatorSliderLabels();
  updateSimulationUI();

  const isOfficer = currentAuthUser?.role === 'officer';
  if (isOfficer) {
    renderAuditTable();
    renderPortfolioTable();
    renderModelPerformanceCharts();
    renderFairnessCharts();
  }
  if (currentAuthUser) {
    renderDatabaseTableRows(state.savedDatabaseApps || []);
  }

  const letterModal = document.getElementById('letter-modal');
  if (letterModal && letterModal.style.display === 'flex') {
    window.openDecisionLetterModal(isOfficer);
  }
};

function applyTranslations() {
  const lang = state.currentLang;
  const dict = getLangDict();

  document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  if (dict.page_title) document.title = dict.page_title;

  ['lang-toggle-btn', 'lang-toggle-btn-maint', 'lang-toggle-btn-auth', 'lang-toggle-btn-letter'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.innerText = dict.lang_btn;
  });

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key && dict[key] !== undefined) {
      el.innerText = dict[key];
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (key && dict[key] !== undefined) {
      el.innerHTML = dict[key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && dict[key] !== undefined) {
      el.setAttribute('placeholder', dict[key]);
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key && dict[key] !== undefined) {
      el.setAttribute('title', dict[key]);
    }
  });

  const setHtml = (selector, text) => {
    const el = document.querySelector(selector);
    if (el && text !== undefined) el.innerHTML = text;
  };
  setHtml('[data-tab="apply-view"]', dict.nav_apply);
  setHtml('[data-tab="applicant-view"]', dict.nav_report);
  setHtml('[data-tab="portfolio-view"]', dict.nav_portfolio);
  setHtml('[data-tab="officer-view"]', dict.nav_officer);
  setHtml('[data-tab="model-view"]', dict.nav_accuracy);
  setHtml('[data-tab="fairness-view"]', dict.nav_fairness);
  updateAuthRoleUI();
  syncPortalGatewayVisuals(activePortal);

  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el && text !== undefined) el.innerText = text;
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

  const submitBtn = document.getElementById('btn-submit-app');
  if (submitBtn && !submitBtn.disabled) {
    submitBtn.innerHTML = `<span>🚀</span> ${dict.btn_submit_app}`;
  }

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
  setElText('prompt-apply-text', dict.prompt_apply_letter);
  setElText('btn-apply-loan-link', dict.btn_apply_loan_link);

  setElText('footer-mission-badge', dict.footer_mission_badge);
  setElText('footer-mission-statement', dict.footer_mission_statement);
  setElText('footer-mission-supporting', dict.footer_mission_supporting);
  setElText('footer-disclaimer', dict.footer_disclaimer);

  syncFormHelperDisplays();
  syncBackendModalUI();
  syncOtpUIStates();
}

function syncFormHelperDisplays() {
  const loanVal = document.getElementById('fill-loan-amount')?.value || 150000;
  window.updateFillLoanHint(loanVal);
  const years = parseInt(document.getElementById('fill-loan-years')?.value || 5, 10);
  window.updateFillTenureDisplay(years);
  const cibil = parseInt(document.getElementById('fill-cibil-slider')?.value || 760, 10);
  window.updateCibilDisplay(cibil);
  const slipVal = document.getElementById('fill-salary-slip')?.value || 'Yes';
  window.setSalarySlipChoice(slipVal);
  syncSimSalarySlipVisuals(state.simulated.salary_slip);
}

function formatInrFlexible(rawAmt, hi = state.currentLang === 'hi') {
  const amt = Math.max(0, Math.round(Number(rawAmt) || 0));
  const formatted = `₹${amt.toLocaleString('en-IN')}`;
  if (amt >= 10000000) {
    const cr = (amt / 10000000).toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} (₹${cr} ${hi ? 'करोड़' : 'Cr'})`;
  }
  if (amt >= 100000) {
    const lk = (amt / 100000).toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} (₹${lk} ${hi ? 'लाख' : 'Lakh'})`;
  }
  return formatted;
}

window.updateFillLoanHint = function(val) {
  const hintEl = document.getElementById('fill-loan-hint');
  if (!hintEl) return;
  const hi = state.currentLang === 'hi';
  const num = Number(val);
  if (!val || isNaN(num) || num <= 0) {
    hintEl.innerText = hi
      ? 'कोई भी लचीली ऋण राशि (न्यूनतम ₹1,000) दर्ज करें'
      : 'Enter any flexible loan amount in Rupees (min ₹1,000)';
    return;
  }
  hintEl.innerText = formatInrFlexible(num, hi);
};

function syncSimLoanInputs(val) {
  const num = Math.max(1000, Math.round(Number(val) || 150000));
  const slider = document.getElementById('sim-slider-loan');
  if (slider) {
    slider.max = num > 5000000 ? String(Math.ceil(num / 100000) * 100000) : '5000000';
    slider.value = Math.max(Number(slider.min || 5000), num);
  }
  setValue('sim-input-loan', num);
}

function syncSimSalarySlipVisuals(hasSlip) {
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
}

function syncSimulatorSliderLabels() {
  const hi = state.currentLang === 'hi';
  const sim = state.simulated;
  const loanEl = document.getElementById('val-sim-loan');
  const coappEl = document.getElementById('val-sim-coapp');
  const termEl = document.getElementById('val-sim-term');
  const cibilEl = document.getElementById('val-sim-cibil');

  if (loanEl) {
    const amt = sim.loan_amount || 150000;
    loanEl.innerText = formatInrFlexible(amt, hi);
  }
  if (coappEl) {
    coappEl.innerText = hi
      ? `₹${Number(sim.coapplicant_income || 0).toLocaleString('en-IN')}/माह`
      : `₹${Number(sim.coapplicant_income || 0).toLocaleString('en-IN')}/mo`;
  }
  if (termEl) {
    const months = sim.term || 60;
    const years = Math.max(1, Math.round(months / 12));
    termEl.innerText = hi
      ? `${years} वर्ष (${months} माह)`
      : `${years} Year${years > 1 ? 's' : ''} (${months} Months)`;
  }
  if (cibilEl) {
    const score = sim.cibil_score || 760;
    const tier = score >= 750
      ? (hi ? 'उत्कृष्ट' : 'Prime')
      : score >= 650
        ? (hi ? 'योग्य' : 'Qualifying')
        : (hi ? 'निम्न' : 'Subprime');
    cibilEl.innerText = `${score} (${tier})`;
  }
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
  syncSimSalarySlipVisuals(hasSlip);
  updateSimulationUI();
};

function computePrediction(appData) {
  const appInc = parseFloat(appData.applicant_income || 0);
  const coappInc = parseFloat(appData.coapplicant_income || 0);
  const totInc = Math.max(1.0, appInc + coappInc);

  let loanAmtInr = parseFloat(appData.loan_amount !== undefined && appData.loan_amount !== null && appData.loan_amount !== '' ? appData.loan_amount : 150000);
  if (isNaN(loanAmtInr) || loanAmtInr <= 0) {
    loanAmtInr = 150000.0;
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
  if (isFreelance || empType.includes('salaried')) {
    empImpact = 3.0;
  }
  scorePoints += empImpact;
  contributions['employment_type'] = { impact: empImpact, pct_impact: empImpact };

  const area = String(appData.property_area || 'Rural').toLowerCase();
  let areaImpact = 2.0;
  if (area === 'semiurban') areaImpact = 4.0;
  else if (area === 'rural') areaImpact = 3.0;

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
  const hi = lang === 'hi';
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
      title: hi ? 'उच्च सिबिल क्रेडिट प्रतिष्ठा (प्राइम)' : 'High Credit Trust (Prime CIBIL)',
      desc: hi ? `आपका सिबिल स्कोर ${cibil} उत्कृष्ट क्रेडिट प्रतिष्ठा को प्रमाणित करता है।` : `Your CIBIL score of ${cibil} shows a stellar track record of paying past debts on time.`,
      impact: hi ? '+24% बढ़त' : '+24% Boost'
    });
  } else if (cibil >= 650) {
    strengths.push({
      title: hi ? 'मानक सिबिल क्रेडिट रिकॉर्ड' : 'Good Qualifying CIBIL Track',
      desc: hi ? `आपका सिबिल स्कोर ${cibil} बैंक मानकों के पूर्णतः अनुकूल है।` : `Your CIBIL score of ${cibil} comfortably meets retail lending credit criteria.`,
      impact: hi ? '+15% बढ़त' : '+15% Boost'
    });
  } else {
    frictions.push({
      title: hi ? 'कम सिबिल स्कोर (सबप्राइम)' : 'Subprime CIBIL Bureau Score',
      desc: hi ? `सिबिल स्कोर ${cibil} पूर्व विलंबित भुगतानों या सीमित क्रेडिट रिकॉर्ड को दर्शाता है।` : `A CIBIL score of ${cibil} indicates past overdue repayments or insufficient bureau history.`,
      impact: hi ? '-25% कटौती' : '-25% Discount'
    });
    actions.push(hi ? 'पुराने बकाये का निपटान करें: क्रेडिट ब्यूरो में पिछले बकाये का भुगतान कर एनओसी (NOC) प्राप्त करें।' : 'Clear outstanding overdue payments on prior credit facilities or obtain a No-Objection Certificate (NOC).');
  }

  if (dti <= 30.0) {
    strengths.push({
      title: hi ? 'संतुलित ऋण-आय अनुपात' : 'Comfortable Monthly Debt Burden',
      desc: hi ? `मासिक ईएमआई (₹${emi.toLocaleString('en-IN')}) कुल आय का केवल ${dti}% है, जो सुरक्षित सीमा में है।` : `Monthly EMI (₹${emi.toLocaleString('en-IN')}) takes only ${dti}% of household income, well within safe limits.`,
      impact: hi ? '+18% बढ़त' : '+18% Boost'
    });
  } else if (dti <= 45.0) {
    strengths.push({
      title: hi ? 'प्रबंधनीय ऋण दायित्व' : 'Manageable Obligation Ratio',
      desc: hi ? `मासिक ईएमआई आय का ${dti}% है, जो सामान्य ऋण मानकों के अनुरूप है।` : `Monthly EMI takes ${dti}% of income, which satisfies regular debt service criteria.`,
      impact: hi ? '+6% बढ़त' : '+6% Boost'
    });
  } else {
    frictions.push({
      title: hi ? 'अत्यधिक पुनर्भुगतान भार (उच्च DTI)' : 'Elevated Repayment Burden (High DTI)',
      desc: hi ? `मासिक ईएमआई ₹${emi.toLocaleString('en-IN')} आपकी आय का ${dti}% है, जो 45% की सुरक्षित सीमा से अधिक है।` : `Monthly EMI of ₹${emi.toLocaleString('en-IN')} consumes ${dti}% of your monthly income, exceeding the recommended 45% ceiling.`,
      impact: hi ? '-20% जोखिम' : '-20% Risk'
    });
    actions.push(hi ? 'ऋण अवधि बढ़ाएं: टेन्योर 1 से 30 वर्ष के बीच बढ़ाकर मासिक किस्त आय के 40% से कम करें।' : 'Extend loan tenure (e.g. increase years from 1 to 30) or reduce loan amount to lower monthly EMI below 40%.');
  }

  if (salarySlip === 'Yes') {
    strengths.push({
      title: hi ? 'सत्यापित आय (वेतन पर्ची संलग्न)' : 'Verified Income (Salary Slip)',
      desc: hi ? 'आधिकारिक वेतन पर्ची संलग्न है, जिससे नियमित और पुष्ट आय की पुष्टि होती है।' : 'Official salary slip submitted, confirming verifiable recurring compensation.',
      impact: hi ? '+5% बढ़त' : '+5% Boost'
    });
  } else {
    if (isFreelance) {
      strengths.push({
        title: hi ? 'मिशन भारत फ्रीलांसिंग समावेशन' : 'Mission Bharat Gig Inclusivity',
        desc: hi ? 'वेतन पर्ची के अभाव में फ्रीलांस/गिग आय का 6-माह के बैंक विवरण व डिजिटल कैश-फ्लो से मूल्यांकन।' : 'Freelance income assessed via 6-month digital banking cash flows & client invoices in lieu of pay slip.',
        impact: hi ? 'वैकल्पिक मूल्यांकन' : 'Alternative Assessment'
      });
      actions.push(hi ? '6 माह का बैंक विवरण या क्लाइंट इनवॉइस प्रस्तुत करें।' : 'Submit 6-month digital bank statement or client invoice records in lieu of salary slip.');
    } else {
      frictions.push({
        title: hi ? 'वेतन पर्ची अनुपलब्ध' : 'Absence of Formal Salary Slip',
        desc: hi ? 'वेतन पर्ची संलग्न नहीं है। अनौपचारिक आय के लिए 6-माह का बैंक विवरण आवश्यक है।' : 'No salary slip attached. Verification requires secondary bank statement submission.',
        impact: hi ? '-6% अवरोध' : '-6% Friction'
      });
      actions.push(hi ? 'औपचारिक बैंक खाता विवरण या नियोक्ता प्रमाण पत्र संलग्न करें।' : 'Provide 6-month formal bank account statement or employer certificate in lieu of pay slip.');
    }
  }

  if (isFreelance) {
    strengths.push({
      title: hi ? 'डिजिटल अर्थव्यवस्था योगदानकर्ता (फ्रीलांसिंग)' : 'Digital Gig Economy Contributor',
      desc: hi ? 'फ्रीलांसिंग / स्वतंत्र पेशेवर आय स्रोतों को मिशन भारत की समावेशी नीतियों का समर्थन प्राप्त है।' : 'Freelance / Independent contractor livelihood supported under Mission Bharat progressive inclusion guidelines.',
      impact: hi ? '+3% समावेशन' : '+3% Inclusion'
    });
  }

  const coapp = parseFloat(appData.coapplicant_income || 0);
  if (coapp > 0) {
    strengths.push({
      title: hi ? 'संयुक्त अर्जक सह-आवेदक' : 'Joint Earning Co-Applicant',
      desc: hi ? `कमाऊ सह-आवेदक (₹${Math.round(coapp).toLocaleString('en-IN')}/माह) से परिवार की चुकौती क्षमता मजबूत हुई।` : `Adding an earning co-applicant (₹${Math.round(coapp).toLocaleString('en-IN')}/month) enhances household cash flow security.`,
      impact: hi ? '+8% बढ़त' : '+8% Boost'
    });
  } else if (dti > 35.0) {
    frictions.push({
      title: hi ? 'एकल आय निर्भरता' : 'Single Income Dependency',
      desc: hi ? 'केवल एक आय स्रोत पर निर्भरता से आपातकालीन वित्तीय व्यवधान का जोखिम बढ़ता है।' : 'Relying on a single income stream increases risk during unexpected financial disruptions.',
      impact: hi ? '-8% जोखिम' : '-8% Risk'
    });
    actions.push(hi ? 'कमाऊ सह-आवेदक जोड़ें: परिवार के किसी आय वाले सदस्य को जोड़ने से ऋण स्वीकृति संभावना बढ़ेगी।' : 'Include an earning spouse or family member as a co-applicant to expand repayment capacity.');
  }

  return { strengths, frictions, actions };
}

window.handleLoanApplicationSubmit = async function(event) {
  if (event) event.preventDefault();
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();

  if (currentAuthUser?.role === 'officer') {
    window.showMeridianToast(
      hi
        ? 'ऋण आवेदन केवल आवेदक पोर्टल से ही जमा किए जा सकते हैं।'
        : 'Loan application submission is restricted to the Applicant Portal.',
      true
    );
    return;
  }

  const typedEmail = (document.getElementById('fill-email')?.value || '').trim().toLowerCase();
  const appOtpCfg = OTP_SCOPE_CONFIG.application;
  const appOtpState = otpState.application;
  const appOtpRaw = (document.getElementById(appOtpCfg.otpId)?.value || '').replace(/\s+/g, '');
  const appSameEmailVerified = appOtpState && appOtpState.verified && appOtpState.email === typedEmail && appOtpState.verificationToken;
  const otpToken = appSameEmailVerified ? appOtpState.verificationToken : null;
  const otpCode = (!otpToken && /^\d{6}$/.test(appOtpRaw) && typedEmail) ? appOtpRaw : null;

  if (state.otpStatus.require_otp_on_application) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail)) {
      window.showMeridianToast(
        hi ? 'कृपया OTP सत्यापन के लिए अपना वैध ईमेल पता दर्ज करें।' : 'Please enter a valid email address for Application OTP check.',
        true
      );
      document.getElementById('fill-email')?.focus();
      return;
    }
    if (!otpToken && !otpCode) {
      window.showMeridianToast(
        hi ? 'कृपया आवेदन जमा करने से पहले ईमेल OTP सत्यापन पूरा करें।' : 'Please complete the 6-digit Email OTP verification before submitting.',
        true
      );
      document.getElementById(appOtpCfg.otpId)?.focus();
      return;
    }
  }

  const submitBtn = document.getElementById('btn-submit-app');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>⏳</span> ${hi ? 'वॉल्ट में दर्ज हो रहा है...' : 'Recording in Vault...'}`;
  }

  const yearsVal = parseInt(document.getElementById('fill-loan-years')?.value || 5, 10);
  const termMonths = yearsVal * 12;

  const formData = {
    full_name: (document.getElementById('fill-full-name')?.value || '').trim(),
    phone: (document.getElementById('fill-phone')?.value || '').trim(),
    email: typedEmail || null,
    gender: document.getElementById('fill-gender')?.value || 'Female',
    marital_status: document.getElementById('fill-married')?.value || 'No',
    dependents: document.getElementById('fill-dependents')?.value || '0',
    education: document.getElementById('fill-education')?.value || 'Graduate',
    employment_type: document.getElementById('fill-employment')?.value || 'Freelancing / Gig Economy / Contractor',
    salary_slip: document.getElementById('fill-salary-slip')?.value || 'Yes',
    applicant_income: Number(document.getElementById('fill-app-income')?.value || 25000),
    coapplicant_income: Number(document.getElementById('fill-coapp-income')?.value || 0),
    loan_purpose: document.getElementById('fill-loan-purpose')?.value || 'Home Improvement / Construction',
    loan_amount: Number(document.getElementById('fill-loan-amount')?.value || 150000),
    loan_term_months: termMonths,
    cibil_score: Number(document.getElementById('fill-cibil-slider')?.value || 760),
    property_area: document.getElementById('fill-property-area')?.value || 'Rural',
    user_id: currentAuthUser ? currentAuthUser.id : null,
    applicant_id: currentAuthUser ? currentAuthUser.id : null,
    applicant_email: typedEmail || (currentAuthUser ? currentAuthUser.email : null),
    otp_verification_token: otpToken,
    otp_code: otpCode
  };

  let savedRecord = null;
  let prediction = null;
  let explanation = null;

  try {
    const response = await fetch(`${state.apiBase}/api/apply`, {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(formData)
    });

    if (response.status === 503) {
      await window.checkSiteAvailability();
      alert(hi ? 'पोर्टल निर्धारित रखरखाव के लिए अस्थायी रूप से ऑफ़लाइन है।' : 'Portal is temporarily offline for scheduled maintenance.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>🚀</span> ${dict.btn_submit_app}`;
      }
      return;
    }

    if (response.status === 401 || response.status === 403 || response.status === 400) {
      const errData = await response.json().catch(() => ({}));
      if (errData.code === 'EMAIL_OTP_REQUIRED' || errData.code === 'EMAIL_OTP_INVALID') {
        window.fetchOtpStatus();
        appOtpState.statusKind = 'error';
        appOtpState.rawError = errData.error || '';
        syncOtpUIStates();
      }
      window.showMeridianToast(errData.error || (hi ? 'आवेदन जमा करने में अवरोध आया।' : 'Unable to submit loan application.'), true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>🚀</span> ${dict.btn_submit_app}`;
      }
      return;
    }

    if (response.ok) {
      state.backendConnected = true;
      const resData = await response.json();
      savedRecord = resData.application;
      prediction = resData.prediction;
      explanation = resData.explanation;
      invalidateOtpScope('application', true);
    }
  } catch (err) {
    state.backendConnected = false;
  }

  if (!savedRecord) {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const appNo = `MB-OFFLINE-${randomId}`;

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
      ...formData,
      id: Date.now(),
      application_no: appNo,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      status: prediction.status.charAt(0).toUpperCase() + prediction.status.slice(1),
      approval_likelihood: prediction.approvalPercent,
      monthly_emi: prediction.ratios.emi,
      dti_percent: prediction.ratios.dtiPct,
      officer_status: 'Pending',
      officer_remarks: '',
      _offline_pending: true
    };

    const queue = readOfflineQueue();
    queue.unshift(savedRecord);
    writeOfflineQueue(queue);
    window.showMeridianToast(
      hi
        ? '⚠️ नेटवर्क अनुपलब्ध है: आवेदन आपकी स्थानीय कतार में सुरक्षित है और पुनः जुड़ते ही सर्वर में सिंक हो जाएगा।'
        : '⚠️ Offline fallback: application queued locally and will auto-sync to persistent vault once connected.',
      true
    );
  }

  const sucCard = document.getElementById('apply-success-card');
  const sucAppNo = document.getElementById('success-app-no');
  const sucStatus = document.getElementById('success-status-badge');
  const sucProb = document.getElementById('success-prob-text');
  const sucEmi = document.getElementById('success-emi-text');
  const sucCibil = document.getElementById('success-cibil-text');
  if (sucCard) {
    const statusRaw = String(savedRecord.status || 'Conditional');
    const emiVal = Math.round(savedRecord.monthly_emi || prediction?.ratios?.emi || 0);
    const pctVal = savedRecord.approval_likelihood || prediction?.approvalPercent || 50;
    const cibilNum = savedRecord.cibil_score || formData.cibil_score;
    const cibilTier = cibilNum >= 750 ? (hi ? 'उत्कृष्ट' : 'Excellent') : cibilNum >= 650 ? (hi ? 'अच्छा' : 'Good') : (hi ? 'निम्न' : 'Subprime');
    if (sucAppNo) sucAppNo.innerText = savedRecord.application_no;
    if (sucStatus) {
      sucStatus.innerText = localizeStatus(statusRaw, state.currentLang).toUpperCase();
      sucStatus.className = `badge badge-${statusRaw.toLowerCase() === 'approved' ? 'success' : statusRaw.toLowerCase() === 'conditional' ? 'warning' : 'danger'}`;
    }
    if (sucProb) sucProb.innerText = `${pctVal}%`;
    if (sucEmi) sucEmi.innerText = `₹${emiVal.toLocaleString('en-IN')}${hi ? '/माह' : '/mo'}`;
    if (sucCibil) sucCibil.innerText = `${cibilNum} (${cibilTier})`;
    sucCard.style.display = 'block';
  }

  state.lastSubmittedApp = { ...formData, ...savedRecord };
  applyRecordToCurrentState({ ...formData, ...savedRecord });
  state.backendPrediction = prediction;
  state.backendExplanation = explanation;
  updateUI();
  updateSimulationUI();
  await window.refreshDatabaseTable();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>🚀</span> ${dict.btn_submit_app}`;
  }

  window.activateWorkspaceTab('applicant-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const banner = document.getElementById('submission-alert-banner');
  const bannerAppNo = document.getElementById('banner-app-no');
  if (banner) {
    if (bannerAppNo) bannerAppNo.innerText = savedRecord.application_no;
    banner.style.display = 'block';
  }
};

window.applyWhatIfScenario = async function() {
  const hi = state.currentLang === 'hi';
  const sim = state.simulated;
  state.backendPrediction = null;
  state.backendExplanation = null;

  state.currentApplicant.loan_amount = sim.loan_amount;
  state.currentApplicant.coapplicant_income = sim.coapplicant_income;
  state.currentApplicant.term = sim.term;
  state.currentApplicant.cibil_score = sim.cibil_score;
  state.currentApplicant.credit_history = sim.cibil_score >= 650 ? 1 : 0;
  state.currentApplicant.salary_slip = sim.salary_slip ? 'Yes' : 'No';

  setValue('fill-loan-amount', sim.loan_amount);
  window.updateFillLoanHint(sim.loan_amount);
  setValue('fill-coapp-income', sim.coapplicant_income);
  const years = Math.max(1, Math.round(sim.term / 12));
  setValue('fill-loan-years', years);
  updateFillTenureDisplay(years);
  setValue('fill-cibil-slider', sim.cibil_score);
  updateCibilDisplay(sim.cibil_score);
  setSalarySlipChoice(sim.salary_slip ? 'Yes' : 'No');

  let persistedOnServer = false;
  const appNo = state.currentApplicant?.id;
  if (state.hasApplied && appNo) {
    const patchBody = {
      loan_amount: sim.loan_amount,
      coapplicant_income: sim.coapplicant_income,
      loan_term_months: sim.term,
      cibil_score: sim.cibil_score,
      salary_slip: sim.salary_slip ? 'Yes' : 'No'
    };
    try {
      const res = await fetch(`${state.apiBase}/api/application/${encodeURIComponent(appNo)}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patchBody)
      });
      if (res.status === 503) {
        await window.checkSiteAvailability();
        return;
      }
      if (res.ok) {
        state.backendConnected = true;
        const data = await res.json();
        if (data.application) {
          applyRecordToCurrentState(data.application);
        }
        state.backendPrediction = data.prediction || null;
        state.backendExplanation = data.explanation || null;
        persistedOnServer = true;
        await window.refreshDatabaseTable();
      }
    } catch (e) {}

    if (!persistedOnServer) {
      const queue = readOfflineQueue();
      const idx = queue.findIndex(q => q.application_no === appNo);
      if (idx >= 0) {
        const localPred = computePrediction(state.currentApplicant);
        queue[idx] = {
          ...queue[idx],
          ...patchBody,
          approval_likelihood: localPred.approvalPercent,
          monthly_emi: localPred.ratios.emi,
          dti_percent: localPred.ratios.dtiPct,
          status: localPred.status.charAt(0).toUpperCase() + localPred.status.slice(1)
        };
        writeOfflineQueue(queue);
        await window.refreshDatabaseTable();
      }
    }
  }

  updateUI();
  updateSimulationUI();

  const heroCard = document.getElementById('decision-hero-card');
  if (heroCard) {
    heroCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    heroCard.style.outline = '3px solid #D97706';
    setTimeout(() => { heroCard.style.outline = 'none'; }, 2000);
  }

  const msg = persistedOnServer
    ? (hi ? '✨ व्हाट-इफ परिदृश्य स्थायी रूप से वॉल्ट में सहेजा गया और रिपोर्ट अपडेट हो गई!' : '✨ What-If scenario saved permanently to Vault and Decision Report updated!')
    : (hi ? '✨ व्हाट-इफ परिदृश्य लागू किया गया! आपकी निर्णय रिपोर्ट और मासिक किस्त अपडेट हो गई है।' : '✨ What-If scenario applied! Your active Decision Report has been recalculated.');
  window.showMeridianToast(msg);
};

window.saveOfficerTermUpdates = async function() {
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  if (currentAuthUser?.role !== 'officer') {
    window.showMeridianToast(hi ? 'केवल ऋण अधिकारी ही पैरामीटर सहेज सकते हैं।' : 'Officer clearance required to save parameter changes.', true);
    return;
  }

  const appNo = state.currentApplicant?.id;
  if (!appNo) {
    window.showMeridianToast(hi ? 'कृपया पहले केंद्रीय वॉल्ट से किसी आवेदन का चयन करें।' : 'Select an application from the Central Vault first.', true);
    return;
  }

  const btn = document.getElementById('btn-officer-save-terms');
  if (btn) {
    btn.disabled = true;
    btn.innerText = hi ? '⏳ वॉल्ट में सहेजा जा रहा है...' : '⏳ Saving to Vault...';
  }

  const ch = Number(document.getElementById('input-credit-history')?.value ?? 1);
  const existingCibil = Number(state.currentApplicant?.cibil_score || 760);
  const updatedCibil = ch === 1 ? (existingCibil >= 650 ? existingCibil : 760) : 540;
  const selfEmp = document.getElementById('input-self-employed')?.value || 'No';

  const patchBody = {
    applicant_income: Number(document.getElementById('input-app-income')?.value || 0),
    coapplicant_income: Number(document.getElementById('input-coapp-income')?.value || 0),
    loan_amount: Number(document.getElementById('input-loan-amount')?.value || 150000),
    loan_term_months: Number(document.getElementById('input-loan-term')?.value || 60),
    cibil_score: updatedCibil,
    salary_slip: selfEmp === 'Yes' ? 'No' : 'Yes',
    property_area: document.getElementById('input-property-area')?.value || 'Rural',
    employment_type: selfEmp === 'Yes' ? 'Self-Employed (Business/MSME)' : 'Salaried (Private/Corporate)'
  };

  try {
    const res = await fetch(`${state.apiBase}/api/application/${encodeURIComponent(appNo)}`, {
      method: 'PATCH',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patchBody)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      state.backendConnected = true;
      if (data.application) {
        applyRecordToCurrentState(data.application);
      }
      state.backendPrediction = data.prediction || null;
      state.backendExplanation = data.explanation || null;
      updateUI();
      updateSimulationUI();
      await window.refreshDatabaseTable();
      await fetchAuditLogs();
      window.showMeridianToast(
        hi
          ? `✅ आवेदन ${appNo} के संशोधित पैरामीटर डेटाबेस वॉल्ट में स्थायी रूप से सहेजे गए।`
          : `✅ Updated parameters for ${appNo} saved permanently to Central Vault.`
      );
    } else if (res.status === 404) {
      window.showMeridianToast(
        hi
          ? `नोट: ऐतिहासिक पोर्टफ़ोलियो केस (${appNo}) केवल संदर्भ विश्लेषण के लिए हैं। सहेजने के लिए केंद्रीय वॉल्ट से जमा आवेदन चुनें।`
          : `Historical portfolio benchmark (${appNo}) is read-only. Select a submitted application from Central Vault to persist changes.`,
        true
      );
    } else {
      window.showMeridianToast(data.error || (hi ? 'पैरामीटर सहेजने में त्रुटि।' : 'Failed to save parameter changes.'), true);
    }
  } catch (e) {
    window.showMeridianToast(hi ? 'वॉल्ट सर्वर से संपर्क करने में नेटवर्क त्रुटि।' : 'Network error saving updated parameters.', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = dict.btn_save_officer_terms;
    }
  }
};

window.resetWhatIfToBaseline = function() {
  const base = state.currentApplicant;
  state.simulated = {
    loan_amount: base.loan_amount || 150000,
    coapplicant_income: base.coapplicant_income !== undefined ? base.coapplicant_income : 0,
    term: base.term || 60,
    cibil_score: base.cibil_score || 760,
    credit_history: (base.cibil_score || 760) >= 650 ? 1 : 0,
    salary_slip: (base.salary_slip || 'Yes') === 'Yes'
  };

  syncSimLoanInputs(state.simulated.loan_amount);
  setSliderVal('sim-slider-coapp', state.simulated.coapplicant_income);
  setSliderVal('sim-slider-term', Math.round(state.simulated.term / 12));
  setSliderVal('sim-slider-cibil', state.simulated.cibil_score);
  syncSimulatorSliderLabels();
  syncSimSalarySlipVisuals(state.simulated.salary_slip);
  updateSimulationUI();
};

let _whatIfTimer = null;

function applySimulationRender(simPred, delta) {
  const hi = state.currentLang === 'hi';
  const sim = state.simulated;
  const simProbEl = document.getElementById('sim-current-prob');
  const simDeltaEl = document.getElementById('sim-delta-badge');
  const simStatusEl = document.getElementById('sim-status-label');
  const pct = simPred.approvalPercent !== undefined ? simPred.approvalPercent : simPred.approval_likelihood;
  const statusStr = String(simPred.status || 'conditional').toLowerCase();
  const emi = simPred.ratios ? simPred.ratios.emi : (simPred.monthly_emi || 0);
  const dtiPct = simPred.ratios ? simPred.ratios.dtiPct : (simPred.dti_percent || 0);

  if (simProbEl) simProbEl.innerText = `${pct}%`;
  if (simDeltaEl) {
    if (delta > 0) {
      simDeltaEl.innerText = hi ? `+${delta}% लाभ` : `+${delta}% Gain`;
      simDeltaEl.className = 'badge badge-success';
    } else if (delta < 0) {
      simDeltaEl.innerText = hi ? `${delta}% गिरावट` : `${delta}% Drop`;
      simDeltaEl.className = 'badge badge-danger';
    } else {
      simDeltaEl.innerText = hi ? 'आधार रेखा' : 'Baseline';
      simDeltaEl.className = 'badge badge-info';
    }
  }

  if (simStatusEl) {
    simStatusEl.innerText = localizeStatus(statusStr, state.currentLang).toUpperCase();
    simStatusEl.className = `badge badge-${statusStr === 'approved' ? 'success' : statusStr === 'conditional' ? 'warning' : 'danger'}`;
  }

  const emiEl = document.getElementById('sim-metric-emi');
  const dtiEl = document.getElementById('sim-metric-dti');
  const cibilEl = document.getElementById('sim-metric-cibil');
  const docEl = document.getElementById('sim-metric-doc');

  if (emiEl) emiEl.innerText = `₹${Math.round(emi).toLocaleString('en-IN')}${hi ? '/माह' : '/mo'}`;
  if (dtiEl) {
    const dtiSafe = dtiPct <= 30
      ? (hi ? 'सुरक्षित' : 'Safe')
      : dtiPct <= 45
        ? (hi ? 'मध्यम' : 'Moderate')
        : (hi ? 'अत्यधिक' : 'High');
    dtiEl.innerText = `${dtiPct}% (${dtiSafe})`;
  }
  if (cibilEl) {
    const tier = sim.cibil_score >= 750
      ? (hi ? 'उत्कृष्ट' : 'Prime')
      : sim.cibil_score >= 650
        ? (hi ? 'योग्य' : 'Qualifying')
        : (hi ? 'निम्न' : 'Subprime');
    cibilEl.innerText = `${tier} (${sim.cibil_score})`;
  }
  if (docEl) {
    docEl.innerText = sim.salary_slip
      ? (hi ? 'वेतन पर्ची संलग्न (+5%)' : 'Salary Slip Attached (+5%)')
      : (hi ? 'बैंक स्टेटमेंट सत्यापन' : 'Bank Statement Verified');
  }

  const tipEl = document.getElementById('sim-smart-tip');
  if (tipEl) {
    if (pct >= 75) {
      tipEl.style.background = '#F0FDF4';
      tipEl.style.borderLeft = '4px solid #059669';
      tipEl.style.color = '#064E3B';
      tipEl.innerHTML = hi
        ? '✨ <strong>उत्कृष्ट वित्तीय संतुलन:</strong> यह कॉन्फ़िगरेशन कम ईएमआई और मजबूत सिबिल के साथ आपके आवेदन को <strong>स्वीकृत श्रेणी (Approved Tier)</strong> में रखता है।'
        : '✨ <strong>Optimal Underwriting Sweet Spot:</strong> This balanced configuration comfortably qualifies your file in the <strong>Approved Tier</strong> with safe repayment margins.';
    } else if (dtiPct > 45) {
      tipEl.style.background = '#FFFBEB';
      tipEl.style.borderLeft = '4px solid #D97706';
      tipEl.style.color = '#92400E';
      tipEl.innerHTML = hi
        ? '⚠️ <strong>मासिक ऋण भार अधिक है:</strong> ईएमआई आय का 45% से अधिक ले रही है। अवधि (टेन्योर) को 8-12 वर्ष तक बढ़ाकर या ऋण राशि घटाकर स्वीकृति तुरंत प्राप्त करें।'
        : '⚠️ <strong>Elevated Monthly Obligation:</strong> Monthly EMI takes over 45% of income. Try extending tenure to 8–12 years or reducing loan amount to drop DTI below 40%.';
    } else if (sim.cibil_score < 650) {
      tipEl.style.background = '#FEF2F2';
      tipEl.style.borderLeft = '4px solid #DC2626';
      tipEl.style.color = '#991B1B';
      tipEl.innerHTML = hi
        ? '⚠️ <strong>सिबिल स्कोर चुनौती:</strong> 650 से कम सिबिल स्कोर मुख्य रुकावट है। सिबिल स्कोर को 680+ तक सुधारने से तुरंत स्वीकृति संभव होगी।'
        : '⚠️ <strong>Bureau Score Barrier:</strong> A CIBIL bureau score below 650 is the primary risk driver. Clearing past overdues to reach 680+ will unlock full sanction.';
    } else {
      tipEl.style.background = '#EFF6FF';
      tipEl.style.borderLeft = '4px solid #2563EB';
      tipEl.style.color = '#1E40AF';
      tipEl.innerHTML = hi
        ? '💡 <strong>समीक्षाधीन स्थिति:</strong> आवेदन स्वीकृति सीमा के निकट है। सह-आवेदक आय जोड़ने या वेतन पर्ची संलग्न करने से स्वीकृति सुनिश्चित होगी।'
        : '💡 <strong>Borderline Threshold:</strong> Application is close to standard pass criteria. Adding a family co-applicant will easily elevate your likelihood above 80%.';
    }
  }
}

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
  applySimulationRender(simPred, delta);

  clearTimeout(_whatIfTimer);
  _whatIfTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${state.apiBase}/api/what-if`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          base: {
            ...baseApp,
            loan_term_months: baseApp.term || 60
          },
          adjustments: {
            loan_amount: sim.loan_amount,
            coapplicant_income: sim.coapplicant_income,
            loan_term_months: sim.term,
            cibil_score: sim.cibil_score,
            salary_slip: sim.salary_slip ? 'Yes' : 'No'
          }
        })
      });
      if (res.status === 503) {
        await window.checkSiteAvailability();
        return;
      }
      if (res.ok) {
        state.backendConnected = true;
        const data = await res.json();
        const s = data.simulation;
        if (s && s.simulated && s.deltas) {
          applySimulationRender(s.simulated, s.deltas.score_change);
        }
      }
    } catch (e) {}
  }, 180);
}

window.exportVaultToCSV = function() {
  const hi = state.currentLang === 'hi';
  const apps = (state.savedDatabaseApps && state.savedDatabaseApps.length > 0)
    ? state.savedDatabaseApps
    : (state.hasApplied && state.currentApplicant?.id ? [state.currentApplicant] : []);

  if (apps.length === 0) {
    window.showMeridianToast(hi ? 'निर्यात करने के लिए कोई आवेदन उपलब्ध नहीं है।' : 'No loan applications available to export yet.', true);
    return;
  }

  const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Application No,Submitted At,Updated At,Full Name,CIBIL Score,Salary Slip,Applicant Income,Co-Applicant Income,Loan Amount (INR),Tenure (Months),Property Area,AI Score (%),Status,Officer Decision,Officer Remarks,Monthly EMI (INR)\n';

  apps.forEach(a => {
    const row = [
      csvCell(a.application_no || a.id || ''),
      csvCell(a.created_at || ''),
      csvCell(a.updated_at || a.created_at || ''),
      csvCell(a.full_name || a.name || 'Applicant'),
      a.cibil_score || 750,
      csvCell(a.salary_slip || 'Yes'),
      a.applicant_income || 0,
      a.coapplicant_income || 0,
      a.loan_amount || 150000,
      a.loan_term_months || a.term || 60,
      csvCell(a.property_area || 'Urban'),
      a.approval_likelihood || 50,
      csvCell(a.status || 'Conditional'),
      csvCell(a.officer_status || 'Pending'),
      csvCell(a.officer_remarks || a.officer_notes || ''),
      a.monthly_emi || 0
    ].join(',');
    csvContent += row + '\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `meridian_loan_applications_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.exportVaultToJSON = function() {
  const hi = state.currentLang === 'hi';
  const apps = (state.savedDatabaseApps && state.savedDatabaseApps.length > 0)
    ? state.savedDatabaseApps
    : (state.hasApplied && state.currentApplicant?.id ? [state.currentApplicant] : []);

  if (apps.length === 0) {
    window.showMeridianToast(hi ? 'निर्यात करने के लिए कोई आवेदन उपलब्ध नहीं है।' : 'No loan applications available to export yet.', true);
    return;
  }

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(apps, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `meridian_loan_vault_backup_${new Date().toISOString().substring(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function renderDatabaseTableRows(allApps) {
  const tbody = document.getElementById('db-table-body');
  const countBadge = document.getElementById('db-total-count');
  if (!tbody) return;
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';

  if (countBadge) {
    countBadge.innerText = hi
      ? `${allApps.length} सुरक्षित आवेदन`
      : `${allApps.length} Saved Applications`;
  }

  if (!allApps || allApps.length === 0) {
    const emptyMsg = isOfficer ? dict.db_empty_officer : dict.db_empty_applicant;
    const actionBtn = !isOfficer
      ? `<div style="margin-top: 0.75rem;"><button type="button" class="btn btn-primary" style="padding: 6px 14px; font-size: 0.82rem;" onclick="activateWorkspaceTab('apply-view')">${escapeHtml(dict.no_app_cta)}</button></div>`
      : '';
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 2.25rem 1.25rem; color: #4B6359;">
          <div style="font-weight: 600;">${escapeHtml(emptyMsg)}</div>
          ${actionBtn}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allApps.map(app => {
    const statusRaw = String(app.status || 'Conditional');
    const badge = statusRaw === 'Approved' ? 'badge-success' : statusRaw === 'Conditional' ? 'badge-warning' : 'badge-danger';
    const cibilVal = app.cibil_score || (app.credit_history === 1 ? 750 : 540);
    const cibilClass = cibilVal >= 750 ? 'badge-success' : cibilVal >= 650 ? 'badge-info' : 'badge-danger';
    const totInc = (parseFloat(app.applicant_income) || 0) + (parseFloat(app.coapplicant_income) || 0);
    const termMonths = app.loan_term_months || app.term || 60;
    const years = Math.max(1, Math.round(termMonths / 12));
    const isSlip = app.salary_slip === 'Yes' || app.salary_slip === true;
    const slipTag = isSlip
      ? `<span style="color: #059669; font-weight: 700;">${hi ? '✓ पर्ची' : '✓ Slip'}</span>`
      : `<span style="color: #D97706; font-weight: 700;">${hi ? '✕ अनुपलब्ध' : '✕ No Slip'}</span>`;
    const loanAmt = parseFloat(app.loan_amount || 150000);
    const loanDisplay = `₹${Math.round(loanAmt).toLocaleString('en-IN')}`;
    const areaDisplay = localizeArea(app.property_area || 'Urban', state.currentLang);
    const statusDisplay = localizeStatus(statusRaw, state.currentLang);
    const offStatus = String(app.officer_status || 'Pending').trim();
    const offTag = (offStatus && offStatus.toLowerCase() !== 'pending')
      ? `<div style="font-size: 0.68rem; color: #4B6359; margin-top: 2px;">${escapeHtml(localizeStatus(offStatus, state.currentLang))}</div>`
      : '';
    const actionLabel = hi
      ? (isOfficer ? 'कॉकपिट में जांचें' : 'रिपोर्ट देखें')
      : (isOfficer ? 'Inspect in Cockpit' : 'View Report');

    return `
      <tr>
        <td style="font-weight: 800; color: #064E3B;">${escapeHtml(app.application_no)}</td>
        <td style="font-size: 0.8rem; color: #4B6359;">${app.created_at ? escapeHtml(String(app.created_at).substring(0, 16)) : (hi ? 'आज' : 'Today')}</td>
        <td style="font-weight: 700; color: #0B2920;">${escapeHtml(app.full_name || (hi ? 'आवेदक' : 'Applicant'))}</td>
        <td><span class="badge ${cibilClass}">${escapeHtml(cibilVal)}</span></td>
        <td style="font-size: 0.8rem;">${slipTag}</td>
        <td>₹${totInc.toLocaleString('en-IN')}${hi ? '/माह' : '/mo'}</td>
        <td>${loanDisplay} (${years} ${hi ? 'वर्ष' : 'yrs'})</td>
        <td>${escapeHtml(areaDisplay)}</td>
        <td><strong>${escapeHtml(app.approval_likelihood || 50)}%</strong></td>
        <td><span class="badge ${badge}">${escapeHtml(statusDisplay)}</span>${offTag}</td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem;" onclick="loadDbApplicantById('${escapeHtml(app.application_no)}')">
            🔍 ${actionLabel}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.refreshDatabaseTable = async function() {
  const tbody = document.getElementById('db-table-body');
  if (!tbody) return;
  if (!currentAuthUser) {
    state.savedDatabaseApps = [];
    renderDatabaseTableRows([]);
    return;
  }

  const appMap = new Map();
  const isOfficer = currentAuthUser.role === 'officer';

  try {
    const queryParams = isOfficer
      ? '?role=officer'
      : `?user_id=${encodeURIComponent(currentAuthUser.id)}&role=applicant&email=${encodeURIComponent(currentAuthUser.email || '')}`;
    const response = await fetch(`${state.apiBase}/api/saved-applications${queryParams}`, { headers: buildAuthHeaders() });
    if (response.status === 503 && !isOfficer) {
      await window.checkSiteAvailability();
      return;
    }
    if (response.ok) {
      state.backendConnected = true;
      const data = await response.json();
      if (data.applications && Array.isArray(data.applications)) {
        data.applications.forEach(app => {
          if (app && app.application_no) {
            appMap.set(app.application_no, app);
          }
        });
      }
    }
  } catch (e) {}

  if (!isOfficer) {
    readOfflineQueue().forEach(app => {
      if (app && app.application_no && !appMap.has(app.application_no)) {
        appMap.set(app.application_no, app);
      }
    });
  }

  let allApps = Array.from(appMap.values());

  allApps.sort((a, b) => {
    const timeA = a.updated_at || a.created_at || '';
    const timeB = b.updated_at || b.created_at || '';
    if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA);
    return (b.application_no || '').localeCompare(a.application_no || '');
  });

  if (!isOfficer) {
    allApps = allApps.filter(app => {
      if (!app) return false;
      const uidMatch = app.user_id && String(app.user_id) === String(currentAuthUser.id);
      const aidMatch = app.applicant_id && String(app.applicant_id) === String(currentAuthUser.id);
      const recordEmail = String(app.applicant_email || app.email || '').trim().toLowerCase();
      const userEmail = String(currentAuthUser.email || '').trim().toLowerCase();
      const emailMatch = userEmail && recordEmail && recordEmail === userEmail;
      return uidMatch || aidMatch || emailMatch;
    });
  }

  state.savedDatabaseApps = allApps;
  renderDatabaseTableRows(allApps);

  if (state.hasApplied && state.currentApplicant?.id) {
    const updatedActive = allApps.find(a => a.application_no === state.currentApplicant.id);
    if (updatedActive) {
      const nextRemarks = updatedActive.officer_remarks || updatedActive.officer_notes || '';
      const nextUpdated = updatedActive.updated_at || updatedActive.created_at || '';
      const nextOffStatus = updatedActive.officer_status || 'Pending';
      const changed =
        nextUpdated !== state.currentApplicant.updated_at ||
        nextOffStatus !== state.currentApplicant.officer_status ||
        nextRemarks !== state.currentApplicant.officer_remarks ||
        (updatedActive.status || '') !== (state.currentApplicant.status || '');
      if (changed) {
        applyRecordToCurrentState(updatedActive);
      }
    }
  }
};

window.loadDbApplicantById = async function(appNo) {
  const hi = state.currentLang === 'hi';
  let found = (state.savedDatabaseApps || []).find(a => a.application_no === appNo) || null;

  try {
    const res = await fetch(`${state.apiBase}/api/application/${encodeURIComponent(appNo)}`, {
      headers: buildAuthHeaders()
    });
    if (res.status === 503 && currentAuthUser?.role !== 'officer') {
      await window.checkSiteAvailability();
      return;
    }
    if (res.status === 401 || res.status === 403) {
      const err = await res.json().catch(() => ({}));
      window.showMeridianToast(err.error || (hi ? 'अस्वीकृत: आप केवल अपने आवेदन देख सकते हैं।' : 'Forbidden: You may only access your own loan applications.'), true);
      return;
    }
    if (res.ok) {
      state.backendConnected = true;
      const data = await res.json();
      if (data.application) {
        found = data.application;
      }
    }
  } catch (e) {}

  if (!found) {
    window.showMeridianToast(hi ? `आवेदन ${appNo} नहीं मिला।` : `Application ${appNo} could not be loaded.`, true);
    return;
  }

  applyRecordToCurrentState(found);
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  window.activateWorkspaceTab(isOfficer ? 'officer-view' : 'applicant-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (isOfficer) {
    await addAuditLog('VAULT_INSPECT', `Inspected application ${appNo} (${found.full_name || 'Applicant'}) from central vault`);
  }
};

window.goToDatabaseTab = function() {
  window.activateWorkspaceTab('database-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.inspectSubmittedApp = function() {
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  window.activateWorkspaceTab(isOfficer ? 'officer-view' : 'applicant-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function normalizeBackendPrediction(bp, applicant) {
  const fallback = computePrediction(applicant);
  if (!bp) return fallback;
  const c = bp.contributions || {};
  return {
    approvalPercent: bp.approval_likelihood !== undefined ? bp.approval_likelihood : fallback.approvalPercent,
    prob: (bp.approval_likelihood !== undefined ? bp.approval_likelihood : fallback.approvalPercent) / 100.0,
    status: String(bp.status || fallback.status).toLowerCase(),
    cibil_score: bp.cibil_score !== undefined ? bp.cibil_score : fallback.cibil_score,
    salary_slip: bp.salary_slip || fallback.salary_slip,
    is_freelance: fallback.is_freelance,
    contributions: {
      credit_history: { impact: c.credit_history !== undefined ? Number(c.credit_history) : fallback.contributions.credit_history.impact },
      dti_ratio: { impact: c.dti_ratio !== undefined ? Number(c.dti_ratio) : fallback.contributions.dti_ratio.impact },
      income_coverage: { impact: c.income_coverage !== undefined ? Number(c.income_coverage) : fallback.contributions.income_coverage.impact },
      coapplicant: { impact: c.coapplicant !== undefined ? Number(c.coapplicant) : fallback.contributions.coapplicant.impact },
      salary_slip: { impact: c.salary_slip !== undefined ? Number(c.salary_slip) : fallback.contributions.salary_slip.impact },
      employment_type: { impact: c.employment !== undefined ? Number(c.employment) : fallback.contributions.employment_type.impact },
      property_area: { impact: c.property_area !== undefined ? Number(c.property_area) : fallback.contributions.property_area.impact }
    },
    ratios: {
      totInc: bp.total_monthly_income !== undefined ? Math.round(bp.total_monthly_income) : fallback.ratios.totInc,
      emi: bp.ratios?.emi !== undefined ? Math.round(bp.ratios.emi) : (bp.monthly_emi !== undefined ? Math.round(bp.monthly_emi) : fallback.ratios.emi),
      dtiPct: bp.ratios?.dtiPct !== undefined ? bp.ratios.dtiPct : (bp.dti_percent !== undefined ? bp.dti_percent : fallback.ratios.dtiPct),
      ltiRatio: bp.ratios?.ltiRatio !== undefined ? bp.ratios.ltiRatio : fallback.ratios.ltiRatio
    }
  };
}

function updateUI() {
  const applicant = state.currentApplicant;
  const pred = state.backendPrediction
    ? normalizeBackendPrediction(state.backendPrediction, applicant)
    : computePrediction(applicant);
  const lang = state.currentLang;
  const dict = I18N[lang] || I18N.en;
  const explanations = generatePlainLanguageExplanations(pred, applicant, lang);

  const noAppNotice = document.getElementById('no-application-notice');
  const reportContent = document.getElementById('applicant-report-content');
  if (noAppNotice && reportContent) {
    noAppNotice.style.display = state.hasApplied ? 'none' : 'block';
    reportContent.style.display = state.hasApplied ? 'block' : 'none';
  }

  const adjBanner = document.getElementById('officer-adjudication-banner');
  const adjBadge = document.getElementById('adj-status-badge');
  const adjRemarks = document.getElementById('adj-remarks-text');
  const adjUpdated = document.getElementById('adj-updated-at');
  if (adjBanner) {
    if (state.hasApplied) {
      adjBanner.style.display = 'flex';
      const offRaw = String(applicant.officer_status || 'Pending').trim();
      const offLow = offRaw.toLowerCase();
      let bannerCls = 'officer-adjudication-banner';
      let badgeCls = 'badge badge-info';
      let badgeText = dict.status_pending;
      if (offLow === 'approved') {
        bannerCls += ' status-approved';
        badgeCls = 'badge badge-success';
        badgeText = localizeStatus('Approved', lang).toUpperCase();
      } else if (offLow === 'conditional') {
        bannerCls += ' status-conditional';
        badgeCls = 'badge badge-warning';
        badgeText = localizeStatus('Conditional', lang).toUpperCase();
      } else if (offLow === 'rejected') {
        bannerCls += ' status-rejected';
        badgeCls = 'badge badge-danger';
        badgeText = localizeStatus('Rejected', lang).toUpperCase();
      }
      adjBanner.className = bannerCls;
      if (adjBadge) {
        adjBadge.className = badgeCls;
        adjBadge.innerText = badgeText;
      }
      if (adjRemarks) {
        const rem = String(applicant.officer_remarks || '').trim();
        adjRemarks.innerText = rem || dict.adj_remarks_none;
      }
      if (adjUpdated) {
        const upd = String(applicant.updated_at || '').trim();
        adjUpdated.innerText = upd ? upd.substring(0, 16) : '-';
      }
    } else {
      adjBanner.style.display = 'none';
    }
  }

  const offActiveBadge = document.getElementById('officer-active-app-badge');
  if (offActiveBadge) {
    if (applicant.id) {
      const displayName = applicant.name || (lang === 'hi' ? 'आवेदक' : 'Borrower');
      offActiveBadge.innerText = `${applicant.id} (${displayName})`;
      offActiveBadge.className = 'badge badge-info';
    } else {
      offActiveBadge.innerText = lang === 'hi' ? 'कोई फ़ाइल चयनित नहीं' : 'No Active File';
      offActiveBadge.className = 'badge badge-warning';
    }
  }

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
      heroTag.innerText = lang === 'hi' ? 'अनुमोदित / उच्च संभावना' : 'APPROVED / HIGH LIKELIHOOD';
      heroTitle.innerText = dict.approved_title;
      heroDesc.innerText = dict.approved_desc;
    } else if (pred.status === 'conditional') {
      heroTag.innerText = lang === 'hi' ? 'समीक्षाधीन / संदेहास्पद स्थिति' : 'CONDITIONAL / BORDERLINE';
      heroTitle.innerText = dict.conditional_title;
      heroDesc.innerText = dict.conditional_desc;
    } else {
      heroTag.innerText = lang === 'hi' ? 'अस्वीकृत / उच्च वित्तीय जोखिम' : 'UNLIKELY / ELEVATED RISK';
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
          ${lang === 'hi' ? '✓ कोई गंभीर जोखिम कारक नहीं मिला। आपका प्रोफाइल स्वीकृत मानकों के अनुरूप है।' : '✓ No primary risk friction factors identified. Profile comfortably satisfies credit guidelines.'}
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
          ${lang === 'hi' ? '🎉 कोई सुधार कार्रवाई आवश्यक नहीं है! आपका आवेदन डिजिटल वितरण के लिए सीधे योग्य है।' : '🎉 No remediation required! Your file satisfies high-confidence underwriting standards for immediate sanction.'}
        </div>
      `;
    } else {
      actionsContainer.innerHTML = explanations.actions.map(action => `
        <div class="action-card">
          <div class="action-num">→</div>
          <div class="action-content">
            <div class="action-title">${lang === 'hi' ? 'अनुशंसा' : 'Recommended Step'}</div>
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
      openLetterBtn.innerHTML = `<span>📄</span> ${lang === 'hi' ? 'आधिकारिक प्रतिकूल निर्णय सूचना देखें एवं डाउनलोड करें' : 'View & Download Adverse Action Notice'}`;
    } else {
      openLetterBtn.innerHTML = `<span>📄</span> ${dict.btn_open_letter}`;
    }
  }

  renderOfficerMetrics(pred, applicant);
  renderWaterfall(pred);
  syncFormInputs(applicant);
}

function syncFormInputs(app) {
  setValue('input-name', app.name || '');
  setValue('input-gender', app.gender || 'Female');
  setValue('input-married', app.married || 'No');
  setValue('input-dependents', app.dependents !== undefined && app.dependents !== '' ? String(app.dependents) : '0');
  setValue('input-education', app.education || 'Graduate');
  setValue('input-self-employed', app.self_employed || 'No');
  setValue('input-app-income', app.applicant_income !== undefined ? app.applicant_income : 0);
  setValue('input-coapp-income', app.coapplicant_income !== undefined ? app.coapplicant_income : 0);
  setValue('input-loan-amount', app.loan_amount || 150000);
  setValue('input-loan-term', app.term || 60);
  const cibilVal = app.cibil_score !== undefined ? Number(app.cibil_score) : (app.credit_history === 0 ? 540 : 760);
  setValue('input-credit-history', cibilVal >= 650 ? 1 : 0);
  setValue('input-property-area', app.property_area || 'Rural');
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function renderOfficerMetrics(pred, applicant) {
  const hi = state.currentLang === 'hi';
  const setHtml = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  setHtml('metric-officer-prob', `${pred.approvalPercent}%`);
  setHtml('metric-officer-dti', `${pred.ratios.dtiPct}%`);
  setHtml('metric-officer-emi', `₹${pred.ratios.emi.toLocaleString('en-IN')}<span style="font-size: 0.72rem; font-weight: 600; opacity: 0.85;">${hi ? '/माह' : '/mo'}</span>`);
  setHtml('metric-officer-lti', `${pred.ratios.ltiRatio}x <span style="font-size: 0.72rem; font-weight: 600; opacity: 0.85;">${hi ? 'वार्षिक' : 'Annual'}</span>`);
}

function renderWaterfall(pred) {
  const container = document.getElementById('waterfall-container') || document.getElementById('waterfall-bars');
  if (!container) return;
  const hi = state.currentLang === 'hi';

  const basePoints = 50;
  const contribs = pred.contributions || {};

  const items = [
    { label: hi ? 'आधारभूत अंडरराइटिंग मानक (Baseline)' : 'Baseline Underwriting Anchor', val: basePoints, type: 'neutral' },
    { label: hi ? 'सिबिल ब्यूरो क्रेडिट इतिहास' : 'CIBIL Bureau Track Record', val: contribs.credit_history?.impact || 0, type: (contribs.credit_history?.impact || 0) >= 0 ? 'pos' : 'neg' },
    { label: hi ? 'मासिक ऋण भार (DTI / FOIR)' : 'Monthly Debt Burden (DTI / FOIR)', val: contribs.dti_ratio?.impact || 0, type: (contribs.dti_ratio?.impact || 0) >= 0 ? 'pos' : 'neg' },
    { label: hi ? 'आय कवरेज अनुपात' : 'Income Coverage Ratio', val: contribs.income_coverage?.impact || 0, type: (contribs.income_coverage?.impact || 0) >= 0 ? 'pos' : 'neg' },
    { label: hi ? 'वेतन पर्ची सत्यापन' : 'Salary Slip Verification', val: contribs.salary_slip?.impact || 0, type: (contribs.salary_slip?.impact || 0) >= 0 ? 'pos' : 'neg' },
    { label: hi ? 'संयुक्त सह-आवेदक सहयोग' : 'Joint Co-Applicant Support', val: contribs.coapplicant?.impact || 0, type: (contribs.coapplicant?.impact || 0) > 0 ? 'pos' : 'neutral' },
    { label: hi ? 'मिशन भारत क्षेत्रीय समता' : 'Mission Bharat Geographic Equity', val: contribs.property_area?.impact || 0, type: 'pos' },
    { label: hi ? 'अंतिम स्वीकृति संभावना' : 'Final Approval Likelihood', val: pred.approvalPercent, type: 'final' }
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
  const hi = state.currentLang === 'hi';
  if (currentAuthUser?.role !== 'officer') {
    window.showMeridianToast(hi ? 'अस्वीकृत: ऋण अधिकारी अनुमति आवश्यक है।' : 'Forbidden: Officer clearance required.', true);
    return;
  }

  const appNo = state.currentApplicant?.id;
  if (!appNo) {
    window.showMeridianToast(
      hi
        ? 'निर्णय दर्ज करने से पहले कृपया केंद्रीय वॉल्ट से किसी आवेदन का चयन करें।'
        : 'Please select a submitted application from Central Application Vault first.',
      true
    );
    return;
  }

  const applicantName = state.currentApplicant.name || (hi ? 'आवेदक' : 'Applicant');
  const remarksVal = document.getElementById('officer-remarks-input')?.value.trim() || note;

  try {
    const res = await fetch(`${state.apiBase}/api/officer/sanction`, {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        application_no: appNo,
        status: newStatus,
        note: note,
        remarks: remarksVal,
        officer_role: 'officer'
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 403) {
      alert(payload.error || (hi ? 'अस्वीकृत: ऋण अधिकारी अनुमति आवश्यक है।' : 'Forbidden: Officer clearance required.'));
      return;
    }
    if (res.status === 404) {
      window.showMeridianToast(
        hi
          ? `नोट: ऐतिहासिक पोर्टफोलियो केस (${appNo}) केवल संदर्भ विश्लेषण के लिए हैं। निर्णय दर्ज करने के लिए केंद्रीय वॉल्ट से जमा आवेदन चुनें।`
          : `Application ${appNo} is not in the persistent vault (historical portfolio samples are read-only). Select a submitted application from Central Vault.`,
        true
      );
      return;
    }
    if (!res.ok || !payload.success) {
      window.showMeridianToast(payload.error || (hi ? 'ऋण निर्णय दर्ज करने में त्रुटि हुई।' : 'Failed to record officer decision.'), true);
      return;
    }

    state.backendConnected = true;
    if (payload.application) {
      applyRecordToCurrentState(payload.application);
    } else {
      state.currentApplicant.status = newStatus;
      state.currentApplicant.officer_status = newStatus;
      state.currentApplicant.officer_remarks = remarksVal;
      state.currentApplicant.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    updateUI();
    await window.refreshDatabaseTable();
    await fetchAuditLogs();

    const statusLocalized = localizeStatus(newStatus, state.currentLang);
    const alertMsg = hi
      ? `✅ ऋण निर्णय दर्ज हुआ!\n\nआवेदन: ${appNo}\nआवेदक: ${applicantName}\nस्थिति: ${statusLocalized}\n\nयह निर्णय मेरिडियन डेटाबेस वॉल्ट में स्थायी रूप से दर्ज हो गया है!`
      : `✅ Loan Decision Recorded!\n\nApplication No: ${appNo}\nApplicant: ${applicantName}\nStatus: ${newStatus}\n\nRecorded persistently in Meridian Server Vault!`;
    alert(alertMsg);
  } catch (e) {
    window.showMeridianToast(
      hi ? 'सर्वर से संपर्क नहीं हो सका। निर्णय सहेजा नहीं गया।' : 'Network error reaching Meridian Server Vault. Decision was not saved.',
      true
    );
  }
};

function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      if (tabId) window.activateWorkspaceTab(tabId);
    });
  });

  document.getElementById('sim-slider-loan')?.addEventListener('input', (e) => {
    const val = Number(e.target.value) || 150000;
    state.simulated.loan_amount = val;
    setValue('sim-input-loan', val);
    syncSimulatorSliderLabels();
    updateSimulationUI();
  });

  document.getElementById('sim-input-loan')?.addEventListener('input', (e) => {
    const raw = Number(e.target.value);
    if (isNaN(raw) || raw <= 0) return;
    state.simulated.loan_amount = raw;
    const slider = document.getElementById('sim-slider-loan');
    if (slider) {
      slider.max = raw > 5000000 ? String(Math.ceil(raw / 100000) * 100000) : '5000000';
      slider.value = Math.max(Number(slider.min || 5000), raw);
    }
    syncSimulatorSliderLabels();
    updateSimulationUI();
  });

  document.getElementById('sim-input-loan')?.addEventListener('change', (e) => {
    const raw = Number(e.target.value);
    const clamped = (!isNaN(raw) && raw >= 1000) ? Math.round(raw) : 1000;
    state.simulated.loan_amount = clamped;
    syncSimLoanInputs(clamped);
    syncSimulatorSliderLabels();
    updateSimulationUI();
  });

  document.getElementById('loan-fillup-form')?.addEventListener('reset', () => {
    setTimeout(() => {
      syncFormHelperDisplays();
      clearPersonalFormInputs();
    }, 0);
  });

  Object.entries(OTP_SCOPE_CONFIG).forEach(([scope, cfg]) => {
    document.getElementById(cfg.emailId)?.addEventListener('input', (e) => {
      const cur = (e.target.value || '').trim().toLowerCase();
      if (otpState[scope].email && otpState[scope].email !== cur) {
        invalidateOtpScope(scope, true);
      } else if (otpState[scope].statusKind === 'error' || otpState[scope].statusKind === 'unconfigured') {
        otpState[scope].statusKind = 'default';
        otpState[scope].rawError = '';
        syncOtpUIStates();
      }
    });
  });

  ['fp-email', 'fp-new-password', 'fp-confirm-password'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('focus', () => el.removeAttribute('readonly'));
    el.addEventListener('pointerdown', () => el.removeAttribute('readonly'));
  });

  document.getElementById('sim-slider-coapp')?.addEventListener('input', (e) => {
    state.simulated.coapplicant_income = Number(e.target.value);
    syncSimulatorSliderLabels();
    updateSimulationUI();
  });

  document.getElementById('sim-slider-term')?.addEventListener('input', (e) => {
    state.simulated.term = Number(e.target.value) * 12;
    syncSimulatorSliderLabels();
    updateSimulationUI();
  });

  document.getElementById('sim-slider-cibil')?.addEventListener('input', (e) => {
    state.simulated.cibil_score = Number(e.target.value);
    syncSimulatorSliderLabels();
    updateSimulationUI();
  });

  document.getElementById('btn-open-letter')?.addEventListener('click', () => {
    window.openDecisionLetterModal(currentAuthUser?.role === 'officer');
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

  document.getElementById('affirmative-toggle')?.addEventListener('change', (e) => {
    state.affirmativeMode = !!e.target.checked;
    renderFairnessCharts();
  });

  const officerFieldIds = [
    'input-name', 'input-gender', 'input-married', 'input-dependents',
    'input-education', 'input-self-employed', 'input-app-income',
    'input-coapp-income', 'input-loan-amount', 'input-loan-term',
    'input-credit-history', 'input-property-area'
  ];
  let _officerPredictTimer = null;
  officerFieldIds.forEach(fid => {
    document.getElementById(fid)?.addEventListener('input', () => {
      const ch = Number(document.getElementById('input-credit-history')?.value ?? 1);
      const prevCibil = Number(state.currentApplicant.cibil_score || 760);
      state.currentApplicant.name = document.getElementById('input-name')?.value || state.currentApplicant.name;
      state.currentApplicant.gender = document.getElementById('input-gender')?.value || 'Female';
      state.currentApplicant.married = document.getElementById('input-married')?.value || 'No';
      state.currentApplicant.dependents = document.getElementById('input-dependents')?.value || '0';
      state.currentApplicant.education = document.getElementById('input-education')?.value || 'Graduate';
      state.currentApplicant.self_employed = document.getElementById('input-self-employed')?.value || 'No';
      state.currentApplicant.employment_type = state.currentApplicant.self_employed === 'Yes' ? 'Self-Employed (Business/MSME)' : 'Salaried (Private/Corporate)';
      state.currentApplicant.salary_slip = state.currentApplicant.self_employed === 'Yes' ? 'No' : 'Yes';
      state.currentApplicant.applicant_income = Number(document.getElementById('input-app-income')?.value || 0);
      state.currentApplicant.coapplicant_income = Number(document.getElementById('input-coapp-income')?.value || 0);
      state.currentApplicant.loan_amount = Number(document.getElementById('input-loan-amount')?.value || 150000);
      state.currentApplicant.term = Number(document.getElementById('input-loan-term')?.value || 60);
      state.currentApplicant.credit_history = ch;
      state.currentApplicant.cibil_score = ch === 1 ? (prevCibil >= 650 ? prevCibil : 760) : 540;
      state.currentApplicant.property_area = document.getElementById('input-property-area')?.value || 'Rural';
      state.backendPrediction = null;
      state.backendExplanation = null;

      const localPred = computePrediction(state.currentApplicant);
      renderOfficerMetrics(localPred, state.currentApplicant);
      renderWaterfall(localPred);

      clearTimeout(_officerPredictTimer);
      _officerPredictTimer = setTimeout(async () => {
        try {
          const res = await fetch(`${state.apiBase}/api/predict`, {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              ...state.currentApplicant,
              loan_term_months: state.currentApplicant.term
            })
          });
          if (res.status === 503 && currentAuthUser?.role !== 'officer') {
            await window.checkSiteAvailability();
            return;
          }
          if (res.ok) {
            state.backendConnected = true;
            const data = await res.json();
            if (data.prediction) {
              const p = data.prediction;
              const mapped = {
                approvalPercent: p.approval_likelihood,
                contributions: {
                  credit_history: { impact: p.contributions?.credit_history || 0 },
                  dti_ratio: { impact: p.contributions?.dti_ratio || 0 },
                  income_coverage: { impact: p.contributions?.income_coverage || 0 },
                  salary_slip: { impact: p.contributions?.salary_slip || 0 },
                  coapplicant: { impact: p.contributions?.coapplicant || 0 },
                  property_area: { impact: p.contributions?.property_area || 0 }
                },
                ratios: {
                  emi: p.ratios?.emi ?? p.monthly_emi ?? 0,
                  dtiPct: p.ratios?.dtiPct ?? p.dti_percent ?? 0,
                  ltiRatio: p.ratios?.ltiRatio ?? 0
                }
              };
              renderOfficerMetrics(mapped, state.currentApplicant);
              renderWaterfall(mapped);
            }
          }
        } catch (e) {}
      }, 200);
    });
  });
}

function setSliderVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

window.scrollToSimulator = function() {
  window.activateWorkspaceTab('applicant-view');
  setTimeout(() => {
    const simCard = document.getElementById('what-if-card');
    if (simCard) simCard.scrollIntoView({ behavior: 'smooth' });
  }, 100);
};

window.updateFillTenureDisplay = function(years) {
  const hi = state.currentLang === 'hi';
  const y = parseInt(years, 10) || 5;
  const months = y * 12;
  const tag = document.getElementById('fill-tenure-tag');
  if (tag) {
    tag.innerText = hi ? `${y} वर्ष (${months} माह)` : `${y} Year${y > 1 ? 's' : ''} (${months} Months)`;
  }
  const numInput = document.getElementById('fill-exact-years');
  if (numInput) numInput.value = y;
};

window.updateFillTenureFromNumber = function(years) {
  const hi = state.currentLang === 'hi';
  let y = parseInt(years, 10);
  if (isNaN(y) || y < 1) y = 1;
  if (y > 30) y = 30;
  const slider = document.getElementById('fill-loan-years');
  if (slider) slider.value = y;
  const months = y * 12;
  const tag = document.getElementById('fill-tenure-tag');
  if (tag) {
    tag.innerText = hi ? `${y} वर्ष (${months} माह)` : `${y} Year${y > 1 ? 's' : ''} (${months} Months)`;
  }
};

window.updateCibilDisplay = function(val) {
  const hi = state.currentLang === 'hi';
  const tag = document.getElementById('cibil-display-tag');
  const guide = document.getElementById('cibil-guide-text');
  let rating = hi ? 'कमज़ोर' : 'Poor';
  let badgeClass = 'badge-danger';
  let guideText = hi
    ? '⚠️ सिबिल स्कोर 650 से कम है। पूर्व-स्वीकृति के लिए पिछले बकाये का निपटान करें।'
    : '⚠️ CIBIL score is below 650. Settle past overdues to secure pre-approval.';

  if (val >= 750) {
    rating = hi ? 'उत्कृष्ट (प्राइम)' : 'Prime (Excellent)';
    badgeClass = 'badge-success';
    guideText = hi
      ? '✓ सिबिल स्कोर ≥ 750 न्यूनतम ब्याज दर और त्वरित प्रोसेसिंग के लिए पात्र है।'
      : '✓ CIBIL score ≥ 750 qualifies for lowest interest rates and fast-track processing.';
  } else if (val >= 650) {
    rating = hi ? 'अच्छा (मानक)' : 'Good (Standard)';
    badgeClass = 'badge-info';
    guideText = hi
      ? '✓ सिबिल स्कोर ≥ 650 मानक भारतीय बैंकिंग ऋण दिशानिर्देशों के अनुरूप है।'
      : '✓ CIBIL score ≥ 650 meets standard banking credit guidelines.';
  }

  if (tag) {
    tag.innerText = hi ? `सिबिल: ${val} (${rating})` : `CIBIL: ${val} (${rating})`;
    tag.className = `badge ${badgeClass}`;
  }
  if (guide) guide.innerText = guideText;
};

window.openDecisionLetterModal = function(allowOfficerPreview = false) {
  const hi = state.currentLang === 'hi';
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  if (!state.hasApplied) {
    if (allowOfficerPreview || isOfficer) {
      window.showMeridianToast(
        hi
          ? 'सूचना पत्र बनाने के लिए कृपया पहले केंद्रीय वॉल्ट या पोर्टफोलियो से कोई आवेदन चुनें।'
          : 'Please select an application from Central Application Vault or Portfolio first to preview a sanction notice.',
        true
      );
      return;
    }
    alert(
      hi
        ? 'कृपया आधिकारिक स्वीकृति पत्र डाउनलोड करने के लिए पहले ऋण आवेदन जमा करें।'
        : 'Please submit your loan application first to generate and download your official Sanction Letter.'
    );
    window.activateWorkspaceTab('apply-view');
    return;
  }
  const modal = document.getElementById('letter-modal');
  if (!modal) return;

  const app = state.currentApplicant;
  const pred = state.backendPrediction
    ? normalizeBackendPrediction(state.backendPrediction, app)
    : computePrediction(app);

  const setEl = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  let loanAmtInr = parseFloat(app.loan_amount !== undefined && app.loan_amount !== null && app.loan_amount !== '' ? app.loan_amount : 150000);
  if (isNaN(loanAmtInr) || loanAmtInr <= 0) loanAmtInr = 150000;

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

  const appRef = app.id || 'MB-PENDING';
  setEl('let-applicant-name', app.name || (hi ? 'आवेदक' : 'Applicant'));
  setEl('let-ref', `MERIDIAN-${appRef}`);
  setEl('let-date', new Date().toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' }));
  setEl('let-loan-amount', `₹${loanAmtInr.toLocaleString('en-IN')}`);
  setEl('let-tenure', hi ? `${termMonths} माह (${years} वर्ष)` : `${termMonths} Months (${years} Years)`);
  setEl('let-area', hi ? `${localizeArea(app.property_area || 'Urban', 'hi')} क्षेत्र` : `${localizeArea(app.property_area || 'Urban', 'en')} Territory`);

  setEl('kfs-loan-amt', `₹${loanAmtInr.toLocaleString('en-IN')}`);
  setEl('kfs-apr', hi ? '9.25% वार्षिक (RBI मानकों के अनुसार स्थिर घटती दर)' : '9.25% p.a. (Fixed Reducing per RBI Guidelines)');
  setEl('kfs-tenure', hi ? `${termMonths} माह (${years} वर्ष)` : `${termMonths} Months (${years} Years)`);
  setEl('kfs-emi', hi ? `₹${emiVal.toLocaleString('en-IN')} / माह` : `₹${emiVal.toLocaleString('en-IN')} / month`);
  setEl('kfs-total-interest', `₹${totalInterest.toLocaleString('en-IN')}`);
  setEl('kfs-total-repayment', `₹${totalRepay.toLocaleString('en-IN')}`);

  const offStatLow = String(app.officer_status || '').trim().toLowerCase();
  const effectiveStatus = (offStatLow === 'approved' || offStatLow === 'conditional' || offStatLow === 'rejected')
    ? offStatLow
    : pred.status;

  const statusBadge = document.getElementById('let-status-badge');
  const verdictText = document.getElementById('let-verdict-text');
  if (statusBadge) {
    if (effectiveStatus === 'approved') {
      statusBadge.innerText = hi ? 'आधिकारिक सैद्धांतिक ऋण स्वीकृति' : 'OFFICIAL IN-PRINCIPLE APPROVAL';
      statusBadge.className = 'badge badge-success';
      if (verdictText) {
        verdictText.innerHTML = hi
          ? `हमें यह सूचित करते हुए प्रसन्नता हो रही है कि ऋण आवेदन <strong>${escapeHtml(appRef)}</strong> <strong>RBI फेयर प्रैक्टिसेज कोड</strong> के अंतर्गत सभी अंडरराइटिंग मानदंडों को सफलतापूर्वक पूरा करता है। नीचे आधिकारिक <strong>मुख्य तथ्य विवरण (KFS)</strong> और पारदर्शी कारक विश्लेषण प्रस्तुत है।`
          : `We are pleased to inform you that application <strong>${escapeHtml(appRef)}</strong> has satisfied all underwriting benchmarks under the <strong>RBI Fair Practices Code</strong>. Below is the official <strong>Key Fact Statement (KFS)</strong> and explainable eligibility breakdown.`;
      }
    } else if (effectiveStatus === 'conditional') {
      statusBadge.innerText = hi ? 'सशर्त सैद्धांतिक ऋण स्वीकृति' : 'CONDITIONAL IN-PRINCIPLE SANCTION';
      statusBadge.className = 'badge badge-warning';
      if (verdictText) {
        verdictText.innerHTML = hi
          ? `आवेदन <strong>${escapeHtml(appRef)}</strong> <strong>RBI डिजिटल लेंडिंग दिशानिर्देशों</strong> के अंतर्गत प्राथमिक KYC सत्यापन अथवा सह-गारंटर समर्थन के अधीन सैद्धांतिक स्वीकृति के लिए पात्र है।`
          : `Application <strong>${escapeHtml(appRef)}</strong> qualifies for in-principle sanction subject to primary KYC verification or co-guarantor endorsement under the <strong>RBI Digital Lending Guidelines</strong>.`;
      }
    } else {
      statusBadge.innerText = hi ? 'प्रतिकूल निर्णय सूचना (अस्वीकृत)' : 'ADVERSE ACTION NOTICE (DECLINED)';
      statusBadge.className = 'badge badge-danger';
      if (verdictText) {
        verdictText.innerHTML = hi
          ? `स्वचालित एवं संस्थागत ऋण निर्णयों पर <strong>भारतीय रिज़र्व बैंक फेयर प्रैक्टिसेज कोड</strong> के अनुपालन में, इस प्रतिकूल निर्णय के कारण बने विशिष्ट क्रेडिट मापदंडों का पारदर्शी विवरण नीचे दिया गया है।`
          : `In compliance with the <strong>Reserve Bank of India Fair Practices Code</strong> on lending decisions, we provide below the transparent factor determination detailing the specific credit parameters that led to this adverse decision.`;
      }
    }
  }

  const factorsList = document.getElementById('let-factors-list');
  if (factorsList) {
    const cibilVal = app.cibil_score || (app.credit_history === 1 ? 750 : 540);
    const dtiVal = pred.ratios.dtiPct;
    const items = [];

    if (cibilVal >= 650) {
      items.push(
        hi
          ? `<li><strong>क्रेडिट ब्यूरो विश्वसनीयता (सिबिल ${cibilVal}):</strong> स्वच्छ पुनर्भुगतान इतिहास ने अंडरराइटिंग स्कोर को उल्लेखनीय रूप से बढ़ाया (+28.4%)।</li>`
          : `<li><strong>Credit Bureau Reliability (CIBIL ${cibilVal}):</strong> Clean bureau repayment record substantially elevated underwriting score (+28.4%).</li>`
      );
    } else {
      items.push(
        hi
          ? `<li><strong>क्रेडिट ब्यूरो चेतावनी (सिबिल ${cibilVal}):</strong> पूर्व बकाया या सबप्राइम स्कोर न्यूनतम पात्रता मानक से नीचे है (-32.1%)।</li>`
          : `<li><strong>Credit Bureau Alert (CIBIL ${cibilVal}):</strong> Historical default or subprime score below qualifying threshold (-32.1%).</li>`
      );
    }

    if (dtiVal <= 35) {
      items.push(
        hi
          ? `<li><strong>ऋण-से-आय अनुपात (DTI ${dtiVal}%):</strong> प्रस्तावित मासिक किस्त RBI की 45% विवेकपूर्ण सुरक्षित सीमा के पूर्णतः भीतर है।</li>`
          : `<li><strong>Debt-to-Income (DTI ${dtiVal}%):</strong> Requested installment is well within RBI prudential comfort ceiling of 45%.</li>`
      );
    } else {
      items.push(
        hi
          ? `<li><strong>मासिक ऋण भार (DTI ${dtiVal}%):</strong> मासिक किस्त पारिवारिक नकदी प्रवाह का बड़ा हिस्सा ले रही है, जिससे चुकौती जोखिम बढ़ता है।</li>`
          : `<li><strong>Debt Burden (DTI ${dtiVal}%):</strong> Monthly installment consumes elevated percentage of household cashflow, presenting leverage risk.</li>`
      );
    }

    if (app.salary_slip === 'Yes' || app.salary_slip === true) {
      items.push(
        hi
          ? '<li><strong>आय सत्यापन योग्यता:</strong> औपचारिक वेतन पर्ची ने स्थिर एवं नियमित नकदी प्रवाह की पुष्टि की है।</li>'
          : '<li><strong>Income Verifiability:</strong> Formal institutional salary slips validated stable disposable cashflow.</li>'
      );
    } else {
      items.push(
        hi
          ? '<li><strong>अनौपचारिक / फ्रीलांस आय:</strong> मिशन भारत वित्तीय समावेशन के अंतर्गत वैकल्पिक बैंक विवरण और डिजिटल कैश-फ्लो से मूल्यांकित।</li>'
          : '<li><strong>Informal / Freelance Earnings:</strong> Assessed via surrogate cashflow & bank metrics under Mission Bharat Financial Inclusion.</li>'
      );
    }

    if (app.officer_remarks && String(app.officer_remarks).trim()) {
      items.push(
        hi
          ? `<li><strong>संस्थागत अधिकारी टिप्पणी:</strong> ${escapeHtml(app.officer_remarks)}</li>`
          : `<li><strong>Underwriter Decision Remarks:</strong> ${escapeHtml(app.officer_remarks)}</li>`
      );
    }

    const explanations = generatePlainLanguageExplanations(pred, app, state.currentLang);
    if (explanations && explanations.actions && explanations.actions.length > 0) {
      items.push(
        hi
          ? `<li><strong>सुधार / मार्गदर्शन:</strong> ${explanations.actions[0]}</li>`
          : `<li><strong>Remediation / Guidance:</strong> ${explanations.actions[0]}</li>`
      );
    }

    factorsList.innerHTML = items.join('');
  }

  modal.style.display = 'flex';
};

async function fetchAuditLogs() {
  if (currentAuthUser?.role !== 'officer') {
    state.auditLog = [];
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/officer/audit-logs?limit=50`, {
      headers: buildAuthHeaders()
    });
    if (res.ok) {
      state.backendConnected = true;
      const data = await res.json();
      if (Array.isArray(data.logs)) {
        state.auditLog = data.logs.map(log => ({
          time: String(log.created_at || '').substring(0, 16) || '-',
          officer: log.officer_name || 'Loan Officer',
          id: log.application_no || 'SYSTEM',
          action: log.action || 'EVENT',
          note: log.notes || log.remarks || ''
        }));
        renderAuditTable();
      }
    }
  } catch (e) {}
}

async function addAuditLog(action, note, explicitAppNo = null) {
  if (currentAuthUser?.role !== 'officer') return;
  const appNo = explicitAppNo || state.currentApplicant?.id || 'SYSTEM';
  const remarksVal = document.getElementById('officer-remarks-input')?.value.trim() || note || '';
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  state.auditLog.unshift({
    time: now,
    officer: currentAuthUser ? (currentAuthUser.full_name || currentAuthUser.email) : 'Current Officer',
    id: appNo,
    action: action,
    note: note || ''
  });
  renderAuditTable();

  try {
    const res = await fetch(`${state.apiBase}/api/officer/audit-logs`, {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        application_no: appNo,
        action: action,
        notes: note || '',
        remarks: remarksVal
      })
    });
    if (res.ok) {
      state.backendConnected = true;
      await fetchAuditLogs();
    }
  } catch (e) {}
}

function localizeAuditAction(action) {
  if (state.currentLang !== 'hi') return action;
  const map = {
    'Approved': 'स्वीकृत',
    'Officer Approved': 'अधिकारी द्वारा स्वीकृत',
    'Officer Conditional': 'अधिकारी द्वारा सशर्त स्वीकृत',
    'Officer Rejected': 'अधिकारी द्वारा अस्वीकृत',
    'Officer Updated Terms': 'अधिकारी द्वारा शर्तें अपडेट',
    'System Rejected': 'प्रणाली द्वारा अस्वीकृत',
    'Mission Bharat Pass': 'मिशन भारत पास',
    'VAULT_INSPECT': 'वॉल्ट निरीक्षण',
    'PORTFOLIO_INSPECT': 'पोर्टफोलियो निरीक्षण',
    'SITE_ONLINE': 'वेबसाइट ऑनलाइन',
    'SITE_OFFLINE': 'वेबसाइट ऑफ़लाइन'
  };
  return map[action] || action;
}

function renderAuditTable() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;
  const hi = state.currentLang === 'hi';

  if (!state.auditLog || state.auditLog.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 1.5rem; color: #64748B;">
          ${hi ? 'अभी तक कोई ऑडिट प्रविष्टि दर्ज नहीं हुई है।' : 'No compliance audit entries recorded yet.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.auditLog.slice(0, 15).map(log => `
    <tr>
      <td style="font-size: 0.78rem; color: #64748B;">${escapeHtml(log.time)}</td>
      <td style="font-weight: 600;">${escapeHtml(log.officer)}</td>
      <td style="font-weight: 700; color: #064E3B;">${escapeHtml(log.id)}</td>
      <td><span class="badge badge-info">${escapeHtml(localizeAuditAction(log.action))}</span></td>
      <td style="font-size: 0.82rem;">${escapeHtml(log.note)}</td>
    </tr>
  `).join('');
}

window.downloadSqliteBackup = async function() {
  const hi = state.currentLang === 'hi';
  if (currentAuthUser?.role !== 'officer') {
    window.showMeridianToast(hi ? 'केवल ऋण अधिकारी ही वॉल्ट बैकअप डाउनलोड कर सकते हैं।' : 'Officer clearance required to download vault backup.', true);
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/officer/backup?format=sqlite`, {
      headers: buildAuthHeaders()
    });
    if (res.status === 401 || res.status === 403) {
      window.showMeridianToast(hi ? 'अस्वीकृत: डेटाबेस बैकअप डाउनलोड करने के लिए अधिकारी प्रमाणन आवश्यक है।' : 'Forbidden: Verified officer session required for SQLite backup.', true);
      return;
    }
    if (!res.ok) {
      window.showMeridianToast(hi ? 'वॉल्ट बैकअप डाउनलोड करने में त्रुटि हुई।' : 'Failed to generate vault SQLite backup.', true);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `meridian_loans_backup_${new Date().toISOString().substring(0, 10)}.db`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    window.showMeridianToast(hi ? '💽 SQLite वॉल्ट बैकअप डाउनलोड हो गया!' : '💽 SQLite Vault backup downloaded successfully!');
  } catch (e) {
    window.showMeridianToast(hi ? 'वॉल्ट बैकअप डाउनलोड करने में नेटवर्क त्रुटि।' : 'Network error downloading vault backup.', true);
  }
};

function localizeFeatureLabel(rawFeature) {
  const clean = String(rawFeature || '').trim();
  if (state.currentLang !== 'hi') return clean.replace(/_/g, ' ');
  const key = clean.toLowerCase();
  const hiMap = {
    'credit_history': 'क्रेडिट ब्यूरो इतिहास (सिबिल)',
    'applicant_income_log': 'आवेदक आय (लॉग)',
    'coapplicant_income_log': 'सह-आवेदक आय (लॉग)',
    'total_income_log': 'कुल पारिवारिक आय (लॉग)',
    'loan_amount_log': 'ऋण राशि (लॉग)',
    'emi_to_income_ratio': 'EMI से आय अनुपात (DTI)',
    'loan_amount_term': 'ऋण अवधि (माह)',
    'property_area_semiurban': 'क्षेत्र: अर्ध-शहरी',
    'property_area_rural': 'क्षेत्र: ग्रामीण भारत',
    'property_area_urban': 'क्षेत्र: शहरी / महानगर',
    'married_yes': 'वैवाहिक स्थिति: विवाहित',
    'education_not_graduate': 'शिक्षा: गैर-स्नातक',
    'education_graduate': 'शिक्षा: स्नातक',
    'self_employed_yes': 'स्वरोजगार / व्यवसाय',
    'gender_male': 'लिंग: पुरुष',
    'dependents': 'आश्रितों की संख्या'
  };
  return hiMap[key] || clean.replace(/_/g, ' ');
}

async function renderModelPerformanceCharts() {
  if (currentAuthUser?.role !== 'officer') return;
  const chartContainer = document.getElementById('feature-importance-chart');
  const hi = state.currentLang === 'hi';
  let weights = [];

  try {
    const res = await fetch(`${state.apiBase}/api/accuracy`, { headers: buildAuthHeaders() });
    if (res.status === 503 && currentAuthUser?.role !== 'officer') {
      await window.checkSiteAvailability();
      return;
    }
    if (res.ok) {
      state.backendConnected = true;
      const data = await res.json();
      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
      setTxt('model-acc-val', `${data.overall_accuracy_percent}%`);
      setTxt('model-prec-val', `${data.precision_percent}%`);
      setTxt('model-rec-val', `${data.recall_sensitivity_percent}%`);
      setTxt('model-auc-val', `${data.roc_auc_score}`);
      if (data.confusion_matrix) {
        setTxt('cm-tp-val', data.confusion_matrix.true_positives);
        setTxt('cm-fn-val', data.confusion_matrix.false_negatives);
        setTxt('cm-fp-val', data.confusion_matrix.false_positives);
        setTxt('cm-tn-val', data.confusion_matrix.true_negatives);
      }
      if (Array.isArray(data.feature_weights)) {
        weights = data.feature_weights;
      }
    }
  } catch (e) {}

  if (weights.length === 0 && typeof MERIDIAN_DATASET !== 'undefined' && MERIDIAN_DATASET.weights) {
    weights = Object.entries(MERIDIAN_DATASET.weights).map(([feature, weight]) => ({ feature, weight }));
  }

  if (!chartContainer || weights.length === 0) return;
  const maxAbs = Math.max(...weights.map(w => Math.abs(w.weight)), 0.1);
  const sorted = [...weights].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  chartContainer.innerHTML = sorted.map(item => {
    const isPos = item.weight >= 0;
    const widthPct = Math.max(8, Math.round((Math.abs(item.weight) / maxAbs) * 100));
    const color = isPos ? '#059669' : '#DC2626';
    const label = localizeFeatureLabel(item.feature);
    return `
      <div style="margin-bottom: 0.85rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 3px;">
          <span style="font-weight: 600; color: #1E293B;">${label}</span>
          <span style="font-weight: 800; color: ${color};">${isPos ? '+' : ''}${Number(item.weight).toFixed(3)} ${hi ? 'लॉग-ऑड्स' : 'log-odds'}</span>
        </div>
        <div style="background: #E2E8F0; height: 9px; border-radius: 5px; overflow: hidden;">
          <div style="background: ${color}; height: 100%; width: ${widthPct}%; border-radius: 5px;"></div>
        </div>
      </div>
    `;
  }).join('');
}

async function renderFairnessCharts() {
  if (currentAuthUser?.role !== 'officer') return;
  const tbody = document.getElementById('fairness-table-body');
  if (!tbody) return;
  const hi = state.currentLang === 'hi';

  const affirmative = !!(document.getElementById('affirmative-toggle')?.checked);
  let report = null;

  try {
    const res = await fetch(`${state.apiBase}/api/fairness?affirmative=${affirmative}`, { headers: buildAuthHeaders() });
    if (res.status === 503 && currentAuthUser?.role !== 'officer') {
      await window.checkSiteAvailability();
      return;
    }
    if (res.ok) {
      state.backendConnected = true;
      report = await res.json();
    }
  } catch (e) {}

  if (!report && typeof MERIDIAN_DATASET !== 'undefined' && Array.isArray(MERIDIAN_DATASET.records)) {
    const recs = MERIDIAN_DATASET.records;
    const stats = (fn) => {
      const subset = recs.filter(fn);
      const total = subset.length;
      const approved = subset.filter(r => {
        if (affirmative && String(r.property_area || '').toLowerCase() === 'rural' && Number(r.credit_history) === 1) return true;
        return r.pred_status === 'Y';
      }).length;
      return { total, approved, approval_rate_percent: total ? Math.round((approved / total) * 1000) / 10 : 0 };
    };
    const m = stats(r => String(r.gender || '').toLowerCase() === 'male');
    const f = stats(r => String(r.gender || '').toLowerCase() === 'female');
    const s = stats(r => String(r.property_area || '').toLowerCase() === 'semiurban');
    const ru = stats(r => String(r.property_area || '').toLowerCase() === 'rural');
    const u = stats(r => String(r.property_area || '').toLowerCase() === 'urban');
    const g = stats(r => String(r.education || '').toLowerCase() === 'graduate');
    const ng = stats(r => String(r.education || '').toLowerCase() === 'not graduate');
    const gDir = m.approval_rate_percent > 0 ? Math.round((f.approval_rate_percent / m.approval_rate_percent) * 1000) / 1000 : 1;
    const rDir = s.approval_rate_percent > 0 ? Math.round((ru.approval_rate_percent / s.approval_rate_percent) * 1000) / 1000 : 1;
    const eDir = g.approval_rate_percent > 0 ? Math.round((ng.approval_rate_percent / g.approval_rate_percent) * 1000) / 1000 : 1;
    report = {
      gender_fairness: { male_benchmark: m, female_protected: f, disparate_impact_ratio: gDir, passes_80_rule: gDir >= 0.8 },
      territory_fairness: { semiurban_benchmark: s, rural_protected: ru, urban: u, disparate_impact_ratio: rDir, passes_80_rule: rDir >= 0.8 },
      education_fairness: { graduate_benchmark: g, non_graduate_protected: ng, disparate_impact_ratio: eDir, passes_80_rule: eDir >= 0.8 }
    };
  }

  if (!report) return;

  const rows = [];
  const addRow = (cat, grp, stats, dirVal, isBenchmark, passes) => {
    const badge = isBenchmark
      ? `<span class="badge badge-info">${hi ? 'संदर्भ समूह (1.00)' : 'Reference Group (1.00)'}</span>`
      : passes
        ? `<span class="badge badge-success">${hi ? 'उत्तीर्ण (&ge; 0.80 नियम)' : 'PASS (&ge; 0.80 Rule)'}</span>`
        : `<span class="badge badge-warning">${hi ? 'समीक्षाधीन (&lt; 0.80)' : 'UNDER REVIEW (&lt; 0.80)'}</span>`;
    rows.push(`
      <tr>
        <td style="font-weight: 700; color: #064E3B;">${cat}</td>
        <td>${grp}</td>
        <td>${stats?.total ?? '-'}</td>
        <td><strong>${stats?.approval_rate_percent ?? 0}%</strong></td>
        <td>${Math.min(99, Math.round((stats?.approval_rate_percent || 80) + 12))}%</td>
        <td><strong>${isBenchmark ? '1.000' : dirVal}</strong></td>
        <td>${badge}</td>
      </tr>
    `);
  };

  if (report.gender_fairness) {
    const gf = report.gender_fairness;
    addRow(hi ? 'लिंग' : 'Gender', hi ? 'पुरुष (बेंचमार्क)' : 'Male (Benchmark)', gf.male_benchmark, 1.0, true, true);
    addRow(hi ? 'लिंग' : 'Gender', hi ? 'महिला (संरक्षित)' : 'Female (Protected)', gf.female_protected, gf.disparate_impact_ratio, false, gf.passes_80_rule);
  }
  if (report.territory_fairness) {
    const tf = report.territory_fairness;
    addRow(hi ? 'क्षेत्र' : 'Territory', hi ? 'अर्ध-शहरी (बेंचमार्क)' : 'Semi-Urban (Benchmark)', tf.semiurban_benchmark, 1.0, true, true);
    addRow(hi ? 'क्षेत्र' : 'Territory', hi ? 'ग्रामीण भारत (प्राथमिकता)' : 'Rural Bharat (Priority)', tf.rural_protected, tf.disparate_impact_ratio, false, tf.passes_80_rule);
    addRow(hi ? 'क्षेत्र' : 'Territory', hi ? 'शहरी / महानगर' : 'Urban Metro', tf.urban, '-', true, true);
  }
  if (report.education_fairness) {
    const ef = report.education_fairness;
    addRow(hi ? 'शिक्षा' : 'Education', hi ? 'स्नातक (बेंचमार्क)' : 'Graduate (Benchmark)', ef.graduate_benchmark, 1.0, true, true);
    addRow(hi ? 'शिक्षा' : 'Education', hi ? 'गैर-स्नातक' : 'Non-Graduate', ef.non_graduate_protected, ef.disparate_impact_ratio, false, ef.passes_80_rule);
  }

  tbody.innerHTML = rows.join('');
}

function renderPortfolioTable() {
  if (currentAuthUser?.role !== 'officer') return;
  const tbody = document.getElementById('portfolio-table-body');
  const countLabel = document.getElementById('portfolio-total-count');
  const pageIndicator = document.getElementById('portfolio-page-indicator');
  if (!tbody) return;
  const hi = state.currentLang === 'hi';

  if (typeof MERIDIAN_DATASET === 'undefined' || !MERIDIAN_DATASET.records) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #DC2626;">${hi ? 'dataset_data.js से ऐतिहासिक डेटासेट लोड नहीं हुआ।' : 'Historical dataset not loaded from dataset_data.js'}</td></tr>`;
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

  const filterNamesHi = { all: 'सभी', approved: 'स्वीकृत', rejected: 'अस्वीकृत', rural: 'ग्रामीण', female: 'महिला' };
  if (countLabel) {
    countLabel.innerText = hi
      ? `ऐतिहासिक पोर्टफोलियो रिकॉर्ड${f !== 'all' ? ` (फ़िल्टर: ${filterNamesHi[f] || f})` : ''}`
      : `Historical Portfolio Applications${f !== 'all' ? ` (Filtered: ${f.toUpperCase()})` : ''}`;
  }
  if (pageIndicator) {
    pageIndicator.innerText = hi
      ? `पृष्ठ ${state.portfolioPage} / ${totalPages}`
      : `Page ${state.portfolioPage} / ${totalPages}`;
  }

  if (pageRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #64748B;">${hi ? 'ऐतिहासिक पोर्टफोलियो में कोई मेल खाता रिकॉर्ड नहीं मिला।' : 'No matching records found in historical portfolio.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = pageRecords.map(r => {
    const isApproved = r.pred_status === 'Y' || r.actual_status === 'Y';
    const statusBadge = isApproved
      ? `<span class="badge badge-success">${hi ? 'स्वीकृत' : 'APPROVED'}</span>`
      : `<span class="badge badge-danger">${hi ? 'अस्वीकृत' : 'REJECTED'}</span>`;

    const probVal = r.pred_prob !== undefined ? (r.pred_prob * 100).toFixed(1) : (isApproved ? '85.0' : '22.0');
    const probColor = probVal >= 70 ? '#059669' : probVal >= 40 ? '#D97706' : '#DC2626';

    const isClean = r.credit_history === 1 || r.credit_history === undefined || r.credit_history === null;
    const cHistory = isClean
      ? `<span class="badge badge-success">${hi ? 'स्वच्छ (1.0)' : 'Clean (1.0)'}</span>`
      : `<span class="badge badge-danger">${hi ? 'बकाया (0.0)' : 'Default (0.0)'}</span>`;

    const totalIncome = ((r.applicant_income || 0) + (r.coapplicant_income || 0));
    const formattedIncome = totalIncome > 0 ? `₹${totalIncome.toLocaleString('en-IN')}` : '₹35,000';
    const rawLoan = parseFloat(r.loan_amount || 150);
    const loanInr = rawLoan <= 1000 ? rawLoan * 1000 : rawLoan;

    return `
      <tr>
        <td style="font-weight: 800; color: #064E3B;">${escapeHtml(r.id)}</td>
        <td>${escapeHtml(localizeGender(r.gender, state.currentLang))}</td>
        <td><span class="badge ${r.property_area === 'Rural' ? 'badge-warning' : 'badge-info'}">${escapeHtml(localizeArea(r.property_area || 'Urban', state.currentLang))}</span></td>
        <td>${formattedIncome}</td>
        <td>₹${Math.round(loanInr).toLocaleString('en-IN')}</td>
        <td>${cHistory}</td>
        <td><strong style="color: ${probColor};">${probVal}%</strong></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.75rem;" onclick="loadHistoricalCase('${escapeHtml(r.id)}')">
            🔍 ${hi ? 'कॉकपिट में जांचें' : 'Inspect in Cockpit'}
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

window.loadHistoricalCase = async function(caseId) {
  if (currentAuthUser?.role !== 'officer') return;
  state.hasApplied = true;
  state.backendPrediction = null;
  state.backendExplanation = null;
  if (typeof MERIDIAN_DATASET === 'undefined' || !MERIDIAN_DATASET.records) return;
  const r = MERIDIAN_DATASET.records.find(rec => rec.id === caseId);
  if (!r) return;

  const appInc = r.applicant_income ? r.applicant_income * 10 : 35000;
  const coappInc = r.coapplicant_income ? r.coapplicant_income * 10 : 0;
  const isClean = r.credit_history === 1 || r.credit_history === undefined || r.credit_history === null;
  const cibil = isClean ? 760 : 540;

  const rawLoan = parseFloat(r.loan_amount || 150);
  const loanInr = rawLoan <= 1000 ? rawLoan * 1000 : rawLoan;

  state.currentApplicant = {
    id: r.id,
    name: `Historical Borrower (${r.id})`,
    gender: r.gender || 'Male',
    married: r.married || 'No',
    dependents: String(r.dependents || '0'),
    education: r.education || 'Graduate',
    self_employed: r.self_employed || 'No',
    employment_type: r.self_employed === 'Yes' ? 'Self-Employed (Business/MSME)' : 'Salaried (Private/Corporate)',
    applicant_income: appInc,
    coapplicant_income: coappInc,
    loan_amount: loanInr,
    term: r.term || 360,
    credit_history: isClean ? 1 : 0,
    cibil_score: cibil,
    salary_slip: r.self_employed === 'Yes' ? 'No' : 'Yes',
    property_area: r.property_area || 'Urban',
    loan_purpose: 'Home Improvement / Construction',
    status: (r.pred_status === 'Y' || r.actual_status === 'Y') ? 'Approved' : 'Rejected',
    officer_status: 'Pending',
    officer_remarks: '',
    updated_at: ''
  };

  window.resetWhatIfToBaseline();
  updateUI();
  updateSimulationUI();

  window.activateWorkspaceTab('officer-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  await addAuditLog(
    'PORTFOLIO_INSPECT',
    `Inspected historical case ${caseId} (${r.gender}, ${r.property_area}, Loan ₹${Math.round(loanInr).toLocaleString('en-IN')})`,
    caseId
  );
};

document.addEventListener('DOMContentLoaded', async () => {
  initPortalGatewayFromUrl();
  clearPersonalFormInputs();
  setupEventListeners();
  applyTranslations();
  syncFormHelperDisplays();
  syncSimulatorSliderLabels();
  await window.checkSiteAvailability();
  await window.fetchOtpStatus();
  await window.checkExistingSession();
  checkBackendConnection();
  applyTranslations();
  setInterval(() => {
    window.checkSiteAvailability();
  }, 20000);
});
