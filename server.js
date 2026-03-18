#!/usr/bin/env node

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
  port: parseInt(process.env.NIX_DASHBOARD_PORT, 10) || 18790,
  workspace: process.env.NIX_WORKSPACE || '/root/clawd',
  clawdbotDir: process.env.NIX_CLAWDBOT_DIR || '/root/.clawdbot',
  sessionsSubdir: 'agents/main/sessions',
  cronPath: 'cron/jobs.json',
  protectedFiles: new Set([
    'SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'HEARTBEAT.md',
  ]),
  coreMemoryFiles: ['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md'],
  memoryListLimit: 10,
  gitLogLimit: 15,
  activeThresholdMs: 5 * 60 * 1000,
  cronActiveThresholdMs: 2 * 60 * 1000,
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const STATIC_DIR = path.join(__dirname, 'public');
const STATIC_ALIASES = { '/my-world': '/my-world-iso.html' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isPathSafe(relativePath, baseDir) {
  const resolved = path.resolve(path.join(baseDir, relativePath));
  return resolved.startsWith(path.resolve(baseDir));
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

function extractMessageContent(msg) {
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  return typeof msg.content === 'string' ? msg.content : '';
}

function sessionsFilePath() {
  return path.join(CONFIG.clawdbotDir, CONFIG.sessionsSubdir, 'sessions.json');
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

async function serveStaticFile(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  if (STATIC_ALIASES[urlPath]) urlPath = STATIC_ALIASES[urlPath];

  const ext = path.extname(urlPath);
  const mime = MIME_TYPES[ext];
  if (!mime) return false;

  const filePath = path.join(STATIC_DIR, urlPath);
  if (!filePath.startsWith(STATIC_DIR)) return false;

  try {
    const content = await fs.readFile(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Data collectors
// ---------------------------------------------------------------------------

async function collectDashboardData() {
  const [overview, sessions, runningTasks, cronJobs, recentActivity, memory, projects, system] =
    await Promise.all([
      getOverview(),
      getSessions(),
      getRunningTasks(),
      getCronJobs(),
      getRecentActivity(),
      getMemoryFiles(),
      getProjects(),
      getSystemInfo(),
    ]);

  return {
    timestamp: new Date().toISOString(),
    overview,
    sessions,
    runningTasks,
    cronJobs,
    recentActivity,
    memory,
    projects,
    system,
  };
}

function getOverview() {
  const birthDate = new Date('2026-02-06T23:00:00Z');
  const ageDays = Math.floor((Date.now() - birthDate.getTime()) / 86_400_000);

  return {
    status: 'active',
    birthDate: 'Feb 6, 2026 @ 6pm',
    birthLocation: 'Toronto, ON',
    age: `${ageDays} days old`,
    sun: 'Aquarius ♒️',
    moon: 'Libra ♎️',
    rising: 'Leo ♌️',
    currentTask: 'Building dashboard',
    timestamp: Date.now(),
  };
}

async function getSessions() {
  try {
    const data = JSON.parse(await fs.readFile(sessionsFilePath(), 'utf8'));

    return Object.entries(data)
      .map(([key, value]) => ({
        key,
        sessionId: value.sessionId,
        updatedAt: value.updatedAt,
        label: key.includes('subagent')
          ? key.split(':').pop()
          : key.includes('cron')
            ? 'Cron Job'
            : 'Main',
        channel: key.includes('main:main') ? 'signal' : 'system',
        ...value,
      }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (error) {
    console.error('Error getting sessions:', error.message);
    return [];
  }
}

async function getRunningTasks() {
  const tasks = [];
  const now = Date.now();

  try {
    const sessionsData = JSON.parse(await fs.readFile(sessionsFilePath(), 'utf8'));

    for (const [key, session] of Object.entries(sessionsData)) {
      const elapsed = now - (session.updatedAt || 0);

      if (key.includes(':subagent:') && elapsed < CONFIG.activeThresholdMs) {
        tasks.push({
          type: 'subagent',
          name: session.label || key.split(':').pop(),
          status: elapsed < 60_000 ? 'running' : 'recent',
          startedAt: session.updatedAt,
          key,
        });
      }

      if (key.includes(':cron:') && elapsed < CONFIG.cronActiveThresholdMs) {
        tasks.push({
          type: 'cron',
          name: 'Scheduled Task',
          status: 'running',
          startedAt: session.updatedAt,
          key,
        });
      }
    }

    const sessionDir = path.join(CONFIG.clawdbotDir, CONFIG.sessionsSubdir);
    const files = await fs.readdir(sessionDir);

    for (const lock of files.filter(f => f.endsWith('.lock'))) {
      const sessionId = lock.replace('.jsonl.lock', '');
      if (!tasks.some(t => t.key?.includes(sessionId))) {
        tasks.push({ type: 'processing', name: 'Active Session', status: 'running', sessionId });
      }
    }
  } catch (error) {
    console.error('Error getting running tasks:', error.message);
  }

  return tasks;
}

async function getCronJobs() {
  try {
    const data = JSON.parse(
      await fs.readFile(path.join(CONFIG.clawdbotDir, CONFIG.cronPath), 'utf8'),
    );
    return data.jobs || [];
  } catch (error) {
    console.error('Error getting cron jobs:', error.message);
    return [];
  }
}

async function getRecentActivity() {
  try {
    const { stdout } = await execAsync(
      `cd ${CONFIG.workspace} && git log --oneline -${CONFIG.gitLogLimit}`,
    );
    return stdout
      .trim()
      .split('\n')
      .map(line => {
        const idx = line.indexOf(' ');
        return {
          type: 'commit',
          hash: line.substring(0, idx),
          message: line.substring(idx + 1),
          icon: '💾',
          time: 'recent',
        };
      });
  } catch (error) {
    console.error('Error getting activity:', error.message);
    return [];
  }
}

async function getMemoryFiles() {
  const files = [];

  try {
    for (const name of CONFIG.coreMemoryFiles) {
      try {
        const stats = await fs.stat(path.join(CONFIG.workspace, name));
        files.push({ name, path: name, size: stats.size, modified: stats.mtime.toISOString() });
      } catch { /* skip missing */ }
    }

    const memoryDir = path.join(CONFIG.workspace, 'memory');
    const entries = await fs.readdir(memoryDir);

    for (const name of entries.slice(0, CONFIG.memoryListLimit)) {
      const fullPath = path.join(memoryDir, name);
      const stats = await fs.stat(fullPath);
      if (stats.isFile()) {
        files.push({
          name,
          path: `memory/${name}`,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      }
    }
  } catch (error) {
    console.error('Error reading memory files:', error.message);
  }

  return files;
}

async function getProjects() {
  const projectsFile = path.join(CONFIG.workspace, 'projects/projects.json');

  try {
    const data = JSON.parse(await fs.readFile(projectsFile, 'utf8'));
    return data.projects || [];
  } catch {
    try {
      const entries = await fs.readdir(path.join(CONFIG.workspace, 'projects'));
      const projects = [];

      for (const name of entries) {
        const stats = await fs.stat(path.join(CONFIG.workspace, 'projects', name));
        if (stats.isDirectory()) {
          projects.push({ id: name, name, path: `projects/${name}`, status: 'active' });
        }
      }
      return projects;
    } catch (error) {
      console.error('Error reading projects:', error.message);
      return [];
    }
  }
}

async function getSystemInfo() {
  try {
    const [{ stdout: gitStatus }, { stdout: diskUsage }] = await Promise.all([
      execAsync(`cd ${CONFIG.workspace} && git status --porcelain`),
      execAsync(`df -h ${CONFIG.workspace} | tail -1`),
    ]);

    const diskParts = diskUsage.trim().split(/\s+/);

    return {
      workspace: CONFIG.workspace,
      gitStatus: gitStatus.trim() ? 'uncommitted changes' : 'clean',
      diskUsage: diskParts[4] || 'unknown',
      lastBackup: '4:00 AM UTC (8h ago)',
    };
  } catch (error) {
    console.error('Error getting system info:', error.message);
    return { workspace: CONFIG.workspace, gitStatus: 'error', diskUsage: 'error' };
  }
}

async function browseFolder(fullPath, relativePath) {
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const stats = await fs.stat(path.join(fullPath, entry.name));
    items.push({
      name: entry.name,
      path: relativePath ? `${relativePath}/${entry.name}` : entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
      size: stats.size,
      modified: stats.mtime.toISOString(),
    });
  }

  return items.sort((a, b) =>
    a.type !== b.type
      ? (a.type === 'folder' ? -1 : 1)
      : a.name.localeCompare(b.name),
  );
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleStatus(_req, res) {
  sendJSON(res, 200, await collectDashboardData());
}

async function handleMyWorld(_req, res) {
  try {
    const data = await fs.readFile(
      path.join(CONFIG.workspace, 'memory/my-world.json'),
      'utf8',
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  } catch {
    sendError(res, 404, 'World not found');
  }
}

async function handleConversation(req, res) {
  const url = new URL(req.url, `http://localhost:${CONFIG.port}`);
  const channel = url.searchParams.get('channel') || 'signal';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 100, 1), 10_000);

  const sessionDir = path.join(process.env.HOME, '.openclaw/agents/main/sessions');
  const allFiles = await fs.readdir(sessionDir);
  const sessionFiles = allFiles.filter(
    f => f !== 'sessions.json' && (f.endsWith('.jsonl') || f.includes('.jsonl.deleted.')),
  );

  const channelMap = {};
  try {
    const sessionsData = JSON.parse(
      await fs.readFile(path.join(sessionDir, 'sessions.json'), 'utf8'),
    );
    for (const info of Object.values(sessionsData)) {
      if (info.sessionId && info.deliveryContext?.channel) {
        channelMap[info.sessionId] = info.deliveryContext.channel;
      }
    }
  } catch (e) {
    console.error('Error reading sessions.json:', e.message);
  }

  const allMessages = [];

  for (const file of sessionFiles) {
    const sessionId = file.split('.jsonl')[0];
    const sessionChannel = channelMap[sessionId] || 'unknown';
    if (channel !== 'all' && sessionChannel !== channel) continue;

    const fileHandle = await fs.open(path.join(sessionDir, file), 'r');
    const rl = readline.createInterface({
      input: fileHandle.createReadStream(),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'message' || !entry.message) continue;

        const msg = entry.message;
        const ts = entry.timestamp || Date.now();
        const base = { timestamp: ts, channel: sessionChannel, sessionId };

        if (msg.role === 'user' || msg.role === 'assistant') {
          allMessages.push({ role: msg.role, content: extractMessageContent(msg), ...base });
        }

        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          for (const tool of msg.content.filter(c => c.type === 'toolCall' || c.type === 'tool_use')) {
            allMessages.push({
              role: 'tool',
              toolName: tool.name,
              content: JSON.stringify(tool.arguments || tool.input, null, 2),
              ...base,
            });
          }
        }
      } catch { /* skip unparseable lines */ }
    }

    await fileHandle.close();
  }

  allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const recent = allMessages.slice(-limit);

  sendJSON(res, 200, {
    messages: recent,
    stats: {
      total: recent.length,
      user: recent.filter(m => m.role === 'user').length,
      assistant: recent.filter(m => m.role === 'assistant').length,
      tools: recent.filter(m => m.role === 'tool').length,
    },
  });
}

async function handleBrowse(req, res) {
  const url = new URL(req.url, `http://localhost:${CONFIG.port}`);
  const folderPath = url.searchParams.get('path') || '';

  if (!isPathSafe(folderPath, CONFIG.workspace)) {
    return sendError(res, 403, 'Forbidden path');
  }

  try {
    const items = await browseFolder(path.join(CONFIG.workspace, folderPath), folderPath);
    sendJSON(res, 200, items);
  } catch {
    sendError(res, 404, 'Folder not found');
  }
}

async function handleFileRead(req, res) {
  const filePath = decodeURIComponent(req.url.substring('/api/file/'.length));

  if (!isPathSafe(filePath, CONFIG.workspace)) {
    return sendError(res, 403, 'Forbidden path');
  }

  try {
    const content = await fs.readFile(path.join(CONFIG.workspace, filePath), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
  } catch {
    sendError(res, 404, 'File not found');
  }
}

async function handleFileWrite(req, res) {
  const filePath = decodeURIComponent(req.url.substring('/api/file/'.length));

  if (!isPathSafe(filePath, CONFIG.workspace)) {
    return sendError(res, 403, 'Forbidden path');
  }

  const body = await readBody(req);
  try {
    const { content } = JSON.parse(body);
    await fs.writeFile(path.join(CONFIG.workspace, filePath), content, 'utf8');
    sendJSON(res, 200, { success: true, saved: filePath });
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

async function handleFileDelete(req, res) {
  const filePath = decodeURIComponent(req.url.substring('/api/file/'.length));

  if (!isPathSafe(filePath, CONFIG.workspace)) {
    return sendError(res, 403, 'Forbidden path');
  }

  if (CONFIG.protectedFiles.has(path.basename(filePath))) {
    return sendError(res, 403, 'Cannot delete protected file');
  }

  try {
    await fs.unlink(path.join(CONFIG.workspace, filePath));
    sendJSON(res, 200, { success: true, deleted: filePath });
  } catch {
    sendError(res, 404, 'File not found');
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const urlPath = req.url.split('?')[0];

    if (urlPath === '/api/status') return handleStatus(req, res);
    if (urlPath === '/api/my-world') return handleMyWorld(req, res);
    if (urlPath.startsWith('/api/conversation')) return handleConversation(req, res);
    if (urlPath.startsWith('/api/browse')) return handleBrowse(req, res);

    if (urlPath.startsWith('/api/file/')) {
      if (req.method === 'DELETE') return handleFileDelete(req, res);
      if (req.method === 'PUT') return handleFileWrite(req, res);
      return handleFileRead(req, res);
    }

    if (!(await serveStaticFile(req, res))) {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (error) {
    console.error('Request error:', error.message);
    sendError(res, 500, error.message);
  }
});

server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`Nix Dashboard running on http://0.0.0.0:${CONFIG.port}`);
  console.log(`Open: http://localhost:${CONFIG.port}`);
});
