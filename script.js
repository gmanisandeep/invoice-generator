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
  var tName = themeName || 'blue';
  var theme = THEMES[tName] || THEMES.blue;
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
  document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.toggle('active', i.getAttribute('data-view') === view); });
  document.querySelectorAll('.mobile-nav-item').forEach(function(i) { i.classList.toggle('active', i.getAttribute('data-view') === view); });
  
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
    '<td><input type="text" placeholder="Item name" class="item-name" value="' + escapeAttr(d.name||'') + '"></td>' +
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
  
  if(p.logo){var li=document.getElementById('settings-logo-img');li.src=p.logo;li.style.display='block';document.getElementById('logo-placeholder').style.display='none';li.closest('.upload-zone').classList.add('has-image');}
  if(p.signature){var si=document.getElementById('settings-sig-img');si.src=p.signature;si.style.display='block';document.getElementById('sig-placeholder').style.display='none';si.closest('.upload-zone').classList.add('has-image');}
}
function saveBusinessProfile() {
  var old=loadData(KEYS.BUSINESS)||{};
  var consentToggle = document.getElementById('settings-consent');
  var p={name:getVal('settings-name'),gst:getVal('settings-gst'),phone:getVal('settings-phone'),email:getVal('settings-email'),
    address:getVal('settings-address'),state:document.getElementById('settings-state').value,
    theme:document.getElementById('settings-theme').value,
    bank:getVal('settings-bank'),accHolder:getVal('settings-acc-holder'),accNumber:getVal('settings-acc-number'),
    ifsc:getVal('settings-ifsc'),upi:getVal('settings-upi'),terms:getVal('settings-terms'),
    analyticsConsent: consentToggle ? consentToggle.checked : true,
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
    document.getElementById(phId).style.display='none';img.closest('.upload-zone').classList.add('has-image');
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
  saveData(KEYS.INVOICES,all);showToast('Invoice '+inv.number+' saved!','success');
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
function renderHistory(){
  var all=loadData(KEYS.INVOICES)||[];
  var tb=document.getElementById('history-body');var em=document.getElementById('history-empty');var tbl=document.getElementById('history-table');
  if(!all.length){tbl.style.display='none';em.style.display='flex';return;}
  tbl.style.display='';em.style.display='none';
  var sorted=all.slice().sort(function(a,b){return(b.createdAt||0)-(a.createdAt||0);});
  tb.innerHTML='';
  sorted.forEach(function(inv){
    var tr=document.createElement('tr');
    var bc=inv.status==='paid'?'badge-paid':'badge-pending';var bt=inv.status==='paid'?'Paid':'Pending';
    var statusBtn = inv.status==='paid' 
      ? '<button class="btn-link" style="color:var(--amber); margin-right:12px; font-weight:600;" onclick="toggleStatus(\''+inv.id+'\')">Mark as Pending</button>'
      : '<button class="btn-link" style="color:var(--green); margin-right:12px; font-weight:600;" onclick="toggleStatus(\''+inv.id+'\')">Mark as Paid</button>';
      
    tr.innerHTML='<td>'+escapeHtml(inv.number)+'</td><td>'+escapeHtml(inv.customerName||'—')+'</td><td>'+escapeHtml(inv.date||'—')+'</td><td class="td-amount">'+formatINR(inv.grandTotal||inv.total||0)+'</td><td><span class="badge '+bc+'" style="cursor:pointer" onclick="toggleStatus(\''+inv.id+'\')">'+bt+'</span></td><td class="td-actions">'+statusBtn+'<button class="btn-link" onclick="loadInvoiceForEdit(\''+inv.id+'\')">Edit</button><button class="btn-danger-ghost" onclick="deleteInvoice(\''+inv.id+'\')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>';
    tb.appendChild(tr);
  });
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
    tr.innerHTML = '<td>' + escapeHtml(inv.number) + '</td><td>' + escapeHtml(inv.customerName || '—') + '</td><td>' + escapeHtml(inv.date || '—') + '</td><td class="td-amount">' + formatINR(inv.grandTotal || inv.total || 0) + '</td><td><span class="badge ' + bc + '">' + (inv.status === 'paid' ? 'Paid' : 'Pending') + '</span></td>';
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
  var msg = '📄 *' + invoiceNumberEl.value + '*\n👤 ' + (document.getElementById('customer-name').value || '—') +
    '\n📅 ' + invoiceDateEl.value + '\n💰 ' + grandTotalEl.textContent +
    '\n\nGenerated by Bill Blue';
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ═══════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════
function showToast(msg, type) {
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast-' + type : '');
  t.textContent = msg; c.appendChild(t);
  setTimeout(function() { t.classList.add('toast-out'); setTimeout(function() { t.remove(); }, 250); }, 2200);
}

// ═══════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
function getVal(id) { return (document.getElementById(id).value || '').trim(); }
function setVal(id, v) { document.getElementById(id).value = v || ''; }
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

var MOCK_BUSINESSES = [
  { name: 'Balaji Wholesalers', subscription: 'active', subEnd: '2027-02-15', activity: 'active', invoices: 142, revenue: 485900, consent: true },
  { name: 'Sharma Groceries & Retail', subscription: 'active', subEnd: '2026-11-20', activity: 'active', invoices: 89, revenue: 154200, consent: true },
  { name: 'Siddharth Organics Ltd.', subscription: 'expiring', subEnd: '2026-06-10', activity: 'active', invoices: 231, revenue: 1250000, consent: true },
  { name: 'Deepak Retail Outlet', subscription: 'expired', subEnd: '2026-04-01', activity: 'inactive', invoices: 45, revenue: 87500, consent: false },
  { name: 'Mani Enterprise Agency', subscription: 'expiring', subEnd: '2026-06-18', activity: 'active', invoices: 110, revenue: 320400, consent: true }
];

function renderAdminPortal() {
  var gate = document.getElementById('admin-login-gate');
  var panel = document.getElementById('admin-dashboard-panel');
  if (adminAuthorized) {
    gate.style.display = 'none';
    panel.style.display = 'block';
    renderAdminDashboard();
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

function getAdminBusinesses() {
  var list = [];
  
  // 1. Add current user business
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
  
  // 2. Add mock businesses
  MOCK_BUSINESSES.forEach(function(mb) {
    list.push(mb);
  });
  
  return list;
}

function setAdminSubFilter(filter, btn) {
  adminSubFilter = filter;
  // Manage active button class
  document.querySelectorAll('#view-admin .filter-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  renderAdminDashboard();
}

function renderAdminDashboard() {
  var businesses = getAdminBusinesses();
  
  // Calculate Platform Analytics
  var totalRegistered = businesses.length;
  var activeUsers = 0;
  var expiringSubs = 0;
  var totalInvoices = 0;
  var totalRevenue = 0;
  
  businesses.forEach(function(b) {
    if (b.activity === 'active') activeUsers++;
    if (b.subscription === 'expiring') expiringSubs++;
    
    // Aggregation ONLY if consent is true
    if (b.consent) {
      totalInvoices += b.invoices;
      totalRevenue += b.revenue;
    }
  });
  
  // Update Platform UI
  document.getElementById('ad-total-businesses').textContent = totalRegistered;
  document.getElementById('ad-active-users').textContent = activeUsers;
  document.getElementById('ad-expiring-subs').textContent = expiringSubs;
  document.getElementById('ad-total-invoices').textContent = totalInvoices;
  document.getElementById('ad-total-revenue').textContent = formatINR(totalRevenue);
  
  // Render Business Insights Table
  var tbody = document.getElementById('admin-table-body');
  tbody.innerHTML = '';
  
  var filtered = businesses.filter(function(b) {
    if (adminSubFilter === 'all') return true;
    return b.subscription === adminSubFilter;
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted); font-weight: 500;">No businesses match this filter.</td></tr>';
    return;
  }
  
  filtered.forEach(function(b) {
    var tr = document.createElement('tr');
    
    // Subscription Badge
    var subBadge = '';
    if (b.subscription === 'active') subBadge = '<span class="badge badge-active">Active</span>';
    else if (b.subscription === 'expiring') subBadge = '<span class="badge badge-expiring">Expiring</span>';
    else if (b.subscription === 'expired') subBadge = '<span class="badge badge-expired">Expired</span>';
    
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
    
    tr.innerHTML = 
      '<td style="font-weight: 600; color: var(--text);">' + bizName + '</td>' +
      '<td>' + subBadge + '</td>' +
      '<td>' + actBadge + '</td>' +
      '<td style="text-align: center; font-weight: 600;">' + invCountText + '</td>' +
      '<td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">' + revText + '</td>' +
      '<td style="text-align: center;">' + conBadge + '</td>';
      
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════
//  FIREBASE INITIALIZATION & SANDBOX
// ═══════════════════════════════════════════
function getFirebaseConfig() {
  // 1. Build-time environment config override
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
    return window.FIREBASE_CONFIG;
  }
  
  // 2. Local settings profile configuration fallback
  try {
    var conf = localStorage.getItem('billblue_firebase_config');
    return conf ? JSON.parse(conf) : null;
  } catch (e) {
    return null;
  }
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
  showToast('Restoring session...', '');
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
    
    firebaseDb.collection('users').doc(user.uid).collection('invoices').get().then(function(snap) {
      var invs = [];
      snap.forEach(function(d) {
        invs.push(d.data());
      });
      currentUser.invoicesList = invs;
      handleLoggedInState();
      showToast('Session synced!', 'success');
    });
  }).catch(function(e) {
    showToast('Sync failed, offline mode.', 'error');
    initializeSandbox();
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
    badge.textContent = currentUser.planType + ' plan';
    badge.className = 'user-plan-badge badge-plan-' + currentUser.planType;
  }
  
  // Sync Mobile Top Header
  var mobileHeader = document.getElementById('mobile-header');
  if (mobileHeader) {
    var mobileAvatar = document.getElementById('mh-avatar');
    if (mobileAvatar) mobileAvatar.textContent = initials;
    var mobileBadge = document.getElementById('mh-plan-badge');
    if (mobileBadge) {
      mobileBadge.textContent = currentUser.planType + ' plan';
      mobileBadge.className = 'mh-badge badge-plan-' + currentUser.planType;
    }
  }
  
  var bannerPlan = document.getElementById('settings-plan-name');
  if (bannerPlan) bannerPlan.textContent = currentUser.planType + ' plan';
  var expiryText = document.getElementById('settings-expiry-text');
  if (expiryText) {
    if (currentUser.planType !== 'free' && currentUser.subscriptionExpiry) {
      expiryText.textContent = 'Expiry Date: ' + currentUser.subscriptionExpiry;
      expiryText.style.display = 'block';
    } else {
      expiryText.style.display = 'none';
    }
  }
  
  var configToggleInput = document.getElementById('settings-firebase-config');
  if (configToggleInput) {
    var savedConf = localStorage.getItem('billblue_firebase_config');
    configToggleInput.value = savedConf || '';
  }
  
  var p = currentUser.businessSettings || loadData(KEYS.BUSINESS) || {};
  saveData(KEYS.BUSINESS, p);
  
  var userInvs = currentUser.invoicesList || loadData(KEYS.INVOICES) || [];
  saveData(KEYS.INVOICES, userInvs);
  
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
}

function handleLoggedOutState() {
  document.body.classList.remove('logged-in');
  currentUser = null;
  
  var sidebarPanel = document.getElementById('sidebar-user-panel');
  if (sidebarPanel) sidebarPanel.style.display = 'none';
  
  navigateTo('auth');
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
  var company = getVal('register-company');
  var email = getVal('register-email');
  var password = getVal('register-password');
  var plan = document.getElementById('register-plan').value;
  
  if (!company || !email || !password) {
    showToast('Please fill all fields', 'error');
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
          planType: plan,
          subscriptionExpiry: expiry,
          paymentStatus: 'paid',
          businessSettings: { name: company },
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
    planType: plan,
    subscriptionExpiry: expiry,
    businessSettings: { name: company },
    invoicesList: []
  };
  saveData('billblue_simulated_users', users);
  
  currentUser = {
    uid: 'sim_' + generateId(),
    email: email,
    planType: plan,
    subscriptionExpiry: expiry,
    paymentStatus: 'paid',
    businessSettings: { name: company },
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

// ═══════════════════════════════════════════
//  FEATURE GATEKEEPER SYSTEM
// ═══════════════════════════════════════════
function checkFeatureAccess(feature) {
  if (!currentUser) return false;
  var plan = currentUser.planType || 'free';
  
  if (feature === 'invoice-generation') {
    if (plan === 'free') {
      var count = countCurrentMonthInvoices();
      if (count >= 10) {
        showUpgradePromptModal('invoice-limit');
        return false;
      }
    }
    return true;
  }
  
  if (feature === 'branding' || feature === 'exports' || feature === 'qr-payment' || feature === 'whatsapp') {
    if (plan === 'free') {
      showUpgradePromptModal(feature);
      return false;
    }
    return true;
  }
  
  if (feature === 'analytics' || feature === 'customers') {
    if (plan !== 'pro') {
      showUpgradePromptModal(feature);
      return false;
    }
    return true;
  }
  
  return true;
}

function countCurrentMonthInvoices() {
  var all = loadData(KEYS.INVOICES) || [];
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  
  var count = 0;
  all.forEach(function(inv) {
    if (inv.date) {
      var d = new Date(inv.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        count++;
      }
    }
  });
  return count;
}

function showUpgradePromptModal(feature) {
  openUpgradeModal();
  var title = 'Premium Restriction';
  var msg = 'Upgrade your plan to unlock premium capabilities.';
  
  if (feature === 'invoice-limit') {
    title = '⚠️ Invoice Limit Reached';
    msg = 'You reached the limit of 10 invoices/mo on Free plan. Upgrade for unlimited invoicing!';
  } else if (feature === 'branding') {
    title = '💼 Custom Branding Gated';
    msg = 'Custom logo and signature uploads require Basic or Pro plan.';
  } else if (feature === 'exports') {
    title = '📥 Downloads Restricted';
    msg = 'PDF and JPG downloads require Basic or Pro plan.';
  } else if (feature === 'qr-payment') {
    title = '💸 UPI Payments Locked';
    msg = 'Scan & Pay UPI payment QR codes require Basic or Pro plan.';
  } else if (feature === 'whatsapp') {
    title = '💬 WhatsApp Sharing Restricted';
    msg = 'Direct A4 invoice image sharing requires Basic or Pro plan.';
  } else if (feature === 'analytics') {
    title = '📊 Dashboard Restricted';
    msg = 'Sales tracking analytics and reporting require Pro subscription.';
  } else if (feature === 'customers') {
    title = '👤 Customers Directory Locked';
    msg = 'Automatic customer management is a Pro plan exclusive.';
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
    
    document.getElementById('btn-select-free').textContent = plan === 'free' ? 'Current Plan' : 'Choose Free';
    document.getElementById('btn-select-basic').textContent = plan === 'basic' ? 'Current Plan' : 'Upgrade Basic';
    document.getElementById('btn-select-pro').textContent = plan === 'pro' ? 'Current Plan' : 'Upgrade Pro';
  }
}

function closeUpgradeModal() {
  var modal = document.getElementById('upgrade-modal');
  if (modal) modal.style.display = 'none';
}

function purchasePlan(plan) {
  if (!currentUser) return;
  if (currentUser.planType === plan) {
    showToast('You are already on this plan!', 'info');
    return;
  }
  
  showToast('Upgrading plan to ' + plan.toUpperCase() + '...', '');
  var expiry = '2027-05-25';
  
  if (firebaseDb && firebaseAuth && firebaseAuth.currentUser) {
    firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid).update({
      planType: plan,
      subscriptionExpiry: expiry
    }).then(function() {
      currentUser.planType = plan;
      currentUser.subscriptionExpiry = expiry;
      handleLoggedInState();
      closeUpgradeModal();
      showToast('Plan upgraded successfully!', 'success');
    }).catch(function(err) {
      showToast('Upgrade failed: ' + err.message, 'error');
    });
    return;
  }
  
  var users = loadData('billblue_simulated_users') || {};
  var email = currentUser.email.toLowerCase();
  if (users[email]) {
    users[email].planType = plan;
    users[email].subscriptionExpiry = expiry;
    saveData('billblue_simulated_users', users);
  }
  
  currentUser.planType = plan;
  currentUser.subscriptionExpiry = expiry;
  saveData('billblue_current_user', currentUser);
  handleLoggedInState();
  closeUpgradeModal();
  showToast('Plan upgraded successfully (Sandbox)!', 'success');
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

// Render clean installation card actions depending on browser compatibility
function updatePWAInstallUI() {
  var installCard = document.getElementById('pwa-install-card');
  if (!installCard) return;
  
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  
  if (isStandalone) {
    // If running in PWA window
    installCard.style.display = 'block';
    var desc = document.getElementById('pwa-install-desc');
    if (desc) desc.textContent = 'Bill Blue is running inside standalone app mode. Enjoy the full-screen native experience!';
    var btn = document.getElementById('btn-pwa-install');
    if (btn) {
      btn.textContent = 'Installed';
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.style.cursor = 'default';
      btn.style.background = '#4b5563';
    }
  } else if (deferredPrompt) {
    // If app is installable (e.g. Chrome/Edge/Android)
    installCard.style.display = 'block';
    var desc = document.getElementById('pwa-install-desc');
    if (desc) desc.textContent = 'Install this app on your device for standalone window editing and offline capabilities!';
    var btn = document.getElementById('btn-pwa-install');
    if (btn) {
      btn.textContent = 'Install App';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.display = 'inline-block';
    }
  } else {
    // Check if running on iOS Safari
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      installCard.style.display = 'block';
      var desc = document.getElementById('pwa-install-desc');
      if (desc) desc.innerHTML = 'To install Bill Blue on iOS, tap the <strong>Share</strong> button <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin: 0 2px;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/></svg> in Safari, then select <strong>Add to Home Screen</strong>.';
      var btn = document.getElementById('btn-pwa-install');
      if (btn) btn.style.display = 'none';
    } else {
      // Hide on standard desktop screens if not installable
      installCard.style.display = 'none';
    }
  }
}

// Open Chrome/Android app installation trigger
function triggerPWAInstall() {
  if (!deferredPrompt) {
    showToast('App is already installed or install is not supported by your browser.', 'info');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function(choiceResult) {
    if (choiceResult.outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
      showToast('Installing Bill Blue...', 'success');
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }
    deferredPrompt = null;
    updatePWAInstallUI();
  });
}
