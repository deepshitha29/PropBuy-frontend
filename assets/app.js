const $ = (selector) => document.querySelector(selector);
function getApiBase() {
  const direct = (window.PROPBUY_API_BASE || '').trim().replace(/\/$/, '');
  if (direct) return direct;
  const stored = (localStorage.getItem('PROPBUY_API_BASE') || '').trim().replace(/\/$/, '');
  return stored;
}
const apiUrl = (path) => `${getApiBase()}${path}`;
const state = { page: 0, size: 6, query: '', city: '', bedrooms: '', maxPrice: '', sort: 'publishedAt', direction: 'desc', view: 'list', compare: [] };
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('visible');
  window.setTimeout(() => element.classList.remove('visible'), 3500);
}

async function api(url, options = {}) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const token = sessionStorage.getItem('propbuy_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(apiUrl(url), { ...options, headers });
  } catch (err) {
    const base = getApiBase();
    if (!base && window.location.hostname.includes('vercel.app')) {
      toast('Backend URL not configured. Click "API Settings" in the footer to enter your Render backend URL.');
    } else {
      toast('Network error: unable to reach the backend. If Render was inactive, it may take ~30s to wake up.');
    }
    throw new Error('Could not connect to the backend server. Please check your network or Render backend status.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = payload.message || payload.error;
    if (!message) {
      const base = getApiBase();
      if (!base && (window.location.hostname.includes('vercel.app') || window.location.hostname !== 'localhost')) {
        message = 'Backend not connected yet. Click "API Settings" in the footer to enter your Render backend URL.';
      } else {
        message = 'The request could not be completed.';
      }
    }
    throw new Error(message);
  }
  return payload;
}

function renderListings(results) {
  const container = $('#listings');
  container.replaceChildren();
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No published homes match those filters yet.';
    container.append(empty);
    return;
  }
  results.forEach((listing) => {
    const card = document.createElement('article');
    card.className = 'card';
    const picture = document.createElement('div');
    picture.className = 'pic';
    picture.style.backgroundImage = 'linear-gradient(135deg, #dce8c8, #789b87)';
    const type = document.createElement('span');
    type.textContent = listing.property?.propertyType || 'HOME';
    const fallback = document.createElement('small');
    fallback.className = 'image-fallback';
    fallback.textContent = 'Photos coming soon';
    picture.append(type, fallback);
    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('h3');
    title.textContent = listing.property?.title || 'Untitled property';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${listing.property?.city || 'Location unavailable'} · ${listing.property?.bedrooms ?? '—'} beds · ${listing.property?.area ?? '—'} sq ft`;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `₹ ${Number(listing.askingPrice || 0).toLocaleString('en-IN')}`;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const compare = document.createElement('button');
    compare.className = 'ghost small-button';
    compare.type = 'button';
    compare.textContent = state.compare.some((item) => item.id === listing.id) ? 'Compared' : 'Compare';
    compare.disabled = state.compare.length >= 3 && !state.compare.some((item) => item.id === listing.id);
    compare.addEventListener('click', () => toggleCompare(listing));
    const save = document.createElement('button');
    save.className = 'ghost small-button';
    save.type = 'button';
    save.textContent = 'Save home';
    save.addEventListener('click', () => saveHome(listing.id));
    const visit = document.createElement('button');
    visit.className = 'ghost small-button';
    visit.type = 'button';
    visit.textContent = 'Request visit';
    visit.addEventListener('click', () => openVisit(listing));
    const purchase = document.createElement('button');
    purchase.className = 'small-button'; purchase.type = 'button'; purchase.textContent = 'Request to buy';
    purchase.addEventListener('click', () => openPurchase(listing));
    actions.append(compare, save, visit, purchase);
    body.append(title, meta, price, actions);
    card.append(picture, body);
    if (listing.property?.imageUrl) {
      picture.style.backgroundImage = `linear-gradient(135deg, #bed4c1aa, #728f7daa), url('${listing.property.imageUrl}')`;
      fallback.hidden = true;
    } else if (listing.property?.id) loadPublishedImage(listing.property.id, picture);
    container.append(card);
  });
  renderLocationView(results);
  applyViewMode();
}

function renderLocationView(results) { const groups = $('#locationGroups'); groups.replaceChildren(); const grouped = new Map(); results.forEach((listing) => { const city = listing.property?.city || 'Location unavailable'; if (!grouped.has(city)) grouped.set(city, []); grouped.get(city).push(listing); }); if (!grouped.size) { groups.textContent = 'No verified listing locations in this result.'; return; } grouped.forEach((items, city) => { const card = document.createElement('article'); card.className = 'location-card'; const title = document.createElement('h3'); title.textContent = city; const summary = document.createElement('p'); summary.textContent = `${items.length} listing${items.length === 1 ? '' : 's'} · Prices from INR ${Math.min(...items.map((item) => Number(item.askingPrice || 0))).toLocaleString('en-IN')}`; card.append(title, summary); groups.append(card); }); }
function applyViewMode() { const map = $('#mapView'); const list = $('#listings'); map.hidden = state.view !== 'map'; list.hidden = state.view === 'map'; $('#listViewBtn').classList.toggle('active-view', state.view === 'list'); $('#mapViewBtn').classList.toggle('active-view', state.view === 'map'); }
async function loadPublishedImage(propertyId, picture) { try { const response = await fetch(apiUrl(`/api/properties/published/${propertyId}`)); if (!response.ok) return; const images = await response.json(); if (images[0]?.url) { picture.style.backgroundImage = `linear-gradient(135deg, #bed4c1aa, #728f7daa), url('${apiUrl(images[0].url)}')`; const fallback = picture.querySelector('.image-fallback'); if (fallback) fallback.hidden = true; } } catch (_) { /* neutral fallback remains visible */ } }

function toggleCompare(listing) {
  const existing = state.compare.findIndex((item) => item.id === listing.id);
  if (existing >= 0) state.compare.splice(existing, 1);
  else if (state.compare.length < 3) state.compare.push(listing);
  renderCompare();
  loadListings();
}

function renderCompare() {
  const panel = $('#comparePanel');
  panel.hidden = state.compare.length === 0;
  const content = $('#compareContent');
  content.replaceChildren();
  if (!state.compare.length) return;
  const table = document.createElement('table');
  table.className = 'compare-table';
  const fields = [
    ['Property', (item) => item.property?.title || 'Untitled property'],
    ['Price', (item) => `INR ${Number(item.askingPrice || 0).toLocaleString('en-IN')}`],
    ['Location', (item) => item.property?.city || 'Not provided'],
    ['Type', (item) => item.property?.propertyType || 'Not provided'],
    ['Area', (item) => `${item.property?.area ?? '—'} sq ft`],
    ['Bedrooms', (item) => item.property?.bedrooms ?? '—'],
    ['Price / sq ft', (item) => item.property?.area ? `INR ${Math.round(Number(item.askingPrice || 0) / Number(item.property.area)).toLocaleString('en-IN')}` : '—']
  ];
  fields.forEach(([label, value]) => {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.textContent = label;
    row.append(heading);
    state.compare.forEach((item) => { const cell = document.createElement('td'); cell.textContent = value(item); row.append(cell); });
    table.append(row);
  });
  content.append(table);
}

async function saveHome(listingId) {
  if (!sessionStorage.getItem('propbuy_token')) { toast('Log in as a buyer to save homes.'); openAuth(false); return; }
  if (sessionStorage.getItem('propbuy_role') !== 'BUYER') { toast('Saved homes are available for buyer accounts.'); return; }
  try { await api(`/api/favorites/${listingId}`, { method: 'POST' }); toast('Home saved to your favorites.'); }
  catch (error) { toast(error.message); }
}

function openVisit(listing) {
  if (!sessionStorage.getItem('propbuy_token') || sessionStorage.getItem('propbuy_role') !== 'BUYER') {
    toast('Log in as a buyer to request a visit.');
    openAuth(false);
    return;
  }
  $('#visitForm').reset();
  $('#visitError').textContent = '';
  $('#visitForm').dataset.listingId = listing.id;
  $('#visitPropertyName').textContent = `${listing.property?.title || 'Property'} · ${listing.property?.city || 'Location unavailable'}`;
  const minimum = new Date(Date.now() + 60 * 60 * 1000);
  minimum.setMinutes(minimum.getMinutes() - minimum.getTimezoneOffset());
  $('#visitDate').min = minimum.toISOString().slice(0, 16);
  $('#visitDialog').showModal();
}

function openPurchase(listing) {
  if (!sessionStorage.getItem('propbuy_token') || sessionStorage.getItem('propbuy_role') !== 'BUYER') { toast('Log in as a buyer to send a purchase request.'); openAuth(false); return; }
  $('#purchaseForm').reset(); $('#purchaseError').textContent = ''; $('#purchaseForm').dataset.listingId = listing.id; $('#purchasePropertyName').textContent = `${listing.property?.title || 'Property'} · ${listing.property?.city || 'Location unavailable'}`; $('#purchasePrice').value = Math.round(Number(listing.askingPrice || 0)); $('#purchaseDialog').showModal();
}

async function loadNotifications() {
  if (!sessionStorage.getItem('propbuy_token')) return;
  try {
    const items = await api('/api/notifications');
    const unread = items.filter((item) => !item.read_at).length;
    $('#notificationCount').textContent = unread;
    const list = $('#notificationsList');
    list.replaceChildren();
    if (!items.length) { list.textContent = 'No new activity yet.'; return; }
    items.slice(0, 5).forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = item.read_at ? 'notification read' : 'notification';
      row.textContent = item.message;
      row.addEventListener('click', async () => { if (!item.read_at) await api(`/api/notifications/${item.id}/read`, { method: 'PUT' }); row.classList.add('read'); });
      list.append(row);
    });
  } catch (error) { toast(error.message); }
}

function calculatePayment() {
  const price = Number($('#loanPrice').value), downPayment = Number($('#loanDownPayment').value);
  const annualRate = Number($('#loanRate').value), years = Number($('#loanYears').value);
  const principal = price - downPayment, months = years * 12, monthlyRate = annualRate / 1200;
  if (principal <= 0 || months <= 0 || annualRate < 0) { $('#paymentResult').textContent = 'Enter valid affordability details.'; return; }
  const payment = monthlyRate === 0 ? principal / months : principal * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1);
  const fees = price * 0.06;
  $('#paymentResult').innerHTML = `<strong>INR ${Math.round(payment).toLocaleString('en-IN')} / month</strong><span>Estimated purchase costs: INR ${Math.round(fees).toLocaleString('en-IN')} (assumed 6%).</span>`;
}

function renderBars(selector, rows) {
  const container = $(selector);
  container.replaceChildren();
  if (!rows || !rows.length) { container.textContent = 'No activity in this period.'; return; }
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  rows.forEach((row) => {
    const line = document.createElement('div'); line.className = 'bar-row';
    const label = document.createElement('span'); label.textContent = row.label || 'Unspecified';
    const track = document.createElement('div'); track.className = 'bar-track';
    const fill = document.createElement('div'); fill.className = 'bar-fill'; fill.style.width = `${Math.round(Number(row.value) / max * 100)}%`;
    const value = document.createElement('strong'); value.textContent = row.value;
    track.append(fill); line.append(label, track, value); container.append(line);
  });
}

async function loadAdminAnalytics() {
  if (sessionStorage.getItem('propbuy_role') !== 'ADMIN') return;
  const params = new URLSearchParams();
  if ($('#analyticsFrom').value) params.set('from', $('#analyticsFrom').value);
  if ($('#analyticsTo').value) params.set('to', $('#analyticsTo').value);
  const cards = $('#analyticsCards'); cards.innerHTML = '<div class="empty">Loading analytics…</div>';
  try {
    const data = await api(`/api/admin/analytics?${params}`);
    const metrics = [
      ['submittedProperties', 'Submitted properties'], ['awaitingReview', 'Awaiting review'],
      ['valuationsCompleted', 'Valuations completed'], ['offersIssued', 'Offers issued'],
      ['acquiredProperties', 'Acquired properties'], ['activeListings', 'Published listings'],
      ['pendingPurchaseRequests', 'Pending purchase requests'], ['completedAcquisitions', 'Completed acquisitions']
    ];
    cards.replaceChildren();
    metrics.forEach(([key, label]) => { const card = document.createElement('div'); card.className = 'analytics-card'; card.innerHTML = `<strong>${Number(data[key] || 0).toLocaleString('en-IN')}</strong><span>${label}</span>`; cards.append(card); });
    renderBars('#workflowBreakdown', data.workflowBreakdown);
    renderBars('#purchaseBreakdown', data.purchaseRequestBreakdown);
  } catch (error) { cards.textContent = error.message || 'Analytics are temporarily unavailable.'; }
}

function adminButton(label, handler, ghost = false) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; if (ghost) button.className = 'ghost'; button.addEventListener('click', handler); return button; }

async function loadAdminOperations() {
  if (sessionStorage.getItem('propbuy_role') !== 'ADMIN') return;
  const properties = $('#adminProperties'); const offers = $('#adminOffers'); const acquisition = $('#adminAcquisition'); const requests = $('#adminRequests'); const visits = $('#adminVisits');
  try {
    const propertyParams = new URLSearchParams(); if ($('#adminStatus').value) propertyParams.set('status', $('#adminStatus').value); if ($('#adminCity').value.trim()) propertyParams.set('city', $('#adminCity').value.trim()); if ($('#adminPropertyType').value.trim()) propertyParams.set('propertyType', $('#adminPropertyType').value.trim());
    const [propertyQueue, offerQueue, purchaseRequests, visitRows] = await Promise.all([api(`/api/properties/admin?${propertyParams}`), api('/api/properties/offer-queue'), api('/api/purchase-requests'), api('/api/visits')]);
    const reviewQueue = propertyQueue.filter((property) => ['SUBMITTED', 'NEEDS_INFORMATION'].includes(property.workflowStatus));
    properties.replaceChildren();
    if (!reviewQueue.length) properties.textContent = 'No properties are waiting for review.';
    reviewQueue.forEach((property) => { const row = document.createElement('div'); row.className = 'admin-row'; const title = document.createElement('strong'); title.textContent = property.title; title.addEventListener('click', () => openPropertyDetail(property.id)); title.style.cursor = 'pointer'; const detail = document.createElement('span'); detail.textContent = `${property.city} · ${property.propertyType} · ${property.workflowStatus} · ${Number(property.area || 0).toLocaleString('en-IN')} sq ft`; const actions = document.createElement('div'); actions.className = 'admin-actions'; actions.append(adminButton('Open details', () => openPropertyDetail(property.id)), adminButton('Approve & value', () => reviewProperty(property.id, true))); actions.append(adminButton('Request information', () => { const note = window.prompt('What should the seller provide?', 'Please upload the missing ownership or property documents.'); if (note) reviewProperty(property.id, false, true, note); }, true), adminButton('Reject', () => { const note = window.prompt('Reason for rejection:', 'The submission does not meet the current review requirements.'); if (note) reviewProperty(property.id, false, false, note); }, true)); row.append(title, detail, actions); properties.append(row); });
    offers.replaceChildren();
    if (!offerQueue.length) offers.textContent = 'No valued properties are waiting for an offer.';
    offerQueue.forEach((property) => { const row = document.createElement('div'); row.className = 'admin-row'; const title = document.createElement('strong'); title.textContent = property.title; const detail = document.createElement('span'); detail.textContent = `${property.city} · Indicative range INR ${Number(property.estimatedLow || 0).toLocaleString('en-IN')}–${Number(property.estimatedHigh || 0).toLocaleString('en-IN')}`; const actions = document.createElement('div'); actions.className = 'admin-actions'; actions.append(adminButton('Issue offer', () => openOffer(property))); row.append(title, detail, actions); offers.append(row); });
    requests.replaceChildren();
    if (!purchaseRequests.length) requests.textContent = 'No buyer requests yet.';
    purchaseRequests.slice().reverse().slice(0, 8).forEach((request) => { const row = document.createElement('div'); row.className = 'admin-row'; const title = document.createElement('strong'); title.textContent = request.listing?.property?.title || 'Purchase request'; const detail = document.createElement('span'); detail.textContent = `${request.status} · INR ${Number(request.proposedPrice || 0).toLocaleString('en-IN')}`; const actions = document.createElement('div'); actions.className = 'admin-actions'; const next = { SUBMITTED: 'UNDER_REVIEW', UNDER_REVIEW: 'CONTACT_PENDING', CONTACT_PENDING: 'NEGOTIATION', NEGOTIATION: 'APPROVED', APPROVED: 'COMPLETED' }[request.status]; if (next) actions.append(adminButton(`Mark ${next.replace('_', ' ').toLowerCase()}`, () => updatePurchaseRequest(request.id, next))); if (!['REJECTED', 'WITHDRAWN', 'COMPLETED'].includes(request.status)) actions.append(adminButton('Reject', () => updatePurchaseRequest(request.id, 'REJECTED'), true)); row.append(title, detail, actions); requests.append(row); });
    const acquisitionQueue = propertyQueue.filter((property) => ['ACQUISITION_IN_PROGRESS', 'ACQUIRED'].includes(property.workflowStatus));
    acquisition.replaceChildren();
    if (!acquisitionQueue.length) acquisition.textContent = 'No properties are ready for acquisition completion or resale.';
    acquisitionQueue.forEach((property) => { const row = document.createElement('div'); row.className = 'admin-row'; const title = document.createElement('strong'); title.textContent = property.title; const detail = document.createElement('span'); detail.textContent = `${property.city} Â· ${property.workflowStatus}`; const actions = document.createElement('div'); actions.className = 'admin-actions'; if (property.workflowStatus === 'ACQUISITION_IN_PROGRESS') actions.append(adminButton('Complete acquisition', () => completeAcquisition(property.id))); if (property.workflowStatus === 'ACQUIRED') actions.append(adminButton('Publish resale', () => publishResale(property))); row.append(title, detail, actions); acquisition.append(row); });
    visits.replaceChildren();
    if (!visitRows.length) visits.textContent = 'No visits requested yet.';
    visitRows.slice(0, 8).forEach((visit) => { const row = document.createElement('div'); row.className = 'admin-row'; const title = document.createElement('strong'); title.textContent = visit.title || 'Property visit'; const detail = document.createElement('span'); detail.textContent = `${visit.status} · ${new Date(visit.scheduled_at || visit.scheduledAt).toLocaleString()}`; const actions = document.createElement('div'); actions.className = 'admin-actions'; if (['REQUESTED', 'RESCHEDULED'].includes(visit.status)) actions.append(adminButton('Confirm', () => updateVisit(visit.id, 'CONFIRMED')), adminButton('Cancel', () => updateVisit(visit.id, 'CANCELLED'), true)); row.append(title, detail, actions); visits.append(row); });
  } catch (error) { properties.textContent = error.message || 'Admin operations are temporarily unavailable.'; offers.textContent = ''; }
}

async function reviewProperty(id, approve, requestInfo = false, note = '') { const params = new URLSearchParams({ approve, requestInfo }); if (note) params.set('note', note); try { await api(`/api/properties/${id}/review?${params}`, { method: 'PUT' }); toast(requestInfo ? 'Information request sent.' : approve ? 'Property approved and valued.' : 'Property rejected.'); loadAdminAnalytics(); loadAdminOperations(); loadNotifications(); } catch (error) { toast(error.message); } }
async function updatePurchaseRequest(id, status) { try { await api(`/api/purchase-requests/${id}/status?value=${status}`, { method: 'PUT' }); toast(`Purchase request moved to ${status.toLowerCase().replace('_', ' ')}.`); loadAdminAnalytics(); loadAdminOperations(); } catch (error) { toast(error.message); } }
async function updateVisit(id, status) { try { await api(`/api/visits/${id}/status`, { method: 'PUT', body: JSON.stringify({ value: status }) }); toast(`Visit ${status.toLowerCase()}.`); loadAdminOperations(); loadNotifications(); } catch (error) { toast(error.message); } }
async function completeAcquisition(id) { try { await api(`/api/acquisition/properties/${id}/acquired`, { method: 'PUT' }); toast('Acquisition completed. The property is now eligible for resale.'); loadAdminOperations(); loadAdminAnalytics(); loadNotifications(); } catch (error) { toast(error.message); } }
async function publishResale(property) { const defaultPrice = Math.round(Number(property.estimatedHigh || property.expectedPrice || 0)); const value = window.prompt('Set the resale asking price (INR):', defaultPrice || ''); if (!value || Number(value) <= 0) return; try { await api(`/api/listings/${property.id}?askingPrice=${encodeURIComponent(Number(value))}`, { method: 'POST' }); toast('Resale listing published.'); loadAdminOperations(); loadAdminAnalytics(); loadNotifications(); } catch (error) { toast(error.message); } }
function openOffer(property) { $('#offerForm').reset(); $('#offerError').textContent = ''; $('#offerForm').dataset.propertyId = property.id; $('#offerPropertyName').textContent = `${property.title} · ${property.city}`; $('#offerAmount').value = Math.round(Number(property.estimatedLow || property.expectedPrice || 0)); const valid = new Date(); valid.setDate(valid.getDate() + 14); $('#offerValidUntil').value = valid.toISOString().slice(0, 10); $('#offerDialog').showModal(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
async function openPropertyDetail(id) { $('#propertyDetailTitle').textContent = 'Loading property…'; $('#propertyDetailBody').textContent = ''; $('#propertyDetailDialog').showModal(); try { const [property, checks, activityRows] = await Promise.all([api(`/api/properties/${id}`), api(`/api/verification/properties/${id}`), api(`/api/activity/properties/${id}`)]); $('#propertyDetailTitle').textContent = property.title; const checkHtml = checks.length ? checks.map((check) => `<div>${escapeHtml(check.check_type || check.checkType)} — <strong>${escapeHtml(check.status)}</strong>${check.notes ? ` · ${escapeHtml(check.notes)}` : ''}</div>`).join('') : '<div>No verification checks recorded.</div>'; const activityHtml = activityRows.length ? activityRows.map((item) => `<div><strong>${escapeHtml(item.action)}</strong> · ${escapeHtml(item.details || '')}</div>`).join('') : '<div>No activity recorded.</div>'; $('#propertyDetailBody').innerHTML = `<div class="detail-grid"><span>City<br><strong>${escapeHtml(property.city)}</strong></span><span>Status<br><strong>${escapeHtml(property.workflowStatus)}</strong></span><span>Type<br><strong>${escapeHtml(property.propertyType)}</strong></span><span>Area<br><strong>${escapeHtml(property.area)} sq ft</strong></span><span>Expected price<br><strong>INR ${Number(property.expectedPrice || 0).toLocaleString('en-IN')}</strong></span><span>Valuation<br><strong>INR ${Number(property.estimatedLow || 0).toLocaleString('en-IN')} – ${Number(property.estimatedHigh || 0).toLocaleString('en-IN')}</strong></span></div><div class="detail-section"><h3>Description</h3><p>${escapeHtml(property.description)}</p><p class="meta">Amenities: ${escapeHtml(property.amenities || 'Not provided')}</p></div><div class="detail-section"><h3>Verification checklist</h3><div class="detail-list">${checkHtml}</div></div><div class="detail-section"><h3>Activity history</h3><div class="detail-list">${activityHtml}</div></div>`; } catch (error) { $('#propertyDetailBody').textContent = error.message || 'Property details could not be loaded.'; } }

const workflowStages = ['SUBMITTED', 'UNDER_REVIEW', 'VALUATION_COMPLETED', 'OFFER_ISSUED', 'ACQUISITION_IN_PROGRESS', 'ACQUIRED'];
const workflowLabels = { SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', VALUATION_COMPLETED: 'Valuation ready', OFFER_ISSUED: 'Offer issued', ACQUISITION_IN_PROGRESS: 'Acquisition in progress', ACQUIRED: 'Acquired' };

function renderWorkflow(property) {
  const line = document.createElement('div'); line.className = 'status-line';
  const current = workflowStages.indexOf(property.workflowStatus);
  workflowStages.forEach((stage, index) => { const step = document.createElement('span'); step.className = `status-step${index === current ? ' current' : ''}`; step.textContent = workflowLabels[stage]; line.append(step); });
  return line;
}

async function loadSellerDashboard() {
  if (!sessionStorage.getItem('propbuy_token') || sessionStorage.getItem('propbuy_role') === 'ADMIN') return;
  const propertiesContainer = $('#sellerProperties');
  const offersContainer = $('#sellerOffers');
  propertiesContainer.textContent = 'Loading submissions…'; offersContainer.textContent = 'Loading offers…';
  try {
    const [properties, offers] = await Promise.all([api('/api/properties/mine'), api('/api/acquisition/mine')]);
    propertiesContainer.replaceChildren();
    if (!properties.length) { propertiesContainer.textContent = 'You have not submitted a property yet.'; }
    else properties.forEach((property) => {
      const card = document.createElement('article'); card.className = 'seller-property';
      const title = document.createElement('h4'); title.textContent = property.title;
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${property.city} · ${property.propertyType} · ${Number(property.area || 0).toLocaleString('en-IN')} sq ft`;
      const status = document.createElement('div'); status.className = 'meta'; status.textContent = `Current status: ${workflowLabels[property.workflowStatus] || property.workflowStatus}`;
      card.append(title, meta, status, renderWorkflow(property));
      if (property.estimatedLow != null) { const valuation = document.createElement('p'); valuation.className = 'meta'; valuation.textContent = `Indicative range: INR ${Number(property.estimatedLow).toLocaleString('en-IN')} – INR ${Number(property.estimatedHigh).toLocaleString('en-IN')}`; card.append(valuation); }
      propertiesContainer.append(card);
    });
    offersContainer.replaceChildren();
    if (!offers.length) { offersContainer.textContent = 'No offers yet.'; }
    else offers.forEach((offer) => {
      const row = document.createElement('div'); row.className = 'offer-row';
      const details = document.createElement('span'); details.textContent = `${offer.property?.title || 'Property'} · INR ${Number(offer.amount || 0).toLocaleString('en-IN')} · ${offer.status}`;
      row.append(details);
      if (offer.status === 'ISSUED') { const actions = document.createElement('span'); actions.className = 'offer-actions'; ['true', 'false'].forEach((accept) => { const button = document.createElement('button'); button.className = accept === 'true' ? '' : 'ghost'; button.type = 'button'; button.textContent = accept === 'true' ? 'Accept' : 'Decline'; button.addEventListener('click', () => respondToOffer(offer.id, accept === 'true')); actions.append(button); }); row.append(actions); }
      offersContainer.append(row);
    });
  } catch (error) { propertiesContainer.textContent = error.message || 'Seller data is temporarily unavailable.'; offersContainer.textContent = ''; }
}

async function loadBuyerDashboard() {
  if (sessionStorage.getItem('propbuy_role') !== 'BUYER') return;
  const recommendations = $('#recommendationsList'); const requests = $('#purchaseRequestsList'); const visits = $('#buyerVisitsList');
  try {
    const [recommended, purchaseRequests, buyerVisits] = await Promise.all([api('/api/recommendations'), api('/api/purchase-requests/mine'), api('/api/visits/mine')]);
    recommendations.replaceChildren();
    if (!recommended.length) recommendations.textContent = 'Browse a few homes to get recommendations.';
    recommended.slice(0, 4).forEach((item) => { const row = document.createElement('div'); row.className = 'buyer-row'; row.textContent = `${item.listing?.property?.title || 'Home'} · ${item.listing?.property?.city || 'Location unavailable'} — ${item.reason || 'Matches your search'}`; recommendations.append(row); });
    requests.replaceChildren();
    if (!purchaseRequests.length) requests.textContent = 'No purchase requests yet.';
    purchaseRequests.slice().reverse().slice(0, 6).forEach((request) => { const row = document.createElement('div'); row.className = 'buyer-row'; row.textContent = `${request.listing?.property?.title || 'Property'} · ${request.status} · INR ${Number(request.proposedPrice || 0).toLocaleString('en-IN')}`; requests.append(row); });
    visits.replaceChildren();
    if (!buyerVisits.length) visits.textContent = 'No visits booked yet.';
    buyerVisits.slice(0, 6).forEach((visit) => { const row = document.createElement('div'); row.className = 'buyer-row'; row.textContent = `${visit.title || 'Property'} · ${visit.status} · ${new Date(visit.scheduled_at || visit.scheduledAt).toLocaleString()}`; visits.append(row); });
  } catch (error) { recommendations.textContent = error.message || 'Buyer data is temporarily unavailable.'; }
}

async function respondToOffer(id, accept) {
  try { await api(`/api/acquisition/offers/${id}/respond?accept=${accept}`, { method: 'PUT' }); toast(accept ? 'Offer accepted.' : 'Offer declined.'); loadSellerDashboard(); loadNotifications(); }
  catch (error) { toast(error.message); }
}

function numberOrNull(selector) { const value = $(selector).value; return value === '' ? null : Number(value); }

function updateAuthUI() {
  const token = sessionStorage.getItem('propbuy_token');
  const loggedIn = Boolean(token);
  $('#authGate').hidden = loggedIn;
  $('#appContent').hidden = !loggedIn;
  document.querySelectorAll('[data-auth-only]').forEach((element) => { element.hidden = !loggedIn; });
  $('#loginBtn').hidden = loggedIn;
  $('#registerBtn').hidden = loggedIn;
  $('#dashboard').hidden = !loggedIn;
  $('#adminDashboard').hidden = !loggedIn || sessionStorage.getItem('propbuy_role') !== 'ADMIN';
  $('#sellerDashboard').hidden = !loggedIn || sessionStorage.getItem('propbuy_role') === 'ADMIN';
  $('#buyerDashboard').hidden = !loggedIn || sessionStorage.getItem('propbuy_role') !== 'BUYER';
  if (!loggedIn) return;
  const email = sessionStorage.getItem('propbuy_user') || 'home seeker';
  const role = sessionStorage.getItem('propbuy_role') || 'BUYER';
  $('#dashboardUser').textContent = email.split('@')[0];
  $('#dashboardRole').textContent = role === 'ADMIN'
      ? 'Operations overview is ready: review workflow health and download live analytics.'
      : 'Your buyer space is ready, and you can sell a property any time from the Sell Property label.';
  $('#dashboardPrimary').textContent = role === 'SELLER' ? 'Submit a property →' : role === 'ADMIN' ? 'Open analytics →' : 'Explore more homes →';
  if (role === 'ADMIN') loadAdminAnalytics();
  if (role === 'ADMIN') loadAdminOperations();
  if (role !== 'ADMIN') loadSellerDashboard();
  if (role === 'BUYER') loadBuyerDashboard();
  loadSavedHomes();
}

function applyRoute() {
  const requested = window.location.hash.replace('#', '') || 'dashboard';
  const allowed = ['dashboard', 'browse', 'how', 'saved', 'sell-property'];
  const route = allowed.includes(requested) ? requested : 'dashboard';
  document.querySelectorAll('[data-route]').forEach((section) => {
    section.toggleAttribute('data-route-hidden', section.dataset.route !== route);
  });
  if (route === 'browse') loadListings();
  if (route === 'saved') loadSavedHomes();
  if (route === 'sell-property') loadSellerDashboard();
}

async function loadSavedHomes() {
  const container = $('#savedHomesList');
  if (!container || sessionStorage.getItem('propbuy_role') !== 'BUYER') return;
  try {
    const saved = await api('/api/favorites');
    container.replaceChildren();
    if (!saved.length) { container.innerHTML = '<p class="empty">You have not saved any homes yet.</p>'; return; }
    saved.forEach((home) => {
      const card = document.createElement('article'); card.className = 'card';
      const body = document.createElement('div'); body.className = 'card-body';
      body.innerHTML = `<h3>${escapeHtml(home.title || 'Saved property')}</h3><p class="meta">${escapeHtml(home.city || 'Location unavailable')}</p><p class="price">INR ${Number(home.asking_price || 0).toLocaleString('en-IN')}</p>`;
      const remove = document.createElement('button'); remove.className = 'ghost small-button'; remove.type = 'button'; remove.textContent = 'Remove';
      remove.addEventListener('click', async () => { await api(`/api/favorites/${home.listing_id}`, { method: 'DELETE' }); loadSavedHomes(); toast('Removed from saved homes.'); });
      body.append(remove); card.append(body); container.append(card);
    });
  } catch (error) { container.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}

async function loadListings() {
  const container = $('#listings');
  container.textContent = 'Loading available homes…';
  const params = new URLSearchParams({ q: state.query, page: state.page, size: state.size, sort: state.sort, direction: state.direction });
  if (state.city) params.set('city', state.city);
  if (state.bedrooms) params.set('bedrooms', state.bedrooms);
  if (state.maxPrice) params.set('maxPrice', state.maxPrice);
  try {
    const data = await api(`/api/search?${params}`);
    renderListings(data.results || []);
    const page = data.page;
    $('#pagination').hidden = !page || page.totalPages <= 1;
    if (page) {
      $('#pageSummary').textContent = `Page ${page.number + 1} of ${Math.max(page.totalPages, 1)}`;
      $('#previousPage').disabled = page.number === 0;
      $('#nextPage').disabled = !page.hasNext;
    }
  } catch (error) {
    container.textContent = error.message || 'Listings are temporarily unavailable.';
  }
}

async function loadConversational(query) {
  const container = $('#listings');
  container.textContent = 'Understanding your search…';
  try {
    const data = await api(`/api/search/conversational?q=${encodeURIComponent(query)}&page=${state.page}&size=${state.size}`);
    renderListings(data.results || []);
    const page = data.page;
    $('#pagination').hidden = !page || page.totalPages <= 1;
    if (page) {
      $('#pageSummary').textContent = `Page ${page.number + 1} of ${Math.max(page.totalPages, 1)}`;
      $('#previousPage').disabled = page.number === 0;
      $('#nextPage').disabled = !page.hasNext;
    }
    toast(`Search understood: ${Object.entries(data.interpretation).filter(([, value]) => value !== '').map(([key, value]) => `${key} ${value}`).join(', ')}`);
  } catch (error) { container.textContent = error.message || 'Try a supported conversational search.'; }
}

function openAuth(register = false) {
  $('#authForm').reset();
  $('#authError').textContent = '';
  $('#nameField').hidden = !register;
  $('#authEyebrow').textContent = register ? 'Join PropBuy' : 'Welcome back';
  $('#authTitle').textContent = register ? 'Create your account' : 'Log in';
  $('#authSubmit').textContent = register ? 'Create account' : 'Log in';
  $('#authSwitch').textContent = register ? 'I already have an account' : 'Create an account';
  $('#authForm').dataset.mode = register ? 'register' : 'login';
  $('#authDialog').showModal();
}

$('#searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  state.query = $('#query').value.trim();
  state.page = 0;
  window.location.hash = 'browse';
  if (/\b(?:bedroom|bhk|under|below|apartments?|flats?|villas?|houses?)\b/i.test(state.query)) loadConversational(state.query);
  else loadListings();
});

$('#filterForm').addEventListener('submit', (event) => {
  event.preventDefault();
  state.city = $('#cityFilter').value.trim();
  state.bedrooms = $('#bedroomFilter').value;
  state.maxPrice = $('#priceFilter').value;
  [state.sort, state.direction] = $('#sortFilter').value.split(':');
  state.page = 0;
  loadListings();
});

$('#loadBtn').addEventListener('click', () => {
  state.query = '';
  state.city = '';
  state.bedrooms = '';
  state.maxPrice = '';
  state.sort = 'publishedAt'; state.direction = 'desc';
  $('#query').value = '';
  $('#filterForm').reset();
  state.page = 0;
  loadListings();
});

$('#previousPage').addEventListener('click', () => { state.page -= 1; loadListings(); });
$('#nextPage').addEventListener('click', () => { state.page += 1; loadListings(); });
$('#listViewBtn').addEventListener('click', () => { state.view = 'list'; applyViewMode(); });
$('#mapViewBtn').addEventListener('click', () => { state.view = 'map'; applyViewMode(); });
$('#loginBtn').addEventListener('click', () => openAuth(false));
$('#registerBtn').addEventListener('click', () => openAuth(true));
$('#gateLogin').addEventListener('click', () => openAuth(false));
$('#gateRegister').addEventListener('click', () => openAuth(true));
$('#sellPropertyNav').addEventListener('click', (event) => { if (!sessionStorage.getItem('propbuy_token')) { event.preventDefault(); openAuth(false); } });
$('#closeAuth').addEventListener('click', () => $('#authDialog').close());
$('#authSwitch').addEventListener('click', () => openAuth($('#authForm').dataset.mode !== 'register'));
$('#logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('propbuy_token');
  sessionStorage.removeItem('propbuy_user');
  sessionStorage.removeItem('propbuy_role');
  updateAuthUI();
  toast('You have been logged out.');
});
$('#dashboardPrimary').addEventListener('click', () => { const role = sessionStorage.getItem('propbuy_role'); window.location.hash = role === 'SELLER' ? 'sell-property' : 'browse'; });
$('#dashboardSecondary').addEventListener('click', () => { window.location.hash = 'browse'; setTimeout(() => $('#query').focus(), 0); });
$('#clearCompare').addEventListener('click', () => { state.compare = []; renderCompare(); loadListings(); });
$('#affordabilityForm').addEventListener('submit', (event) => { event.preventDefault(); calculatePayment(); });
$('#analyticsFilter').addEventListener('submit', (event) => { event.preventDefault(); loadAdminAnalytics(); });
$('#adminPropertyFilters').addEventListener('submit', (event) => { event.preventDefault(); loadAdminOperations(); });
$('#clearAnalytics').addEventListener('click', () => { $('#analyticsFrom').value = ''; $('#analyticsTo').value = ''; loadAdminAnalytics(); });
$('#downloadAnalytics').addEventListener('click', () => {
  const params = new URLSearchParams();
  if ($('#analyticsFrom').value) params.set('from', $('#analyticsFrom').value);
  if ($('#analyticsTo').value) params.set('to', $('#analyticsTo').value);
  const token = sessionStorage.getItem('propbuy_token');
  const link = document.createElement('a'); link.href = apiUrl(`/api/admin/analytics.csv?${params}`); link.download = 'propbuy-analytics.csv';
  if (token) link.setAttribute('data-token', token);
  // A short-lived authenticated fetch keeps the export protected by the same API policy.
  fetch(link.href, { headers: { Authorization: `Bearer ${token}` } }).then((response) => { if (!response.ok) throw new Error('Export failed'); return response.blob(); }).then((blob) => { const objectUrl = URL.createObjectURL(blob); link.href = objectUrl; link.click(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }).catch(() => toast('Analytics export could not be downloaded.'));
});
$('#refreshSeller').addEventListener('click', loadSellerDashboard);
$('#refreshBuyer').addEventListener('click', loadBuyerDashboard);
$('#propertyImages').addEventListener('change', () => { const preview = $('#imagePreview'); preview.replaceChildren(); [...$('#propertyImages').files].slice(0, 12).forEach((file) => { const image = document.createElement('img'); image.alt = file.name; image.src = URL.createObjectURL(file); image.onload = () => URL.revokeObjectURL(image.src); preview.append(image); }); });
$('#propertyForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#propertySubmit').disabled = true; $('#propertyFormError').textContent = '';
  const payload = { title: $('#propertyTitle').value.trim(), description: $('#propertyDescription').value.trim(), propertyType: $('#propertyType').value, city: $('#propertyCity').value.trim(), locality: $('#propertyLocality').value.trim() || null, area: numberOrNull('#propertyArea'), expectedPrice: numberOrNull('#propertyPrice'), bedrooms: numberOrNull('#propertyBedrooms'), bathrooms: numberOrNull('#propertyBathrooms'), propertyAge: numberOrNull('#propertyAge'), furnishing: $('#propertyFurnishing').value, amenities: $('#propertyAmenities').value.trim() || null, imageUrl: $('#propertyImageUrl').value.trim() || null };
  try { const created = await api('/api/properties', { method: 'POST', body: JSON.stringify(payload) }); const files = [...$('#propertyImages').files].slice(0, 12); let failedImages = 0; for (const file of files) { const form = new FormData(); form.append('file', file); try { await api(`/api/properties/${created.id}/images`, { method: 'POST', body: form }); } catch (error) { failedImages += 1; } } $('#propertyForm').reset(); $('#imagePreview').replaceChildren(); toast(failedImages ? `Property submitted, but ${failedImages} image(s) could not be uploaded.` : `Property submitted${files.length ? ` with ${files.length} image(s)` : ''} for review.`); loadSellerDashboard(); loadNotifications(); }
  catch (error) { $('#propertyFormError').textContent = error.message; }
  finally { $('#propertySubmit').disabled = false; }
});
$('#closePurchase').addEventListener('click', () => $('#purchaseDialog').close());
$('#purchaseForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#purchaseSubmit').disabled = true; $('#purchaseError').textContent = '';
  try { await api(`/api/purchase-requests/listings/${event.currentTarget.dataset.listingId}`, { method: 'POST', body: JSON.stringify({ proposedPrice: Number($('#purchasePrice').value), message: $('#purchaseMessage').value.trim() || null }) }); $('#purchaseDialog').close(); toast('Purchase request sent for review.'); loadBuyerDashboard(); loadNotifications(); }
  catch (error) { $('#purchaseError').textContent = error.message; }
  finally { $('#purchaseSubmit').disabled = false; }
});
$('#closeOffer').addEventListener('click', () => $('#offerDialog').close());
$('#closePropertyDetail').addEventListener('click', () => $('#propertyDetailDialog').close());
$('#offerForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#offerSubmit').disabled = true; $('#offerError').textContent = '';
  try { await api(`/api/acquisition/properties/${event.currentTarget.dataset.propertyId}/offers`, { method: 'POST', body: JSON.stringify({ amount: Number($('#offerAmount').value), validUntil: $('#offerValidUntil').value, explanation: $('#offerExplanation').value.trim() }) }); $('#offerDialog').close(); toast('Acquisition offer issued.'); loadAdminOperations(); loadAdminAnalytics(); }
  catch (error) { $('#offerError').textContent = error.message; }
  finally { $('#offerSubmit').disabled = false; }
});
$('#saveSearchBtn').addEventListener('click', async () => {
  if (!sessionStorage.getItem('propbuy_token') || sessionStorage.getItem('propbuy_role') !== 'BUYER') { toast('Log in as a buyer to save searches.'); openAuth(false); return; }
  const name = window.prompt('Name this saved search:', `${state.city || state.query || 'My'} homes`);
  if (!name) return;
  try { await api('/api/buyer/saved-searches', { method: 'POST', body: JSON.stringify({ name, query: state.query, city: state.city, bedrooms: state.bedrooms ? Number(state.bedrooms) : null, maxPrice: state.maxPrice ? Number(state.maxPrice) : null }) }); toast('Search saved to your buyer dashboard.'); }
  catch (error) { toast(error.message); }
});
$('#closeVisit').addEventListener('click', () => $('#visitDialog').close());
$('#notificationsBtn').addEventListener('click', () => { $('#notificationPanel').hidden = !$('#notificationPanel').hidden; });
$('#visitForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#visitSubmit').disabled = true;
  $('#visitError').textContent = '';
  try {
    await api(`/api/visits/listings/${event.currentTarget.dataset.listingId}`, { method: 'POST', body: JSON.stringify({ scheduledAt: $('#visitDate').value }) });
    $('#visitDialog').close();
    toast('Visit request sent for admin confirmation.');
    loadNotifications();
  } catch (error) { $('#visitError').textContent = error.message; }
  finally { $('#visitSubmit').disabled = false; }
});

$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const register = event.currentTarget.dataset.mode === 'register';
  const payload = { email: $('#authEmail').value.trim(), password: $('#authPassword').value };
  if (register) {
    payload.name = $('#authName').value.trim();
  }
  $('#authSubmit').disabled = true;
  $('#authError').textContent = '';
  try {
    const data = await api(register ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    if (register) {
      $('#authDialog').close();
      toast('Account created. You can log in now.');
    } else {
      sessionStorage.setItem('propbuy_token', data.token);
      sessionStorage.setItem('propbuy_user', data.user);
      sessionStorage.setItem('propbuy_role', data.role);
      updateAuthUI();
      loadNotifications();
      loadListings();
      $('#authDialog').close();
      toast(`Logged in as ${data.user}.`);
    }
  } catch (error) {
    $('#authError').textContent = error.message;
  } finally {
    $('#authSubmit').disabled = false;
  }
});

const apiDialog = $('#apiConfigDialog');
const apiInput = $('#apiBaseInput');
const apiStatus = $('#apiConfigStatus');
if ($('#configApiBtn') && apiDialog) {
  $('#configApiBtn').addEventListener('click', () => {
    if (apiInput) apiInput.value = getApiBase();
    if (apiStatus) {
      apiStatus.textContent = '';
      apiStatus.style.color = '';
    }
    apiDialog.showModal();
  });
  $('#closeApiConfig')?.addEventListener('click', () => apiDialog.close());
  $('#saveApiBtn')?.addEventListener('click', () => {
    const val = (apiInput?.value || '').trim().replace(/\/$/, '');
    if (val) {
      localStorage.setItem('PROPBUY_API_BASE', val);
      window.PROPBUY_API_BASE = val;
      toast('Backend URL updated and saved.');
    } else {
      localStorage.removeItem('PROPBUY_API_BASE');
      window.PROPBUY_API_BASE = '';
      toast('Reset to default same-origin API.');
    }
    apiDialog.close();
    if (sessionStorage.getItem('propbuy_token')) loadListings();
  });
  $('#resetApiBtn')?.addEventListener('click', () => {
    localStorage.removeItem('PROPBUY_API_BASE');
    window.PROPBUY_API_BASE = '';
    if (apiInput) apiInput.value = '';
    if (apiStatus) {
      apiStatus.textContent = 'Reset to same-origin (/api).';
      apiStatus.style.color = '';
    }
    toast('API URL reset.');
  });
  $('#testApiBtn')?.addEventListener('click', async () => {
    const candidate = (apiInput?.value || '').trim().replace(/\/$/, '');
    if (!candidate) {
      if (apiStatus) {
        apiStatus.textContent = 'Please enter a URL to test (e.g. https://your-app.onrender.com).';
        apiStatus.style.color = '#a43c2e';
      }
      return;
    }
    if (apiStatus) {
      apiStatus.textContent = 'Testing connection... (may take ~30s if Render is waking up)';
      apiStatus.style.color = 'var(--muted)';
    }
    try {
      const res = await fetch(`${candidate}/api/health`);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        localStorage.setItem('PROPBUY_API_BASE', candidate);
        window.PROPBUY_API_BASE = candidate;
        if (apiStatus) {
          apiStatus.textContent = `✅ Connected & saved! You can now log in.`;
          apiStatus.style.color = '#457b29';
        }
        toast('Backend URL saved successfully!');
      } else {
        if (apiStatus) {
          apiStatus.textContent = `⚠️ Connected but server returned status ${res.status}`;
          apiStatus.style.color = '#a43c2e';
        }
      }
    } catch (e) {
      if (apiStatus) {
        apiStatus.textContent = '❌ Failed to reach backend. Check the URL and CORS settings.';
        apiStatus.style.color = '#a43c2e';
      }
    }
  });
}

window.addEventListener('hashchange', applyRoute);
updateAuthUI();
if (sessionStorage.getItem('propbuy_token')) loadNotifications();
renderCompare();
calculatePayment();
if (sessionStorage.getItem('propbuy_token')) loadListings();
applyRoute();
