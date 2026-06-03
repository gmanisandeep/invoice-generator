/* ═══════════════════════════════════════════
   BILL BLUE — V1 Upgrade Logic
   ═══════════════════════════════════════════ */

// ── Storage Keys ──
var KEYS = {
  BUSINESS: 'billblue_business',
  INVOICES: 'billblue_invoices',
  COUNTER:  'billblue_counter'
};

// ── State ──
var itemCounter = 0;
var editingInvoiceId = null;
var qrInstance = null;
var subscriptionQRInstance = null;
var pendingUpgradePlan = null;
var dashFilter = 'all';

// Auth State
var currentUser = null; // Stored user metadata { uid, email, planType, subExpiry, paymentStatus, companyName }
var simulatedUsers = {}; // local simulation storage

// Charts
var chartRevenue = null;
var chartInvoices = null;
var chartProducts = null;

// ── DOM Cache ──
var itemsBody, subtotalEl, taxAmountEl, grandTotalEl, taxRateInput;
var invoiceNumberEl, invoiceDateEl, invoiceStatusEl, amountWordsEl;
var prevBalanceEl, receivedEl, balanceDueEl;
var taxPrintPct;

var THEMES = {
  blue: {
    '--primary': '#1e40af',
    '--primary-med': '#2563eb',
    '--primary-light': '#3b82f6',
    '--primary-soft': '#eff6ff',
    '--primary-hover': '#1e3a8a',
    '--primary-glow': 'rgba(37,99,235,.08)'
  },
  green: {
    '--primary': '#047857',
    '--primary-med': '#059669',
    '--primary-light': '#10b981',
    '--primary-soft': '#ecfdf5',
    '--primary-hover': '#065f46',
    '--primary-glow': 'rgba(5,150,105,.08)'
  },
  purple: {
    '--primary': '#5b21b6',
    '--primary-med': '#7c3aed',
    '--primary-light': '#8b5cf6',
    '--primary-soft': '#f5f3ff',
    '--primary-hover': '#4c1d95',
    '--primary-glow': 'rgba(124,58,237,.08)'
  },
  charcoal: {
    '--primary': '#111827',
    '--primary-med': '#1f2937',
    '--primary-light': '#4b5563',
    '--primary-soft': '#f9fafb',
    '--primary-hover': '#030712',
    '--primary-glow': 'rgba(31,41,55,.08)'
  }
};

function applyTheme(themeName) {
  var theme = THEMES.blue;
  var root = document.documentElement;
  for (var prop in theme) {
    root.style.setProperty(prop, theme[prop]);
  }
}

// ═══════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════
function loadData(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
}
function saveData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

// ═══════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════
function navigateTo(view) {
  if (!currentUser && view !== 'auth') {
    view = 'auth';
  }
  if (currentUser && view === 'auth') {
    var isAdmin = currentUser && currentUser.email && currentUser.email.toLowerCase() === 'admin@billblue.com';
    view = isAdmin ? 'admin' : 'dashboard';
  }
  
  if (view === 'admin') {
    var isAdmin = currentUser && currentUser.email && currentUser.email.toLowerCase() === 'admin@billblue.com';
    if (!isAdmin) {
      showToast('Access Denied: Administrative Portal Restricted!', 'error');
      view = 'dashboard';
    }
  }

  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active-view'); });
  var target = document.getElementById('view-' + view);
  if (target) { void target.offsetWidth; target.classList.add('active-view'); }
  document.querySelectorAll('.nav-item').forEach(function(i) {
    var isSubTabItem = i.hasAttribute('data-settings-tab');
    if (view === 'settings') {
      if (isSubTabItem) {
        var subTab = i.getAttribute('data-settings-tab');
        var activePanel = document.querySelector('.hub-panel.active-panel');
        var activePanelId = activePanel ? activePanel.id.replace('hub-panel-', '') : 'profile';
        i.classList.toggle('active', subTab === activePanelId);
      } else {
        i.classList.remove('active');
      }
    } else {
      if (isSubTabItem) {
        i.classList.remove('active');
      } else {
        i.classList.toggle('active', i.getAttribute('data-view') === view);
      }
    }
  });
  document.querySelectorAll('.mobile-nav-item').forEach(function(i) {
    var itemV = i.getAttribute('data-view');
    var itemTab = i.getAttribute('data-settings-tab');
    if (view === 'settings') {
      if (itemV === 'settings') {
        var activePanel = document.querySelector('.hub-panel.active-panel');
        var activeTab = activePanel ? activePanel.id.replace('hub-panel-', '') : 'profile';
        i.classList.toggle('active', itemTab === activeTab);
      } else {
        i.classList.remove('active');
      }
    } else {
      i.classList.toggle('active', itemV === view);
    }
  });
  
  // Update Breadcrumbs in desktop top header
  var breadcrumbsTitle = document.getElementById('desktop-breadcrumbs-title');
  if (breadcrumbsTitle) {
    var titleMap = {
      'dashboard': 'Dashboard Overview',
      'invoice': 'Tax Invoice Composer',
      'history': 'Customer Accounts Directory',
      'settings': 'Settings & Business Hub',
      'referral': 'Refer a Friend'
    };
    breadcrumbsTitle.textContent = titleMap[view] || 'SaaS Workspace';
  }

  if (view === 'dashboard') {
    var isPro = currentUser && currentUser.planType === 'pro';
    var wrap = document.getElementById('dashboard-wrapper');
    var paywall = document.getElementById('dashboard-paywall');
    if (wrap && paywall) {
      if (isPro) {
        wrap.classList.remove('restricted-blur');
        paywall.style.display = 'none';
        renderDashboard();
      } else {
        wrap.classList.add('restricted-blur');
        paywall.style.display = 'flex';
      }
    } else {
      renderDashboard();
    }
  }
  
  if (view === 'invoice') {
    applyBusinessToInvoice();
    checkSwipeHintVisibility();
  }
  if (view === 'history') renderHistory();
  if (view === 'settings') {
    loadSettingsForm();
    updatePWAInstallUI();
    switchSettingsTab('profile');
  }
  if (view === 'referral') {
    initReferralSystem();
  }
  if (view === 'admin') renderAdminPortal();
  window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
function init() {
  itemsBody       = document.getElementById('items-body');
  subtotalEl      = document.getElementById('subtotal');
  taxAmountEl     = document.getElementById('tax-amount');
  grandTotalEl    = document.getElementById('grand-total');
  taxRateInput    = document.getElementById('tax-rate');
  invoiceNumberEl = document.getElementById('invoice-number');
  invoiceDateEl   = document.getElementById('invoice-date');
  invoiceStatusEl = document.getElementById('invoice-status');
  amountWordsEl   = document.getElementById('amount-words');
  prevBalanceEl   = document.getElementById('prev-balance');
  receivedEl      = document.getElementById('received-amount');
  balanceDueEl    = document.getElementById('balance-due');
  taxPrintPct     = document.querySelector('.tax-print-pct');

  var biz = loadData(KEYS.BUSINESS);
  if (biz && biz.theme) {
    applyTheme(biz.theme);
  }

  initializeFirebase();

  // Check for mobile QR scanner installation action parameters (?action=download)
  var params = new URLSearchParams(window.location.search);
  if ((params.has('action') && (params.get('action') === 'download' || params.get('action') === 'install')) || params.has('ref')) {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isMobileDevice() && !isStandalone) {
      setTimeout(function() {
        openMobileDirectInstall();
      }, 1000); // Trigger beautifully right after splash screen fades
    }
  }

  // Collapsible Sidebar preferences check
  var isCollapsed = localStorage.getItem('billblue_sidebar_collapsed') === 'true';
  if (isCollapsed) {
    document.body.classList.add('sidebar-collapsed');
  }
}

function toggleSidebar() {
  var body = document.body;
  body.classList.toggle('sidebar-collapsed');
  var isCollapsed = body.classList.contains('sidebar-collapsed');
  localStorage.setItem('billblue_sidebar_collapsed', isCollapsed);
}
document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════
//  INVOICE NUMBER
// ═══════════════════════════════════════════
function getNextCounter() {
  var c = parseInt(localStorage.getItem(KEYS.COUNTER), 10);
  if (isNaN(c) || c < 1) c = 0;
  c++;
  localStorage.setItem(KEYS.COUNTER, c);
  return c;
}
function setNextInvoiceNumber() {
  invoiceNumberEl.value = 'INV-' + padNumber(getNextCounter(), 4);
}
function padNumber(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }
function setTodayDate() {
  var d = new Date();
  invoiceDateEl.value = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ═══════════════════════════════════════════
//  TAX TOGGLE
// ═══════════════════════════════════════════
function toggleTax() {
  var on = document.getElementById('tax-toggle').checked;
  document.getElementById('tax-row').style.display = on ? '' : 'none';
  recalculate();
}

// ═══════════════════════════════════════════
//  ITEM ROWS
// ═══════════════════════════════════════════
var UNITS = ['Nos','Kg','Gm','Ltr','Ml','Box','Pcs','Mtr','Ft','Sq.ft','Bag','Pair','Set','Doz','Ream','Roll','Ton','Qtl'];
function buildUnitOptions(sel) {
  var h = '';
  for (var i = 0; i < UNITS.length; i++) h += '<option' + (UNITS[i]===sel?' selected':'') + '>' + UNITS[i] + '</option>';
  return h;
}
function addItemRow(data) {
  itemCounter++;
  var d = data || {};
  var idx = itemsBody.querySelectorAll('tr').length + 1;
  var tr = document.createElement('tr');
  tr.dataset.id = itemCounter;
  tr.innerHTML =
    '<td class="td-sno">' + idx + '</td>' +
    '<td><input type="text" placeholder="Item name" class="item-name" list="products-datalist" oninput="handleProductAutocomplete(this)" value="' + escapeAttr(d.name||'') + '"></td>' +
    '<td><input type="text" placeholder="—" class="item-hsn" value="' + escapeAttr(d.hsn||'') + '"></td>' +
    '<td><input type="number" placeholder="1" min="0" class="item-qty td-qty-input" value="' + (d.qty||'') + '" oninput="recalculate()"></td>' +
    '<td><select class="item-unit-select item-unit">' + buildUnitOptions(d.unit||'Nos') + '</select></td>' +
    '<td><input type="number" placeholder="0" min="0" step="0.01" class="item-rate td-rate-input" value="' + (d.rate||'') + '" oninput="recalculate()"></td>' +
    '<td class="td-amount">' + formatINR((d.qty||0)*(d.rate||0)) + '</td>' +
    '<td class="no-print"><button class="btn-remove" onclick="removeItemRow(this)" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>';
  tr.style.opacity='0';tr.style.transform='translateY(4px)';
  itemsBody.appendChild(tr);
  requestAnimationFrame(function(){tr.style.transition='opacity .2s,transform .2s';tr.style.opacity='1';tr.style.transform='translateY(0)';});
  if (!data) tr.querySelector('.item-name').focus();
}
function removeItemRow(btn) {
  var row = btn.closest('tr');
  if (itemsBody.querySelectorAll('tr').length <= 1) { shakeEl(row); return; }
  row.style.transition='opacity .15s,transform .15s';row.style.opacity='0';row.style.transform='translateX(12px)';
  setTimeout(function(){row.remove();renumberRows();recalculate();},150);
}
function shakeEl(el){el.style.transition='transform .06s';el.style.transform='translateX(-3px)';setTimeout(function(){el.style.transform='translateX(3px)'},60);setTimeout(function(){el.style.transform='translateX(0)'},120);}
function renumberRows(){itemsBody.querySelectorAll('tr').forEach(function(r,i){r.querySelector('.td-sno').textContent=i+1;});}

// ═══════════════════════════════════════════
//  CALCULATIONS
// ═══════════════════════════════════════════
function recalculate() {
  var subtotal = 0;
  itemsBody.querySelectorAll('tr').forEach(function(row) {
    var q = parseFloat(row.querySelector('.item-qty').value) || 0;
    var r = parseFloat(row.querySelector('.item-rate').value) || 0;
    var amt = q * r;
    row.querySelector('.td-amount').textContent = formatINR(amt);
    subtotal += amt;
  });

  var taxOn = document.getElementById('tax-toggle').checked;
  var taxRate = taxOn ? (parseFloat(taxRateInput.value) || 0) : 0;
  var taxAmount = subtotal * (taxRate / 100);
  var total = subtotal + taxAmount;
  var prevBalance = parseFloat(prevBalanceEl.value) || 0;
  var grandTotal = total + prevBalance;
  var received = parseFloat(receivedEl.value) || 0;
  var balanceDue = grandTotal - received;

  subtotalEl.textContent = formatINR(subtotal);
  taxAmountEl.textContent = formatINR(taxAmount);
  grandTotalEl.textContent = formatINR(grandTotal);
  balanceDueEl.textContent = formatINR(balanceDue);
  amountWordsEl.textContent = amountToWords(grandTotal);

  var prevBalDisp = document.getElementById('prev-balance-display');
  if (prevBalDisp) prevBalDisp.textContent = formatINR(prevBalance);
  var recDisp = document.getElementById('received-display');
  if (recDisp) recDisp.textContent = formatINR(received);

  if (taxPrintPct) taxPrintPct.textContent = '(' + taxRate + '%)';
  updateQRCode(grandTotal);
}

function editTotalField(field) {
  var isPrev = field === 'prev-balance';
  var inputEl = document.getElementById(isPrev ? 'prev-balance' : 'received-amount');
  var label = isPrev ? 'Previous Balance' : 'Received Amount';
  var val = prompt('Enter ' + label + ':', inputEl.value || '0');
  if (val === null) return;
  var num = parseFloat(val);
  if (isNaN(num) || num < 0) num = 0;
  inputEl.value = num;
  recalculate();
}

// ═══════════════════════════════════════════
//  INDIAN CURRENCY
// ═══════════════════════════════════════════
function formatINR(amount) {
  if (isNaN(amount) || amount === 0) return '₹0.00';
  var neg = amount < 0; amount = Math.abs(amount);
  var parts = amount.toFixed(2).split('.');
  var intP = parts[0], decP = parts[1];
  var last3 = intP.slice(-3);
  var rest = intP.slice(0, -3);
  if (rest.length > 0) {
    last3 = ',' + last3;
    var f = '';
    for (var i = rest.length - 1, c = 0; i >= 0; i--, c++) {
      if (c > 0 && c % 2 === 0) f = ',' + f;
      f = rest[i] + f;
    }
    intP = f + last3;
  }
  return (neg?'-':'') + '₹' + intP + '.' + decP;
}

// ═══════════════════════════════════════════
//  AMOUNT IN WORDS
// ═══════════════════════════════════════════
var ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
var tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function w2(n){if(n<20)return ones[n];return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');}
function w3(n){if(n>=100)return ones[Math.floor(n/100)]+' Hundred'+(n%100?' and '+w2(n%100):'');return w2(n);}
function numWords(num){
  if(!num||num===0)return '';num=Math.floor(num);var r='';
  var cr=Math.floor(num/10000000);num%=10000000;
  var lk=Math.floor(num/100000);num%=100000;
  var th=Math.floor(num/1000);num%=1000;
  if(cr>0)r+=w3(cr)+' Crore ';if(lk>0)r+=w2(lk)+' Lakh ';
  if(th>0)r+=w2(th)+' Thousand ';if(num>0)r+=w3(num);
  return r.trim();
}
function amountToWords(amt){
  if(!amt||amt<=0)return 'Zero Rupees Only';
  var rup=Math.floor(amt),pai=Math.round((amt-rup)*100);
  var w='';if(rup>0)w=numWords(rup)+' Rupees';
  if(pai>0)w+=(w?' and ':'')+numWords(pai)+' Paise';
  return (w||'Zero Rupees')+' Only';
}

// ═══════════════════════════════════════════
//  QR CODE
// ═══════════════════════════════════════════
function updateQRCode(amount) {
  var c = document.getElementById('qr-code');
  if (!c) return;
  
  // Paywall check: UPI QR requires basic or pro
  var hasQR = currentUser && (currentUser.planType === 'basic' || currentUser.planType === 'pro');
  if (!hasQR) {
    c.innerHTML = '<div style="font-size:0.6rem; color:var(--text-muted); text-align:center; padding:12px 5px; border:1px dashed var(--border); border-radius:3px; background:var(--bg-warm); line-height:1.3;">UPI QR Locked<br><a href="#" style="color:var(--primary); font-weight:600; font-size:0.62rem;" onclick="openUpgradeModal(); event.stopPropagation();">Upgrade</a></div>';
    return;
  }
  
  var p = loadData(KEYS.BUSINESS);
  if (!p || !p.upi) return;
  
  if (typeof QRCode === 'undefined') {
    c.innerHTML = '<div style="font-size:0.6rem; color:var(--text-muted); text-align:center; padding:12px 5px; border:1px dashed var(--border); border-radius:3px; background:var(--bg-warm); line-height:1.3;">QR Library Offline</div>';
    return;
  }
  
  var upi = 'upi://pay?pa=' + encodeURIComponent(p.upi) + '&pn=' + encodeURIComponent(p.name||'Business') + '&am=' + (amount||0).toFixed(2) + '&cu=INR';
  c.innerHTML = '';
  try { qrInstance = new QRCode(c, { text:upi, width:100, height:100, colorDark:'#111827', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.M }); } catch(e) {}
}

// ═══════════════════════════════════════════
//  BUSINESS PROFILE
// ═══════════════════════════════════════════
function safeToggleUploadZoneClass(imgEl, className, isAdd) {
  if (!imgEl) return;
  var zone = imgEl.closest('.upload-zone');
  if (zone) {
    if (isAdd) zone.classList.add(className);
    else zone.classList.remove(className);
  }
}

function loadSettingsForm() {
  var p = loadData(KEYS.BUSINESS); if (!p) return;
  setVal('settings-name',p.name);setVal('settings-gst',p.gst);setVal('settings-phone',p.phone);
  setVal('settings-email',p.email);setVal('settings-address',p.address);
  setVal('settings-bank',p.bank);setVal('settings-acc-holder',p.accHolder);
  setVal('settings-acc-number',p.accNumber);setVal('settings-ifsc',p.ifsc);setVal('settings-upi',p.upi);
  setVal('settings-terms',p.terms);
  var consentToggle = document.getElementById('settings-consent');
  if (consentToggle) consentToggle.checked = (p.analyticsConsent !== false);
  
  var configToggleInput = document.getElementById('settings-firebase-config');
  if (configToggleInput) {
    var savedConf = localStorage.getItem('billblue_firebase_config');
    configToggleInput.value = savedConf || '';
  }
  
  var stEl=document.getElementById('settings-state');
  if(p.state){for(var i=0;i<stEl.options.length;i++){if(stEl.options[i].text===p.state||stEl.options[i].value===p.state){stEl.selectedIndex=i;break;}}}
  
  var themeEl=document.getElementById('settings-theme');
  if(themeEl && p.theme){themeEl.value=p.theme;}
  
  if(p.logo){var li=document.getElementById('settings-logo-img');li.src=p.logo;li.style.display='block';document.getElementById('logo-placeholder').style.display='none';safeToggleUploadZoneClass(li, 'has-image', true);}
  if(p.signature){var si=document.getElementById('settings-sig-img');si.src=p.signature;si.style.display='block';document.getElementById('sig-placeholder').style.display='none';safeToggleUploadZoneClass(si, 'has-image', true);}
  
  // Handle Pro remove branding checkbox
  var brandingGroup = document.getElementById('settings-branding-group');
  if (brandingGroup) {
    var plan = currentUser ? (currentUser.planType || 'free') : 'free';
    if (plan === 'pro') {
      brandingGroup.style.display = 'block';
      var removeBrandingInput = document.getElementById('settings-remove-branding');
      if (removeBrandingInput) {
        removeBrandingInput.checked = (p.removeBranding === true);
      }
    } else {
      brandingGroup.style.display = 'none';
      var removeBrandingInput = document.getElementById('settings-remove-branding');
      if (removeBrandingInput) removeBrandingInput.checked = false;
    }
  }
}
function saveBusinessProfile() {
  var old=loadData(KEYS.BUSINESS)||{};
  var consentToggle = document.getElementById('settings-consent');
  var removeBrandingInput = document.getElementById('settings-remove-branding');
  var p={name:getVal('settings-name'),gst:getVal('settings-gst'),phone:getVal('settings-phone'),email:getVal('settings-email'),
    address:getVal('settings-address'),state:document.getElementById('settings-state').value,
    theme:'blue',
    bank:getVal('settings-bank'),accHolder:getVal('settings-acc-holder'),accNumber:getVal('settings-acc-number'),
    ifsc:getVal('settings-ifsc'),upi:getVal('settings-upi'),terms:getVal('settings-terms'),
    analyticsConsent: consentToggle ? consentToggle.checked : true,
    removeBranding: removeBrandingInput ? removeBrandingInput.checked : false,
    logo:old.logo||null,signature:old.signature||null};
  saveData(KEYS.BUSINESS,p);
  syncSavedProfile(p);
  applyTheme(p.theme);
  applyBusinessToInvoice();
  
  var configInput = document.getElementById('settings-firebase-config');
  if (configInput) {
    var oldConf = localStorage.getItem('billblue_firebase_config') || '';
    var newConf = configInput.value.trim();
    if (newConf !== oldConf) {
      localStorage.setItem('billblue_firebase_config', newConf);
      showToast('Firebase Config updated! Reloading panel...', 'info');
      setTimeout(function() { window.location.reload(); }, 1200);
    } else {
      showToast('Settings saved successfully!', 'success');
    }
  } else {
    showToast('Settings saved successfully!', 'success');
  }
}
function handleLogoUpload(e){handleImgUpload(e,'settings-logo-img','logo-placeholder','logo');}
function handleSignatureUpload(e){handleImgUpload(e,'settings-sig-img','sig-placeholder','signature');}
function handleImgUpload(e,imgId,phId,key){
  var f=e.target.files[0];if(!f)return;if(f.size>2*1024*1024){showToast('Max 2MB','error');return;}
  var r=new FileReader();r.onload=function(ev){
    var b=ev.target.result,p=loadData(KEYS.BUSINESS)||{};p[key]=b;saveData(KEYS.BUSINESS,p);
    var img=document.getElementById(imgId);img.src=b;img.style.display='block';
    document.getElementById(phId).style.display='none';safeToggleUploadZoneClass(img, 'has-image', true);
    showToast('Uploaded!','success');
  };r.readAsDataURL(f);
}
function applyBusinessToInvoice() {
  var p = loadData(KEYS.BUSINESS); if (!p) return;
  document.getElementById('inv-business-name').textContent = p.name || 'Your Business Name';
  if(p.gst){document.getElementById('inv-gst').textContent=p.gst;document.getElementById('inv-gst-line').style.display='';}else{document.getElementById('inv-gst-line').style.display='none';}
  document.getElementById('inv-business-phone').textContent=p.phone?'Ph: '+p.phone:'';
  document.getElementById('inv-business-email').textContent=p.email?'Email: '+p.email:'';
  var addr=p.address||'';if(p.state)addr+=(addr?', ':'')+p.state;
  document.getElementById('inv-business-address').textContent=addr;
  if(p.logo){document.getElementById('inv-logo').src=p.logo;document.getElementById('inv-logo-area').style.display='';}else{document.getElementById('inv-logo-area').style.display='none';}
  var hasBank=p.bank||p.accHolder||p.accNumber||p.ifsc||p.upi;
  if(hasBank){document.getElementById('inv-payment-section').style.display='';document.getElementById('inv-bank-name').textContent=p.bank||'—';document.getElementById('inv-account-holder').textContent=p.accHolder||'—';document.getElementById('inv-account-number').textContent=p.accNumber||'—';document.getElementById('inv-ifsc').textContent=p.ifsc||'—';document.getElementById('inv-upi').textContent=p.upi||'—';}else{document.getElementById('inv-payment-section').style.display='none';}
  if(p.upi)updateQRCode(parseGrandTotal());
  if(p.terms){document.getElementById('inv-terms-text').textContent=p.terms;document.getElementById('inv-terms-block').style.display='';}else{document.getElementById('inv-terms-block').style.display='none';}
  if(p.signature){document.getElementById('inv-signature-img').src=p.signature;document.getElementById('inv-sig-wrap').style.display='';}else{document.getElementById('inv-sig-wrap').style.display='none';}
  
  // Handle A4 invoice branding visibility based on subscription settings
  var brandingFooter = document.getElementById('invoice-branding-footer');
  if (brandingFooter) {
    var plan = currentUser ? (currentUser.planType || 'free') : 'free';
    if (plan === 'pro' && p.removeBranding === true) {
      brandingFooter.style.display = 'none';
    } else {
      brandingFooter.style.display = 'block';
    }
  }
}

// ═══════════════════════════════════════════
//  SAVE / LOAD / DELETE
// ═══════════════════════════════════════════
function saveInvoice() {
  if (!editingInvoiceId && !checkFeatureAccess('invoice-generation')) {
    return;
  }
  var cn=getVal('customer-name');
  if(!cn){highlightField(document.getElementById('customer-name'));showToast('Enter customer name','error');return;}
  var items=[];
  itemsBody.querySelectorAll('tr').forEach(function(row){
    items.push({name:row.querySelector('.item-name').value.trim(),hsn:row.querySelector('.item-hsn').value.trim(),
      qty:parseFloat(row.querySelector('.item-qty').value)||0,unit:row.querySelector('.item-unit').value,
      rate:parseFloat(row.querySelector('.item-rate').value)||0});
  });
  var sub=0;items.forEach(function(i){sub+=i.qty*i.rate;});
  var taxOn=document.getElementById('tax-toggle').checked;
  var taxRate=taxOn?(parseFloat(taxRateInput.value)||0):0;
  var taxAmt=sub*(taxRate/100);var total=sub+taxAmt;
  var prevBal=parseFloat(prevBalanceEl.value)||0;
  var grand=total+prevBal;
  var received=parseFloat(receivedEl.value)||0;
  var inv={id:editingInvoiceId||generateId(),number:invoiceNumberEl.value,date:invoiceDateEl.value,
    status:invoiceStatusEl.value,customerName:cn,customerPhone:getVal('customer-phone'),
    customerAddr:getVal('customer-address'),items:items,subtotal:sub,taxOn:taxOn,taxRate:taxRate,
    taxAmount:taxAmt,total:total,prevBalance:prevBal,grandTotal:grand,received:received,
    balanceDue:grand-received,createdAt:editingInvoiceId?((getInvoiceById(editingInvoiceId)||{}).createdAt||Date.now()):Date.now()};
  var all=loadData(KEYS.INVOICES)||[];
  if(editingInvoiceId){var idx=all.findIndex(function(i){return i.id===editingInvoiceId;});if(idx!==-1)all[idx]=inv;else all.push(inv);}else{all.push(inv);}
  saveData(KEYS.INVOICES,all);
  
  // Auto stock depletion tracking
  var prods = getProducts();
  items.forEach(function(item) {
    var found = prods.find(function(p) { return p.name.toLowerCase() === item.name.toLowerCase(); });
    if (found) {
      found.stock = Math.max(0, found.stock - item.qty);
      syncProductToDb(found);
    }
  });
  saveData('billblue_products', prods);
  if (typeof renderProductsList === 'function') renderProductsList();
  
  // Auto update customer dues / ledger records
  var custs = getCustomers();
  var foundCust = custs.find(function(c) { return c.name.toLowerCase() === cn.toLowerCase(); });
  if (foundCust) {
    if (inv.status === 'pending') {
      foundCust.balance += inv.balanceDue;
    }
    saveData('billblue_customers', custs);
    syncCustomerToDb(foundCust);
    if (typeof renderCustomersList === 'function') renderCustomersList();
  }

  showToast('Invoice '+inv.number+' saved!','success');
  syncSavedInvoice(inv);
  editingInvoiceId=null;document.getElementById('invoice-view-title').textContent='New Invoice';
  navigateTo('dashboard');resetInvoiceForm();
}
function resetInvoiceForm(){
  editingInvoiceId=null;document.getElementById('invoice-view-title').textContent='New Invoice';
  document.getElementById('customer-name').value='';document.getElementById('customer-phone').value='';
  document.getElementById('customer-address').value='';
  taxRateInput.value=18;invoiceStatusEl.value='pending';
  document.getElementById('tax-toggle').checked=false;document.getElementById('tax-row').style.display='none';
  prevBalanceEl.value=0;receivedEl.value=0;
  itemsBody.innerHTML='';itemCounter=0;setNextInvoiceNumber();setTodayDate();addItemRow();recalculate();
}
function clearInvoice(){
  var cn=document.getElementById('customer-name').value.trim();
  if(cn||itemsBody.querySelectorAll('tr').length>1){if(!confirm('Clear and start new invoice?'))return;}
  resetInvoiceForm();applyBusinessToInvoice();showToast('Cleared','success');
}
function loadInvoiceForEdit(id){
  var inv=getInvoiceById(id);if(!inv){showToast('Not found','error');return;}
  editingInvoiceId=id;navigateTo('invoice');
  document.getElementById('invoice-view-title').textContent='Edit Invoice';
  invoiceNumberEl.value=inv.number;invoiceDateEl.value=inv.date;invoiceStatusEl.value=inv.status||'pending';
  document.getElementById('customer-name').value=inv.customerName||'';
  document.getElementById('customer-phone').value=inv.customerPhone||'';
  document.getElementById('customer-address').value=inv.customerAddr||'';
  // Tax
  document.getElementById('tax-toggle').checked=!!inv.taxOn;
  document.getElementById('tax-row').style.display=inv.taxOn?'':'none';
  taxRateInput.value=inv.taxRate||18;
  prevBalanceEl.value=inv.prevBalance||0;
  receivedEl.value=inv.received||0;
  itemsBody.innerHTML='';itemCounter=0;
  if(inv.items&&inv.items.length){inv.items.forEach(function(i){addItemRow(i);});}else{addItemRow();}
  recalculate();applyBusinessToInvoice();
}
function deleteInvoice(id){
  if(!confirm('Delete this invoice?'))return;
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('invoices').doc(id).delete()
      .catch(function(e) { console.error("Firestore invoice deletion failed", e); });
  }
  
  var all=loadData(KEYS.INVOICES)||[];all=all.filter(function(i){return i.id!==id;});
  saveData(KEYS.INVOICES,all);showToast('Deleted','success');
  renderHistory();renderDashboard();
}
function toggleStatus(id){
  var all=loadData(KEYS.INVOICES)||[];var inv=all.find(function(i){return i.id===id;});
  if(inv){
    inv.status=inv.status==='paid'?'pending':'paid';
    saveData(KEYS.INVOICES,all);
    syncSavedInvoice(inv);
    renderHistory();
    renderDashboard();
    var displayStatus = inv.status.charAt(0).toUpperCase() + inv.status.slice(1);
    showToast('Invoice status updated to ' + displayStatus + '!', 'success');
  }
}
function getInvoiceById(id){return(loadData(KEYS.INVOICES)||[]).find(function(i){return i.id===id;})||null;}

// ═══════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════
var historyStatusFilter = 'all'; // 'all', 'paid', 'pending'
var historyDateFilter = 'all'; // 'all', 'today', 'week', 'month', 'year'

function setHistoryStatusFilter(status, btn) {
  historyStatusFilter = status;
  if (btn) {
    document.querySelectorAll('[data-hist-filter]').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
  }
  renderHistory();
}

function setHistoryDateFilter(dateRange, btn) {
  historyDateFilter = dateRange;
  if (btn) {
    document.querySelectorAll('[data-hist-date]').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
  }
  renderHistory();
}

function escapeJsString(str) {
  return str.replace(/'/g, "\'").replace(/"/g, '\"');
}

function renderHistory() {
  var invoices = loadData(KEYS.INVOICES) || [];
  var customers = getCustomers() || [];
  
  var customerMap = {};
  
  // Pre-populate with catalog customers so cards are always shown
  customers.forEach(function(c) {
    var key = c.name.trim().toLowerCase();
    if (key) {
      customerMap[key] = {
        name: c.name.trim(),
        phone: c.phone || '',
        address: c.address || '',
        dues: c.balance || 0,
        invoiceCount: 0,
        lastDate: '',
        lastTimestamp: 0,
        invoices: []
      };
    }
  });
  
  // Aggregate from local invoices
  invoices.forEach(function(inv) {
    if (!inv.customerName) return;
    var key = inv.customerName.trim().toLowerCase();
    if (!customerMap[key]) {
      customerMap[key] = {
        name: inv.customerName.trim(),
        phone: inv.customerPhone || '',
        address: inv.customerAddr || '',
        dues: 0,
        invoiceCount: 0,
        lastDate: '',
        lastTimestamp: 0,
        invoices: []
      };
    }
    
    var cData = customerMap[key];
    cData.invoices.push(inv);
    cData.invoiceCount++;
    
    if (inv.status === 'pending') {
      cData.dues += (inv.grandTotal || inv.total || 0);
    }
    
    var t = inv.createdAt || 0;
    if (t > cData.lastTimestamp) {
      cData.lastTimestamp = t;
      cData.lastDate = inv.date || '';
    }
  });
  
  var customerList = [];
  for (var key in customerMap) {
    customerList.push(customerMap[key]);
  }
  
  // Search
  var searchQuery = document.getElementById('history-search') ? document.getElementById('history-search').value.trim().toLowerCase() : '';
  if (searchQuery) {
    customerList = customerList.filter(function(c) {
      var matchName = c.name.toLowerCase().indexOf(searchQuery) !== -1;
      var matchPhone = c.phone.toLowerCase().indexOf(searchQuery) !== -1;
      var matchInvNo = c.invoices.some(function(inv) {
        return inv.number && inv.number.toLowerCase().indexOf(searchQuery) !== -1;
      });
      return matchName || matchPhone || matchInvNo;
    });
  }
  
  // Filters
  var today = getTodayStr();
  var dObj = new Date();
  
  customerList.forEach(function(c) {
    var filteredInvoices = c.invoices.filter(function(inv) {
      if (historyStatusFilter !== 'all') {
        if (inv.status !== historyStatusFilter) return false;
      }
      if (historyDateFilter !== 'all') {
        if (!inv.date) return false;
        if (historyDateFilter === 'today') return inv.date === today;
        if (historyDateFilter === 'week') {
          var day = dObj.getDay() || 7;
          var start = new Date(dObj); start.setDate(dObj.getDate() - day + 1);
          return inv.date >= dateStr(start) && inv.date <= today;
        }
        if (historyDateFilter === 'month') return inv.date.substring(0, 7) === today.substring(0, 7);
        if (historyDateFilter === 'year') return inv.date.substring(0, 4) === today.substring(0, 4);
      }
      return true;
    });
    
    c.filteredInvoices = filteredInvoices;
    c.invoiceCount = filteredInvoices.length;
    
    var fDues = 0;
    var lastT = 0;
    var lastD = '';
    filteredInvoices.forEach(function(inv) {
      if (inv.status === 'pending') {
        fDues += (inv.grandTotal || inv.total || 0);
      }
      var t = inv.createdAt || 0;
      if (t > lastT) {
        lastT = t;
        lastD = inv.date || '';
      }
    });
    c.dues = fDues;
    c.lastTimestamp = lastT;
    c.lastDate = lastD;
  });
  
  if (historyStatusFilter !== 'all' || historyDateFilter !== 'all' || searchQuery) {
    customerList = customerList.filter(function(c) {
      if (searchQuery && c.name.toLowerCase().indexOf(searchQuery) !== -1) return true;
      return c.invoiceCount > 0;
    });
  }
  
  // Sort
  var sortVal = document.getElementById('history-sort') ? document.getElementById('history-sort').value : 'activity';
  customerList.sort(function(a, b) {
    if (sortVal === 'activity') return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
    if (sortVal === 'name') return a.name.localeCompare(b.name);
    if (sortVal === 'dues') return (b.dues || 0) - (a.dues || 0);
    if (sortVal === 'invoices') return (b.invoiceCount || 0) - (a.invoiceCount || 0);
    return 0;
  });
  
  var grid = document.getElementById('history-customer-cards-grid');
  var em = document.getElementById('history-empty');
  
  if (!grid) return;
  grid.innerHTML = '';
  
  if (!customerList.length) {
    grid.style.display = 'none';
    em.style.display = 'flex';
    return;
  }
  
  grid.className = 'whatsapp-chat-list';
  grid.style.display = 'flex';
  grid.style.flexDirection = 'column';
  em.style.display = 'none';
  
  customerList.forEach(function(c) {
    var card = document.createElement('div');
    card.className = 'whatsapp-chat-item';
    card.setAttribute('onclick', "openCustomerHistory('" + escapeJsString(c.name) + "')");
    
    var nameParts = c.name.trim().split(/\s+/);
    var initials = '';
    if (nameParts.length > 0 && nameParts[0]) {
      initials += nameParts[0].charAt(0).toUpperCase();
      if (nameParts.length > 1 && nameParts[nameParts.length - 1]) {
        initials += nameParts[nameParts.length - 1].charAt(0).toUpperCase();
      }
    }
    if (!initials) initials = '👤';
    
    var lastActStr = c.lastDate ? 'Last active: ' + c.lastDate : 'No recent billing';
    var duesClass = c.dues > 0 ? 'dues-red' : 'paid-green';
    
    // Quick actions (WhatsApp reminder and Profile viewer)
    var waAction = '';
    if (c.dues > 0 && c.phone) {
      waAction = `
        <button class="chat-action-btn btn-wa" onclick="event.stopPropagation(); sendWhatsAppReminder('${escapeJsString(c.name)}', ${c.dues}, '${escapeJsString(c.phone)}')" title="Send WhatsApp Payment Reminder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        </button>
      `;
    }
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
        <div class="chat-avatar-wrapper">
          <div class="chat-avatar">${escapeHtml(initials)}</div>
          <span class="chat-badge">${c.invoiceCount}</span>
        </div>
        <div class="chat-details-block">
          <span class="chat-customer-name">${escapeHtml(c.name)}</span>
          <span class="chat-customer-phone">${escapeHtml(c.phone || 'No phone recorded')}</span>
          <span class="chat-last-activity">${escapeHtml(lastActStr)}</span>
        </div>
      </div>
      <div class="chat-right-block">
        <span class="chat-balance-due ${duesClass}">${formatINR(c.dues)}</span>
        <div class="chat-quick-actions">
          ${waAction}
          <button class="chat-action-btn" onclick="event.stopPropagation(); navigateTo('settings'); switchSettingsTab('customers'); openCustomerProfileByCustomerName('${escapeJsString(c.name)}')" title="View Customer Profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function openCustomerProfileByCustomerName(name) {
  var custs = getCustomers() || [];
  var found = custs.find(function(c) {
    return c.name.toLowerCase() === name.toLowerCase();
  });
  if (found) {
    openCustomerProfile(found.id);
  } else {
    showToast('Customer profile not found.', 'error');
  }
}

function fetchCustomerInvoices(customerName, callback) {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    var tbody = document.getElementById('history-invoices-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-sec);"><div class="loader" style="display:inline-block; margin-right:8px;"></div>Loading customer invoices from Firestore...</td></tr>';
    }
    
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('invoices')
      .where('customerName', '==', customerName)
      .get()
      .then(function(snap) {
        var localInvoices = loadData(KEYS.INVOICES) || [];
        var fetchedInvs = [];
        snap.forEach(function(d) {
          var inv = d.data();
          fetchedInvs.push(inv);
          
          var idx = localInvoices.findIndex(function(li) { return li.id === inv.id; });
          if (idx !== -1) {
            localInvoices[idx] = inv;
          } else {
            localInvoices.push(inv);
          }
        });
        saveData(KEYS.INVOICES, localInvoices);
        callback(fetchedInvs);
      })
      .catch(function(err) {
        console.error("Firestore on-demand fetch failed:", err);
        showToast('Offline mode: Loaded local records.', 'info');
        var localInvs = (loadData(KEYS.INVOICES) || []).filter(function(inv) {
          return inv.customerName && inv.customerName.toLowerCase() === customerName.toLowerCase();
        });
        callback(localInvs);
      });
  } else {
    var localInvs = (loadData(KEYS.INVOICES) || []).filter(function(inv) {
      return inv.customerName && inv.customerName.toLowerCase() === customerName.toLowerCase();
    });
    callback(localInvs);
  }
}

var activeHistoryCustomerName = '';
var activeHistoryCustomerInvoices = [];
var customerInvoiceStatusFilter = 'all';

function setCustomerInvoiceStatusFilter(status, btn) {
  customerInvoiceStatusFilter = status;
  document.querySelectorAll('[id^="btn-cust-inv-filter-"]').forEach(function(b) {
    b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  filterCustomerInvoices();
}

function filterCustomerInvoices() {
  var searchQuery = document.getElementById('cust-invoice-search') ? document.getElementById('cust-invoice-search').value.trim().toLowerCase() : '';
  
  var filtered = activeHistoryCustomerInvoices.filter(function(inv) {
    // Status filter
    if (customerInvoiceStatusFilter !== 'all' && inv.status !== customerInvoiceStatusFilter) {
      return false;
    }
    // Search query: match invoice number, payment status, or date
    if (searchQuery) {
      var matchNum = inv.number && inv.number.toLowerCase().indexOf(searchQuery) !== -1;
      var matchDate = inv.date && inv.date.toLowerCase().indexOf(searchQuery) !== -1;
      var matchStatus = inv.status && inv.status.toLowerCase().indexOf(searchQuery) !== -1;
      return matchNum || matchDate || matchStatus;
    }
    return true;
  });
  
  renderCustomerInvoicesTable(filtered);
}

function renderCustomerInvoicesTable(customerInvs) {
  var tbody = document.getElementById('history-invoices-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!customerInvs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted);">No matching invoices found</td></tr>';
    return;
  }
  
  customerInvs.forEach(function(inv) {
    var tr = document.createElement('tr');
    var bc = inv.status === 'paid' ? 'badge-paid' : 'badge-pending';
    var bt = inv.status === 'paid' ? 'Paid' : 'Pending';
    
    var statusBtn = inv.status === 'paid' 
      ? `<button class="btn-link" style="color:var(--amber); margin-right:12px; font-weight:600;" onclick="toggleStatus('${inv.id}'); refreshActiveCustomerHistory();">Mark Pending</button>`
      : `<button class="btn-link" style="color:var(--green); margin-right:12px; font-weight:600;" onclick="toggleStatus('${inv.id}'); refreshActiveCustomerHistory();">Mark Paid</button>`;
    
    tr.innerHTML = `
      <td data-label="Invoice No.">${escapeHtml(inv.number)}</td>
      <td data-label="Date">${escapeHtml(inv.date || '—')}</td>
      <td data-label="Amount" class="td-amount">${formatINR(inv.grandTotal || inv.total || 0)}</td>
      <td data-label="Payment Status"><span class="badge ${bc}" style="cursor:pointer" onclick="toggleStatus('${inv.id}'); refreshActiveCustomerHistory();">${bt}</span></td>
      <td data-label="Actions" class="td-actions">
        ${statusBtn}
        <button class="btn-link" onclick="loadInvoiceForEdit('${inv.id}')">Edit</button>
        <button class="btn-danger-ghost" onclick="deleteInvoice('${inv.id}'); refreshActiveCustomerHistory();" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateCustomerHistorySummary(customerInvs) {
  var totalRevenue = 0;
  var pendingDues = 0;
  var lastDate = '—';
  var lastTimestamp = 0;
  
  customerInvs.forEach(function(inv) {
    var t = inv.grandTotal || inv.total || 0;
    totalRevenue += t;
    if (inv.status === 'pending') {
      pendingDues += t;
    }
    var time = inv.createdAt || 0;
    if (time > lastTimestamp) {
      lastTimestamp = time;
      lastDate = inv.date || '—';
    }
  });
  
  document.getElementById('history-summary-total-revenue').textContent = formatINR(totalRevenue);
  document.getElementById('history-summary-invoice-count').textContent = customerInvs.length;
  
  var duesEl = document.getElementById('history-summary-pending-dues');
  if (duesEl) {
    duesEl.textContent = formatINR(pendingDues);
    duesEl.style.color = pendingDues > 0 ? '#ef4444' : 'var(--text)';
  }
  
  var lastDateEl = document.getElementById('history-summary-last-date');
  if (lastDateEl) lastDateEl.textContent = lastDate;
}

function refreshActiveCustomerHistory() {
  if (activeHistoryCustomerName) {
    var searchVal = document.getElementById('cust-invoice-search') ? document.getElementById('cust-invoice-search').value : '';
    
    fetchCustomerInvoices(activeHistoryCustomerName, function(customerInvs) {
      activeHistoryCustomerInvoices = customerInvs;
      activeHistoryCustomerInvoices.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      
      updateCustomerHistorySummary(customerInvs);
      filterCustomerInvoices();
      
      if (document.getElementById('cust-invoice-search')) {
        document.getElementById('cust-invoice-search').value = searchVal;
      }
    });
  }
}

function openCustomerHistory(customerName) {
  activeHistoryCustomerName = customerName;
  customerInvoiceStatusFilter = 'all';
  
  document.getElementById('history-customers-view').style.display = 'none';
  document.getElementById('history-invoices-view').style.display = 'block';
  
  document.getElementById('history-summary-cust-name').textContent = customerName;
  
  // Reset active filter buttons and search input
  document.querySelectorAll('[id^="btn-cust-inv-filter-"]').forEach(function(b) {
    b.classList.toggle('active', b.id === 'btn-cust-inv-filter-all');
  });
  var searchInput = document.getElementById('cust-invoice-search');
  if (searchInput) searchInput.value = '';
  
  var customers = getCustomers() || [];
  var custObj = customers.find(function(c) {
    return c.name.toLowerCase() === customerName.toLowerCase();
  });
  
  var phoneStr = custObj && custObj.phone ? '📱 Phone: ' + custObj.phone : '📱 Phone: —';
  var addrStr = custObj && custObj.address ? '📍 Address: ' + custObj.address : '📍 Address: —';
  document.getElementById('history-summary-cust-meta').innerHTML = `<span>${escapeHtml(phoneStr)}</span> | <span>${escapeHtml(addrStr)}</span>`;
  
  var btnCreate = document.getElementById('btn-hist-create-invoice');
  if (btnCreate) {
    btnCreate.onclick = function() {
      resetInvoiceForm();
      document.getElementById('customer-name').value = customerName;
      if (custObj) {
        document.getElementById('customer-phone').value = custObj.phone || '';
        document.getElementById('customer-address').value = custObj.address || '';
      }
      navigateTo('invoice');
    };
  }
  
  var btnProfile = document.getElementById('btn-hist-view-profile');
  if (btnProfile) {
    if (custObj) {
      btnProfile.style.display = 'inline-flex';
      btnProfile.onclick = function() {
        navigateToCustomersAndOpenProfile(custObj.id);
      };
    } else {
      btnProfile.style.display = 'none';
    }
  }
  
  fetchCustomerInvoices(customerName, function(customerInvs) {
    activeHistoryCustomerInvoices = customerInvs;
    activeHistoryCustomerInvoices.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    
    updateCustomerHistorySummary(customerInvs);
    filterCustomerInvoices();
  });
}

function closeCustomerHistory() {
  document.getElementById('history-invoices-view').style.display = 'none';
  document.getElementById('history-customers-view').style.display = 'block';
  renderHistory();
}

// ═══════════════════════════════════════════
//  DASHBOARD + ANALYTICS
// ═══════════════════════════════════════════
function setFilter(f, btn) {
  dashFilter = f;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderDashboard();
}

function renderDashboard() {
  var all = loadData(KEYS.INVOICES) || [];
  var today = getTodayStr();
  var filtered = filterInvoices(all, dashFilter);

  // Stats
  var revenue = 0, todayRev = 0, monthlyRev = 0, paidCount = 0, pendingCount = 0;
  var customers = {};
  var products = {};
  var monthNow = today.substring(0, 7);

  all.forEach(function(inv) {
    var t = inv.grandTotal || inv.total || 0;
    if (inv.date === today) todayRev += t;
    if (inv.date && inv.date.substring(0, 7) === monthNow) monthlyRev += t;
    if (inv.customerName) customers[inv.customerName.toLowerCase()] = 1;
    if (inv.items) inv.items.forEach(function(it) {
      if (it.name) {
        var k = it.name.toLowerCase();
        products[k] = (products[k] || 0) + (it.qty || 0);
      }
    });
  });

  filtered.forEach(function(inv) {
    revenue += inv.grandTotal || inv.total || 0;
    if (inv.status === 'paid') paidCount++; else pendingCount++;
  });

  var topProduct = '—';
  var maxQty = 0;
  for (var pk in products) { if (products[pk] > maxQty) { maxQty = products[pk]; topProduct = pk; } }
  if (topProduct !== '—') topProduct = topProduct.charAt(0).toUpperCase() + topProduct.slice(1);

  document.getElementById('d-revenue').textContent = formatINR(revenue);
  document.getElementById('d-today').textContent = formatINR(todayRev);
  document.getElementById('d-monthly').textContent = formatINR(monthlyRev);
  document.getElementById('d-total-inv').textContent = filtered.length;
  document.getElementById('d-paid').textContent = paidCount;
  document.getElementById('d-pending').textContent = pendingCount;
  document.getElementById('d-customers').textContent = Object.keys(customers).length;
  document.getElementById('d-top-product').textContent = topProduct;

  // Recent invoices
  var sorted = filtered.slice().sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  var recent = sorted.slice(0, 8);
  var dtb = document.getElementById('dash-body');
  var dem = document.getElementById('dash-empty');
  var dtbl = document.getElementById('dash-table');

  if (!filtered.length) { dtbl.style.display = 'none'; dem.style.display = 'flex'; }
  else { dtbl.style.display = ''; dem.style.display = 'none'; }

  dtb.innerHTML = '';
  recent.forEach(function(inv) {
    var tr = document.createElement('tr');
    var bc = inv.status === 'paid' ? 'badge-paid' : 'badge-pending';
    tr.innerHTML = '<td data-label="Invoice #">' + escapeHtml(inv.number) + '</td><td data-label="Customer">' + escapeHtml(inv.customerName || '—') + '</td><td data-label="Date">' + escapeHtml(inv.date || '—') + '</td><td data-label="Amount" class="td-amount">' + formatINR(inv.grandTotal || inv.total || 0) + '</td><td data-label="Status"><span class="badge ' + bc + '">' + (inv.status === 'paid' ? 'Paid' : 'Pending') + '</span></td>';
    dtb.appendChild(tr);
  });

  // Charts
  renderCharts(all);
}

function filterInvoices(all, filter) {
  if (filter === 'all') return all;
  var today = getTodayStr();
  var d = new Date();
  return all.filter(function(inv) {
    if (!inv.date) return false;
    if (filter === 'today') return inv.date === today;
    if (filter === 'week') {
      var day = d.getDay() || 7;
      var start = new Date(d); start.setDate(d.getDate() - day + 1);
      return inv.date >= dateStr(start) && inv.date <= today;
    }
    if (filter === 'month') return inv.date.substring(0, 7) === today.substring(0, 7);
    if (filter === 'year') return inv.date.substring(0, 4) === today.substring(0, 4);
    return true;
  });
}

// ═══════════════════════════════════════════
//  CHARTS (Chart.js)
// ═══════════════════════════════════════════
function renderCharts(invoices) {
  if (typeof Chart === 'undefined') return;

  // Monthly Revenue (last 6 months)
  var months = [];
  var revByMonth = {};
  var countByMonth = {};
  var d = new Date();
  for (var m = 5; m >= 0; m--) {
    var md = new Date(d.getFullYear(), d.getMonth() - m, 1);
    var key = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
    var label = md.toLocaleString('en', { month: 'short' }) + ' ' + md.getFullYear().toString().slice(-2);
    months.push({ key: key, label: label });
    revByMonth[key] = 0;
    countByMonth[key] = 0;
  }
  invoices.forEach(function(inv) {
    if (!inv.date) return;
    var k = inv.date.substring(0, 7);
    if (revByMonth[k] !== undefined) { revByMonth[k] += inv.grandTotal || inv.total || 0; countByMonth[k]++; }
  });

  var labels = months.map(function(m) { return m.label; });
  var revData = months.map(function(m) { return revByMonth[m.key]; });
  var cntData = months.map(function(m) { return countByMonth[m.key]; });

  var chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } };

  // Revenue Chart
  if (chartRevenue) chartRevenue.destroy();
  var ctx1 = document.getElementById('chart-revenue');
  if (ctx1) {
    chartRevenue = new Chart(ctx1, { type: 'bar', data: { labels: labels, datasets: [{ data: revData, backgroundColor: 'rgba(37,99,235,.7)', borderRadius: 4, barPercentage: 0.6 }] }, options: chartOpts });
  }

  // Invoice Count Chart
  if (chartInvoices) chartInvoices.destroy();
  var ctx2 = document.getElementById('chart-invoices');
  if (ctx2) {
    chartInvoices = new Chart(ctx2, { type: 'bar', data: { labels: labels, datasets: [{ data: cntData, backgroundColor: 'rgba(59,130,246,.5)', borderRadius: 4, barPercentage: 0.6 }] }, options: chartOpts });
  }

  // Top Products (by qty)
  var products = {};
  invoices.forEach(function(inv) {
    if (inv.items) inv.items.forEach(function(it) {
      if (it.name) { var k = it.name.trim(); products[k] = (products[k] || 0) + (it.qty || 0); }
    });
  });
  var sorted = Object.keys(products).sort(function(a, b) { return products[b] - products[a]; }).slice(0, 6);
  var prodLabels = sorted.map(function(s) { return s.length > 12 ? s.substring(0, 12) + '…' : s; });
  var prodData = sorted.map(function(s) { return products[s]; });
  var prodColors = ['rgba(30,64,175,.75)','rgba(37,99,235,.65)','rgba(59,130,246,.55)','rgba(96,165,250,.5)','rgba(147,197,253,.5)','rgba(191,219,254,.5)'];

  if (chartProducts) chartProducts.destroy();
  var ctx3 = document.getElementById('chart-products');
  if (ctx3) {
    chartProducts = new Chart(ctx3, { type: 'bar', data: { labels: prodLabels, datasets: [{ data: prodData, backgroundColor: prodColors, borderRadius: 4, barPercentage: 0.6 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } } });
  }
}

// ═══════════════════════════════════════════
//  PRINT (CLEAN OUTPUT)
// ═══════════════════════════════════════════
function printInvoice() {
  navigateTo('invoice');
  setTimeout(function() { window.print(); }, 150);
}

// ═══════════════════════════════════════════
//  CAPTURE HELPERS (PDF/JPG)
// ═══════════════════════════════════════════
function captureSheet() {
  if (typeof html2canvas === 'undefined') {
    showToast('HTML capture library offline', 'error');
    return Promise.reject(new Error('html2canvas offline'));
  }
  var sheet = document.getElementById('invoice-sheet');
  sheet.classList.add('capture-mode');
  return html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(function(canvas) {
    sheet.classList.remove('capture-mode');
    return canvas;
  }).catch(function(err) {
    sheet.classList.remove('capture-mode');
    throw err;
  });
}

function downloadPDF() {
  if (!checkFeatureAccess('exports')) return;
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
    showToast('PDF generator library offline', 'error');
    return;
  }
  showToast('Generating PDF…', '');
  captureSheet().then(function(canvas) {
    var img = canvas.toDataURL('image/jpeg', 0.92);
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF('p', 'mm', 'a4');
    var pW = pdf.internal.pageSize.getWidth(), pH = pdf.internal.pageSize.getHeight();
    var m = 6, uW = pW - m * 2;
    var r = uW / canvas.width, sH = canvas.height * r;
    if (sH > pH - m * 2) { r = (pH - m * 2) / canvas.height; var sW = canvas.width * r; pdf.addImage(img, 'JPEG', (pW - sW) / 2, m, sW, pH - m * 2); }
    else { pdf.addImage(img, 'JPEG', m, m, uW, sH); }
    pdf.save(invoiceNumberEl.value + '.pdf');
    showToast('PDF downloaded!', 'success');
  }).catch(function() { showToast('PDF failed', 'error'); });
}

function downloadJPG() {
  if (!checkFeatureAccess('exports')) return;
  showToast('Generating image…', '');
  captureSheet().then(function(canvas) {
    canvas.toBlob(function(blob) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = invoiceNumberEl.value + '.jpg'; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(a.href);
      showToast('JPG downloaded!', 'success');
    }, 'image/jpeg', 0.92);
  }).catch(function() { showToast('JPG failed', 'error'); });
}

// ═══════════════════════════════════════════
//  WHATSAPP
// ═══════════════════════════════════════════
function shareWhatsApp() {
  if (!checkFeatureAccess('whatsapp')) return;
  showToast('Preparing…', '');
  captureSheet().then(function(canvas) {
    canvas.toBlob(function(blob) {
      if (navigator.canShare) {
        var file = new File([blob], invoiceNumberEl.value + '.jpg', { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ title: 'Invoice ' + invoiceNumberEl.value, files: [file] })
            .then(function() { showToast('Shared!', 'success'); })
            .catch(function(e) { if (e.name !== 'AbortError') fallbackWA(); });
          return;
        }
      }
      fallbackWA();
    }, 'image/jpeg', 0.92);
  }).catch(function() { fallbackWA(); });
}
function fallbackWA() {
  var p = loadData(KEYS.BUSINESS) || {};
  var plan = currentUser ? (currentUser.planType || 'free') : 'free';
  var brandingText = '';
  if (plan === 'pro' && p.removeBranding === true) {
    brandingText = '';
  } else {
    brandingText = '\n\nPowered by Bill Blue\nTry Free: https://billblue.in';
  }
  
  var msg = '📄 *' + invoiceNumberEl.value + '*\n👤 ' + (document.getElementById('customer-name').value || '—') +
    '\n📅 ' + invoiceDateEl.value + '\n💰 ' + grandTotalEl.textContent +
    brandingText;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ═══════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════
function showToast(msg, type) {
  var c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  var t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast-' + type : '');
  
  // Icon based on type
  var icon = '💡';
  if (type === 'success') icon = '✅';
  else if (type === 'error') icon = '❌';
  else if (type === 'warning') icon = '⚠️';
  else if (type === 'info') icon = 'ℹ️';
  
  t.innerHTML = `<span style="flex-shrink:0;">${icon}</span><span style="flex:1;">${escapeHtml(msg)}</span>`;
  c.appendChild(t);
  
  setTimeout(function() {
    t.classList.add('toast-out');
    setTimeout(function() { t.remove(); }, 250);
  }, 2500);
}

// ═══════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
function getVal(id) {
  var el = document.getElementById(id);
  return el ? (el.value || '').trim() : '';
}
function setVal(id, v) {
  var el = document.getElementById(id);
  if (el) el.value = v || '';
}
function escapeHtml(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escapeAttr(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function highlightField(el) { el.focus(); el.style.borderColor = '#ef4444'; el.style.boxShadow = '0 0 0 2px rgba(239,68,68,.15)'; setTimeout(function() { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1200); }
function parseGrandTotal() { var t = grandTotalEl.textContent.replace(/[₹,\s]/g, ''); return parseFloat(t) || 0; }
function getTodayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function dateStr(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

// ═══════════════════════════════════════════
//  ADMIN SECURE ROUTE & DASHBOARD LOGIC
// ═══════════════════════════════════════════
var adminAuthorized = false;
var adminSubFilter = 'all';
var adminLoadedBusinesses = [];

var MOCK_BUSINESSES = [
  { name: 'Balaji Wholesalers', subscription: 'pro', subEnd: '2027-02-15', activity: 'active', invoices: 142, revenue: 485900, consent: true, referralsCount: 3 },
  { name: 'Sharma Groceries & Retail', subscription: 'pro', subEnd: '2026-11-20', activity: 'active', invoices: 89, revenue: 154200, consent: true, referralsCount: 1 },
  { name: 'Siddharth Organics Ltd.', subscription: 'pro', subEnd: '2026-06-10', activity: 'active', invoices: 231, revenue: 1250000, consent: true, referralsCount: 5 },
  { name: 'Deepak Retail Outlet', subscription: 'free', subEnd: '2026-04-01', activity: 'inactive', invoices: 45, revenue: 87500, consent: false, referralsCount: 0 },
  { name: 'Mani Enterprise Agency', subscription: 'pro', subEnd: '2026-06-18', activity: 'active', invoices: 110, revenue: 320400, consent: true, referralsCount: 2 }
];

function renderAdminPortal() {
  var gate = document.getElementById('admin-login-gate');
  var panel = document.getElementById('admin-dashboard-panel');
  if (adminAuthorized) {
    gate.style.display = 'none';
    panel.style.display = 'block';
    loadRealAdminData();
  } else {
    gate.style.display = 'flex';
    panel.style.display = 'none';
    document.getElementById('admin-passcode').value = '';
    document.getElementById('admin-login-err').style.display = 'none';
  }
}

function verifyAdminPasscode() {
  var code = document.getElementById('admin-passcode').value.trim();
  if (code === 'admin123') {
    adminAuthorized = true;
    renderAdminPortal();
    showToast('Admin authorized successfully', 'success');
  } else {
    document.getElementById('admin-login-err').style.display = 'block';
    showToast('Invalid passcode', 'error');
  }
}

function logoutAdminPortal() {
  adminAuthorized = false;
  renderAdminPortal();
  showToast('Logged out of Admin Portal', 'success');
}

function loadRealAdminData() {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    showToast('Fetching platform accounts...', 'info');
    firebaseDb.collection('users').get().then(function(querySnapshot) {
      var realBusinesses = [];
      var promises = [];
      
      querySnapshot.forEach(function(userDoc) {
        var userData = userDoc.data();
        var isCurrent = userDoc.id === firebaseAuth.currentUser.uid;
        
        var bizInfo = {
          uid: userDoc.id,
          email: userData.email || '',
          name: (userData.businessSettings && userData.businessSettings.name) || userData.companyName || 'Unnamed Business',
          subscription: userData.planType || 'free',
          subscriptionStatus: userData.subscriptionStatus || 'inactive',
          requestedPlan: userData.requestedPlan || '',
          paymentUTR: userData.paymentUTR || '',
          subEnd: userData.subscriptionExpiry || '—',
          activity: 'active',
          invoices: 0,
          revenue: 0,
          consent: userData.businessSettings ? (userData.businessSettings.analyticsConsent !== false) : true,
          isCurrent: isCurrent
        };
        
        var p = firebaseDb.collection('users').doc(userDoc.id).collection('invoices').get().then(function(invoiceSnap) {
          var rev = 0;
          invoiceSnap.forEach(function(invDoc) {
            var inv = invDoc.data();
            rev += inv.grandTotal || inv.total || 0;
          });
          bizInfo.invoices = invoiceSnap.size;
          bizInfo.revenue = rev;
        }).catch(function(err) {
          console.error("Failed to fetch invoices for user: " + userDoc.id, err);
        });
        
        realBusinesses.push(bizInfo);
        promises.push(p);
      });
      
      Promise.all(promises).then(function() {
        adminLoadedBusinesses = realBusinesses;
        renderAdminDashboard(realBusinesses);
      });
    }).catch(function(err) {
      console.error("Failed to load admin platform data", err);
      showToast('Live fetch restricted. Using simulated dataset.', 'error');
      var mock = getAdminBusinesses();
      adminLoadedBusinesses = mock;
      renderAdminDashboard(mock);
    });
  } else {
    // If running in sandbox local storage mode, fetch sandbox users
    var list = [];
    var currentBiz = loadData(KEYS.BUSINESS) || {};
    var currentInvs = loadData(KEYS.INVOICES) || [];
    var currentRev = 0;
    currentInvs.forEach(function(inv) { currentRev += inv.grandTotal || inv.total || 0; });
    
    list.push({
      uid: (currentUser && currentUser.uid) || 'sandbox_current_uid',
      email: (currentUser && currentUser.email) || 'sandbox@billblue.com',
      name: currentBiz.name || 'Your Business Name (Sandbox)',
      subscription: (currentUser && currentUser.planType) || 'free',
      subscriptionStatus: (currentUser && currentUser.subscriptionStatus) || 'inactive',
      requestedPlan: (currentUser && currentUser.requestedPlan) || '',
      paymentUTR: (currentUser && currentUser.paymentUTR) || '',
      subEnd: (currentUser && currentUser.subscriptionExpiry) || '2027-05-25',
      activity: 'active',
      invoices: currentInvs.length,
      revenue: currentRev,
      consent: currentBiz.analyticsConsent !== false,
      isCurrent: true,
      referrals: (currentUser && currentUser.referrals) || []
    });
    
    // Add simulated sandbox users
    var users = loadData('billblue_simulated_users') || {};
    for (var email in users) {
      var u = users[email];
      var rev = 0;
      if (u.invoicesList) u.invoicesList.forEach(function(inv) { rev += inv.grandTotal || inv.total || 0; });
      
      list.push({
        uid: email,
        email: email,
        name: (u.businessSettings && u.businessSettings.name) || 'Simulated Business',
        subscription: u.planType || 'free',
        subscriptionStatus: u.subscriptionStatus || 'inactive',
        requestedPlan: u.requestedPlan || '',
        paymentUTR: u.paymentUTR || '',
        subEnd: u.subscriptionExpiry || '2027-05-25',
        activity: 'active',
        invoices: u.invoicesList ? u.invoicesList.length : 0,
        revenue: rev,
        consent: u.businessSettings ? (u.businessSettings.analyticsConsent !== false) : true,
        isCurrent: false,
        referrals: u.referrals || []
      });
    }
    
    adminLoadedBusinesses = list;
    renderAdminDashboard(list);
  }
}

function approveSubscription(uidOrEmail, requestedPlan) {
  showToast('Approving subscription...', 'info');
  var d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  var expiry = dateStr(d);
  
  var subscriptionData = {
    planType: requestedPlan,
    subscriptionStatus: 'active',
    subscriptionExpiry: expiry,
    requestedPlan: '',
    paymentUTR: ''
  };
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(uidOrEmail).update(subscriptionData)
      .then(function() {
        showToast('Subscription approved successfully!', 'success');
        if (currentUser && currentUser.uid === uidOrEmail) {
          currentUser.planType = requestedPlan;
          currentUser.subscriptionStatus = 'active';
          currentUser.subscriptionExpiry = expiry;
          currentUser.requestedPlan = '';
          currentUser.paymentUTR = '';
          handleLoggedInState();
        }
        loadRealAdminData();
      }).catch(function(err) {
        showToast('Failed to approve user: ' + err.message, 'error');
      });
    return;
  }
  
  // Sandbox simulated local storage updates
  var users = loadData('billblue_simulated_users') || {};
  var emailKey = uidOrEmail.toLowerCase();
  if (users[emailKey]) {
    users[emailKey].planType = requestedPlan;
    users[emailKey].subscriptionStatus = 'active';
    users[emailKey].subscriptionExpiry = expiry;
    users[emailKey].requestedPlan = '';
    users[emailKey].paymentUTR = '';
    saveData('billblue_simulated_users', users);
    showToast('Sandbox subscription approved successfully!', 'success');
    loadRealAdminData();
    return;
  }
  
  // Current user sandbox override
  if (currentUser && (currentUser.uid === uidOrEmail || currentUser.email.toLowerCase() === emailKey)) {
    currentUser.planType = requestedPlan;
    currentUser.subscriptionStatus = 'active';
    currentUser.subscriptionExpiry = expiry;
    currentUser.requestedPlan = '';
    currentUser.paymentUTR = '';
    saveData('billblue_current_user', currentUser);
    handleLoggedInState();
    showToast('Sandbox subscription approved successfully!', 'success');
    loadRealAdminData();
  }
}

function rejectSubscription(uidOrEmail) {
  showToast('Rejecting request...', 'info');
  var subscriptionData = {
    subscriptionStatus: 'inactive',
    requestedPlan: '',
    paymentUTR: ''
  };
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(uidOrEmail).update(subscriptionData)
      .then(function() {
        showToast('Subscription request rejected.', 'warning');
        if (currentUser && currentUser.uid === uidOrEmail) {
          currentUser.subscriptionStatus = 'inactive';
          currentUser.requestedPlan = '';
          currentUser.paymentUTR = '';
          handleLoggedInState();
        }
        loadRealAdminData();
      }).catch(function(err) {
        showToast('Failed to reject request: ' + err.message, 'error');
      });
    return;
  }
  
  // Sandbox simulated local storage updates
  var users = loadData('billblue_simulated_users') || {};
  var emailKey = uidOrEmail.toLowerCase();
  if (users[emailKey]) {
    users[emailKey].subscriptionStatus = 'inactive';
    users[emailKey].requestedPlan = '';
    users[emailKey].paymentUTR = '';
    saveData('billblue_simulated_users', users);
    showToast('Sandbox request rejected.', 'warning');
    loadRealAdminData();
    return;
  }
  
  // Current user sandbox override
  if (currentUser && (currentUser.uid === uidOrEmail || currentUser.email.toLowerCase() === emailKey)) {
    currentUser.subscriptionStatus = 'inactive';
    currentUser.requestedPlan = '';
    currentUser.paymentUTR = '';
    saveData('billblue_current_user', currentUser);
    handleLoggedInState();
    showToast('Sandbox request rejected.', 'warning');
    loadRealAdminData();
  }
}

function getAdminBusinesses() {
  var list = [];
  var p = loadData(KEYS.BUSINESS) || {};
  var userInvs = loadData(KEYS.INVOICES) || [];
  
  var userConsent = p.analyticsConsent !== false;
  var userRev = 0;
  userInvs.forEach(function(inv) {
    userRev += inv.grandTotal || inv.total || 0;
  });
  
  list.push({
    name: p.name || 'Your Business Name (Current)',
    subscription: 'active',
    subEnd: '2027-05-25',
    activity: 'active',
    invoices: userInvs.length,
    revenue: userRev,
    consent: userConsent,
    isCurrent: true
  });
  
  MOCK_BUSINESSES.forEach(function(mb) {
    list.push(mb);
  });
  
  return list;
}

function setAdminSubFilter(filter, btn) {
  adminSubFilter = filter;
  document.querySelectorAll('#view-admin .filter-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  renderAdminDashboard(adminLoadedBusinesses);
}

function renderAdminDashboard(businesses) {
  if (!businesses) {
    businesses = adminLoadedBusinesses.length ? adminLoadedBusinesses : getAdminBusinesses();
  }
  
  // Calculate Platform Analytics
  var totalRegistered = businesses.length;
  var freeUsers = 0;
  var proUsers = 0;
  var pendingVerifications = 0;
  var saasRevenue = 0;
  var totalReferrals = 0;
  
  businesses.forEach(function(b) {
    var sub = b.subscription ? b.subscription.toLowerCase() : 'free';
    if (sub === 'free') {
      freeUsers++;
    } else if (sub === 'pro') {
      proUsers++;
      saasRevenue += 299;
    }
    
    if (b.subscriptionStatus === 'pending' || b.subscription === 'pending') {
      pendingVerifications++;
    }
    
    if (b.referrals && Array.isArray(b.referrals)) {
      totalReferrals += b.referrals.length;
    } else if (b.referralsCount) {
      totalReferrals += b.referralsCount;
    }
  });
  
  // Update Platform UI
  document.getElementById('ad-total-businesses').textContent = totalRegistered;
  document.getElementById('ad-free-users').textContent = freeUsers;
  document.getElementById('ad-paid-users').textContent = proUsers;
  
  var pendingEl = document.getElementById('ad-pending-verifications');
  if (pendingEl) pendingEl.textContent = pendingVerifications;
  
  var referralEl = document.getElementById('ad-referral-stats');
  if (referralEl) referralEl.textContent = totalReferrals;
  
  document.getElementById('ad-total-revenue').textContent = formatINR(saasRevenue);
  
  // Render Business Insights Table
  var tbody = document.getElementById('admin-table-body');
  tbody.innerHTML = '';
  
  var filtered = businesses.filter(function(b) {
    if (adminSubFilter === 'all') return true;
    if (adminSubFilter === 'pending') {
      return b.subscriptionStatus === 'pending' || b.subscription === 'pending';
    }
    return b.subscription === adminSubFilter;
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted); font-weight: 500;">No businesses match this filter.</td></tr>';
    return;
  }
  
  filtered.forEach(function(b) {
    var tr = document.createElement('tr');
    
    // Subscription Badge
    var subBadge = '';
    if (b.subscriptionStatus === 'pending' || b.subscription === 'pending') {
      var req = b.requestedPlan ? b.requestedPlan.toUpperCase() : 'PREMIUM';
      subBadge = '<span class="badge" style="background:#f59e0b; color:#fff; font-weight:700; padding:2px 6px; border-radius:4px; display:inline-block;">PENDING (' + req + ')</span>';
      if (b.paymentUTR) {
        subBadge += '<br><span style="font-size:0.58rem; color:var(--text-muted); font-family:monospace; font-weight:600;">UTR: ' + b.paymentUTR + '</span>';
      }
    } else {
      var subType = b.subscription ? b.subscription.toLowerCase() : 'free';
      if (subType === 'free') {
        subBadge = '<span class="badge" style="background:var(--bg-warm); border:1px solid var(--border); color:var(--text-sec); padding:2px 6px; border-radius:4px; font-weight:600;">FREE</span>';
      } else if (subType === 'basic') {
        subBadge = '<span class="badge" style="background:#dbeafe; color:#1e40af; font-weight:700; padding:2px 6px; border-radius:4px;">BASIC</span>';
      } else if (subType === 'pro') {
        subBadge = '<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; padding:2px 6px; border-radius:4px;">PRO</span>';
      } else if (subType === 'expiring') {
        subBadge = '<span class="badge badge-expiring">Expiring</span>';
      } else if (subType === 'expired') {
        subBadge = '<span class="badge badge-expired">Expired</span>';
      } else {
        subBadge = '<span class="badge badge-active">' + subType.toUpperCase() + '</span>';
      }
    }
    
    // Activity Badge
    var actBadge = b.activity === 'active' 
      ? '<span class="badge badge-active">Active</span>' 
      : '<span class="badge badge-inactive">Inactive</span>';
      
    // Consent Badge
    var conBadge = b.consent 
      ? '<span class="badge badge-consent-yes">Yes</span>' 
      : '<span class="badge badge-consent-no">No</span>';
      
    // Invoice and Revenue details - MASKED if consent is false!
    var invCountText = b.consent ? b.invoices : '<span class="badge-restricted">Restricted</span>';
    var revText = b.consent ? formatINR(b.revenue) : '<span class="badge-restricted">Restricted</span>';
    
    var bizName = escapeHtml(b.name);
    if (b.isCurrent) {
      bizName += ' <span style="font-size:0.62rem; color:var(--primary); font-weight:700; background:var(--primary-soft); padding:1px 5px; border-radius:10px; margin-left:5px;">YOU</span>';
    }
    
    // Actions Column
    var actionHtml = '';
    var targetId = b.uid || b.email || '';
    if (b.subscriptionStatus === 'pending' || b.subscription === 'pending') {
      var reqPlan = b.requestedPlan || 'basic';
      actionHtml = 
        '<div style="display:flex; gap:6px; justify-content:center;">' +
          '<button class="btn btn-save" style="height:24px; padding:0 8px; font-size:0.6rem; font-weight:700;" onclick="approveSubscription(\'' + targetId + '\', \'' + reqPlan + '\')">Approve</button>' +
          '<button class="btn btn-clear" style="height:24px; padding:0 8px; font-size:0.6rem; font-weight:700; border-color:#ef4444; color:#ef4444; background:none;" onclick="rejectSubscription(\'' + targetId + '\')">Reject</button>' +
        '</div>';
    } else {
      var subType = b.subscription ? b.subscription.toLowerCase() : 'free';
      if (subType === 'pro') {
        actionHtml = '<button class="btn btn-clear" style="height:24px; padding:0 8px; font-size:0.6rem; font-weight:700; border-color:#6b7280; color:#6b7280; background:none;" onclick="rejectSubscription(\'' + targetId + '\')">Revoke</button>';
      } else {
        actionHtml = 
          '<div style="display:flex; gap:6px; justify-content:center;">' +
            '<button class="btn btn-clear" style="height:24px; padding:0 8px; font-size:0.6rem; font-weight:700; border-color:var(--primary); color:var(--primary); background:none;" onclick="approveSubscription(\'' + targetId + '\', \'pro\')">+Pro</button>' +
          '</div>';
      }
    }
    
    // System admin override
    if (b.isCurrent && currentUser && currentUser.email && currentUser.email.toLowerCase() === 'admin@billblue.com') {
      actionHtml = '<span style="font-size:0.6rem; color:var(--text-muted); font-weight:600;">System Admin</span>';
    }
    
    tr.innerHTML = 
      '<td style="font-weight: 600; color: var(--text);">' + bizName + '</td>' +
      '<td>' + subBadge + '</td>' +
      '<td>' + actBadge + '</td>' +
      '<td style="text-align: center; font-weight: 600;">' + invCountText + '</td>' +
      '<td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">' + revText + '</td>' +
      '<td style="text-align: center;">' + conBadge + '</td>' +
      '<td style="text-align: center;">' + actionHtml + '</td>';
      
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════
//  FIREBASE INITIALIZATION & SANDBOX
// ═══════════════════════════════════════════
function getFirebaseConfig() {
  // 1. Integrated Production Config for Bill Blue (Zero-Config Vercel Compatibility)
  return {
    apiKey: "AIzaSyCdtb-DWjZtcoRi5O2n63tuN1UBti9dous",
    authDomain: "bill-blue.firebaseapp.com",
    projectId: "bill-blue",
    storageBucket: "bill-blue.firebasestorage.app",
    messagingSenderId: "386786368749",
    appId: "1:386786368749:web:aeeee9ba7238e9254f80e4",
    measurementId: "G-RRFMPE1T61"
  };
}

function initializeFirebase() {
  var config = getFirebaseConfig();
  if (config && typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.app();
      }
      firebaseAuth = firebaseApp.auth();
      firebaseDb = firebaseApp.firestore();
      
      // OPTIMISTIC STARTUP CACHE LOAD: Bypass startup delay completely if logged in before
      var savedUser = loadData('billblue_current_user');
      if (savedUser) {
        currentUser = savedUser;
        handleLoggedInState();
      }
      
      firebaseAuth.onAuthStateChanged(function(user) {
        if (user) {
          syncUserData(user);
        } else {
          handleLoggedOutState();
        }
      });
      return;
    } catch (e) {
      console.error("Firebase init failed, falling back to sandbox", e);
    }
  }
  
  initializeSandbox();
}

function initializeSandbox() {
  firebaseAuth = null;
  firebaseDb = null;
  
  var savedUser = loadData('billblue_current_user');
  if (savedUser) {
    currentUser = savedUser;
    handleLoggedInState();
  } else {
    handleLoggedOutState();
  }
}

function syncUserData(user) {
  var isOptimistic = !!currentUser;
  firebaseDb.collection('users').doc(user.uid).get().then(function(doc) {
    if (doc.exists) {
      currentUser = doc.data();
      currentUser.uid = user.uid;
      currentUser.email = user.email;
    } else {
      currentUser = {
        uid: user.uid,
        email: user.email,
        planType: 'free',
        subscriptionExpiry: '2027-05-25',
        paymentStatus: 'paid',
        businessSettings: { name: 'Your Business Name' },
        invoicesList: []
      };
      firebaseDb.collection('users').doc(user.uid).set(currentUser);
    }
    
    // Save to cache for optimistic local startup
    saveData('billblue_current_user', currentUser);
    
    // Optimised load logic: bypass loading all invoices bulk-download on login
    currentUser.invoicesList = loadData(KEYS.INVOICES) || [];
    handleLoggedInState();
    
    if (!isOptimistic) {
      showToast('Session synced!', 'success');
    }
  }).catch(function(e) {
    if (!isOptimistic) {
      showToast('Sync failed, offline mode.', 'error');
      initializeSandbox();
    }
  });
}

function handleLoggedInState() {
  document.body.classList.add('logged-in');
  
  var initials = currentUser.email ? currentUser.email.substring(0, 2).toUpperCase() : 'US';
  
  // Sync Desktop Sidebar Profile
  var sidebarPanel = document.getElementById('sidebar-user-panel');
  if (sidebarPanel) {
    sidebarPanel.style.display = 'flex';
    document.getElementById('user-display-email').textContent = currentUser.email;
    document.getElementById('user-avatar-initials').textContent = initials;
    var badge = document.getElementById('user-plan-badge');
    if (badge) {
      if (currentUser.subscriptionStatus === 'pending') {
        badge.textContent = 'Pending Verification';
        badge.className = 'user-plan-badge';
        badge.style.background = '#f59e0b';
        badge.style.color = '#fff';
      } else {
        badge.textContent = currentUser.planType + ' plan';
        badge.className = 'user-plan-badge badge-plan-' + currentUser.planType;
        badge.style.background = '';
        badge.style.color = '';
      }
    }
  }
  
  // Sync Mobile Top Header
  var mobileHeader = document.getElementById('mobile-header');
  if (mobileHeader) {
    var mobileAvatar = document.getElementById('mh-avatar');
    if (mobileAvatar) mobileAvatar.textContent = initials;
    var mobileBadge = document.getElementById('mh-plan-badge');
    if (mobileBadge) {
      if (currentUser.subscriptionStatus === 'pending') {
        mobileBadge.textContent = 'Pending Verification';
        mobileBadge.className = 'mh-badge';
        mobileBadge.style.background = '#f59e0b';
        mobileBadge.style.color = '#fff';
      } else {
        mobileBadge.textContent = currentUser.planType + ' plan';
        mobileBadge.className = 'mh-badge badge-plan-' + currentUser.planType;
        mobileBadge.style.background = '';
        mobileBadge.style.color = '';
      }
    }
  }
  
  var bannerPlan = document.getElementById('settings-plan-name');
  if (bannerPlan) {
    if (currentUser.subscriptionStatus === 'pending') {
      bannerPlan.textContent = 'Pending Verification (' + (currentUser.requestedPlan || 'Premium').toUpperCase() + ')';
    } else {
      bannerPlan.textContent = currentUser.planType + ' plan';
    }
  }
  var expiryText = document.getElementById('settings-expiry-text');
  if (expiryText) {
    if (currentUser.subscriptionStatus === 'pending') {
      expiryText.textContent = 'Waiting for platform administrator verification...';
      expiryText.style.display = 'block';
      expiryText.style.color = '#f59e0b';
    } else if (currentUser.planType !== 'free' && currentUser.subscriptionExpiry) {
      expiryText.textContent = 'Expiry Date: ' + currentUser.subscriptionExpiry;
      expiryText.style.display = 'block';
      expiryText.style.color = '';
    } else {
      expiryText.style.display = 'none';
      expiryText.style.color = '';
    }
  }
  
  var configToggleInput = document.getElementById('settings-firebase-config');
  if (configToggleInput) {
    var savedConf = localStorage.getItem('billblue_firebase_config');
    configToggleInput.value = savedConf || '';
  }
  
  var p = currentUser.businessSettings || loadData(KEYS.BUSINESS) || {};
  saveData(KEYS.BUSINESS, p);
  
  var bizName = p.name || 'Bill Blue Shop';
  var workspaceNameEl = document.getElementById('sidebar-workspace-name');
  if (workspaceNameEl) workspaceNameEl.textContent = bizName;
  var workspaceAvatarEl = document.getElementById('sidebar-workspace-avatar');
  if (workspaceAvatarEl) workspaceAvatarEl.textContent = bizName.substring(0, 2).toUpperCase();
  
  var userInvs = currentUser.invoicesList || loadData(KEYS.INVOICES) || [];
  saveData(KEYS.INVOICES, userInvs);
  
  // Load specialized Pro catalog modules
  if (typeof loadProductsFromFirestore === 'function') loadProductsFromFirestore();
  else {
    if (typeof renderProductsList === 'function') renderProductsList();
  }
  if (typeof loadCustomersFromFirestore === 'function') loadCustomersFromFirestore();
  else {
    if (typeof renderCustomersList === 'function') renderCustomersList();
  }
  if (typeof loadKhataFromFirestore === 'function') loadKhataFromFirestore();
  else {
    if (typeof renderKhataBookList === 'function') renderKhataBookList();
  }
  if (typeof applyPaywalls === 'function') applyPaywalls();
  if (typeof checkLowStockAlerts === 'function') checkLowStockAlerts();
  
  // Initialize referral system details on user login
  if (typeof initReferralSystem === 'function') initReferralSystem();
  
  var isAdmin = currentUser && currentUser.email && currentUser.email.toLowerCase() === 'admin@billblue.com';
  if (isAdmin) {
    adminAuthorized = true;
    navigateTo('admin');
  } else {
    navigateTo('dashboard');
  }
  
  setNextInvoiceNumber();
  setTodayDate();
  recalculate();
  
  // Auto Onboarding popup or banner
  if (currentUser && !currentUser.onboarded && !isAdmin) {
    setTimeout(function() {
      if (typeof openOnboardingWizard === 'function') openOnboardingWizard();
    }, 1200);
  } else if (currentUser && currentUser.onboarded === 'skipped' && !isAdmin) {
    if (typeof showOnboardingBanner === 'function') showOnboardingBanner();
  }
  
  if (currentUser && currentUser.planType === 'free' && !sessionStorage.getItem('billblue_modal_skipped') && !isAdmin && currentUser.onboarded === true) {
    setTimeout(function() {
      openUpgradeModal();
    }, 2500);
  }
  
  // Update Settings -> Account & Session details
  var settingsEmail = document.getElementById('settings-current-user-email');
  if (settingsEmail) settingsEmail.textContent = currentUser.email || 'Sandbox User';
  var settingsPlan = document.getElementById('settings-current-user-plan');
  if (settingsPlan) settingsPlan.textContent = currentUser.planType || 'Free';
  
  if (typeof hideSplashScreen === 'function') hideSplashScreen();
}

function handleLoggedOutState() {
  document.body.classList.remove('logged-in');
  currentUser = null;
  
  var sidebarPanel = document.getElementById('sidebar-user-panel');
  if (sidebarPanel) sidebarPanel.style.display = 'none';
  
  navigateTo('auth');
  if (typeof hideSplashScreen === 'function') hideSplashScreen();
}

// ═══════════════════════════════════════════
//  AUTHENTICATION ACTIONS
// ═══════════════════════════════════════════
function showAuthCard(card) {
  document.getElementById('auth-login-card').style.display = card === 'login' ? 'block' : 'none';
  document.getElementById('auth-register-card').style.display = card === 'register' ? 'block' : 'none';
  document.getElementById('auth-forgot-card').style.display = card === 'forgot' ? 'block' : 'none';
}

function handleLogin() {
  var email = getVal('login-email');
  var password = getVal('login-password');
  
  if (!email || !password) {
    showToast('Please fill all fields', 'error');
    return;
  }
  
  showToast('Signing in...', '');
  
  if (firebaseAuth) {
    firebaseAuth.signInWithEmailAndPassword(email, password)
      .then(function() {
        showToast('Signed in successfully!', 'success');
      })
      .catch(function(err) {
        showToast(err.message, 'error');
      });
    return;
  }
  
  var users = loadData('billblue_simulated_users') || {};
  var user = users[email.toLowerCase()];
  if (user && user.password === password) {
    currentUser = {
      uid: 'sim_' + generateId(),
      email: email,
      planType: user.planType || 'free',
      subscriptionExpiry: user.subscriptionExpiry || '2027-05-25',
      paymentStatus: 'paid',
      businessSettings: user.businessSettings || {},
      invoicesList: user.invoicesList || []
    };
    saveData('billblue_current_user', currentUser);
    handleLoggedInState();
    showToast('Signed in (Sandbox Mode)!', 'success');
  } else {
    showToast('Invalid email or password', 'error');
  }
}

function handleRegister() {
  var name = getVal('register-name');
  var company = getVal('register-company');
  var phone = getVal('register-phone');
  var email = getVal('register-email');
  var password = getVal('register-password');
  var plan = 'free';
  
  if (!name || !company || !phone || !email || !password) {
    showToast('Please fill all fields', 'error');
    return;
  }
  if (phone.length !== 10 || !/^\d{10}$/.test(phone)) {
    showToast('Please enter a valid 10-digit mobile phone number', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  
  showToast('Creating account...', '');
  var expiry = '2027-05-25';
  
  if (firebaseAuth) {
    firebaseAuth.createUserWithEmailAndPassword(email, password)
      .then(function(cred) {
        var profile = {
          uid: cred.user.uid,
          email: email,
          fullName: name,
          phoneNumber: phone,
          companyName: company,
          planType: plan,
          subscriptionExpiry: expiry,
          paymentStatus: 'paid',
          onboarded: false,
          businessSettings: { name: company, phone: phone },
          invoicesList: []
        };
        return firebaseDb.collection('users').doc(cred.user.uid).set(profile).then(function() {
          showToast('Account registered!', 'success');
        });
      })
      .catch(function(err) {
        showToast(err.message, 'error');
      });
    return;
  }
  
  var users = loadData('billblue_simulated_users') || {};
  if (users[email.toLowerCase()]) {
    showToast('Email already registered', 'error');
    return;
  }
  
  users[email.toLowerCase()] = {
    password: password,
    fullName: name,
    phoneNumber: phone,
    companyName: company,
    planType: plan,
    subscriptionExpiry: expiry,
    onboarded: false,
    businessSettings: { name: company, phone: phone },
    invoicesList: []
  };
  saveData('billblue_simulated_users', users);
  
  currentUser = {
    uid: 'sim_' + generateId(),
    email: email,
    fullName: name,
    phoneNumber: phone,
    companyName: company,
    planType: plan,
    subscriptionExpiry: expiry,
    paymentStatus: 'paid',
    onboarded: false,
    businessSettings: { name: company, phone: phone },
    invoicesList: []
  };
  saveData('billblue_current_user', currentUser);
  handleLoggedInState();
  showToast('Account registered (Sandbox)!', 'success');
}

function handleForgotPassword() {
  var email = getVal('forgot-email');
  if (!email) {
    showToast('Please enter your email', 'error');
    return;
  }
  
  showToast('Sending recovery email...', '');
  
  if (firebaseAuth) {
    firebaseAuth.sendPasswordResetEmail(email)
      .then(function() {
        showToast('Recovery email sent!', 'success');
        showAuthCard('login');
      })
      .catch(function(err) {
        showToast(err.message, 'error');
      });
    return;
  }
  
  var users = loadData('billblue_simulated_users') || {};
  if (users[email.toLowerCase()]) {
    showToast('Recovery link sent (Simulated)!', 'success');
    showAuthCard('login');
  } else {
    showToast('Email address not registered', 'error');
  }
}

function triggerSignOut() {
  if (firebaseAuth) {
    firebaseAuth.signOut().then(function() {
      showToast('Signed out', 'success');
    });
    return;
  }
  
  localStorage.removeItem('billblue_current_user');
  handleLoggedOutState();
  showToast('Signed out (Sandbox)', 'success');
}

function triggerAddAccount() {
  if (firebaseAuth) {
    firebaseAuth.signOut().then(function() {
      showToast('Signed out. Ready to add/switch account.', 'success');
      showAuthCard('login');
    });
    return;
  }
  
  localStorage.removeItem('billblue_current_user');
  handleLoggedOutState();
  showToast('Signed out (Sandbox). Ready to add/switch account.', 'success');
  showAuthCard('login');
}

// ═══════════════════════════════════════════
//  FEATURE GATEKEEPER SYSTEM
// ═══════════════════════════════════════════
function checkFeatureAccess(feature) {
  if (!currentUser) return false;
  var plan = currentUser.planType || 'free';
  var isPro = plan === 'pro';
  
  if (feature === 'invoice-generation' || feature === 'branding' || feature === 'exports' || feature === 'qr-payment' || feature === 'whatsapp') {
    return true; // Free plan gets all basic invoicing completely unrestricted
  }
  
  if (feature === 'analytics' || feature === 'customers' || feature === 'khata' || feature === 'inventory' || feature === 'remove-branding') {
    if (!isPro) {
      showUpgradePromptModal(feature);
      return false;
    }
    return true;
  }
  
  return true;
}

function countCurrentMonthInvoices() {
  return 0; // Legacy checker, not used now
}

function showUpgradePromptModal(feature) {
  openUpgradeModal();
  var title = '🔒 Pro Feature';
  var msg = 'Upgrade to Bill Blue Pro to unlock this advanced capability.';
  
  if (feature === 'analytics') {
    title = '🔒 Pro Analytics Gated';
    msg = 'Sales dashboards, revenue trend graphs, and performance metrics require the Pro Plan.';
  } else if (feature === 'customers') {
    title = '🔒 Pro Customer Profiles Gated';
    msg = 'Advanced customer metrics, purchase totals, and order analysis logs require the Pro Plan.';
  } else if (feature === 'khata') {
    title = '🔒 Pro Khata Credit Book Locked';
    msg = ' debtor ledgers, credit logs, and outstanding receivables metric tracking require the Pro Plan.';
  } else if (feature === 'inventory') {
    title = '🔒 Pro Inventory Management Gated';
    msg = 'Inventory stock tracking, auto stock decrement, and critical stock alert warnings require the Pro Plan.';
  } else if (feature === 'remove-branding') {
    title = '🔒 Pro Branding Removal Gated';
    msg = 'Removing the "Powered by Bill Blue" subtle invoice branding footer requires the Pro Plan.';
  }
  
  showToast(title + ': ' + msg, 'error');
}

function handleBrandingClick(id) {
  if (!checkFeatureAccess('branding')) return;
  document.getElementById(id).click();
}

// ═══════════════════════════════════════════
//  FIRESTORE & LOCAL STORAGE SYNC
// ═══════════════════════════════════════════
function syncSavedInvoice(inv) {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('invoices').doc(inv.id).set(inv)
      .catch(function(e) { console.error("Firestore invoice sync failed", e); });
  }
  
  if (!firebaseAuth && currentUser) {
    var users = loadData('billblue_simulated_users') || {};
    var email = currentUser.email.toLowerCase();
    if (users[email]) {
      var all = loadData(KEYS.INVOICES) || [];
      users[email].invoicesList = all;
      saveData('billblue_simulated_users', users);
    }
  }
}

function syncSavedProfile(p) {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid).update({
      businessSettings: p
    }).catch(function(e) { console.error("Firestore settings sync failed", e); });
  }
  
  if (!firebaseAuth && currentUser) {
    var users = loadData('billblue_simulated_users') || {};
    var email = currentUser.email.toLowerCase();
    if (users[email]) {
      users[email].businessSettings = p;
      saveData('billblue_simulated_users', users);
      currentUser.businessSettings = p;
      saveData('billblue_current_user', currentUser);
    }
  }
}

// ═══════════════════════════════════════════
//  PRICING UPGRADE ACTIONS
// ═══════════════════════════════════════════
function openUpgradeModal() {
  var modal = document.getElementById('upgrade-modal');
  if (modal) {
    modal.style.display = 'flex';
    var plan = currentUser ? currentUser.planType : 'free';
    document.querySelectorAll('.pricing-card').forEach(function(c) {
      c.classList.remove('pricing-card-current');
    });
    var card = document.getElementById('price-card-' + plan);
    if (card) card.classList.add('pricing-card-current');
    
    var isPending = currentUser && currentUser.subscriptionStatus === 'pending';
    var reqPlan = currentUser ? currentUser.requestedPlan : '';
    
    var btnFree = document.getElementById('btn-select-free');
    var btnBasic = document.getElementById('btn-select-basic');
    var btnPro = document.getElementById('btn-select-pro');
    
    if (btnFree) {
      btnFree.textContent = plan === 'free' ? 'Current Plan' : 'Choose Free';
    }
    
    if (btnBasic) {
      if (isPending && reqPlan === 'basic') {
        btnBasic.textContent = 'Pending Verification';
        btnBasic.style.background = '#f59e0b';
        btnBasic.style.color = '#fff';
      } else {
        btnBasic.textContent = plan === 'basic' ? 'Current Plan' : 'Upgrade Basic';
        btnBasic.style.background = '';
        btnBasic.style.color = '';
      }
    }
    
    if (btnPro) {
      if (isPending && reqPlan === 'pro') {
        btnPro.textContent = 'Pending Verification';
        btnPro.style.background = '#f59e0b';
        btnPro.style.color = '#fff';
      } else {
        btnPro.textContent = plan === 'pro' ? 'Current Plan' : 'Upgrade Pro';
        btnPro.style.background = '';
        btnPro.style.color = '';
      }
    }
  }
}

function closeUpgradeModal() {
  var modal = document.getElementById('upgrade-modal');
  if (modal) modal.style.display = 'none';
  sessionStorage.setItem('billblue_modal_skipped', 'true');
}

function skipUpgrade() {
  sessionStorage.setItem('billblue_modal_skipped', 'true');
  closeUpgradeModal();
  showToast('Logged in on Free Tier!', 'info');
}

function purchasePlan(plan) {
  if (!currentUser) return;
  if (currentUser.planType === plan) {
    showToast('You are already on this plan!', 'info');
    return;
  }
  
  if (currentUser.subscriptionStatus === 'pending') {
    showToast('You already have a pending verification request. Please wait for Admin approval!', 'warning');
    return;
  }
  
  if (plan === 'free') {
    processPlanUpgrade('free');
    return;
  }
  
  var planPrice = 299; // Restructured billing: Pro plan only (₹299/yr)
  var planLabel = 'Pro';
  
  pendingUpgradePlan = 'pro';
  
  var modalPlanName = document.getElementById('upi-modal-plan-name');
  var modalPlanPrice = document.getElementById('upi-modal-plan-price');
  var modalPayBtn = document.getElementById('upi-modal-pay-btn');
  var modalQrContainer = document.getElementById('upi-modal-qr-container');
  var paymentModal = document.getElementById('upi-payment-modal');
  
  if (modalPlanName) modalPlanName.textContent = planLabel + ' Plan';
  if (modalPlanPrice) modalPlanPrice.innerHTML = '₹' + planPrice + '<span>/year</span>';
  
  // Dynamic UPI Deep Link
  var upiLink = 'upi://pay?pa=9398116740@ibl&pn=BillBlue&am=' + planPrice + '&cu=INR';
  if (modalPayBtn) {
    modalPayBtn.setAttribute('href', upiLink);
  }
  
  // Generate QR Code dynamically from same UPI deep link
  if (modalQrContainer) {
    modalQrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      try {
        subscriptionQRInstance = new QRCode(modalQrContainer, {
          text: upiLink,
          width: 160,
          height: 160,
          colorDark: '#111827',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (e) {
        modalQrContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; padding:20px;">QR Generation Failed</div>';
        console.error('QRCode generation error:', e);
      }
    } else {
      modalQrContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; padding:20px;">QR Library Offline</div>';
    }
  }
  
  if (paymentModal) {
    paymentModal.style.display = 'flex';
  }
}

function closeUPIPaymentModal() {
  var modal = document.getElementById('upi-payment-modal');
  if (modal) modal.style.display = 'none';
  
  // Reset view panels and fields
  var mainContent = document.getElementById('upi-modal-main-content');
  var loadingContent = document.getElementById('upi-modal-loading-content');
  var utrInput = document.getElementById('upi-utr-input');
  
  if (mainContent) mainContent.style.display = 'block';
  if (loadingContent) loadingContent.style.display = 'none';
  if (utrInput) {
    utrInput.value = '';
    utrInput.style.borderColor = '';
    utrInput.style.boxShadow = '';
  }
  
  pendingUpgradePlan = null;
}

function confirmSubscriptionPayment() {
  if (!pendingUpgradePlan) return;
  
  var utrInput = document.getElementById('upi-utr-input');
  var utr = utrInput ? utrInput.value.trim() : '';
  
  // Validation: Must be a 12-digit number
  if (utr.length !== 12 || !/^\d{12}$/.test(utr)) {
    showToast('Please enter a valid 12-digit numeric UPI UTR number!', 'error');
    if (utrInput) {
      utrInput.focus();
      utrInput.style.borderColor = '#ef4444';
      utrInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';
    }
    return;
  }
  
  if (utrInput) {
    utrInput.style.borderColor = '';
    utrInput.style.boxShadow = '';
  }
  
  var mainContent = document.getElementById('upi-modal-main-content');
  var loadingContent = document.getElementById('upi-modal-loading-content');
  var statusIcon = document.getElementById('upi-modal-status-icon');
  var loadingTitle = document.getElementById('upi-loading-title');
  var loadingSubtitle = document.getElementById('upi-loading-subtitle');
  
  if (mainContent && loadingContent) {
    // Hide payment screen and display loader view
    mainContent.style.display = 'none';
    loadingContent.style.display = 'flex';
    
    // Step 1: Simulate connection to payment network
    if (statusIcon) {
      statusIcon.className = 'upi-spinner';
      statusIcon.innerHTML = '';
    }
    if (loadingTitle) loadingTitle.textContent = 'Submitting Request';
    if (loadingSubtitle) loadingSubtitle.textContent = 'Registering payment verification request with platform admin...';
    
    setTimeout(function() {
      // Step 2: Show confirmation checkmark and visual updates
      if (statusIcon) {
        statusIcon.className = 'upi-success-checkmark';
        statusIcon.innerHTML = '✓';
      }
      if (loadingTitle) loadingTitle.textContent = 'Submitted Successfully!';
      if (loadingSubtitle) loadingSubtitle.textContent = 'Your payment details have been submitted. Admin will verify and activate your plan.';
      
      setTimeout(function() {
        var upgradePlan = pendingUpgradePlan;
        closeUPIPaymentModal();
        submitSubscriptionPendingRequest(upgradePlan, utr);
      }, 1500);
      
    }, 2000);
  }
}

function submitSubscriptionPendingRequest(plan, utr) {
  showToast('Submitting verification request...', '');
  
  var subscriptionData = {
    subscriptionStatus: 'pending',
    requestedPlan: plan,
    paymentUTR: utr,
    subscriptionExpiry: '—'
  };
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid).update(subscriptionData)
      .then(function() {
        currentUser.subscriptionStatus = 'pending';
        currentUser.requestedPlan = plan;
        currentUser.paymentUTR = utr;
        currentUser.subscriptionExpiry = '—';
        handleLoggedInState();
        closeUpgradeModal();
        showToast('Complete payment registered! Request pending Admin verification.', 'success');
      }).catch(function(err) {
        showToast('Submission failed: ' + err.message, 'error');
      });
    return;
  }
  
  // Sandbox simulated local storage update
  var users = loadData('billblue_simulated_users') || {};
  var email = currentUser.email.toLowerCase();
  if (users[email]) {
    users[email].subscriptionStatus = 'pending';
    users[email].requestedPlan = plan;
    users[email].paymentUTR = utr;
    users[email].subscriptionExpiry = '—';
    saveData('billblue_simulated_users', users);
  }
  
  currentUser.subscriptionStatus = 'pending';
  currentUser.requestedPlan = plan;
  currentUser.paymentUTR = utr;
  currentUser.subscriptionExpiry = '—';
  saveData('billblue_current_user', currentUser);
  handleLoggedInState();
  closeUpgradeModal();
  showToast('Complete payment registered! Request pending Admin verification.', 'success');
}

function processPlanUpgrade(plan) {
  showToast('Upgrading plan to ' + plan.toUpperCase() + '...', '');
  var d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  var expiry = dateStr(d);
  
  var subscriptionData = {
    planType: plan,
    subscriptionStatus: plan === 'free' ? 'inactive' : 'active',
    subscriptionExpiry: expiry
  };
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid).update(subscriptionData)
      .then(function() {
        currentUser.planType = plan;
        currentUser.subscriptionStatus = subscriptionData.subscriptionStatus;
        currentUser.subscriptionExpiry = expiry;
        handleLoggedInState();
        closeUpgradeModal();
        showToast('Subscription upgraded to ' + plan.toUpperCase() + '!', 'success');
      }).catch(function(err) {
        showToast('Upgrade failed: ' + err.message, 'error');
      });
    return;
  }
  
  var users = loadData('billblue_simulated_users') || {};
  var email = currentUser.email.toLowerCase();
  if (users[email]) {
    users[email].planType = plan;
    users[email].subscriptionStatus = subscriptionData.subscriptionStatus;
    users[email].subscriptionExpiry = expiry;
    saveData('billblue_simulated_users', users);
  }
  
  currentUser.planType = plan;
  currentUser.subscriptionStatus = subscriptionData.subscriptionStatus;
  currentUser.subscriptionExpiry = expiry;
  saveData('billblue_current_user', currentUser);
  handleLoggedInState();
  closeUpgradeModal();
  showToast('Subscription upgraded to ' + plan.toUpperCase() + ' (Sandbox)!', 'success');
}

// ═══════════════════════════════════════════
//  PWA INSTALLATION & MOBILE SWIPE GESTURES
// ═══════════════════════════════════════════
var deferredPrompt = null;

// Catch standard PWA install prompts
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault(); // Prevent default browser bar from displaying
  deferredPrompt = e;  // Store deferred prompt globally
  updatePWAInstallUI(); // Render the card in Settings if available
});

// Catch success installation events
window.addEventListener('appinstalled', function(evt) {
  console.log('[PWA] Bill Blue installed successfully!');
  deferredPrompt = null;
  updatePWAInstallUI();
  showToast('Bill Blue installed successfully!', 'success');
});

// Check if swipe guide banner is required on small screens
function checkSwipeHintVisibility() {
  var isMobile = window.innerWidth <= 780;
  var isDismissed = localStorage.getItem('billblue_dismissed_swipe_hint') === 'true';
  var banner = document.getElementById('swipe-hint-banner');
  if (banner) {
    if (isMobile && !isDismissed) {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }
}

// Close and save user swipe banner preferences
function dismissSwipeHint() {
  localStorage.setItem('billblue_dismissed_swipe_hint', 'true');
  var banner = document.getElementById('swipe-hint-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.2s, transform 0.2s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-4px)';
    setTimeout(function() {
      banner.style.display = 'none';
    }, 200);
  }
}

// Render clean installation card actions depending on mobile vs desktop browser
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function updatePWAInstallUI() {
  updatePWACardInstance('pwa-install-card', 'pwa-install-desc', 'btn-pwa-install');
  updatePWACardInstance('pwa-install-card-sub', 'pwa-install-desc-sub', 'btn-pwa-install-sub');
}

function updatePWACardInstance(cardId, descId, btnId) {
  var installCard = document.getElementById(cardId);
  if (!installCard) return;
  
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  
  if (isStandalone) {
    // Hide the install card completely if running in standalone PWA mode (laptop or mobile)
    installCard.style.display = 'none';
  } else {
    installCard.style.display = 'block';
    var desc = document.getElementById(descId);
    var btn = document.getElementById(btnId);
    
    if (isMobileDevice()) {
      // Mobile Browser (Not Standalone yet)
      if (desc) desc.textContent = 'Install Bill Blue on your phone for a full-screen, native standalone shop billing experience!';
      if (btn) {
        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          btn.textContent = 'Install App (Guide)';
        } else {
          btn.textContent = 'Install App';
        }
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.display = 'inline-block';
      }
    } else {
      // Desktop Laptop / PC
      if (desc) desc.textContent = 'Access Bill Blue instantly as a native app on your PC or scan QR to install on Phone!';
      if (btn) {
        btn.textContent = 'Get App / QR Code';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.display = 'inline-block';
      }
    }
  }
}

function openPWAInstallModal() {
  var modal = document.getElementById('pwa-install-modal');
  if (modal) modal.style.display = 'flex';
  
  var mobBtn = document.getElementById('btn-modal-mobile-install');
  if (mobBtn) {
    mobBtn.style.display = isMobileDevice() ? 'inline-flex' : 'none';
  }
  
  var qrContainer = document.getElementById('pwa-install-qr');
  if (qrContainer && typeof QRCode !== 'undefined') {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: window.location.origin + '?action=download',
      width: 110,
      height: 110,
      colorDark : "#1e3a8a",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
  }
}

function triggerMobileInstallFromModal() {
  closePWAInstallModal();
  openMobileDirectInstall();
}

function closePWAInstallModal() {
  var modal = document.getElementById('pwa-install-modal');
  if (modal) modal.style.display = 'none';
}

function triggerPCInstall() {
  closePWAInstallModal();
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choiceResult) {
      if (choiceResult.outcome === 'accepted') {
        showToast('Installing Bill Blue on PC...', 'success');
      }
      deferredPrompt = null;
      updatePWAInstallUI();
    });
  } else {
    showToast('Browser installation prompt is not ready. Click the install icon in your browser address bar!', 'info');
  }
}

function copyProductionUrl() {
  var url = window.location.origin + '?action=download';
  navigator.clipboard.writeText(url).then(function() {
    showToast('Direct mobile download link copied!', 'success');
  }).catch(function() {
    showToast('Failed to copy link.', 'error');
  });
}

function triggerPWAInstall() {
  if (isMobileDevice()) {
    openMobileDirectInstall();
  } else {
    openPWAInstallModal();
  }
}

// ── Mobile Direct Installation Sheet Controls ──
function openMobileDirectInstall() {
  var modal = document.getElementById('mobile-direct-install-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var iosInstructions = document.getElementById('ios-safari-direct-instructions');
  var androidBtn = document.getElementById('btn-mobile-direct-download');
  
  if (isIOS) {
    if (iosInstructions) iosInstructions.style.display = 'block';
    if (androidBtn) androidBtn.style.display = 'none';
  } else {
    if (iosInstructions) iosInstructions.style.display = 'none';
    if (androidBtn) {
      androidBtn.style.display = 'inline-flex';
      if (!deferredPrompt) {
        androidBtn.textContent = 'Add to Home Screen (Guide)';
      } else {
        androidBtn.textContent = 'Install Mobile App';
      }
    }
  }
}

function triggerDirectMobileInstall() {
  if (deferredPrompt) {
    closeMobileDirectInstall();
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choiceResult) {
      if (choiceResult.outcome === 'accepted') {
        showToast('Installing Bill Blue...', 'success');
      }
      deferredPrompt = null;
      updatePWAInstallUI();
    });
  } else {
    closeMobileDirectInstall();
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      showToast('Tap Share in Safari, then Add to Home Screen.', 'info');
    } else {
      showToast('Open your browser menu (three dots) and tap Add to Home screen / Install.', 'info');
    }
  }
}

function closeMobileDirectInstall() {
  var modal = document.getElementById('mobile-direct-install-modal');
  if (modal) modal.style.display = 'none';
}

// ═══════════════════════════════════════════
//  SaaS SPRINT UPGRADE MODULES
// ═══════════════════════════════════════════

var currentOnboardStep = 1;
var activeProfileCustomerId = null;

// Helper: Save user profile changes
function saveUserDataToDbOrSim(user) {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid).set(user)
      .catch(function(e) { console.error("Firestore user save failed", e); });
  } else {
    saveData('billblue_current_user', user);
    var users = loadData('billblue_simulated_users') || {};
    if (user.email) {
      var email = user.email.toLowerCase();
      if (users[email]) {
        users[email].onboarded = user.onboarded;
        users[email].planType = user.planType;
        users[email].subscriptionStatus = user.subscriptionStatus;
        users[email].subscriptionExpiry = user.subscriptionExpiry;
        saveData('billblue_simulated_users', users);
      }
    }
  }
}

// ── Onboarding Wizard ──
function openOnboardingWizard() {
  currentOnboardStep = 1;
  showOnboardStep(1);
  var modal = document.getElementById('onboarding-modal');
  if (modal) modal.style.display = 'flex';
  
  // Populate existing logo/signature previews in onboarding step 3
  var p = loadData(KEYS.BUSINESS) || {};
  var obLogoImg = document.getElementById('ob-logo-img');
  var obLogoPh = document.getElementById('ob-logo-placeholder');
  if (obLogoImg && obLogoPh) {
    if (p.logo) {
      obLogoImg.src = p.logo;
      obLogoImg.style.display = 'block';
      obLogoPh.style.display = 'none';
      safeToggleUploadZoneClass(obLogoImg, 'has-image', true);
    } else {
      obLogoImg.src = '';
      obLogoImg.style.display = 'none';
      obLogoPh.style.display = 'block';
      safeToggleUploadZoneClass(obLogoImg, 'has-image', false);
    }
  }
  
  var obSigImg = document.getElementById('ob-sig-img');
  var obSigPh = document.getElementById('ob-sig-placeholder');
  if (obSigImg && obSigPh) {
    if (p.signature) {
      obSigImg.src = p.signature;
      obSigImg.style.display = 'block';
      obSigPh.style.display = 'none';
      safeToggleUploadZoneClass(obSigImg, 'has-image', true);
    } else {
      obSigImg.src = '';
      obSigImg.style.display = 'none';
      obSigPh.style.display = 'block';
      safeToggleUploadZoneClass(obSigImg, 'has-image', false);
    }
  }
}

function closeOnboardingWizard() {
  var modal = document.getElementById('onboarding-modal');
  if (modal) modal.style.display = 'none';
}

function showOnboardStep(step) {
  document.querySelectorAll('.onboard-step-panel').forEach(function(panel, idx) {
    panel.style.display = (idx + 1) === step ? 'block' : 'none';
  });
  document.querySelectorAll('.onboard-indicator').forEach(function(ind, idx) {
    ind.classList.toggle('active', (idx + 1) === step);
    ind.style.background = (idx + 1) <= step ? 'var(--primary)' : 'var(--border)';
  });
  var indicatorText = document.getElementById('onboard-step-indicator');
  if (indicatorText) indicatorText.textContent = 'Step ' + step + ' of 4';
  
  var btnPrev = document.getElementById('onboard-btn-prev');
  var btnSkip = document.getElementById('onboard-btn-skip');
  var btnNext = document.getElementById('onboard-btn-next');
  
  if (btnPrev) btnPrev.style.display = step > 1 ? 'block' : 'none';
  if (btnSkip) btnSkip.style.display = step < 4 ? 'block' : 'none';
  if (btnNext) {
    btnNext.textContent = step === 4 ? 'Start Using Bill Blue' : 'Continue';
  }
}

function progressOnboarding(offset) {
  var nextStep = currentOnboardStep + offset;
  if (nextStep < 1) return;
  if (nextStep > 4) {
    completeOnboarding();
    return;
  }
  
  if (offset > 0) {
    if (currentOnboardStep === 1) {
      var bizName = getVal('ob-biz-name');
      var bizPhone = getVal('ob-biz-phone');
      if (!bizName || !bizPhone) {
        showToast('Business Name and Phone Number are mandatory', 'error');
        if (!bizName) highlightField(document.getElementById('ob-biz-name'));
        if (!bizPhone) highlightField(document.getElementById('ob-biz-phone'));
        return;
      }
    }
    if (currentOnboardStep === 2) {
      var bizUpi = getVal('ob-pay-upi');
      if (!bizUpi) {
        showToast('UPI ID is mandatory for payment setup', 'error');
        highlightField(document.getElementById('ob-pay-upi'));
        return;
      }
    }
  }
  
  currentOnboardStep = nextStep;
  showOnboardStep(nextStep);
}

function skipOnboarding() {
  if (currentUser) {
    currentUser.onboarded = 'skipped';
    saveUserDataToDbOrSim(currentUser);
  }
  closeOnboardingWizard();
  showOnboardingBanner();
  showToast('Setup skipped! Reminders will show on dashboard.', 'info');
}

function completeOnboarding() {
  var p = loadData(KEYS.BUSINESS) || {};
  p.name = getVal('ob-biz-name');
  p.phone = getVal('ob-biz-phone');
  p.email = getVal('ob-biz-email');
  p.gst = getVal('ob-biz-gst');
  p.address = getVal('ob-biz-address');
  
  p.upi = getVal('ob-pay-upi');
  p.bank = getVal('ob-pay-bank');
  p.ifsc = getVal('ob-pay-ifsc');
  p.accNumber = getVal('ob-pay-acc');
  p.accHolder = getVal('ob-pay-holder');
  
  var obTaxOnEl = document.getElementById('ob-pref-tax-on');
  var taxOn = obTaxOnEl ? obTaxOnEl.checked : false;
  var obTaxRateEl = document.getElementById('ob-pref-tax-rate');
  var taxRate = obTaxRateEl ? (parseFloat(obTaxRateEl.value) || 18) : 18;
  var prefix = getVal('ob-pref-prefix') || 'BB-';
  
  p.taxOnDefault = taxOn;
  p.taxRateDefault = taxRate;
  p.invoicePrefix = prefix;
  p.theme = 'blue';
  
  saveData(KEYS.BUSINESS, p);
  syncSavedProfile(p);
  
  var toggleEl = document.getElementById('tax-toggle');
  if (toggleEl) {
    toggleEl.checked = taxOn;
    toggleTax();
  }
  if (taxRateInput) taxRateInput.value = taxRate;
  
  if (currentUser) {
    currentUser.onboarded = true;
    saveUserDataToDbOrSim(currentUser);
  }
  
  var banner = document.getElementById('onboarding-alert-banner');
  if (banner) banner.remove();
  
  closeOnboardingWizard();
  applyBusinessToInvoice();
  loadSettingsForm();
  showToast('Workspace successfully configured!', 'success');
}

function showOnboardingBanner() {
  var wrapper = document.getElementById('dashboard-wrapper');
  if (!wrapper) return;
  var existing = document.getElementById('onboarding-alert-banner');
  if (existing) existing.remove();
  
  if (currentUser && currentUser.onboarded === 'skipped') {
    var banner = document.createElement('div');
    banner.id = 'onboarding-alert-banner';
    banner.className = 'onboarding-banner';
    banner.style.width = '100%';
    banner.style.boxSizing = 'border-box';
    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div style="text-align:left;">
            <strong style="color:var(--text); font-size:0.8rem; display:block;">Complete Your Business Profile</strong>
            <span style="color:var(--text-sec); font-size:0.7rem;">Please complete your onboarding setup to unlock custom invoice branding, dynamic UPI payment routing, and billing preferences.</span>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="openOnboardingWizard()" style="height:30px; font-size:0.7rem; padding:0 12px; font-weight:700;">Complete Setup</button>
          <button class="btn btn-clear" onclick="dismissOnboardingBanner()" style="height:30px; font-size:0.7rem; padding:0 8px;">Dismiss</button>
        </div>
      </div>
    `;
    wrapper.insertBefore(banner, wrapper.firstChild);
  }
}

function dismissOnboardingBanner() {
  var banner = document.getElementById('onboarding-alert-banner');
  if (banner) banner.remove();
}


// ── Products Catalog CRUD ──
function getProducts() {
  return loadData('billblue_products') || [];
}

function openProductModal(id) {
  var modal = document.getElementById('product-add-modal');
  if (!modal) return;
  
  var title = document.getElementById('prod-modal-title');
  var idInput = document.getElementById('prod-id-edit');
  
  if (id) {
    if (title) title.textContent = 'Edit Product Catalog Item';
    var prods = getProducts();
    var p = prods.find(function(item) { return item.id === id; });
    if (p) {
      if (idInput) idInput.value = p.id;
      setVal('prod-name', p.name);
      setVal('prod-category', p.category || '');
      setVal('prod-hsn', p.hsn || '');
      document.getElementById('prod-unit').value = p.unit || 'Nos';
      setVal('prod-price', p.price);
      document.getElementById('prod-tax').value = p.tax || 18;
      setVal('prod-stock', p.stock);
    }
  } else {
    if (title) title.textContent = 'Add Product to Catalog';
    if (idInput) idInput.value = '';
    setVal('prod-name', '');
    setVal('prod-category', '');
    setVal('prod-hsn', '');
    document.getElementById('prod-unit').value = 'Nos';
    setVal('prod-price', '');
    document.getElementById('prod-tax').value = '18';
    setVal('prod-stock', '50');
  }
  
  modal.style.display = 'flex';
}

function closeProductModal() {
  var modal = document.getElementById('product-add-modal');
  if (modal) modal.style.display = 'none';
}

function saveProductCatalogItem() {
  var name = getVal('prod-name');
  var price = parseFloat(getVal('prod-price'));
  
  if (!name || isNaN(price) || price < 0) {
    showToast('Product Name and valid Base Price are mandatory', 'error');
    if (!name) highlightField(document.getElementById('prod-name'));
    if (isNaN(price)) highlightField(document.getElementById('prod-price'));
    return;
  }
  
  var id = getVal('prod-id-edit') || generateId();
  var prod = {
    id: id,
    name: name,
    category: getVal('prod-category'),
    hsn: getVal('prod-hsn'),
    unit: document.getElementById('prod-unit').value,
    price: price,
    tax: parseFloat(document.getElementById('prod-tax').value) || 18,
    stock: parseInt(getVal('prod-stock')) || 0
  };
  
  var prods = getProducts();
  var idx = prods.findIndex(function(p) { return p.id === id; });
  if (idx !== -1) prods[idx] = prod;
  else prods.push(prod);
  
  saveData('billblue_products', prods);
  syncProductToDb(prod);
  
  closeProductModal();
  renderProductsList();
  if (typeof checkLowStockAlerts === 'function') checkLowStockAlerts();
  showToast('Product saved successfully!', 'success');
}

function editProductItem(id) {
  openProductModal(id);
}

function deleteProductItem(id) {
  if (!confirm('Are you sure you want to delete this product from your catalog?')) return;
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('products').doc(id).delete()
      .catch(function(e) { console.error("Firestore product deletion failed", e); });
  }
  
  var prods = getProducts().filter(function(p) { return p.id !== id; });
  saveData('billblue_products', prods);
  
  renderProductsList();
  if (typeof checkLowStockAlerts === 'function') checkLowStockAlerts();
  showToast('Product removed from catalog', 'warning');
}

function renderProductsList() {
  var prods = getProducts();
  var query = getVal('product-search').toLowerCase();
  var tbody = document.getElementById('products-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  var total = prods.length;
  var sumPrice = 0;
  var lowStock = 0;
  
  var filtered = prods.filter(function(p) {
    if (p.price) sumPrice += p.price;
    if (p.stock <= 5) lowStock++;
    return p.name.toLowerCase().includes(query) || 
           (p.category && p.category.toLowerCase().includes(query)) || 
           (p.hsn && p.hsn.toLowerCase().includes(query));
  });
  
  var avgPrice = total > 0 ? (sumPrice / total) : 0;
  
  var totalEl = document.getElementById('prod-stat-total');
  if (totalEl) totalEl.textContent = total;
  var avgEl = document.getElementById('prod-stat-average');
  if (avgEl) avgEl.textContent = formatINR(avgPrice);
  var lowEl = document.getElementById('prod-stat-low-stock');
  if (lowEl) lowEl.textContent = lowStock;
  
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted); font-weight: 500;">No products found in catalog.</td></tr>';
    return;
  }
  
  filtered.forEach(function(p) {
    var tr = document.createElement('tr');
    var stockColor = p.stock <= 5 ? '#ef4444' : 'var(--text-sec)';
    var stockWeight = p.stock <= 5 ? '700' : '500';
    
    tr.innerHTML = `
      <td data-label="Item Name" style="font-weight:600; color:var(--text);">${escapeHtml(p.name)}</td>
      <td data-label="Category">${escapeHtml(p.category || '—')}</td>
      <td data-label="HSN/SAC" style="text-align:center; font-family:monospace; font-weight:600;">${escapeHtml(p.hsn || '—')}</td>
      <td data-label="Unit" style="text-align:center;">${escapeHtml(p.unit || 'Nos')}</td>
      <td data-label="Price" style="text-align:right; font-weight:700; font-variant-numeric:tabular-nums; color:var(--text);">${formatINR(p.price)}</td>
      <td data-label="GST Tax" style="text-align:center; font-weight:600; color:var(--primary-med);">${p.tax}%</td>
      <td data-label="Stock" style="text-align:center; color:${stockColor}; font-weight:${stockWeight}; font-variant-numeric:tabular-nums;">${p.stock}</td>
      <td data-label="Actions" style="text-align:center;">
        <button class="btn-link" style="margin-right:8px;" onclick="editProductItem('${p.id}')">Edit</button>
        <button class="btn-danger-ghost" onclick="deleteProductItem('${p.id}')" style="display:inline-flex;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  populateProductsDatalist();
}

function populateProductsDatalist() {
  var datalist = document.getElementById('products-datalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  var prods = getProducts();
  prods.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.name;
    datalist.appendChild(opt);
  });
}

function handleProductAutocomplete(input) {
  var name = input.value.trim();
  var prods = getProducts();
  var found = prods.find(function(p) { return p.name.toLowerCase() === name.toLowerCase(); });
  if (found) {
    var row = input.closest('tr');
    var rateInput = row.querySelector('.item-rate');
    var hsnInput = row.querySelector('.item-hsn');
    var unitSelect = row.querySelector('.item-unit');
    
    if (rateInput) rateInput.value = found.price;
    if (hsnInput) hsnInput.value = found.hsn || '';
    if (unitSelect) unitSelect.value = found.unit || 'Nos';
    
    recalculate();
  }
}

function syncProductToDb(prod) {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('products').doc(prod.id).set(prod)
      .catch(function(e) { console.error("Firestore product sync failed", e); });
  }
}

function loadProductsFromFirestore() {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('products').get().then(function(snap) {
        var prods = [];
        snap.forEach(function(doc) { prods.push(doc.data()); });
        saveData('billblue_products', prods);
        renderProductsList();
        populateProductsDatalist();
      });
  }
}


// ── Customer Management Profiles CRUD ──
function getCustomers() {
  return loadData('billblue_customers') || [];
}

function openCustomerModal(id) {
  if (!checkFeatureAccess('customers')) return;
  var modal = document.getElementById('customer-add-modal');
  if (!modal) return;
  
  var title = document.getElementById('cust-modal-title');
  var idInput = document.getElementById('cust-id-edit');
  var balanceGroup = document.getElementById('opening-balance-group');
  
  if (id) {
    if (title) title.textContent = 'Edit Customer Profile';
    if (balanceGroup) balanceGroup.style.display = 'none';
    var custs = getCustomers();
    var c = custs.find(function(cust) { return cust.id === id; });
    if (c) {
      if (idInput) idInput.value = c.id;
      setVal('cust-name', c.name);
      setVal('cust-phone', c.phone);
      setVal('cust-address', c.address || '');
    }
  } else {
    if (title) title.textContent = 'Add Customer Profile';
    if (balanceGroup) balanceGroup.style.display = 'block';
    if (idInput) idInput.value = '';
    setVal('cust-name', '');
    setVal('cust-phone', '');
    setVal('cust-address', '');
    setVal('cust-opening-balance', '0');
  }
  
  modal.style.display = 'flex';
}

function closeCustomerModal() {
  var modal = document.getElementById('customer-add-modal');
  if (modal) modal.style.display = 'none';
}

function saveCustomerDirectoryItem() {
  if (!checkFeatureAccess('customers')) return;
  var name = getVal('cust-name');
  var phone = getVal('cust-phone');
  
  if (!name || !phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
    showToast('Customer Name and valid 10-digit mobile number are mandatory', 'error');
    if (!name) highlightField(document.getElementById('cust-name'));
    if (!phone) highlightField(document.getElementById('cust-phone'));
    return;
  }
  
  var id = getVal('cust-id-edit') || generateId();
  var isEdit = !!getVal('cust-id-edit');
  
  var custs = getCustomers();
  var cust = {
    id: id,
    name: name,
    phone: phone,
    address: getVal('cust-address'),
    balance: isEdit ? 0 : (parseFloat(getVal('cust-opening-balance')) || 0),
    createdAt: Date.now()
  };
  
  var idx = custs.findIndex(function(c) { return c.id === id; });
  if (idx !== -1) {
    cust.balance = custs[idx].balance; // Keep existing balance
    custs[idx] = cust;
  } else {
    custs.push(cust);
  }
  
  saveData('billblue_customers', custs);
  syncCustomerToDb(cust);
  
  closeCustomerModal();
  renderCustomersList();
  showToast('Customer Profile saved!', 'success');
}

function deleteCustomerItem(id) {
  if (!checkFeatureAccess('customers')) return;
  if (!confirm('Warning: Deleting this customer will delete their complete Khata Book history! Continue?')) return;
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('customers').doc(id).delete()
      .catch(function(e) { console.error("Firestore customer deletion failed", e); });
  }
  
  var custs = getCustomers().filter(function(c) { return c.id !== id; });
  saveData('billblue_customers', custs);
  
  // Clean related Khata transactions too
  var txs = getKhataTransactions().filter(function(t) { return t.customerId !== id; });
  saveData('billblue_khata_transactions', txs);
  
  renderCustomersList();
  renderKhataBookList();
  showToast('Customer Profile deleted', 'warning');
}

function renderCustomersList() {
  var custs = getCustomers();
  var query = getVal('customer-search').toLowerCase();
  var tbody = document.getElementById('customers-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  var total = custs.length;
  var receivables = 0;
  var debtorsCount = 0;
  
  var filtered = custs.filter(function(c) {
    if (c.balance > 0) {
      receivables += c.balance;
      debtorsCount++;
    }
    return c.name.toLowerCase().includes(query) || 
           c.phone.toLowerCase().includes(query) || 
           (c.address && c.address.toLowerCase().includes(query));
  });
  
  var totEl = document.getElementById('cust-stat-total');
  if (totEl) totEl.textContent = total;
  var recEl = document.getElementById('cust-stat-receivables');
  if (recEl) recEl.textContent = formatINR(receivables);
  var activeEl = document.getElementById('cust-stat-active-debtors');
  if (activeEl) activeEl.textContent = debtorsCount;
  
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted); font-weight: 500;">No customers found in directory.</td></tr>';
    return;
  }
  
  filtered.forEach(function(c) {
    var tr = document.createElement('tr');
    var balColor = c.balance > 0 ? '#ef4444' : 'var(--text-sec)';
    var balWeight = c.balance > 0 ? '700' : '500';
    
    tr.innerHTML = `
      <td data-label="Customer" style="font-weight:600; color:var(--text);">${escapeHtml(c.name)}</td>
      <td data-label="Phone" style="font-variant-numeric:tabular-nums;">${escapeHtml(c.phone)}</td>
      <td data-label="Address">${escapeHtml(c.address || '—')}</td>
      <td data-label="Outstanding Dues" style="text-align:right; color:${balColor}; font-weight:${balWeight}; font-variant-numeric:tabular-nums;">${formatINR(c.balance)}</td>
      <td data-label="Actions" style="text-align:center;">
        <button class="btn-link" style="margin-right:8px;" onclick="openCustomerProfile('${c.id}')">View Profile</button>
        <button class="btn-danger-ghost" onclick="deleteCustomerItem('${c.id}')" style="display:inline-flex;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  populateCustomersDatalist();
}

function handleCustomerAutocomplete(input) {
  var name = input.value.trim();
  var custs = getCustomers();
  var found = custs.find(function(c) { return c.name.toLowerCase() === name.toLowerCase(); });
  if (found) {
    var phoneInput = document.getElementById('customer-phone');
    var addressInput = document.getElementById('customer-address');
    
    if (phoneInput) phoneInput.value = found.phone || '';
    if (addressInput) addressInput.value = found.address || '';
  }
}

function syncCustomerToDb(cust) {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('customers').doc(cust.id).set(cust)
      .catch(function(e) { console.error("Firestore customer sync failed", e); });
  }
}

function loadCustomersFromFirestore() {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('customers').get().then(function(snap) {
        var custs = [];
        snap.forEach(function(doc) { custs.push(doc.data()); });
        saveData('billblue_customers', custs);
        renderCustomersList();
        populateCustomersDatalist();
      });
  }
}


// ── Khata Credit Book Ledger ──
function getKhataTransactions() {
  return loadData('billblue_khata_transactions') || [];
}

function openCustomerProfile(id) {
  var custs = getCustomers();
  var c = custs.find(function(cust) { return cust.id === id; });
  if (!c) return;
  
  activeProfileCustomerId = id;
  document.getElementById('customers-list-viewport').style.display = 'none';
  document.getElementById('customers-profile-viewport').style.display = 'block';
  
  document.getElementById('profile-cust-name').textContent = c.name;
  document.getElementById('profile-cust-meta').textContent = 'Phone: ' + c.phone + ' | Address: ' + (c.address || '—');
  document.getElementById('profile-pending-dues').textContent = formatINR(c.balance);
  if (c.balance > 0) {
    document.getElementById('profile-pending-dues').style.color = '#ef4444';
  } else {
    document.getElementById('profile-pending-dues').style.color = 'var(--text)';
  }
  
  // Purchases calculations
  var allInvoices = loadData(KEYS.INVOICES) || [];
  var customerInvoices = allInvoices.filter(function(inv) {
    return inv.customerName && inv.customerName.toLowerCase() === c.name.toLowerCase();
  });
  
  var totalPurchased = 0;
  var lastOrderDate = '—';
  var sortedInvs = customerInvoices.slice().sort(function(a,b) { return new Date(b.date) - new Date(a.date); });
  if (sortedInvs.length > 0) {
    lastOrderDate = sortedInvs[0].date;
  }
  customerInvoices.forEach(function(inv) {
    totalPurchased += inv.grandTotal || inv.total || 0;
  });
  
  document.getElementById('profile-total-purchased').textContent = formatINR(totalPurchased);
  document.getElementById('profile-last-order-date').textContent = lastOrderDate;
  
  // Profile invoice list
  var invTbody = document.getElementById('profile-invoices-tbody');
  invTbody.innerHTML = '';
  if (customerInvoices.length === 0) {
    invTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:12px; color:var(--text-muted); font-weight:500;">No billing records found.</td></tr>';
  } else {
    customerInvoices.forEach(function(inv) {
      var tr = document.createElement('tr');
      var bc = inv.status === 'paid' ? 'badge-paid' : 'badge-pending';
      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text);">${escapeHtml(inv.number)}</td>
        <td style="font-variant-numeric:tabular-nums;">${escapeHtml(inv.date)}</td>
        <td style="text-align:right; font-weight:700; font-variant-numeric:tabular-nums;">${formatINR(inv.grandTotal||inv.total||0)}</td>
        <td style="text-align:center;"><span class="badge ${bc}">${inv.status === 'paid' ? 'Paid' : 'Pending'}</span></td>
      `;
      invTbody.appendChild(tr);
    });
  }
  
  // Ledger logs
  var khataTbody = document.getElementById('profile-khata-tbody');
  khataTbody.innerHTML = '';
  var txs = getKhataTransactions().filter(function(tx) { return tx.customerId === id; });
  
  if (txs.length === 0) {
    khataTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:12px; color:var(--text-muted); font-weight:500;">No ledger logs registered.</td></tr>';
  } else {
    txs.forEach(function(tx) {
      var tr = document.createElement('tr');
      var typeLabel = tx.type === 'payment' ? 'Receive (Paid)' : 'Credit (Debt)';
      var typeColor = tx.type === 'payment' ? '#10b981' : '#ef4444';
      tr.innerHTML = `
        <td style="font-variant-numeric:tabular-nums; color:var(--text-sec);">${escapeHtml(tx.date)}</td>
        <td style="color:${typeColor}; font-weight:700; font-size:0.7rem; text-transform:uppercase;">${typeLabel}</td>
        <td>${escapeHtml(tx.description || 'Manual Entry')}</td>
        <td style="text-align:right; font-weight:700; color:var(--text); font-variant-numeric:tabular-nums;">${formatINR(tx.amount)}</td>
      `;
      khataTbody.appendChild(tr);
    });
  }
  
  var reminderBtn = document.getElementById('btn-whatsapp-reminder');
  if (reminderBtn) {
    reminderBtn.onclick = function() {
      sendWhatsAppReminder(c.name, c.balance, c.phone);
    };
  }
}

function openKhataModal(type) {
  var modal = document.getElementById('khata-transaction-modal');
  if (!modal) return;
  
  document.getElementById('khata-transaction-type').value = type;
  var title = document.getElementById('khata-modal-title');
  var btn = document.getElementById('khata-submit-btn');
  
  if (type === 'payment') {
    if (title) title.textContent = 'Add Payment (Receive)';
    if (btn) {
      btn.textContent = 'Receive Payment';
      btn.style.background = '#10b981';
      btn.style.borderColor = '#10b981';
    }
  } else {
    if (title) title.textContent = 'Give Credit (Debt)';
    if (btn) {
      btn.textContent = 'Log Credit Debt';
      btn.style.background = '#ef4444';
      btn.style.borderColor = '#ef4444';
    }
  }
  
  document.getElementById('khata-amount').value = '';
  document.getElementById('khata-desc').value = '';
  modal.style.display = 'flex';
}

function closeKhataModal() {
  var modal = document.getElementById('khata-transaction-modal');
  if (modal) modal.style.display = 'none';
}

function saveKhataTransaction() {
  var type = document.getElementById('khata-transaction-type').value;
  var amt = parseFloat(getVal('khata-amount'));
  var desc = getVal('khata-desc');
  
  if (isNaN(amt) || amt <= 0) {
    showToast('Please enter a valid numeric amount', 'error');
    highlightField(document.getElementById('khata-amount'));
    return;
  }
  
  var id = generateId();
  var tx = {
    id: id,
    customerId: activeProfileCustomerId,
    type: type,
    amount: amt,
    description: desc,
    date: getTodayStr()
  };
  
  var txs = getKhataTransactions();
  txs.push(tx);
  saveData('billblue_khata_transactions', txs);
  syncKhataTransactionToDb(tx);
  
  // Sync Customer Balance
  var custs = getCustomers();
  var cIdx = custs.findIndex(function(c) { return c.id === activeProfileCustomerId; });
  if (cIdx !== -1) {
    if (type === 'payment') {
      custs[cIdx].balance = Math.max(0, custs[cIdx].balance - amt);
    } else {
      custs[cIdx].balance += amt;
    }
    saveData('billblue_customers', custs);
    syncCustomerToDb(custs[cIdx]);
  }
  
  closeKhataModal();
  openCustomerProfile(activeProfileCustomerId);
  renderKhataBookList();
  showToast('Khata Book Ledger updated!', 'success');
}

function renderKhataBookList() {
  var custs = getCustomers();
  var tbody = document.getElementById('khata-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  var totalOutstanding = 0;
  var debtors = custs.filter(function(c) {
    if (c.balance > 0) totalOutstanding += c.balance;
    return c.balance > 0;
  });
  
  var outEl = document.getElementById('khata-stat-total-outstanding');
  if (outEl) outEl.textContent = formatINR(totalOutstanding);
  
  if (!debtors.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted); font-weight: 500;">No active debtors found in Credit Book.</td></tr>';
    return;
  }
  
  debtors.forEach(function(c) {
    var tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Debtor" style="font-weight:600; color:var(--text);">${escapeHtml(c.name)}</td>
      <td data-label="Phone" style="font-variant-numeric:tabular-nums;">${escapeHtml(c.phone)}</td>
      <td data-label="Debt Amount" style="text-align:right; color:#ef4444; font-weight:700; font-variant-numeric:tabular-nums;">${formatINR(c.balance)}</td>
      <td data-label="Actions" style="text-align:center;">
        <button class="btn-link" style="margin-right:8px;" onclick="navigateToCustomersAndOpenProfile('${c.id}')">View Details</button>
        <button class="btn btn-save" style="background:#2563eb; border-color:#2563eb; height:26px; padding:0 8px; font-size:0.65rem; display:inline-flex;" onclick="sendWhatsAppReminder('${c.name}', ${c.balance}, '${c.phone}')">Remind</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function navigateToCustomersAndOpenProfile(id) {
  navigateTo('customers');
  openCustomerProfile(id);
}

function syncKhataTransactionToDb(tx) {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('khata_transactions').doc(tx.id).set(tx)
      .catch(function(e) { console.error("Firestore khata transaction sync failed", e); });
  }
}

function loadKhataFromFirestore() {
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
      .collection('khata_transactions').get().then(function(snap) {
        var txs = [];
        snap.forEach(function(doc) { txs.push(doc.data()); });
        saveData('billblue_khata_transactions', txs);
        renderKhataBookList();
      });
  }
}


// ── WhatsApp Payment Reminders ──
function sendWhatsAppReminder(name, dues, phone) {
  var biz = loadData(KEYS.BUSINESS) || {};
  var bizName = biz.name || 'our business';
  var msg = "Hello " + name + ",\nThis is a friendly reminder regarding your pending payment of " + formatINR(dues) + " with " + bizName + ". Please clear outstanding dues at your earliest convenience.\n\nThanks,\n" + bizName;
  
  var cleanedPhone = phone.replace(/\D/g, '');
  if (cleanedPhone.length === 10) {
    cleanedPhone = '91' + cleanedPhone;
  }
  
  var url = "https://api.whatsapp.com/send?phone=" + cleanedPhone + "&text=" + encodeURIComponent(msg);
  window.open(url, '_blank');
}


// ── Inventory Stock Level Checks ──
function checkLowStockAlerts() {
  var prods = getProducts();
  var lowStock = prods.filter(function(p) { return p.stock <= 5; });
  var banner = document.getElementById('low-stock-alert-banner');
  if (banner) banner.remove();
  
  var isPro = currentUser && currentUser.planType === 'pro';
  if (lowStock.length > 0 && isPro) {
    var names = lowStock.map(function(p) { return p.name + " (" + p.stock + " units)"; }).join(', ');
    var wrapper = document.getElementById('dashboard-wrapper');
    if (wrapper) {
      var alertDiv = document.createElement('div');
      alertDiv.id = 'low-stock-alert-banner';
      alertDiv.className = 'onboarding-banner';
      alertDiv.style.background = '#fffbeb';
      alertDiv.style.borderColor = '#fef3c7';
      alertDiv.style.boxSizing = 'border-box';
      alertDiv.style.width = '100%';
      alertDiv.style.padding = '12px 16px';
      alertDiv.style.marginBottom = '20px';
      
      alertDiv.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; text-align:left;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>
            <strong style="color:#92400e; font-size:0.78rem; display:block;">Low Stock Alert Warnings</strong>
            <span style="color:#b45309; font-size:0.7rem;">The following cataloged products have critical low stock <= 5 units: <strong>${escapeHtml(names)}</strong>. Please update inventory.</span>
          </div>
        </div>
      `;
      wrapper.insertBefore(alertDiv, wrapper.firstChild);
    }
  }
}


// ── Advanced Feature Paywall System ──
function applyPaywalls() {
  var isPro = currentUser && currentUser.planType === 'pro';
  
  // 1. Dashboard Blur/Lock
  var wrap = document.getElementById('dashboard-wrapper');
  var paywall = document.getElementById('dashboard-paywall');
  if (wrap && paywall) {
    if (isPro) {
      wrap.classList.remove('restricted-blur');
      paywall.style.display = 'none';
    } else {
      wrap.classList.add('restricted-blur');
      paywall.style.display = 'flex';
    }
  }
  
  // 2. Settings Hub panels paywalls
  toggleSectionPaywall('hub-panel-products', true, '', '');
  toggleSectionPaywall('hub-panel-customers', isPro, 'Unlock Customer Profiles', 'Track purchase histories, order metrics, and auto-populate customer details on invoices with the Pro Plan.');
  toggleSectionPaywall('hub-panel-khata', isPro, 'Unlock Khata Credit Ledger', 'Track active debtor balances, manual payments, credit dues, and send WhatsApp payment notifications with the Pro Plan.');
  toggleSectionPaywall('hub-panel-inventory', isPro, 'Unlock Inventory Tracking', 'Track product stock levels, set low-stock warning alerts, and adjust stock quantities manually with the Pro Plan.');
  toggleSectionPaywall('hub-panel-analytics', isPro, 'Unlock Advanced Business Analytics', 'Visualize monthly sales, order distribution loops, and top-selling product statistics with the Pro Plan.');
}

function toggleSectionPaywall(sectionId, isPro, title, desc) {
  var section = document.getElementById(sectionId);
  if (!section) return;
  
  var paywallId = sectionId + '-paywall';
  var existingPaywall = document.getElementById(paywallId);
  
  if (isPro) {
    if (existingPaywall) existingPaywall.style.display = 'none';
    section.querySelectorAll(':not(#' + paywallId + ')').forEach(function(el) {
      el.classList.remove('restricted-blur');
    });
  } else {
    section.style.position = 'relative';
    section.querySelectorAll(':not(#' + paywallId + ')').forEach(function(el) {
      el.classList.add('restricted-blur');
    });
    
    if (!existingPaywall) {
      existingPaywall = document.createElement('div');
      existingPaywall.id = paywallId;
      existingPaywall.className = 'paywall-overlay';
      existingPaywall.style.background = 'rgba(240, 242, 245, 0.75)';
      existingPaywall.innerHTML = `
        <div class="paywall-card">
          <div class="paywall-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h2 class="paywall-title">${title}</h2>
          <p class="paywall-subtitle">${desc}</p>
          <button class="btn btn-primary" onclick="openUpgradeModal()">Upgrade to Pro (₹299/yr)</button>
        </div>
      `;
      section.appendChild(existingPaywall);
    }
    existingPaywall.style.display = 'flex';
  }
}

// Hide App initialization loader screen smoothly
function hideSplashScreen() {
  var splash = document.getElementById('app-splash-screen');
  if (splash) {
    splash.style.opacity = '0';
    splash.style.transform = 'scale(0.96)';
    splash.style.pointerEvents = 'none';
    setTimeout(function() {
      splash.remove();
    }, 400);
  }
}

// ═══════════════════════════════════════════
//  BILL BLUE RESTUCTURING EXTRA SAAS LOGIC
// ═══════════════════════════════════════════

// Onboarding Image Upload Handlers
function handleOnboardLogoUpload(e) {
  handleImgUpload(e, 'ob-logo-img', 'ob-logo-placeholder', 'logo');
}
function handleOnboardSignatureUpload(e) {
  handleImgUpload(e, 'ob-sig-img', 'ob-sig-placeholder', 'signature');
}

// Support Deep-Link Generator
function contactSetupSupport() {
  var phone = "919398116740";
  var bizName = "";
  if (currentUser && currentUser.businessSettings && currentUser.businessSettings.name) {
    bizName = currentUser.businessSettings.name;
  } else {
    var p = loadData(KEYS.BUSINESS) || {};
    bizName = p.name || "";
  }
  
  var text = "Hello Bill Blue Support, I need help setting up my business account. Please guide me with configuring my Business Profile, Logo, UPI Setup, Product Catalog, and Customer Import.";
  if (bizName) {
    text = "Hello Bill Blue Support, I need help setting up my business account for '" + bizName + "'. Please guide me with configuring my Business Profile, Logo, UPI Setup, Product Catalog, and Customer Import.";
  }
  
  var url = "https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodeURIComponent(text);
  window.open(url, "_blank");
}

// ── Settings Hub Split SPA Controls ──
function switchSettingsTab(tabName) {
  var tabs = document.querySelectorAll('.hub-tab');
  tabs.forEach(function(tab) {
    tab.classList.remove('active');
  });
  
  var clickedTab = Array.prototype.find.call(tabs, function(t) {
    return t.getAttribute('onclick') === "switchSettingsTab('" + tabName + "')";
  });
  if (clickedTab) clickedTab.classList.add('active');
  
  var panels = document.querySelectorAll('.hub-panel');
  panels.forEach(function(panel) {
    panel.classList.remove('active-panel');
  });
  
  var activePanel = document.getElementById('hub-panel-' + tabName);
  if (activePanel) {
    activePanel.classList.add('active-panel');
    if (tabName === 'analytics') {
      renderHubAnalyticsCharts();
    } else if (tabName === 'inventory') {
      renderInventoryTab();
    }
  }
  
  var layout = document.getElementById('settings-hub-layout');
  if (layout) {
    layout.classList.add('viewport-active');
  }
  
  if (typeof applyPaywalls === 'function') {
    applyPaywalls();
  }

  // Refresh Desktop Sidebar sub-tab highlighting
  document.querySelectorAll('.nav-item').forEach(function(i) {
    var isSubTabItem = i.hasAttribute('data-settings-tab');
    if (isSubTabItem) {
      var subTab = i.getAttribute('data-settings-tab');
      i.classList.toggle('active', subTab === tabName);
    } else if (i.getAttribute('data-view') === 'settings') {
      i.classList.remove('active');
    }
  });

  // Refresh Mobile Bottom Navigation Settings Sub-Tabs
  document.querySelectorAll('.mobile-nav-item').forEach(function(i) {
    if (i.getAttribute('data-view') === 'settings') {
      var itemTab = i.getAttribute('data-settings-tab');
      if (itemTab) {
        i.classList.toggle('active', itemTab === tabName);
      }
    } else if (i.classList.contains('active')) {
      i.classList.remove('active');
    }
  });
}

function backToHubMenu() {
  var layout = document.getElementById('settings-hub-layout');
  if (layout) {
    layout.classList.remove('viewport-active');
  }
}

function navigateToCustomersAndOpenProfile(id) {
  navigateTo('settings');
  switchSettingsTab('customers');
  openCustomerProfile(id);
}

// ── Settings Hub Advanced Analytics ──
var hubChartRevenue, hubChartInvoices, hubChartProducts;

function renderHubAnalyticsCharts() {
  if (typeof Chart === 'undefined') return;
  
  var invoices = loadData(KEYS.INVOICES) || [];
  
  var months = [];
  var revByMonth = {};
  var countByMonth = {};
  var d = new Date();
  for (var m = 5; m >= 0; m--) {
    var md = new Date(d.getFullYear(), d.getMonth() - m, 1);
    var key = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
    var label = md.toLocaleString('en', { month: 'short' }) + ' ' + md.getFullYear().toString().slice(-2);
    months.push({ key: key, label: label });
    revByMonth[key] = 0;
    countByMonth[key] = 0;
  }
  
  invoices.forEach(function(inv) {
    if (!inv.date) return;
    var k = inv.date.substring(0, 7);
    if (revByMonth[k] !== undefined) {
      revByMonth[k] += inv.grandTotal || inv.total || 0;
      countByMonth[k]++;
    }
  });
  
  var labels = months.map(function(m) { return m.label; });
  var revData = months.map(function(m) { return revByMonth[m.key]; });
  var cntData = months.map(function(m) { return countByMonth[m.key]; });
  
  var chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { font: { size: 10 } } },
      x: { ticks: { font: { size: 10 } } }
    }
  };
  
  var ctx1 = document.getElementById('chart-hub-revenue');
  if (ctx1) {
    if (hubChartRevenue) hubChartRevenue.destroy();
    hubChartRevenue = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ data: revData, backgroundColor: 'rgba(37,99,235,.75)', borderRadius: 4, barPercentage: 0.65 }]
      },
      options: chartOpts
    });
  }
  
  var ctx2 = document.getElementById('chart-hub-invoices');
  if (ctx2) {
    if (hubChartInvoices) hubChartInvoices.destroy();
    hubChartInvoices = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{ data: cntData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.35, borderWidth: 2.5 }]
      },
      options: chartOpts
    });
  }
  
  // Doughnut contribution pie chart
  var custRev = {};
  invoices.forEach(function(inv) {
    var name = inv.customerName || 'Anonymous';
    custRev[name] = (custRev[name] || 0) + (inv.grandTotal || inv.total || 0);
  });
  
  var sortedCusts = [];
  for (var name in custRev) {
    sortedCusts.push({ name: name, value: custRev[name] });
  }
  sortedCusts.sort(function(a, b) { return b.value - a.value; });
  
  var topCusts = sortedCusts.slice(0, 5);
  var otherSum = 0;
  if (sortedCusts.length > 5) {
    sortedCusts.slice(5).forEach(function(c) { otherSum += c.value; });
    topCusts.push({ name: 'Others', value: otherSum });
  }
  
  var ctx3 = document.getElementById('chart-hub-products');
  if (ctx3) {
    if (hubChartProducts) hubChartProducts.destroy();
    
    var pieLabels = topCusts.map(function(c) { return c.name; });
    var pieData = topCusts.map(function(c) { return c.value; });
    var bgColors = ['#1e3a8a', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#cbd5e1'];
    
    hubChartProducts = new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{ data: pieData, backgroundColor: bgColors.slice(0, pieLabels.length), borderWidth: 1 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'right',
            labels: { font: { size: 9 }, boxWidth: 10 }
          }
        }
      }
    });
  }
}

// ── Settings Hub Inventory Tracker ──
function renderInventoryTab() {
  var prods = getProducts() || [];
  
  var totalItems = prods.length;
  var lowStockCount = 0;
  var netStockQty = 0;
  var lowStockNames = [];
  
  prods.forEach(function(p) {
    var qty = p.stock || 0;
    netStockQty += qty;
    if (qty <= 5) {
      lowStockCount++;
      lowStockNames.push(p.name);
    }
  });
  
  var totalItemsEl = document.getElementById('inv-stat-total-items');
  if (totalItemsEl) totalItemsEl.textContent = totalItems;
  
  var lowStockEl = document.getElementById('inv-stat-low-stock');
  if (lowStockEl) lowStockEl.textContent = lowStockCount;
  
  var netStockEl = document.getElementById('inv-stat-total-stock-qty');
  if (netStockEl) netStockEl.textContent = netStockQty;
  
  var alertCard = document.getElementById('low-stock-alert-card');
  var alertText = document.getElementById('low-stock-alert-text');
  if (alertCard && alertText) {
    if (lowStockCount > 0) {
      alertCard.style.display = 'block';
      alertText.textContent = 'The following items are running out of stock (qty <= 5): ' + lowStockNames.join(', ') + '.';
    } else {
      alertCard.style.display = 'none';
    }
  }
  
  var tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  var searchQuery = document.getElementById('inventory-search') ? document.getElementById('inventory-search').value.trim().toLowerCase() : '';
  
  var filteredProds = prods;
  if (searchQuery) {
    filteredProds = prods.filter(function(p) {
      return (p.name && p.name.toLowerCase().indexOf(searchQuery) !== -1) ||
             (p.category && p.category.toLowerCase().indexOf(searchQuery) !== -1);
    });
  }
  
  if (!filteredProds.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted);">No stock items found</td></tr>';
    return;
  }
  
  filteredProds.forEach(function(p) {
    var tr = document.createElement('tr');
    var stockQty = p.stock || 0;
    var stockStyle = stockQty <= 5 ? 'color:#ef4444; font-weight:700;' : 'color:var(--text-sec); font-weight:600;';
    
    tr.innerHTML = `
      <td>\${escapeHtml(p.name)}</td>
      <td>\${escapeHtml(p.category || '—')}</td>
      <td style="text-align:center;">\${escapeHtml(p.unit || 'pcs')}</td>
      <td style="text-align:right; \${stockStyle}">\${stockQty}</td>
      <td style="text-align:center;">
        <button class="btn-link" onclick="adjustStockPrompt('\${p.id}')" style="font-weight:700; color:var(--primary);">Adjust Stock</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adjustStockPrompt(id) {
  var isPro = currentUser && currentUser.planType === 'pro';
  if (!isPro) {
    openUpgradeModal();
    return;
  }
  
  var prods = getProducts();
  var prod = prods.find(function(p) { return p.id === id; });
  if (!prod) return;
  
  var input = prompt("Adjust stock level for '" + prod.name + "'. Enter the new absolute quantity:", prod.stock || 0);
  if (input === null) return;
  
  var newQty = parseInt(input);
  if (isNaN(newQty) || newQty < 0) {
    showToast('Please enter a valid non-negative number!', 'error');
    return;
  }
  
  prod.stock = newQty;
  saveData('billblue_products', prods);
  syncProductToDb(prod);
  
  renderInventoryTab();
  if (typeof renderProductsList === 'function') renderProductsList();
  showToast('Stock adjusted successfully!', 'success');
}



// Referral Code System Logic
function initReferralSystem() {
  if (!currentUser) return;
  
  // Ensure the user has a referral code
  if (!currentUser.referralCode) {
    currentUser.referralCode = 'BB-' + generateId().substring(0, 5).toUpperCase();
    saveUserDataToDbOrSim(currentUser);
  }
  
  var code = currentUser.referralCode;
  
  // Update Settings hub referral elements
  var settingsCodeEl = document.getElementById('settings-referral-code');
  if (settingsCodeEl) settingsCodeEl.textContent = code;
  
  // Update Dedicated Refer view elements
  var displayLinkEl = document.getElementById('referral-link-display');
  if (displayLinkEl) displayLinkEl.textContent = window.location.origin + '?ref=' + code;
  
  var displayCodeEl = document.getElementById('referral-code-display');
  if (displayCodeEl) displayCodeEl.textContent = code;
  
  // Count successfully referred businesses
  var referralsCount = 0;
  if (currentUser.referrals && Array.isArray(currentUser.referrals)) {
    referralsCount = currentUser.referrals.length;
  }
  
  var countEl = document.getElementById('referral-count-display');
  if (countEl) countEl.textContent = referralsCount;
  
  // Hide "Enter Referral Code" button if they have already claimed one
  var btnPage = document.getElementById('btn-enter-referral-page');
  if (btnPage) {
    if (currentUser.referredBy) {
      btnPage.style.display = 'none';
    } else {
      btnPage.style.display = 'inline-flex';
    }
  }
}

function copyReferralLink() {
  if (!currentUser) return;
  var code = currentUser.referralCode || 'BB-XXXXX';
  var link = window.location.origin + '?ref=' + code;
  navigator.clipboard.writeText(link).then(function() {
    showToast('Referral link copied to clipboard!', 'success');
  }).catch(function() {
    showToast('Failed to copy referral link.', 'error');
  });
}

function shareReferralWhatsApp() {
  if (!currentUser) return;
  var code = currentUser.referralCode || 'BB-XXXXX';
  var link = window.location.origin + '?ref=' + code;
  var msg = "Try *Bill Blue* - a professional, clean, fast invoicing & business ERP app! Generate unlimited invoices, print A4 bills, and receive instant UPI payments for free.\n\nJoin using my referral link: " + link + "\n\nOr use my referral code *" + code + "* to unlock 1 Month of Pro plan features completely free!\n\nGet started at: " + window.location.origin;
  var url = "https://api.whatsapp.com/send?text=" + encodeURIComponent(msg);
  window.open(url, "_blank");
}

function shareReferralLink() {
  // Backwards compatibility for old buttons
  shareReferralWhatsApp();
}

function openEnterReferralModal() {
  var modal = document.getElementById('referral-entry-modal');
  if (modal) modal.style.display = 'flex';
}

function closeEnterReferralModal() {
  var modal = document.getElementById('referral-entry-modal');
  if (modal) modal.style.display = 'none';
  var input = document.getElementById('referral-code-input');
  if (input) input.value = '';
}

function submitReferralCode() {
  if (!currentUser) return;
  var input = document.getElementById('referral-code-input');
  var code = input ? input.value.trim().toUpperCase() : '';
  
  if (!code) {
    showToast('Please enter a referral code!', 'error');
    return;
  }
  
  if (code === currentUser.referralCode) {
    showToast('You cannot enter your own referral code!', 'error');
    return;
  }
  
  if (currentUser.referredBy) {
    showToast('You have already claimed a referral code!', 'error');
    return;
  }
  
  showToast('Verifying referral code...', 'info');
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').where('referralCode', '==', code).get()
      .then(function(snapshot) {
        if (snapshot.empty) {
          showToast('Invalid referral code! Please try again.', 'error');
          return;
        }
        
        var referrerDoc = snapshot.docs[0];
        var referrerData = referrerDoc.data();
        var referrerUid = referrerDoc.id;
        
        var refD = new Date();
        if (currentUser.planType === 'pro' && currentUser.subscriptionExpiry && currentUser.subscriptionExpiry !== '—') {
          refD = new Date(currentUser.subscriptionExpiry);
        }
        refD.setDate(refD.getDate() + 30);
        var refExpiry = dateStr(refD);
        
        var currentUserUpdates = {
          planType: 'pro',
          subscriptionStatus: 'active',
          subscriptionExpiry: refExpiry,
          referredBy: code
        };
        
        var refList = referrerData.referrals || [];
        if (!refList.includes(firebaseAuth.currentUser.uid)) {
          refList.push(firebaseAuth.currentUser.uid);
        }
        
        var referD = new Date();
        if (referrerData.planType === 'pro' && referrerData.subscriptionExpiry && referrerData.subscriptionExpiry !== '—') {
          referD = new Date(referrerData.subscriptionExpiry);
        }
        referD.setDate(referD.getDate() + 30);
        var referExpiry = dateStr(referD);
        
        var referrerUpdates = {
          planType: 'pro',
          subscriptionStatus: 'active',
          subscriptionExpiry: referExpiry,
          referrals: refList
        };
        
        var batch = firebaseDb.batch();
        batch.update(firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid), currentUserUpdates);
        batch.update(firebaseDb.collection('users').doc(referrerUid), referrerUpdates);
        
        batch.commit().then(function() {
          currentUser.planType = 'pro';
          currentUser.subscriptionStatus = 'active';
          currentUser.subscriptionExpiry = refExpiry;
          currentUser.referredBy = code;
          
          handleLoggedInState();
          initReferralSystem();
          closeEnterReferralModal();
          showToast('Success! 1 Month Pro activated for both of you!', 'success');
        }).catch(function(err) {
          showToast('Claim failed: ' + err.message, 'error');
        });
      })
      .catch(function(err) {
        showToast('Firestore query failed: ' + err.message, 'error');
      });
    return;
  }
  
  // Sandbox simulated local storage sync
  var users = loadData('billblue_simulated_users') || {};
  var foundReferrerEmail = null;
  for (var email in users) {
    if (users[email].referralCode === code) {
      foundReferrerEmail = email;
      break;
    }
  }
  
  if (!foundReferrerEmail) {
    showToast('Invalid referral code! Please try again.', 'error');
    return;
  }
  
  var referrer = users[foundReferrerEmail];
  
  var refereeExpiryD = new Date();
  if (currentUser.planType === 'pro' && currentUser.subscriptionExpiry && currentUser.subscriptionExpiry !== '—') {
    refereeExpiryD = new Date(currentUser.subscriptionExpiry);
  }
  refereeExpiryD.setDate(refereeExpiryD.getDate() + 30);
  var refereeExpiry = dateStr(refereeExpiryD);
  
  currentUser.planType = 'pro';
  currentUser.subscriptionStatus = 'active';
  currentUser.subscriptionExpiry = refereeExpiry;
  currentUser.referredBy = code;
  
  var referrerExpiryD = new Date();
  if (referrer.planType === 'pro' && referrer.subscriptionExpiry && referrer.subscriptionExpiry !== '—') {
    referrerExpiryD = new Date(referrer.subscriptionExpiry);
  }
  referrerExpiryD.setDate(referrerExpiryD.getDate() + 30);
  var referrerExpiry = dateStr(referrerExpiryD);
  
  referrer.planType = 'pro';
  referrer.subscriptionStatus = 'active';
  referrer.subscriptionExpiry = referrerExpiry;
  
  if (!referrer.referrals) referrer.referrals = [];
  if (!referrer.referrals.includes(currentUser.email)) {
    referrer.referrals.push(currentUser.email);
  }
  
  var refereeEmail = currentUser.email.toLowerCase();
  users[refereeEmail] = {
    ...users[refereeEmail],
    planType: 'pro',
    subscriptionStatus: 'active',
    subscriptionExpiry: refereeExpiry,
    referredBy: code
  };
  users[foundReferrerEmail] = referrer;
  
  saveData('billblue_simulated_users', users);
  saveData('billblue_current_user', currentUser);
  
  handleLoggedInState();
  initReferralSystem();
  closeEnterReferralModal();
  showToast('Success! 1 Month Pro activated for both of you (Sandbox)!', 'success');
}