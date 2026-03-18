(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  var REFRESH_INTERVAL_MS = 10000;
  var ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;

  var SECTION_TITLES = {
    overview: 'Overview',
    agents: 'Agents & Tasks',
    memory: 'Memory & Soul',
    schedule: 'Scheduled Tasks',
    projects: 'Projects',
    activity: 'Activity',
    conversations: 'Conversations',
  };

  var CORE_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md'];

  var JOB_ICON_MAP = {
    meditation: '[~]',
    'morning-pages': '[=]',
    inbox: '[@]',
    security: '[#]',
    backup: '[+]',
    news: '[i]',
    brief: '[i]',
    python: '[>]',
    phrase: '[?]',
    reminder: '[!]',
    wellness: '[+]',
  };

  var JOB_OUTPUT_MAP = [
    { match: 'meditation', file: 'memory/meditation-log.md', label: 'View log' },
    {
      match: 'morning-pages',
      file: function () {
        return 'memory/morning-pages/' + new Date().toISOString().split('T')[0] + '.md';
      },
      label: 'Read today',
    },
    { match: 'python', file: 'skills/python-daily/log.md', label: 'View log' },
  ];

  var TOOL_RENDERERS = {
    exec: function (a) { return 'Running: <code>' + esc(a.command || '') + '</code>'; },
    read: function (a) { return 'Reading: <code>' + esc(a.path || a.file_path || '') + '</code>'; },
    Read: function (a) { return 'Reading: <code>' + esc(a.path || a.file_path || '') + '</code>'; },
    write: function (a) { return 'Writing: <code>' + esc(a.path || a.file_path || '') + '</code>'; },
    Write: function (a) { return 'Writing: <code>' + esc(a.path || a.file_path || '') + '</code>'; },
    edit: function (a) { return 'Editing: <code>' + esc(a.path || a.file_path || '') + '</code>'; },
    Edit: function (a) { return 'Editing: <code>' + esc(a.path || a.file_path || '') + '</code>'; },
    browser: function (a) { return 'Browser: ' + esc(a.action || ''); },
    message: function (a) { return 'Messaging: ' + esc(a.action || ''); },
    tts: function () { return '🔊 Generating voice reply'; },
  };

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  var state = {
    lastData: null,
    isRefreshing: false,
    currentPath: 'memory',
    storedJobs: {},
  };

  // -------------------------------------------------------------------------
  // DOM helpers
  // -------------------------------------------------------------------------

  function $(id) {
    return document.getElementById(id);
  }

  function setHTML(id, html) {
    var el = $(id);
    if (el) el.innerHTML = html;
  }

  // -------------------------------------------------------------------------
  // Template helpers
  // -------------------------------------------------------------------------

  function listItem(icon, title, subtitle, meta, opts) {
    opts = opts || {};
    var cls = (opts.onclick ? ' clickable' : '') + (opts.classes ? ' ' + opts.classes : '');
    var click = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
    return (
      '<div class="list-item' + cls + '"' + click + '>' +
        '<div class="list-icon">' + icon + '</div>' +
        '<div class="list-content">' +
          '<div class="list-title">' + title + '</div>' +
          (subtitle ? '<div class="list-subtitle">' + subtitle + '</div>' : '') +
        '</div>' +
        (meta ? '<div class="list-meta">' + meta + '</div>' : '') +
      '</div>'
    );
  }

  function emptyState(msg) {
    return '<div class="empty-state">' + msg + '</div>';
  }

  function detailRow(label, value) {
    return (
      '<div class="task-row">' +
        '<span class="task-label">' + label + '</span>' +
        '<span class="task-value">' + value + '</span>' +
      '</div>'
    );
  }

  // -------------------------------------------------------------------------
  // Formatting utilities
  // -------------------------------------------------------------------------

  var _escDiv = document.createElement('div');
  function esc(text) {
    if (!text) return '';
    _escDiv.textContent = text;
    return _escDiv.innerHTML;
  }
  var escapeHtml = esc;

  function formatTokens(tokens) {
    if (!tokens) return '0';
    if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
    if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
    return String(tokens);
  }

  function formatRelativeTime(ts) {
    if (!ts) return 'Unknown';
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    var h = Math.floor(m / 60);
    var d = Math.floor(h / 24);
    if (d > 0) return d + 'd ago';
    if (h > 0) return h + 'h ago';
    if (m > 0) return m + 'm ago';
    return 'Just now';
  }

  function formatNextRun(ts) {
    if (!ts) return 'Not scheduled';
    var diff = ts - Date.now();
    if (diff < 0) return 'Overdue';
    var m = Math.floor(diff / 60000);
    var h = Math.floor(m / 60);
    var d = Math.floor(h / 24);
    if (d > 0) return 'in ' + d + 'd';
    if (h > 0) return 'in ' + h + 'h';
    if (m > 0) return 'in ' + m + 'm';
    return 'Soon';
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDate(iso) {
    if (!iso) return 'Unknown';
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function formatSchedule(sched) {
    if (!sched) return 'Unknown';
    var expr = sched.expr || '';
    var m;

    m = expr.match(/^\*\/(\d+) \* \* \* \*$/);
    if (m) return 'Every ' + m[1] + ' min';

    m = expr.match(/^0 \*\/(\d+) \* \* \*$/);
    if (m) return 'Every ' + m[1] + 'h';

    m = expr.match(/^0 (\d+) \* \* \*$/);
    if (m) return 'Daily at ' + m[1] + ':00 UTC';

    m = expr.match(/^(\d+) (\d+) \* \* \*$/);
    if (m) return 'Daily at ' + m[2] + ':' + m[1].padStart(2, '0') + ' UTC';

    return expr;
  }

  function isAgentActive(agent) {
    return (Date.now() - (agent.updatedAt || 0)) < ACTIVE_THRESHOLD_MS;
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        switchSection(item.dataset.section);
        closeSidebarOnMobile();
      });
    });

    document.querySelectorAll('.mobile-nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        switchSection(item.dataset.section);
      });
    });
  }

  function switchSection(sectionId) {
    if (!sectionId) return;

    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });
    document.querySelectorAll('.section').forEach(function (section) {
      section.classList.toggle('active', section.id === 'section-' + sectionId);
    });

    $('page-title').textContent = SECTION_TITLES[sectionId] || sectionId;
    window.scrollTo(0, 0);

    if (sectionId === 'conversations') loadConversations();
  }

  function toggleSidebar() {
    $('sidebar').classList.toggle('open');
    $('sidebar-backdrop').classList.toggle('active');
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      $('sidebar').classList.remove('open');
      $('sidebar-backdrop').classList.remove('active');
    }
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  function refreshData() {
    if (state.isRefreshing) return;
    state.isRefreshing = true;
    document.body.classList.add('refreshing');

    fetch('/api/status')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.lastData = data;
        updateUI(data);
        $('last-update').textContent = formatTime(new Date());
      })
      .catch(function () {
        setHTML(
          'connection-status',
          '<span class="status-dot" style="background: var(--error)"></span><span>Disconnected</span>',
        );
      })
      .finally(function () {
        state.isRefreshing = false;
        document.body.classList.remove('refreshing');
      });
  }

  // -------------------------------------------------------------------------
  // Session categorisation
  // -------------------------------------------------------------------------

  function categorizeAgents(sessions) {
    var result = { main: null, subagents: [], cron: [], voice: [] };
    if (!sessions) return result;

    sessions.forEach(function (session) {
      var key = session.key || '';
      if (key.includes(':main:main')) result.main = session;
      else if (key.includes(':subagent:') || key.includes(':spawn:')) result.subagents.push(session);
      else if (key.includes(':cron:')) result.cron.push(session);
      else if (key.includes(':voice:')) result.voice.push(session);
    });

    result.subagents.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    result.cron.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return result;
  }

  // -------------------------------------------------------------------------
  // UI update – dispatcher
  // -------------------------------------------------------------------------

  function updateUI(data) {
    var cat = categorizeAgents(data.sessions);

    var ageEl = $('stat-age');
    var sessEl = $('stat-sessions');
    var cronEl = $('stat-cron');
    if (ageEl) ageEl.textContent = data.overview?.age || '--';
    if (sessEl) sessEl.textContent = cat.subagents.length || 0;
    if (cronEl) cronEl.textContent = data.cronJobs?.length || 0;

    updateRunningTasks(data.runningTasks);
    updateOverviewAgents(cat);
    updateOverviewCron(data.cronJobs);
    updateOverviewActivity(data.recentActivity);
    updateAgentsPage(cat);
    updateMemoryFiles(data.memory);
    updateProjects(data.projects);
    updateSystem(data.system);
    updateScheduleList(data.cronJobs);
    updateActivityList(data.recentActivity);
  }

  // -------------------------------------------------------------------------
  // UI – Overview section
  // -------------------------------------------------------------------------

  function updateRunningTasks(tasks) {
    var el = $('overview-running');
    if (!el) return;

    if (!tasks || !tasks.length) {
      el.innerHTML = emptyState('No active tasks right now');
      return;
    }

    el.innerHTML = tasks.map(function (t) {
      var icon = t.type === 'subagent' ? '>' : t.type === 'cron' ? '⏰' : '🔄';
      return listItem(
        icon,
        esc(t.name),
        t.type + ' • ' + t.status,
        t.startedAt ? formatRelativeTime(t.startedAt) : 'now',
        { classes: 'running-item ' + (t.status === 'running' ? 'running' : 'recent') },
      );
    }).join('');
  }

  function updateOverviewAgents(cat) {
    var el = $('overview-agents');
    if (!el) return;

    var items = [];

    if (cat.main) {
      items.push(listItem(
        '🧠',
        'Nix (Main)',
        (cat.main.channel || 'signal') + ' • ' + formatTokens(cat.main.totalTokens) + ' tokens',
        formatRelativeTime(cat.main.updatedAt),
        { classes: 'session-item' },
      ));
    }

    cat.subagents.slice(0, 2).forEach(function (agent) {
      var active = isAgentActive(agent);
      items.push(listItem(
        '⚡',
        esc(agent.label || 'Sub-agent'),
        active ? '🟢 Running' : '⚪ Completed',
        formatRelativeTime(agent.updatedAt),
        { classes: 'session-item' + (active ? '' : ' inactive') },
      ));
    });

    el.innerHTML = items.length ? items.join('') : emptyState('No active agents');
  }

  function updateOverviewCron(jobs) {
    var el = $('overview-cron');
    if (!el) return;

    if (!jobs || !jobs.length) {
      el.innerHTML = emptyState('No scheduled tasks');
      return;
    }

    var sorted = jobs.slice().sort(function (a, b) {
      return (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0);
    });

    el.innerHTML = sorted.slice(0, 4).map(function (job) {
      return listItem(
        '⏰',
        esc(job.name),
        job.enabled ? 'Enabled' : 'Disabled',
        formatNextRun(job.state?.nextRunAtMs),
        { classes: 'cron-item' },
      );
    }).join('');
  }

  function updateOverviewActivity(activities) {
    var el = $('overview-activity');
    if (!el) return;

    if (!activities || !activities.length) {
      el.innerHTML = emptyState('No recent activity');
      return;
    }

    el.innerHTML = activities.slice(0, 6).map(function (a) {
      return listItem(a.icon || '[+]', esc(a.message), a.hash);
    }).join('');
  }

  // -------------------------------------------------------------------------
  // UI – Agents page
  // -------------------------------------------------------------------------

  function updateAgentsPage(cat) {
    var mainEl = $('agent-main');
    if (!mainEl) return;

    if (cat.main) {
      var m = cat.main;
      mainEl.innerHTML =
        '<div class="agent-detail">' +
          detailRow('Status', '<span style="color: var(--success)">🟢 Online</span>') +
          detailRow('Channel', m.channel || 'signal') +
          detailRow('Model', m.model || 'default') +
          detailRow('Session Tokens', formatTokens(m.totalTokens)) +
          detailRow('Last Active', formatRelativeTime(m.updatedAt)) +
        '</div>';
    } else {
      mainEl.innerHTML = emptyState('Main agent not found');
    }

    var subEl = $('agent-subagents');
    if (cat.subagents.length) {
      subEl.innerHTML = cat.subagents.map(function (agent) {
        var active = isAgentActive(agent);
        return listItem(
          active ? '>' : '+',
          esc(agent.label || agent.key?.split(':').pop() || 'Sub-agent'),
          (active ? '🟢 Running' : '⚪ Completed') + ' • ' + formatTokens(agent.totalTokens) + ' tokens',
          formatRelativeTime(agent.updatedAt),
          { classes: 'session-item' + (active ? '' : ' inactive') },
        );
      }).join('');
    } else {
      subEl.innerHTML = emptyState('No sub-agents spawned yet.<br><small>Sub-agents appear when tasks are delegated.</small>');
    }

    var cronEl = $('agent-cron-runs');
    if (cat.cron.length) {
      cronEl.innerHTML = cat.cron.map(function (run) {
        return listItem(
          '⏰',
          esc(run.key?.split(':').pop()?.slice(0, 8) || 'Cron task') + '...',
          formatTokens(run.totalTokens) + ' tokens used',
          formatRelativeTime(run.updatedAt),
        );
      }).join('');
    } else {
      cronEl.innerHTML = emptyState('No cron runs recorded yet');
    }
  }

  // -------------------------------------------------------------------------
  // UI – Memory & System
  // -------------------------------------------------------------------------

  function updateMemoryFiles(files) {
    if (!files || !files.length) return;

    var soulFiles = files.filter(function (f) { return CORE_FILES.includes(f.name); });
    var dailyFiles = files.filter(function (f) { return !CORE_FILES.includes(f.name); });

    var soulEl = $('memory-soul');
    if (soulEl) {
      soulEl.innerHTML = soulFiles.map(function (f) {
        return listItem(
          '📄',
          f.name,
          formatBytes(f.size),
          formatDate(f.modified),
          { onclick: "viewFile('" + f.path + "', '" + f.name + "')" },
        );
      }).join('') || emptyState('No files');
    }

    var dailyEl = $('memory-daily');
    if (dailyEl) {
      dailyEl.innerHTML = dailyFiles.map(function (f) {
        return listItem(
          '📝',
          f.name,
          formatBytes(f.size),
          formatDate(f.modified),
          { onclick: "viewFile('" + f.path + "', '" + f.name + "')" },
        );
      }).join('') || emptyState('No daily files');
    }
  }

  function updateSystem(system) {
    var el = $('memory-system');
    if (!el) return;

    if (!system) {
      el.innerHTML = emptyState('No system info');
      return;
    }

    var gitClass = system.gitStatus === 'clean' ? 'clean' : 'dirty';
    el.innerHTML =
      '<div class="system-row">' +
        '<span class="system-label">Workspace</span>' +
        '<span class="system-value">' + system.workspace + '</span>' +
      '</div>' +
      '<div class="system-row">' +
        '<span class="system-label">Git Status</span>' +
        '<span class="system-value ' + gitClass + '">' + system.gitStatus + '</span>' +
      '</div>' +
      '<div class="system-row">' +
        '<span class="system-label">Disk Usage</span>' +
        '<span class="system-value">' + system.diskUsage + '</span>' +
      '</div>' +
      (system.lastBackup
        ? '<div class="system-row">' +
            '<span class="system-label">Last Backup</span>' +
            '<span class="system-value">' + system.lastBackup + '</span>' +
          '</div>'
        : '');
  }

  // -------------------------------------------------------------------------
  // UI – Schedule
  // -------------------------------------------------------------------------

  function getJobIcon(name) {
    var keys = Object.keys(JOB_ICON_MAP);
    for (var i = 0; i < keys.length; i++) {
      if (name.includes(keys[i])) return JOB_ICON_MAP[keys[i]];
    }
    return '[*]';
  }

  function getJobOutput(name) {
    for (var i = 0; i < JOB_OUTPUT_MAP.length; i++) {
      var entry = JOB_OUTPUT_MAP[i];
      if (name.includes(entry.match)) {
        return {
          file: typeof entry.file === 'function' ? entry.file() : entry.file,
          label: entry.label,
        };
      }
    }
    return null;
  }

  function updateScheduleList(jobs) {
    var el = $('schedule-list');
    if (!el) return;

    if (!jobs || !jobs.length) {
      el.innerHTML = emptyState('No scheduled tasks');
      return;
    }

    jobs.forEach(function (job) { state.storedJobs[job.id] = job; });

    var groups = {
      morning: { label: '🌅 Morning (6am-12pm)', jobs: [] },
      afternoon: { label: '☀️ Afternoon (12pm-5pm)', jobs: [] },
      evening: { label: '🌆 Evening (5pm-10pm)', jobs: [] },
      night: { label: '🌙 Night (10pm-6am)', jobs: [] },
    };

    jobs.forEach(function (job) {
      if (!job.enabled) return;

      var parts = (job.schedule?.expr || '').split(' ');
      var hour = parts[1] ? parseInt(parts[1], 10) : null;
      if (hour === null) { groups.morning.jobs.push(job); return; }

      var hourET = hour;
      if (job.schedule?.tz === 'UTC') hourET = (hour - 5 + 24) % 24;

      if (hourET >= 6 && hourET < 12) groups.morning.jobs.push(job);
      else if (hourET >= 12 && hourET < 17) groups.afternoon.jobs.push(job);
      else if (hourET >= 17 && hourET < 22) groups.evening.jobs.push(job);
      else groups.night.jobs.push(job);
    });

    var html = '';

    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (!group.jobs.length) return;

      group.jobs.sort(function (a, b) {
        return (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0);
      });

      html += '<div class="schedule-group">' +
        '<div class="schedule-group-header">' + group.label + '</div>' +
        '<div class="schedule-group-items">';

      group.jobs.forEach(function (job) {
        var lastRun = job.state?.lastRunAtMs ? formatRelativeTime(job.state.lastRunAtMs) : 'Never';
        var schedule = formatSchedule(job.schedule);
        var nextRun = formatNextRun(job.state?.nextRunAtMs);
        var icon = getJobIcon(job.name);

        var timeSinceRun = Date.now() - (job.state?.lastRunAtMs || 0);
        var isToday = timeSinceRun < DAY_MS;

        var statusIndicator = '';
        if (job.state?.lastRunStatus === 'ok' && isToday) {
          statusIndicator = '<span style="color: #10b981; margin-left: 8px;">✓</span>';
        } else if (job.state?.lastRunStatus === 'error') {
          statusIndicator = '<span style="color: #ef4444; margin-left: 8px;">✗</span>';
        }

        var outputLink = '';
        var output = getJobOutput(job.name);
        if (output && job.state?.lastRunStatus === 'ok' && isToday) {
          outputLink =
            ' · <a href="#" onclick="event.stopPropagation(); viewFile(\'' + output.file +
            '\'); return false;" style="color: #8b5cf6; text-decoration: none; font-size: 12px;">' +
            output.label + '</a>';
        }

        html +=
          '<div class="schedule-item clickable" onclick="viewTask(\'' + job.id + '\')">' +
            '<div class="schedule-time">' +
              '<div class="schedule-icon">' + icon + '</div>' +
              '<div class="schedule-time-text">' + schedule + '</div>' +
            '</div>' +
            '<div class="schedule-details">' +
              '<div class="schedule-name">' + esc(job.name) + statusIndicator + '</div>' +
              '<div class="schedule-meta">' +
                '<span class="schedule-next">Next: ' + nextRun + '</span>' +
                '<span class="schedule-last">Last: ' + lastRun + outputLink + '</span>' +
              '</div>' +
            '</div>' +
          '</div>';
      });

      html += '</div></div>';
    });

    el.innerHTML = html;
  }

  // -------------------------------------------------------------------------
  // UI – Projects
  // -------------------------------------------------------------------------

  function renderProjectGroup(containerId, projects, statusFilter, emptyMsg, defaultIcon) {
    var el = $(containerId);
    if (!el) return;

    var filtered = (projects || []).filter(function (p) { return p.status === statusFilter; });

    if (!filtered.length) {
      el.innerHTML = emptyState(emptyMsg);
      return;
    }

    el.innerHTML = filtered.map(function (p) {
      var techStr = p.tech ? p.tech.join(', ') : '';
      var urlBtn = p.url
        ? '<a href="' + p.url + '" target="_blank" class="btn btn-small">Open →</a>'
        : '';
      return (
        '<div class="list-item project-item ' + p.status + '">' +
          '<div class="list-icon">' + (p.icon || defaultIcon) + '</div>' +
          '<div class="list-content">' +
            '<div class="list-title">' + esc(p.name) + '</div>' +
            '<div class="list-subtitle">' + esc(p.description || '') + '</div>' +
            (techStr ? '<div class="list-meta">' + techStr + '</div>' : '') +
          '</div>' +
          urlBtn +
        '</div>'
      );
    }).join('');
  }

  function updateProjects(projects) {
    var memEl = $('memory-projects');
    if (memEl) {
      if (!projects || !projects.length) {
        memEl.innerHTML = emptyState('No projects');
      } else {
        memEl.innerHTML = projects.map(function (p) {
          return listItem(
            p.icon || '📁',
            esc(p.name),
            p.description || p.path || '',
            p.status,
          );
        }).join('');
      }
    }

    renderProjectGroup('projects-ideas', projects, 'idea', 'No ideas yet', '💡');
    renderProjectGroup('projects-review', projects, 'needs-review', 'All caught up! 🎉', '📁');
    renderProjectGroup('projects-active', projects, 'active', 'No active projects', '📁');
  }

  // -------------------------------------------------------------------------
  // UI – Activity
  // -------------------------------------------------------------------------

  function updateActivityList(activities) {
    var el = $('activity-list');
    if (!el) return;

    if (!activities || !activities.length) {
      el.innerHTML = emptyState('No activity');
      return;
    }

    el.innerHTML = activities.map(function (a) {
      return listItem(a.icon || '[+]', esc(a.message), 'Commit: ' + a.hash);
    }).join('');
  }

  // -------------------------------------------------------------------------
  // Modal – task detail & file viewer
  // -------------------------------------------------------------------------

  function viewTask(jobId) {
    var job = state.storedJobs[jobId];
    if (!job) return;

    var schedule = formatSchedule(job.schedule);
    var nextRun = job.state?.nextRunAtMs
      ? new Date(job.state.nextRunAtMs).toLocaleString()
      : 'Not scheduled';
    var lastRun = job.state?.lastRunAtMs
      ? new Date(job.state.lastRunAtMs).toLocaleString()
      : 'Never';
    var taskText = job.payload?.text || job.payload?.message || 'No description';

    $('modal-title').textContent = '⏰ ' + job.name;
    $('modal-content').innerHTML =
      '<div class="task-detail">' +
        detailRow('Status', job.enabled ? '🟢 Enabled' : '⚪ Disabled') +
        detailRow('Schedule', schedule) +
        detailRow('Cron Expression', '<span style="font-family: monospace">' + (job.schedule?.expr || 'N/A') + '</span>') +
        detailRow('Timezone', job.schedule?.tz || 'UTC') +
        detailRow('Next Run', nextRun) +
        detailRow('Last Run', lastRun) +
        detailRow('Last Status', job.state?.lastStatus || 'N/A') +
        detailRow('Session Target', job.sessionTarget || 'main') +
        '<div class="task-section">' +
          '<span class="task-label">Task Description</span>' +
          '<div class="task-text">' + esc(taskText) + '</div>' +
        '</div>' +
      '</div>';

    $('modal').classList.add('active');
  }

  function viewFile(filePath, fileName) {
    var modal = $('modal');
    var title = $('modal-title');
    var content = $('modal-content');

    title.textContent = '📄 ' + (fileName || filePath.split('/').pop());
    content.innerHTML = '<pre class="loading">Loading...</pre>';
    modal.classList.add('active');

    fetch('/api/file/' + encodeURIComponent(filePath))
      .then(function (r) {
        if (!r.ok) throw new Error('File not found');
        return r.text();
      })
      .then(function (text) {
        var formatted = esc(text)
          .replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')
          .replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n\n/g, '</p><p class="md-p">')
          .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');

        var parentFolder = filePath.split('/').slice(0, -1).join('/');

        content.innerHTML =
          '<div class="file-preview"><p class="md-p">' + formatted + '</p></div>' +
          '<div class="file-preview-footer">' +
            '<a href="#" onclick="event.preventDefault(); switchSection(\'memory\'); closeModal(); setTimeout(function() { browseTo(\'' + parentFolder + '\'); }, 100);" style="color: #8b5cf6; text-decoration: none;">' +
              'Open in Memory browser →' +
            '</a>' +
          '</div>';
      })
      .catch(function (err) {
        content.innerHTML = emptyState('<span style="color: var(--error)">Error loading file: ' + err.message + '</span>');
      });
  }

  function closeModal() {
    $('modal').classList.remove('active');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // -------------------------------------------------------------------------
  // File browser
  // -------------------------------------------------------------------------

  function browseTo(folderPath) {
    state.currentPath = folderPath;
    var container = $('file-browser');
    var breadcrumb = $('file-breadcrumb');

    var parts = folderPath ? folderPath.split('/').filter(Boolean) : [];
    var crumbs = '<span class="breadcrumb-item clickable" onclick="browseTo(\'\')">🏠 root</span>';
    var accumulated = '';

    parts.forEach(function (part) {
      accumulated += (accumulated ? '/' : '') + part;
      crumbs += ' / <span class="breadcrumb-item clickable" onclick="browseTo(\'' + accumulated + '\')">' + part + '</span>';
    });

    breadcrumb.innerHTML = crumbs;
    container.innerHTML = emptyState('Loading...');

    fetch('/api/browse?path=' + encodeURIComponent(folderPath))
      .then(function (r) { return r.json(); })
      .then(function (items) {
        if (!items || !items.length) {
          container.innerHTML = emptyState('Empty folder');
          return;
        }

        container.innerHTML = items.map(function (item) {
          if (item.type === 'folder') {
            return listItem(
              '📁', esc(item.name), 'Folder', formatDate(item.modified),
              { classes: 'file-item', onclick: "browseTo('" + item.path + "')" },
            );
          }
          return listItem(
            '📄', esc(item.name), formatBytes(item.size), formatDate(item.modified),
            { classes: 'file-item', onclick: "viewFile('" + item.path + "', '" + esc(item.name) + "')" },
          );
        }).join('');
      })
      .catch(function () {
        container.innerHTML = emptyState('Error loading folder');
      });
  }

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------

  function loadConversations() {
    var container = $('conversations-list');
    if (!container) return;

    container.innerHTML = emptyState('Loading conversations...');

    var channel = ($('conv-channel-filter') || {}).value || 'signal';
    var limit = ($('conv-limit-filter') || {}).value || 100;

    fetch('/api/conversation?channel=' + channel + '&limit=' + limit)
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load conversation');
        return r.json();
      })
      .then(function (data) {
        var totalEl = $('conv-total');
        if (totalEl) {
          totalEl.textContent = data.stats.total;
          $('conv-user').textContent = data.stats.user;
          $('conv-assistant').textContent = data.stats.assistant;
          $('conv-tools').textContent = data.stats.tools;
        }

        if (!data.messages.length) {
          container.innerHTML = emptyState('No messages found');
          return;
        }

        container.innerHTML = data.messages.map(renderMessage).filter(Boolean).join('');
      })
      .catch(function (err) {
        container.innerHTML = emptyState('Error loading conversation: ' + err.message);
      });
  }

  function renderMessage(msg) {
    var ts = new Date(msg.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    if (msg.role === 'user') return renderUserMessage(msg, ts);
    if (msg.role === 'assistant') return renderAssistantMessage(msg, ts);
    if (msg.role === 'tool') return renderToolMessage(msg);
    return '';
  }

  function renderUserMessage(msg, ts) {
    var content = msg.content || '';
    var isVoice = content.includes('[media attached:') && content.includes('.aac');

    var parts = content.split('```');
    if (parts.length > 2) content = parts[parts.length - 1].trim();
    content = content.replace(/<media:audio>/g, '').trim();

    if (!content || content.length < 3) {
      if (!isVoice) return '';
      content = '🎤 Voice message';
    }

    return chatBubble('user', 'Mei', isVoice && (!content || content === '🎤 Voice message') ? content : esc(content), ts);
  }

  function renderAssistantMessage(msg, ts) {
    var content = esc(msg.content || '');
    if (!content.trim()) return '';
    return chatBubble('assistant', 'Nix ✨', content, ts);
  }

  function renderToolMessage(msg) {
    var desc = '';
    try {
      var args = JSON.parse(msg.content);
      var name = msg.toolName || 'tool';
      var renderer = TOOL_RENDERERS[name];

      if (renderer) {
        desc = renderer(args);
      } else {
        var firstKey = Object.keys(args)[0];
        var firstVal = args[firstKey];
        desc = (typeof firstVal === 'string' && firstVal.length < 100)
          ? name + ': ' + esc(firstVal)
          : name;
      }
    } catch {
      desc = esc(msg.toolName || 'tool');
    }

    return '<div class="chat-tool"><span class="chat-tool-icon">🔧</span> ' + desc + '</div>';
  }

  function chatBubble(role, sender, content, ts) {
    return (
      '<div class="chat-bubble-wrapper chat-bubble-wrapper--' + role + '">' +
        '<div class="chat-bubble chat-bubble--' + role + '">' +
          '<div class="chat-bubble-name">' + sender + '</div>' +
          '<div class="chat-bubble-text">' + content + '</div>' +
          '<div class="chat-bubble-time">' + ts + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // -------------------------------------------------------------------------
  // Initialization & global exports
  // -------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    setupNavigation();
    refreshData();
    browseTo('memory');
    setInterval(refreshData, REFRESH_INTERVAL_MS);
  });

  window.switchSection = switchSection;
  window.toggleSidebar = toggleSidebar;
  window.refreshData = refreshData;
  window.viewFile = viewFile;
  window.viewTask = viewTask;
  window.closeModal = closeModal;
  window.browseTo = browseTo;
  window.loadConversations = loadConversations;
})();
