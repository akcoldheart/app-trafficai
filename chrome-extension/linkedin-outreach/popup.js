document.addEventListener('DOMContentLoaded', async () => {
  const setupView = document.getElementById('setup-view');
  const connectedView = document.getElementById('connected-view');
  const connectBtn = document.getElementById('connect-btn');
  const connectError = document.getElementById('connect-error');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const runNowBtn = document.getElementById('run-now-btn');
  const runNowText = document.getElementById('run-now-text');
  const runNowSpinner = document.getElementById('run-now-spinner');
  const linkedinStatus = document.getElementById('linkedin-status');
  const apiStatus = document.getElementById('api-status');
  const linkedinWarning = document.getElementById('linkedin-warning');
  const lastRunSection = document.getElementById('last-run-section');
  const lastRunInfo = document.getElementById('last-run-info');

  // Check current state
  const status = await chrome.runtime.sendMessage({ action: 'getStatus' });

  if (status.apiConnected) {
    setupView.style.display = 'none';
    connectedView.style.display = 'block';

    linkedinStatus.className = `status-dot ${status.linkedinConnected ? 'green' : 'red'}`;
    apiStatus.className = 'status-dot green';
    linkedinWarning.style.display = status.linkedinConnected ? 'none' : 'block';

    if (status.lastRun) {
      lastRunSection.style.display = 'block';
      const ago = getTimeAgo(status.lastRun);
      const result = status.lastResult;
      lastRunInfo.textContent = result
        ? `${result.sent} of ${result.total} sent \u00b7 ${ago}`
        : ago;
    }
  } else {
    setupView.style.display = 'block';
    connectedView.style.display = 'none';

    const saved = await chrome.storage.local.get(['apiUrl']);
    if (saved.apiUrl) {
      document.getElementById('api-url').value = saved.apiUrl;
    }
  }

  // Connect button
  connectBtn.addEventListener('click', async () => {
    const apiUrl = document.getElementById('api-url').value.trim().replace(/\/$/, '');
    const apiToken = document.getElementById('api-token').value.trim();

    if (!apiUrl || !apiToken) {
      showError('Please enter both API URL and token');
      return;
    }

    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    connectError.style.display = 'none';

    try {
      const resp = await fetch(`${apiUrl}/api/integrations/linkedin/extension/verify`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid token');
      }

      await chrome.runtime.sendMessage({
        action: 'saveConfig',
        apiUrl,
        apiToken,
      });

      window.location.reload();
    } catch (err) {
      showError(err.message);
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect';
    }
  });

  // Run now button
  runNowBtn.addEventListener('click', async () => {
    runNowBtn.disabled = true;
    runNowText.textContent = 'Sending...';
    runNowSpinner.style.display = 'inline-block';

    const result = await chrome.runtime.sendMessage({ action: 'processNow' });

    runNowBtn.disabled = false;
    runNowText.textContent = 'Send Now';
    runNowSpinner.style.display = 'none';

    if (result.status === 'completed') {
      lastRunSection.style.display = 'block';
      lastRunInfo.textContent = `${result.sent} of ${result.total} sent \u00b7 just now`;
    } else if (result.status === 'no_pending') {
      lastRunInfo.textContent = 'No pending contacts \u00b7 just now';
      lastRunSection.style.display = 'block';
    } else if (result.status === 'no_linkedin_session') {
      linkedinStatus.className = 'status-dot red';
      linkedinWarning.style.display = 'block';
    } else {
      showError(result.message || 'Unknown error');
    }
  });

  // Disconnect
  disconnectBtn.addEventListener('click', async () => {
    if (confirm('Disconnect from Traffic AI?')) {
      await chrome.runtime.sendMessage({ action: 'disconnect' });
      window.location.reload();
    }
  });

  function showError(msg) {
    connectError.textContent = msg;
    connectError.style.display = 'block';
  }

  function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
});
