// Собирает английские строки интерфейса из исходников десктопа.
// Нужен после каждого обновления Buzz: показывает строки, которых ещё нет
// в src/i18n/ru.ts.
//
//   node scripts/i18n/extract-ui-strings.mjs [--missing] [dir ...]
//
// Без аргументов берёт основные разделы (меню, каналы, сообщения, настройки…).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DEFAULT_DIRS = [
  "src/app",
  "src/shared/ui",
  "src/features/settings",
  "src/features/sidebar",
  "src/features/channels",
  "src/features/messages",
  "src/features/chat",
  "src/features/onboarding",
  "src/features/profile",
  "src/features/communities",
  "src/features/community-members",
  "src/features/notifications",
  "src/features/home",
  "src/features/search",
  "src/features/presence",
  "src/features/user-status",
  "src/features/reminders",
  "src/features/forum",
  "src/features/huddle",
  "src/features/agents",
];

const args = process.argv.slice(2);
const onlyMissing = args.includes("--missing");
const dirs = args.filter((a) => !a.startsWith("--"));
const targets = (dirs.length ? dirs : DEFAULT_DIRS).map((d) => path.join(root, d));

const TEXT_ATTRS = new Set([
  "title", "placeholder", "aria-label", "label", "description", "alt", "tooltip",
  "heading", "subtitle", "emptyLabel", "emptyText", "hint", "helperText",
  "confirmLabel", "cancelLabel", "actionLabel", "submitLabel", "buttonLabel",
  "triggerLabel", "ariaLabel", "text", "message", "caption", "summary",
]);
const TEXT_PROPS = new Set([...TEXT_ATTRS, "name", "body", "detail", "details", "header", "footer", "cta"]);
const TOAST_FNS = new Set(["toast", "success", "error", "info", "warning", "message", "loading"]);

const looksLikeUi = (s) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 200) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (/^[a-z0-9_.:/#@-]+$/.test(t)) return false; // ключи, пути, id
  if (/^(https?:|wss?:|buzz:|\/|\.\/|#[0-9a-f]{3})/i.test(t)) return false;
  if (/^[a-z]+([A-Z][a-z]+)+$/.test(t)) return false; // camelCase
  if (/[{}<>=;]/.test(t) && !/\s/.test(t)) return false;
  return /^[A-Z0-9"'“(¿¡…]/.test(t) || /\s/.test(t);
};

const found = new Map(); // text -> Set(files)
const templates = new Map();
const add = (map, text, file) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (!map.has(t)) map.set(t, new Set());
  map.get(t).add(path.relative(root, file));
};

function templateToPattern(node) {
  let s = node.head.text;
  for (const span of node.templateSpans) s += "{}" + span.literal.text;
  return s;
}

function visit(node, file) {
  if (ts.isJsxText(node)) {
    const t = node.text;
    if (looksLikeUi(t)) add(found, t, file);
  } else if (ts.isJsxAttribute(node) && node.initializer) {
    const name = node.name.getText();
    let init = node.initializer;
    if (ts.isJsxExpression(init) && init.expression) init = init.expression;
    if (TEXT_ATTRS.has(name)) {
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        if (looksLikeUi(init.text)) add(found, init.text, file);
      } else if (ts.isTemplateExpression(init)) add(templates, templateToPattern(init), file);
      else if (ts.isConditionalExpression(init)) {
        for (const b of [init.whenTrue, init.whenFalse]) if (ts.isStringLiteral(b) && looksLikeUi(b.text)) add(found, b.text, file);
      }
    }
  } else if (ts.isPropertyAssignment(node)) {
    const key = node.name.getText().replace(/["']/g, "");
    const init = node.initializer;
    if (TEXT_PROPS.has(key)) {
      if ((ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) && looksLikeUi(init.text)) add(found, init.text, file);
      else if (ts.isTemplateExpression(init)) add(templates, templateToPattern(init), file);
    }
  } else if (ts.isCallExpression(node)) {
    const callee = node.expression.getText();
    const last = callee.split(".").pop();
    if ((callee.startsWith("toast") && TOAST_FNS.has(last)) || callee === "toast") {
      for (const a of node.arguments.slice(0, 1)) {
        if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && looksLikeUi(a.text)) add(found, a.text, file);
        else if (ts.isTemplateExpression(a)) add(templates, templateToPattern(a), file);
      }
    }
  } else if (ts.isJsxExpression(node) && node.expression) {
    const e = node.expression;
    if (ts.isStringLiteral(e) && looksLikeUi(e.text) && ts.isJsxElement(node.parent)) add(found, e.text, file);
    if (ts.isConditionalExpression(e)) {
      for (const b of [e.whenTrue, e.whenFalse]) if (ts.isStringLiteral(b) && looksLikeUi(b.text)) add(found, b.text, file);
    }
    if (ts.isTemplateExpression(e) && ts.isJsxElement(node.parent)) add(templates, templateToPattern(e), file);
  }
  ts.forEachChild(node, (c) => visit(c, file));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(ent.name) && !/\.(test|spec|stories)\./.test(ent.name) && !ent.name.endsWith(".d.ts")) {
      const src = fs.readFileSync(p, "utf8");
      const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      visit(sf, p);
    }
  }
}

for (const t of targets) walk(t);

const known = new Set();
if (onlyMissing) {
  const ruPath = path.join(root, "src/i18n/ru.ts");
  const src = fs.existsSync(ruPath) ? fs.readFileSync(ruPath, "utf8") : "";
  for (const m of src.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)) known.add(JSON.parse(m[1]));
}

const out = { strings: {}, templates: {} };
for (const [k, files] of [...found].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (onlyMissing && known.has(k)) continue;
  out.strings[k] = [...files][0];
}
for (const [k, files] of [...templates].sort((a, b) => a[0].localeCompare(b[0]))) out.templates[k] = [...files][0];
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
console.error(`strings: ${Object.keys(out.strings).length}, templates: ${Object.keys(out.templates).length}`);
