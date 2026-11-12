function resolveApiBase() {
  try {
    const params = new URLSearchParams(window.location.search);
    const paramApi = params.get('api');
    if (paramApi && paramApi.trim()) {
      const clean = paramApi.trim().replace(/\/+$/, '');
      localStorage.setItem('rindristi_api_base', clean);
      return clean;
    }
    if (window.RINDRISTI_API_BASE) {
      return String(window.RINDRISTI_API_BASE).trim().replace(/\/+$/, '');
    }
    const stored = localStorage.getItem('rindristi_api_base');
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
const DEFAULT_OFFLINE_MSG_EN = 'RinDristi FairLend AI is currently offline for scheduled maintenance. Online underwriting will resume shortly.';
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const LAST_ACTIVITY_STORAGE_KEY = 'rindristi_last_activity_at';

function createBlankApplicantState() {
  return {
    id: '',
    name: '',
    phone: '',
    applicant_email: '',
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
    created_at: '',
    updated_at: ''
  };
}

const APPLICANT_TABS = new Set(['apply-view', 'applicant-view', 'database-view']);
const OFFICER_TABS = new Set(['officer-view', 'database-view', 'portfolio-view', 'model-view', 'fairness-view']);
let activePortal = 'applicant';
let pendingInitialTab = null;
let pendingPublicInfoSection = null;
let pendingForgotPasswordModal = false;
let datasetLoadPromise = null;

function ensureDatasetLoaded() {
  if (typeof RINDRISTI_DATASET !== 'undefined' && RINDRISTI_DATASET && Array.isArray(RINDRISTI_DATASET.records)) {
    try { window.RINDRISTI_DATASET = RINDRISTI_DATASET; } catch (e) {}
    return Promise.resolve(RINDRISTI_DATASET);
  }
  if (datasetLoadPromise) return datasetLoadPromise;
  datasetLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-lazy-dataset="true"]');
    if (existing) {
      resolve(typeof RINDRISTI_DATASET !== 'undefined' ? RINDRISTI_DATASET : null);
      return;
    }
    const script = document.createElement('script');
    script.src = '/dataset_data.js';
    script.async = true;
    script.setAttribute('data-lazy-dataset', 'true');
    script.onload = () => {
      if (typeof RINDRISTI_DATASET !== 'undefined') {
        try { window.RINDRISTI_DATASET = RINDRISTI_DATASET; } catch (e) {}
        resolve(RINDRISTI_DATASET);
      } else {
        resolve(null);
      }
    };
    script.onerror = () => {
      datasetLoadPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return datasetLoadPromise;
}

const SLUG_TO_TAB = {
  '/apply': 'apply-view',
  '/decision-report': 'applicant-view',
  '/vault': 'database-view',
  '/underwriting-cockpit': 'officer-view',
  '/portfolio': 'portfolio-view',
  '/model-accuracy': 'model-view',
  '/fairness-audit': 'fairness-view'
};

const TAB_TO_SLUG = {
  'apply-view': '/apply',
  'applicant-view': '/decision-report',
  'database-view': '/vault',
  'officer-view': '/underwriting-cockpit',
  'portfolio-view': '/portfolio',
  'model-view': '/model-accuracy',
  'fairness-view': '/fairness-audit'
};

function normalizeSlugPath(rawPath) {
  let clean = String(rawPath || '/').split('?')[0].split('#')[0].trim().toLowerCase();
  if (!clean.startsWith('/')) clean = '/' + clean;
  if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);
  return clean || '/';
}

function showInlineAlert(elId, msg, isError = true) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.className = isError ? 'auth-alert auth-alert-error' : 'auth-alert auth-alert-success';
  el.innerHTML = (isError ? '⚠️ ' : '✅ ') + escapeHtml(msg);
  el.style.display = 'block';
}

function clearInlineAlert(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

const state = {
  currentRole: 'applicant',
  currentLang: localStorage.getItem('rindristi_lang') || 'en',
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
let availabilityPollTimerId = null;
let idleSessionTimerId = null;
let lastActivityWriteAt = 0;

function clearStoredAuthSession() {
  try {
    localStorage.removeItem('rindristi_auth_user');
    localStorage.removeItem('rindristi_auth_token');
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    sessionStorage.removeItem('rindristi_auth_user');
    sessionStorage.removeItem('rindristi_auth_token');
  } catch (e) {}
}

function getLastActivityTimestamp() {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch (e) {}
  return lastActivityWriteAt || 0;
}

function isLocalSessionIdleExpired() {
  const lastTs = getLastActivityTimestamp();
  if (!lastTs) return false;
  return (Date.now() - lastTs) >= SESSION_IDLE_TIMEOUT_MS;
}

function recordUserActivity(forceWrite = false) {
  if (!currentAuthUser) return;
  const now = Date.now();
  if (!forceWrite && isLocalSessionIdleExpired()) {
    window.handleLogout('inactivity');
    return;
  }
  if (!forceWrite && (now - lastActivityWriteAt) < 5000) {
    return;
  }
  lastActivityWriteAt = now;
  try {
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
  } catch (e) {}
}

function stopInactivityMonitor() {
  if (idleSessionTimerId) {
    clearInterval(idleSessionTimerId);
    idleSessionTimerId = null;
  }
}

function startInactivityMonitor() {
  stopInactivityMonitor();
  if (!currentAuthUser) return;
  idleSessionTimerId = setInterval(() => {
    if (!currentAuthUser) {
      stopInactivityMonitor();
      return;
    }
    if (isLocalSessionIdleExpired()) {
      window.handleLogout('inactivity');
    }
  }, 10000);
}

function handleApiAuthFailure(res, data = null) {
  if (res && res.status === 401 && currentAuthUser) {
    const reason = (data && data.session_expired) ? 'inactivity' : 'inactivity';
    window.handleLogout(reason);
    return true;
  }
  return false;
}

function getDefaultUserSettings(role = 'applicant') {
  return {
    theme: 'classic',
    fontSize: 'normal',
    density: 'comfortable',
    highContrast: false,
    reducedMotion: false,
    showToasts: true,
    privacyMaskVault: false,
    syncIntervalSec: 20,
    applicantStartTab: 'apply-view',
    defaultPropertyArea: 'Rural',
    defaultLoanYears: 5,
    defaultLoanPurpose: 'Home Improvement / Construction',
    showSimulatorSection: true,
    showRoadmapSection: true,
    autoSyncOffline: true,
    officerStartTab: 'officer-view',
    portfolioPageSize: 10,
    defaultAffirmativeMode: false,
    showOfficerSiteCard: true,
    roleContext: role === 'officer' ? 'officer' : 'applicant'
  };
}

let activeUserSettings = getDefaultUserSettings('applicant');
let draftUserSettings = getDefaultUserSettings('applicant');

function getUserSettingsStorageKey(user = currentAuthUser) {
  if (user && (user.id || user.email)) {
    const role = user.role === 'officer' ? 'officer' : 'applicant';
    const uid = String(user.id || user.email).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return `rindristi_user_settings_${role}_${uid}`;
  }
  return 'rindristi_user_settings_guest';
}

function loadUserSettings(user = currentAuthUser) {
  const role = user?.role === 'officer' ? 'officer' : 'applicant';
  const defaults = getDefaultUserSettings(role);
  try {
    const raw = localStorage.getItem(getUserSettingsStorageKey(user));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...defaults, ...parsed, roleContext: role };
      }
    }
  } catch (e) {}
  return defaults;
}

function saveUserSettingsToStorage(settingsObj, user = currentAuthUser) {
  try {
    localStorage.setItem(getUserSettingsStorageKey(user), JSON.stringify(settingsObj));
  } catch (e) {}
}

function applyVisualSettingsToDOM(settingsObj) {
  const s = settingsObj || activeUserSettings || getDefaultUserSettings('applicant');
  const body = document.body;
  const html = document.documentElement;
  if (body) {
    body.classList.remove('theme-classic', 'theme-mint', 'theme-slate', 'theme-midnight');
    const chosenTheme = ['classic', 'mint', 'slate', 'midnight'].includes(s.theme) ? s.theme : 'classic';
    if (chosenTheme !== 'classic') {
      body.classList.add(`theme-${chosenTheme}`);
    }
    body.classList.toggle('pref-compact', s.density === 'compact');
    body.classList.toggle('pref-high-contrast', Boolean(s.highContrast));
    body.classList.toggle('pref-reduced-motion', Boolean(s.reducedMotion));
  }
  if (html) {
    html.classList.remove('font-compact', 'font-large', 'font-xl');
    if (['compact', 'large', 'xl'].includes(s.fontSize)) {
      html.classList.add(`font-${s.fontSize}`);
    }
  }
}

function maskPrivacyName(rawName) {
  const str = String(rawName || '').trim();
  if (!str) return str;
  if (!activeUserSettings || !activeUserSettings.privacyMaskVault) return str;
  return str
    .split(/\s+/)
    .map(part => {
      const chars = Array.from(part);
      if (chars.length <= 1) return '*';
      return chars[0] + '*'.repeat(Math.min(4, chars.length - 1));
    })
    .join(' ');
}

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
  },
  profile_email: {
    purpose: 'email_change',
    emailId: 'setting-prof-email',
    otpId: 'setting-prof-otp',
    sendBtnId: 'btn-send-otp-profile-email',
    verifyBtnId: 'btn-verify-otp-profile-email',
    badgeId: 'otp-badge-profile-email',
    statusId: 'otp-status-profile-email',
    boxId: 'otp-box-profile-email',
    defaultHintKey: 'otp_hint_email_change'
  }
};

const otpState = {
  signup_app: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' },
  signup_off: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' },
  forgot_password: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' },
  profile_email: { email: '', verified: false, verificationToken: '', cooldown: 0, timerId: null, sentOnce: false, statusKind: 'default', rawError: '' }
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
    const reqHeaders = scope === 'profile_email'
      ? buildAuthHeaders({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };
    const res = await fetch(`${state.apiBase}/api/auth/send-otp`, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({
        email,
        purpose: cfg.purpose,
        lang: state.currentLang
      })
    });
    const data = await res.json().catch(() => ({}));
    if (handleApiAuthFailure(res, data)) {
      return false;
    }

    if (res.status === 503 && data.code === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
      s.statusKind = 'unconfigured';
      s.rawError = '';
      syncOtpUIStates();
      window.showRinDristiToast(getLangDict().otp_hint_unconfigured, true);
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
      window.showRinDristiToast(errMsg, true);
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
    window.showRinDristiToast(netMsg, true);
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
      window.showRinDristiToast(msg, true);
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
    window.showRinDristiToast(hi ? '✅ ईमेल OTP सफलतापूर्वक सत्यापित हो गया!' : '✅ Email OTP verified successfully!');
    return true;
  } catch (err) {
    const msg = hi ? 'OTP सत्यापन में नेटवर्क त्रुटि हुई।' : 'Network error verifying OTP.';
    s.statusKind = 'error';
    s.rawError = msg;
    syncOtpUIStates();
    window.showRinDristiToast(msg, true);
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
      const targetPath = targetPortal === 'officer' ? '/officer' : '/applicant';
      window.history.replaceState({ slug: targetPath }, '', targetPath);
    } catch (e) {}
  }
  syncDocumentSeoAndBreadcrumbs(targetPortal === 'officer' ? '/officer' : '/applicant');
};

function initPortalGatewayFromUrl() {
  let initialPortal = 'applicant';
  pendingInitialTab = null;
  pendingPublicInfoSection = null;
  pendingForgotPasswordModal = false;
  try {
    const pathSlug = normalizeSlugPath(window.location.pathname);
    const params = new URLSearchParams(window.location.search);
    const paramPortal = (params.get('portal') || '').trim().toLowerCase();
    const hashPortal = (window.location.hash || '').replace('#', '').trim().toLowerCase();
    if (
      paramPortal === 'officer' ||
      hashPortal === 'officer' ||
      pathSlug === '/officer' ||
      pathSlug === '/underwriting-cockpit' ||
      pathSlug === '/portfolio' ||
      pathSlug === '/model-accuracy' ||
      pathSlug === '/fairness-audit'
    ) {
      initialPortal = 'officer';
    }
    if (SLUG_TO_TAB[pathSlug]) {
      pendingInitialTab = SLUG_TO_TAB[pathSlug];
    }
    if (pathSlug === '/privacy' || pathSlug === '/terms' || pathSlug === '/grievance') {
      pendingPublicInfoSection = pathSlug.slice(1);
    }
    if (pathSlug === '/forgot-password') {
      pendingForgotPasswordModal = true;
    }
  } catch (e) {}
  window.switchPortalGateway(initialPortal, false);
  syncDocumentSeoAndBreadcrumbs(normalizeSlugPath(window.location.pathname));
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
    if (!isOfficer && (!state.siteAvailability || state.siteAvailability.online !== false) && email.toLowerCase() === 'applicant@rindristi.in' && password === 'Applicant@123') {
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
  return `rindristi_offline_queue_${currentAuthUser.id}`;
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
      if (res.status === 401) {
        const err = await res.json().catch(() => ({}));
        remaining.push(rec);
        writeOfflineQueue(remaining);
        handleApiAuthFailure(res, err);
        return;
      }
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
    localStorage.removeItem('rindristi_saved_apps');
  } catch (e) {}

  ['letter-modal', 'backend-info-modal', 'site-availability-modal', 'forgot-password-modal', 'settings-modal'].forEach(mid => {
    const modal = document.getElementById(mid);
    if (modal) modal.style.display = 'none';
  });
  document.body.classList.remove('letter-modal-open');

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

window.handleLogout = function(reason = 'manual') {
  const prevRole = currentAuthUser?.role || activePortal || 'applicant';
  const logoutHeaders = buildAuthHeaders();
  stopInactivityMonitor();
  try {
    fetch(`${state.apiBase}/api/auth/logout`, {
      method: 'POST',
      headers: logoutHeaders
    }).catch(() => {});
  } catch (e) {}

  currentAuthUser = null;
  currentAuthToken = null;
  pendingInitialTab = null;
  clearStoredAuthSession();

  resetWorkspaceState();
  activeUserSettings = getDefaultUserSettings('applicant');
  draftUserSettings = { ...activeUserSettings };
  applyVisualSettingsToDOM(activeUserSettings);
  restartAvailabilityPolling(20);
  syncSiteAvailabilityUI();
  if (state.siteAvailability && state.siteAvailability.online === false) {
    return;
  }

  const shell = document.getElementById('app-shell');
  const portal = document.getElementById('auth-portal');
  if (shell) shell.style.display = 'none';
  if (portal) portal.style.display = 'flex';
  window.switchPortalGateway(prevRole === 'officer' ? 'officer' : 'applicant', true);
  closeAllMobileMenus();
  syncVisibleH1Tag();
  if (reason === 'inactivity') {
    const expiredMsg = getLangDict().auth_session_expired_inactivity;
    window.showAuthAlert(expiredMsg, true);
    window.showRinDristiToast(expiredMsg, true);
  }
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
      if (currentAuthUser) {
        window.handleLogout();
      }
      window.switchPortalGateway(targetPortal);
      window.switchAuthTab(targetPortal);
      window.showAuthAlert(
        hi
          ? 'पासवर्ड सफलतापूर्वक बदल दिया गया! कृपया अपने नए पासवर्ड से साइन इन करें।'
          : 'Password reset successfully! Please sign in with your new password.',
        false
      );
      window.showRinDristiToast(
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
  const mobileVaultBtn = document.getElementById('mobile-drawer-vault-btn');
  if (mobileVaultBtn) {
    mobileVaultBtn.innerHTML = isOfficer ? dict.nav_vault_officer : dict.nav_vault_applicant;
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

function syncVisibleH1Tag() {
  const infoModal = document.getElementById('public-info-modal');
  const maintOverlay = document.getElementById('maintenance-overlay');
  const authPortal = document.getElementById('auth-portal');
  const appShell = document.getElementById('app-shell');

  const infoOpen = Boolean(infoModal && infoModal.style.display === 'flex');
  const maintVisible = Boolean(maintOverlay && maintOverlay.style.display !== 'none');
  const appVisible = Boolean(appShell && appShell.style.display !== 'none');
  const authVisible = Boolean(authPortal && authPortal.style.display !== 'none');

  let activeId = 'auth-hero-heading';
  if (infoOpen) {
    activeId = 'public-info-heading';
  } else if (maintVisible) {
    activeId = 'maint-title';
  } else if (appVisible) {
    activeId = 'workspace-page-heading';
  } else if (authVisible) {
    activeId = 'auth-hero-heading';
  }

  ['auth-hero-heading', 'maint-title', 'workspace-page-heading', 'public-info-heading'].forEach(id => {
    const wantTag = id === activeId ? 'h1' : 'h2';
    const el = document.getElementById(id);
    if (!el || el.tagName.toLowerCase() === wantTag) return;
    const nextEl = document.createElement(wantTag);
    Array.from(el.attributes).forEach(attr => nextEl.setAttribute(attr.name, attr.value));
    while (el.firstChild) nextEl.appendChild(el.firstChild);
    el.replaceWith(nextEl);
  });
}

function getWorkspaceHeaderKeys(tabId, isOfficer) {
  if (tabId === 'apply-view') return { titleKey: 'ws_apply_title', subKey: 'ws_apply_sub', crumbKey: 'ws_apply_crumb' };
  if (tabId === 'applicant-view') return { titleKey: 'ws_report_title', subKey: 'ws_report_sub', crumbKey: 'ws_report_crumb' };
  if (tabId === 'database-view') {
    return isOfficer
      ? { titleKey: 'ws_vault_off_title', subKey: 'ws_vault_off_sub', crumbKey: 'ws_vault_off_crumb' }
      : { titleKey: 'ws_vault_app_title', subKey: 'ws_vault_app_sub', crumbKey: 'ws_vault_app_crumb' };
  }
  if (tabId === 'officer-view') return { titleKey: 'ws_officer_title', subKey: 'ws_officer_sub', crumbKey: 'ws_officer_crumb' };
  if (tabId === 'portfolio-view') return { titleKey: 'ws_portfolio_title', subKey: 'ws_portfolio_sub', crumbKey: 'ws_portfolio_crumb' };
  if (tabId === 'model-view') return { titleKey: 'ws_model_title', subKey: 'ws_model_sub', crumbKey: 'ws_model_crumb' };
  if (tabId === 'fairness-view') return { titleKey: 'ws_fairness_title', subKey: 'ws_fairness_sub', crumbKey: 'ws_fairness_crumb' };
  return { titleKey: 'ws_apply_title', subKey: 'ws_apply_sub', crumbKey: 'ws_apply_crumb' };
}

function getSeoMetaForSlug(rawSlug) {
  const slug = normalizeSlugPath(rawSlug);
  const dict = getLangDict();
  const hi = state.currentLang === 'hi';
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';

  const map = {
    '/': {
      title: dict.page_title,
      desc: hi
        ? 'रिनदृष्टि फेयरलेंड एआई के साथ पारदर्शी खुदरा ऋण आवेदन, सिबिल एवं ईएमआई विश्लेषण और आरबीआई मुख्य तथ्य विवरण (KFS) प्राप्त करें।'
        : 'Transparent AI-powered retail loan underwriting, SHAP explainability, RBI Key Fact Statement (KFS), and fairness compliance under Mission Bharat.',
      crumb: dict.crumb_portal || 'Credit Gateway'
    },
    '/applicant': {
      title: hi ? 'आवेदक पोर्टल साइन इन • रिनदृष्टि फेयरलेंड एआई' : 'Applicant Loan Portal • RinDristi FairLend AI',
      desc: hi
        ? 'खुदरा ऋण आवेदन जमा करने, व्हाट-इफ ईएमआई सिम्युलेट करने और स्वीकृति पत्र डाउनलोड करने के लिए रिनदृष्टि आवेदक पोर्टल में साइन इन करें।'
        : 'Sign in or register as a borrower on RinDristi FairLend AI to apply for transparent retail credit, simulate approval scenarios, and download RBI KFS sanction letters.',
      crumb: dict.gw_applicant_title
    },
    '/officer': {
      title: hi ? 'ऋण अधिकारी संस्थागत लॉगिन • रिनदृष्टि फेयरलेंड एआई' : 'Loan Officer Portal • RinDristi FairLend AI',
      desc: hi
        ? 'रिनदृष्टि ऋण अधिकारी अंडरराइटिंग कॉकपिट, SHAP ऑडिट लॉग, केंद्रीय वॉल्ट और 80% नियम निष्पक्षता निगरानी टर्मिनल।'
        : 'Institutional login for authorized RinDristi Loan Officers to inspect underwriting SHAP waterfalls, manage sanctions, and audit 80% rule disparate impact fairness.',
      crumb: dict.gw_officer_title
    },
    '/apply': {
      title: hi ? 'खुदरा ऋण आवेदन • रिनदृष्टि फेयरलेंड एआई' : 'Apply for a Retail Loan • RinDristi FairLend AI',
      desc: hi
        ? 'आसान खुदरा ऋण आवेदन फॉर्म भरें और तुरंत एआई पात्रता विश्लेषण एवं आरबीआई अनुपालन रिकॉर्ड प्राप्त करें।'
        : 'Submit a transparent retail loan application for automated CIBIL evaluation, FOIR analysis, and instant underwriting storage in the RinDristi Vault.',
      crumb: dict.ws_apply_crumb
    },
    '/decision-report': {
      title: hi ? 'मेरी ऋण निर्णय रिपोर्ट और व्हाट-इफ सिम्युलेटर • रिनदृष्टि' : 'Decision Report & What-If Simulator • RinDristi FairLend AI',
      desc: hi
        ? 'अपनी व्यक्तिगत एक्सएआई निर्णय रिपोर्ट, व्हाट-इफ ईएमआई सिम्युलेटर और आरबीआई मुख्य तथ्य विवरण (KFS) देखें।'
        : 'Inspect personalized AI approval factors, interactive What-If counterfactual scenarios, and downloadable RBI Key Fact Statements.',
      crumb: dict.ws_report_crumb
    },
    '/vault': {
      title: isOfficer
        ? (hi ? 'केंद्रीय आवेदन वॉल्ट • रिनदृष्टि फेयरलेंड एआई' : 'Central Application Vault • RinDristi FairLend AI')
        : (hi ? 'मेरे आवेदन वॉल्ट • रिनदृष्टि फेयरलेंड एआई' : 'My Applications Vault • RinDristi FairLend AI'),
      desc: hi
        ? 'सभी जमा ऋण आवेदनों और अनुमोदन स्थिति का सुरक्षित डेटाबेस वॉल्ट तथा CSV/JSON निर्यात केंद्र।'
        : 'Persistent borrower and institutional loan application registry with live approval tracking, KFS access, and CSV/JSON exports.',
      crumb: isOfficer ? dict.ws_vault_off_crumb : dict.ws_vault_app_crumb
    },
    '/underwriting-cockpit': {
      title: hi ? 'अंडरराइटिंग कॉकपिट और SHAP विश्लेषण • रिनदृष्टि' : 'Underwriting Cockpit & SHAP Waterfall • RinDristi FairLend AI',
      desc: hi
        ? 'ऋण अधिकारियों के लिए लाइव SHAP लॉग-ऑड्स विश्लेषण, अनुमोदन निर्णय नियंत्रण और आरबीआई अनुपालन ऑडिट ट्रेल।'
        : 'Live loan officer underwriting workbench featuring additive SHAP feature attributions, sanction controls, and RBI audit trail logging.',
      crumb: dict.ws_officer_crumb
    },
    '/portfolio': {
      title: hi ? 'ऐतिहासिक ऋण पोर्टफोलियो • रिनदृष्टि फेयरलेंड एआई' : 'Historical Loan Portfolio Analytics • RinDristi FairLend AI',
      desc: hi
        ? 'ग्रामीण एवं महिला ऋण समावेशन के आंकड़ों के साथ भारत ऋण पूल का खोजने योग्य ऐतिहासिक पोर्टफोलियो।'
        : 'Search and audit historical retail lending pool records across rural, semi-urban, and urban demographics.',
      crumb: dict.ws_portfolio_crumb
    },
    '/model-accuracy': {
      title: hi ? 'मॉडल सटीकता एवं सत्यापन रिपोर्ट • रिनदृष्टि' : 'Model Accuracy & Validation Report • RinDristi FairLend AI',
      desc: hi
        ? 'नियमित लॉजिस्टिक रिग्रेशन क्रेडिट मॉडल के लिए होल्डआउट कन्फ्यूज़न मैट्रिक्स, प्रिसिज़न, रिकॉल और ROC-AUC रिपोर्ट।'
        : 'Holdout validation confusion matrix, precision, recall sensitivity, ROC-AUC score, and global feature weights for transparent governance.',
      crumb: dict.ws_model_crumb
    },
    '/fairness-audit': {
      title: hi ? 'निष्पक्षता एवं असमान प्रभाव ऑडिट • रिनदृष्टि' : 'Fairness Across Groups & 80% Rule Audit • RinDristi FairLend AI',
      desc: hi
        ? 'लिंग, क्षेत्र और शिक्षा समूहों में 80% (फोर-फिफ्थ्स) असमान प्रभाव अनुपात और TPR समता की जांच करें।'
        : 'Evaluate Disparate Impact Ratio (DIR) compliance against the 80% Four-Fifths Rule across gender, geography, and education groups.',
      crumb: dict.ws_fairness_crumb
    },
    '/privacy': {
      title: hi ? 'डेटा गोपनीयता एवं DPDP नीति • रिनदृष्टि फेयरलेंड एआई' : 'Data Privacy & DPDP Policy • RinDristi FairLend AI',
      desc: hi
        ? 'DPDP अधिनियम 2023 और RBI डिजिटल लेंडिंग दिशानिर्देशों के अंतर्गत एन्क्रिप्शन और उधारकर्ता डेटा सुरक्षा मानक।'
        : 'Learn how RinDristi FairLend AI protects borrower identity, financial disclosures, and encrypted vault logs under India DPDP Act 2023 and RBI Digital Lending Directions.',
      crumb: dict.foot_link_privacy
    },
    '/terms': {
      title: hi ? 'खुदरा ऋण एवं उपयोग की शर्तें • रिनदृष्टि फेयरलेंड एआई' : 'Terms of Lending & Disclosures • RinDristi FairLend AI',
      desc: hi
        ? 'पारदर्शी APR गणना, 3-दिवसीय कूलिंग-ऑफ अवधि और निष्पक्ष ऋण प्रथाओं की प्रमुख शर्तें पढ़ें।'
        : 'Review fair lending terms, transparent Key Fact Statement pricing policies, 3-day cooling-off rights, and institutional audit terms.',
      crumb: dict.foot_link_terms
    },
    '/grievance': {
      title: hi ? 'RBI ग्राहक शिकायत निवारण • रिनदृष्टि फेयरलेंड एआई' : 'RBI Grievance Redressal & Ombudsman • RinDristi FairLend AI',
      desc: hi
        ? 'रिनदृष्टि फेयरलेंड एआई नोडल शिकायत अधिकारी और भारतीय रिज़र्व बैंक एकीकृत लोकपाल (14448) संपर्क विवरण।'
        : 'Contact the Principal Nodal Grievance Redressal Officer (1800-209-4000 / grievance.bharat@rindristi.fin) or escalate via RBI Ombudsman helpline 14448.',
      crumb: dict.foot_link_grievance
    },
    '/forgot-password': {
      title: hi ? 'ईमेल OTP द्वारा पासवर्ड रीसेट • रिनदृष्टि फेयरलेंड एआई' : 'Reset Portal Password via Email OTP • RinDristi FairLend AI',
      desc: hi
        ? 'अपने पंजीकृत आवेदक या ऋण अधिकारी ईमेल पर 6-अंकीय सुरक्षा OTP प्राप्त करके पासवर्ड रीसेट करें।'
        : 'Recover your RinDristi FairLend AI applicant or officer account securely using a 6-digit email OTP verification code.',
      crumb: dict.link_forgot_pwd
    }
  };
  return map[slug] || map['/'];
}

function updateWorkspaceHeaderUI(tabId) {
  const dict = getLangDict();
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  const keys = getWorkspaceHeaderKeys(tabId || state.currentTab, isOfficer);
  const titleEl = document.getElementById('workspace-page-heading');
  const subEl = document.getElementById('workspace-page-sub');
  if (titleEl) {
    titleEl.setAttribute('data-i18n', keys.titleKey);
    if (dict[keys.titleKey]) titleEl.innerText = dict[keys.titleKey];
  }
  if (subEl) {
    subEl.setAttribute('data-i18n', keys.subKey);
    if (dict[keys.subKey]) subEl.innerText = dict[keys.subKey];
  }
}

function renderBreadcrumbs(slug) {
  const dict = getLangDict();
  const homeLbl = dict.crumb_home || 'Home';
  const meta = getSeoMetaForSlug(slug);
  const infoModal = document.getElementById('public-info-modal');
  const infoOpen = Boolean(infoModal && infoModal.style.display === 'flex');

  const parts = [`<a href="/" onclick="handleSlugLinkClick(event, '/')">${escapeHtml(homeLbl)}</a>`];
  if (slug !== '/') {
    if (SLUG_TO_TAB[slug]) {
      const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
      const secLbl = isOfficer ? dict.gw_officer_title : dict.gw_applicant_title;
      const secSlug = isOfficer ? '/officer' : '/applicant';
      parts.push(`<span class="breadcrumb-sep">/</span><a href="${secSlug}" onclick="handleSlugLinkClick(event, '${secSlug}')">${escapeHtml(secLbl)}</a>`);
    }
    parts.push(`<span class="breadcrumb-sep">/</span><span aria-current="page" class="breadcrumb-current">${escapeHtml(meta.crumb)}</span>`);
  } else {
    const portalLbl = activePortal === 'officer' ? dict.gw_officer_title : dict.gw_applicant_title;
    parts.push(`<span class="breadcrumb-sep">/</span><span aria-current="page" class="breadcrumb-current">${escapeHtml(portalLbl)}</span>`);
  }

  const pubBar = document.getElementById('public-breadcrumbs');
  if (pubBar) pubBar.innerHTML = parts.join('');
  if (!infoOpen) {
    const appBar = document.getElementById('app-breadcrumbs');
    if (appBar) appBar.innerHTML = parts.join('');
  }
}

function syncDocumentSeoAndBreadcrumbs(explicitSlug = null) {
  const rawSlug = explicitSlug || normalizeSlugPath(window.location.pathname);
  const infoModal = document.getElementById('public-info-modal');
  const infoOpen = Boolean(infoModal && infoModal.style.display === 'flex');
  let activeSlug = rawSlug;
  if (!explicitSlug && currentAuthUser && !infoOpen) {
    activeSlug = TAB_TO_SLUG[state.currentTab] || rawSlug;
  }
  const meta = getSeoMetaForSlug(activeSlug);
  document.title = meta.title;

  const setMetaAttr = (selector, attr, value) => {
    const node = document.querySelector(selector);
    if (node && value) node.setAttribute(attr, value);
  };

  const origin = (window.location && window.location.origin && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'https://meridian-fairlend-production.up.railway.app';
  const canonicalUrl = `${origin}${activeSlug === '/' ? '/' : activeSlug}`;

  setMetaAttr('meta[name="description"]', 'content', meta.desc);
  setMetaAttr('link[rel="canonical"]', 'href', canonicalUrl);
  setMetaAttr('meta[property="og:title"]', 'content', meta.title);
  setMetaAttr('meta[property="og:description"]', 'content', meta.desc);
  setMetaAttr('meta[property="og:url"]', 'content', canonicalUrl);
  setMetaAttr('meta[name="twitter:title"]', 'content', meta.title);
  setMetaAttr('meta[name="twitter:description"]', 'content', meta.desc);

  const ldScript = document.getElementById('structured-data-jsonld');
  if (ldScript) {
    try {
      const ldObj = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': ['FinancialService', 'LocalBusiness'],
            '@id': `${origin}/#organization`,
            name: 'RinDristi FairLend AI',
            url: origin,
            image: `${origin}/icons/og-share.png`,
            logo: `${origin}/icons/icon-192.png`,
            description: meta.desc,
            telephone: '+91-1800-209-4000',
            email: 'grievance.bharat@rindristi.fin',
            priceRange: 'INR',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Nariman Point',
              addressLocality: 'Mumbai',
              addressRegion: 'MH',
              postalCode: '400021',
              addressCountry: 'IN'
            },
            areaServed: 'IN',
            sameAs: ['https://cms.rbi.org.in']
          },
          {
            '@type': 'WebPage',
            '@id': `${canonicalUrl}#webpage`,
            url: canonicalUrl,
            name: meta.title,
            description: meta.desc,
            inLanguage: state.currentLang === 'hi' ? 'hi-IN' : 'en-IN',
            isPartOf: { '@id': `${origin}/#organization` }
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
              ...(activeSlug !== '/' ? [{ '@type': 'ListItem', position: 2, name: meta.crumb, item: canonicalUrl }] : [])
            ]
          }
        ]
      };
      ldScript.textContent = JSON.stringify(ldObj);
    } catch (e) {}
  }

  renderBreadcrumbs(activeSlug);
  updateWorkspaceHeaderUI(state.currentTab);
  syncVisibleH1Tag();
}

window.closeAllMobileMenus = function() {
  [
    ['mobile-menu-toggle-auth', 'mobile-nav-drawer-auth'],
    ['mobile-menu-toggle-app', 'mobile-nav-drawer-app']
  ].forEach(([btnId, drawerId]) => {
    const btn = document.getElementById(btnId);
    const drawer = document.getElementById(drawerId);
    if (drawer) drawer.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
};

window.toggleMobileMenu = function(area = 'auth') {
  const isApp = area === 'app';
  const btnId = isApp ? 'mobile-menu-toggle-app' : 'mobile-menu-toggle-auth';
  const drawerId = isApp ? 'mobile-nav-drawer-app' : 'mobile-nav-drawer-auth';
  const drawer = document.getElementById(drawerId);
  const btn = document.getElementById(btnId);
  if (!drawer) return;
  const shouldOpen = drawer.style.display === 'none' || !drawer.style.display;
  window.closeAllMobileMenus();
  if (shouldOpen) {
    drawer.style.display = 'flex';
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
};

window.handleBrandLogoClick = function(e) {
  if (e) e.preventDefault();
  window.closeAllMobileMenus();
  window.closePublicInfoModal(false);
  if (currentAuthUser) {
    const isOfficer = currentAuthUser.role === 'officer';
    const homeTab = isOfficer ? 'officer-view' : 'apply-view';
    window.activateWorkspaceTab(homeTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  window.switchPortalGateway('applicant', false);
  if (window.history && typeof window.history.pushState === 'function') {
    try { window.history.pushState({ slug: '/' }, '', '/'); } catch (err) {}
  }
  syncDocumentSeoAndBreadcrumbs('/');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.openPublicInfoModal = function(section = 'privacy', pushUrl = true) {
  const hi = state.currentLang === 'hi';
  const key = ['privacy', 'terms', 'grievance'].includes(section) ? section : 'privacy';
  const modal = document.getElementById('public-info-modal');
  const titleEl = document.getElementById('public-info-heading');
  const bodyEl = document.getElementById('public-info-body');
  if (!modal || !bodyEl) return;

  modal.setAttribute('data-section', key);
  const contentMap = {
    privacy: {
      title: hi ? 'डेटा गोपनीयता एवं DPDP संरक्षण नीति (2026)' : 'Data Privacy & DPDP Act Protection Policy (2026)',
      html: hi
        ? `<p><strong>डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम 2023 एवं RBI डिजिटल लेंडिंग मानक:</strong> रिनदृष्टि फेयरलेंड एआई में आवेदकों द्वारा साझा की गई सभी पहचान और वित्तीय जानकारी एंड-टू-एंड एन्क्रिप्शन तथा PBKDF2-HMAC-SHA256 सुरक्षा के अंतर्गत सुरक्षित रहती है।</p>
           <ul>
             <li><strong>न्यूनतम डेटा संग्रह:</strong> केवल क्रेडिट पात्रता, DTI/FOIR अनुपात और KFS तैयार करने हेतु आवश्यक विवरण ही संसाधित किए जाते हैं।</li>
             <li><strong>शून्य तृतीय-पक्ष बिक्री:</strong> उधारकर्ता का संपर्क नंबर, सिबिल या आय डेटा किसी बाहरी विज्ञापनदाता को नहीं बेचा जाता।</li>
             <li><strong>गोपनीयता मास्क विकल्प:</strong> आप सेटिंग्स में जाकर किसी भी समय वॉल्ट गोपनीयता मास्क मोड चालू कर सकते हैं।</li>
           </ul>`
        : `<p><strong>DPDP Act 2023 &amp; RBI Digital Lending Directions Compliance:</strong> RinDristi FairLend AI processes borrower identity, monthly earnings, and bureau risk indicators under strict encryption and PBKDF2-HMAC-SHA256 credential protection.</p>
           <ul>
             <li><strong>Purpose Limitation:</strong> Submitted personal and household data is used strictly for automated XAI underwriting, Sanction / KFS generation, and statutory audit logs.</li>
             <li><strong>Zero Unauthorized Sharing:</strong> Applicant phone numbers, emails, and credit bureau checks are never sold or syndicated to third-party lead brokers.</li>
             <li><strong>Shared-Screen Protection:</strong> Enable Vault Privacy Mask Mode inside Settings to redact names inside shared browser workspaces.</li>
           </ul>`
    },
    terms: {
      title: hi ? 'पारदर्शी खुदरा ऋण शर्तें एवं KFS प्रकटीकरण' : 'Terms of Lending & RBI Key Fact Statement (KFS) Disclosures',
      html: hi
        ? `<p><strong>निष्पक्ष एवं पारदर्शी अंडरराइटिंग अनुबंध:</strong> प्रत्येक ऋण आवेदन को बिना किसी छिपे शुल्क के स्पष्ट SHAP व्याख्या और मानकीकृत मुख्य तथ्य विवरण (KFS) प्रदान किया जाता है।</p>
           <ul>
             <li><strong>शून्य प्रोसेसिंग एवं फोरक्लोज़र शुल्क:</strong> मिशन भारत रिटेल पहल के तहत आवेदन सत्यापन एवं पूर्व-भुगतान शुल्क ₹0 निर्धारित हैं।</li>
             <li><strong>3-दिवसीय कूलिंग-ऑफ अधिकार:</strong> स्वीकृति के 3 कार्य दिवसों के भीतर आवेदक बिना किसी दंड शुल्क के ऋण अनुबंध से बाहर निकल सकता है।</li>
             <li><strong>निष्पक्षता ऑडिट:</strong> ग्रामीण एवं महिला आवेदकों के साथ समान व्यवहार सुनिश्चित करने हेतु 80% असमान प्रभाव नियम की नियमित समीक्षा की जाती है।</li>
           </ul>`
        : `<p><strong>Transparent Retail Credit Framework:</strong> Every application evaluated through RinDristi FairLend AI includes itemized algorithmic explanations and a standardized RBI Key Fact Statement prior to sanction commitment.</p>
           <ul>
             <li><strong>Zero Hidden Processing Fees:</strong> Mission Bharat subsidized retail applications carry ₹0 upfront processing charges and ₹0 foreclosure penalties per RBI guidelines.</li>
             <li><strong>3-Day Cooling-Off / Look-Up Period:</strong> Borrowers retain the statutory right to exit a sanctioned facility within 3 business days with zero exit penalty.</li>
             <li><strong>Explainability &amp; Non-Discrimination:</strong> Institutional underwriters inspect Disparate Impact Ratios regularly to satisfy the 80% Fair Lending Rule.</li>
           </ul>`
    },
    grievance: {
      title: hi ? 'RBI ग्राहक शिकायत निवारण एवं लोकपाल सहायता' : 'RBI Grievance Redressal & Integrated Ombudsman Escalation',
      html: hi
        ? `<p><strong>नोडल शिकायत निवारण अधिकारी:</strong> श्रीमती शालिनी वर्मा, रिनदृष्टि फेयरलेंड एआई, नरीमन पॉइंट, मुंबई 400021। कार्य समय के दौरान त्वरित सहायता 15 कार्य दिवसों के भीतर सुनिश्चित की जाती है।</p>
           <ul>
             <li><strong>टोल-फ्री हेल्पलाइन:</strong> <a href="tel:18002094000" class="contact-link">1800-209-4000</a></li>
             <li><strong>आधिकारिक ईमेल:</strong> <a href="mailto:grievance.bharat@rindristi.fin" class="contact-link">grievance.bharat@rindristi.fin</a></li>
             <li><strong>RBI एकीकृत लोकपाल (30 दिन के उपरांत):</strong> <a href="tel:14448" class="contact-link">14448</a> पर कॉल करें या <a href="https://cms.rbi.org.in" target="_blank" rel="noopener noreferrer" class="contact-link">https://cms.rbi.org.in</a> पर शिकायत दर्ज करें।</li>
           </ul>`
        : `<p><strong>Principal Nodal Grievance Redressal Officer:</strong> Smt. Shalini Verma, RinDristi FairLend AI, Nariman Point, Mumbai 400021. Formal borrower complaints are acknowledged immediately with a 15-working-day SLA.</p>
           <ul>
             <li><strong>Toll-Free Borrower Helpline:</strong> <a href="tel:18002094000" class="contact-link">1800-209-4000</a></li>
             <li><strong>Dedicated Grievance Desk Email:</strong> <a href="mailto:grievance.bharat@rindristi.fin" class="contact-link">grievance.bharat@rindristi.fin</a></li>
             <li><strong>RBI Integrated Ombudsman Scheme (30-Day Escalation):</strong> Dial toll-free <a href="tel:14448" class="contact-link">14448</a> or file online at <a href="https://cms.rbi.org.in" target="_blank" rel="noopener noreferrer" class="contact-link">https://cms.rbi.org.in</a>.</li>
           </ul>`
    }
  };

  if (titleEl) titleEl.innerText = contentMap[key].title;
  bodyEl.innerHTML = contentMap[key].html;
  modal.style.display = 'flex';
  const targetSlug = `/${key}`;
  if (pushUrl && window.history && typeof window.history.pushState === 'function') {
    try { window.history.pushState({ slug: targetSlug }, '', targetSlug); } catch (e) {}
  }
  syncDocumentSeoAndBreadcrumbs(targetSlug);
};

window.closePublicInfoModal = function(restoreUrl = true) {
  const modal = document.getElementById('public-info-modal');
  if (modal) modal.style.display = 'none';
  if (restoreUrl) {
    const fallbackSlug = currentAuthUser
      ? (TAB_TO_SLUG[state.currentTab] || '/')
      : (activePortal === 'officer' ? '/officer' : '/');
    if (window.history && typeof window.history.replaceState === 'function') {
      try { window.history.replaceState({ slug: fallbackSlug }, '', fallbackSlug); } catch (e) {}
    }
    syncDocumentSeoAndBreadcrumbs(fallbackSlug);
  } else {
    syncVisibleH1Tag();
  }
};

window.handleSlugLinkClick = function(e, rawSlug) {
  if (e) e.preventDefault();
  window.closeAllMobileMenus();
  const slug = normalizeSlugPath(rawSlug);

  if (slug === '/privacy' || slug === '/terms' || slug === '/grievance') {
    window.openPublicInfoModal(slug.slice(1), true);
    return;
  }
  if (slug === '/forgot-password') {
    if (window.history && typeof window.history.pushState === 'function') {
      try { window.history.pushState({ slug: '/forgot-password' }, '', '/forgot-password'); } catch (err) {}
    }
    window.openForgotPassword(activePortal);
    syncDocumentSeoAndBreadcrumbs('/forgot-password');
    return;
  }

  window.closePublicInfoModal(false);

  if (slug === '/' || slug === '/applicant' || slug === '/officer') {
    if (currentAuthUser) {
      const isOfficer = currentAuthUser.role === 'officer';
      const wantOfficerHome = slug === '/officer' && isOfficer;
      const targetTab = (isOfficer || wantOfficerHome) ? 'officer-view' : 'apply-view';
      window.activateWorkspaceTab(targetTab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const targetPortal = slug === '/officer' ? 'officer' : 'applicant';
    syncPortalGatewayVisuals(targetPortal);
    window.switchAuthTab(targetPortal);
    if (window.history && typeof window.history.pushState === 'function') {
      try { window.history.pushState({ slug }, '', slug); } catch (err) {}
    }
    syncDocumentSeoAndBreadcrumbs(slug);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const mappedTab = SLUG_TO_TAB[slug];
  if (mappedTab) {
    if (currentAuthUser) {
      window.activateWorkspaceTab(mappedTab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    pendingInitialTab = mappedTab;
    const isOffTab = OFFICER_TABS.has(mappedTab) && mappedTab !== 'database-view';
    const targetPortal = isOffTab ? 'officer' : 'applicant';
    syncPortalGatewayVisuals(targetPortal);
    window.switchAuthTab(targetPortal);
    if (window.history && typeof window.history.pushState === 'function') {
      try { window.history.pushState({ slug }, '', slug); } catch (err) {}
    }
    syncDocumentSeoAndBreadcrumbs(slug);
    window.showAuthAlert(
      state.currentLang === 'hi'
        ? 'इस अनुभाग तक पहुंचने के लिए कृपया अपने खाते में साइन इन करें।'
        : 'Please sign in to access this workspace section.',
      false
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

window.activateWorkspaceTab = function(tabId, historyMode = 'push') {
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  const allowedTabs = isOfficer ? OFFICER_TABS : APPLICANT_TABS;
  let targetTab = tabId;
  if (!allowedTabs.has(targetTab)) {
    targetTab = isOfficer ? 'officer-view' : 'apply-view';
  }

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.getAttribute('data-tab') === targetTab);
  });
  document.querySelectorAll('#mobile-nav-drawer-app [data-mobile-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mobile-tab') === targetTab);
  });
  state.currentTab = targetTab;

  document.querySelectorAll('.tab-section').forEach(sec => {
    sec.style.display = 'none';
  });
  const activeSec = document.getElementById(targetTab);
  if (activeSec) activeSec.style.display = 'block';

  const targetSlug = TAB_TO_SLUG[targetTab] || '/';
  if (historyMode !== 'none' && window.history && window.location) {
    try {
      const currSlug = normalizeSlugPath(window.location.pathname);
      const infoModal = document.getElementById('public-info-modal');
      const infoOpen = Boolean(infoModal && infoModal.style.display === 'flex');
      if (!infoOpen && currSlug !== targetSlug) {
        if (historyMode === 'replace' && typeof window.history.replaceState === 'function') {
          window.history.replaceState({ slug: targetSlug }, '', targetSlug);
        } else if (typeof window.history.pushState === 'function') {
          window.history.pushState({ slug: targetSlug }, '', targetSlug);
        }
      }
    } catch (e) {}
  }

  syncDocumentSeoAndBreadcrumbs(targetSlug);

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
  clearInlineAlert('officer-action-alert');
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
    phone: rec.phone || rec.contact_phone || '',
    applicant_email: rec.applicant_email || rec.email || '',
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
    created_at: rec.created_at || '',
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
    localStorage.setItem('rindristi_auth_user', JSON.stringify(user));
    if (token) localStorage.setItem('rindristi_auth_token', token);
  } catch (e) {}
  recordUserActivity(true);
  startInactivityMonitor();

  resetWorkspaceState();
  activeUserSettings = loadUserSettings(user);
  draftUserSettings = { ...activeUserSettings };
  applyUserSettingsToApp(activeUserSettings, { renderTables: false });

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
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';

    document.querySelectorAll('.nav-officer-item').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.nav-applicant-item').forEach(el => { el.style.display = 'flex'; });
    document.querySelectorAll('.nav-shared-vault').forEach(el => { el.style.display = 'flex'; });
    const backupBtn = document.getElementById('btn-download-sqlite-backup');
    if (backupBtn) backupBtn.style.display = 'none';

    applyApplicationFormDefaultsFromSettings(activeUserSettings);
    updateAuthRoleUI();
    updateBackendStatusUI();
    applyTranslations();
    syncSiteAvailabilityUI();
    const chosenAppTab = (pendingInitialTab && APPLICANT_TABS.has(pendingInitialTab))
      ? pendingInitialTab
      : (APPLICANT_TABS.has(activeUserSettings.applicantStartTab) ? activeUserSettings.applicantStartTab : 'apply-view');
    pendingInitialTab = null;
    window.activateWorkspaceTab(chosenAppTab, 'replace');

    if (activeUserSettings.autoSyncOffline !== false) {
      await syncPendingOfflineApplications();
    }
    await window.refreshDatabaseTable();
    if (state.savedDatabaseApps.length > 0) {
      applyRecordToCurrentState(state.savedDatabaseApps[0]);
    } else {
      state.hasApplied = false;
      updateUI();
      updateSimulationUI();
    }
    applyUserSettingsToApp(activeUserSettings, { renderTables: false });
  } else {
    document.querySelectorAll('.nav-applicant-item').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.nav-officer-item').forEach(el => { el.style.display = 'flex'; });
    document.querySelectorAll('.nav-shared-vault').forEach(el => { el.style.display = 'flex'; });
    const backupBtn = document.getElementById('btn-download-sqlite-backup');
    if (backupBtn) backupBtn.style.display = 'inline-flex';

    state.portfolioPageSize = Number(activeUserSettings.portfolioPageSize || 10);
    state.affirmativeMode = Boolean(activeUserSettings.defaultAffirmativeMode);
    const affToggle = document.getElementById('affirmative-toggle');
    if (affToggle) affToggle.checked = state.affirmativeMode;

    updateAuthRoleUI();
    updateBackendStatusUI();
    applyTranslations();
    syncSiteAvailabilityUI();
    applyUserSettingsToApp(activeUserSettings, { renderTables: false });
    const chosenOfficerTab = (pendingInitialTab && OFFICER_TABS.has(pendingInitialTab))
      ? pendingInitialTab
      : (OFFICER_TABS.has(activeUserSettings.officerStartTab) ? activeUserSettings.officerStartTab : 'officer-view');
    pendingInitialTab = null;
    window.activateWorkspaceTab(chosenOfficerTab, 'replace');

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
  let expiredNotice = false;
  try {
    const stored = localStorage.getItem('rindristi_auth_user');
    const token = localStorage.getItem('rindristi_auth_token');
    const lastActRaw = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    if (stored) {
      if (lastActRaw && (Date.now() - Number(lastActRaw)) >= SESSION_IDLE_TIMEOUT_MS) {
        clearStoredAuthSession();
        expiredNotice = true;
      } else {
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
                const verifyErr = await verifyRes.json().catch(() => ({}));
                clearStoredAuthSession();
                currentAuthUser = null;
                currentAuthToken = null;
                activeUserSettings = getDefaultUserSettings('applicant');
                draftUserSettings = { ...activeUserSettings };
                applyVisualSettingsToDOM(activeUserSettings);
                syncSiteAvailabilityUI();
                if (verifyRes.status === 401 && verifyErr && verifyErr.session_expired) {
                  const expiredMsg = getLangDict().auth_session_expired_inactivity;
                  window.showAuthAlert(expiredMsg, true);
                  window.showRinDristiToast(expiredMsg, true);
                }
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
    }
  } catch (e) {}

  syncSiteAvailabilityUI();
  if (expiredNotice) {
    const expiredMsg = getLangDict().auth_session_expired_inactivity;
    window.showAuthAlert(expiredMsg, true);
    window.showRinDristiToast(expiredMsg, true);
  }
};

window.showRinDristiToast = function(msg, isError = false) {
  if (!isError && activeUserSettings && activeUserSettings.showToasts === false) return;
  const container = document.getElementById('rindristi-toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `rindristi-toast${isError ? ' error' : ''}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4200);
};

function showToast(msg, isError = false) {
  window.showRinDristiToast(msg, isError);
}

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
  if (typeof updateSettingsModalStatusUI === 'function') {
    updateSettingsModalStatusUI();
  }
  syncVisibleH1Tag();
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
          window.showRinDristiToast(
            data.online
              ? (hi ? '🟢 वेबसाइट ऑनलाइन है और सक्रिय है।' : '🟢 Website is ONLINE and ready.')
              : (hi ? '🔴 वेबसाइट वर्तमान में ऑफ़लाइन (रखरखाव मोड) में है।' : '🔴 Website is currently OFFLINE (Maintenance Mode).'),
            !data.online
          );
        } else if (wasOffline && data.online) {
          window.showRinDristiToast(hi ? '🟢 वेबसाइट पुनः ऑनलाइन हो गई है!' : '🟢 Website is back ONLINE!');
        }
        return data;
      }
    }
  } catch (e) {
    if (isManual) window.showRinDristiToast(hi ? 'स्थिति जांच विफल: सर्वर अभी उपलब्ध नहीं है।' : 'Checking status... server unreachable right now.', true);
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
  return window.setWebsiteOnlineState(!currentlyOnline);
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
    if (handleApiAuthFailure(res, data)) {
      return false;
    }
    if (!res.ok || !data.success) {
      window.showRinDristiToast(data.error || (hi ? 'वेबसाइट स्थिति अपडेट करने में त्रुटि।' : 'Failed to update website availability.'), true);
      return false;
    }

    state.siteAvailability = data;
    syncSiteAvailabilityUI();
    window.closeSiteAvailabilityModal();
    window.showRinDristiToast(
      data.online
        ? (hi ? '🟢 वेबसाइट अब ऑनलाइन और सार्वजनिक रूप से उपलब्ध है।' : '🟢 Website is now ONLINE & publicly accessible.')
        : (hi ? '🔴 वेबसाइट अब ऑफ़लाइन (सार्वजनिक रखरखाव मोड सक्रिय) है।' : '🔴 Website is now OFFLINE (Public Maintenance Mode active).'),
      !data.online
    );
    return true;
  } catch (e) {
    window.showRinDristiToast(hi ? 'वेबसाइट स्थिति अपडेट करने में नेटवर्क त्रुटि।' : 'Network error updating website status.', true);
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
      window.showRinDristiToast(hi ? '🛡️ अधिकारी सत्यापन सफल। वेबसाइट ऑनलाइन करने के लिए ऊपर दिए गए बैनर का उपयोग करें।' : '🛡️ Officer authenticated. Use the banner above to bring the website Online.');
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
    page_title: "RinDristi FairLend AI • MISSION BHARAT | Explainable Loan Decision System",
    lang_btn: "🇮🇳 हिन्दी (Hindi)",
    title_lang_btn: "Bilingual Language Switcher",
    brand_title: "RinDristi FairLend AI",
    brand_badge: "Mission Bharat",
    brand_sub: "AI-Powered Explainable Lending & Demographic Equity Platform",
    maint_header_pill: "WEBSITE OFFLINE",
    maint_card_badge: "SCHEDULED MAINTENANCE • PORTAL OFFLINE",
    default_maint_title: DEFAULT_OFFLINE_TITLE_EN,
    default_maint_msg: DEFAULT_OFFLINE_MSG_EN,
    maint_meta_default: "Managed by RinDristi Institutional Operations",
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
    ph_off_email: "officer@domain.in",
    lbl_officer_pwd: "Officer Password",
    btn_signin_officer: "Sign In as Loan Officer",
    auth_officer_security_title: "Authorized Institutional Portal",
    auth_officer_security_note: "Officer login requires verified bank credentials issued by your branch administrator. Protected by sliding-window brute-force defense.",
    lbl_su_name: "Full Name",
    ph_su_name: "Enter full name",
    lbl_off_su_name: "Officer Full Name",
    ph_off_name: "Enter officer full name",
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
    sub_banner_desc: "Stored securely in RinDristi Vault. Review your instant underwriting report below:",
    btn_dl_sanction: "Download Sanction Letter",
    btn_dismiss: "Dismiss",
    hero_gauge_lbl: "Automated Approval Likelihood",
    hero_baseline_lbl: "Approval Baseline: ≥ 50%",
    apply_eyebrow: "Mission Bharat • Direct Borrower Application Portal",
    apply_heading: "Submit a Retail Loan Application",
    apply_subheading: "Fill in your personal profile, monthly earnings, CIBIL score, and requested facility. Your application is automatically analyzed by AI and permanently recorded in the RinDristi Application Vault & Registry.",
    apply_storage_lbl: "Storage Engine",
    apply_storage_val: "Secure Application Vault",
    apply_suc_title: "Application Successfully Saved in Database!",
    apply_suc_ref_prefix: "Your application has been assigned Reference ID",
    apply_suc_ref_suffix: "and recorded permanently in the RinDristi Vault.",
    apply_suc_status_lbl: "Status:",
    apply_suc_score_lbl: "AI Score:",
    apply_suc_emi_lbl: "Monthly EMI:",
    apply_suc_cibil_lbl: "CIBIL Tier:",
    btn_view_decision_report: "View My Decision Report",
    btn_view_my_vault: "View My Applications Vault",
    sec_personal: "1. Personal & Demographic Profile",
    lbl_name: "Full Name of Applicant *",
    ph_fill_name: "Enter applicant full name",
    lbl_phone: "Contact Mobile Number *",
    ph_fill_phone: "Enter 10-digit mobile number",
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
    ph_loan_amount: "Enter loan amount (INR)",
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
    rbi_consent_html: '<strong>Statutory Borrower Declaration (CICRA 2005 &amp; DPDP Act 2023):</strong> I hereby grant explicit consent to <strong>RinDristi FairLend AI</strong> under <strong>Mission Bharat</strong> to access my credit bureau history (CIBIL/CRIF) and process my personal data locally in accordance with the <strong>RBI Digital Lending Directions 2022</strong>. I acknowledge that all underwriting decisions are non-discriminatory, transparent, explainable (XAI), and subject to a statutory <strong>3-Day Look-Up / Cooling-Off Period</strong> without exit penalty.',
    apply_footer_note: "🔒 Guaranteed Data Encryption • Stored in RinDristi Vault • Auditable under RBI Fair Practices Code",
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
    approved_desc: "Your credit and financial profile comfortably satisfies RinDristi Mission Bharat underwriting benchmarks.",
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
    ph_off_ref_name: "Enter applicant full name",
    ph_officer_remarks: "Enter official underwriting remarks and justification...",
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
    ph_portfolio_search: "Search by Loan ID, territory, or profile...",
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
    db_title: "Official RinDristi Application Vault & Registry",
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
    footer_disclaimer: "© 2026 RinDristi FairLend. Operating in compliance with the Reserve Bank of India (RBI) Regulatory Framework for Digital Lending.",
    let_bank_name: "RINDRISTI FAIRLEND AI",
    let_division: "Mission Bharat • Inclusive Retail Credit Division",
    let_office: "Reg. Office: Nariman Point, Mumbai 400021 • RBI Reg #N-13.01928",
    let_ref_lbl: "Reference:",
    let_submitted_lbl: "Submitted Date:",
    let_date_lbl: "Decision Date:",
    let_app_name_lbl: "Applicant Name:",
    let_fac_lbl: "Requested Facility:",
    let_tenure_lbl: "Tenure:",
    let_purpose_lbl: "Facility Purpose:",
    let_area_lbl: "Territory:",
    let_emp_lbl: "Employment & Verification:",
    let_income_lbl: "Household Monthly Income:",
    let_cibil_lbl: "CIBIL Bureau Score:",
    let_ai_score_lbl: "AI Eligibility Score:",
    let_officer_status_lbl: "Officer Review Status:",
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
    adv_title: "APPLICATION UNDERWRITING SUMMARY (NO FACILITY SANCTIONED)",
    adv_badge: "RBI Fair Lending Disclosure",
    adv_row_requested: "Requested Loan Facility",
    adv_row_sanctioned: "Sanctioned Principal Amount",
    adv_row_cibil: "CIBIL Bureau Assessment (Benchmark ≥ 650)",
    adv_row_dti: "Obligation Ratio (Prudential Ceiling ≤ 45%)",
    adv_row_score: "Composite AI Eligibility Score (Pass ≥ 65%)",
    adv_row_reapply: "Re-Application & Review Window",
    let_factors_heading: "Transparent Factor Determination (Under RBI Fair Lending Code):",
    let_sig_verify_title: "Electronic Underwriting Record • Tamper-Evident Audit",
    let_sig_verify_sub: "Valid digital statement generated directly from the RinDristi Central Application Vault.",
    let_sig_auth_lbl: "Issuing Authority",
    let_ombudsman_html: '<strong>RBI Fair Practices Code &amp; Statutory Redressal Mechanism:</strong><br>• <strong>Principal Grievance Redressal Officer:</strong> Smt. Shalini Verma, Nodal Grievance Officer, RinDristi FairLend AI, Nariman Point, Mumbai 400021. Toll-Free: <a href="tel:18002094000" style="color: #064E3B; font-weight: 700;">1800-209-4000</a> | Email: <a href="mailto:grievance.bharat@rindristi.fin" style="color: #064E3B; font-weight: 700;">grievance.bharat@rindristi.fin</a> (Resolution SLA: within 15 working days).<br>• <strong>RBI Integrated Ombudsman Scheme:</strong> If your grievance is not redressed within 30 days, you have the statutory right under the Reserve Bank of India Integrated Ombudsman Scheme, 2021 to lodge a complaint online at <strong><a href="https://cms.rbi.org.in" target="_blank" rel="noopener noreferrer" style="color: #064E3B; font-weight: 700; text-decoration: underline;">https://cms.rbi.org.in</a></strong> or dial toll-free <a href="tel:14448" style="color: #064E3B; font-weight: 700;">14448</a>.',
    btn_print_pdf: "Print / Save PDF",
    btn_close: "Close",
    modal_api_title: "FastAPI Backend Connection Hub",
    modal_api_origin: "Active REST API Origin",
    modal_api_status_lbl: "Status:",
    modal_api_docs_note: 'All authentication, underwriting scoring, SHAP explainability, and fairness checks communicate live with FastAPI (<a id="modal-swagger-link" href="/docs" target="_blank" rel="noopener noreferrer" style="color: #064E3B; font-weight: 700; text-decoration: underline;">OpenAPI /docs</a>).',
    modal_api_custom_t: "Connect Custom Internet Backend URL (Optional):",
    modal_api_custom_d: "If serving frontend separately, enter your deployed internet API base URL:",
    ph_custom_api: "https://api.example.com",
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
    otp_badge_pending: "Not Verified",
    otp_badge_verified: "✓ Verified",
    btn_send_otp: "Send OTP",
    btn_resend_otp: "Resend OTP",
    btn_verify_otp: "Verify OTP",
    ph_otp_code: "6-digit OTP",
    otp_hint_signup: "Click Send OTP to receive a 6-digit verification code in your inbox.",
    otp_hint_forgot: "Enter your registered email and click Send OTP to receive a recovery code.",
    otp_hint_email_change: "Verify your new email address via 6-digit OTP before saving the email change.",
    otp_hint_unconfigured: "Real Email OTP is not active yet: add BREVO_API_KEY + EMAIL_FROM in Railway Variables (free HTTPS API) to deliver inbox codes.",
    msg_profile_email_otp_required: "Please send and verify the 6-digit Email OTP sent to your new email address before changing your email.",
    auth_session_expired_inactivity: "Your session expired after 10 minutes of inactivity. Please sign in again.",
    fp_modal_title: "Reset Password via Email OTP",
    fp_lbl_email: "Registered Email Address",
    ph_fp_email: "name@domain.com",
    fp_lbl_otp: "6-Digit Email OTP",
    fp_lbl_new_pwd: "New Password (Min 8 chars, letter + digit)",
    fp_lbl_confirm_pwd: "Confirm New Password",
    fp_btn_submit: "Verify & Reset Password",
    btn_settings: "Settings",
    title_settings_btn: "Customize Website & Workspace Settings",
    settings_modal_title: "Website & Workspace Settings",
    settings_modal_sub: "Tailored to your account profile, readability, and workflow",
    settings_cloud_checking: "Checking Sync...",
    settings_btn_reset_pwd: "Reset Password (OTP)",
    settings_sec_identity: "Account Identity (Name & Email)",
    settings_sec_identity_desc: "Update your registered full name and sign-in email for this portal account.",
    settings_lbl_fullname: "Full Name",
    settings_ph_fullname: "Enter your full name",
    settings_lbl_email: "Email Address",
    settings_ph_email: "name@domain.com",
    settings_btn_update_identity: "Update Name & Email",
    settings_sec_appearance: "Website Appearance, Display & Notifications",
    settings_sec_appearance_desc: "Customize visual theme, typography size, layout spacing, and alert behavior.",
    settings_lbl_theme: "Color Theme Palette",
    theme_classic: "Bharat Emerald",
    theme_mint: "Clean White Mint",
    theme_slate: "Banking Slate",
    theme_midnight: "Midnight Dark",
    settings_lbl_font: "Text Readability Scale",
    font_opt_compact: "Compact (92%)",
    font_opt_normal: "Standard (100%)",
    font_opt_large: "Large Comfort (110%)",
    font_opt_xl: "Extra Large (118%)",
    settings_lbl_density: "Interface Layout Density",
    density_comfortable: "Comfortable Spacing",
    density_compact: "Compact Dense View",
    settings_sw_contrast: "High-Contrast Borders & Focus Rings",
    settings_sw_contrast_sub: "Enhances input outlines, table borders, and button edges for clarity",
    settings_sw_motion: "Reduce Motion & Transitions",
    settings_sw_motion_sub: "Disables subtle animations across tabs, cards, and progress gauges",
    settings_sw_toasts: "Pop-Up Notification Banners",
    settings_sw_toasts_sub: "Show informational toast banners (critical error alerts remain active)",
    settings_sw_privacy: "Vault Privacy Mask Mode",
    settings_sw_privacy_sub: "Masks full borrower names inside Application Vault tables on shared screens",
    settings_sec_applicant: "Applicant Preferences & Application Defaults",
    settings_sec_applicant_desc: "Pre-configure your default portal screen, loan form presets, and report widgets.",
    settings_lbl_app_tab: "Default Page After Sign-In",
    settings_opt_tab_apply: "1. Apply for a Loan",
    settings_opt_tab_report: "2. My Decision Report",
    settings_opt_tab_app_vault: "3. My Applications Vault",
    settings_lbl_def_area: "Preferred Residence Territory",
    settings_lbl_def_tenure: "Default Loan Form Tenure",
    settings_ten_5: "5 Years (60 Months)",
    settings_ten_10: "10 Years (120 Months)",
    settings_ten_15: "15 Years (180 Months)",
    settings_ten_20: "20 Years (240 Months)",
    settings_ten_30: "30 Years (360 Months)",
    settings_lbl_def_purpose: "Preferred Loan Purpose",
    settings_sw_sim: 'Show "What-If" Counterfactual Simulator',
    settings_sw_sim_sub: "Interactive sliders to test tenure, CIBIL, and co-applicant scenarios",
    settings_sw_roadmap: "Show Personalized Eligibility Roadmap",
    settings_sw_roadmap_sub: "Actionable improvement steps rendered beneath your underwriting decision",
    settings_sw_autosync: "Auto-Sync Offline Queued Drafts",
    settings_sw_autosync_sub: "Automatically upload locally saved offline applications when back online",
    settings_offline_q_lbl: "Offline Pending Drafts:",
    settings_btn_clear_queue: "Clear Local Offline Queue",
    settings_sec_officer: "Officer Underwriting & Website Controls",
    settings_sec_officer_desc: "Configure cockpit workflow defaults, portfolio pagination, and site operations.",
    settings_lbl_off_tab: "Default Officer Landing Tab",
    settings_opt_tab_cockpit: "1. Underwriting Cockpit & SHAP Waterfall",
    settings_opt_tab_central_vault: "2. Central Application Vault",
    settings_opt_tab_portfolio: "3. Historical Portfolio",
    settings_opt_tab_model: "4. Model Accuracy Report",
    settings_opt_tab_fairness: "5. Fairness Across Groups",
    settings_lbl_page_size: "Historical Portfolio Rows Per Page",
    settings_rows_10: "10 Rows / Page",
    settings_rows_20: "20 Rows / Page",
    settings_rows_50: "50 Rows / Page",
    settings_rows_100: "100 Rows / Page",
    settings_sw_affirmative: "Enable Mission Bharat Fairness Calibration",
    settings_sw_affirmative_sub: "Applies affirmative rural financial inclusion weighting in Fairness Audits",
    settings_sw_site_banner: "Show Public Website Control Card in Cockpit",
    settings_sw_site_banner_sub: "Displays quick Online / Offline banner at top of Underwriting Cockpit",
    settings_public_status_lbl: "Public Portal:",
    settings_btn_toggle_site: "Toggle Online / Offline",
    settings_admin_tools_lbl: "Institutional Tools:",
    settings_btn_api_hub: "FastAPI Connection Hub",
    settings_sec_sync: "Live Cloud Sync & Background Refresh",
    settings_sec_sync_desc: "Control how frequently portal availability and cloud connection health refresh automatically.",
    settings_lbl_sync_freq: "Background Refresh Cadence",
    settings_sync_20: "Standard (Every 20 Seconds)",
    settings_sync_45: "Battery Saver (Every 45 Seconds)",
    settings_sync_0: "Manual Refresh Only",
    settings_btn_check_sync: "Test Connection Now",
    settings_btn_reset: "Reset to Defaults",
    settings_btn_save: "Save & Apply Settings",
    pub_nav_home: "Gateway",
    pub_nav_app: "Applicant Portal",
    pub_nav_off: "Officer Portal",
    pub_nav_grievance: "Grievance Desk",
    btn_menu: "Menu",
    title_mobile_menu: "Open Navigation Menu",
    crumb_home: "Home",
    crumb_portal: "Credit Gateway",
    foot_link_home: "Home",
    foot_link_app: "Applicant Portal",
    foot_link_off: "Officer Portal",
    foot_link_apply: "Apply for Loan",
    foot_link_report: "Decision Report",
    foot_link_vault: "Application Vault",
    foot_link_privacy: "Privacy Policy",
    foot_link_terms: "Terms of Lending",
    foot_link_grievance: "RBI Grievance Redressal",
    foot_link_sitemap: "Sitemap",
    foot_contact_html: 'Toll-Free: <a href="tel:18002094000" class="contact-link">1800-209-4000</a> &bull; RBI Ombudsman: <a href="tel:14448" class="contact-link">14448</a> &bull; Email: <a href="mailto:grievance.bharat@rindristi.fin" class="contact-link">grievance.bharat@rindristi.fin</a>',
    pub_info_badge: "RBI Regulatory Disclosure",
    ws_apply_title: "Apply for a Retail Loan",
    ws_apply_sub: "Submit your transparent retail credit application for instant XAI underwriting and persistent vault archiving.",
    ws_apply_crumb: "Apply for a Loan",
    ws_report_title: "My Decision Report & What-If Simulator",
    ws_report_sub: "Review itemized approval factors, test interactive counterfactual adjustments, and download RBI KFS notices.",
    ws_report_crumb: "My Decision Report",
    ws_vault_app_title: "My Submitted Applications Vault",
    ws_vault_app_sub: "Track live officer adjudication status, inspect reports, or export your archived retail loan applications.",
    ws_vault_app_crumb: "My Applications Vault",
    ws_vault_off_title: "Central Institutional Application Vault",
    ws_vault_off_sub: "Inspect borrower submissions across Mission Bharat, review AI scores, and export CSV/JSON/SQLite archives.",
    ws_vault_off_crumb: "Central Application Vault",
    ws_officer_title: "Underwriting Cockpit & SHAP Waterfall",
    ws_officer_sub: "Adjust underwriting variables, inspect marginal log-odds attribution, and record RBI-compliant sanction actions.",
    ws_officer_crumb: "Underwriting Cockpit",
    ws_portfolio_title: "Historical Bharat Lending Portfolio",
    ws_portfolio_sub: "Search, filter, and audit historical retail borrower files across urban, semi-urban, and rural demographics.",
    ws_portfolio_crumb: "Historical Portfolio",
    ws_model_title: "Model Accuracy & Holdout Validation",
    ws_model_sub: "Inspect calibrated logistic regression metrics, confusion matrix outcomes, and normalized global feature weights.",
    ws_model_crumb: "Model Accuracy Report",
    ws_fairness_title: "Demographic Fairness & 80% Rule Audit",
    ws_fairness_sub: "Evaluate Disparate Impact Ratio (DIR) compliance and toggle affirmative rural financial inclusion calibration.",
    ws_fairness_crumb: "Fairness Across Groups",
    nav_pub_home: "Home",
    nav_pub_applicant: "Applicant Portal",
    nav_pub_officer: "Officer Portal",
    nav_pub_support: "Support",
    foot_privacy: "Privacy Policy",
    foot_terms: "Terms of Service",
    foot_grievance: "Grievance Redressal",
    foot_sitemap: "Sitemap",
    mob_call_helpline: "Call Helpline: 1800-209-4000",
    mob_email_support: "Email: grievance.bharat@rindristi.fin",
    maint_help_html: 'Support Helpline: <a href="tel:18002094000" class="contact-link">1800-209-4000</a> &bull; Email: <a href="mailto:grievance.bharat@rindristi.fin" class="contact-link">grievance.bharat@rindristi.fin</a>'
  },
  hi: {
    page_title: "रिनदृष्टि फेयरलेंड एआई • मिशन भारत | पारदर्शी ऋण निर्णय प्रणाली",
    lang_btn: "🇬🇧 English",
    title_lang_btn: "द्विभाषी भाषा चयनकर्ता",
    brand_title: "रिनदृष्टि फेयरलेंड एआई (RinDristi FairLend AI)",
    brand_badge: "मिशन भारत",
    brand_sub: "एआई-संचालित पारदर्शी ऋण निर्णय एवं सामाजिक समानता मंच",
    maint_header_pill: "वेबसाइट ऑफ़लाइन",
    maint_card_badge: "निर्धारित रखरखाव • पोर्टल ऑफ़लाइन",
    default_maint_title: "पोर्टल अस्थायी रूप से ऑफ़लाइन है",
    default_maint_msg: "रिनदृष्टि फेयरलेंड एआई इस समय निर्धारित सिस्टम रखरखाव के लिए ऑफ़लाइन है। ऑनलाइन ऋण सेवाएं शीघ्र ही पुनः शुरू होंगी।",
    maint_meta_default: "रिनदृष्टि संस्थागत परिचालन द्वारा प्रबंधित",
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
    ph_off_email: "officer@domain.in",
    lbl_officer_pwd: "अधिकारी पासवर्ड",
    btn_signin_officer: "ऋण अधिकारी के रूप में साइन इन करें",
    auth_officer_security_title: "अधिकृत संस्थागत पोर्टल",
    auth_officer_security_note: "अधिकारी लॉगिन के लिए शाखा प्रशासक द्वारा जारी सत्यापित बैंक प्रमाण-पत्र आवश्यक हैं। यह स्लाइडिंग-विंडो सुरक्षा द्वारा रक्षित है।",
    lbl_su_name: "पूरा नाम",
    ph_su_name: "पूरा नाम दर्ज करें",
    lbl_off_su_name: "अधिकारी का पूरा नाम",
    ph_off_name: "अधिकारी का पूरा नाम दर्ज करें",
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
    sub_banner_desc: "रिनदृष्टि वॉल्ट में सुरक्षित दर्ज। नीचे अपनी त्वरित ऋण निर्णय रिपोर्ट देखें:",
    btn_dl_sanction: "स्वीकृति पत्र डाउनलोड करें",
    btn_dismiss: "बंद करें",
    hero_gauge_lbl: "स्वचालित स्वीकृति संभावना",
    hero_baseline_lbl: "स्वीकृति आधार सीमा: ≥ 50%",
    apply_eyebrow: "मिशन भारत • प्रत्यक्ष आवेदक ऋण पोर्टल",
    apply_heading: "खुदरा ऋण आवेदन पत्र जमा करें",
    apply_subheading: "अपना विवरण, मासिक आय, सिबिल स्कोर और वांछित ऋण राशि भरें। आपका आवेदन एआई द्वारा विश्लेषित होकर रिनदृष्टि सुरक्षित वॉल्ट एवं रजिस्ट्री में स्थायी रूप से दर्ज होगा।",
    apply_storage_lbl: "डेटा संग्रह इंजन",
    apply_storage_val: "सुरक्षित आवेदन वॉल्ट",
    apply_suc_title: "आवेदन डेटाबेस में सफलतापूर्वक सहेजा गया!",
    apply_suc_ref_prefix: "आपके आवेदन को संदर्भ संख्या",
    apply_suc_ref_suffix: "आवंटित की गई है और इसे रिनदृष्टि वॉल्ट में स्थायी रूप से दर्ज कर लिया गया है।",
    apply_suc_status_lbl: "स्थिति:",
    apply_suc_score_lbl: "AI स्कोर:",
    apply_suc_emi_lbl: "मासिक किस्त:",
    apply_suc_cibil_lbl: "सिबिल श्रेणी:",
    btn_view_decision_report: "मेरी निर्णय रिपोर्ट देखें",
    btn_view_my_vault: "मेरे आवेदन वॉल्ट देखें",
    sec_personal: "1. व्यक्तिगत एवं जनसांख्यिकीय विवरण",
    lbl_name: "आवेदक का पूरा नाम *",
    ph_fill_name: "आवेदक का पूरा नाम दर्ज करें",
    lbl_phone: "मोबाइल नंबर *",
    ph_fill_phone: "10 अंकों का मोबाइल नंबर दर्ज करें",
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
    ph_loan_amount: "ऋण राशि दर्ज करें (₹)",
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
    rbi_consent_html: '<strong>वैधानिक आवेदक घोषणा (CICRA 2005 एवं DPDP अधिनियम 2023):</strong> मैं <strong>मिशन भारत</strong> के तहत <strong>रिनदृष्टि फेयरलेंड एआई</strong> को <strong>RBI डिजिटल लेंडिंग दिशानिर्देश 2022</strong> के अनुरूप मेरा क्रेडिट ब्यूरो इतिहास (CIBIL/CRIF) जांचने और डेटा संसाधित करने की स्पष्ट सहमति देता/देती हूँ। मैं स्वीकार करता/करती हूँ कि सभी निर्णय गैर-भेदभावपूर्ण, पारदर्शी (XAI) हैं और बिना किसी दंड शुल्क के वैधानिक <strong>3 कार्य दिवस कूलिंग-ऑफ / समीक्षा अवधि</strong> के अधीन हैं।',
    apply_footer_note: "🔒 सुरक्षित डेटा एन्क्रिप्शन • रिनदृष्टि वॉल्ट में संग्रहीत • RBI फेयर प्रैक्टिसेज कोड के अंतर्गत ऑडिट योग्य",
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
    approved_desc: "आपका वित्तीय एवं क्रेडिट प्रोफाइल रिनदृष्टि मिशन भारत के ऋण मानकों के सर्वथा अनुकूल है।",
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
    ph_off_ref_name: "आवेदक का पूरा नाम दर्ज करें",
    ph_officer_remarks: "आधिकारिक अंडरराइटिंग टिप्पणी एवं औचित्य दर्ज करें...",
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
    ph_portfolio_search: "लोन आईडी, क्षेत्र या प्रोफ़ाइल द्वारा खोजें...",
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
    db_title: "आधिकारिक रिनदृष्टि आवेदन वॉल्ट एवं रजिस्ट्री",
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
    footer_disclaimer: "© 2026 रिनदृष्टि फेयरलेंड। भारतीय रिज़र्व बैंक (RBI) डिजिटल लेंडिंग दिशा-निर्देशों के पूर्णतः अनुपालन में संचालित।",
    let_bank_name: "रिनदृष्टि फेयरलेंड एआई (RINDRISTI FAIRLEND AI)",
    let_division: "मिशन भारत • समावेशी खुदरा ऋण प्रभाग",
    let_office: "पंजीकृत कार्यालय: नरीमन पॉइंट, मुंबई 400021 • RBI पंजीकरण #N-13.01928",
    let_ref_lbl: "संदर्भ संख्या:",
    let_submitted_lbl: "आवेदन दिनांक:",
    let_date_lbl: "निर्णय दिनांक:",
    let_app_name_lbl: "आवेदक का नाम:",
    let_fac_lbl: "वांछित ऋण राशि:",
    let_tenure_lbl: "ऋण अवधि:",
    let_purpose_lbl: "ऋण का उद्देश्य:",
    let_area_lbl: "निवास / संपत्ति क्षेत्र:",
    let_emp_lbl: "रोजगार व आय सत्यापन:",
    let_income_lbl: "कुल मासिक पारिवारिक आय:",
    let_cibil_lbl: "सिबिल क्रेडिट ब्यूरो स्कोर:",
    let_ai_score_lbl: "AI पात्रता स्कोर:",
    let_officer_status_lbl: "अधिकारी समीक्षा स्थिति:",
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
    adv_title: "आवेदन अंडरराइटिंग सारांश (कोई ऋण राशि स्वीकृत नहीं)",
    adv_badge: "RBI निष्पक्ष ऋण प्रकटीकरण",
    adv_row_requested: "अनुरोधित ऋण सुविधा",
    adv_row_sanctioned: "स्वीकृत मूलधन राशि",
    adv_row_cibil: "सिबिल ब्यूरो मूल्यांकन (मानक ≥ 650)",
    adv_row_dti: "दायित्व अनुपात (सुरक्षित सीमा ≤ 45%)",
    adv_row_score: "समग्र AI पात्रता स्कोर (उत्तीर्ण मानक ≥ 65%)",
    adv_row_reapply: "पुनः आवेदन एवं समीक्षा विकल्प",
    let_factors_heading: "पारदर्शी कारक निर्धारण (RBI निष्पक्ष ऋण संहिता के अंतर्गत):",
    let_sig_verify_title: "इलेक्ट्रॉनिक अंडरराइटिंग अभिलेख • छेड़छाड़-रोधी ऑडिट",
    let_sig_verify_sub: "रिनदृष्टि केंद्रीय आवेदन वॉल्ट से सीधे जनित मान्य डिजिटल विवरण।",
    let_sig_auth_lbl: "जारीकर्ता प्राधिकरण",
    let_ombudsman_html: '<strong>RBI फेयर प्रैक्टिसेज कोड एवं वैधानिक शिकायत निवारण प्रणाली:</strong><br>• <strong>प्रधान शिकायत निवारण अधिकारी:</strong> श्रीमती शालिनी वर्मा, नोडल शिकायत अधिकारी, रिनदृष्टि फेयरलेंड एआई, नरीमन पॉइंट, मुंबई 400021। टोल-फ्री: <a href="tel:18002094000" style="color: #064E3B; font-weight: 700;">1800-209-4000</a> | ईमेल: <a href="mailto:grievance.bharat@rindristi.fin" style="color: #064E3B; font-weight: 700;">grievance.bharat@rindristi.fin</a> (समाधान समय-सीमा: 15 कार्य दिवसों के भीतर)।<br>• <strong>RBI एकीकृत लोकपाल योजना:</strong> यदि आपकी शिकायत का समाधान 30 दिनों में नहीं होता है, तो आपको भारतीय रिज़र्व बैंक एकीकृत लोकपाल योजना, 2021 के अंतर्गत <strong><a href="https://cms.rbi.org.in" target="_blank" rel="noopener noreferrer" style="color: #064E3B; font-weight: 700; text-decoration: underline;">https://cms.rbi.org.in</a></strong> पर ऑनलाइन शिकायत दर्ज करने अथवा टोल-फ्री <a href="tel:14448" style="color: #064E3B; font-weight: 700;">14448</a> पर कॉल करने का वैधानिक अधिकार है।',
    btn_print_pdf: "प्रिंट / पीडीएफ सहेजें",
    btn_close: "बंद करें",
    modal_api_title: "FastAPI बैकएंड कनेक्शन हब",
    modal_api_origin: "सक्रिय REST API सर्वर पता",
    modal_api_status_lbl: "स्थिति:",
    modal_api_docs_note: 'सभी प्रमाणीकरण, अंडरराइटिंग स्कोरिंग, SHAP व्याख्या और निष्पक्षता जांच सीधे FastAPI सर्वर से जुड़े हैं (<a id="modal-swagger-link" href="/docs" target="_blank" rel="noopener noreferrer" style="color: #064E3B; font-weight: 700; text-decoration: underline;">OpenAPI /docs</a>)।',
    modal_api_custom_t: "कस्टम इंटरनेट बैकएंड URL जोड़ें (वैकल्पिक):",
    modal_api_custom_d: "यदि आप अलग फ्रंटएंड होस्ट उपयोग कर रहे हैं, तो अपना तैनात बैकएंड URL दर्ज करें:",
    ph_custom_api: "https://api.example.com",
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
    otp_badge_pending: "असत्यापित",
    otp_badge_verified: "✓ सत्यापित",
    btn_send_otp: "OTP भेजें",
    btn_resend_otp: "पुनः OTP भेजें",
    btn_verify_otp: "OTP सत्यापित करें",
    ph_otp_code: "6-अंकीय OTP",
    otp_hint_signup: "इनबॉक्स में 6-अंकीय सत्यापन कोड प्राप्त करने के लिए 'OTP भेजें' पर क्लिक करें।",
    otp_hint_forgot: "रिकवरी कोड प्राप्त करने के लिए अपना पंजीकृत ईमेल दर्ज करें और 'OTP भेजें' दबाएं।",
    otp_hint_email_change: "ईमेल बदलाव सहेजने से पहले अपने नए ईमेल पते पर 6-अंकीय OTP द्वारा सत्यापन करें।",
    otp_hint_unconfigured: "लाइव ईमेल OTP अभी सक्रिय नहीं है: इनबॉक्स कोड भेजने के लिए Railway Variables में BREVO_API_KEY + EMAIL_FROM (मुफ़्त HTTPS API) जोड़ें।",
    msg_profile_email_otp_required: "अपना ईमेल बदलने से पहले कृपया नए ईमेल पते पर भेजे गए 6-अंकीय ईमेल OTP को सत्यापित करें।",
    auth_session_expired_inactivity: "10 मिनट की निष्क्रियता के बाद आपका सत्र समाप्त हो गया है। कृपया पुनः साइन इन करें।",
    fp_modal_title: "ईमेल OTP द्वारा पासवर्ड रीसेट करें",
    fp_lbl_email: "पंजीकृत ईमेल पता",
    ph_fp_email: "name@domain.com",
    fp_lbl_otp: "6-अंकीय ईमेल OTP",
    fp_lbl_new_pwd: "नया पासवर्ड (न्यूनतम 8 अक्षर, अक्षर + अंक)",
    fp_lbl_confirm_pwd: "नए पासवर्ड की पुष्टि करें",
    fp_btn_submit: "OTP जांचें व पासवर्ड बदलें",
    btn_settings: "सेटिंग्स",
    title_settings_btn: "वेबसाइट और कार्यक्षेत्र सेटिंग्स अनुकूलित करें",
    settings_modal_title: "वेबसाइट एवं उपयोगकर्ता सेटिंग्स",
    settings_modal_sub: "आपकी भूमिका, पठनीयता और कार्यप्रणाली के अनुसार वैयक्तिकृत",
    settings_cloud_checking: "सिंक जांच जारी...",
    settings_btn_reset_pwd: "पासवर्ड रीसेट (OTP)",
    settings_sec_identity: "खाता पहचान (नाम एवं ईमेल)",
    settings_sec_identity_desc: "इस पोर्टल खाते के लिए अपना पंजीकृत पूरा नाम और साइन-इन ईमेल अपडेट करें।",
    settings_lbl_fullname: "पूरा नाम",
    settings_ph_fullname: "अपना पूरा नाम दर्ज करें",
    settings_lbl_email: "ईमेल पता",
    settings_ph_email: "name@domain.com",
    settings_btn_update_identity: "नाम और ईमेल अपडेट करें",
    settings_sec_appearance: "वेबसाइट रूप, फ़ॉन्ट आकार एवं सूचनाएं",
    settings_sec_appearance_desc: "रंग थीम, टेक्स्ट आकार, लेआउट घनत्व और अलर्ट व्यवहार चुनें।",
    settings_lbl_theme: "वेबसाइट रंग थीम",
    theme_classic: "भारत एमराल्ड",
    theme_mint: "स्वच्छ व्हाइट मिंट",
    theme_slate: "बैंकिंग स्लेट",
    theme_midnight: "नाइट डार्क मोड",
    settings_lbl_font: "टेक्स्ट पठनीयता आकार",
    font_opt_compact: "सघन (92%)",
    font_opt_normal: "मानक (100%)",
    font_opt_large: "बड़ा और स्पष्ट (110%)",
    font_opt_xl: "अति विशाल (118%)",
    settings_lbl_density: "इंटरफ़ेस स्पेसिंग घनत्व",
    density_comfortable: "आरामदायक स्पेसिंग",
    density_compact: "कॉम्पैक्ट सघन दृश्य",
    settings_sw_contrast: "उच्च-कंट्रास्ट बॉर्डर और फ़ोकस रिंग",
    settings_sw_contrast_sub: "स्पष्टता के लिए इनपुट, तालिका और बटन की रूपरेखा गहरी करता है",
    settings_sw_motion: "कम एनीमेशन (रिड्यूस्ड मोशन)",
    settings_sw_motion_sub: "टैब, कार्ड और प्रोग्रेस बार के ट्रांज़िशन को शांत रखता है",
    settings_sw_toasts: "पॉप-अप सूचना बैनर दिखाएं",
    settings_sw_toasts_sub: "सामान्य जानकारी बैनर दिखाएं (त्रुटि अलर्ट हमेशा सक्रिय रहेंगे)",
    settings_sw_privacy: "वॉल्ट गोपनीयता मास्क मोड",
    settings_sw_privacy_sub: "साझा स्क्रीन पर वॉल्ट तालिका में आवेदक का पूरा नाम छुपाता है",
    settings_sec_applicant: "आवेदक प्राथमिकताएं एवं डिफ़ॉल्ट विकल्प",
    settings_sec_applicant_desc: "लॉगिन के बाद शुरुआती पेज, फ़ॉर्म प्रीसेट और रिपोर्ट कार्ड नियंत्रित करें।",
    settings_lbl_app_tab: "लॉगिन के बाद डिफ़ॉल्ट पृष्ठ",
    settings_opt_tab_apply: "1. ऋण के लिए आवेदन करें",
    settings_opt_tab_report: "2. मेरी निर्णय रिपोर्ट",
    settings_opt_tab_app_vault: "3. मेरा आवेदन वॉल्ट",
    settings_lbl_def_area: "पसंदीदा निवास क्षेत्र",
    settings_lbl_def_tenure: "डिफ़ॉल्ट ऋण अवधि (वर्ष)",
    settings_ten_5: "5 वर्ष (60 माह)",
    settings_ten_10: "10 वर्ष (120 माह)",
    settings_ten_15: "15 वर्ष (180 माह)",
    settings_ten_20: "20 वर्ष (240 माह)",
    settings_ten_30: "30 वर्ष (360 माह)",
    settings_lbl_def_purpose: "पसंदीदा ऋण उद्देश्य",
    settings_sw_sim: '"व्हाट-इफ" सिम्युलेटर कार्ड दिखाएं',
    settings_sw_sim_sub: "अवधि, सिबिल और सह-आवेदक आय जांचने के लिए इंटरैक्टिव स्लाइडर",
    settings_sw_roadmap: "व्यक्तिगत पात्रता रोडमैप दिखाएं",
    settings_sw_roadmap_sub: "निर्णय रिपोर्ट के नीचे सुधार के स्पष्ट सुझाव दिखाता है",
    settings_sw_autosync: "ऑफ़लाइन ड्राफ्ट स्वतः सिंक करें",
    settings_sw_autosync_sub: "इंटरनेट जुड़ते ही स्थानीय ऑफ़लाइन आवेदन सर्वर पर अपलोड करें",
    settings_offline_q_lbl: "ऑफ़लाइन लंबित ड्राफ्ट:",
    settings_btn_clear_queue: "स्थानीय ऑफ़लाइन कतार साफ़ करें",
    settings_sec_officer: "अधिकारी कॉकपिट एवं वेबसाइट नियंत्रण",
    settings_sec_officer_desc: "अधिकारी कार्यक्षेत्र, पोर्टफ़ोलियो पृष्ठ आकार और सार्वजनिक वेबसाइट नियंत्रित करें।",
    settings_lbl_off_tab: "लॉगिन पर डिफ़ॉल्ट अधिकारी टैब",
    settings_opt_tab_cockpit: "1. अंडरराइटिंग कॉकपिट एवं SHAP",
    settings_opt_tab_central_vault: "2. केंद्रीय आवेदन वॉल्ट",
    settings_opt_tab_portfolio: "3. ऐतिहासिक पोर्टफ़ोलियो",
    settings_opt_tab_model: "4. मॉडल सटीकता रिपोर्ट",
    settings_opt_tab_fairness: "5. समूह-आधारित निष्पक्षता",
    settings_lbl_page_size: "पोर्टफ़ोलियो तालिका पंक्तियां (प्रति पृष्ठ)",
    settings_rows_10: "10 पंक्तियां / पृष्ठ",
    settings_rows_20: "20 पंक्तियां / पृष्ठ",
    settings_rows_50: "50 पंक्तियां / पृष्ठ",
    settings_rows_100: "100 पंक्तियां / पृष्ठ",
    settings_sw_affirmative: "मिशन भारत निष्पक्षता कैलिब्रेशन चालू करें",
    settings_sw_affirmative_sub: "निष्पक्षता ऑडिट में ग्रामीण समावेशन संतुलन लागू करता है",
    settings_sw_site_banner: "कॉकपिट में वेबसाइट स्थिति नियंत्रण कार्ड दिखाएं",
    settings_sw_site_banner_sub: "कॉकपिट के शीर्ष पर त्वरित ऑनलाइन / ऑफ़लाइन नियंत्रण दिखाता है",
    settings_public_status_lbl: "सार्वजनिक पोर्टल:",
    settings_btn_toggle_site: "ऑनलाइन / ऑफ़लाइन बदलें",
    settings_admin_tools_lbl: "संस्थागत उपकरण:",
    settings_btn_api_hub: "FastAPI कनेक्शन हब",
    settings_sec_sync: "लाइव क्लाउड सिंक एवं पृष्ठभूमि रिफ्रेश",
    settings_sec_sync_desc: "पोर्टल स्थिति और सर्वर कनेक्शन जांचने का समय अंतराल चुनें।",
    settings_lbl_sync_freq: "स्वतः रिफ्रेश अंतराल",
    settings_sync_20: "मानक (हर 20 सेकंड)",
    settings_sync_45: "बैटरी सेवर (हर 45 सेकंड)",
    settings_sync_0: "केवल मैन्युअल रिफ्रेश",
    settings_btn_check_sync: "अभी कनेक्शन जांचें",
    settings_btn_reset: "डिफ़ॉल्ट रीसेट करें",
    settings_btn_save: "सेटिंग्स सहेजें व लागू करें",
    pub_nav_home: "होम गेटवे",
    pub_nav_app: "आवेदक पोर्टल",
    pub_nav_off: "अधिकारी पोर्टल",
    pub_nav_grievance: "शिकायत निवारण",
    btn_menu: "मेनू",
    title_mobile_menu: "नेविगेशन मेनू खोलें",
    crumb_home: "होम",
    crumb_portal: "क्रेडिट गेटवे",
    foot_link_home: "होम",
    foot_link_app: "आवेदक पोर्टल",
    foot_link_off: "अधिकारी पोर्टल",
    foot_link_apply: "ऋण आवेदन करें",
    foot_link_report: "निर्णय रिपोर्ट",
    foot_link_vault: "आवेदन वॉल्ट",
    foot_link_privacy: "गोपनीयता नीति",
    foot_link_terms: "ऋण की शर्तें",
    foot_link_grievance: "RBI शिकायत निवारण",
    foot_link_sitemap: "साइटमैप",
    foot_contact_html: 'टोल-फ्री: <a href="tel:18002094000" class="contact-link">1800-209-4000</a> &bull; RBI लोकपाल: <a href="tel:14448" class="contact-link">14448</a> &bull; ईमेल: <a href="mailto:grievance.bharat@rindristi.fin" class="contact-link">grievance.bharat@rindristi.fin</a>',
    pub_info_badge: "RBI नियामक प्रकटीकरण",
    ws_apply_title: "खुदरा ऋण के लिए आवेदन करें",
    ws_apply_sub: "त्वरित XAI अंडरराइटिंग और स्थायी वॉल्ट संग्रहण के लिए अपना पारदर्शी खुदरा ऋण आवेदन जमा करें।",
    ws_apply_crumb: "ऋण आवेदन",
    ws_report_title: "मेरी निर्णय रिपोर्ट और व्हाट-इफ सिमुलेटर",
    ws_report_sub: "प्रमुख स्वीकृति कारकों की समीक्षा करें, इंटरैक्टिव विकल्प जांचें और RBI KFS सूचना पत्र डाउनलोड करें।",
    ws_report_crumb: "निर्णय रिपोर्ट",
    ws_vault_app_title: "मेरे जमा किए गए आवेदन वॉल्ट",
    ws_vault_app_sub: "अधिकारी समीक्षा की लाइव स्थिति ट्रैक करें, रिपोर्ट जांचें या CSV/JSON में डेटा निर्यात करें।",
    ws_vault_app_crumb: "मेरा आवेदन वॉल्ट",
    ws_vault_off_title: "केंद्रीय संस्थागत आवेदन वॉल्ट",
    ws_vault_off_sub: "सभी आवेदक प्रविष्टियों का निरीक्षण करें, AI स्कोर की समीक्षा करें और संस्थागत रिकॉर्ड निर्यात करें।",
    ws_vault_off_crumb: "केंद्रीय वॉल्ट",
    ws_officer_title: "अंडरराइटिंग कॉकपिट और SHAP विश्लेषण",
    ws_officer_sub: "अंडरराइटिंग मापदंड समायोजित करें, सीमांत लॉग-ऑड्स योगदान जांचें और RBI-अनुपालित निर्णय दर्ज करें।",
    ws_officer_crumb: "अंडरराइटिंग कॉकपिट",
    ws_portfolio_title: "ऐतिहासिक भारत ऋण पोर्टफोलियो",
    ws_portfolio_sub: "शहरी, अर्ध-शहरी और ग्रामीण वर्गों के ऐतिहासिक ऋण रिकॉर्ड खोजें, फ़िल्टर करें और ऑडिट करें।",
    ws_portfolio_crumb: "ऐतिहासिक पोर्टफोलियो",
    ws_model_title: "मॉडल सटीकता एवं होल्डआउट सत्यापन",
    ws_model_sub: "कैलिब्रेटेड लॉजिस्टिक रिग्रेशन मीट्रिक्स, कन्फ्यूज़न मैट्रिक्स और वैश्विक फ़ीचर वज़न का निरीक्षण करें।",
    ws_model_crumb: "मॉडल सटीकता रिपोर्ट",
    ws_fairness_title: "जनसांख्यिकीय निष्पक्षता एवं 80% नियम ऑडिट",
    ws_fairness_sub: "असमान प्रभाव अनुपात (DIR) अनुपालन की जांच करें और ग्रामीण समावेशन कैलिब्रेशन लागू करें।",
    ws_fairness_crumb: "निष्पक्षता ऑडिट",
    nav_pub_home: "होम",
    nav_pub_applicant: "आवेदक पोर्टल",
    nav_pub_officer: "अधिकारी पोर्टल",
    nav_pub_support: "सहायता",
    foot_privacy: "गोपनीयता नीति",
    foot_terms: "सेवा की शर्तें",
    foot_grievance: "शिकायत निवारण",
    foot_sitemap: "साइटमैप",
    mob_call_helpline: "हेल्पलाइन कॉल करें: 1800-209-4000",
    mob_email_support: "ईमेल: grievance.bharat@rindristi.fin",
    maint_help_html: 'सहायता हेल्पलाइन: <a href="tel:18002094000" class="contact-link">1800-209-4000</a> &bull; ईमेल: <a href="mailto:grievance.bharat@rindristi.fin" class="contact-link">grievance.bharat@rindristi.fin</a>'
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
        ? `${healthData.service || 'रिनदृष्टि फेयरलेंड'} FastAPI (${state.apiBase}) से ${healthData.database || 'डुअल-सिंक'} डेटाबेस के साथ लाइव जुड़ा है।`
        : `Connected live to ${healthData.service || 'RinDristi FairLend'} FastAPI (${state.apiBase}) with ${healthData.database || 'dual-sync'} persistence.`;
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
  if (typeof updateSettingsModalStatusUI === 'function') {
    updateSettingsModalStatusUI();
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
    const errMsg = hi ? 'कृपया http:// या https:// से शुरू होने वाला वैध URL दर्ज करें।' : 'Please enter a valid URL starting with http:// or https://';
    showInlineAlert('backend-info-alert', errMsg, true);
    window.showRinDristiToast(errMsg, true);
    input.focus();
    return;
  }
  try {
    localStorage.setItem('rindristi_api_base', raw);
  } catch (e) {}
  state.apiBase = raw;
  showInlineAlert('backend-info-alert', hi ? `API एंडपॉइंट अपडेट हुआ: ${raw}` : `API endpoint updated to ${raw}`, false);
  syncBackendModalUI();
  checkBackendConnection(true);
};

window.resetCustomApiBase = function() {
  try {
    localStorage.removeItem('rindristi_api_base');
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
        window.showRinDristiToast(
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
    window.showRinDristiToast(
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
    localStorage.setItem('rindristi_lang', state.currentLang);
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
  if (typeof updateSettingsModalStatusUI === 'function') {
    updateSettingsModalStatusUI();
  }
  const infoModal = document.getElementById('public-info-modal');
  if (infoModal && infoModal.style.display === 'flex') {
    const sec = infoModal.getAttribute('data-section') || 'privacy';
    window.openPublicInfoModal(sec, false);
  }
  syncDocumentSeoAndBreadcrumbs();
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
  clearInlineAlert('apply-form-alert');

  if (currentAuthUser?.role === 'officer') {
    const errMsg = hi
      ? 'ऋण आवेदन केवल आवेदक पोर्टल से ही जमा किए जा सकते हैं।'
      : 'Loan application submission is restricted to the Applicant Portal.';
    showInlineAlert('apply-form-alert', errMsg, true);
    window.showRinDristiToast(errMsg, true);
    return;
  }

  const nameEl = document.getElementById('fill-full-name');
  const phoneEl = document.getElementById('fill-phone');
  const incomeEl = document.getElementById('fill-app-income');
  const loanAmtEl = document.getElementById('fill-loan-amount');
  const consentEl = document.getElementById('rbi-consent-checkbox');

  const rawName = (nameEl?.value || '').trim();
  const rawPhone = (phoneEl?.value || '').trim();
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const appIncomeVal = Number(incomeEl?.value || 0);
  const loanAmountVal = Number(loanAmtEl?.value || 0);

  if (rawName.length < 2) {
    const msg = hi ? 'कृपया कम से कम 2 अक्षरों का वैध पूरा नाम दर्ज करें।' : 'Please enter the applicant full name (minimum 2 characters).';
    showInlineAlert('apply-form-alert', msg, true);
    window.showRinDristiToast(msg, true);
    nameEl?.focus();
    return;
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 13) {
    const msg = hi ? 'कृपया वैध 10-अंकीय मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit contact mobile number.';
    showInlineAlert('apply-form-alert', msg, true);
    window.showRinDristiToast(msg, true);
    phoneEl?.focus();
    return;
  }
  if (!Number.isFinite(appIncomeVal) || appIncomeVal < 1000) {
    const msg = hi ? 'कृपया न्यूनतम ₹1,000 मासिक आय दर्ज करें।' : 'Applicant monthly income must be at least ₹1,000.';
    showInlineAlert('apply-form-alert', msg, true);
    window.showRinDristiToast(msg, true);
    incomeEl?.focus();
    return;
  }
  if (!Number.isFinite(loanAmountVal) || loanAmountVal < 1000) {
    const msg = hi ? 'कृपया न्यूनतम ₹1,000 ऋण राशि दर्ज करें।' : 'Requested loan amount must be at least ₹1,000.';
    showInlineAlert('apply-form-alert', msg, true);
    window.showRinDristiToast(msg, true);
    loanAmtEl?.focus();
    return;
  }
  if (consentEl && !consentEl.checked) {
    const msg = hi ? 'आगे बढ़ने के लिए कृपया RBI डिजिटल लेंडिंग वैधानिक सहमति चेकबॉक्स चुनें।' : 'Please accept the RBI Digital Lending statutory consent checkbox before submitting.';
    showInlineAlert('apply-form-alert', msg, true);
    window.showRinDristiToast(msg, true);
    consentEl.focus();
    return;
  }

  const submitBtn = document.getElementById('btn-submit-app');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>⏳</span> ${hi ? 'वॉल्ट में दर्ज हो रहा है...' : 'Recording in Vault...'}`;
  }

  const yearsVal = parseInt(document.getElementById('fill-loan-years')?.value || 5, 10);
  const termMonths = yearsVal * 12;

  const formData = {
    full_name: rawName,
    phone: rawPhone,
    email: currentAuthUser ? currentAuthUser.email : null,
    gender: document.getElementById('fill-gender')?.value || 'Female',
    marital_status: document.getElementById('fill-married')?.value || 'No',
    dependents: document.getElementById('fill-dependents')?.value || '0',
    education: document.getElementById('fill-education')?.value || 'Graduate',
    employment_type: document.getElementById('fill-employment')?.value || 'Freelancing / Gig Economy / Contractor',
    salary_slip: document.getElementById('fill-salary-slip')?.value || 'Yes',
    applicant_income: appIncomeVal,
    coapplicant_income: Number(document.getElementById('fill-coapp-income')?.value || 0),
    loan_purpose: document.getElementById('fill-loan-purpose')?.value || 'Home Improvement / Construction',
    loan_amount: loanAmountVal,
    loan_term_months: termMonths,
    cibil_score: Number(document.getElementById('fill-cibil-slider')?.value || 760),
    property_area: document.getElementById('fill-property-area')?.value || 'Rural',
    user_id: currentAuthUser ? currentAuthUser.id : null,
    applicant_id: currentAuthUser ? currentAuthUser.id : null,
    applicant_email: currentAuthUser ? currentAuthUser.email : null
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
      const maintMsg = hi ? 'पोर्टल निर्धारित रखरखाव के लिए अस्थायी रूप से ऑफ़लाइन है।' : 'Portal is temporarily offline for scheduled maintenance.';
      showInlineAlert('apply-form-alert', maintMsg, true);
      window.showRinDristiToast(maintMsg, true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>🚀</span> ${dict.btn_submit_app}`;
      }
      return;
    }

    if (response.status === 401 || response.status === 403 || response.status === 400 || response.status === 422) {
      const errData = await response.json().catch(() => ({}));
      if (handleApiAuthFailure(response, errData)) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>🚀</span> ${dict.btn_submit_app}`;
        }
        return;
      }
      const errMsg = errData.error || (hi ? 'आवेदन जमा करने में अवरोध आया। कृपया विवरण जांचें।' : 'Unable to submit loan application. Please verify all inputs.');
      showInlineAlert('apply-form-alert', errMsg, true);
      window.showRinDristiToast(errMsg, true);
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
    }
  } catch (err) {
    state.backendConnected = false;
  }

  if (!savedRecord) {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const appNo = `RD-OFFLINE-${randomId}`;

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
    window.showRinDristiToast(
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
  window.showRinDristiToast(msg);
};

window.saveOfficerTermUpdates = async function() {
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  if (currentAuthUser?.role !== 'officer') {
    window.showRinDristiToast(hi ? 'केवल ऋण अधिकारी ही पैरामीटर सहेज सकते हैं।' : 'Officer clearance required to save parameter changes.', true);
    return;
  }

  const appNo = state.currentApplicant?.id;
  if (!appNo) {
    window.showRinDristiToast(hi ? 'कृपया पहले केंद्रीय वॉल्ट से किसी आवेदन का चयन करें।' : 'Select an application from the Central Vault first.', true);
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
    if (handleApiAuthFailure(res, data)) {
      return;
    }
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
      window.showRinDristiToast(
        hi
          ? `✅ आवेदन ${appNo} के संशोधित पैरामीटर डेटाबेस वॉल्ट में स्थायी रूप से सहेजे गए।`
          : `✅ Updated parameters for ${appNo} saved permanently to Central Vault.`
      );
    } else if (res.status === 404) {
      window.showRinDristiToast(
        hi
          ? `नोट: ऐतिहासिक पोर्टफ़ोलियो केस (${appNo}) केवल संदर्भ विश्लेषण के लिए हैं। सहेजने के लिए केंद्रीय वॉल्ट से जमा आवेदन चुनें।`
          : `Historical portfolio benchmark (${appNo}) is read-only. Select a submitted application from Central Vault to persist changes.`,
        true
      );
    } else {
      window.showRinDristiToast(data.error || (hi ? 'पैरामीटर सहेजने में त्रुटि।' : 'Failed to save parameter changes.'), true);
    }
  } catch (e) {
    window.showRinDristiToast(hi ? 'वॉल्ट सर्वर से संपर्क करने में नेटवर्क त्रुटि।' : 'Network error saving updated parameters.', true);
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
    window.showRinDristiToast(hi ? 'निर्यात करने के लिए कोई आवेदन उपलब्ध नहीं है।' : 'No loan applications available to export yet.', true);
    return;
  }

  const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  let rawCsvBody = 'Application No,Submitted At,Updated At,Full Name,CIBIL Score,Salary Slip,Applicant Income,Co-Applicant Income,Loan Amount (INR),Tenure (Months),Property Area,AI Score (%),Status,Officer Decision,Officer Remarks,Monthly EMI (INR)\n';

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
    rawCsvBody += row + '\n';
  });

  const csvFilename = `rindristi_loan_applications_${new Date().toISOString().substring(0, 10)}.csv`;
  if (window.AndroidBridge && typeof window.AndroidBridge.saveTextFile === 'function') {
    window.AndroidBridge.saveTextFile(csvFilename, 'text/csv', rawCsvBody);
    return;
  }

  const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + rawCsvBody);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', csvFilename);
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
    window.showRinDristiToast(hi ? 'निर्यात करने के लिए कोई आवेदन उपलब्ध नहीं है।' : 'No loan applications available to export yet.', true);
    return;
  }

  const rawJson = JSON.stringify(apps, null, 2);
  const jsonFilename = `rindristi_loan_vault_backup_${new Date().toISOString().substring(0, 10)}.json`;
  if (window.AndroidBridge && typeof window.AndroidBridge.saveTextFile === 'function') {
    window.AndroidBridge.saveTextFile(jsonFilename, 'application/json', rawJson);
    return;
  }

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(rawJson);
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', jsonFilename);
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
        <td style="font-weight: 700; color: #0B2920;">${escapeHtml(maskPrivacyName(app.full_name || (hi ? 'आवेदक' : 'Applicant')))}</td>
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
    if (response.status === 401) {
      const errData = await response.json().catch(() => ({}));
      if (handleApiAuthFailure(response, errData)) return;
    }
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
      if (handleApiAuthFailure(res, err)) return;
      window.showRinDristiToast(err.error || (hi ? 'अस्वीकृत: आप केवल अपने आवेदन देख सकते हैं।' : 'Forbidden: You may only access your own loan applications.'), true);
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
    window.showRinDristiToast(hi ? `आवेदन ${appNo} नहीं मिला।` : `Application ${appNo} could not be loaded.`, true);
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
    const offLow = String(applicant.officer_status || 'Pending').trim().toLowerCase();
    const effStatus = (offLow === 'approved' || offLow === 'conditional' || offLow === 'rejected') ? offLow : pred.status;
    if (effStatus === 'rejected') {
      openLetterBtn.innerHTML = `<span>📄</span> ${lang === 'hi' ? 'आधिकारिक प्रतिकूल निर्णय सूचना देखें एवं डाउनलोड करें' : 'View & Download Adverse Action Notice'}`;
    } else if (offLow === 'approved') {
      openLetterBtn.innerHTML = `<span>📄</span> ${lang === 'hi' ? 'अधिकारी द्वारा स्वीकृत ऋण पत्र एवं KFS डाउनलोड करें' : 'View & Download Officer-Sanctioned Letter & KFS'}`;
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
  clearInlineAlert('officer-action-alert');
  if (currentAuthUser?.role !== 'officer') {
    const msg = hi ? 'अस्वीकृत: ऋण अधिकारी अनुमति आवश्यक है।' : 'Forbidden: Officer clearance required.';
    showInlineAlert('officer-action-alert', msg, true);
    window.showRinDristiToast(msg, true);
    return;
  }

  const appNo = state.currentApplicant?.id;
  if (!appNo) {
    const msg = hi
      ? 'निर्णय दर्ज करने से पहले कृपया केंद्रीय वॉल्ट से किसी आवेदन का चयन करें।'
      : 'Please select a submitted application from Central Application Vault first.';
    showInlineAlert('officer-action-alert', msg, true);
    window.showRinDristiToast(msg, true);
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
    if (handleApiAuthFailure(res, payload)) {
      return;
    }
    if (res.status === 403) {
      const errMsg = payload.error || (hi ? 'अस्वीकृत: ऋण अधिकारी अनुमति आवश्यक है।' : 'Forbidden: Officer clearance required.');
      showInlineAlert('officer-action-alert', errMsg, true);
      window.showRinDristiToast(errMsg, true);
      return;
    }
    if (res.status === 404) {
      const errMsg = hi
        ? `नोट: ऐतिहासिक पोर्टफोलियो केस (${appNo}) केवल संदर्भ विश्लेषण के लिए हैं। निर्णय दर्ज करने के लिए केंद्रीय वॉल्ट से जमा आवेदन चुनें।`
        : `Application ${appNo} is not in the persistent vault (historical portfolio samples are read-only). Select a submitted application from Central Vault.`;
      showInlineAlert('officer-action-alert', errMsg, true);
      window.showRinDristiToast(errMsg, true);
      return;
    }
    if (!res.ok || !payload.success) {
      const errMsg = payload.error || (hi ? 'ऋण निर्णय दर्ज करने में त्रुटि हुई।' : 'Failed to record officer decision.');
      showInlineAlert('officer-action-alert', errMsg, true);
      window.showRinDristiToast(errMsg, true);
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
    const okMsg = hi
      ? `निर्णय दर्ज हुआ: ${appNo} (${applicantName}) — स्थिति: ${statusLocalized}। रिनदृष्टि सर्वर वॉल्ट में स्थायी रूप से सुरक्षित!`
      : `Loan Decision Recorded: ${appNo} (${applicantName}) — Status: ${newStatus}. Stored persistently in RinDristi Server Vault.`;
    showInlineAlert('officer-action-alert', okMsg, false);
    window.showRinDristiToast(`✅ ${okMsg}`);
  } catch (e) {
    const netMsg = hi ? 'सर्वर से संपर्क नहीं हो सका। निर्णय सहेजा नहीं गया।' : 'Network error reaching RinDristi Server Vault. Decision was not saved.';
    showInlineAlert('officer-action-alert', netMsg, true);
    window.showRinDristiToast(netMsg, true);
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
      clearInlineAlert('apply-form-alert');
      applyApplicationFormDefaultsFromSettings(activeUserSettings);
      syncFormHelperDisplays();
      clearPersonalFormInputs();
    }, 0);
  });

  document.addEventListener('click', (e) => {
    const tgt = e.target;
    if (!tgt || !tgt.closest) return;
    if (!tgt.closest('.mobile-nav-drawer') && !tgt.closest('.mobile-menu-btn')) {
      window.closeAllMobileMenus();
    }
  });

  window.addEventListener('popstate', () => {
    const slug = normalizeSlugPath(window.location.pathname);
    if (slug === '/privacy' || slug === '/terms' || slug === '/grievance') {
      window.openPublicInfoModal(slug.slice(1), false);
      return;
    }
    window.closePublicInfoModal(false);
    if (slug === '/forgot-password') {
      window.openForgotPassword(activePortal);
      syncDocumentSeoAndBreadcrumbs('/forgot-password');
      return;
    }
    if (currentAuthUser && SLUG_TO_TAB[slug]) {
      window.activateWorkspaceTab(SLUG_TO_TAB[slug], 'none');
      return;
    }
    if (!currentAuthUser) {
      const targetPortal = (slug === '/officer' || (SLUG_TO_TAB[slug] && OFFICER_TABS.has(SLUG_TO_TAB[slug]) && SLUG_TO_TAB[slug] !== 'database-view'))
        ? 'officer'
        : 'applicant';
      syncPortalGatewayVisuals(targetPortal);
      window.switchAuthTab(targetPortal);
    }
    syncDocumentSeoAndBreadcrumbs(slug);
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
      if (scope === 'profile_email' && typeof window.syncProfileEmailOtpBoxVisibility === 'function') {
        window.syncProfileEmailOtpBoxVisibility();
      }
    });
  });

  const onUserActivityEvent = () => {
    if (!currentAuthUser) return;
    recordUserActivity(false);
  };
  let lastMouseActivityAt = 0;
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evtName => {
    document.addEventListener(evtName, onUserActivityEvent, { passive: true });
  });
  document.addEventListener('mousemove', () => {
    const now = Date.now();
    if (now - lastMouseActivityAt >= 15000) {
      lastMouseActivityAt = now;
      onUserActivityEvent();
    }
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentAuthUser) {
      if (isLocalSessionIdleExpired()) {
        window.handleLogout('inactivity');
      } else {
        recordUserActivity(false);
      }
    }
  });

  ['fp-email', 'fp-new-password', 'fp-confirm-password'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('focus', () => el.removeAttribute('readonly'));
    el.addEventListener('pointerdown', () => el.removeAttribute('readonly'));
  });

  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'settings-modal') {
      window.closeSettingsModal(true);
    }
  });

  document.getElementById('letter-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'letter-modal') {
      window.closeDecisionLetterModal();
    }
  });

  document.getElementById('public-info-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'public-info-modal') {
      window.closePublicInfoModal(true);
    }
  });

  document.getElementById('backend-info-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'backend-info-modal') {
      window.toggleBackendInfoModal();
    }
  });

  document.getElementById('site-availability-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'site-availability-modal') {
      window.closeSiteAvailabilityModal();
    }
  });

  document.getElementById('forgot-password-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'forgot-password-modal') {
      window.closeForgotPasswordModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeAllMobileMenus();
      const pubEl = document.getElementById('public-info-modal');
      if (pubEl && pubEl.style.display === 'flex') {
        window.closePublicInfoModal(true);
      }
      const settingsEl = document.getElementById('settings-modal');
      if (settingsEl && settingsEl.style.display === 'flex') {
        window.closeSettingsModal(true);
      }
      const letterEl = document.getElementById('letter-modal');
      if (letterEl && letterEl.style.display === 'flex') {
        window.closeDecisionLetterModal();
      }
      const fpEl = document.getElementById('forgot-password-modal');
      if (fpEl && fpEl.style.display === 'flex') {
        window.closeForgotPasswordModal();
      }
      const beEl = document.getElementById('backend-info-modal');
      if (beEl && beEl.style.display === 'flex') {
        window.toggleBackendInfoModal();
      }
      const saEl = document.getElementById('site-availability-modal');
      if (saEl && saEl.style.display === 'flex') {
        window.closeSiteAvailabilityModal();
      }
    }
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
    window.closeDecisionLetterModal();
  });

  let savedPrintTitle = '';
  const prepareLetterPrintContext = () => {
    const letterEl = document.getElementById('letter-modal');
    if (!letterEl || letterEl.style.display === 'none') return;
    document.body.classList.add('letter-modal-open');
    const contentEl = letterEl.querySelector('.modal-content');
    if (contentEl) contentEl.scrollTop = 0;
    window.scrollTo(0, 0);
    if (!savedPrintTitle) savedPrintTitle = document.title;
    const rawRef = String(state.currentApplicant?.id || 'Application').replace(/[^A-Za-z0-9_-]/g, '_');
    const offLow = String(state.currentApplicant?.officer_status || '').trim().toLowerCase();
    const docTag = letterEl.getAttribute('data-effective-status') === 'rejected' || offLow === 'rejected'
      ? 'Adverse_Notice'
      : 'Decision_Letter';
    document.title = `RinDristi_${docTag}_${rawRef}`;
  };
  const restoreLetterPrintContext = () => {
    if (savedPrintTitle) {
      document.title = savedPrintTitle;
      savedPrintTitle = '';
    }
  };
  window.addEventListener('beforeprint', prepareLetterPrintContext);
  window.addEventListener('afterprint', restoreLetterPrintContext);

  document.getElementById('btn-print-letter')?.addEventListener('click', () => {
    prepareLetterPrintContext();
    if (window.AndroidBridge && typeof window.AndroidBridge.printPage === 'function') {
      window.AndroidBridge.printPage();
      setTimeout(restoreLetterPrintContext, 1500);
      return;
    }
    window.print();
    setTimeout(restoreLetterPrintContext, 1500);
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

function formatLetterTimestamp(rawTs, hi) {
  const s = String(rawTs || '').trim();
  if (!s) return '';
  let iso = s;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s) && !s.includes('T')) {
    iso = s.replace(' ', 'T');
    if (!/[Z+-]\d{0,2}:?\d{0,2}$/.test(iso)) iso += 'Z';
  }
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function localizePurposeText(rawPurpose, hi) {
  const p = String(rawPurpose || '').trim();
  if (!hi) return p || 'Retail Loan Facility';
  const map = {
    'Home Improvement / Construction': 'गृह निर्माण / नवीनीकरण / खरीद',
    'Home Construction / Renovation / Purchase': 'गृह निर्माण / नवीनीकरण / खरीद',
    'Small Business / MSME Working Capital': 'लघु व्यवसाय / एमएसएमई कार्यशील पूंजी',
    'Agricultural Equipment / Irrigation / Solar': 'कृषि उपकरण / सिंचाई / सौर ऊर्जा',
    'Higher Education / Skill Training': 'उच्च शिक्षा / कौशल प्रशिक्षण',
    'Vehicle / Two-Wheeler / Commercial Transport': 'वाहन / दुपहिया / व्यावसायिक परिवहन',
    'Personal / Family Health Facility': 'व्यक्तिगत / पारिवारिक स्वास्थ्य सुविधा'
  };
  return map[p] || p || 'खुदरा ऋण सुविधा';
}

window.closeDecisionLetterModal = function() {
  const modal = document.getElementById('letter-modal');
  if (modal) modal.style.display = 'none';
  document.body.classList.remove('letter-modal-open');
};

window.openDecisionLetterModal = function(allowOfficerPreview = false) {
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  if (!state.hasApplied) {
    if (allowOfficerPreview || isOfficer) {
      window.showRinDristiToast(
        hi
          ? 'सूचना पत्र बनाने के लिए कृपया पहले केंद्रीय वॉल्ट या पोर्टफोलियो से कोई आवेदन चुनें।'
          : 'Please select an application from Central Application Vault or Portfolio first to preview a sanction notice.',
        true
      );
      return;
    }
    const msg = hi
      ? 'कृपया आधिकारिक स्वीकृति पत्र डाउनलोड करने के लिए पहले ऋण आवेदन जमा करें।'
      : 'Please submit your loan application first to generate and download your official Sanction Letter.';
    window.activateWorkspaceTab('apply-view');
    showInlineAlert('apply-form-alert', msg, true);
    window.showRinDristiToast(msg, true);
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
  loanAmtInr = Math.round(loanAmtInr);

  const termMonths = Math.max(1, parseInt(app.term || app.loan_term_months || 60, 10) || 60);
  const years = (termMonths / 12).toFixed(1).replace(/\.0$/, '');

  const cibilVal = parseInt(
    app.cibil_score !== undefined && app.cibil_score !== null && app.cibil_score !== ''
      ? app.cibil_score
      : (pred.cibil_score || (Number(app.credit_history) === 1 ? 750 : 540)),
    10
  ) || 750;
  const cibilTier = cibilVal >= 750
    ? (hi ? 'उत्कृष्ट (प्राइम)' : 'Prime')
    : cibilVal >= 650
      ? (hi ? 'मानक (योग्य)' : 'Good')
      : (hi ? 'निम्न (सबप्राइम)' : 'Subprime');

  let aprPct = 13.50;
  let aprTierNote = hi ? 'जोखिम-समायोजित सांकेतिक दर' : 'Risk-Calibrated Indicative Rate';
  if (cibilVal >= 750) {
    aprPct = 9.25;
    aprTierNote = hi ? 'प्राइम टियर • स्थिर घटती दर' : 'Prime Tier • Fixed Reducing Rate';
  } else if (cibilVal >= 700) {
    aprPct = 10.50;
    aprTierNote = hi ? 'मानक टियर • स्थिर घटती दर' : 'Standard Tier • Fixed Reducing Rate';
  } else if (cibilVal >= 650) {
    aprPct = 11.75;
    aprTierNote = hi ? 'नियर-प्राइम टियर • स्थिर घटती दर' : 'Near-Prime Tier • Fixed Reducing Rate';
  }

  const monthlyRate = (aprPct / 100) / 12;
  const powFactor = Math.pow(1 + monthlyRate, termMonths);
  const rawEmi = monthlyRate > 0 && powFactor > 1
    ? (loanAmtInr * monthlyRate * powFactor) / (powFactor - 1)
    : loanAmtInr / termMonths;
  const emiVal = Number.isFinite(rawEmi) && rawEmi > 0
    ? Math.round(rawEmi)
    : Math.max(1, Math.round(loanAmtInr / termMonths));
  const totalRepay = Math.max(loanAmtInr, emiVal * termMonths);
  const totalInterest = totalRepay - loanAmtInr;

  const appInc = Math.max(0, Math.round(Number(app.applicant_income || 0)));
  const coappInc = Math.max(0, Math.round(Number(app.coapplicant_income || 0)));
  const totInc = Math.max(1, appInc + coappInc);
  const basePrincipalEmi = Math.round(pred.ratios?.emi !== undefined ? pred.ratios.emi : (loanAmtInr / termMonths));
  const baseDtiPct = pred.ratios?.dtiPct !== undefined
    ? pred.ratios.dtiPct
    : (Math.round((basePrincipalEmi / totInc) * 1000) / 10);
  const effectiveFoirPct = Math.round((emiVal / totInc) * 1000) / 10;

  const rawId = String(app.id || 'RD-PENDING').trim();
  const formattedRef = rawId.startsWith('RINDRISTI-') ? rawId : `RINDRISTI-${rawId}`;
  const submittedStr = formatLetterTimestamp(app.created_at, hi) || (hi ? 'ऐतिहासिक पोर्टफोलियो अभिलेख' : 'Historical Portfolio Record');
  const todayStr = new Date().toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const decisionStr = formatLetterTimestamp(app.updated_at || app.created_at, hi) || todayStr;

  const appEmail = String(
    app.applicant_email || app.email || (currentAuthUser?.role !== 'officer' ? currentAuthUser?.email : '') || ''
  ).trim();
  const appPhone = String(app.phone || '').trim();
  const contactParts = [];
  if (appEmail) contactParts.push(appEmail);
  if (appPhone) contactParts.push(appPhone);
  const contactStr = contactParts.length > 0
    ? contactParts.join(' • ')
    : (hi ? 'फ़ाइल आईडी द्वारा सत्यापित (ऐतिहासिक रिकॉर्ड)' : 'Verified by File Reference (Historical Record)');

  const hasSlip = app.salary_slip === 'Yes' || app.salary_slip === true || String(app.salary_slip || '').toLowerCase() === 'yes';
  const empBase = String(app.employment_type || (app.self_employed === 'Yes' ? 'Self-Employed' : 'Salaried'));
  const slipTag = hasSlip
    ? (hi ? 'वेतन पर्ची सत्यापित' : 'Salary Slip Verified')
    : (hi ? 'बैंक स्टेटमेंट द्वारा सत्यापित' : 'Bank Statement Verified');

  const offStatRaw = String(app.officer_status || 'Pending').trim();
  const offStatLow = offStatRaw.toLowerCase();
  const isOfficerFinal = offStatLow === 'approved' || offStatLow === 'conditional' || offStatLow === 'rejected';
  const effectiveStatus = isOfficerFinal ? offStatLow : pred.status;
  modal.setAttribute('data-effective-status', effectiveStatus);

  const offStatusText = offStatLow === 'approved'
    ? (hi ? 'अधिकारी द्वारा स्वीकृत' : 'Sanctioned by Officer')
    : offStatLow === 'conditional'
      ? (hi ? 'अधिकारी द्वारा सशर्त स्वीकृत' : 'Conditional Approval (Officer)')
      : offStatLow === 'rejected'
        ? (hi ? 'अधिकारी द्वारा अस्वीकृत' : 'Declined by Officer')
        : (hi ? 'अधिकारी समीक्षा लंबित' : 'Pending Officer Review');

  setEl('let-applicant-name', app.name || (hi ? 'आवेदक' : 'Applicant'));
  setEl('let-contact', contactStr);
  setEl('let-ref', formattedRef);
  setEl('let-submitted-date', submittedStr);
  setEl('let-date', decisionStr);
  setEl('let-loan-amount', `₹${loanAmtInr.toLocaleString('en-IN')}`);
  setEl('let-tenure', hi ? `${termMonths} माह (${years} वर्ष)` : `${termMonths} Months (${years} Years)`);
  setEl('let-purpose', localizePurposeText(app.loan_purpose, hi));
  setEl('let-area', hi ? `${localizeArea(app.property_area || 'Urban', 'hi')} क्षेत्र` : `${localizeArea(app.property_area || 'Urban', 'en')} Territory`);
  setEl('let-employment', `${empBase} • ${slipTag}`);
  setEl(
    'let-income',
    `₹${totInc.toLocaleString('en-IN')}${hi ? '/माह' : '/mo'} (₹${appInc.toLocaleString('en-IN')} + ₹${coappInc.toLocaleString('en-IN')})`
  );
  setEl('let-cibil', `${cibilVal} / 900 (${cibilTier})`);
  setEl('let-ai-score', hi ? `${pred.approvalPercent}% (मानक ≥ 65%)` : `${pred.approvalPercent}% (Benchmark ≥ 65%)`);
  setEl('let-officer-status', offStatusText);

  setEl('kfs-loan-amt', `₹${loanAmtInr.toLocaleString('en-IN')}`);
  setEl('kfs-apr', hi ? `${aprPct.toFixed(2)}% वार्षिक (${aprTierNote})` : `${aprPct.toFixed(2)}% p.a. (${aprTierNote})`);
  setEl('kfs-tenure', hi ? `${termMonths} माह (${years} वर्ष)` : `${termMonths} Months (${years} Years)`);
  setEl('kfs-emi', hi ? `₹${emiVal.toLocaleString('en-IN')} / माह` : `₹${emiVal.toLocaleString('en-IN')} / month`);
  setEl(
    'kfs-foir-note',
    hi
      ? `@ ${aprPct.toFixed(2)}% ब्याज सहित (आय का ${effectiveFoirPct}% FOIR; मूलधन आधार किस्त = ₹${basePrincipalEmi.toLocaleString('en-IN')}/माह या ${baseDtiPct}% DTI)`
      : `At ${aprPct.toFixed(2)}% p.a. reducing (${effectiveFoirPct}% FOIR of income; Base principal installment = ₹${basePrincipalEmi.toLocaleString('en-IN')}/mo or ${baseDtiPct}% DTI)`
  );
  setEl('kfs-total-interest', `₹${totalInterest.toLocaleString('en-IN')}`);
  setEl('kfs-total-repayment', `₹${totalRepay.toLocaleString('en-IN')}`);

  const docTypeEl = document.getElementById('let-doc-type');
  const statusBadge = document.getElementById('let-status-badge');
  const verdictText = document.getElementById('let-verdict-text');
  const kfsCard = document.getElementById('letter-kfs-card');
  const adverseCard = document.getElementById('letter-adverse-card');
  const kfsTitleEl = document.getElementById('kfs-title-text');
  const kfsTagEl = document.getElementById('kfs-compliant-tag');
  const kfsPrincipalLbl = document.getElementById('kfs-principal-lbl');

  if (effectiveStatus === 'rejected') {
    if (kfsCard) kfsCard.style.display = 'none';
    if (adverseCard) adverseCard.style.display = 'block';
    if (docTypeEl) docTypeEl.innerText = hi ? 'आधिकारिक प्रतिकूल निर्णय सूचना' : 'OFFICIAL ADVERSE ACTION NOTICE';
    if (statusBadge) {
      statusBadge.innerText = hi ? 'प्रतिकूल निर्णय (अस्वीकृत)' : 'ADVERSE ACTION NOTICE (DECLINED)';
      statusBadge.className = 'badge badge-danger';
    }
    if (verdictText) {
      verdictText.innerHTML = hi
        ? `आवेदन <strong>${escapeHtml(rawId)}</strong> के मूल्यांकन के पश्चात वर्तमान में इस ऋण सुविधा को स्वीकृत नहीं किया जा सका है। <strong>भारतीय रिज़र्व बैंक फेयर प्रैक्टिसेज कोड</strong> के अनुपालन में नीचे अस्वीकृति के सटीक मापदंड एवं सुधार के उपाय प्रस्तुत हैं।`
        : `Following underwriting evaluation of application <strong>${escapeHtml(rawId)}</strong>, no credit facility has been sanctioned at this stage. In compliance with the <strong>Reserve Bank of India Fair Practices Code</strong>, the exact assessment benchmarks and remediation criteria are disclosed below.`;
    }
    setEl('adv-requested-amt', `₹${loanAmtInr.toLocaleString('en-IN')} (${termMonths} ${hi ? 'माह' : 'Months'})`);
    setEl('adv-sanctioned-amt', hi ? '₹0 (कोई ऋण स्वीकृत नहीं)' : '₹0 (No Facility Sanctioned)');
    setEl(
      'adv-cibil-check',
      `${cibilVal} / 900 — ${cibilVal >= 650 ? (hi ? 'मानक पूर्ण (उत्तीर्ण)' : 'Meets Benchmark (Pass)') : (hi ? '650 सीमा से कम (जोखिम)' : 'Below 650 Threshold (Flagged)')}`
    );
    setEl(
      'adv-dti-check',
      hi
        ? `${baseDtiPct}% आधार DTI (${effectiveFoirPct}% FOIR ब्याज सहित) — ${baseDtiPct <= 45 ? 'सीमा के भीतर' : '45% सीमा से अधिक (उच्च भार)'}`
        : `${baseDtiPct}% Base DTI (${effectiveFoirPct}% FOIR incl. interest) — ${baseDtiPct <= 45 ? 'Within Ceiling' : 'Exceeds 45% Ceiling (High Leverage)'}`
    );
    setEl(
      'adv-score-check',
      hi
        ? `${pred.approvalPercent}% AI स्कोर (${offStatLow === 'rejected' ? 'ऋण अधिकारी द्वारा अस्वीकृत' : '65% स्वीकृति मानक से कम'})`
        : `${pred.approvalPercent}% AI Score (${offStatLow === 'rejected' ? 'Declined by Loan Officer' : 'Below 65% Approval Benchmark'})`
    );
    setEl(
      'adv-reapply-note',
      hi
        ? 'नीचे दिए गए सुधार उपायों को पूरा करने या ऋण राशि/अवधि समायोजित करने के पश्चात आप तुरंत पुनः आवेदन कर सकते हैं।'
        : 'Eligible for immediate re-evaluation after addressing the remediation steps below or adjusting facility amount / tenure.'
    );
  } else {
    if (kfsCard) kfsCard.style.display = 'block';
    if (adverseCard) adverseCard.style.display = 'none';

    if (offStatLow === 'approved') {
      if (docTypeEl) docTypeEl.innerText = hi ? 'आधिकारिक ऋण स्वीकृति पत्र एवं KFS' : 'OFFICIAL LOAN SANCTION LETTER & KFS';
      if (statusBadge) {
        statusBadge.innerText = hi ? 'अधिकारी द्वारा आधिकारिक स्वीकृति' : 'OFFICIAL OFFICER SANCTION';
        statusBadge.className = 'badge badge-success';
      }
      if (kfsTitleEl) kfsTitleEl.innerText = dict.kfs_title;
      if (kfsTagEl) kfsTagEl.innerText = dict.kfs_compliant;
      if (kfsPrincipalLbl) kfsPrincipalLbl.innerText = dict.kfs_row_principal;
      if (verdictText) {
        verdictText.innerHTML = hi
          ? `हमें यह सूचित करते हुए प्रसन्नता हो रही है कि आपका ऋण आवेदन <strong>${escapeHtml(rawId)}</strong> संस्थागत ऋण अधिकारी द्वारा <strong>RBI फेयर प्रैक्टिसेज कोड</strong> के अंतर्गत स्वीकृत कर दिया गया है। नीचे आधिकारिक <strong>मुख्य तथ्य विवरण (KFS)</strong> प्रस्तुत है।`
          : `We are pleased to confirm that application <strong>${escapeHtml(rawId)}</strong> has been formally sanctioned by an authorized Loan Officer under the <strong>RBI Fair Practices Code</strong>. Your official <strong>Key Fact Statement (KFS)</strong> and pricing schedule follow below.`;
      }
    } else if (offStatLow === 'conditional') {
      if (docTypeEl) docTypeEl.innerText = hi ? 'सशर्त ऋण स्वीकृति सूचना एवं KFS' : 'CONDITIONAL SANCTION NOTICE & KFS';
      if (statusBadge) {
        statusBadge.innerText = hi ? 'सशर्त स्वीकृति (अधिकारी समीक्षा)' : 'CONDITIONAL OFFICER APPROVAL';
        statusBadge.className = 'badge badge-warning';
      }
      if (kfsTitleEl) kfsTitleEl.innerText = hi ? 'सशर्त RBI मुख्य तथ्य विवरण (KFS)' : 'CONDITIONAL RBI KEY FACT STATEMENT (KFS)';
      if (kfsTagEl) kfsTagEl.innerText = hi ? 'KYC / शर्तों के अधीन' : 'Subject to KYC / Stipulations';
      if (kfsPrincipalLbl) kfsPrincipalLbl.innerText = hi ? 'सशर्त स्वीकृत राशि (मूलधन)' : 'Conditional Facility Amount (Principal)';
      if (verdictText) {
        verdictText.innerHTML = hi
          ? `आवेदन <strong>${escapeHtml(rawId)}</strong> को <strong>RBI डिजिटल लेंडिंग दिशानिर्देशों</strong> के अंतर्गत प्राथमिक KYC अथवा सह-गारंटर सत्यापन के अधीन सशर्त स्वीकृति प्राप्त हुई है।`
          : `Application <strong>${escapeHtml(rawId)}</strong> holds a conditional sanction subject to primary KYC completion or stipulated officer conditions under <strong>RBI Digital Lending Guidelines</strong>.`;
      }
    } else if (effectiveStatus === 'approved') {
      if (docTypeEl) docTypeEl.innerText = hi ? 'अनंतिम AI पात्रता पत्र एवं सांकेतिक KFS' : 'PROVISIONAL AI QUALIFICATION & INDICATIVE KFS';
      if (statusBadge) {
        statusBadge.innerText = hi ? 'अनंतिम सैद्धांतिक पात्रता (समीक्षा लंबित)' : 'PROVISIONAL AI QUALIFIED (PENDING OFFICER REVIEW)';
        statusBadge.className = 'badge badge-info';
      }
      if (kfsTitleEl) kfsTitleEl.innerText = hi ? 'सांकेतिक RBI मुख्य तथ्य विवरण (अंतिम स्वीकृति के अधीन)' : 'INDICATIVE RBI KEY FACT STATEMENT (PENDING OFFICER SANCTION)';
      if (kfsTagEl) kfsTagEl.innerText = hi ? 'सांकेतिक प्रस्ताव • अधिकारी समीक्षा शेष' : 'Indicative • Subject to Officer Sign-Off';
      if (kfsPrincipalLbl) kfsPrincipalLbl.innerText = hi ? 'प्रस्तावित ऋण राशि (मूलधन)' : 'Proposed Facility Amount (Principal)';
      if (verdictText) {
        verdictText.innerHTML = hi
          ? `आवेदन <strong>${escapeHtml(rawId)}</strong> रिनदृष्टि AI अंडरराइटिंग मानदंडों में सैद्धांतिक रूप से पात्र पाया गया है। संस्थागत अधिकारी की अंतिम स्वीकृति से पूर्व नीचे सांकेतिक <strong>मुख्य तथ्य विवरण (KFS)</strong> प्रस्तुत है।`
          : `Application <strong>${escapeHtml(rawId)}</strong> satisfies automated AI underwriting benchmarks in principle. Below is your indicative <strong>Key Fact Statement (KFS)</strong> pending final verification and Loan Officer sign-off.`;
      }
    } else {
      if (docTypeEl) docTypeEl.innerText = hi ? 'सीमांत समीक्षा सूचना एवं सांकेतिक KFS' : 'BORDERLINE REVIEW NOTICE & INDICATIVE KFS';
      if (statusBadge) {
        statusBadge.innerText = hi ? 'सीमांत स्थिति • समीक्षा लंबित' : 'BORDERLINE (PENDING KYC & OFFICER REVIEW)';
        statusBadge.className = 'badge badge-warning';
      }
      if (kfsTitleEl) kfsTitleEl.innerText = hi ? 'सांकेतिक KFS (समीक्षा एवं सत्यापन के अधीन)' : 'INDICATIVE KEY FACT STATEMENT (SUBJECT TO REVIEW)';
      if (kfsTagEl) kfsTagEl.innerText = hi ? 'समीक्षाधीन • अंतिम स्वीकृति शेष' : 'Pending Verification & Sign-Off';
      if (kfsPrincipalLbl) kfsPrincipalLbl.innerText = hi ? 'प्रस्तावित सशर्त राशि (मूलधन)' : 'Proposed Conditional Facility (Principal)';
      if (verdictText) {
        verdictText.innerHTML = hi
          ? `आवेदन <strong>${escapeHtml(rawId)}</strong> स्वीकृति सीमा के निकट है। संस्थागत अधिकारी द्वारा KYC सत्यापन एवं सह-आवेदक/अवधि समीक्षा के उपरांत अंतिम निर्णय जारी किया जाएगा।`
          : `Application <strong>${escapeHtml(rawId)}</strong> sits near the underwriting threshold and requires KYC verification and Loan Officer review prior to final sanction.`;
      }
    }
  }

  const factorsList = document.getElementById('let-factors-list');
  if (factorsList) {
    const c = pred.contributions || {};
    const fmtImp = (raw) => {
      const n = Number(raw || 0);
      return `${n > 0 ? '+' : ''}${n}%`;
    };
    const creditImp = Number(c.credit_history?.impact || 0);
    const dtiImp = Number(c.dti_ratio?.impact || 0);
    const covImp = Number(c.income_coverage?.impact || 0);
    const slipImp = Number(c.salary_slip?.impact || 0);
    const empImp = Number(c.employment_type?.impact || 0);
    const coappImp = Number(c.coapplicant?.impact || 0);
    const areaImp = Number(c.property_area?.impact || 0);

    const items = [];
    items.push(
      hi
        ? `<li><strong>गणितीय स्कोर ऑडिट:</strong> 50% संस्थागत आधार + नीचे दिए गए कारक = <strong>${pred.approvalPercent}% AI पात्रता स्कोर</strong> (स्वीकृति सीमा: ≥ 65%)।</li>`
        : `<li><strong>Score Derivation Audit:</strong> 50% Institutional Baseline + Itemized Factors = <strong>${pred.approvalPercent}% AI Eligibility Score</strong> (Approval threshold: ≥ 65%).</li>`
    );
    items.push(
      hi
        ? `<li><strong>क्रेडिट ब्यूरो मूल्यांकन (सिबिल ${cibilVal} — ${cibilTier}):</strong> स्कोर पर प्रभाव <strong>${fmtImp(creditImp)}</strong>। ${cibilVal >= 650 ? 'स्वच्छ ब्यूरो रिकॉर्ड 650 के मानक को पार करता है।' : 'स्कोर 650 के न्यूनतम मानक से नीचे होने के कारण जोखिम कटौती लागू हुई।'}</li>`
        : `<li><strong>Credit Bureau Assessment (CIBIL ${cibilVal} — ${cibilTier}):</strong> Model impact <strong>${fmtImp(creditImp)}</strong>. ${cibilVal >= 650 ? 'Clean bureau track satisfies the ≥ 650 credit threshold.' : 'Subprime score below the 650 qualifying threshold applied a risk discount.'}</li>`
    );
    items.push(
      hi
        ? `<li><strong>मासिक पुनर्भुगतान क्षमता एवं आय कवरेज:</strong> आधार मूलधन DTI <strong>${baseDtiPct}%</strong> (ब्याज सहित अनुबंधित FOIR ${effectiveFoirPct}%), LTI <strong>${pred.ratios?.ltiRatio ?? 0}x</strong> — प्रभाव <strong>${fmtImp(dtiImp)} DTI / ${fmtImp(covImp)} कवरेज</strong>।</li>`
        : `<li><strong>Repayment Burden &amp; Income Coverage:</strong> Base principal DTI <strong>${baseDtiPct}%</strong> (Contractual FOIR ${effectiveFoirPct}% with interest), LTI <strong>${pred.ratios?.ltiRatio ?? 0}x</strong> — impact <strong>${fmtImp(dtiImp)} DTI / ${fmtImp(covImp)} Coverage</strong>.</li>`
    );
    items.push(
      hi
        ? `<li><strong>आजीविका एवं आय दस्तावेज़:</strong> ${escapeHtml(empBase)} (${slipTag}) — प्रभाव <strong>${fmtImp(slipImp)} दस्तावेज़ / ${fmtImp(empImp)} आजीविका</strong>।</li>`
        : `<li><strong>Employment &amp; Income Verification:</strong> ${escapeHtml(empBase)} (${slipTag}) — impact <strong>${fmtImp(slipImp)} Docs / ${fmtImp(empImp)} Livelihood</strong>.</li>`
    );
    items.push(
      hi
        ? `<li><strong>सह-आवेदक एवं क्षेत्रीय समता:</strong> सह-आवेदक आय ₹${coappInc.toLocaleString('en-IN')}/माह, ${escapeHtml(localizeArea(app.property_area || 'Urban', 'hi'))} क्षेत्र — प्रभाव <strong>${fmtImp(coappImp)} सह-आवेदक / ${fmtImp(areaImp)} क्षेत्र</strong>।</li>`
        : `<li><strong>Co-Applicant Support &amp; Regional Equity:</strong> Co-applicant ₹${coappInc.toLocaleString('en-IN')}/mo, ${escapeHtml(localizeArea(app.property_area || 'Urban', 'en'))} territory — impact <strong>${fmtImp(coappImp)} Co-Applicant / ${fmtImp(areaImp)} Territory</strong>.</li>`
    );

    const remText = String(app.officer_remarks || '').trim();
    if (isOfficerFinal || remText) {
      items.push(
        hi
          ? `<li><strong>संस्थागत अधिकारी निर्णय (${offStatusText}):</strong> ${remText ? escapeHtml(remText) : 'संस्थागत रिकॉर्ड में दर्ज।'}</li>`
          : `<li><strong>Institutional Officer Adjudication (${offStatusText}):</strong> ${remText ? escapeHtml(remText) : 'Recorded in central institutional vault.'}</li>`
      );
    }

    const explanations = generatePlainLanguageExplanations(pred, app, state.currentLang);
    if (explanations && Array.isArray(explanations.actions) && explanations.actions.length > 0) {
      items.push(
        hi
          ? `<li><strong>सुधार / पात्रता मार्गदर्शन:</strong> ${explanations.actions.join(' ')}</li>`
          : `<li><strong>Remediation &amp; Eligibility Guidance:</strong> ${explanations.actions.join(' ')}</li>`
      );
    }

    factorsList.innerHTML = items.join('');
  }

  const sigNameEl = document.getElementById('let-signatory-name');
  if (sigNameEl) {
    if (isOfficerFinal) {
      const officerActor = currentAuthUser?.role === 'officer' && currentAuthUser?.full_name
        ? `${currentAuthUser.full_name} (Loan Officer)`
        : (hi ? 'अधिकृत ऋण अधिकारी • रिनदृष्टि वॉल्ट' : 'Authorized Loan Officer • RinDristi Vault');
      sigNameEl.innerText = `${officerActor} • ${decisionStr}`;
    } else {
      sigNameEl.innerText = hi
        ? `रिनदृष्टि XAI इंजन • ${decisionStr} (अधिकारी हस्ताक्षर शेष)`
        : `RinDristi XAI Engine • ${decisionStr} (Awaiting Officer Sign-Off)`;
    }
  }

  document.body.classList.add('letter-modal-open');
  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) modalContent.scrollTop = 0;
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
    if (res.status === 401) {
      const errData = await res.json().catch(() => ({}));
      if (handleApiAuthFailure(res, errData)) return;
    }
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
    window.showRinDristiToast(hi ? 'केवल ऋण अधिकारी ही वॉल्ट बैकअप डाउनलोड कर सकते हैं।' : 'Officer clearance required to download vault backup.', true);
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/officer/backup?format=sqlite`, {
      headers: buildAuthHeaders()
    });
    if (res.status === 401) {
      const errData = await res.json().catch(() => ({}));
      if (handleApiAuthFailure(res, errData)) return;
    }
    if (res.status === 401 || res.status === 403) {
      window.showRinDristiToast(hi ? 'अस्वीकृत: डेटाबेस बैकअप डाउनलोड करने के लिए अधिकारी प्रमाणन आवश्यक है।' : 'Forbidden: Verified officer session required for SQLite backup.', true);
      return;
    }
    if (!res.ok) {
      window.showRinDristiToast(hi ? 'वॉल्ट बैकअप डाउनलोड करने में त्रुटि हुई।' : 'Failed to generate vault SQLite backup.', true);
      return;
    }
    const blob = await res.blob();
    const dbFilename = `rindristi_loans_backup_${new Date().toISOString().substring(0, 10)}.db`;
    if (window.AndroidBridge && typeof window.AndroidBridge.saveBase64File === 'function') {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = String(reader.result || '');
        const idx = dataUrl.indexOf(',');
        const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : '';
        if (b64) {
          window.AndroidBridge.saveBase64File(dbFilename, 'application/x-sqlite3', b64);
        }
      };
      reader.readAsDataURL(blob);
      window.showRinDristiToast(hi ? '💽 SQLite वॉल्ट बैकअप डाउनलोड हो रहा है!' : '💽 Saving SQLite Vault backup...');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = dbFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    window.showRinDristiToast(hi ? '💽 SQLite वॉल्ट बैकअप डाउनलोड हो गया!' : '💽 SQLite Vault backup downloaded successfully!');
  } catch (e) {
    window.showRinDristiToast(hi ? 'वॉल्ट बैकअप डाउनलोड करने में नेटवर्क त्रुटि।' : 'Network error downloading vault backup.', true);
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

  if (weights.length === 0) {
    await ensureDatasetLoaded();
    if (typeof RINDRISTI_DATASET !== 'undefined' && RINDRISTI_DATASET.weights) {
      weights = Object.entries(RINDRISTI_DATASET.weights).map(([feature, weight]) => ({ feature, weight }));
    }
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

  if (!report) {
    await ensureDatasetLoaded();
  }
  if (!report && typeof RINDRISTI_DATASET !== 'undefined' && Array.isArray(RINDRISTI_DATASET.records)) {
    const recs = RINDRISTI_DATASET.records;
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

async function renderPortfolioTable() {
  if (currentAuthUser?.role !== 'officer') return;
  const tbody = document.getElementById('portfolio-table-body');
  const countLabel = document.getElementById('portfolio-total-count');
  const pageIndicator = document.getElementById('portfolio-page-indicator');
  if (!tbody) return;
  const hi = state.currentLang === 'hi';

  if (typeof RINDRISTI_DATASET === 'undefined' || !RINDRISTI_DATASET.records) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #4B6359;">${hi ? 'ऐतिहासिक पोर्टफोलियो रिकॉर्ड लोड हो रहे हैं...' : 'Loading historical portfolio dataset...'}</td></tr>`;
    await ensureDatasetLoaded();
  }
  if (typeof RINDRISTI_DATASET === 'undefined' || !RINDRISTI_DATASET.records) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #DC2626;">${hi ? 'ऐतिहासिक डेटासेट लोड नहीं हो सका।' : 'Historical portfolio dataset unavailable.'}</td></tr>`;
    return;
  }

  let records = RINDRISTI_DATASET.records;

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
  if (typeof RINDRISTI_DATASET === 'undefined' || !RINDRISTI_DATASET.records) {
    await ensureDatasetLoaded();
  }
  if (typeof RINDRISTI_DATASET === 'undefined' || !RINDRISTI_DATASET.records) return;
  const r = RINDRISTI_DATASET.records.find(rec => rec.id === caseId);
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
    phone: '',
    applicant_email: '',
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
    created_at: '',
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

function registerAppServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  }
}

function restartAvailabilityPolling(intervalSec = 20) {
  if (availabilityPollTimerId) {
    clearInterval(availabilityPollTimerId);
    availabilityPollTimerId = null;
  }
  const sec = Number(intervalSec);
  if (!isNaN(sec) && sec > 0) {
    availabilityPollTimerId = setInterval(() => {
      window.checkSiteAvailability();
    }, sec * 1000);
  }
}

function applyApplicationFormDefaultsFromSettings(settingsObj) {
  const s = settingsObj || activeUserSettings || getDefaultUserSettings('applicant');
  const areaEl = document.getElementById('fill-property-area');
  if (areaEl && s.defaultPropertyArea) {
    areaEl.value = s.defaultPropertyArea;
  }
  const purpEl = document.getElementById('fill-loan-purpose');
  if (purpEl && s.defaultLoanPurpose) {
    purpEl.value = s.defaultLoanPurpose;
  }
  const years = Math.max(1, Math.min(30, parseInt(s.defaultLoanYears || 5, 10) || 5));
  const yearsSlider = document.getElementById('fill-loan-years');
  const yearsNum = document.getElementById('fill-exact-years');
  if (yearsSlider) yearsSlider.value = String(years);
  if (yearsNum) yearsNum.value = String(years);
  if (typeof window.updateFillTenureDisplay === 'function') {
    window.updateFillTenureDisplay(years);
  }
}

function applyUserSettingsToApp(settingsObj, options = { renderTables: true }) {
  const s = settingsObj || activeUserSettings || getDefaultUserSettings(currentAuthUser?.role || state.currentRole);
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';
  applyVisualSettingsToDOM(s);

  const whatIfCard = document.getElementById('what-if-card');
  if (whatIfCard) {
    whatIfCard.style.display = s.showSimulatorSection === false ? 'none' : '';
  }
  const roadmapCard = document.getElementById('applicant-roadmap-card');
  if (roadmapCard) {
    roadmapCard.style.display = s.showRoadmapSection === false ? 'none' : '';
  }
  const offSiteCard = document.getElementById('officer-site-control-card');
  if (offSiteCard) {
    offSiteCard.style.display = s.showOfficerSiteCard === false ? 'none' : '';
  }

  if (isOfficer) {
    const newPageSize = Number(s.portfolioPageSize || 10);
    if (state.portfolioPageSize !== newPageSize) {
      state.portfolioPageSize = newPageSize;
      state.portfolioPage = 1;
    }
    state.affirmativeMode = Boolean(s.defaultAffirmativeMode);
    const affToggle = document.getElementById('affirmative-toggle');
    if (affToggle) affToggle.checked = state.affirmativeMode;
    if (options && options.renderTables) {
      renderPortfolioTable();
      renderFairnessCharts();
    }
  }

  if (options && options.renderTables && currentAuthUser) {
    renderDatabaseTableRows(state.savedDatabaseApps || []);
  }

  restartAvailabilityPolling(s.syncIntervalSec !== undefined ? s.syncIntervalSec : 20);
  updateSettingsModalStatusUI();
}

function updateSettingsModalStatusUI() {
  const hi = state.currentLang === 'hi';
  const dict = getLangDict();
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';

  const rolePill = document.getElementById('settings-role-pill');
  const profRoleTag = document.getElementById('settings-prof-role-tag');
  const roleText = isOfficer ? dict.role_badge_officer : dict.role_badge_applicant;
  if (rolePill) {
    rolePill.innerText = roleText;
    rolePill.className = `badge ${isOfficer ? 'badge-warning' : 'badge-info'}`;
  }
  if (profRoleTag) {
    profRoleTag.innerText = roleText;
    profRoleTag.className = `badge ${isOfficer ? 'badge-warning' : 'badge-success'}`;
  }

  const cloudPill = document.getElementById('settings-cloud-pill');
  if (cloudPill) {
    if (state.backendConnected) {
      cloudPill.className = 'badge badge-success';
      cloudPill.innerText = hi ? 'क्लाउड सिंक सक्रिय' : 'Cloud Sync Active';
    } else {
      cloudPill.className = 'badge badge-warning';
      cloudPill.innerText = hi ? 'लोकल फ़ॉलबैक मोड' : 'Local Fallback Mode';
    }
  }

  const siteBadge = document.getElementById('settings-site-status-badge');
  if (siteBadge) {
    const isOnline = state.siteAvailability?.online !== false;
    siteBadge.className = `badge ${isOnline ? 'badge-success' : 'badge-danger'}`;
    siteBadge.innerText = isOnline ? dict.badge_online : dict.badge_offline;
  }

  const queueCountEl = document.getElementById('settings-offline-queue-count');
  if (queueCountEl) {
    const qLen = typeof readOfflineQueue === 'function' ? readOfflineQueue().length : 0;
    queueCountEl.innerText = String(qLen);
  }
}

function syncSettingsModalFields(settingsObj) {
  const s = settingsObj || activeUserSettings || getDefaultUserSettings(currentAuthUser?.role);
  const chosenTheme = s.theme || 'classic';
  document.querySelectorAll('#settings-theme-grid .settings-theme-card').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === chosenTheme);
  });

  setValue('setting-font-size', s.fontSize || 'normal');
  setValue('setting-density', s.density || 'comfortable');
  const hcEl = document.getElementById('setting-high-contrast');
  if (hcEl) hcEl.checked = Boolean(s.highContrast);
  const rmEl = document.getElementById('setting-reduced-motion');
  if (rmEl) rmEl.checked = Boolean(s.reducedMotion);
  const toastEl = document.getElementById('setting-show-toasts');
  if (toastEl) toastEl.checked = s.showToasts !== false;
  const privEl = document.getElementById('setting-privacy-mask');
  if (privEl) privEl.checked = Boolean(s.privacyMaskVault);

  setValue('setting-app-start-tab', s.applicantStartTab || 'apply-view');
  setValue('setting-default-area', s.defaultPropertyArea || 'Rural');
  setValue('setting-default-tenure', String(s.defaultLoanYears || 5));
  setValue('setting-default-purpose', s.defaultLoanPurpose || 'Home Improvement / Construction');
  const simEl = document.getElementById('setting-show-simulator');
  if (simEl) simEl.checked = s.showSimulatorSection !== false;
  const roadEl = document.getElementById('setting-show-roadmap');
  if (roadEl) roadEl.checked = s.showRoadmapSection !== false;
  const autoSyncEl = document.getElementById('setting-auto-sync-offline');
  if (autoSyncEl) autoSyncEl.checked = s.autoSyncOffline !== false;

  setValue('setting-off-start-tab', s.officerStartTab || 'officer-view');
  setValue('setting-portfolio-page-size', String(s.portfolioPageSize || 10));
  const affEl = document.getElementById('setting-default-affirmative');
  if (affEl) affEl.checked = Boolean(s.defaultAffirmativeMode);
  const siteCardEl = document.getElementById('setting-show-officer-site-card');
  if (siteCardEl) siteCardEl.checked = s.showOfficerSiteCard !== false;

  setValue('setting-sync-interval', String(s.syncIntervalSec !== undefined ? s.syncIntervalSec : 20));
}

function readSettingsModalIntoObject() {
  const role = currentAuthUser?.role === 'officer' ? 'officer' : 'applicant';
  const activeThemeBtn = document.querySelector('#settings-theme-grid .settings-theme-card.active');
  const theme = activeThemeBtn?.getAttribute('data-theme-choice') || draftUserSettings.theme || 'classic';
  const syncVal = parseInt(document.getElementById('setting-sync-interval')?.value ?? '20', 10);

  return {
    theme,
    fontSize: document.getElementById('setting-font-size')?.value || 'normal',
    density: document.getElementById('setting-density')?.value || 'comfortable',
    highContrast: Boolean(document.getElementById('setting-high-contrast')?.checked),
    reducedMotion: Boolean(document.getElementById('setting-reduced-motion')?.checked),
    showToasts: Boolean(document.getElementById('setting-show-toasts')?.checked),
    privacyMaskVault: Boolean(document.getElementById('setting-privacy-mask')?.checked),
    syncIntervalSec: isNaN(syncVal) ? 20 : syncVal,
    applicantStartTab: document.getElementById('setting-app-start-tab')?.value || 'apply-view',
    defaultPropertyArea: document.getElementById('setting-default-area')?.value || 'Rural',
    defaultLoanYears: parseInt(document.getElementById('setting-default-tenure')?.value || '5', 10) || 5,
    defaultLoanPurpose: document.getElementById('setting-default-purpose')?.value || 'Home Improvement / Construction',
    showSimulatorSection: Boolean(document.getElementById('setting-show-simulator')?.checked),
    showRoadmapSection: Boolean(document.getElementById('setting-show-roadmap')?.checked),
    autoSyncOffline: Boolean(document.getElementById('setting-auto-sync-offline')?.checked),
    officerStartTab: document.getElementById('setting-off-start-tab')?.value || 'officer-view',
    portfolioPageSize: parseInt(document.getElementById('setting-portfolio-page-size')?.value || '10', 10) || 10,
    defaultAffirmativeMode: Boolean(document.getElementById('setting-default-affirmative')?.checked),
    showOfficerSiteCard: Boolean(document.getElementById('setting-show-officer-site-card')?.checked),
    roleContext: role
  };
}

function setSettingsProfileFeedback(msg = '', isError = false) {
  const el = document.getElementById('settings-profile-msg');
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.innerText = '';
    return;
  }
  el.className = isError ? 'auth-alert auth-alert-error' : 'auth-alert auth-alert-success';
  el.innerText = (isError ? '⚠️ ' : '✅ ') + msg;
  el.style.display = 'block';
}

function syncDisplayedUserIdentity() {
  const fullName = String(currentAuthUser?.full_name || '').trim();
  const email = String(currentAuthUser?.email || '').trim();
  const displayName = fullName || email || '-';
  const initialChar = displayName && displayName !== '-' ? Array.from(displayName)[0].toUpperCase() : '👤';

  const headerNameEl = document.getElementById('user-display-name');
  if (headerNameEl) headerNameEl.innerText = fullName || email;

  const avatarEl = document.getElementById('settings-prof-avatar');
  if (avatarEl) avatarEl.innerText = initialChar;

  const nameEl = document.getElementById('settings-prof-name');
  if (nameEl) nameEl.innerText = displayName;
  const emailEl = document.getElementById('settings-prof-email');
  if (emailEl) emailEl.innerText = email || '-';

  const inputName = document.getElementById('setting-prof-fullname');
  if (inputName) inputName.value = fullName;
  const inputEmail = document.getElementById('setting-prof-email');
  if (inputEmail) inputEmail.value = email;
}

window.syncProfileEmailOtpBoxVisibility = function() {
  const box = document.getElementById('otp-box-profile-email');
  if (!box) return;
  const currentEmail = String(currentAuthUser?.email || '').trim().toLowerCase();
  const typedEmail = String(document.getElementById('setting-prof-email')?.value || '').trim().toLowerCase();
  const changed = Boolean(currentAuthUser && typedEmail && typedEmail !== currentEmail);
  box.style.display = changed ? 'block' : 'none';
  if (!changed) {
    invalidateOtpScope('profile_email', true);
  } else {
    syncOtpUIStates();
  }
};

window.saveProfileIdentityFromSettings = async function(silentIfUnchanged = false) {
  const hi = state.currentLang === 'hi';
  if (!currentAuthUser) {
    return { ok: false, changed: false };
  }

  const nameInput = document.getElementById('setting-prof-fullname');
  const emailInput = document.getElementById('setting-prof-email');
  const otpInput = document.getElementById('setting-prof-otp');
  const saveBtn = document.getElementById('btn-save-profile-identity');

  const newName = (nameInput?.value || '').trim();
  const newEmail = (emailInput?.value || '').trim().toLowerCase();
  const oldName = String(currentAuthUser.full_name || '').trim();
  const oldEmail = String(currentAuthUser.email || '').trim().toLowerCase();

  if (newName === oldName && newEmail === oldEmail) {
    if (silentIfUnchanged) {
      setSettingsProfileFeedback('', false);
      return { ok: true, changed: false };
    }
    const unchangedMsg = hi
      ? 'कोई परिवर्तन नहीं मिला — आपका नाम और ईमेल पहले से अद्यतन हैं।'
      : 'No changes detected — your name and email are already up to date.';
    setSettingsProfileFeedback(unchangedMsg, false);
    return { ok: true, changed: false };
  }

  if (newName.length < 2) {
    const msg = hi ? 'कृपया कम से कम 2 अक्षरों का पूरा नाम दर्ज करें।' : 'Full Name must be at least 2 characters.';
    setSettingsProfileFeedback(msg, true);
    window.showRinDristiToast(msg, true);
    nameInput?.focus();
    return { ok: false, changed: true };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    const msg = hi ? 'कृपया वैध ईमेल पता दर्ज करें।' : 'Please enter a valid email address.';
    setSettingsProfileFeedback(msg, true);
    window.showRinDristiToast(msg, true);
    emailInput?.focus();
    return { ok: false, changed: true };
  }

  const emailChanged = newEmail !== oldEmail;
  let otpToken = '';
  let otpCode = '';
  if (emailChanged) {
    const st = otpState.profile_email;
    const rawOtp = (otpInput?.value || '').replace(/\s+/g, '');
    if (st && st.verified && st.email === newEmail && st.verificationToken) {
      otpToken = st.verificationToken;
    } else if (/^\d{6}$/.test(rawOtp)) {
      otpCode = rawOtp;
    } else {
      const msg = getLangDict().msg_profile_email_otp_required;
      setSettingsProfileFeedback(msg, true);
      window.showRinDristiToast(msg, true);
      window.syncProfileEmailOtpBoxVisibility();
      otpInput?.focus();
      return { ok: false, changed: true };
    }
  }

  const dict = getLangDict();
  const prevBtnHtml = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span>⏳</span> ${hi ? 'सहेज रहे हैं...' : 'Saving...'}`;
  }

  try {
    const reqBody = {
      full_name: newName,
      email: newEmail
    };
    if (emailChanged) {
      if (otpToken) reqBody.otp_verification_token = otpToken;
      if (otpCode) reqBody.otp_code = otpCode;
    }

    const res = await fetch(`${state.apiBase}/api/auth/profile`, {
      method: 'PATCH',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(reqBody)
    });
    const data = await res.json().catch(() => ({}));
    if (handleApiAuthFailure(res, data)) {
      return { ok: false, changed: true };
    }
    if (!res.ok || !data.success || !data.user) {
      const errMsg = data.error || (hi ? 'नाम और ईमेल अपडेट नहीं हो सके।' : 'Failed to update name and email.');
      setSettingsProfileFeedback(errMsg, true);
      window.showRinDristiToast(errMsg, true);
      if (data.code === 'EMAIL_OTP_REQUIRED' || data.code === 'EMAIL_OTP_INVALID') {
        invalidateOtpScope('profile_email', false);
        otpState.profile_email.statusKind = 'error';
        otpState.profile_email.rawError = errMsg;
        syncOtpUIStates();
        window.syncProfileEmailOtpBoxVisibility();
        otpInput?.focus();
      } else if (res.status === 409) {
        emailInput?.focus();
      }
      return { ok: false, changed: true };
    }

    currentAuthUser = { ...currentAuthUser, ...data.user };
    try {
      localStorage.setItem('rindristi_auth_user', JSON.stringify(currentAuthUser));
    } catch (e) {}

    invalidateOtpScope('profile_email', true);
    syncDisplayedUserIdentity();
    window.syncProfileEmailOtpBoxVisibility();
    const okMsg = hi
      ? 'नाम और ईमेल सफलतापूर्वक अपडेट हो गए!'
      : 'Name and email updated successfully!';
    setSettingsProfileFeedback(okMsg, false);
    if (!silentIfUnchanged) {
      window.showRinDristiToast(`✅ ${okMsg}`);
    }
    if (typeof window.refreshDatabaseTable === 'function') {
      window.refreshDatabaseTable().catch(() => {});
    }
    return { ok: true, changed: true };
  } catch (err) {
    const netMsg = hi
      ? `${state.apiBase} से संपर्क नहीं हो सका। कृपया ऑनलाइन होने पर पुनः प्रयास करें।`
      : `Unable to reach backend server at ${state.apiBase}. Please try again while online.`;
    setSettingsProfileFeedback(netMsg, true);
    window.showRinDristiToast(netMsg, true);
    return { ok: false, changed: true };
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = prevBtnHtml || `<span>💾</span> <span data-i18n="settings_btn_update_identity">${dict.settings_btn_update_identity}</span>`;
    }
  }
};

window.openSettingsModal = function() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  const hi = state.currentLang === 'hi';
  const isOfficer = currentAuthUser?.role === 'officer' || state.currentRole === 'officer';

  draftUserSettings = { ...activeUserSettings };

  invalidateOtpScope('profile_email', true);
  syncDisplayedUserIdentity();
  window.syncProfileEmailOtpBoxVisibility();
  setSettingsProfileFeedback('', false);

  const phoneEl = document.getElementById('settings-prof-phone');
  if (phoneEl) phoneEl.innerText = currentAuthUser?.phone || (hi ? 'फ़ोन दर्ज नहीं' : 'Phone not listed');

  const appSection = document.getElementById('settings-applicant-section');
  const offSection = document.getElementById('settings-officer-section');
  if (appSection) appSection.style.display = isOfficer ? 'none' : 'block';
  if (offSection) offSection.style.display = isOfficer ? 'block' : 'none';

  syncSettingsModalFields(draftUserSettings);
  updateSettingsModalStatusUI();
  modal.style.display = 'flex';
};

window.closeSettingsModal = function(revertPreview = true) {
  if (revertPreview) {
    applyVisualSettingsToDOM(activeUserSettings);
  }
  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'none';
};

window.previewSettingTheme = function(themeKey) {
  draftUserSettings.theme = themeKey || 'classic';
  document.querySelectorAll('#settings-theme-grid .settings-theme-card').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === draftUserSettings.theme);
  });
  applyVisualSettingsToDOM(draftUserSettings);
};

window.previewSettingDropdowns = function() {
  draftUserSettings.fontSize = document.getElementById('setting-font-size')?.value || 'normal';
  draftUserSettings.density = document.getElementById('setting-density')?.value || 'comfortable';
  applyVisualSettingsToDOM(draftUserSettings);
};

window.previewSettingToggles = function() {
  draftUserSettings.highContrast = Boolean(document.getElementById('setting-high-contrast')?.checked);
  draftUserSettings.reducedMotion = Boolean(document.getElementById('setting-reduced-motion')?.checked);
  applyVisualSettingsToDOM(draftUserSettings);
};

window.saveAndCloseSettingsModal = async function() {
  const hi = state.currentLang === 'hi';
  const profResult = await window.saveProfileIdentityFromSettings(true);
  if (profResult && profResult.ok === false) {
    return;
  }
  const nextSettings = readSettingsModalIntoObject();
  activeUserSettings = nextSettings;
  draftUserSettings = { ...nextSettings };
  saveUserSettingsToStorage(activeUserSettings);
  applyUserSettingsToApp(activeUserSettings, { renderTables: true });
  if (!state.hasApplied && currentAuthUser?.role !== 'officer') {
    applyApplicationFormDefaultsFromSettings(activeUserSettings);
  }
  window.closeSettingsModal(false);
  window.showRinDristiToast(
    hi
      ? (profResult?.changed ? '✅ नाम, ईमेल और वेबसाइट सेटिंग्स सहेजी व लागू की गईं।' : '✅ आपकी वेबसाइट और खाता सेटिंग्स सहेजी व लागू की गईं।')
      : (profResult?.changed ? '✅ Name, email & workspace settings saved and applied.' : '✅ Your website & workspace settings have been saved and applied.')
  );
};

window.resetUserSettingsToDefaults = function() {
  const hi = state.currentLang === 'hi';
  const role = currentAuthUser?.role === 'officer' ? 'officer' : 'applicant';
  const defaults = getDefaultUserSettings(role);
  activeUserSettings = defaults;
  draftUserSettings = { ...defaults };
  saveUserSettingsToStorage(defaults);
  syncSettingsModalFields(defaults);
  applyUserSettingsToApp(defaults, { renderTables: true });
  if (!state.hasApplied && role !== 'officer') {
    applyApplicationFormDefaultsFromSettings(defaults);
  }
  window.showRinDristiToast(
    hi
      ? '↺ सभी सेटिंग्स डिफ़ॉल्ट मानकों पर रीसेट हो गई हैं।'
      : '↺ All settings restored to default configuration.'
  );
};

window.openForgotPasswordFromSettings = function() {
  const userEmail = (currentAuthUser?.email || '').trim();
  const role = currentAuthUser?.role === 'officer' ? 'officer' : 'applicant';
  window.closeSettingsModal(true);
  window.openForgotPassword(role);
  if (userEmail) {
    const fpEmailEl = document.getElementById('fp-email');
    if (fpEmailEl) {
      fpEmailEl.removeAttribute('readonly');
      fpEmailEl.value = userEmail;
    }
  }
};

window.clearUserOfflineQueue = async function() {
  const hi = state.currentLang === 'hi';
  const count = readOfflineQueue().length;
  writeOfflineQueue([]);
  updateSettingsModalStatusUI();
  await window.refreshDatabaseTable();
  window.showRinDristiToast(
    count > 0
      ? (hi ? `🧹 ${count} ऑफ़लाइन ड्राफ्ट स्थानीय कतार से साफ़ किए गए।` : `🧹 Cleared ${count} pending draft(s) from local offline queue.`)
      : (hi ? 'ऑफ़लाइन कतार पहले से ही खाली है।' : 'Local offline queue is already empty.')
  );
};

window.quickToggleWebsiteAvailabilityFromSettings = async function() {
  await window.quickToggleWebsiteAvailability();
  updateSettingsModalStatusUI();
};

window.refreshConnectionFromSettings = async function() {
  await checkBackendConnection(true);
  await window.checkSiteAvailability(true);
  updateSettingsModalStatusUI();
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const rawUser = localStorage.getItem('rindristi_auth_user');
    if (rawUser) {
      const parsedUser = JSON.parse(rawUser);
      if (parsedUser && parsedUser.email) {
        activeUserSettings = loadUserSettings(parsedUser);
        applyVisualSettingsToDOM(activeUserSettings);
      }
    }
  } catch (e) {}
  registerAppServiceWorker();
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
  if (pendingPublicInfoSection) {
    window.openPublicInfoModal(pendingPublicInfoSection, false);
    pendingPublicInfoSection = null;
  } else if (pendingForgotPasswordModal && !currentAuthUser) {
    window.openForgotPassword(activePortal);
    pendingForgotPasswordModal = false;
  }
  syncDocumentSeoAndBreadcrumbs();
  restartAvailabilityPolling(activeUserSettings.syncIntervalSec !== undefined ? activeUserSettings.syncIntervalSec : 20);
});
