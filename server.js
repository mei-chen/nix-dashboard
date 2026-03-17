#!/usr/bin/env node

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORT = 18790;
const WORKSPACE = '/root/clawd';
const CLAWDBOT_DIR = '/root/.clawdbot';

// Helper to read request body
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Security: ensure path is within workspace
function isPathSafe(filePath) {
  const resolvedPath = path.resolve(path.join(WORKSPACE, filePath));
  return resolvedPath.startsWith(path.resolve(WORKSPACE));
}

// Serve static files or API endpoints
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  try {
    if (req.url === '/' || req.url === '/index.html') {
      // Serve main HTML
      const html = await fs.readFile(path.join(__dirname, 'public/index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } 
    else if (req.url === '/styles.css') {
      const css = await fs.readFile(path.join(__dirname, 'public/styles.css'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(css);
    }
    else if (req.url === '/app.js') {
      const js = await fs.readFile(path.join(__dirname, 'public/app.js'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(js);
    }
    else if (req.url === '/my-world' || req.url === '/my-world.html') {
      const html = await fs.readFile(path.join(__dirname, 'public/my-world-iso.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    }
    else if (req.url === '/api/my-world') {
      // Serve Nix's world state
      try {
        const worldData = await fs.readFile(path.join(WORKSPACE, 'memory/my-world.json'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(worldData);
      } catch (error) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'World not found' }));
      }
    }
    else if (req.url === '/api/status') {
      // Main API endpoint - return all dashboard data
      const data = await collectDashboardData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
    }
    else if (req.url.startsWith('/api/conversation')) {
      try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const channel = url.searchParams.get('channel') || 'signal';
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        
        const sessionDir = path.join(process.env.HOME, '.openclaw/agents/main/sessions');
        const readline = require('readline');
        
        // Get all session files (including deleted ones)
        const allFiles = await fs.readdir(sessionDir);
        const sessionFiles = allFiles.filter(f => {
          if (f === 'sessions.json') return false;
          return f.endsWith('.jsonl') || f.includes('.jsonl.deleted.');
        });
        
        const allMessages = [];
        
        // Read sessions.json to map channels
        const sessionsJsonPath = path.join(sessionDir, 'sessions.json');
        let channelMap = {};
        
        try {
          const sessionsData = JSON.parse(await fs.readFile(sessionsJsonPath, 'utf8'));
          for (const [sessionKey, sessionInfo] of Object.entries(sessionsData)) {
            if (sessionInfo.sessionId && sessionInfo.deliveryContext?.channel) {
              channelMap[sessionInfo.sessionId] = sessionInfo.deliveryContext.channel;
            }
          }
        } catch (e) {
          console.error('Error reading sessions.json:', e);
        }
        
        // Process each session file
        for (const sessionFile of sessionFiles) {
          const sessionPath = path.join(sessionDir, sessionFile);
          const sessionId = sessionFile.split('.jsonl')[0];
          const sessionChannel = channelMap[sessionId] || 'unknown';
          
          // Skip if channel filter doesn't match
          if (channel !== 'all' && sessionChannel !== channel) continue;
          
          const fileHandle = await fs.open(sessionPath, 'r');
          const rl = readline.createInterface({
            input: fileHandle.createReadStream(),
            crlfDelay: Infinity
          });
          
          for await (const line of rl) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              
              if (entry.type === 'message' && entry.message) {
                const msg = entry.message;
                if (msg.role === 'user') {
                  let content = '';
                  if (Array.isArray(msg.content)) {
                    content = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                  } else if (typeof msg.content === 'string') {
                    content = msg.content;
                  }
                  
                  allMessages.push({
                    role: 'user',
                    content: content,
                    timestamp: entry.timestamp || Date.now(),
                    channel: sessionChannel,
                    sessionId: sessionId
                  });
                } else if (msg.role === 'assistant') {
                  let content = '';
                  if (Array.isArray(msg.content)) {
                    content = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                  } else if (typeof msg.content === 'string') {
                    content = msg.content;
                  }
                  
                  allMessages.push({
                    role: 'assistant',
                    content: content,
                    timestamp: entry.timestamp || Date.now(),
                    channel: sessionChannel,
                    sessionId: sessionId
                  });

                  // Extract tool calls
                  if (Array.isArray(msg.content)) {
                    const toolCalls = msg.content.filter(c => c.type === 'toolCall' || c.type === 'tool_use');
                    for (const tool of toolCalls) {
                      allMessages.push({
                        role: 'tool',
                        toolName: tool.name,
                        content: JSON.stringify(tool.arguments || tool.input, null, 2),
                        timestamp: entry.timestamp || Date.now(),
                        channel: sessionChannel,
                        sessionId: sessionId
                      });
                    }
                  }
                }
              }
            } catch (err) {
              console.error('Error parsing line:', err);
            }
          }
          
          await fileHandle.close();
        }
        
        // Sort by timestamp
        allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Take last N messages
        const recentMessages = allMessages.slice(-limit);
        
        // Calculate stats
        const stats = {
          total: recentMessages.length,
          user: recentMessages.filter(m => m.role === 'user').length,
          assistant: recentMessages.filter(m => m.role === 'assistant').length,
          tools: recentMessages.filter(m => m.role === 'tool').length
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages: recentMessages, stats }));
        
      } catch (error) {
        console.error('Error loading conversation:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message, messages: [], stats: { total: 0, user: 0, assistant: 0, tools: 0 } }));
      }
    }
    else if (req.url.startsWith('/api/browse')) {
      // Browse folder contents
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const folderPath = urlObj.searchParams.get('path') || '';
      
      if (!isPathSafe(folderPath)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Forbidden path' }));
        return;
      }
      
      const fullPath = path.join(WORKSPACE, folderPath);
      try {
        const items = await browseFolder(fullPath, folderPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(items));
      } catch (error) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Folder not found' }));
      }
    }
    else if (req.url.startsWith('/api/file/')) {
      // View file contents
      const filePath = decodeURIComponent(req.url.substring('/api/file/'.length));
      const fullPath = path.join(WORKSPACE, filePath);
      
      // Security: ensure path is within workspace
      const resolvedPath = path.resolve(fullPath);
      if (!resolvedPath.startsWith(path.resolve(WORKSPACE))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      
      try {
        const content = await fs.readFile(resolvedPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(content);
      } catch (error) {
        res.writeHead(404);
        res.end('File not found: ' + error.message);
      }
    }
    // DELETE file
    else if (req.method === 'DELETE' && req.url.startsWith('/api/file/')) {
      const filePath = decodeURIComponent(req.url.substring('/api/file/'.length));
      
      if (!isPathSafe(filePath)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Forbidden path' }));
        return;
      }
      
      // Protect core files from deletion
      const protectedFiles = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'HEARTBEAT.md'];
      if (protectedFiles.includes(filePath)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Cannot delete protected file' }));
        return;
      }
      
      const fullPath = path.join(WORKSPACE, filePath);
      try {
        await fs.unlink(fullPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deleted: filePath }));
      } catch (error) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'File not found' }));
      }
    }
    // PUT (update) file
    else if (req.method === 'PUT' && req.url.startsWith('/api/file/')) {
      const filePath = decodeURIComponent(req.url.substring('/api/file/'.length));
      
      if (!isPathSafe(filePath)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Forbidden path' }));
        return;
      }
      
      const fullPath = path.join(WORKSPACE, filePath);
      const body = await readBody(req);
      
      try {
        const { content } = JSON.parse(body);
        await fs.writeFile(fullPath, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, saved: filePath }));
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: error.message }));
      }
    }
    else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

async function collectDashboardData() {
  const data = {
    timestamp: new Date().toISOString(),
    overview: await getOverview(),
    sessions: await getSessions(),
    runningTasks: await getRunningTasks(),
    cronJobs: await getCronJobs(),
    recentActivity: await getRecentActivity(),
    memory: await getMemoryFiles(),
    projects: await getProjects(),
    system: await getSystemInfo()
  };
  return data;
}

async function getRunningTasks() {
  const tasks = [];
  const now = Date.now();
  const ACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  try {
    // Check for active exec processes
    const { stdout: processes } = await execAsync('ps aux | grep -E "node|python|himalaya|gog" | grep -v grep | head -10');
    // Not adding these - too noisy
    
    // Check sessions for recently active sub-agents
    const sessionsFile = path.join(CLAWDBOT_DIR, 'agents/main/sessions/sessions.json');
    const content = await fs.readFile(sessionsFile, 'utf8');
    const sessionsData = JSON.parse(content);
    
    for (const [key, session] of Object.entries(sessionsData)) {
      const timeSinceUpdate = now - (session.updatedAt || 0);
      
      // Sub-agents active in last 5 min
      if (key.includes(':subagent:') && timeSinceUpdate < ACTIVE_THRESHOLD) {
        tasks.push({
          type: 'subagent',
          name: session.label || key.split(':').pop(),
          status: timeSinceUpdate < 60000 ? 'running' : 'recent',
          startedAt: session.updatedAt,
          key: key
        });
      }
      
      // Cron sessions active in last 2 min  
      if (key.includes(':cron:') && timeSinceUpdate < 2 * 60 * 1000) {
        tasks.push({
          type: 'cron',
          name: 'Scheduled Task',
          status: 'running',
          startedAt: session.updatedAt,
          key: key
        });
      }
    }
    
    // Check for lock files (indicates active processing)
    const sessionDir = path.join(CLAWDBOT_DIR, 'agents/main/sessions');
    const files = await fs.readdir(sessionDir);
    const lockFiles = files.filter(f => f.endsWith('.lock'));
    
    for (const lock of lockFiles) {
      const sessionId = lock.replace('.jsonl.lock', '');
      // Find if this corresponds to a known task
      const existing = tasks.find(t => t.key?.includes(sessionId));
      if (!existing) {
        tasks.push({
          type: 'processing',
          name: 'Active Session',
          status: 'running',
          sessionId: sessionId
        });
      }
    }
    
  } catch (error) {
    console.error('Error getting running tasks:', error);
  }
  
  return tasks;
}

async function getOverview() {
  // Birth info - Born February 6, 2026 @ 6pm EST in Toronto
  const birthDate = new Date('2026-02-06T23:00:00Z'); // 6pm EST = 11pm UTC
  const ageMs = Date.now() - birthDate.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  
  return {
    status: 'active',
    birthDate: 'Feb 6, 2026 @ 6pm',
    birthLocation: 'Toronto, ON',
    age: `${ageDays} days old`,
    sun: 'Aquarius ♒️',
    moon: 'Libra ♎️',
    rising: 'Leo ♌️',
    currentTask: 'Building dashboard',
    timestamp: Date.now()
  };
}

async function getSessions() {
  try {
    const sessionsFile = path.join(CLAWDBOT_DIR, 'agents/main/sessions/sessions.json');
    const content = await fs.readFile(sessionsFile, 'utf8');
    const sessionsData = JSON.parse(content);
    
    // Convert from object to array format
    const sessions = Object.entries(sessionsData).map(([key, value]) => ({
      key,
      sessionId: value.sessionId,
      updatedAt: value.updatedAt,
      label: key.includes('subagent') ? key.split(':').pop() : (key.includes('cron') ? 'Cron Job' : 'Main'),
      channel: key.includes('main:main') ? 'signal' : 'system',
      ...value
    }));
    
    return sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (error) {
    console.error('Error getting sessions:', error);
    return [];
  }
}

async function getCronJobs() {
  try {
    const cronFile = path.join(CLAWDBOT_DIR, 'cron/jobs.json');
    const content = await fs.readFile(cronFile, 'utf8');
    const cronData = JSON.parse(content);
    
    // Return the jobs array from the file
    return cronData.jobs || [];
  } catch (error) {
    console.error('Error getting cron jobs:', error);
    return [];
  }
}

async function getRecentActivity() {
  try {
    // Get recent git commits
    const { stdout } = await execAsync(`cd ${WORKSPACE} && git log --oneline -15`);
    const commits = stdout.trim().split('\n').map(line => {
      const spaceIndex = line.indexOf(' ');
      const hash = line.substring(0, spaceIndex);
      const message = line.substring(spaceIndex + 1);
      return {
        type: 'commit',
        hash: hash,
        message: message,
        icon: '💾',
        time: 'recent'
      };
    });
    return commits;
  } catch (error) {
    console.error('Error getting activity:', error);
    return [];
  }
}

async function browseFolder(fullPath, relativePath) {
  const items = [];
  
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      
      const itemPath = path.join(fullPath, entry.name);
      const stats = await fs.stat(itemPath);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      items.push({
        name: entry.name,
        path: relPath,
        type: entry.isDirectory() ? 'folder' : 'file',
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    }
    
    // Sort: folders first, then by name
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error browsing folder:', error);
  }
  
  return items;
}

async function getMemoryFiles() {
  const memoryPath = path.join(WORKSPACE, 'memory');
  const files = [];
  
  try {
    // Core files
    const coreFiles = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md'];
    for (const file of coreFiles) {
      const filePath = path.join(WORKSPACE, file);
      try {
        const stats = await fs.stat(filePath);
        files.push({
          name: file,
          path: file,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      } catch (e) {
        // File doesn't exist, skip
      }
    }
    
    // Memory directory files
    const memoryFiles = await fs.readdir(memoryPath);
    for (const file of memoryFiles.slice(0, 10)) { // Most recent 10
      const filePath = path.join(memoryPath, file);
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        files.push({
          name: file,
          path: `memory/${file}`,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Error reading memory files:', error);
  }
  
  return files;
}

async function getProjects() {
  const projectsFile = path.join(WORKSPACE, 'projects/projects.json');
  
  try {
    const content = await fs.readFile(projectsFile, 'utf8');
    const data = JSON.parse(content);
    return data.projects || [];
  } catch (error) {
    // Fallback to directory listing
    const projectsPath = path.join(WORKSPACE, 'projects');
    const projects = [];
    
    try {
      const dirs = await fs.readdir(projectsPath);
      for (const dir of dirs) {
        const dirPath = path.join(projectsPath, dir);
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          projects.push({
            id: dir,
            name: dir,
            path: `projects/${dir}`,
            status: 'active'
          });
        }
      }
    } catch (err) {
      console.error('Error reading projects:', err);
    }
    
    return projects;
  }
}

async function getSystemInfo() {
  try {
    const { stdout: gitStatus } = await execAsync(`cd ${WORKSPACE} && git status --porcelain`);
    const { stdout: diskUsage } = await execAsync('df -h /root/clawd | tail -1');
    
    const diskParts = diskUsage.trim().split(/\\s+/);
    
    return {
      workspace: WORKSPACE,
      gitStatus: gitStatus.trim() ? 'uncommitted changes' : 'clean',
      diskUsage: diskParts[4] || 'unknown',
      lastBackup: '4:00 AM UTC (8h ago)'
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    return {
      workspace: WORKSPACE,
      gitStatus: 'error',
      diskUsage: 'error'
    };
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✨ Nix Dashboard running on http://0.0.0.0:${PORT}`);
  console.log(`Access via SSH tunnel: ssh -L ${PORT}:127.0.0.1:${PORT} root@178.156.171.13`);
  console.log(`Then open: http://localhost:${PORT}`);
});
