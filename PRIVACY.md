# Privacy policy
Xark Once Click Video Agent runs entirely on your computer.
- It sends the address of the page you choose to a local helper on your machine, which runs engine.
- The list of videos you saved (title, creator, counts, tags) is stored only in your browser's extension storage. Export or clear it any time from the dashboard.
- Optional in-page button: only if you turn it on, the browser asks for access to TikTok, Instagram, YouTube and X pages; it reads the links on the page you are viewing and sends them nowhere except your local helper.
- The helper's log keeps page addresses without query strings and is readable only by you.
- No analytics, no accounts, no remote servers, no data sold or shared.
- Instagram downloads may ask engine to read your Chrome cookies locally (only when an anonymous try fails). They never leave your computer.
- AI assistant (optional, off until you save your own Anthropic API key): when you press *Recommend* or *Auto-sort*, a capped summary of your saved videos (up to 60: platform, creator, title, first caption line, up to 6 tags, view/like counts, collection name) is sent to api.anthropic.com with your key. Video links, files and cookies are never sent. The key stays in this browser's extension storage; *Remove key* deletes it. Nothing is sent in the background.
- MCP server (optional): the extension writes a copy of your library (title, creator, counts, tags, caption, notes, collection, transcript if any; no file paths or cookies) to `~/.oneclick/library.json`, readable only by you. Nothing reads it unless you add the MCP server to your own Claude. Delete the file any time.
- Growth tracking: once a day the local helper asks the platform for the current public view, like and comment counts of up to 50 videos you saved.
