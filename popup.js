function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatInterval(seconds) {
  if (seconds < 60) return `${seconds} Sekunden`;
  const mins = seconds / 60;
  return mins === 1 ? "1 Minute" : `${mins} Minuten`;
}

async function getRules() {
  return new Promise(resolve => {
    chrome.storage.sync.get("rules", ({ rules = [] }) => resolve(rules));
  });
}

async function saveRules(rules) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ rules }, resolve);
  });
}

function renderRules(rules) {
  const list = document.getElementById("rules-list");
  list.innerHTML = "";

  if (rules.length === 0) {
    list.innerHTML = '<p class="empty-hint">Noch keine Regeln definiert.</p>';
    return;
  }

  for (const rule of rules) {
    const card = document.createElement("div");
    card.className = "rule-card";
    card.dataset.id = rule.id;
    card.innerHTML = `
      <div class="rule-info">
        <div class="rule-domain" title="${rule.domain}">${rule.domain}</div>
        <div class="rule-interval">alle ${formatInterval(rule.intervalSeconds)}</div>
      </div>
      <div class="rule-actions">
        <label class="toggle" title="${rule.enabled ? "Aktiv" : "Inaktiv"}">
          <input type="checkbox" ${rule.enabled ? "checked" : ""}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
        <button class="delete-btn" title="Regel löschen">✕</button>
      </div>
    `;

    const checkbox = card.querySelector("input[type=checkbox]");
    checkbox.addEventListener("change", async () => {
      const rules = await getRules();
      const r = rules.find(r => r.id === rule.id);
      if (r) {
        r.enabled = checkbox.checked;
        await saveRules(rules);
      }
    });

    card.querySelector(".delete-btn").addEventListener("click", async () => {
      card.style.opacity = "0.4";
      const rules = await getRules();
      await saveRules(rules.filter(r => r.id !== rule.id));
      renderRules(await getRules());
    });

    list.appendChild(card);
  }
}

async function prefillActiveTabDomain(domainInput) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const url = new URL(tab.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    domainInput.value = url.hostname;
  } catch {
    // Aktiver Tab nicht ermittelbar (z.B. interne Browser-Seite), Feld bleibt leer
  }
}

async function init() {
  const rules = await getRules();
  renderRules(rules);

  // Live-Updates wenn sich Storage ändert (z.B. aus anderem Popup)
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.rules) {
      renderRules(changes.rules.newValue || []);
    }
  });

  const addBtn = document.getElementById("add-btn");
  const domainInput = document.getElementById("domain");
  const intervalInput = document.getElementById("interval");
  const unitSelect = document.getElementById("unit");

  await prefillActiveTabDomain(domainInput);

  // Zeige Fehler-Element dynamisch an
  let errorEl = document.createElement("p");
  errorEl.className = "error-msg";
  addBtn.parentNode.insertBefore(errorEl, addBtn.nextSibling);

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add("visible");
  }

  function clearError() {
    errorEl.classList.remove("visible");
  }

  addBtn.addEventListener("click", async () => {
    clearError();
    const domain = domainInput.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const intervalVal = parseInt(intervalInput.value, 10);
    const unitVal = parseInt(unitSelect.value, 10);

    if (!domain) {
      showError("Bitte eine Domain eingeben.");
      domainInput.focus();
      return;
    }

    if (!domain.includes(".")) {
      showError("Bitte eine gültige Domain eingeben (z.B. cloud.oracle.com).");
      domainInput.focus();
      return;
    }

    if (isNaN(intervalVal) || intervalVal < 1) {
      showError("Intervall muss mindestens 1 sein.");
      intervalInput.focus();
      return;
    }

    // Mindestens 60 Sekunden wegen Alarm-API-Limit
    const intervalSeconds = intervalVal * unitVal;
    if (intervalSeconds < 60) {
      showError("Minimum-Intervall: 1 Minute (60 Sekunden).");
      return;
    }

    const rules = await getRules();
    if (rules.some(r => r.domain === domain)) {
      showError("Für diese Domain existiert bereits eine Regel.");
      domainInput.focus();
      return;
    }

    rules.push({ id: generateId(), domain, intervalSeconds, enabled: true });
    await saveRules(rules);
    renderRules(rules);

    domainInput.value = "";
    intervalInput.value = "5";
    unitSelect.value = "60";
    domainInput.focus();
  });

  domainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
}

init();
