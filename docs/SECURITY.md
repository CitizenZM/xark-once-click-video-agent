# Security notes

Round-9 independent review (a separate reviewer read the code cold; no high-severity findings). Fixed in 2.9.0:

| Finding | Fix |
|---|---|
| Profile pages could make the helper fetch loopback / private / link-local addresses | Helper refuses those targets for downloads and for every URL a profile lists; the extension also re-filters listed URLs through its platform allowlist |
| `curl \| bash` could register a helper from the current folder; unpinned `git pull` | Installer only trusts a real script path, clones into `~/.oneclick-downloader`, prints the commit, supports `ONECLICK_REF=<tag or commit>` |
| Unescaped numeric metadata in the dashboard; non-http(s) links | Numbers are coerced when stored and escaped when shown; links render only for http(s) |
| `notinstagram.com` matched the Instagram cookie fallback | Exact host match |
| Full URLs (with tokens) in the helper log and error list | Query strings removed (YouTube `?v=` kept); log file mode 0600, rotated at 1 MB |
| `%` in a custom folder acted as a the engine template | Escaped |
| Bad input could leave a request unanswered | Helper always replies; extension times out after 20 minutes |
| Any extension context could send privileged messages | Download, update, library and settings actions only from the extension's own pages; the content script may only act on its own page |
| `unlimitedStorage` | Removed; library capped at 5000 entries |

Known limits: a hostname that resolves to a private address (DNS rebinding) is not blocked; one-click on an arbitrary page still downloads that page when you click, by design.
