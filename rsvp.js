'use strict';

// IMPORTANT: After deploying your Cloudflare Worker, replace this placeholder
// with its real /workers.dev URL, WITHOUT a trailing slash.
// Example: https://jz-wedding-rsvp-api.your-account.workers.dev
const RSVP_API_URL = 'https://YOUR-WORKER-SUBDOMAIN.workers.dev';

const $ = (id) => document.getElementById(id);
const steps = ['stepSearch', 'stepMatches', 'stepGuests', 'stepFinished'];
let searchedName = '';
let selectedFamily = null;
let currentInvitation = null;
let extraGuestCount = 0;

function showStep(id) {
  steps.forEach((step) => { $(step).hidden = step !== id; });
  clearNotice();
}

function clearNotice() {
  $('alertMessage').hidden = true;
  $('alertMessage').textContent = '';
}

function notice(text, isInfo = false) {
  const alert = $('alertMessage');
  alert.textContent = text;
  alert.classList.toggle('info', isInfo);
  alert.hidden = false;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = busy ? 'Please wait…' : label;
}

function configured() {
  try {
    const parsed = new URL(RSVP_API_URL);
    return parsed.protocol === 'https:' && !parsed.hostname.includes('YOUR-WORKER-');
  } catch (_) { return false; }
}

async function api(path, payload) {
  const response = await fetch(RSVP_API_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  let result;
  try { result = await response.json(); }
  catch (_) { throw new Error('The RSVP service returned an unexpected response. Please try again.'); }
  if (!response.ok) {
    const error = new Error(result.error || 'The RSVP service is temporarily unavailable.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function finish(kind) {
  showStep('stepFinished');
  if (kind === 'already') {
    $('finishedSymbol').textContent = '✉';
    $('finishedTitle').textContent = 'Your RSVP is already recorded';
    $('finishedMessage').textContent = 'This invitation has already been submitted, so the attendance choices cannot be changed online. Please contact Jayson or Zenia directly if you need to request an update.';
  } else {
    $('finishedSymbol').textContent = '♡';
    $('finishedTitle').textContent = 'Thank you for responding!';
    $('finishedMessage').textContent = 'Your attendance choices have been saved. We can’t wait to celebrate with you! If you need to make a change, please contact Jayson or Zenia directly.';
  }
}

function renderMatches(matches) {
  const list = $('matchList');
  list.replaceChildren();
  for (const match of matches) {
    const button = element('button', 'match-option');
    button.type = 'button';
    button.append(
      element('strong', '', match.matchedName),
      element('span', '', match.label + (match.submitted ? ' · RSVP completed' : ' · Review invitation'))
    );
    button.addEventListener('click', async () => {
      selectedFamily = match.householdId;
      await openInvitation();
    });
    list.append(button);
  }
  showStep('stepMatches');
}

async function openInvitation() {
  const buttons = [...document.querySelectorAll('.match-option')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const invitation = await api('/api/invitation', { searchName: searchedName, householdId: selectedFamily });
    if (invitation.submitted) { finish('already'); return; }
    currentInvitation = invitation;
    renderInvitation(invitation);
    showStep('stepGuests');
  } catch (error) {
    notice(error.message);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function refreshAttendance(row, checkbox, stateLabel) {
  row.classList.toggle('is-declined', !checkbox.checked);
  stateLabel.textContent = checkbox.checked ? 'YES' : 'NO';
}

function renderInvitation(invitation) {
  $('familyTitle').textContent = invitation.label;
  const guestList = $('guestList');
  guestList.replaceChildren();
  for (const guest of invitation.guests) {
    const row = element('div', 'guest-row');
    const name = element('span', 'attendance-name', guest.fullName);
    const toggle = element('label', 'switch');
    const stateLabel = element('span', 'switch-label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'attendance-toggle';
    input.checked = true;
    input.dataset.guestId = guest.id;
    input.setAttribute('aria-label', guest.fullName + ' will attend');
    const track = element('span', 'switch-track');
    track.setAttribute('aria-hidden', 'true');
    toggle.append(stateLabel, input, track);
    row.append(name, toggle);
    input.addEventListener('change', () => {
      refreshAttendance(row, input, stateLabel);
      input.setAttribute('aria-label', guest.fullName + (input.checked ? ' will attend' : ' will not attend'));
    });
    refreshAttendance(row, input, stateLabel);
    guestList.append(row);
  }
  $('confirmSelection').checked = false;
  extraGuestCount = 0;
  $('extraGuestList').replaceChildren();
  const allowance = invitation.maxExtraGuests;
  $('extraGuestSection').hidden = allowance === 0;
  if (allowance > 0) {
    $('extraGuestDescription').textContent = allowance === 1
      ? 'Your invitation allows one additional guest. Add their full name if they will attend.'
      : 'Your invitation allows up to ' + allowance + ' additional guests. Enter the full name of each person who will attend.';
  }
  updateAddGuestButton();
}

function updateAddGuestButton() {
  const max = currentInvitation?.maxExtraGuests || 0;
  $('addGuestButton').hidden = extraGuestCount >= max;
  $('addGuestButton').textContent = '+ Add ' + (max === 1 ? 'a guest' : 'another guest');
}

function addExtraGuest() {
  if (!currentInvitation || extraGuestCount >= currentInvitation.maxExtraGuests) return;
  const row = element('div', 'extra-row');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Additional guest full name';
  input.maxLength = 100;
  input.className = 'extra-name';
  input.setAttribute('aria-label', 'Additional guest full name');
  input.required = true;
  const remove = element('button', 'remove-guest', 'Remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remove additional guest');
  remove.addEventListener('click', () => {
    row.remove();
    extraGuestCount--;
    updateAddGuestButton();
  });
  row.append(input, remove);
  $('extraGuestList').append(row);
  extraGuestCount++;
  updateAddGuestButton();
  input.focus();
}

$('searchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('guestSearch').value.replace(/\s+/g, ' ').trim();
  if (name.length < 2) { notice('Please enter the full name written on your invitation.'); return; }
  if (!configured()) { notice('The new RSVP service has not been connected yet. Please check back soon.'); return; }
  searchedName = name;
  clearNotice();
  setBusy($('searchButton'), true, 'Find my invitation');
  try {
    const result = await api('/api/lookup', { name });
    if (!result.matches.length) {
      notice('We couldn’t find that name. Please try the full name on the invitation, or contact Jayson or Zenia.');
    } else {
      renderMatches(result.matches);
    }
  } catch (error) {
    notice(error.message);
  } finally {
    setBusy($('searchButton'), false, 'Find my invitation');
  }
});

$('backToSearch').addEventListener('click', () => showStep('stepSearch'));
$('backToMatches').addEventListener('click', () => showStep('stepMatches'));
$('addGuestButton').addEventListener('click', addExtraGuest);

$('responseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentInvitation) return;
  const toggles = [...document.querySelectorAll('.attendance-toggle')];
  const attendance = toggles.map((toggle) => ({ guestId: toggle.dataset.guestId, attending: toggle.checked }));
  const extras = [...document.querySelectorAll('.extra-name')].map((input) => input.value.replace(/\s+/g, ' ').trim());
  if (extras.some((name) => name.length < 2)) { notice('Please enter the full name of each additional guest, or remove the empty row.'); return; }
  if (!$('confirmSelection').checked) { notice('Please confirm that you have reviewed all attendance choices.'); return; }
  clearNotice();
  setBusy($('submitButton'), true, 'Submit our RSVP');
  try {
    const response = await api('/api/respond', {
      householdId: selectedFamily,
      searchName: searchedName,
      attendance,
      additionalGuests: extras
    });
    if (response.saved) finish('saved');
  } catch (error) {
    if (error.status === 409) finish('already');
    else notice(error.message);
  } finally {
    setBusy($('submitButton'), false, 'Submit our RSVP');
  }
});
