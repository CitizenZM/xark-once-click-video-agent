// Batch report: the newest enqueue action's jobs as CSV (url,state,reason,file,title).
const cell = (v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };

export function newestBatch(jobs = []) {
  const last = [...jobs].reverse().find((j) => j.batchId);
  return last ? jobs.filter((j) => j.batchId === last.batchId) : [];
}

export function batchCsv(jobs = []) {
  const rows = newestBatch(jobs).map((j) => [j.url, j.state, j.state === "error" ? j.error : j.reason, j.file, j.title].map(cell).join(","));
  return ["url,state,reason,file,title", ...rows].join("\n");
}
