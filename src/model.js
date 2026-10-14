export const THEMES = ["museum", "gallery", "suite", "courtyard"];
export function initialProject() {
  return {
    version: 1,
    title: "Grand Meridian · Museum & Hotel",
    start: "lobby",
    scenes: [
      {
        id: "lobby",
        name: "Museum Lobby",
        theme: "museum",
        description:
          "A grand atrium with a sculptural armillary centerpiece and curated collections.",
        map: [0.24, 0.3],
        hotspots: [
          {
            id: "h1",
            label: "Art Gallery",
            kind: "link",
            target: "gallery",
            yaw: -55,
            pitch: 0,
          },
          {
            id: "h2",
            label: "The Armillary",
            kind: "info",
            text: "A procedural brass sculpture inspired by celestial navigation.",
            yaw: 0,
            pitch: -5,
          },
          {
            id: "h3",
            label: "Deluxe Suite",
            kind: "link",
            target: "suite",
            yaw: 65,
            pitch: 0,
          },
        ],
      },
      {
        id: "gallery",
        name: "Art Gallery",
        theme: "gallery",
        description: "A quiet gallery of abstract art and sculptural studies.",
        map: [0.67, 0.25],
        hotspots: [
          {
            id: "h4",
            label: "Return to Lobby",
            kind: "link",
            target: "lobby",
            yaw: 0,
            pitch: 0,
          },
          {
            id: "h5",
            label: "Courtyard",
            kind: "link",
            target: "courtyard",
            yaw: 65,
            pitch: 0,
          },
        ],
      },
      {
        id: "suite",
        name: "Deluxe Suite",
        theme: "suite",
        description:
          "An architectural hotel suite with a city view and warm materials.",
        map: [0.26, 0.73],
        hotspots: [
          {
            id: "h6",
            label: "Museum Lobby",
            kind: "link",
            target: "lobby",
            yaw: -65,
            pitch: 0,
          },
          {
            id: "h7",
            label: "Suite amenities",
            kind: "info",
            text: "King bed, reading corner and panoramic city-inspired windows. Procedural sample scene.",
            yaw: 15,
            pitch: 0,
          },
        ],
      },
      {
        id: "courtyard",
        name: "Outdoor Courtyard",
        theme: "courtyard",
        description: "A landscaped sculpture garden under an open sky.",
        map: [0.72, 0.72],
        hotspots: [
          {
            id: "h8",
            label: "Art Gallery",
            kind: "link",
            target: "gallery",
            yaw: 0,
            pitch: 0,
          },
        ],
      },
    ],
  };
}
export function validateProject(p) {
  if (
    !p ||
    p.version !== 1 ||
    typeof p.title !== "string" ||
    !p.title.trim() ||
    p.title.length > 100 ||
    !Array.isArray(p.scenes) ||
    !p.scenes.length ||
    p.scenes.length > 30
  )
    throw Error("Invalid tour project");
  const ids = new Set();
  for (const s of p.scenes) {
    if (
      !s ||
      typeof s.id !== "string" ||
      s.id.length > 80 ||
      ids.has(s.id) ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      s.name.length > 80 ||
      !THEMES.includes(s.theme) ||
      typeof s.description !== "string" ||
      s.description.length > 500 ||
      !Array.isArray(s.map) ||
      s.map.length !== 2 ||
      s.map.some((x) => !Number.isFinite(x) || x < 0.05 || x > 0.95) ||
      !Array.isArray(s.hotspots) ||
      s.hotspots.length > 30
    )
      throw Error("Invalid scene");
    ids.add(s.id);
  }
  if (!ids.has(p.start)) throw Error("Missing start scene");
  const hs = new Set();
  for (const s of p.scenes)
    for (const h of s.hotspots) {
      if (
        !h ||
        typeof h.id !== "string" ||
        hs.has(h.id) ||
        typeof h.label !== "string" ||
        !h.label.trim() ||
        h.label.length > 80 ||
        !["link", "info"].includes(h.kind) ||
        !Number.isFinite(h.yaw) ||
        h.yaw < -180 ||
        h.yaw > 180 ||
        !Number.isFinite(h.pitch) ||
        h.pitch < -70 ||
        h.pitch > 70
      )
        throw Error("Invalid hotspot");
      hs.add(h.id);
      if (h.kind === "link" && !ids.has(h.target))
        throw Error("Hotspot target not found");
      if (
        h.kind === "info" &&
        (typeof h.text !== "string" || h.text.length > 500)
      )
        throw Error("Invalid hotspot text");
    }
  return p;
}
export function removeScene(p, id) {
  if (p.scenes.length === 1) throw Error("Keep at least one scene");
  p.scenes = p.scenes.filter((s) => s.id !== id);
  for (const s of p.scenes)
    s.hotspots = s.hotspots.filter((h) => h.kind !== "link" || h.target !== id);
  if (p.start === id) p.start = p.scenes[0].id;
  return validateProject(p);
}
export function analytics(events, scenes) {
  const visits = events.filter((e) => e.type === "visit"),
    clicks = events.filter((e) => e.type === "hotspot");
  const ids = new Set(scenes.map((s) => s.id));
  const explored = new Set(
    visits.filter((e) => ids.has(e.scene)).map((e) => e.scene),
  ).size;
  return {
    visits: visits.length,
    clicks: clicks.length,
    unique: explored,
    completion: Math.round(
      scenes.length ? (explored / scenes.length) * 100 : 0,
    ),
    counts: scenes.map((s) => ({
      id: s.id,
      name: s.name,
      count: visits.filter((e) => e.scene === s.id).length,
      clicks: clicks.filter((e) => e.scene === s.id).length,
    })),
  };
}
export function csv(rows) {
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v)
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}
