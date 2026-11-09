// Injected by the popup ("Save comments on this page"): reads the comments the open video page shows, most-liked
// first, and hands them to the background (which keeps them only for videos already in the library).
// TikTok: the comments panel of a video page. Instagram: the comments of a post / reel page. Nothing is clicked.
(() => {
  const n = (t) => { const m = /^([\d.,]+)\s*([KkMm万])?$/.exec(String(t || "").trim()); if (!m) return 0; const x = parseFloat(m[1].replace(/,/g, "")); return Math.round(x * ({ k: 1e3, m: 1e6, 万: 1e4 }[(m[2] || "").toLowerCase()] || 1)); };
  const out = [], seen = new Set();
  const add = (text, likes) => { text = String(text || "").replace(/\s+/g, " ").trim(); if (text && !seen.has(text)) { seen.add(text); out.push({ text: text.slice(0, 300), likes }); } };
  if (/tiktok\.com$/.test(location.hostname)) {
    for (const c of document.querySelectorAll('[data-e2e="comment-level-1"]')) {
      const box = c.closest('[class*="CommentItem"], [class*="DivCommentContentContainer"], li, div') || c.parentElement;
      add(c.innerText, n(box && box.querySelector('[data-e2e="comment-like-count"]')?.innerText));
    }
  } else if (/instagram\.com$/.test(location.hostname)) {
    // each comment row: a profile link followed by the text span; the "N likes" line sits in the same row
    for (const li of document.querySelectorAll("ul li, div[role='button'] ~ div ul > div")) {
      const spans = [...li.querySelectorAll("span[dir='auto']")].map((s) => s.innerText).filter((t) => t && t.length > 2 && !/^\d+[wdhm]$/.test(t));
      const likes = /([\d.,]+[KkMm]?) likes?/.exec(li.innerText || "");
      if (spans.length) add(spans[spans.length - 1], likes ? n(likes[1]) : 0);
    }
  }
  out.sort((a, b) => b.likes - a.likes);
  return { url: location.href.split("?")[0], comments: out.slice(0, 60) };
})();
