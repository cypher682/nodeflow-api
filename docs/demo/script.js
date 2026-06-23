document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const btnToggleKey = document.getElementById('btnToggleKey');
  const btnBootstrapKey = document.getElementById('btnBootstrapKey');
  const apiStatusEl = document.getElementById('apiStatus');
  const wsStatusEl = document.getElementById('wsStatus');

  const navLinks = document.querySelectorAll('.nav-links a');
  const sections = document.querySelectorAll('.content-section');

  const trafficConsole = document.getElementById('trafficConsole');
  const btnClearTraffic = document.getElementById('btnClearTraffic');

  // Active Job Monitor Elements
  const jobMonitorEmpty = document.getElementById('jobMonitorEmpty');
  const jobMonitorActive = document.getElementById('jobMonitorActive');
  const monitorJobIdInput = document.getElementById('monitorJobId');
  const btnMonitorJob = document.getElementById('btnMonitorJob');
  const activeJobType = document.getElementById('activeJobType');
  const activeJobId = document.getElementById('activeJobId');
  const activeJobStatus = document.getElementById('activeJobStatus');
  const activeJobProgress = document.getElementById('activeJobProgress');
  const activeJobAttempts = document.getElementById('activeJobAttempts');
  const activeJobCreated = document.getElementById('activeJobCreated');
  const activeJobLogs = document.getElementById('activeJobLogs');
  const btnCancelJob = document.getElementById('btnCancelJob');
  const btnRefreshJob = document.getElementById('btnRefreshJob');

  // Job Queue Elements
  const jobForm = document.getElementById('jobForm');
  const jobTypeSelect = document.getElementById('jobType');
  const jobPriorityInput = document.getElementById('jobPriority');
  const jobPayloadInput = document.getElementById('jobPayload');
  const jobIdempotencyInput = document.getElementById('jobIdempotency');
  const jobMaxAttemptsInput = document.getElementById('jobMaxAttempts');
  const filterJobStatus = document.getElementById('filterJobStatus');
  const jobsLimitInput = document.getElementById('jobsLimit');
  const btnFetchJobs = document.getElementById('btnFetchJobs');
  const jobsTableBody = document.getElementById('jobsTableBody');
  const jobsPagination = document.getElementById('jobsPagination');
  const btnNextJobs = document.getElementById('btnNextJobs');
  const nextJobsCursor = document.getElementById('nextJobsCursor');

  // Webhooks Elements
  const webhookForm = document.getElementById('webhookForm');
  const webhookUrlInput = document.getElementById('webhookUrl');
  const btnFetchWebhooks = document.getElementById('btnFetchWebhooks');
  const webhooksList = document.getElementById('webhooksList');
  const webhookDeliveriesBody = document.getElementById('webhookDeliveriesBody');

  // Files Elements
  const fileForm = document.getElementById('fileForm');
  const fileUploadInput = document.getElementById('fileUploadInput');
  const btnFetchFiles = document.getElementById('btnFetchFiles');
  const filesList = document.getElementById('filesList');

  // Advanced Elements
  const btnTestRateLimit = document.getElementById('btnTestRateLimit');
  const headerLimit = document.getElementById('headerLimit');
  const headerRemaining = document.getElementById('headerRemaining');
  const headerReset = document.getElementById('headerReset');

  const idemKeyInput = document.getElementById('idemKeyInput');
  const btnGenIdemKey = document.getElementById('btnGenIdemKey');
  const btnTestIdempotency = document.getElementById('btnTestIdempotency');

  const reqVersionSelect = document.getElementById('reqVersion');
  const btnTestVersion = document.getElementById('btnTestVersion');

  // State Variables
  let socket = null;
  let currentMonitoredJobId = null;
  let nextCursorVal = null;

  // Toggle API Key visibility
  btnToggleKey.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btnToggleKey.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      btnToggleKey.textContent = '👁️';
    }
  });

  // Generate Idempotency Key
  btnGenIdemKey.addEventListener('click', () => {
    idemKeyInput.value = 'idem-' + Math.random().toString(36).substring(2, 11);
  });

  // Navigation Logic
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const targetSectionId = link.getAttribute('href').substring(1);
      sections.forEach(sec => {
        if (sec.id === targetSectionId) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });
    });
  });

  // Console Logging
  function logTraffic(direction, method, url, status, payload) {
    const time = new Date().toLocaleTimeString();
    const isError = status && (status < 200 || status >= 300);
    const colorClass = isError ? 'error-log' : (direction === 'SENT' ? 'info-log' : 'success-log');

    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry mt-2';
    logEntry.innerHTML = `
      <span class="system-log">[${time}]</span> 
      <strong class="${colorClass}">${direction} ${method} ${url}</strong>
      ${status ? `<span class="status-badge ${isError ? 'status-failed' : 'status-success'}">${status}</span>` : ''}
      <pre class="code-font mt-2" style="background:#131824; padding:0.5rem; border-radius:4px; max-height: 250px; overflow-y:auto;">${JSON.stringify(payload, null, 2)}</pre>
    `;

    trafficConsole.appendChild(logEntry);
    trafficConsole.scrollTop = trafficConsole.scrollHeight;
  }

  btnClearTraffic.addEventListener('click', () => {
    trafficConsole.innerHTML = '<span class="system-log">[SYSTEM] API Console Cleared. Ready for traffic...</span>';
  });

  // HTTP Helper
  async function makeRequest(method, path, body = null, customHeaders = {}) {
    const baseUrl = apiUrlInput.value.trim();
    const url = `${baseUrl}${path}`;
    const token = apiKeyInput.value.trim();

    const headers = {
      'Accept': 'application/json',
      ...customHeaders
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let options = { method, headers };

    if (body) {
      if (body instanceof FormData) {
        options.body = body;
        // Do not set Content-Type for FormData; browser sets it automatically with boundary
      } else {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
    }

    logTraffic('SENT', method, path, null, body || { info: "Empty Payload" });

    try {
      const response = await fetch(url, options);
      
      // Update Rate Limit headers if present
      if (response.headers.has('X-RateLimit-Limit')) {
        headerLimit.textContent = response.headers.get('X-RateLimit-Limit');
        headerRemaining.textContent = response.headers.get('X-RateLimit-Remaining');
        headerReset.textContent = response.headers.get('Retry-After') || '60';
      }

      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { rawResponse: text };
      }

      logTraffic('RCVD', method, path, response.status, data);

      if (!response.ok) {
        throw { status: response.status, data };
      }

      return data;
    } catch (err) {
      if (err.status) throw err;
      logTraffic('ERR', method, path, null, { message: err.message || "Network Error" });
      throw err;
    }
  }

  // Health and Connection Check
  async function checkHealth() {
    try {
      const response = await fetch(`${apiUrlInput.value.trim()}/health`);
      if (response.ok) {
        apiStatusEl.textContent = 'Online';
        apiStatusEl.className = 'status-badge status-online';
      } else {
        throw new Error();
      }
    } catch (e) {
      apiStatusEl.textContent = 'Offline';
      apiStatusEl.className = 'status-badge status-offline';
    }
  }

  setInterval(checkHealth, 5000);
  checkHealth();

  // Self-Bootstrap key
  btnBootstrapKey.addEventListener('click', async () => {
    try {
      const result = await makeRequest('POST', '/v1/bootstrap');
      if (result && result.data && result.data.key) {
        apiKeyInput.value = result.data.key;
        alert(`Successfully bootstrapped default testing API Key: \n\n${result.data.key}`);
        checkHealth();
      }
    } catch (err) {
      alert('Failed to bootstrap API key automatically. Ensure backend service is running and ports are open.');
    }
  });

  // WebSocket Connection Handler
  function connectWebSocket(jobId) {
    if (socket) {
      socket.disconnect();
    }

    const baseUrl = apiUrlInput.value.trim();
    wsStatusEl.textContent = 'Connecting...';
    wsStatusEl.className = 'status-badge status-running';

    // Socket.io client setup
    socket = io(baseUrl, {
      path: '/ws',
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      wsStatusEl.textContent = 'Connected';
      wsStatusEl.className = 'status-badge status-online';
      
      // Subscribe to Job Room
      socket.emit('subscribe', jobId);
      
      const logLine = document.createElement('div');
      logLine.className = 'system-log';
      logLine.textContent = `[SOCKET] Connected. Subscribed to room job:${jobId}`;
      activeJobLogs.appendChild(logLine);
    });

    socket.on('disconnect', () => {
      wsStatusEl.textContent = 'Disconnected';
      wsStatusEl.className = 'status-badge status-offline';
    });

    socket.on('connect_error', (error) => {
      wsStatusEl.textContent = 'Socket Error';
      wsStatusEl.className = 'status-badge status-failed';
      
      const logLine = document.createElement('div');
      logLine.className = 'error-log';
      logLine.textContent = `[SOCKET] Connection Error: ${error.message}`;
      activeJobLogs.appendChild(logLine);
    });

    // Handle incoming events from the worker
    socket.on('job:status', (data) => {
      if (data.jobId === jobId) {
        updateActiveMonitorUI(data);
      }
    });

    socket.on('subscribed', (data) => {
      const logLine = document.createElement('div');
      logLine.className = 'system-log';
      logLine.textContent = `[SOCKET] Room subscription confirmed: ${data.room}`;
      activeJobLogs.appendChild(logLine);
    });
  }

  // Update Monitored Job UI
  function updateActiveMonitorUI(data) {
    activeJobStatus.textContent = data.status;
    activeJobStatus.className = `status-badge status-${data.status.toLowerCase()}`;

    if (data.status === 'QUEUED') {
      activeJobProgress.style.width = '10%';
      activeJobProgress.style.backgroundColor = 'var(--primary)';
    } else if (data.status === 'RUNNING') {
      activeJobProgress.style.width = '50%';
      activeJobProgress.style.backgroundColor = 'var(--warning)';
    } else if (data.status === 'SUCCEEDED') {
      activeJobProgress.style.width = '100%';
      activeJobProgress.style.backgroundColor = 'var(--accent)';
    } else if (data.status === 'FAILED') {
      activeJobProgress.style.width = '100%';
      activeJobProgress.style.backgroundColor = 'var(--danger)';
    } else if (data.status === 'CANCELLED') {
      activeJobProgress.style.width = '100%';
      activeJobProgress.style.backgroundColor = 'var(--text-muted)';
    }

    if (data.attempts !== undefined) {
      activeJobAttempts.textContent = `${data.attempts}/${data.maxAttempts || 3}`;
    }

    if (data.timestamp) {
      activeJobCreated.textContent = new Date(data.timestamp).toLocaleString();
    }

    // Append log event
    const logLine = document.createElement('div');
    if (data.status === 'SUCCEEDED') {
      logLine.className = 'success-log';
      logLine.textContent = `[COMPLETED] Job succeeded. Result: ${JSON.stringify(data.result)}`;
    } else if (data.status === 'FAILED') {
      logLine.className = 'error-log';
      logLine.textContent = `[FAILED] Job processing error: ${data.error || 'Unknown Error'}`;
    } else if (data.status === 'RUNNING') {
      logLine.className = 'info-log';
      logLine.textContent = `[RUNNING] Job started processing in worker...`;
    } else {
      logLine.className = 'system-log';
      logLine.textContent = `[EVENT] Status transitioned to ${data.status}`;
    }
    
    activeJobLogs.appendChild(logLine);
    activeJobLogs.scrollTop = activeJobLogs.scrollHeight;
  }

  // Poll Job Logs (Fallback)
  async function pollJobLogs(jobId) {
    try {
      const logsData = await makeRequest('GET', `/v1/jobs/${jobId}/logs`);
      if (logsData && logsData.data) {
        activeJobLogs.innerHTML = '';
        logsData.data.forEach(log => {
          const logLine = document.createElement('div');
          logLine.className = log.level === 'ERROR' ? 'error-log' : (log.level === 'WARN' ? 'warn-log' : 'info-log');
          logLine.textContent = `[${log.level}] [${new Date(log.createdAt).toLocaleTimeString()}] ${log.message}`;
          activeJobLogs.appendChild(logLine);
        });
        activeJobLogs.scrollTop = activeJobLogs.scrollHeight;
      }
    } catch (e) {}
  }

  // Monitor Specific Job
  async function monitorJob(jobId) {
    currentMonitoredJobId = jobId;
    jobMonitorEmpty.classList.add('hidden');
    jobMonitorActive.classList.remove('hidden');

    activeJobId.textContent = jobId;
    activeJobType.textContent = 'Loading...';
    activeJobStatus.textContent = 'POLLING';
    activeJobProgress.style.width = '0%';
    activeJobLogs.innerHTML = '<span class="system-log">[SYSTEM] Fetching initial job details...</span>';

    try {
      const jobDetails = await makeRequest('GET', `/v1/jobs/${jobId}`);
      if (jobDetails && jobDetails.data) {
        const job = jobDetails.data;
        activeJobType.textContent = job.type;
        activeJobStatus.textContent = job.status;
        activeJobStatus.className = `status-badge status-${job.status.toLowerCase()}`;
        activeJobAttempts.textContent = `${job.attempts}/${job.maxAttempts}`;
        activeJobCreated.textContent = new Date(job.createdAt).toLocaleString();

        connectWebSocket(jobId);
        pollJobLogs(jobId);
      }
    } catch (err) {
      activeJobLogs.innerHTML = `<span class="error-log">[ERROR] Could not load job details: ${err.message || 'Check API connection'}</span>`;
    }
  }

  btnMonitorJob.addEventListener('click', () => {
    const id = monitorJobIdInput.value.trim();
    if (id) monitorJob(id);
  });

  // Submit Job Form
  jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = jobTypeSelect.value;
    const priority = parseInt(jobPriorityInput.value, 10);
    const maxAttempts = parseInt(jobMaxAttemptsInput.value, 10);
    
    let payload;
    try {
      payload = JSON.parse(jobPayloadInput.value);
    } catch (err) {
      alert("Invalid JSON in Payload field");
      return;
    }

    const headers = {};
    if (jobIdempotencyInput.value.trim()) {
      headers['Idempotency-Key'] = jobIdempotencyInput.value.trim();
    }

    try {
      const result = await makeRequest('POST', '/v1/jobs', {
        type,
        payload,
        priority,
        maxAttempts
      }, headers);

      if (result && result.data && result.data.id) {
        monitorJob(result.data.id);
      }
    } catch (err) {
      alert(`Job submission failed: ${err.data?.error?.message || 'Error occurred'}`);
    }
  });

  // Refresh monitored job manually
  btnRefreshJob.addEventListener('click', () => {
    if (currentMonitoredJobId) {
      monitorJob(currentMonitoredJobId);
    }
  });

  // Cancel monitored job
  btnCancelJob.addEventListener('click', async () => {
    if (!currentMonitoredJobId) return;
    try {
      await makeRequest('DELETE', `/v1/jobs/${currentMonitoredJobId}`);
      monitorJob(currentMonitoredJobId);
    } catch (err) {
      alert(`Cancellation failed: ${err.data?.error?.message || 'Check terminal status'}`);
    }
  });

  // Fetch jobs list
  async function fetchJobsList(cursor = null) {
    let path = `/v1/jobs?limit=${jobsLimitInput.value}`;
    if (filterJobStatus.value) {
      path += `&status=${filterJobStatus.value}`;
    }
    if (cursor) {
      path += `&cursor=${cursor}`;
    }

    try {
      const result = await makeRequest('GET', path);
      if (result && result.data) {
        if (!cursor) {
          jobsTableBody.innerHTML = '';
        }
        
        if (result.data.length === 0 && !cursor) {
          jobsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No jobs matching filter.</td></tr>';
          jobsPagination.classList.add('hidden');
          return;
        }

        result.data.forEach(job => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><code>${job.id}</code></td>
            <td>${job.type}</td>
            <td><span class="status-badge status-${job.status.toLowerCase()}">${job.status}</span></td>
            <td>${job.priority}</td>
            <td>${job.attempts}/${job.maxAttempts}</td>
            <td>${new Date(job.createdAt).toLocaleTimeString()}</td>
            <td><button class="btn btn-secondary btn-small" onclick="document.dispatchEvent(new CustomEvent('monitor-job', {detail: '${job.id}'}))">Monitor</button></td>
          `;
          jobsTableBody.appendChild(row);
        });

        if (result.pageInfo && result.pageInfo.hasNextPage) {
          jobsPagination.classList.remove('hidden');
          nextCursorVal = result.pageInfo.nextCursor;
          nextJobsCursor.textContent = nextCursorVal.substring(0, 15) + '...';
        } else {
          jobsPagination.classList.add('hidden');
          nextCursorVal = null;
        }
      }
    } catch (err) {}
  }

  btnFetchJobs.addEventListener('click', () => fetchJobsList());
  btnNextJobs.addEventListener('click', () => {
    if (nextCursorVal) fetchJobsList(nextCursorVal);
  });

  document.addEventListener('monitor-job', (e) => {
    monitorJob(e.detail);
    // Switch navigation link highlight to Jobs section
    navLinks.forEach(l => l.classList.remove('active'));
    document.querySelector('a[href="#section-jobs"]').classList.add('active');
    sections.forEach(sec => {
      if (sec.id === 'section-jobs') sec.classList.add('active');
      else sec.classList.remove('active');
    });
  });

  // Webhooks Logic
  webhookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = webhookUrlInput.value.trim();
    const eventCheckboxes = document.querySelectorAll('input[name="webhookEvents"]:checked');
    const events = Array.from(eventCheckboxes).map(cb => cb.value);

    try {
      await makeRequest('POST', '/v1/webhooks', { url, events });
      fetchWebhooks();
    } catch (err) {}
  });

  async function fetchWebhooks() {
    try {
      const result = await makeRequest('GET', '/v1/webhooks');
      if (result && result.data) {
        webhooksList.innerHTML = '';
        if (result.data.length === 0) {
          webhooksList.innerHTML = '<div class="empty-state">No webhooks registered.</div>';
          return;
        }

        result.data.forEach(wh => {
          const item = document.createElement('div');
          item.className = 'record-item';
          item.innerHTML = `
            <div class="record-info">
              <strong>${wh.url}</strong>
              <span class="text-muted" style="font-size:0.8rem;">Events: ${wh.events.join(', ')}</span>
              <code style="font-size:0.75rem; color:var(--warning);">Secret: whsec_${wh.secret.substring(0,8)}...</code>
            </div>
            <div class="record-actions">
              <button class="btn btn-danger btn-small" onclick="document.dispatchEvent(new CustomEvent('delete-webhook', {detail: '${wh.id}'}))">Delete</button>
              <button class="btn btn-secondary btn-small" onclick="document.dispatchEvent(new CustomEvent('fetch-deliveries', {detail: '${wh.id}'}))">Deliveries</button>
            </div>
          `;
          webhooksList.appendChild(item);
        });
      }
    } catch (err) {}
  }

  btnFetchWebhooks.addEventListener('click', fetchWebhooks);

  document.addEventListener('delete-webhook', async (e) => {
    try {
      await makeRequest('DELETE', `/v1/webhooks/${e.detail}`);
      fetchWebhooks();
    } catch (err) {}
  });

  document.addEventListener('fetch-deliveries', async (e) => {
    try {
      const result = await makeRequest('GET', `/v1/webhooks/${e.detail}/deliveries`);
      if (result && result.data) {
        webhookDeliveriesBody.innerHTML = '';
        if (result.data.length === 0) {
          webhookDeliveriesBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No webhook deliveries for this registration.</td></tr>';
          return;
        }

        result.data.forEach(del => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><code>${del.id}</code></td>
            <td><code>${del.webhookId}</code></td>
            <td><code>${del.eventType}</code></td>
            <td><span class="status-badge status-${del.status.toLowerCase()}">${del.status}</span></td>
            <td>${del.attempts}</td>
            <td><code>${del.responseCode || 'N/A'}</code> (${(del.responseBody || 'N/A').substring(0, 30)})</td>
            <td>${del.nextRetryAt ? new Date(del.nextRetryAt).toLocaleTimeString() : 'N/A'}</td>
          `;
          webhookDeliveriesBody.appendChild(row);
        });
      }
    } catch (err) {}
  });

  // Files Pipeline Logic
  fileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileUploadInput.files.length) return;

    const file = fileUploadInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await makeRequest('POST', '/v1/files', formData);
      if (result && result.data && result.data.id) {
        alert(`File uploaded successfully! File ID: ${result.data.id}\nBackground extraction metadata job started.`);
        fetchFiles();
      }
    } catch (err) {
      alert(`File upload failed: ${err.data?.error?.message || 'Error occurred'}`);
    }
  });

  async function fetchFiles() {
    try {
      const result = await makeRequest('GET', '/v1/files');
      if (result && result.data) {
        filesList.innerHTML = '';
        if (result.data.length === 0) {
          filesList.innerHTML = '<div class="empty-state">No files uploaded.</div>';
          return;
        }

        result.data.forEach(f => {
          const item = document.createElement('div');
          item.className = 'record-item';
          item.innerHTML = `
            <div class="record-info">
              <strong>${f.originalName}</strong>
              <span class="text-muted" style="font-size:0.8rem;">Mime: ${f.mimeType} · Size: ${(f.size/1024).toFixed(2)} KB</span>
              <span class="status-badge status-${f.status.toLowerCase()}" style="width: fit-content; margin-top:0.25rem;">${f.status}</span>
              ${f.metadata ? `<pre style="font-size:0.75rem; background:#131824; padding:0.25rem; border-radius:4px; margin-top:0.25rem;">${JSON.stringify(f.metadata)}</pre>` : ''}
            </div>
            <div class="record-actions">
              <button class="btn btn-danger btn-small" onclick="document.dispatchEvent(new CustomEvent('delete-file', {detail: '${f.id}'}))">Delete</button>
            </div>
          `;
          filesList.appendChild(item);
        });
      }
    } catch (err) {}
  }

  btnFetchFiles.addEventListener('click', fetchFiles);

  document.addEventListener('delete-file', async (e) => {
    try {
      await makeRequest('DELETE', `/v1/files/${e.detail}`);
      fetchFiles();
    } catch (err) {}
  });

  // Advanced Resiliency Testers
  btnTestRateLimit.addEventListener('click', async () => {
    try {
      await makeRequest('GET', '/v1');
    } catch (err) {}
  });

  btnTestIdempotency.addEventListener('click', async () => {
    const key = idemKeyInput.value.trim();
    if (!key) {
      alert("Idempotency key cannot be empty");
      return;
    }

    try {
      // Sending a mutating POST query with the key
      await makeRequest('POST', '/v1/jobs', {
        type: 'notification.send',
        payload: { message: "Idempotency test payload" },
        priority: 5,
        maxAttempts: 3
      }, {
        'Idempotency-Key': key
      });
    } catch (err) {}
  });

  btnTestVersion.addEventListener('click', async () => {
    const acceptVer = reqVersionSelect.value;
    const headers = {};
    if (acceptVer !== 'invalid') {
      headers['X-Accept-Version'] = acceptVer;
    } else {
      headers['X-Accept-Version'] = 'v3';
    }

    try {
      await makeRequest('GET', '/v1', null, headers);
    } catch (err) {}
  });
});
