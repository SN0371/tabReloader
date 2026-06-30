// Lädt Regeln aus dem Storage und erstellt Alarms für jeden aktiven Tab.
// Eine Regel: { id, domain, intervalSeconds, enabled }

const ALARM_PREFIX = "tab-reload-";

async function getRules() {
  const { rules = [] } = await chrome.storage.sync.get("rules");
  return rules;
}

function domainMatches(url, domain) {
  try {
    const { hostname } = new URL(url);
    // Unterstützt exakte Matches und Wildcard-Präfixe (z.B. "*.example.com")
    if (domain.startsWith("*.")) {
      const base = domain.slice(2);
      return hostname === base || hostname.endsWith("." + base);
    }
    return hostname === domain || hostname.endsWith("." + domain);
  } catch {
    return false;
  }
}

// Findet alle Tabs, die zu einer Regel passen, und gibt ihre IDs zurück.
async function getMatchingTabIds(domain) {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(tab => tab.url && domainMatches(tab.url, domain))
    .map(tab => tab.id);
}

// Räumt alle Alarms auf und baut sie anhand aktiver Regeln neu auf.
async function rebuildAlarms() {
  // Alle bestehenden Tab-Reload-Alarms löschen
  const existing = await chrome.alarms.getAll();
  for (const alarm of existing) {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  const rules = await getRules();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const intervalMinutes = rule.intervalSeconds / 60;
    chrome.alarms.create(ALARM_PREFIX + rule.id, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
  }
}

// Letzte Nutzerinteraktion pro Tab (überlebt Service-Worker-Neustarts dank storage.session)
async function recordActivity(tabId, timestamp) {
  const { activity = {} } = await chrome.storage.session.get("activity");
  activity[tabId] = timestamp;
  await chrome.storage.session.set({ activity });
}

async function getLastActivity(tabId) {
  const { activity = {} } = await chrome.storage.session.get("activity");
  return activity[tabId] || 0;
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "activity" && sender.tab) {
    recordActivity(sender.tab.id, message.timestamp);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { activity = {} } = await chrome.storage.session.get("activity");
  if (tabId in activity) {
    delete activity[tabId];
    await chrome.storage.session.set({ activity });
  }
});

// Alarm feuert → passende Tabs neu laden, außer der Nutzer war gerade aktiv
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const ruleId = alarm.name.slice(ALARM_PREFIX.length);
  const rules = await getRules();
  const rule = rules.find(r => r.id === ruleId);
  if (!rule || !rule.enabled) return;

  const tabIds = await getMatchingTabIds(rule.domain);
  const now = Date.now();
  for (const tabId of tabIds) {
    const lastActivity = await getLastActivity(tabId);
    if (now - lastActivity < rule.intervalSeconds * 1000) {
      // Nutzer hat die Seite innerhalb des Intervalls bedient (Session
      // dadurch vermutlich bereits aufgefrischt) → Reload überspringen
      continue;
    }
    try {
      await chrome.tabs.reload(tabId);
    } catch {
      // Tab wurde zwischenzeitlich geschlossen
    }
  }
});

// Regeln neu laden wenn Storage sich ändert
chrome.storage.onChanged.addListener((changes) => {
  if (changes.rules) {
    rebuildAlarms();
  }
});

// Beim Start der Extension Alarms aufbauen
chrome.runtime.onStartup.addListener(rebuildAlarms);
chrome.runtime.onInstalled.addListener(rebuildAlarms);
