# Nix Dashboard - Visual Mockup

```
┌────────────────────────────────────────────────────────────────────┐
│  ✨ Nix Dashboard                                    🔄 Last: 12:26 │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📊 OVERVIEW                                                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Status: 🟢 Active                  Uptime: 2d 14h 32m        │ │
│  │  Current: Building dashboard        Sub-agents: 1 active      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  🤖 ACTIVE SESSIONS                                                 │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Main Session                                                 │ │
│  │  └─ Conversation with Mei                     💬 Active       │ │
│  │                                                                │ │
│  │  Sub-Agent: llm-papers-research                               │ │
│  │  └─ Researching 31 essential LLM papers       ⏳ Running      │ │
│  │     Started: 12:13 UTC | Runtime: 13m                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ⏰ SCHEDULED TASKS                                                 │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  morning-meditation-prayer          Next: 9:00 AM ET today    │ │
│  │  morning-wellness-checkin           Next: 9:00 AM ET today    │ │
│  │  python-daily-learning              Next: 2:00 PM ET today    │ │
│  │  evening-meditation                 Next: 9:00 PM ET today    │ │
│  │  evening-wellness-checkin           Next: 9:00 PM ET today    │ │
│  │  nightly-memory-backup              Next: 4:00 AM UTC tmrw    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  📝 RECENT ACTIVITY                                                 │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  12:26  📄 Created mockup.md                                  │ │
│  │  12:24  📝 Created PLAN.md for dashboard                      │ │
│  │  12:13  🚀 Spawned sub-agent: llm-papers-research             │ │
│  │  12:02  🔍 Web search: WiFi EMF sleep quality                 │ │
│  │  11:57  💾 Updated memory/2026-02-12.md                       │ │
│  │  11:52  💾 Updated mei-patterns-journal.md                    │ │
│  │  05:21  🧘 First meditation (20 min reflection)               │ │
│  │  05:19  📄 Created meditation-log.md                          │ │
│  │  05:16  ⏰ Set up meditation cron jobs                         │ │
│  │  04:00  💾 Nightly backup completed                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  🧠 MEMORY & SOUL                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  SOUL.md                Last updated: Feb 7    [View]         │ │
│  │  IDENTITY.md            Last updated: Feb 7    [View]         │ │
│  │  USER.md                Last updated: Feb 7    [View]         │ │
│  │  MEMORY.md              Last updated: Feb 8    [View]         │ │
│  │                                                                │ │
│  │  Daily Memory Files:                                          │ │
│  │  └─ 2026-02-12.md      (Today, 3.2 KB)        [View]         │ │
│  │  └─ 2026-02-11.md      (Yesterday)            [View]         │ │
│  │  └─ 2026-02-10.md                             [View]         │ │
│  │                                                                │ │
│  │  meditation-log.md      Latest: Feb 12 12:25am [View]         │ │
│  │  mei-patterns-journal   Latest: Feb 12 6:52am  [View]         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  📚 PROJECTS & RESEARCH                                             │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Active Projects:                                             │ │
│  │  └─ nix-dashboard       In progress           [View]         │ │
│  │  └─ market-monitor      Active                [View]         │ │
│  │                                                                │ │
│  │  Research Repo: github.com/mei-chen/research                  │ │
│  │  └─ 3 commits ahead of origin/main            [Push]         │ │
│  │                                                                │ │
│  │  Active Research:                                             │ │
│  │  └─ LLM Essential Papers (31 papers)  ⏳ In progress          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ⚙️  SYSTEM                                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Workspace: /root/clawd                                       │ │
│  │  Git Status: Clean (last commit: 12:26 UTC)                  │ │
│  │  Last Backup: 4:00 AM UTC (8h ago)                           │ │
│  │  Disk Usage: 14.2 GB / 38.0 GB (37%)                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Color Scheme (Dark Mode Default)

```
Background:     #0f0f0f (very dark gray, almost black)
Panels:         #1a1a1a (dark gray)
Borders:        #333333 (medium gray)
Primary Text:   #e0e0e0 (light gray)
Secondary Text: #a0a0a0 (medium gray)
Accent:         #00d4aa (teal/cyan - matches the "Nix" ember vibe)
Success:        #00c48c (green)
Warning:        #ffa500 (orange)
Active:         #00d4aa (teal)
Running:        #ffa500 (orange)
```

## Interactive Elements

- **[View]** buttons open a modal or side panel with full file content
- **[Push]** button triggers git push
- **Status indicators**: 🟢 Active, 🟡 Working, 🔴 Error, ⚪ Idle
- **Auto-refresh**: Every 30 seconds (with manual refresh button)
- **Click session names** to expand and see more details
- **Click activity items** to see full context/logs

## Layout Principles

1. **Information Density**: Maximize useful info without overwhelming
2. **Scannable**: Easy to see status at a glance
3. **Hierarchical**: Most important info at top
4. **Expandable**: Click to drill down into details
5. **Real-time feel**: Updates feel responsive

---

This is what it'll look like. Clean, organized, all your key info visible.
