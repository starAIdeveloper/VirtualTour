import {
  initialProject,
  validateProject,
  removeScene,
  analytics,
  csv,
  THEMES,
} from "./model.js";
import { createViewer } from "./viewer.js";
const references = Object.values(
  import.meta.glob("../docs/reference/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let project = initialProject(),
  events = [],
  page = "Dashboard",
  current = project.start,
  viewer = null,
  view = { yaw: 0, pitch: 0, fov: 70 },
  showHotspots = true,
  rotating = false,
  autoTimer = null,
  info = null,
  placing = false,
  editingMap = false,
  panoramas = new Map(),
  images = [],
  result = null,
  overlap = 0.32,
  worker = null,
  busy = false,
  visitedAt = null,
  trackedScene = null;
try {
  const saved = localStorage.getItem("virtualtour-project-v1");
  if (saved) project = validateProject(JSON.parse(saved));
  current = project.start;
  const ev = JSON.parse(localStorage.getItem("virtualtour-events-v1") || "[]");
  if (
    Array.isArray(ev) &&
    ev.length <= 2000 &&
    ev.every(
      (e) =>
        e &&
        ["visit", "hotspot", "dwell"].includes(e.type) &&
        typeof e.scene === "string" &&
        typeof e.date === "string" &&
        (!("seconds" in e) || (Number.isFinite(e.seconds) && e.seconds >= 0)),
    )
  )
    events = ev;
} catch {}
const pages = [
    "Dashboard",
    "Tours",
    "Virtual Tour Player",
    "Panorama Stitching",
    "Navigation Map",
    "CV Processing",
    "Analytics",
    "Settings",
  ],
  icons = ["⌂", "▱", "▷", "▧", "♧", "⚙", "▥", "◉"];
const scene = () =>
  project.scenes.find((s) => s.id === current) || project.scenes[0];
function toast(m) {
  $("#toast").textContent = m;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function persist() {
  try {
    localStorage.setItem("virtualtour-project-v1", JSON.stringify(project));
    localStorage.setItem("virtualtour-events-v1", JSON.stringify(events));
  } catch {
    toast("Local storage unavailable. Export your project as a backup.");
  }
}
function transaction(update) {
  const next = structuredClone(project),
    previous = current;
  try {
    update(next);
    validateProject(next);
  } catch (err) {
    current = previous;
    throw err;
  }
  project = next;
  persist();
  render();
}
function log(type, extra = {}) {
  events.push({
    type,
    scene: current,
    date: new Date().toISOString(),
    ...extra,
  });
  events = events.slice(-2000);
  persist();
}
function endVisit() {
  if (visitedAt !== null) {
    const seconds = (performance.now() - visitedAt) / 1000;
    if (seconds > 0) {
      const old = current;
      current = trackedScene;
      log("dwell", { seconds });
      current = old;
    }
    visitedAt = null;
    trackedScene = null;
  }
}
function visit(id) {
  endVisit();
  current = id;
  view = { yaw: 0, pitch: 0, fov: 70 };
  info = null;
  log("visit");
  trackedScene = id;
  visitedAt = performance.now();
}
function stopAuto() {
  clearInterval(autoTimer);
  autoTimer = null;
}
function openScene(id) {
  stopAuto();
  visit(id);
  page = "Virtual Tour Player";
  render();
}
function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function imageDownload(data, name) {
  const a = document.createElement("a");
  a.href = data;
  a.download = name;
  a.click();
}
const btn = (label, action, cls = "") =>
    `<button data-action="${action}" class="${cls}">${label}</button>`,
  card = (title, body, cls = "") =>
    `<section class="card ${cls}"><h3>${title}<span>•••</span></h3><div class="body">${body}</div></section>`;
function metrics() {
  const a = analytics(events, project.scenes);
  return `<div class="metrics">${[
    ["▱", "Tour scenes", project.scenes.length, "Editable scene collection"],
    [
      "▧",
      "Loaded panoramas",
      panoramas.size,
      "Session assets · export to preserve",
    ],
    [
      "♧",
      "Hotspots",
      project.scenes.reduce((n, s) => n + s.hotspots.length, 0),
      "Scene links and information",
    ],
    ["▥", "Local scene visits", a.visits, "This browser only"],
  ]
    .map(
      ([icon, label, n, sub]) =>
        `<div class="metric"><div class="metric-icon">${icon}</div><div><small>${label}</small><strong>${n}</strong><p>${sub}</p></div><svg viewBox="0 0 80 30" aria-hidden="true"><path d="M1 26L8 16L17 21L25 10L35 17L45 5L53 12L65 2L77 9" fill="none" stroke="#05a9d9"/></svg></div>`,
    )
    .join("")}</div>`;
}
function player(compact = false) {
  return `<div class="player ${compact ? "compact" : ""}" id="player"><div id="viewport"></div><div class="scene-caption"><span>◉</span><div><b>${esc(scene().name)}</b><small>${panoramas.has(current) ? "Uploaded 360° panorama" : "Interactive architectural sample"}</small></div></div><div class="player-top">${btn("◉ Hotspots", "hotspots")}${compact ? btn("Open Tour ↗", "open-tour", "orange") : ""}</div><div class="view-controls">${btn("‹", "left")}${btn(rotating ? "Ⅱ" : "▶", "rotate")}${btn("›", "right")}${btn("−", "zoom-out")}${btn("+", "zoom-in")}${btn("⛶", "fullscreen")}${btn("▧", "capture")}</div>${placing ? '<div class="place-notice">Click the view to place a hotspot · drag to look around</div>' : ""}</div>`;
}
function scenesStrip() {
  return `<div class="scenes-strip">${project.scenes.map((s, i) => `<button data-scene="${esc(s.id)}" class="${s.id === current ? "selected" : ""}"><span class="scene-graphic ${s.theme}"><b>${String(i + 1).padStart(2, "0")}</b><i>◈</i></span><span>${esc(s.name)}</span></button>`).join("")}</div>`;
}
function mapSvg() {
  const lines = [];
  const seen = new Set();
  for (const s of project.scenes)
    for (const h of s.hotspots)
      if (h.kind === "link") {
        const t = project.scenes.find((x) => x.id === h.target),
          key = [s.id, t.id].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          lines.push(
            `<path d="M${s.map[0] * 700} ${s.map[1] * 420}L${t.map[0] * 700} ${t.map[1] * 420}"/>`,
          );
        }
      }
  return `<svg class="floor-map ${editingMap ? "editing" : ""}" viewBox="0 0 700 420" aria-label="Tour scene navigation map"><defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#12374b" stroke-width=".6"/></pattern></defs><rect width="700" height="420" fill="url(#grid)"/><g class="walls"><path d="M35 32H665V385H35ZM45 45H335V190H45ZM365 45H655V190H365ZM45 220H335V375H45ZM365 220H655V375H365Z"/><path d="M335 70H365M335 110H365M120 190V220M160 190V220M500 190V220M540 190V220" stroke-width="4"/></g><g class="paths">${lines.join("")}</g>${project.scenes.map((s, i) => `<g data-map="${esc(s.id)}" transform="translate(${s.map[0] * 700} ${s.map[1] * 420})" tabindex="0" role="button" aria-label="Open ${esc(s.name)}"><circle r="20" fill="${s.id === current ? "#ff951e" : "#02b7cc"}" opacity=".2"/><circle r="12" fill="#052637" stroke="${s.id === current ? "#ff951e" : "#00c9dd"}" stroke-width="3"/><text text-anchor="middle" y="4" fill="white" font-size="10">${i + 1}</text><text text-anchor="middle" y="37" fill="#b9d8e9" font-size="13">${esc(s.name)}</text></g>`).join("")}</svg>`;
}
function dashboard() {
  return `${metrics()}${player(true)}<div class="columns three">${card("▱ Recent Scenes", project.scenes.map((s) => `<button class="scene-row" data-scene="${esc(s.id)}"><span class="mini-scene ${s.theme}">◈</span><span><b>${esc(s.name)}</b><small>${s.hotspots.length} hotspots</small></span><i>${s.id === project.start ? "Start" : "Open"}</i></button>`).join(""))}${card("♧ Navigation Map", `${mapSvg()}${btn("View Map →", "map")}`)}${card("▥ Local Activity", activitySummary())}</div>`;
}
function activitySummary() {
  const a = analytics(events, project.scenes);
  return `<div class="activity-number">${a.visits}<small>local scene visits</small></div><p>${a.clicks} hotspot clicks · ${a.unique} scenes explored</p><div class="bar"><span style="width:${a.completion}%"></span></div><p>${a.completion}% of current scenes visited</p><p class="muted">Counts reflect your interactions in this browser. No external visitor tracking is connected.</p>${btn("Explore analytics →", "analytics")}`;
}
function playerPage() {
  return `<div class="player-layout"><div>${player()}${card("▧ Scenes", scenesStrip())}${card("▱ Floor Plan / Navigation Map", mapSvg())}</div><aside>${card("♧ Scene Details", `<span class="tag">${info ? "INFORMATION" : "CURRENT SCENE"}</span><h2>${esc(info?.label || scene().name)}</h2><p>${esc(info?.text || scene().description)}</p><p class="muted">${panoramas.has(current) ? "Equirectangular panorama" : "Procedural " + scene().theme + " environment"}</p><div class="stack">${btn("⚑ Set as Start Scene", "set-start")}${btn(autoTimer ? "Stop Auto Tour" : "▶ Auto Tour", "auto-tour", "orange")}${btn("Edit Scene", "edit-scene")}</div>`)}${card("◉ Hotspots", hotspotList())}${card("Controls", '<p class="muted">Drag to look around. Wheel or +/− to zoom. Use arrow keys in the player to turn; use scene links or the map to change rooms.</p>')}</aside></div>`;
}
function hotspotList() {
  return (
    scene()
      .hotspots.map(
        (h) =>
          `<div class="hotspot-row"><button data-hotspot="${esc(h.id)}"><span>${h.kind === "info" ? "ⓘ" : "↗"}</span><b>${esc(h.label)}</b></button><button data-edit-hotspot="${esc(h.id)}" aria-label="Edit ${esc(h.label)}">✎</button><button data-delete-hotspot="${esc(h.id)}" aria-label="Delete ${esc(h.label)}">×</button></div>`,
      )
      .join("") || '<p class="muted">No hotspots. Add one in Tours.</p>'
  );
}
function tours() {
  return `<div class="toolbar">${btn("+ Add Scene", "add-scene", "orange")}${btn("+ Add Hotspot", "add-hotspot")}${btn(placing ? "Cancel Placement" : "Click to Place Hotspot", "place-hotspot")}${btn("Upload 360° Panorama", "panorama")}${btn("Edit Current Scene", "edit-scene")}</div><div class="player-layout"><div>${player()}${card("▧ Tour Scenes", scenesStrip())}</div><aside>${card("Hotspot & Scene Properties", `<h2>${esc(scene().name)}</h2><p>${esc(scene().description)}</p>${hotspotList()}<div class="stack">${btn("Set as Start Scene", "set-start")}${btn("Use Procedural Environment", "remove-panorama")}${btn("Delete Current Scene", "delete-scene", "danger")}</div>`)}${card("Scene Asset", '<p class="muted">Use a full 2:1 equirectangular panorama for uploaded 360° viewing. Panoramas stay in memory until exported in a project backup. Procedural rooms are included as the initial sample.</p>')}</aside></div>`;
}
function navigation() {
  return `<div class="columns dominant">${card("▱ Tour Navigation Map", `${btn(editingMap ? "Finish Editing" : "Edit Map Positions", "edit-map", editingMap ? "orange" : "")}${mapSvg()}<p class="muted">${editingMap ? "Drag scene markers to reposition them." : "Select a marker to enter its scene."} This schematic map shows tour links, not measured room geometry.</p>`)}${card(
    "Scene Connections",
    project.scenes
      .map(
        (s) =>
          `<div class="connection"><b>${esc(s.name)}</b><p>${
            s.hotspots
              .filter((h) => h.kind === "link")
              .map((h) => esc(h.label))
              .join(" → ") || "No outgoing scene links"
          }</p><button data-scene="${esc(s.id)}">Open Scene</button></div>`,
      )
      .join(""),
  )}</div>`;
}
function stitching() {
  return `<div class="toolbar">${btn("Add Source Images", "sources", "orange")}${btn("Load Sample Pair", "sample-images")}${btn("Clear All", "clear-images")}<label>Overlap <input id="overlap" type="range" min=".05" max=".75" step=".01" value="${overlap}"><span id="overlap-label">${Math.round(overlap * 100)}%</span></label>${btn("▶ Process & Blend", "process", "primary")}${btn("Cancel", "cancel-process")}</div><div class="source-strip">${images.map((im, i) => `<div><canvas class="source" data-source="${i}" width="${im.width}" height="${im.height}"></canvas><small>${esc(im.name)}</small></div>`).join("") || '<div class="empty">Add 2–8 images ordered left to right, or load the synthetic sample pair.</div>'}</div><div class="columns dominant"><div>${card("▧ Panorama Blending Preview", `<canvas id="blend-output" width="${result?.output.width || 800}" height="${result?.output.height || 280}" aria-label="Blended panorama preview"></canvas><div class="toolbar">${btn("Export Blended PNG", "export-blend")}${btn("Use as 360° Scene", "use-blend")}</div><p class="muted">Manual horizontal placement and linear feather blending. No homography, lens correction or automatic geometric alignment is applied. Use as 360° only for a complete 2:1 equirectangular result.</p>`)}${card("Processing Status", `<p id="processing-state" role="status">${busy ? "Processing images…" : result ? "Processing complete" : "Ready · no results yet"}</p><div class="pipeline"><span>Image Input</span><span>Harris Corners</span><span>Patch Matching</span><span>Feather Blend</span></div>`)}</div>${card("✧ CV Diagnostics", diagnostics())}</div>`;
}
function diagnostics() {
  if (!result)
    return '<p class="muted">Process a pair to calculate keypoints, patch matches and a translation diagnostic. These are real image-derived measurements.</p>';
  return `<div class="diagnostic-stats"><div><strong>${result.features[0].length} / ${result.features[1].length}</strong><small>Harris corners · images 1 / 2</small></div><div><strong>${result.matches.length}</strong><small>Ratio-filtered patch matches</small></div><div><strong>${result.alignment?.inliers ?? "—"}</strong><small>Translation-consistent matches</small></div><div><strong>${result.alignment?.rms?.toFixed(2) ?? "—"} px</strong><small>Translation residual (inliers only)</small></div></div><canvas id="feature-canvas" width="${images[0].width}" height="${images[0].height}" aria-label="Harris corner detection"></canvas><canvas id="match-canvas" width="${images[0].width + images[1].width}" height="${Math.max(images[0].height, images[1].height)}" aria-label="Image patch matching"></canvas><p class="muted">Harris corners, normalized 7×7 patches and nearest-neighbor ratio filtering. Translation is a median-offset diagnostic; it is not used to warp the blended output.</p>`;
}
function processing() {
  return `<div class="toolbar">${btn("Open Stitching Workspace →", "stitching", "orange")}</div><div class="columns">${card("✧ Keypoint Detection & Feature Matching", diagnostics())}${card("Processing Pipeline", `<h2>Local Canvas + JavaScript</h2><p>Images are resized to a common working height. A worker computes Harris corners, normalized patch descriptors, one-to-one ratio-filtered matches, translation consistency and manual-overlap feather blending.</p><div class="notice">The reference designs mention OpenCV/ORB/SIFT/RANSAC. Those libraries and algorithms are not bundled here. This implementation exposes its own processing results without simulated confidence scores.</div><p>${images.length} input images · ${result ? result.output.width + " × " + result.output.height : "No output"}</p>`)}</div>`;
}
function analyticsPage() {
  const a = analytics(events, project.scenes),
    dwell = events
      .filter((e) => e.type === "dwell")
      .reduce((n, e) => n + (e.seconds || 0), 0);
  return `${metrics()}<div class="columns dominant">${card("▥ Scene Visit Distribution", `<div class="visit-bars">${a.counts.map((s) => `<div><span>${esc(s.name)}</span><div class="bar"><span style="width:${(s.count / Math.max(1, ...a.counts.map((x) => x.count))) * 100}%"></span></div><b>${s.count}</b></div>`).join("")}</div>`)}${card("Session Summary", `${activitySummary()}<p>Recorded dwell time: ${(dwell / 60).toFixed(2)} min</p><p class="muted">Dwell is recorded when leaving a scene or the player. Visit totals are scene entries, not unique people.</p>`)}</div><div class="columns">${card("▱ Local Visit Map", mapSvg())}${card("Hotspot Engagement", `<table><thead><tr><th>Scene</th><th>Clicks</th></tr></thead><tbody>${a.counts.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.clicks}</td></tr>`).join("")}</tbody></table>`)}</div>${card(
    "Recent Local Events",
    `<div class="toolbar">${btn("Export CSV", "events-csv")}${btn("Clear Activity", "clear-events")}</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Scene</th><th>Detail</th></tr></thead><tbody>${
      events
        .slice(-30)
        .reverse()
        .map(
          (e) =>
            `<tr><td>${esc(e.date)}</td><td>${esc(e.type)}</td><td>${esc(project.scenes.find((s) => s.id === e.scene)?.name || "Removed scene")}</td><td>${esc(e.label || (e.seconds !== undefined ? e.seconds.toFixed(1) + " seconds" : ""))}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="4">No local activity recorded. Open the player to begin.</td></tr>'
    }</tbody></table></div>`,
  )}`;
}
function settings() {
  return `${card("Project Storage & Export", `<h2>${esc(project.title)}</h2><div class="stack">${btn("Export Project JSON (including panoramas)", "export-project", "orange")}${btn("Import Project JSON", "import-project")}${btn("Reset Demo Project", "reset", "danger")}</div><p>Scene metadata and local activity autosave in this browser. Uploaded panoramas remain session-only until exported. Source stitching images and blend results are not included in project files.</p><p>No backend, public publishing service, VR headset integration or external visitor analytics is configured. The app runs locally.</p>`)}${card("Supplied Design References", `<p class="muted">User-provided design targets. Their metrics and image-processing overlays are illustrative.</p><div class="reference-grid">${references.map((url, i) => `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Virtual tour design reference ${i + 1}" loading="lazy"></a>`).join("")}</div>`)}`;
}
function render() {
  viewer?.dispose();
  $("#app").innerHTML =
    `<header><div class="brand-mark">◉</div><div><h1>VirtualTour <em>Studio</em></h1><p>Capture <i>·</i> Process <i>·</i> Stitch <i>·</i> Explore</p></div><div class="header-right"><span>Turn spaces into interactive experiences</span><small>LOCAL WORKSPACE · v1.0</small></div></header><nav>${pages.map((v, i) => `<button class="${page === v ? "active" : ""}" data-page="${v}"><span>${icons[i]}</span>${v}</button>`).join("")}<div class="nav-status"><i></i> Local workspace<br><small>Three.js · Canvas · Web Worker</small></div></nav><main><div class="page-heading"><h2>${page}</h2><span>${esc(project.title)}</span></div>${{ Dashboard: dashboard, Tours: tours, "Virtual Tour Player": playerPage, "Panorama Stitching": stitching, "Navigation Map": navigation, "CV Processing": processing, Analytics: analyticsPage, Settings: settings }[page]()}</main>`;
  if ($("#viewport"))
    viewer = createViewer(
      $("#viewport"),
      {
        scene: scene(),
        panorama: panoramas.get(current),
        ...view,
        auto: rotating,
        showHotspots,
      },
      {
        hotspot: activateHotspot,
        view: (s) => {
          view = { yaw: s.yaw, pitch: s.pitch, fov: s.fov };
        },
        place: (anchor) => {
          if (placing) {
            placing = false;
            hotspotDialog(null, anchor);
          }
        },
      },
    );
  drawImages();
  setBusy();
}
function activateHotspot(h) {
  log("hotspot", { label: h.label });
  if (h.kind === "link") openScene(h.target);
  else {
    info = h;
    page = "Virtual Tour Player";
    render();
  }
}
function modal(title, fields, submit) {
  const d = $("#modal");
  d.innerHTML = `<form><h2>${title}</h2>${fields}<p id="form-error" role="alert"></p><div class="toolbar"><button type="button" id="cancel-modal">Cancel</button><button class="orange" type="submit">Save</button></div></form>`;
  $("#cancel-modal").onclick = () => d.close();
  d.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    try {
      submit(new FormData(e.target));
      d.close();
    } catch (err) {
      $("#form-error").textContent = err.message;
    }
  };
  d.showModal();
}
const field = (label, name, value = "", type = "text") =>
  `<label class="field">${label}<input name="${name}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${esc(value)}" ${type === "text" ? 'maxlength="80"' : ""} required></label>`;
function sceneDialog(edit = false) {
  const s = edit
    ? scene()
    : { name: "New Scene", description: "", theme: "gallery" };
  modal(
    edit ? "Edit Scene" : "Add Scene",
    field("Scene name", "name", s.name) +
      `<label class="field">Environment<select name="theme">${THEMES.map((t) => `<option ${t === s.theme ? "selected" : ""}>${t}</option>`).join("")}</select></label><label class="field">Description<textarea name="description" maxlength="500">${esc(s.description)}</textarea></label>`,
    (d) => {
      const name = d.get("name").trim(),
        description = d.get("description"),
        theme = d.get("theme");
      transaction((p) => {
        if (edit)
          Object.assign(
            p.scenes.find((x) => x.id === current),
            { name, description, theme },
          );
        else {
          const id = crypto.randomUUID();
          p.scenes.push({
            id,
            name,
            description,
            theme,
            map: [0.5, 0.5],
            hotspots: [],
          });
          current = id;
        }
      });
    },
  );
}
function hotspotDialog(h = null, anchor = view) {
  const item = h || {
    label: "New Hotspot",
    kind: "link",
    target: project.scenes.find((s) => s.id !== current)?.id || current,
    text: "",
    yaw: Math.max(-180, Math.min(180, anchor.yaw)),
    pitch: anchor.pitch,
  };
  modal(
    h ? "Edit Hotspot" : "Add Hotspot",
    field("Label", "label", item.label) +
      `<label class="field">Type<select name="kind"><option value="link" ${item.kind === "link" ? "selected" : ""}>Scene Link</option><option value="info" ${item.kind === "info" ? "selected" : ""}>Information</option></select></label><label class="field">Target Scene<select name="target">${project.scenes.map((s) => `<option value="${esc(s.id)}" ${s.id === item.target ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><label class="field">Information text<textarea name="text" maxlength="500">${esc(item.text || "")}</textarea></label>${field("Yaw (−180 to 180)", "yaw", item.yaw.toFixed(1), "number")}${field("Pitch (−70 to 70)", "pitch", item.pitch.toFixed(1), "number")}`,
    (d) => {
      const data = {
        id: h?.id || crypto.randomUUID(),
        label: d.get("label").trim(),
        kind: d.get("kind"),
        target: d.get("target"),
        text: d.get("text"),
        yaw: Number(d.get("yaw")),
        pitch: Number(d.get("pitch")),
      };
      transaction((p) => {
        const s = p.scenes.find((s) => s.id === current);
        if (h) s.hotspots[s.hotspots.findIndex((x) => x.id === h.id)] = data;
        else s.hotspots.push(data);
      });
    },
  );
}
function drawImages() {
  document
    .querySelectorAll("canvas.source")
    .forEach((c) =>
      c.getContext("2d").putImageData(images[Number(c.dataset.source)], 0, 0),
    );
  if (!result) return;
  if ($("#blend-output"))
    $("#blend-output")
      .getContext("2d")
      .putImageData(
        new ImageData(
          result.output.data,
          result.output.width,
          result.output.height,
        ),
        0,
        0,
      );
  const feature = $("#feature-canvas");
  if (feature) {
    const c = feature.getContext("2d");
    c.putImageData(images[0], 0, 0);
    c.strokeStyle = "#00e6a6";
    for (const p of result.features[0]) {
      c.beginPath();
      c.arc(p.x, p.y, 3, 0, Math.PI * 2);
      c.stroke();
    }
  }
  const match = $("#match-canvas");
  if (match) {
    const c = match.getContext("2d"),
      offset = images[0].width;
    c.putImageData(images[0], 0, 0);
    c.putImageData(images[1], offset, 0);
    result.matches.slice(0, 100).forEach((m, i) => {
      c.strokeStyle = `hsl(${(i * 37) % 360} 90% 60%)`;
      c.beginPath();
      c.moveTo(m.a.x, m.a.y);
      c.lineTo(m.b.x + offset, m.b.y);
      c.stroke();
    });
  }
}
function setBusy() {
  document
    .querySelectorAll(
      "[data-action=process],[data-action=sources],[data-action=sample-images],[data-action=clear-images],#overlap",
    )
    .forEach((b) => (b.disabled = busy));
}
function sampleImages() {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 280;
  const x = c.getContext("2d");
  const grad = x.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, "#b6a58b");
  grad.addColorStop(0.65, "#e8dbc6");
  grad.addColorStop(1, "#7b858c");
  x.fillStyle = grad;
  x.fillRect(0, 0, 1280, 280);
  for (let i = 0; i < 18; i++) {
    x.fillStyle = ["#3e7180", "#a25945", "#56705a", "#bea061"][i % 4];
    x.fillRect(30 + i * 70, 35 + (i % 3) * 10, 44, 130 - (i % 4) * 10);
    x.strokeStyle = "#e6c487";
    x.lineWidth = 5;
    x.strokeRect(30 + i * 70, 35 + (i % 3) * 10, 44, 130 - (i % 4) * 10);
    x.fillStyle = "#0f243b";
    x.font = "16px sans-serif";
    x.fillText(String(i + 1), 45 + i * 70, 90);
  }
  x.strokeStyle = "#d6c7aa";
  for (let i = 0; i < 20; i++) {
    x.beginPath();
    x.moveTo(i * 70, 190);
    x.lineTo(i * 80 - 60, 280);
    x.stroke();
  }
  images = [x.getImageData(0, 0, 760, 280), x.getImageData(520, 0, 760, 280)];
  images.forEach((im, i) => (im.name = "Synthetic gallery " + (i + 1)));
  overlap = 240 / 760;
  result = null;
  render();
}
function process() {
  if (busy) return;
  if (images.length < 2) return toast("Add 2–8 images first");
  busy = true;
  setBusy();
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e) => {
    if (e.data.error) {
      cancelProcess();
      toast(e.data.error);
    } else if (e.data.done) {
      result = e.data;
      cancelProcess();
      render();
      toast("Processing completed");
    } else if ($("#processing-state"))
      $("#processing-state").textContent = e.data.phase;
  };
  worker.onerror = () => {
    cancelProcess();
    toast("Image worker failed");
  };
  worker.postMessage({ images, overlap });
}
function cancelProcess() {
  worker?.terminate();
  worker = null;
  busy = false;
  setBusy();
}
async function readBitmap(file, maxSize = 4096) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 12000000
  )
    throw Error("Use PNG/JPEG/WebP up to 12 MB");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 32000000) {
    bitmap.close();
    throw Error("Image exceeds 32 megapixels");
  }
  if (bitmap.width > maxSize) {
    const c = document.createElement("canvas");
    c.width = maxSize;
    c.height = Math.round((bitmap.height * maxSize) / bitmap.width);
    c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();
    return createImageBitmap(c);
  }
  return bitmap;
}
async function exportProject() {
  const assets = {};
  for (const [id, im] of panoramas) {
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    c.getContext("2d").drawImage(im, 0, 0);
    let quality = 0.85;
    assets[id] = c.toDataURL("image/jpeg", quality);
    while (assets[id].length > 5000000 && quality > 0.35) {
      quality -= 0.1;
      assets[id] = c.toDataURL("image/jpeg", quality);
    }
    if (assets[id].length > 5000000)
      throw Error(
        "Panorama is too large for a portable project. Use a smaller image.",
      );
  }
  const content = JSON.stringify({ project, panoramas: assets }, null, 2);
  if (new Blob([content]).size > 32000000)
    throw Error(
      "Project exceeds the 32 MB portable format limit. Remove or resize panorama assets.",
    );
  download("virtualtour-project.json", content);
}
const actions = {
  "open-tour": () => openScene(current),
  map: () => {
    page = "Navigation Map";
    render();
  },
  analytics: () => {
    page = "Analytics";
    render();
  },
  stitching: () => {
    page = "Panorama Stitching";
    render();
  },
  "add-scene": () => sceneDialog(),
  "edit-scene": () => sceneDialog(true),
  "add-hotspot": () => hotspotDialog(),
  "place-hotspot": () => {
    placing = !placing;
    render();
  },
  "set-start": () => {
    transaction((p) => (p.start = current));
    toast("Start scene updated");
  },
  "delete-scene": () => {
    if (!confirm("Delete this scene and its incoming links?")) return;
    const id = current;
    transaction((p) => {
      removeScene(p, id);
      current = p.start;
    });
    panoramas.get(id)?.close?.();
    panoramas.delete(id);
  },
  "remove-panorama": () => {
    panoramas.get(current)?.close?.();
    panoramas.delete(current);
    render();
  },
  panorama: () => $("#panorama-upload").click(),
  "edit-map": () => {
    editingMap = !editingMap;
    render();
  },
  hotspots: () => {
    showHotspots = !showHotspots;
    viewer?.update({ showHotspots });
  },
  left: () => {
    view = viewer.state();
    view.yaw -= 20;
    viewer.update(view);
  },
  right: () => {
    view = viewer.state();
    view.yaw += 20;
    viewer.update(view);
  },
  "zoom-in": () => {
    view = viewer.state();
    view.fov = Math.max(35, view.fov - 5);
    viewer.update(view);
  },
  "zoom-out": () => {
    view = viewer.state();
    view.fov = Math.min(100, view.fov + 5);
    viewer.update(view);
  },
  rotate: () => {
    rotating = !rotating;
    viewer?.update({ auto: rotating });
    $("[data-action=rotate]").textContent = rotating ? "Ⅱ" : "▶";
  },
  fullscreen: async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("#player")?.requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser");
    }
  },
  capture: () => {
    const data = viewer?.capture();
    if (data) imageDownload(data, "virtualtour-view.png");
    else toast("WebGL capture unavailable");
  },
  "auto-tour": () => {
    if (autoTimer) stopAuto();
    else
      autoTimer = setInterval(() => {
        const i = project.scenes.findIndex((s) => s.id === current);
        visit(project.scenes[(i + 1) % project.scenes.length].id);
        render();
      }, 10000);
    render();
  },
  sources: () => $("#source-upload").click(),
  "sample-images": sampleImages,
  "clear-images": () => {
    images = [];
    result = null;
    render();
  },
  process,
  "cancel-process": () => {
    cancelProcess();
    render();
    toast("Image processing cancelled");
  },
  "export-blend": () => {
    if (!result) return toast("Process images first");
    const c = document.createElement("canvas");
    c.width = result.output.width;
    c.height = result.output.height;
    c.getContext("2d").putImageData(
      new ImageData(result.output.data, c.width, c.height),
      0,
      0,
    );
    imageDownload(c.toDataURL("image/png"), "virtualtour-blend.png");
  },
  "use-blend": async () => {
    if (
      !result ||
      Math.abs(result.output.width / result.output.height - 2) > 0.1
    )
      return toast(
        "A complete 2:1 equirectangular image is required. Export this blend as a flat panorama instead.",
      );
    const im = await createImageBitmap(
      new ImageData(
        result.output.data,
        result.output.width,
        result.output.height,
      ),
    );
    panoramas.get(current)?.close?.();
    panoramas.set(current, im);
    page = "Virtual Tour Player";
    render();
  },
  "export-project": exportProject,
  "import-project": () => $("#project-upload").click(),
  reset: () => {
    if (!confirm("Reset scene metadata and remove session panoramas?")) return;
    endVisit();
    stopAuto();
    project = initialProject();
    current = project.start;
    panoramas.forEach((im) => im.close?.());
    panoramas.clear();
    persist();
    render();
  },
  "events-csv": () =>
    download(
      "virtualtour-local-activity.csv",
      csv([
        ["Date", "Event", "Scene", "Detail"],
        ...events.map((e) => [
          e.date,
          e.type,
          e.scene,
          e.label ?? e.seconds ?? "",
        ]),
      ]),
      "text/csv",
    ),
  "clear-events": () => {
    if (confirm("Clear local activity history?")) {
      events = [];
      visitedAt = null;
      trackedScene = null;
      persist();
      render();
    }
  },
};
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.page) {
      if (
        page === "Virtual Tour Player" &&
        b.dataset.page !== "Virtual Tour Player"
      ) {
        endVisit();
        stopAuto();
      }
      page = b.dataset.page;
      placing = false;
      if (page === "Virtual Tour Player" && visitedAt === null) visit(current);
      render();
    } else if (b.dataset.scene) openScene(b.dataset.scene);
    else if (b.dataset.action) await actions[b.dataset.action]?.();
    else if (b.dataset.hotspot)
      activateHotspot(scene().hotspots.find((h) => h.id === b.dataset.hotspot));
    else if (b.dataset.editHotspot)
      hotspotDialog(
        scene().hotspots.find((h) => h.id === b.dataset.editHotspot),
      );
    else if (b.dataset.deleteHotspot)
      transaction((p) => {
        const s = p.scenes.find((s) => s.id === current);
        s.hotspots = s.hotspots.filter((h) => h.id !== b.dataset.deleteHotspot);
      });
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "overlap") {
    overlap = Number(e.target.value);
    $("#overlap-label").textContent = Math.round(overlap * 100) + "%";
  }
});
let drag = null;
document.addEventListener("pointerdown", (e) => {
  const g = e.target.closest("[data-map]");
  if (g && editingMap) {
    e.preventDefault();
    drag = { id: g.dataset.map, node: g, svg: g.closest("svg"), moved: false };
    g.setPointerCapture(e.pointerId);
  }
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const r = drag.svg.getBoundingClientRect(),
    x = Math.max(0.05, Math.min(0.95, (e.clientX - r.left) / r.width)),
    y = Math.max(0.05, Math.min(0.95, (e.clientY - r.top) / r.height));
  drag.pos = [x, y];
  drag.moved = true;
  drag.node.setAttribute("transform", `translate(${x * 700} ${y * 420})`);
});
document.addEventListener("pointerup", () => {
  if (drag) {
    const d = drag;
    drag = null;
    if (d.moved)
      transaction((p) => (p.scenes.find((s) => s.id === d.id).map = d.pos));
  }
});
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-map]");
  if (g && !editingMap) openScene(g.dataset.map);
});
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    $("#modal").open
  )
    return;
  const g = e.target.closest("[data-map]");
  if (g && ["Enter", " "].includes(e.key) && !editingMap) {
    e.preventDefault();
    openScene(g.dataset.map);
    return;
  }
  if (
    page === "Virtual Tour Player" &&
    ["ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    actions[e.key === "ArrowLeft" ? "left" : "right"]();
  }
});
$("#panorama-upload").onchange = async (e) => {
  const file = e.target.files[0],
    id = current;
  e.target.value = "";
  if (!file) return;
  try {
    const im = await readBitmap(file);
    if (Math.abs(im.width / im.height - 2) > 0.1) {
      im.close();
      throw Error("Upload a 2:1 equirectangular panorama");
    }
    if (!project.scenes.some((s) => s.id === id)) {
      im.close();
      return;
    }
    panoramas.get(id)?.close?.();
    panoramas.set(id, im);
    render();
    toast("360° panorama loaded. Export your project to preserve it.");
  } catch (err) {
    toast(err.message);
  }
};
$("#source-upload").onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length || busy) return;
  if (files.length + images.length > 8)
    return toast("Use at most 8 source images");
  try {
    const input = [];
    for (const f of files) {
      const im = await readBitmap(f, 1600),
        c = document.createElement("canvas");
      c.height = 280;
      c.width = Math.round((im.width * 280) / im.height);
      if (c.width < 8 || c.width > 1600) {
        im.close();
        throw Error("Unsupported source image aspect ratio");
      }
      const ctx = c.getContext("2d");
      ctx.drawImage(im, 0, 0, c.width, c.height);
      im.close();
      const data = ctx.getImageData(0, 0, c.width, c.height);
      data.name = f.name;
      input.push(data);
    }
    images.push(...input);
    result = null;
    render();
  } catch (err) {
    toast(err.message);
  }
};
$("#project-upload").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const loaded = new Map();
  try {
    if (file.size > 32000000) throw Error("Project exceeds 32 MB");
    const b = JSON.parse(await file.text());
    validateProject(b.project);
    if (
      !b.panoramas ||
      typeof b.panoramas !== "object" ||
      Array.isArray(b.panoramas) ||
      Object.keys(b.panoramas).length > 30
    )
      throw Error("Invalid panorama assets");
    for (const [id, url] of Object.entries(b.panoramas)) {
      if (
        !b.project.scenes.some((s) => s.id === id) ||
        typeof url !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url) ||
        url.length > 5000000
      )
        throw Error("Invalid panorama asset");
      const blob = await (await fetch(url)).blob(),
        im = await createImageBitmap(blob);
      if (
        im.width > 4096 ||
        im.height > 2048 ||
        Math.abs(im.width / im.height - 2) > 0.1
      ) {
        im.close();
        throw Error("Invalid panorama dimensions");
      }
      loaded.set(id, im);
    }
    endVisit();
    stopAuto();
    panoramas.forEach((im) => im.close?.());
    panoramas = loaded;
    project = b.project;
    current = project.start;
    info = null;
    view = { yaw: 0, pitch: 0, fov: 70 };
    persist();
    render();
    toast("Project restored");
  } catch (err) {
    loaded.forEach((im) => im.close?.());
    toast("Import rejected: " + err.message);
  }
};
window.addEventListener("beforeunload", () => {
  endVisit();
  stopAuto();
  viewer?.dispose();
  worker?.terminate();
});
window.virtualTourDiagnostics = () => ({
  page,
  current,
  scenes: project.scenes.length,
  hotspots: scene().hotspots.length,
  start: project.start,
  panoramas: panoramas.size,
  events: events.length,
  images: images.length,
  busy,
  matches: result?.matches.length ?? 0,
  view: viewer?.state(),
});
render();
