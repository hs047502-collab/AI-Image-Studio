import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(repoRoot, "public", "index.html");
const html = readFileSync(htmlPath, "utf8");
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
const styleEngineSource = inlineScripts.find((source) =>
  source.includes("COMPLETE 120 ART STYLES CONFIGURATION REGISTRY") && source.includes("function getRecommendedSettings")
);

if (!styleEngineSource) {
  throw new Error(`Could not find the embedded StyleEngine in ${htmlPath}`);
}

const sourceForNode = styleEngineSource.replace(/^\s*window\.STANDALONE_DIRECT_MODE\s*=\s*true;\s*/, "");
const sandbox = { module: { exports: {} }, window: {}, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(sourceForNode, sandbox, { filename: "StyleEngine.inline.js", timeout: 5000 });
const SE = sandbox.module.exports;

if (!SE || !Array.isArray(SE.STYLES) || typeof SE.getRecommendedSettings !== "function") {
  throw new Error("Embedded StyleEngine did not expose the style registry and recommendation helper.");
}
if (SE.STYLES.length !== 120) {
  throw new Error(`Expected exactly 120 styles; found ${SE.STYLES.length}.`);
}

const columns = [
  "style_no",
  "style_id",
  "style_name",
  "category",
  "family",
  "best_for",
  "free_engine",
  "free_model_guidance",
  "paid_engine",
  "paid_preferred_provider",
  "paid_model_guidance",
  "aspect_ratio",
  "aspect_ratio_when_to_change",
  "resolution_setting",
  "free_resolution_guidance",
  "paid_resolution_guidance",
  "background",
  "background_when_to_use",
  "color_mode",
  "detail_level",
  "detail_level_guidance",
  "composition",
  "composition_when_to_use",
  "image_count",
  "prompting_tips",
  "style_prompt_recipe",
  "negative_prompt_template",
  "vector_line_weight",
  "vector_shape_complexity",
  "vector_outline_style",
  "vector_fill_style",
  "vector_color_palette",
  "vector_edge_cleanliness",
  "vector_subject_isolation",
  "photo_lighting",
  "photo_camera_angle",
  "photo_shot_type",
  "photo_depth_of_field",
  "photo_lens_look",
  "photo_focus_style",
  "coloring_audience",
  "coloring_complexity",
  "coloring_outline_thickness",
  "coloring_detail_density",
  "coloring_closed_shapes",
  "coloring_printable_layout",
  "render3d_material_type",
  "render3d_appearance",
  "render3d_surface_finish",
  "render3d_lighting_style",
  "render3d_shadow_strength",
  "render3d_perspective",
  "style_note"
];

const na = (value) => value === undefined || value === null || value === "" ? "N/A" : String(value);
const detailGuidance = {
  clean: "Use for icons, logos, simple graphics, or when the subject must remain uncluttered.",
  balanced: "Good starting point: readable detail without busy micro-texture.",
  high: "Use for more visible structure/texture while keeping the main subject clear.",
  ultra: "Use for intricate linework or fine textures; check for clutter and artifacts."
};
const compositionGuidance = {
  "centered hero framing": "One focal subject centered with breathing room; ideal for icons, products, and single subjects.",
  "rule of thirds balanced framing": "Place the focal subject off-center with balanced space; useful for editorial scenes and portraits.",
  "symmetrical balanced composition": "Use for emblems, mandalas, geometric layouts, and balanced front-facing designs.",
  "wide establishing composition": "Show a broad environment or banner with room for scene context.",
  "close-up detailed framing": "Fill more of the frame with a small subject or fine detail.",
  "dynamic diagonal composition": "Use for action, motion, sports, or energetic poster layouts.",
  "isolated full-body subject with clean margins": "Keep one complete subject visible with whitespace around it; useful for cutouts and silhouettes.",
  "full-page printable layout with clean borders": "Fill a portrait page while leaving a clean print-safe margin."
};
const colorGuidance = {
  full: "Use balanced full color; on flat-vector styles the prompt asks for a limited solid-fill palette.",
  vibrant: "Use richer saturation for expressive illustration, stylized 3D, or modern art.",
  pastel: "Use soft, muted colors for gentle or child-friendly artwork.",
  warm: "Use warm golden/earthy colors for cozy or nostalgic scenes.",
  cool: "Use blue/teal color emphasis for calm, cool, or night scenes.",
  monochrome: "Use black-and-white or grayscale treatment.",
  duotone: "Use exactly two contrasting color families.",
  "ink-bw": "Use black linework on white; appropriate for coloring and line-art pages."
};
const aspectGuidanceFallback = (ratio) => {
  if (ratio === "16:9") return "Wide scene/banner; choose 1:1 for square artwork or 9:16 for vertical social content.";
  if (["2:3", "3:4", "4:5"].includes(ratio)) return "Portrait/page layout; choose 9:16 for a story/reel or 1:1 for a square asset.";
  if (["3:2", "4:3"].includes(ratio)) return "Landscape/print layout; choose 1:1 for a square asset or 9:16 for a vertical composition.";
  return "Square asset; choose 3:2/16:9 for a wide scene or 2:3/9:16 for a tall subject.";
};
const backgroundGuidanceFallback = (background) => ({
  natural: "Use a coherent contextual scene; choose white for an icon/logo or clean catalog look.",
  studio: "Use a seamless controlled studio setting; choose white/transparent only for a cutout asset.",
  white: "Use a clean white field; for a full environmental scene, choose Natural instead.",
  black: "Use a pure dark field; switch to white for print/outline work."
}[background] || "Use the style default unless the prompt explicitly needs another backdrop.");

function csvCell(value) {
  const text = na(value).replace(/\r?\n/g, " ").trim();
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const rows = SE.STYLES.map((style) => {
  const rec = SE.getRecommendedSettings(style.id);
  const vector = rec.vectorSettings || {};
  const photo = rec.photoSettings || {};
  const coloring = rec.coloringSettings || {};
  const render3d = rec.render3dSettings || {};
  const row = {
    style_no: style.number,
    style_id: style.id,
    style_name: style.name,
    category: `${style.categoryCode} — ${style.category}`,
    family: style.family,
    best_for: style.description,
    free_engine: rec.freeEngine,
    free_model_guidance: rec.freeEngineGuidance,
    paid_engine: rec.paidEngine,
    paid_preferred_provider: rec.paidPreferredProvider,
    paid_model_guidance: rec.paidEngineGuidance,
    aspect_ratio: rec.aspectRatio,
    aspect_ratio_when_to_change: rec.aspectRatioGuidance || aspectGuidanceFallback(rec.aspectRatio),
    resolution_setting: rec.resolution,
    free_resolution_guidance: rec.resolutionGuidance,
    paid_resolution_guidance: rec.paidResolution,
    background: rec.background,
    background_when_to_use: rec.backgroundGuidance || backgroundGuidanceFallback(rec.background),
    color_mode: rec.colorMode,
    detail_level: rec.detailLevel,
    detail_level_guidance: detailGuidance[rec.detailLevel] || "Use the style recommendation as a starting point.",
    composition: rec.composition,
    composition_when_to_use: compositionGuidance[rec.composition] || "Use the framing that best fits the subject and intended crop.",
    image_count: rec.numberOfImages,
    prompting_tips: rec.promptingTips,
    style_prompt_recipe: rec.stylePrompt,
    negative_prompt_template: rec.negativePrompt,
    vector_line_weight: vector.lineWeight,
    vector_shape_complexity: vector.shapeComplexity,
    vector_outline_style: vector.outlineStyle,
    vector_fill_style: vector.fillStyle,
    vector_color_palette: vector.colorPalette,
    vector_edge_cleanliness: vector.edgeCleanliness,
    vector_subject_isolation: vector.subjectIsolation,
    photo_lighting: photo.lighting,
    photo_camera_angle: photo.cameraAngle,
    photo_shot_type: photo.shotType,
    photo_depth_of_field: photo.depthOfField,
    photo_lens_look: photo.lensLook,
    photo_focus_style: photo.focusStyle,
    coloring_audience: coloring.audience,
    coloring_complexity: coloring.complexity,
    coloring_outline_thickness: coloring.outlineThickness,
    coloring_detail_density: coloring.detailDensity,
    coloring_closed_shapes: coloring.closedShapes,
    coloring_printable_layout: coloring.printableLayout,
    render3d_material_type: render3d.materialType,
    render3d_appearance: render3d.renderAppearance,
    render3d_surface_finish: render3d.surfaceFinish,
    render3d_lighting_style: render3d.lightingStyle,
    render3d_shadow_strength: render3d.shadowStrength,
    render3d_perspective: render3d.perspective,
    style_note: style.styleNote
  };
  return columns.map((column) => csvCell(row[column])).join(",");
});

const outputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(repoRoot, "STYLE-RECOMMENDATIONS-120.csv");
const csv = `${columns.join(",")}\r\n${rows.join("\r\n")}\r\n`;
writeFileSync(outputPath, csv, { encoding: "utf8" });
console.log(`Wrote ${rows.length} style recommendations (${columns.length} columns) to ${outputPath}`);
