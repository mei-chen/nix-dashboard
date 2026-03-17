# Nix Dashboard - Transparency Project

## Goal
Create a web dashboard where Mei can see everything I'm doing in real-time:
- Active sub-agents and their progress
- Recent activity and task history
- Memory files and reflections
- Soul/identity state
- Cron jobs and schedules
- Research and project progress

## Technical Approach

### Option 1: Standalone Web Server
- Simple Node.js/Python HTTP server
- Port 18790 (Mei already SSH tunnels to 18789 for control UI)
- Static HTML + JavaScript that fetches JSON data
- Auto-refresh or websocket for live updates

### Option 2: Static Site with Periodic Regeneration
- Generate HTML/CSS dashboard every N minutes
- Serve via simple HTTP server or nginx
- Lighter weight, no real-time updates needed
- Could regenerate on every significant event

### Option 3: Integration with Clawdbot Control UI
- Add dashboard view to existing control UI
- Most integrated, but requires understanding Clawdbot internals
- Might be complex

**Recommendation: Option 1 - Standalone Web Server**
- Most flexible
- Easy to iterate on
- Real-time or near-real-time updates
- Can start simple and add features

## Dashboard Sections

### 1. Overview Panel
- Current status: Active/Idle/Working
- Uptime since last restart
- Current main task
- Number of active sub-agents

### 2. Active Sessions
- Main session info
- List of sub-agents with:
  - Label
  - Task description
  - Start time
  - Status (running/completed/failed)
  - Progress indicator if available

### 3. Recent Activity Timeline
- Last 20-30 actions with timestamps
- Tool calls, file edits, git commits
- Color-coded by type

### 4. Memory & Reflections
- List of memory files with last modified
- Latest meditation log entry
- Soul/identity files
- Quick view/full view toggle

### 5. Scheduled Tasks
- Cron jobs with next run time
- Last run status
- Heartbeat schedule

### 6. Projects & Research
- Active projects (from projects/ directory)
- Research in progress
- GitHub repo status (commits ahead/behind)

### 7. System Health
- Disk usage
- Memory usage
- Git status (uncommitted changes)
- Last backup time

## Data Sources

### Sessions API
```javascript
// Use sessions_list tool to get active sessions
const sessions = await getSessions();
```

### File System
```javascript
// Read memory files, soul files, etc.
const memories = await readdir('memory/');
const soul = await readFile('SOUL.md');
```

### Cron API
```javascript
// Use cron tool to get job list
const jobs = await getCronJobs();
```

### Git Status
```bash
git status --porcelain
git log --oneline -10
```

### Activity Log
Parse from session history or maintain our own log file

## Technology Stack

**Backend:**
- Node.js with Express (or Python with Flask)
- Simple REST API serving JSON
- File watching for live updates

**Frontend:**
- Vanilla HTML/CSS/JS (keep it simple)
- Fetch API for data updates
- CSS Grid/Flexbox for layout
- Maybe Tailwind CSS for styling (or custom CSS)

**Data Format:**
```json
{
  "status": "active",
  "uptime": "2d 14h",
  "sessions": [...],
  "recentActivity": [...],
  "memories": [...],
  "cronJobs": [...],
  "projects": [...],
  "system": {...}
}
```

## Implementation Plan

### Phase 1: MVP (Today)
1. Create basic Node.js server
2. Single endpoint: GET /api/status
3. Simple HTML page that displays:
   - Active sessions
   - Recent memory files
   - Current soul/identity
4. Manual refresh button

### Phase 2: Enhanced (Tomorrow)
1. Add auto-refresh (every 30 seconds)
2. Add cron job display
3. Add recent activity timeline
4. Improve styling

### Phase 3: Polish (This Week)
1. Add real-time updates (websocket or SSE)
2. Add click-through to view full files
3. Add filtering and search
4. Make it beautiful

### Phase 4: Advanced (Future)
1. Interactive controls (pause/resume sub-agents)
2. Chat interface from dashboard
3. Visualizations (activity graphs, memory growth)
4. Mobile-friendly responsive design

## File Structure
```
projects/nix-dashboard/
├── PLAN.md (this file)
├── server.js (or server.py)
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── assets/
├── lib/
│   ├── sessions.js
│   ├── memory.js
│   ├── system.js
│   └── activity.js
└── README.md
```

## Security Considerations
- Dashboard only accessible via SSH tunnel (localhost)
- No authentication needed since SSH provides it
- Read-only access to most data
- Careful with any write operations

## Next Steps
1. Get Mei's approval on approach
2. Start with Phase 1 MVP
3. Deploy and test
4. Iterate based on feedback

---

**Question for Mei:**
- Do you prefer real-time updates or is refresh every 30-60 seconds okay?
- Any specific metrics or data you want to see prioritized?
- Visual style preference? (minimal/modern, colorful, dark mode?)
