'use strict';

// IMPORTANT: After deploying your Cloudflare Worker, replace this placeholder
// with its real /workers.dev URL, WITHOUT a trailing slash.
// Example: https://jz-wedding-rsvp-api.your-account.workers.dev
const RSVP_API_URL = 'https://jz-wedding-rsvp-api.use-jaygalvan.workers.dev';

const $ = (id) => document.getElementById(id);
const steps = ['stepSearch', 'stepMatches', 'stepGuests', 'stepFinished'];
let searchedName = '';
let selectedFamily = null;
let currentInvitation = null;

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
      element('span', '', (match.invitedCount || 'Several') + ' invited seats' + (match.submitted ? ' · RSVP completed' : ' · Review invitation'))
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
  const seatNameInput = row.querySelector('.seat-name-input');
  if (seatNameInput) {
    seatNameInput.readOnly = !checkbox.checked;
    seatNameInput.setAttribute('aria-disabled', String(!checkbox.checked));
  }
}

// Two or more name parts are required for names entered by guests. This
// applies to both replacement guests and unnamed invitation seats.
function isFullGuestName(value) {
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= 2 && name.length <= 100
    && !/[\x00-\x1f\x7f<>]/.test(name)
    && name.split(' ').length >= 2
    && name.split(' ').every((part) => /\p{L}/u.test(part));
}

function invalidFullName(input, message) {
  input.setAttribute('aria-invalid', 'true');
  notice(message);
  input.focus();
  return false;
}

function renderInvitation(invitation) {
  $('familyTitle').textContent = 'Your invited guests';
  const guestList = $('guestList');
  guestList.replaceChildren();
  invitation.guests.forEach((guest, index) => {
    const openSeat = !guest.fullName;
    const row = element('div', 'guest-row' + (openSeat ? ' guest-row-open' : ''));
    const name = element('div', 'attendance-name');
    const slotLabel = openSeat ? 'Guest seat ' + (index + 1) : guest.fullName;
    if (openSeat) {
      // An unnamed invitation seat must be editable where a normal name
      // would appear. The placeholder is only a visual prompt (not data).
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'seat-name-input';
      nameInput.placeholder = 'Enter full name of guest';
      nameInput.maxLength = 100;
      nameInput.autocomplete = 'off';
      nameInput.autocapitalize = 'words';
      nameInput.dataset.guestId = guest.id;
      nameInput.setAttribute('aria-label', 'Guest seat ' + (index + 1) + ': enter full name of guest');
      nameInput.addEventListener('input', () => nameInput.removeAttribute('aria-invalid'));
      name.append(nameInput);
    } else {
      name.append(element('span', 'named-invitee', guest.fullName));
    }
    const toggle = element('label', 'switch');
    const stateLabel = element('span', 'switch-label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'attendance-toggle';
    input.checked = true;
    input.dataset.guestId = guest.id;
    input.dataset.openSlot = String(openSeat);
    input.setAttribute('aria-label', slotLabel + ' will attend');
    const track = element('span', 'switch-track');
    track.setAttribute('aria-hidden', 'true');
    toggle.append(stateLabel, input, track);
    row.append(name, toggle);
    input.addEventListener('change', () => {
      refreshAttendance(row, input, stateLabel);
      input.setAttribute('aria-label', slotLabel + (input.checked ? ' will attend' : ' will not attend'));
      refreshReplacementFields();
    });
    refreshAttendance(row, input, stateLabel);
    guestList.append(row);
  });
  $('confirmSelection').checked = false;
  $('extraGuestList').replaceChildren();
  refreshReplacementFields();
}

// Optional replacement seats are created ONLY when a named invitee declines.
// They never increase the total number of invited seats. Empty fields mean
// the family elects not to use those seats; no Remove button is necessary.
function refreshReplacementFields() {
  const declined = [...document.querySelectorAll('.attendance-toggle')]
    .filter((checkbox) => !checkbox.checked && checkbox.dataset.openSlot !== 'true').length;
  const numberOfSlots = currentInvitation?.allowReplacements ? declined : 0;
  const section = $('extraGuestSection');
  section.hidden = numberOfSlots === 0;
  const list = $('extraGuestList');
  const saved = [...list.querySelectorAll('.extra-name')].map((input) => input.value);
  list.replaceChildren();
  if (!numberOfSlots) return;

  $('extraGuestDescription').textContent = numberOfSlots === 1
    ? 'One invited guest cannot attend. You may enter one replacement guest instead, or leave it blank.'
    : numberOfSlots + ' invited guests cannot attend. You may enter up to ' + numberOfSlots + ' replacement names, or leave fields blank.';

  for (let i = 0; i < numberOfSlots; i++) {
    const row = element('div', 'extra-row');
    const label = element('label', 'extra-label', 'Replacement guest ' + (i + 1) + ' (optional)');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Full name (optional)';
    input.maxLength = 100;
    input.className = 'extra-name';
    input.value = saved[i] || '';
    input.setAttribute('aria-label', 'Replacement guest ' + (i + 1) + ' full name (optional)');
    input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
    row.append(label, input);
    list.append(row);
  }
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

$('responseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentInvitation) return;
  const toggles = [...document.querySelectorAll('.attendance-toggle')];
  const attendance = toggles.map((toggle) => {
    const entry = { guestId: toggle.dataset.guestId, attending: toggle.checked };
    const openName = [...document.querySelectorAll('.seat-name-input')]
      .find((input) => input.dataset.guestId === toggle.dataset.guestId);
    if (openName) entry.guestName = toggle.checked ? openName.value.replace(/\s+/g, ' ').trim() : '';
    return entry;
  });
  for (const input of document.querySelectorAll('.seat-name-input')) {
    const choice = attendance.find((entry) => entry.guestId === input.dataset.guestId);
    if (choice.attending && !isFullGuestName(choice.guestName)) {
      invalidFullName(input, 'Please enter the first and last name for each unnamed guest who will attend, or switch their attendance to NO.');
      return;
    }
  }
  const extras = [];
  for (const input of document.querySelectorAll('.extra-name')) {
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (name && !isFullGuestName(name)) {
      invalidFullName(input, 'Replacement guests must have a first and last name. For example, Juan Ramos. You can also leave a replacement field blank.');
      return;
    }
    if (name) extras.push(name);
  }
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
