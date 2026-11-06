import { videoUrls } from "./urls.js";
const $ = (id) => document.getElementById(id);
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const isVideo = !!(tab && tab.url && videoUrls([tab.url]).length);
$("dl").disabled = !isVideo;
$("hint").textContent = isVideo ? "" : "This tab is not a video page. Use “Select videos” on a feed or profile.";
$("dl").onclick = async () => {
  $("dl").disabled = true; $("status").textContent = "Downloading…";
  const r = await chrome.runtime.sendMessage({ type: "download-one", url: tab.url });
  $("status").textContent = r && r.ok ? "✓ Saved. Open the dashboard to see it." : "✗ " + ((r && r.error) || "Failed");
  $("dl").disabled = false;
};
$("sel").onclick = async () => {
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["select.js"] }); window.close(); }
  catch (e) { $("status").textContent = "Cannot select on this page: " + (e.message || e); }
};
$("dash").onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }); window.close(); };
