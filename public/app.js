// State
let lastData = null;
let isRefreshing = false;

// Mobile Sidebar Toggle
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('active');
}

// Close sidebar when nav item clicked on mobile
function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
  }
}

// File browser state
let currentPath = 'memory';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  refreshData();
  browseTo('memory'); // Start in memory folder
  setInterval(refreshData, 10000); // Auto-refresh every 10s
});

// Navigation
function setupNavigation() {
  // Desktop sidebar nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section);
      closeSidebarOnMobile();
    });
  });
  
  // Mobile bottom nav
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section);
    });
  });
}

function switchSection(sectionId) {
  // Update desktop nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });
  
  // Update mobile nav
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });
  
  // Update sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.toggle('active', section.id === `section-${sectionId}`);
  });
  
  // Update title
  const titles = {
    overview: 'Overview',
    agents: 'Agents & Tasks',
    memory: 'Memory & Soul',
    schedule: 'Scheduled Tasks',
    projects: 'Projects',
    activity: 'Activity'
  };
  document.getElementById('page-title').textContent = titles[sectionId] || sectionId;
  
  // Scroll to top on section change
  window.scrollTo(0, 0);
}

// Data fetching
async function refreshData() {
  if (isRefreshing) return;
  
  isRefreshing = true;
  document.body.classList.add('refreshing');
  
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    lastData = data;
    
    console.log('API data received:', { cronJobs: data.cronJobs?.length });
    
    updateUI(data);
    updateLastUpdate();
  } catch (error) {
    console.error('Error fetching data:', error);
    document.getElementById('connection-status').innerHTML = 
      '<span class="status-dot" style="background: var(--error)"></span><span>Disconnected</span>';
  } finally {
    isRefreshing = false;
    document.body.classList.remove('refreshing');
  }
}

function updateLastUpdate() {
  const now = new Date();
  document.getElementById('last-update').textContent = formatTime(now);
}

// Categorize sessions into main, subagents, cron, voice
function categorizeAgents(sessions) {
  if (!sessions) return { main: null, subagents: [], cron: [], voice: [] };
  
  const result = { main: null, subagents: [], cron: [], voice: [] };
  
  for (const session of sessions) {
    const key = session.key || '';
    if (key.includes(':main:main')) {
      result.main = session;
    } else if (key.includes(':subagent:') || key.includes(':spawn:')) {
      result.subagents.push(session);
    } else if (key.includes(':cron:')) {
      result.cron.push(session);
    } else if (key.includes(':voice:')) {
      result.voice.push(session);
    }
  }
  
  // Sort by most recent
  result.subagents.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  result.cron.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  
  return result;
}

// UI Updates
function updateUI(data) {
  // Categorize sessions
  const categorized = categorizeAgents(data.sessions);
  
  // Overview stats (only if elements exist)
  const ageEl = document.getElementById('stat-age');
  const sessionsEl = document.getElementById('stat-sessions');
  const cronEl = document.getElementById('stat-cron');
  
  if (ageEl) ageEl.textContent = data.overview?.age || '--';
  if (sessionsEl) sessionsEl.textContent = categorized.subagents.length || 0;
  if (cronEl) cronEl.textContent = data.cronJobs?.length || 0;
  
  // Overview cards
  updateRunningTasks(data.runningTasks);
  updateOverviewAgents(categorized);
  updateOverviewCron(data.cronJobs);
  updateOverviewActivity(data.recentActivity);
  
  // Agents page
  updateAgentsPage(categorized);
  
  // Other pages
  updateMemoryFiles(data.memory);
  updateProjects(data.projects);
  updateSystem(data.system);
  updateScheduleList(data.cronJobs);
  updateActivityList(data.recentActivity);
}

function updateRunningTasks(tasks) {
  const container = document.getElementById('overview-running');
  if (!container) return; // Element not on current page
  
  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No active tasks right now</div>';
    return;
  }
  
  const html = tasks.map(task => {
    const icon = task.type === 'subagent' ? '>' : task.type === 'cron' ? '⏰' : '🔄';
    const statusClass = task.status === 'running' ? 'running' : 'recent';
    
    return `
      <div class="list-item running-item ${statusClass}">
        <div class="list-icon">${icon}</div>
        <div class="list-content">
          <div class="list-title">${escapeHtml(task.name)}</div>
          <div class="list-subtitle">${task.type} • ${task.status}</div>
        </div>
        <div class="list-meta">${task.startedAt ? formatRelativeTime(task.startedAt) : 'now'}</div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function updateOverviewAgents(categorized) {
  const container = document.getElementById('overview-agents');
  if (!container) return; // Element not on current page
  
  const items = [];
  
  // Main agent always first
  if (categorized.main) {
    items.push(`
      <div class="list-item session-item">
        <div class="list-icon">🧠</div>
        <div class="list-content">
          <div class="list-title">Nix (Main)</div>
          <div class="list-subtitle">${categorized.main.channel || 'signal'} • ${formatTokens(categorized.main.totalTokens)} tokens</div>
        </div>
        <div class="list-meta">${formatRelativeTime(categorized.main.updatedAt)}</div>
      </div>
    `);
  }
  
  // Active sub-agents
  for (const agent of categorized.subagents.slice(0, 2)) {
    const isActive = (Date.now() - (agent.updatedAt || 0)) < 300000; // Active in last 5 min
    items.push(`
      <div class="list-item session-item ${isActive ? '' : 'inactive'}">
        <div class="list-icon">⚡</div>
        <div class="list-content">
          <div class="list-title">${escapeHtml(agent.label || 'Sub-agent')}</div>
          <div class="list-subtitle">${isActive ? '🟢 Running' : '⚪ Completed'}</div>
        </div>
        <div class="list-meta">${formatRelativeTime(agent.updatedAt)}</div>
      </div>
    `);
  }
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No active agents</div>';
  } else {
    container.innerHTML = items.join('');
  }
}

// Update the full Agents page
function updateAgentsPage(categorized) {
  // Main agent card
  const mainContainer = document.getElementById('agent-main');
  if (!mainContainer) return; // Element not on current page
  
  if (categorized.main) {
    const m = categorized.main;
    mainContainer.innerHTML = `
      <div class="agent-detail">
        <div class="agent-stat-row">
          <span class="agent-label">Status</span>
          <span class="agent-value" style="color: var(--success)">🟢 Online</span>
        </div>
        <div class="agent-stat-row">
          <span class="agent-label">Channel</span>
          <span class="agent-value">${m.channel || 'signal'}</span>
        </div>
        <div class="agent-stat-row">
          <span class="agent-label">Model</span>
          <span class="agent-value">${m.model || 'default'}</span>
        </div>
        <div class="agent-stat-row">
          <span class="agent-label">Session Tokens</span>
          <span class="agent-value">${formatTokens(m.totalTokens)}</span>
        </div>
        <div class="agent-stat-row">
          <span class="agent-label">Last Active</span>
          <span class="agent-value">${formatRelativeTime(m.updatedAt)}</span>
        </div>
      </div>
    `;
  } else {
    mainContainer.innerHTML = '<div class="empty-state">Main agent not found</div>';
  }
  
  // Sub-agents card
  const subContainer = document.getElementById('agent-subagents');
  if (categorized.subagents.length > 0) {
    subContainer.innerHTML = categorized.subagents.map(agent => {
      const isActive = (Date.now() - (agent.updatedAt || 0)) < 300000;
      return `
        <div class="list-item session-item ${isActive ? '' : 'inactive'}">
          <div class="list-icon">${isActive ? '>' : '+'}</div>
          <div class="list-content">
            <div class="list-title">${escapeHtml(agent.label || agent.key?.split(':').pop() || 'Sub-agent')}</div>
            <div class="list-subtitle">
              ${isActive ? '🟢 Running' : '⚪ Completed'} • 
              ${formatTokens(agent.totalTokens)} tokens
            </div>
          </div>
          <div class="list-meta">${formatRelativeTime(agent.updatedAt)}</div>
        </div>
      `;
    }).join('');
  } else {
    subContainer.innerHTML = '<div class="empty-state">No sub-agents spawned yet.<br><small>Sub-agents appear when tasks are delegated.</small></div>';
  }
  
  // Cron runs card
  const cronContainer = document.getElementById('agent-cron-runs');
  if (categorized.cron.length > 0) {
    cronContainer.innerHTML = categorized.cron.map(run => `
      <div class="list-item">
        <div class="list-icon">⏰</div>
        <div class="list-content">
          <div class="list-title">${escapeHtml(run.key?.split(':').pop()?.slice(0, 8) || 'Cron task')}...</div>
          <div class="list-subtitle">${formatTokens(run.totalTokens)} tokens used</div>
        </div>
        <div class="list-meta">${formatRelativeTime(run.updatedAt)}</div>
      </div>
    `).join('');
  } else {
    cronContainer.innerHTML = '<div class="empty-state">No cron runs recorded yet</div>';
  }
}

function formatTokens(tokens) {
  if (!tokens) return '0';
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
  if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
  return tokens.toString();
}

function updateOverviewCron(jobs) {
  const container = document.getElementById('overview-cron');
  if (!container) return; // Element not on current page
  
  if (!jobs || jobs.length === 0) {
    container.innerHTML = '<div class="empty-state">No scheduled tasks</div>';
    return;
  }
  
  // Sort by next run time
  const sorted = [...jobs].sort((a, b) => 
    (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0)
  );
  
  const html = sorted.slice(0, 4).map(job => `
    <div class="list-item cron-item">
      <div class="list-icon">⏰</div>
      <div class="list-content">
        <div class="list-title">${escapeHtml(job.name)}</div>
        <div class="list-subtitle">${job.enabled ? 'Enabled' : 'Disabled'}</div>
      </div>
      <div class="list-meta">${formatNextRun(job.state?.nextRunAtMs)}</div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function updateOverviewActivity(activities) {
  const container = document.getElementById('overview-activity');
  if (!container) return; // Element not on current page
  
  if (!activities || activities.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent activity</div>';
    return;
  }
  
  const html = activities.slice(0, 6).map(activity => `
    <div class="list-item activity-item">
      <div class="list-icon">${activity.icon || '[+]'}</div>
      <div class="list-content">
        <div class="list-title">${escapeHtml(activity.message)}</div>
        <div class="list-subtitle">${activity.hash}</div>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function updateMemoryFiles(files) {
  if (!files || files.length === 0) return;
  
  // Split into soul/identity and daily
  const soulFiles = files.filter(f => 
    ['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md'].includes(f.name)
  );
  const dailyFiles = files.filter(f => 
    !['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md'].includes(f.name)
  );
  
  // Soul files (no delete button)
  const soulContainer = document.getElementById('memory-soul');
  if (soulContainer) {
    soulContainer.innerHTML = soulFiles.map(file => `
      <div class="list-item file-item">
        <div class="list-icon">📄</div>
        <div class="list-content clickable" onclick="viewFile('${file.path}', '${file.name}')">
          <div class="list-title">${file.name}</div>
          <div class="list-subtitle">${formatBytes(file.size)}</div>
        </div>
        <div class="list-meta">${formatDate(file.modified)}</div>
      </div>
    `).join('') || '<div class="empty-state">No files</div>';
  }
  
  // Daily files (read-only)
  const dailyContainer = document.getElementById('memory-daily');
  if (dailyContainer) {
    dailyContainer.innerHTML = dailyFiles.map(file => `
      <div class="list-item file-item clickable" onclick="viewFile('${file.path}', '${file.name}')">
        <div class="list-icon">📝</div>
        <div class="list-content">
          <div class="list-title">${file.name}</div>
          <div class="list-subtitle">${formatBytes(file.size)}</div>
        </div>
        <div class="list-meta">${formatDate(file.modified)}</div>
      </div>
    `).join('') || '<div class="empty-state">No daily files</div>';
  }
}

function updateProjects(projects) {
  // Memory section projects (legacy)
  const memoryContainer = document.getElementById('memory-projects');
  if (memoryContainer) {
    if (!projects || projects.length === 0) {
      memoryContainer.innerHTML = '<div class="empty-state">No projects</div>';
    } else {
      memoryContainer.innerHTML = projects.map(project => `
        <div class="list-item">
          <div class="list-icon">${project.icon || '📁'}</div>
          <div class="list-content">
            <div class="list-title">${escapeHtml(project.name)}</div>
            <div class="list-subtitle">${project.description || project.path || ''}</div>
          </div>
          <div class="list-meta">${project.status}</div>
        </div>
      `).join('');
    }
  }
  
  // Projects page - Ideas
  const ideasContainer = document.getElementById('projects-ideas');
  if (ideasContainer) {
    const ideas = (projects || []).filter(p => p.status === 'idea');
    if (ideas.length === 0) {
      ideasContainer.innerHTML = '<div class="empty-state">No ideas yet</div>';
    } else {
      ideasContainer.innerHTML = ideas.map(project => `
        <div class="list-item project-item idea">
          <div class="list-icon">${project.icon || '💡'}</div>
          <div class="list-content">
            <div class="list-title">${escapeHtml(project.name)}</div>
            <div class="list-subtitle">${escapeHtml(project.description || '')}</div>
            <div class="list-meta">${project.tech ? project.tech.join(', ') : ''}</div>
          </div>
        </div>
      `).join('');
    }
  }
  
  // Projects page - Needs Review
  const reviewContainer = document.getElementById('projects-review');
  if (reviewContainer) {
    const needsReview = (projects || []).filter(p => p.status === 'needs-review');
    if (needsReview.length === 0) {
      reviewContainer.innerHTML = '<div class="empty-state">All caught up! 🎉</div>';
    } else {
      reviewContainer.innerHTML = needsReview.map(project => `
        <div class="list-item project-item needs-review">
          <div class="list-icon">${project.icon || '📁'}</div>
          <div class="list-content">
            <div class="list-title">${escapeHtml(project.name)}</div>
            <div class="list-subtitle">${escapeHtml(project.description || '')}</div>
            <div class="list-meta">${project.tech ? project.tech.join(', ') : ''}</div>
          </div>
          ${project.url ? `<a href="${project.url}" target="_blank" class="btn btn-small">Open →</a>` : ''}
        </div>
      `).join('');
    }
  }
  
  // Projects page - Active
  const activeContainer = document.getElementById('projects-active');
  if (activeContainer) {
    const active = (projects || []).filter(p => p.status === 'active');
    if (active.length === 0) {
      activeContainer.innerHTML = '<div class="empty-state">No active projects</div>';
    } else {
      activeContainer.innerHTML = active.map(project => `
        <div class="list-item project-item active">
          <div class="list-icon">${project.icon || '📁'}</div>
          <div class="list-content">
            <div class="list-title">${escapeHtml(project.name)}</div>
            <div class="list-subtitle">${escapeHtml(project.description || '')}</div>
            <div class="list-meta">${project.tech ? project.tech.join(', ') : ''}</div>
          </div>
          ${project.url ? `<a href="${project.url}" target="_blank" class="btn btn-small">Open →</a>` : ''}
        </div>
      `).join('');
    }
  }
}

function updateSystem(system) {
  const container = document.getElementById('memory-system');
  if (!container) return; // Element not on current page
  
  if (!system) {
    container.innerHTML = '<div class="empty-state">No system info</div>';
    return;
  }
  
  const gitClass = system.gitStatus === 'clean' ? 'clean' : 'dirty';
  
  const html = `
    <div class="system-row">
      <span class="system-label">Workspace</span>
      <span class="system-value">${system.workspace}</span>
    </div>
    <div class="system-row">
      <span class="system-label">Git Status</span>
      <span class="system-value ${gitClass}">${system.gitStatus}</span>
    </div>
    <div class="system-row">
      <span class="system-label">Disk Usage</span>
      <span class="system-value">${system.diskUsage}</span>
    </div>
    ${system.lastBackup ? `
    <div class="system-row">
      <span class="system-label">Last Backup</span>
      <span class="system-value">${system.lastBackup}</span>
    </div>
    ` : ''}
  `;
  
  container.innerHTML = html;
}

// Store jobs for detail view
let storedJobs = {};

function updateScheduleList(jobs) {
  const container = document.getElementById('schedule-list');
  
  console.log('updateScheduleList called with:', jobs);
  
  if (!jobs || jobs.length === 0) {
    console.log('No jobs found');
    container.innerHTML = '<div class="empty-state">No scheduled tasks</div>';
    return;
  }
  
  // Store for detail view
  jobs.forEach(job => { storedJobs[job.id] = job; });
  
  // Group by time of day
  const groups = {
    morning: { label: '🌅 Morning (6am-12pm)', jobs: [] },
    afternoon: { label: '☀️ Afternoon (12pm-5pm)', jobs: [] },
    evening: { label: '🌆 Evening (5pm-10pm)', jobs: [] },
    night: { label: '🌙 Night (10pm-6am)', jobs: [] }
  };
  
  jobs.forEach(job => {
    if (!job.enabled) return; // Skip disabled jobs
    
    // Extract hour from cron expression
    const expr = job.schedule?.expr || '';
    const parts = expr.split(' ');
    const hour = parts[1] ? parseInt(parts[1]) : null;
    
    if (hour === null) {
      groups.morning.jobs.push(job); // Default to morning
      return;
    }
    
    // Convert to ET if timezone is UTC
    let hourET = hour;
    if (job.schedule?.tz === 'UTC') {
      hourET = (hour - 5 + 24) % 24; // Rough ET conversion
    } else if (job.schedule?.tz === 'America/Toronto') {
      hourET = hour;
    }
    
    if (hourET >= 6 && hourET < 12) groups.morning.jobs.push(job);
    else if (hourET >= 12 && hourET < 17) groups.afternoon.jobs.push(job);
    else if (hourET >= 17 && hourET < 22) groups.evening.jobs.push(job);
    else groups.night.jobs.push(job);
  });
  
  let html = '';
  
  for (const [key, group] of Object.entries(groups)) {
    if (group.jobs.length === 0) continue;
    
    // Sort jobs by next run time within group
    group.jobs.sort((a, b) => 
      (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0)
    );
    
    html += `
      <div class="schedule-group">
        <div class="schedule-group-header">${group.label}</div>
        <div class="schedule-group-items">
    `;
    
    group.jobs.forEach(job => {
      const lastRun = job.state?.lastRunAtMs ? formatRelativeTime(job.state.lastRunAtMs) : 'Never';
      const schedule = formatSchedule(job.schedule);
      const nextRun = formatNextRun(job.state?.nextRunAtMs);
      
      // Get task icon and output file based on name/type
      let icon = '[*]';
      let outputFile = null;
      let outputLabel = null;
      
      if (job.name.includes('meditation')) {
        icon = '[~]';
        outputFile = 'memory/meditation-log.md';
        outputLabel = 'View log';
      } else if (job.name.includes('morning-pages')) {
        icon = '[=]';
        const today = new Date().toISOString().split('T')[0];
        outputFile = `memory/morning-pages/${today}.md`;
        outputLabel = 'Read today';
      } else if (job.name.includes('inbox')) {
        icon = '[@]';
      } else if (job.name.includes('security')) {
        icon = '[#]';
      } else if (job.name.includes('backup')) {
        icon = '[+]';
      } else if (job.name.includes('news') || job.name.includes('brief')) {
        icon = '[i]';
      } else if (job.name.includes('python')) {
        icon = '[>]';
        outputFile = 'skills/python-daily/log.md';
        outputLabel = 'View log';
      } else if (job.name.includes('phrase')) {
        icon = '[?]';
      } else if (job.name.includes('reminder')) {
        icon = '[!]';
      } else if (job.name.includes('wellness')) {
        icon = '[+]';
      }
      
      // Determine status indicator
      let statusIndicator = '';
      const timeSinceRun = Date.now() - (job.state?.lastRunAtMs || 0);
      const isToday = timeSinceRun < 24 * 60 * 60 * 1000;
      
      if (job.state?.lastRunStatus === 'ok' && isToday) {
        statusIndicator = '<span style="color: #10b981; margin-left: 8px;">✓</span>';
      } else if (job.state?.lastRunStatus === 'error') {
        statusIndicator = '<span style="color: #ef4444; margin-left: 8px;">✗</span>';
      }
      
      // Build output link if applicable
      let outputLink = '';
      if (outputFile && job.state?.lastRunStatus === 'ok' && isToday) {
        outputLink = ` · <a href="#" onclick="event.stopPropagation(); viewFile('${outputFile}'); return false;" style="color: #8b5cf6; text-decoration: none; font-size: 12px;">${outputLabel}</a>`;
      }
      
      html += `
        <div class="schedule-item clickable" onclick="viewTask('${job.id}')">
          <div class="schedule-time">
            <div class="schedule-icon">${icon}</div>
            <div class="schedule-time-text">${schedule}</div>
          </div>
          <div class="schedule-details">
            <div class="schedule-name">${escapeHtml(job.name)}${statusIndicator}</div>
            <div class="schedule-meta">
              <span class="schedule-next">Next: ${nextRun}</span>
              <span class="schedule-last">Last: ${lastRun}${outputLink}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function updateActivityList(activities) {
  const container = document.getElementById('activity-list');
  if (!container) return; // Element not on current page
  
  if (!activities || activities.length === 0) {
    container.innerHTML = '<div class="empty-state">No activity</div>';
    return;
  }
  
  const html = activities.map(activity => `
    <div class="list-item activity-item">
      <div class="list-icon">${activity.icon || '[+]'}</div>
      <div class="list-content">
        <div class="list-title">${escapeHtml(activity.message)}</div>
        <div class="list-subtitle">Commit: ${activity.hash}</div>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

// View scheduled task details
function viewTask(jobId) {
  const job = storedJobs[jobId];
  if (!job) return;
  
  const modal = document.getElementById('modal');
  const title = document.getElementById('modal-title');
  const content = document.getElementById('modal-content');
  
  title.textContent = `⏰ ${job.name}`;
  
  const schedule = formatSchedule(job.schedule);
  const nextRun = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toLocaleString() : 'Not scheduled';
  const lastRun = job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toLocaleString() : 'Never';
  const taskText = job.payload?.text || job.payload?.message || 'No description';
  
  content.innerHTML = `
    <div class="task-detail">
      <div class="task-row">
        <span class="task-label">Status</span>
        <span class="task-value">${job.enabled ? '🟢 Enabled' : '⚪ Disabled'}</span>
      </div>
      <div class="task-row">
        <span class="task-label">Schedule</span>
        <span class="task-value">${schedule}</span>
      </div>
      <div class="task-row">
        <span class="task-label">Cron Expression</span>
        <span class="task-value" style="font-family: monospace">${job.schedule?.expr || 'N/A'}</span>
      </div>
      <div class="task-row">
        <span class="task-label">Timezone</span>
        <span class="task-value">${job.schedule?.tz || 'UTC'}</span>
      </div>
      <div class="task-row">
        <span class="task-label">Next Run</span>
        <span class="task-value">${nextRun}</span>
      </div>
      <div class="task-row">
        <span class="task-label">Last Run</span>
        <span class="task-value">${lastRun}</span>
      </div>
      <div class="task-row">
        <span class="task-label">Last Status</span>
        <span class="task-value">${job.state?.lastStatus || 'N/A'}</span>
      </div>
      <div class="task-row">
        <span class="task-label">Session Target</span>
        <span class="task-value">${job.sessionTarget || 'main'}</span>
      </div>
      <div class="task-section">
        <span class="task-label">Task Description</span>
        <div class="task-text">${escapeHtml(taskText)}</div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
}

async function viewFile(filePath) {
  const modal = document.getElementById('modal');
  const title = document.getElementById('modal-title');
  const content = document.getElementById('modal-content');
  
  title.textContent = `📄 ${filePath.split('/').pop()}`;
  content.innerHTML = '<div class="empty-state">Loading...</div>';
  modal.classList.add('active');
  
  try {
    const response = await fetch(`/api/file/${encodeURIComponent(filePath)}`);
    if (!response.ok) throw new Error('File not found');
    
    const text = await response.text();
    
    // Render as markdown-ish (simple formatting)
    const formatted = escapeHtml(text)
      .replace(/^# (.+)$/gm, '<h2 style="margin: 16px 0 8px; font-size: 18px; font-weight: 600;">$1</h2>')
      .replace(/^## (.+)$/gm, '<h3 style="margin: 12px 0 6px; font-size: 16px; font-weight: 600;">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p style="margin: 8px 0;">')
      .replace(/^- (.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
    
    content.innerHTML = `
      <div style="font-family: monospace; font-size: 13px; line-height: 1.6; max-height: 500px; overflow-y: auto; padding: 12px; background: #f8f9fa; border-radius: 6px;">
        <p style="margin: 8px 0;">${formatted}</p>
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <a href="#" onclick="event.preventDefault(); switchSection('memory'); closeModal(); setTimeout(() => browseFolder('${filePath.split('/').slice(0, -1).join('/')}'), 100);" style="color: #8b5cf6; text-decoration: none;">
          Open in Memory browser →
        </a>
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<div class="empty-state" style="color: #ef4444;">Error loading file: ${error.message}</div>`;
  }
}

// Format cron schedule to human readable
function formatSchedule(schedule) {
  if (!schedule) return 'Unknown';
  const expr = schedule.expr || '';
  
  // Common patterns
  if (expr.match(/^\*\/(\d+) \* \* \* \*$/)) {
    const mins = expr.match(/^\*\/(\d+)/)[1];
    return `Every ${mins} min`;
  }
  if (expr.match(/^0 \*\/(\d+) \* \* \*$/)) {
    const hours = expr.match(/\*\/(\d+)/)[1];
    return `Every ${hours}h`;
  }
  if (expr.match(/^0 (\d+) \* \* \*$/)) {
    const hour = parseInt(expr.match(/^0 (\d+)/)[1]);
    return `Daily at ${hour}:00 UTC`;
  }
  if (expr.match(/^(\d+) (\d+) \* \* \*$/)) {
    const [, min, hour] = expr.match(/^(\d+) (\d+)/);
    return `Daily at ${hour}:${min.padStart(2, '0')} UTC`;
  }
  
  return expr; // Fallback to raw expression
}

// Modal (read-only file viewer)
async function viewFile(filePath, fileName) {
  const modal = document.getElementById('modal');
  const title = document.getElementById('modal-title');
  const content = document.getElementById('modal-content');
  
  title.textContent = fileName;
  content.innerHTML = '<pre class="loading">Loading...</pre>';
  modal.classList.add('active');
  
  try {
    const response = await fetch('/api/file/' + encodeURIComponent(filePath));
    if (!response.ok) throw new Error('Failed to load file');
    const text = await response.text();
    content.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
  } catch (error) {
    content.innerHTML = `<pre>Error loading file: ${error.message}</pre>`;
  }
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// Close modal on ESC or backdrop click
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Helpers
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatUptime(uptime) {
  if (!uptime) return '--';
  // Remove "up " prefix if present
  return uptime.replace(/^up\s+/i, '');
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function formatNextRun(timestamp) {
  if (!timestamp) return 'Not scheduled';
  
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff < 0) return 'Overdue';
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `in ${days}d`;
  if (hours > 0) return `in ${hours}h`;
  if (minutes > 0) return `in ${minutes}m`;
  return 'Soon';
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// File Browser Functions
async function browseTo(folderPath) {
  currentPath = folderPath;
  const container = document.getElementById('file-browser');
  const breadcrumb = document.getElementById('file-breadcrumb');
  
  // Update breadcrumb
  const parts = folderPath ? folderPath.split('/').filter(Boolean) : [];
  let breadcrumbHTML = '<span class="breadcrumb-item clickable" onclick="browseTo(\'\')"">🏠 root</span>';
  let accumulated = '';
  
  for (const part of parts) {
    accumulated += (accumulated ? '/' : '') + part;
    const pathToUse = accumulated;
    breadcrumbHTML += ` / <span class="breadcrumb-item clickable" onclick="browseTo('${pathToUse}')">${part}</span>`;
  }
  
  breadcrumb.innerHTML = breadcrumbHTML;
  
  // Show loading
  container.innerHTML = '<div class="empty-state">Loading...</div>';
  
  try {
    const response = await fetch(`/api/browse?path=${encodeURIComponent(folderPath)}`);
    const items = await response.json();
    
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state">Empty folder</div>';
      return;
    }
    
    // Render items
    container.innerHTML = items.map(item => {
      if (item.type === 'folder') {
        return `
          <div class="list-item file-item clickable" onclick="browseTo('${item.path}')">
            <div class="list-icon">📁</div>
            <div class="list-content">
              <div class="list-title">${escapeHtml(item.name)}</div>
              <div class="list-subtitle">Folder</div>
            </div>
            <div class="list-meta">${formatDate(item.modified)}</div>
          </div>
        `;
      } else {
        return `
          <div class="list-item file-item clickable" onclick="viewFile('${item.path}', '${escapeHtml(item.name)}')">
            <div class="list-icon">📄</div>
            <div class="list-content">
              <div class="list-title">${escapeHtml(item.name)}</div>
              <div class="list-subtitle">${formatBytes(item.size)}</div>
            </div>
            <div class="list-meta">${formatDate(item.modified)}</div>
          </div>
        `;
      }
    }).join('');
    
  } catch (error) {
    container.innerHTML = '<div class="empty-state">Error loading folder</div>';
    console.error('Browse error:', error);
  }
}

// Conversations functionality
async function loadConversations() {
  const container = document.getElementById('conversations-list');
  if (!container) return;
  
  container.innerHTML = '<div class="empty-state">Loading conversations...</div>';

  const channel = document.getElementById('conv-channel-filter')?.value || 'signal';
  const limit = document.getElementById('conv-limit-filter')?.value || 100;

  try {
    const response = await fetch(`/api/conversation?channel=${channel}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to load conversation');
    
    const data = await response.json();
    
    // Update stats
    if (document.getElementById('conv-total')) {
      document.getElementById('conv-total').textContent = data.stats.total;
      document.getElementById('conv-user').textContent = data.stats.user;
      document.getElementById('conv-assistant').textContent = data.stats.assistant;
      document.getElementById('conv-tools').textContent = data.stats.tools;
    }

    // Render messages
    if (data.messages.length === 0) {
      container.innerHTML = '<div class="empty-state">No messages found</div>';
      return;
    }

    container.innerHTML = data.messages.map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      if (msg.role === 'user') {
        // Clean up user content - extract actual message after metadata
        let content = msg.content || '';
        
        // Check if it's a voice message
        const isVoice = content.includes('[media attached:') && content.includes('.aac');
        
        // Remove everything up to and including the last ```json block
        const parts = content.split('```');
        if (parts.length > 2) {
          // Get everything after the last ``` block
          content = parts[parts.length - 1].trim();
        }
        
        // Remove the <media:audio> tag
        content = content.replace(/<media:audio>/g, '');
        content = content.trim();
        
        // If still empty or just metadata, skip
        if (!content || content.length < 3) {
          return isVoice ? `
            <div style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
              <div style="max-width: 70%; background: #28a745; color: white; padding: 12px 16px; border-radius: 18px; border-bottom-right-radius: 4px;">
                <div style="font-weight: 600; margin-bottom: 4px; font-size: 13px; opacity: 0.9;">Mei</div>
                <div style="line-height: 1.5; white-space: pre-wrap;">🎤 Voice message</div>
                <div style="font-size: 11px; opacity: 0.7; margin-top: 6px; text-align: right;">${timestamp}</div>
              </div>
            </div>
          ` : '';
        }
        
        return `
          <div style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
            <div style="max-width: 70%; background: #28a745; color: white; padding: 12px 16px; border-radius: 18px; border-bottom-right-radius: 4px;">
              <div style="font-weight: 600; margin-bottom: 4px; font-size: 13px; opacity: 0.9;">Mei</div>
              <div style="line-height: 1.5; white-space: pre-wrap;">${escapeHtml(content)}</div>
              <div style="font-size: 11px; opacity: 0.7; margin-top: 6px; text-align: right;">${timestamp}</div>
            </div>
          </div>
        `;
      } else if (msg.role === 'assistant') {
        const content = escapeHtml(msg.content || '');
        if (!content.trim()) return ''; // Skip empty assistant messages
        return `
          <div style="margin-bottom: 20px; display: flex; justify-content: flex-start;">
            <div style="max-width: 70%; background: #667eea; color: white; padding: 12px 16px; border-radius: 18px; border-bottom-left-radius: 4px;">
              <div style="font-weight: 600; margin-bottom: 4px; font-size: 13px; opacity: 0.9;">Nix ✨</div>
              <div style="line-height: 1.5; white-space: pre-wrap;">${content}</div>
              <div style="font-size: 11px; opacity: 0.7; margin-top: 6px;">${timestamp}</div>
            </div>
          </div>
        `;
      } else if (msg.role === 'tool') {
        // Parse tool arguments to make them human-readable
        let toolDesc = '';
        try {
          const args = JSON.parse(msg.content);
          const toolName = msg.toolName || 'tool';
          
          if (toolName === 'exec') {
            toolDesc = `Running: <code>${escapeHtml(args.command || '')}</code>`;
          } else if (toolName === 'read' || toolName === 'Read') {
            toolDesc = `Reading file: <code>${escapeHtml(args.path || args.file_path || '')}</code>`;
          } else if (toolName === 'write' || toolName === 'Write') {
            toolDesc = `Writing file: <code>${escapeHtml(args.path || args.file_path || '')}</code>`;
          } else if (toolName === 'edit' || toolName === 'Edit') {
            toolDesc = `Editing: <code>${escapeHtml(args.path || args.file_path || '')}</code>`;
          } else if (toolName === 'browser') {
            toolDesc = `Browser action: ${escapeHtml(args.action || '')}`;
          } else if (toolName === 'message') {
            toolDesc = `Messaging: ${escapeHtml(args.action || '')}`;
          } else if (toolName === 'tts') {
            toolDesc = `🔊 Generating voice reply`;
          } else {
            // Fallback: show tool name and first argument
            const firstKey = Object.keys(args)[0];
            const firstVal = args[firstKey];
            if (typeof firstVal === 'string' && firstVal.length < 100) {
              toolDesc = `${toolName}: ${escapeHtml(firstVal)}`;
            } else {
              toolDesc = toolName;
            }
          }
        } catch (e) {
          toolDesc = escapeHtml(msg.toolName || 'tool');
        }
        
        return `
          <div style="margin: 4px 0 4px 40px; padding: 8px 12px; background: #f8f9fa; border-left: 2px solid #dee2e6; border-radius: 4px; font-size: 11px; color: #6c757d;">
            <span style="opacity: 0.7;">🔧</span> ${toolDesc}
          </div>
        `;
      }
    }).filter(Boolean).join('');

  } catch (error) {
    container.innerHTML = `<div class="empty-state">Error loading conversation: ${error.message}</div>`;
    console.error('Conversation load error:', error);
  }
}

// Auto-load conversations when switching to that section
const originalSwitchSection = switchSection;
switchSection = function(section) {
  originalSwitchSection(section);
  if (section === 'conversations') {
    loadConversations();
  }
};
