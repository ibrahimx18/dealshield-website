// DealShield create-deal flow (W01/W03/W04/W05).
// Seller mode: publish a LISTING only. No escrow is created and nothing is funded.
// Buyer mode (?listing=<id>): open an escrow against someone else's listing. Success is shown
// only when the backend returns a real escrow id; status is shown as returned (unfunded).
// Private contact details / private terms are never sent in the public listing description.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PENDING_KEY = 'ds_pending_listing';
  var busy = false;
  var pending = null; // { mode, body, fingerprint }

  // ---- listeners first; decorative code afterwards ----
  function init() {
    if (!window.DS || !DS.token()) { location.replace('/login.html'); return; }
    var requested = new URLSearchParams(location.search).get('listing');
    var buyerMode = !!(requested && /^\d+$/.test(requested));

    $('deal-form').addEventListener('submit', onReview);
    $('back-btn').addEventListener('click', function () { showStep(1); });
    $('confirm-btn').addEventListener('click', onConfirm);
    $('new-deal-btn').addEventListener('click', resetAll);
    $('category').addEventListener('change', updateEstimate);
    $('amount').addEventListener('input', updateEstimate);
    $('bag-count').addEventListener('input', updateEstimate);

    if (buyerMode) loadBuyerListing(requested);
    else setMode('seller');
    showStep(1);
    DS.icons();
  }

  function setMode(mode) {
    $('deal-form').setAttribute('data-mode', mode);
    $('seller-fields').hidden = mode !== 'seller';
    $('buyer-fields').hidden = mode !== 'buyer';
    $('review-btn-label').textContent = mode === 'seller' ? 'Review Listing' : 'Review Escrow Request';
    ['title', 'category', 'amount'].forEach(function (id) { $(id).required = mode === 'seller'; });
    updateEstimate();
  }

  function showStep(n) {
    ['form-step', 'review-step', 'success-step'].forEach(function (id, i) { $(id).hidden = n !== i + 1; });
    for (var i = 1; i <= 3; i++) {
      var d = $('dot-' + i);
      d.classList.toggle('active', i === n);
      d.classList.toggle('done', i < n);
      d.textContent = i < n ? '\u2713' : String(i);
    }
    try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ }
  }

  function setError(id, msg) { var el = $(id); el.textContent = msg || ''; el.hidden = !msg; }

  function naira(value) {
    var n = Number(value);
    if (!isFinite(n)) return '-';
    try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n); } catch (e) { return 'NGN ' + n.toFixed(2); }
  }

  // Estimate mirrors backend _calc_commission (escrow.py): cement = NGN 10 x bags,
  // otherwise tiered 1.5% / 1.0% / 0.5% / NGN 100,000 cap. Gateway shares are computed by the
  // backend when the buyer funds; they are NOT estimated here.
  function estimateCommission(category, principal, bags) {
    if (category === 'cement') return bags > 0 ? bags * 10 : null;
    if (!(principal > 0)) return null;
    if (principal < 500000) return Math.round(principal * 1.5) / 100;
    if (principal < 5000000) return Math.round(principal * 1.0) / 100;
    if (principal < 20000000) return Math.round(principal * 0.5) / 100;
    return 100000;
  }

  function bagCount() {
    var v = $('bag-count').value.trim();
    return /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null;
  }

  function updateEstimate() {
    var cement = $('category').value === 'cement';
    $('bag-section').hidden = !cement;
    $('bag-count').required = cement && $('deal-form').getAttribute('data-mode') === 'seller';
    var principal = DS.money($('amount').value);
    var commission = estimateCommission($('category').value, principal ? Number(principal) : 0, bagCount() || 0);
    var box = $('fee-breakdown');
    if (commission === null || !principal) { box.hidden = true; return; }
    box.hidden = false;
    renderFees($('fee-lines'), principal, commission);
  }

  function renderFees(target, principal, commission) {
    target.replaceChildren();
    [['Deal principal (price)', naira(principal)],
     ['Estimated DealShield commission (deducted from seller payout)', naira(commission)],
     ['Payment gateway share', 'Calculated by DealShield when the buyer funds']].forEach(function (pair) {
      var row = document.createElement('div'); row.className = 'fee-line';
      var a = document.createElement('span'); a.className = 'fee-label'; a.textContent = pair[0];
      var b = document.createElement('span'); b.className = 'fee-value'; b.textContent = pair[1];
      row.append(a, b); target.append(row);
    });
  }

  // Block obvious contact details in the PUBLIC description (W03).
  function containsContact(text) {
    return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(text) || /(\+?234|\b0)[\s-]?[789][01]\d([\s-]?\d){7}\b/.test(text) || /\d{10,}/.test(text.replace(/[\s-]/g, ''));
  }

  function fingerprint(body) { return JSON.stringify(body); }

  function readPending() {
    try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { return null; }
  }
  function writePending(v) {
    try { if (v) sessionStorage.setItem(PENDING_KEY, JSON.stringify(v)); else sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
  }

  function addSummary(label, value) {
    var row = document.createElement('div'); row.className = 'summary-row';
    var a = document.createElement('span'); a.className = 'summary-label'; a.textContent = label;
    var b = document.createElement('span'); b.className = 'summary-value'; b.textContent = value;
    row.append(a, b); $('review-summary').append(row);
  }

  function onReview(event) {
    event.preventDefault();
    setError('form-error', '');
    var mode = $('deal-form').getAttribute('data-mode');
    $('review-summary').replaceChildren();
    if (mode === 'buyer') {
      var listing = window.__dsListing;
      if (!listing) return setError('form-error', 'This listing could not be loaded. Check the link from the seller.');
      var body = { listing_id: Number(listing.id), insured: false };
      if (listing.category === 'cement') {
        var bagsB = bagCount();
        if (!bagsB) return setError('form-error', 'Enter the number of bags as a whole number.');
        body.bag_count = bagsB;
      }
      pending = { mode: 'buyer', body: body };
      addSummary('Action', 'Open an escrow request (no money moves yet)');
      addSummary('Listing', '#' + listing.id + ' - ' + (listing.title || ''));
      addSummary('Seller', listing.seller_name || '-');
      addSummary('Price', naira(listing.price));
      if (body.bag_count) addSummary('Bags', String(body.bag_count));
      $('review-fee-box').hidden = true;
    } else {
      var title = $('title').value.trim();
      var category = $('category').value;
      var principal = DS.money($('amount').value);
      var description = $('description').value.trim();
      if (!title || title.length > 200) return setError('form-error', 'Enter a listing title (up to 200 characters).');
      if (!category) return setError('form-error', 'Choose a category.');
      if (!principal) return setError('form-error', 'Enter a price in naira greater than 0 with at most 2 decimals (e.g. 15000.00).');
      var bags = null;
      if (category === 'cement') {
        bags = bagCount();
        if (!bags) return setError('form-error', 'Enter the number of bags as a whole number.');
      }
      if (containsContact(description)) return setError('form-error', 'The description is PUBLIC. Remove email addresses and phone numbers; share contact details privately with your buyer.');
      if (bags) description = (description ? description + '\n' : '') + 'Quantity: ' + bags + ' bags';
      var sellerBody = { title: title, category: category, price: principal, description: description, insured: false };
      pending = { mode: 'seller', body: sellerBody, fingerprint: fingerprint(sellerBody) };
      addSummary('Action', 'Publish a public listing (no escrow, no payment)');
      addSummary('Title', title);
      addSummary('Category', $('category').selectedOptions[0] ? $('category').selectedOptions[0].textContent : category);
      addSummary('Price (principal)', naira(principal));
      if (bags) addSummary('Quantity', bags + ' bags');
      addSummary('Public description', description || '(none)');
      var commission = estimateCommission(category, Number(principal), bags || 0);
      $('review-fee-box').hidden = commission === null;
      if (commission !== null) renderFees($('review-fee-lines'), principal, commission);
    }
    setError('submit-error', '');
    resetConfirmButton();
    showStep(2);
  }

  function resetConfirmButton() {
    busy = false;
    var btn = $('confirm-btn');
    btn.disabled = false;
    $('confirm-btn-label').textContent = 'Confirm & Submit';
  }

  async function onConfirm() {
    if (!pending || busy) return;
    busy = true;
    var btn = $('confirm-btn');
    btn.disabled = true;
    $('confirm-btn-label').textContent = 'Submitting...';
    setError('submit-error', '');
    try {
      if (pending.mode === 'seller') await publishListing();
      else await openEscrow();
    } catch (err) {
      setError('submit-error', (err && err.message) || 'The request failed. Please try again.');
    } finally {
      if (!$('review-step').hidden) resetConfirmButton(); else busy = false;
    }
  }

  async function publishListing() {
    var saved = readPending();
    // Reuse an already-created listing for the same content (response was received earlier).
    if (saved && saved.fingerprint === pending.fingerprint && saved.id) { return showListingSuccess(saved.id); }
    // A previous attempt was sent but no answer arrived: it MAY exist. Ask before resending.
    if (saved && saved.fingerprint === pending.fingerprint && saved.inFlight && !pending.confirmedResend) {
      pending.confirmedResend = true;
      throw new Error('Your previous attempt may already have been saved. Check "My listings" / Dashboard first. Press Confirm again only if it is not there.');
    }
    writePending({ fingerprint: pending.fingerprint, inFlight: true });
    var res;
    try {
      res = await DS.api('/listings', { method: 'POST', body: pending.body });
    } catch (networkError) {
      throw new Error('Network error - we could not confirm whether the listing was saved. Check your Dashboard before retrying.');
    }
    if (res.status === 401) return;
    if (!res.ok) {
      writePending(null); // definite rejection: nothing was created
      var msg = DS.errorMessage(res.data, 'Could not publish listing (' + res.status + ').');
      if (res.status === 403) msg += ' Complete identity verification on the Verification page first.';
      throw new Error(msg);
    }
    var id = res.data && res.data.id;
    if (id === undefined || id === null || id === '') throw new Error('The service did not return a listing ID. Check your Dashboard before retrying.');
    writePending({ fingerprint: pending.fingerprint, id: String(id) });
    showListingSuccess(String(id));
  }

  function showListingSuccess(id) {
    $('success-title').textContent = 'Listing published';
    $('success-label').textContent = 'Listing ID';
    $('success-deal-id').textContent = id;
    $('success-status').textContent = 'Listing only - no escrow opened, no funds held';
    var link = location.origin + '/create-deal.html?listing=' + encodeURIComponent(id);
    $('success-message').textContent = 'Send this link privately to your buyer. They sign in and open the escrow from their own account; you then accept it, and the buyer funds it. No money has moved yet.';
    $('success-link').textContent = link;
    $('success-link-row').hidden = false;
    pending = null;
    showStep(3);
  }

  async function openEscrow() {
    var res;
    try {
      res = await DS.api('/escrow/create', { method: 'POST', body: pending.body });
    } catch (networkError) {
      throw new Error('Network error - check Transactions before retrying so you do not open a duplicate request.');
    }
    if (res.status === 401) return;
    if (!res.ok) {
      var msg = DS.errorMessage(res.data, 'Could not open escrow (' + res.status + ').');
      if (res.status === 403) msg += ' Complete identity verification on the Verification page first.';
      throw new Error(msg);
    }
    var id = res.data && res.data.id;
    if (id === undefined || id === null || id === '') throw new Error('The service did not return an escrow ID. Check Transactions before retrying.');
    $('success-title').textContent = 'Escrow request opened';
    $('success-label').textContent = 'Escrow ID';
    $('success-deal-id').textContent = String(id);
    $('success-status').textContent = 'Status: ' + String(res.data.status || 'created') + ' - not funded';
    $('success-message').textContent = 'The seller must accept this request. Funding is a separate step on the Transactions page; no funds are held until then.';
    $('success-link-row').hidden = true;
    pending = null;
    showStep(3);
  }

  async function loadBuyerListing(id) {
    setMode('buyer');
    $('buyer-listing').textContent = 'Loading listing #' + id + '...';
    $('review-btn').disabled = true;
    try {
      var res = await DS.api('/listings/' + encodeURIComponent(id), { auth: false });
      if (!res.ok) throw new Error(DS.errorMessage(res.data, 'Listing not found.'));
      window.__dsListing = res.data;
      $('buyer-listing').textContent = '#' + res.data.id + ' - ' + (res.data.title || '') + ' - ' + naira(res.data.price) + ' - seller: ' + (res.data.seller_name || '-');
      $('category').value = res.data.category || '';
      $('bag-section').hidden = res.data.category !== 'cement';
      $('bag-count').required = res.data.category === 'cement';
      $('review-btn').disabled = false;
    } catch (err) {
      $('buyer-listing').textContent = (err && err.message) || 'Listing could not be loaded.';
    }
  }

  function resetAll() {
    pending = null;
    writePending(null);
    $('deal-form').reset();
    setError('form-error', '');
    setError('submit-error', '');
    resetConfirmButton();
    $('success-link-row').hidden = true;
    $('fee-breakdown').hidden = true;
    if (location.search) history.replaceState(null, '', '/create-deal.html');
    window.__dsListing = null;
    setMode('seller');
    showStep(1);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
