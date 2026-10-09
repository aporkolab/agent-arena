const $ = selector => document.querySelector(selector);
const NOT_EXPORTED = 'NOT EXPORTED';
const REPORT_URL = new URL('data/experiment.json', import.meta.url);
const statusLabels = { pass: 'PASS', fail: 'FAIL', error: 'ERROR', 'not-run': 'NOT RUN' };
let report = null;
let workflowId = null;
let taskId = null;
let evidenceKind = 'brief';
let currentEvidence = '';

function text(value, fallback = NOT_EXPORTED) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function measured(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function duration(value) {
  if (!measured(value)) return NOT_EXPORTED;
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.floor(value / 60_000)}m ${((value % 60_000) / 1000).toFixed(1)}s`;
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function statusOf(task) {
  return Object.hasOwn(statusLabels, task?.status) ? task.status : 'unknown';
}

function selectedWorkflow() {
  return report?.workflows.find(workflow => workflow.id === workflowId);
}

function selectedTask() {
  return selectedWorkflow()?.tasks.find(task => task.id === taskId);
}

function metricCell(value) {
  return element('td', value === NOT_EXPORTED ? 'unavailable' : '', value);
}

function renderTable() {
  const body = $('#workflow-table');
  body.replaceChildren();
  report.workflows.forEach((workflow, index) => {
    const row = element('tr');
    const name = element('td', 'workflow-name');
    name.append(element('span', 'workflow-index', String(index + 1).padStart(2, '0')), document.createTextNode(text(workflow.label, workflow.id)));
    row.append(name);
    const count = workflow.tasks.length;
    const passed = workflow.tasks.filter(task => statusOf(task) === 'pass').length;
    row.append(metricCell(count ? `${passed} / ${count} passed` : NOT_EXPORTED));
    row.append(metricCell(duration(workflow.wallTimeMs)));
    row.append(metricCell(duration(workflow.runtimeMs)));
    row.append(metricCell(text(workflow.model)));
    row.append(metricCell(measured(workflow.tokens) ? new Intl.NumberFormat('en').format(workflow.tokens) : NOT_EXPORTED));
    row.append(metricCell(measured(workflow.costUsd) ? new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(workflow.costUsd) : NOT_EXPORTED));
    body.append(row);
  });
}

function renderWorkflowSwitch() {
  const switcher = $('#workflow-switch');
  switcher.replaceChildren();
  report.workflows.forEach(workflow => {
    const button = element('button', '', text(workflow.label, workflow.id));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(workflow.id === workflowId));
    button.addEventListener('click', () => {
      workflowId = workflow.id;
      if (!workflow.tasks.some(task => task.id === taskId)) taskId = workflow.tasks[0]?.id ?? null;
      renderWorkflowSwitch();
      renderTasks();
      renderTaskDetail();
      [...switcher.children].find(child => child.getAttribute('aria-pressed') === 'true')?.focus({ preventScroll: true });
    });
    switcher.append(button);
  });
}

function renderTasks() {
  const tasks = selectedWorkflow()?.tasks ?? [];
  const list = $('#task-list');
  $('#task-count').textContent = String(tasks.length).padStart(2, '0');
  list.replaceChildren();
  if (!tasks.length) {
    list.append(element('p', 'disclosure', 'No task results were exported for this workflow.'));
    return;
  }
  tasks.forEach((task, index) => {
    const button = element('button', 'task-button');
    const status = statusOf(task);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(task.id === taskId));
    button.setAttribute('aria-label', `${text(task.title, task.id)}; ${statusLabels[status] ?? 'result not exported'}`);
    button.append(element('span', 'task-number', String(index + 1).padStart(2, '0')));
    const copy = element('span', 'task-button-copy');
    copy.append(element('span', 'task-button-title', text(task.title, task.id)), element('span', 'task-button-language', text(task.language)));
    button.append(copy);
    const marker = element('span', `task-button-status ${status}`, status === 'pass' ? '✓' : status === 'fail' || status === 'error' ? '×' : '·');
    marker.setAttribute('aria-hidden', 'true');
    button.append(marker);
    button.addEventListener('click', () => {
      taskId = task.id;
      renderTasks();
      renderTaskDetail();
      [...list.children].find(child => child.getAttribute('aria-pressed') === 'true')?.focus({ preventScroll: true });
    });
    list.append(button);
  });
}

function renderTaskDetail() {
  const task = selectedTask();
  const status = statusOf(task);
  $('#task-title').textContent = text(task?.title, 'No task selected');
  $('#task-language').textContent = task ? `${text(task.language)} / REPAIR TASK` : 'AWAITING TASK RECORD';
  $('#task-status').textContent = task ? statusLabels[status] ?? NOT_EXPORTED : NOT_EXPORTED;
  $('#task-status').className = `badge ${status}`;
  $('#task-duration').textContent = duration(task?.testDurationMs);
  $('#task-id').textContent = text(task?.id);
  renderEvidence();
}

function renderEvidence() {
  const task = selectedTask();
  const value = task?.[evidenceKind];
  currentEvidence = typeof value === 'string' && value.length ? value : '';
  const panel = $('#evidence-panel');
  const content = $('#evidence-content');
  panel.dataset.kind = evidenceKind;
  panel.setAttribute('aria-labelledby', `tab-${evidenceKind}`);
  content.replaceChildren();
  if (!currentEvidence) {
    content.textContent = `No ${evidenceKind === 'log' ? 'test output' : evidenceKind === 'diff' ? 'patch diff' : 'brief'} was exported for this task.`;
  } else if (evidenceKind === 'diff') {
    currentEvidence.split('\n').forEach(line => {
      let className = 'diff-line';
      if (line.startsWith('@@')) className = 'diff-hunk';
      else if (line.startsWith('+') && !line.startsWith('+++')) className = 'diff-add';
      else if (line.startsWith('-') && !line.startsWith('---')) className = 'diff-remove';
      content.append(element('span', className, line || ' '));
    });
  } else {
    content.textContent = currentEvidence;
  }
  panel.scrollTop = 0;
  $('#copy-evidence').disabled = !currentEvidence;
  $('#copy-status').textContent = '';
  $('[role=tablist]').querySelectorAll('[role=tab]').forEach(tab => {
    const active = tab.dataset.tab === evidenceKind;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function normalizedReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.workflows)) throw new Error('The report does not contain a workflows array.');
  const ids = new Set();
  const workflows = raw.workflows.map(workflow => {
    if (!workflow || typeof workflow !== 'object' || typeof workflow.id !== 'string' || !workflow.id || ids.has(workflow.id)) throw new Error('The report contains an invalid workflow identifier.');
    ids.add(workflow.id);
    const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
    const taskIds = new Set();
    tasks.forEach(task => {
      if (!task || typeof task !== 'object' || typeof task.id !== 'string' || !task.id || taskIds.has(task.id)) throw new Error('The report contains an invalid task identifier.');
      taskIds.add(task.id);
    });
    return { ...workflow, tasks };
  });
  return { ...raw, workflows };
}

function showEmpty(error = false) {
  $('#results').hidden = true;
  $('#empty-state').hidden = false;
  $('#empty-title').textContent = error ? 'The report could not be loaded.' : 'No run has been exported yet.';
  $('#empty-description').textContent = error ? 'The exported JSON is unavailable or could not be read. Reload to try again, or inspect the source repository. No cached or invented results are being shown.' : 'The viewer is ready. Results will appear here when the experiment produces an exported report. There are no sample scores standing in for measurements.';
  $('#load-state').textContent = error ? 'Report unavailable' : 'Awaiting an exported run';
  $('#load-dot').className = `status-light${error ? ' error' : ''}`;
}

async function loadReport() {
  $('#reload').disabled = true;
  $('#load-state').textContent = 'Loading exported report…';
  $('#load-dot').className = 'status-light';
  try {
    const response = await fetch(REPORT_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    report = normalizedReport(await response.json());
    $('#session-id').textContent = text(report.id);
    const date = typeof report.createdAt === 'string' ? new Date(report.createdAt) : null;
    $('#exported-at').textContent = date && Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC` : NOT_EXPORTED;
    if (!report.workflows.length || report.workflows.every(workflow => !workflow.tasks.length)) {
      showEmpty();
      return;
    }
    if (!selectedWorkflow()) workflowId = report.workflows[0].id;
    if (!selectedTask()) taskId = selectedWorkflow().tasks[0]?.id ?? null;
    $('#empty-state').hidden = true;
    $('#results').hidden = false;
    $('#load-state').textContent = `${report.workflows.length} workflow records loaded`;
    $('#load-dot').className = 'status-light ready';
    $('#disclosure').textContent = text(report.disclosure, 'An open-test, single-session workflow experiment. Missing measurements were not exported.');
    document.title = `${text(report.title, 'Agent Arena')} · Repair workflow lab`;
    renderTable();
    renderWorkflowSwitch();
    renderTasks();
    renderTaskDetail();
  } catch (error) {
    report = null;
    $('#session-id').textContent = NOT_EXPORTED;
    $('#exported-at').textContent = NOT_EXPORTED;
    showEmpty(true);
    console.warn('Agent Arena could not load its exported report:', error.message);
  } finally {
    $('#reload').disabled = false;
  }
}

$('#reload').addEventListener('click', loadReport);
$('[role=tablist]').addEventListener('click', event => {
  const tab = event.target.closest('[role=tab]');
  if (!tab) return;
  evidenceKind = tab.dataset.tab;
  renderEvidence();
});
$('[role=tablist]').addEventListener('keydown', event => {
  const tabs = [...event.currentTarget.querySelectorAll('[role=tab]')];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  evidenceKind = tabs[next].dataset.tab;
  renderEvidence();
  tabs[next].focus();
});
$('#copy-evidence').addEventListener('click', async () => {
  if (!currentEvidence) return;
  try {
    await navigator.clipboard.writeText(currentEvidence);
    $('#copy-status').textContent = 'Evidence copied.';
    $('#copy-evidence').textContent = 'Copied';
    setTimeout(() => { $('#copy-evidence').textContent = 'Copy'; }, 1800);
  } catch {
    $('#copy-status').textContent = 'Copy is unavailable. Select the text in the evidence panel to copy it manually.';
    $('#evidence-panel').focus();
  }
});

loadReport();
