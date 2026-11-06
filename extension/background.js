const HOST = "com.barron.oneclick_dl";

function badge(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  chrome.action.setBadgeText({ text, tabId });
  if (text !== "...") setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 4000);
}

function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title, message });
}

async function download(url, tabId) {
  if (!/^https?:\/\//.test(url || "")) return notify("Not a page", "Open a video page first.");
  badge(tabId, "...", "#888");
  try {
    const res = await chrome.runtime.sendNativeMessage(HOST, { url });
    if (res && res.ok) {
      badge(tabId, "OK", "#1a9f4b");
      notify("Saved", res.file || "Download complete");
    } else {
      badge(tabId, "ERR", "#d33");
      notify("Download failed", (res && res.error) || "Unknown error");
    }
  } catch (e) {
    badge(tabId, "ERR", "#d33");
    notify("Host not reachable", String(e.message || e) + " - run host/install.sh");
  }
}

chrome.action.onClicked.addListener((tab) => download(tab.url, tab.id));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "dl-link", title: "Download video from this link", contexts: ["link"] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "dl-link") download(info.linkUrl, tab && tab.id);
});
