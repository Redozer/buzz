// Русский интерфейс Buzz Desktop (Pride-Automatics).
//
// Перевод делается поверх готового DOM, а не правкой каждого компонента:
// MutationObserver подменяет nodeValue текстовых узлов и атрибуты
// placeholder/title/aria-label по словарю ru.ts. Так форк почти не
// расходится с апстримом — при обновлении Buzz конфликтов нет, новые
// экраны просто остаются на английском, пока строки не добавлены в словарь.
//
// React это не ломает: меняется только nodeValue существующих узлов, узлы
// не добавляются и не удаляются. Когда React сам обновит текст, придёт
// мутация characterData, и узел переведётся снова.
//
// Не трогаем пользовательский контент: тела сообщений, поле ввода, код.
// Отключить: localStorage.setItem("buzz-ui-lang", "en") и перезапуск.
import { RU_STRINGS, RU_TEMPLATES } from "./ru";

const SKIP_SELECTOR = [
  '[data-testid="message-body"]',
  '[data-testid="message-author"]',
  '[data-testid^="transcript-"]',
  "[contenteditable]",
  ".ProseMirror",
  "textarea",
  "input",
  "pre",
  "code",
  "script",
  "style",
  '[translate="no"]',
  "[data-no-translate]",
].join(",");

const ATTRS = ["placeholder", "title", "aria-label", "data-placeholder"] as const;
// Подсказка в пустом поле ввода (TipTap) живёт атрибутом внутри contenteditable.
const ALWAYS_ATTRS = ["data-placeholder"] as const;

const dict = new Map<string, string>(Object.entries(RU_STRINGS));

type CompiledTemplate = { re: RegExp; ru: string };
const templates: CompiledTemplate[] = RU_TEMPLATES.map(([en, ru]) => ({
  re: new RegExp(
    `^${en
      .split("{}")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("(.+?)")}$`,
  ),
  ru,
}));

const normalize = (s: string) => s.replace(/[\s ]+/g, " ").trim();
const hasLatin = /[A-Za-z]{2}/;

export function translateString(raw: string): string | null {
  if (!hasLatin.test(raw)) return null;
  const core = normalize(raw);
  if (!core || core.length > 400) return null;
  let ru = dict.get(core);
  if (ru === undefined) {
    for (const t of templates) {
      const m = t.re.exec(core);
      if (m) {
        const groups = m.slice(1).map((g) => dict.get(g) ?? g);
        ru = t.ru.replace(/\{(\d+)\}/g, (_, i) => groups[Number(i)] ?? "");
        break;
      }
    }
  }
  if (ru === undefined) return null;
  const lead = /^[\s ]*/.exec(raw)?.[0] ?? "";
  const trail = /[\s ]*$/.exec(raw)?.[0] ?? "";
  return lead + ru + trail;
}

function skipped(el: Element | null): boolean {
  return !!el && el.closest(SKIP_SELECTOR) !== null;
}

function translateTextNode(node: Text) {
  const value = node.nodeValue;
  if (!value || skipped(node.parentElement)) return;
  const ru = translateString(value);
  if (ru !== null && ru !== value) node.nodeValue = ru;
}

function translateAttrs(el: Element) {
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    const ru = translateString(value);
    if (ru !== null && ru !== value) el.setAttribute(attr, ru);
  }
}

function translatePlaceholders(root: Element) {
  const els = root.matches("[data-placeholder]") ? [root] : [];
  els.push(...root.querySelectorAll("[data-placeholder]"));
  for (const el of els) {
    for (const attr of ALWAYS_ATTRS) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const ru = translateString(value);
      if (ru !== null && ru !== value) el.setAttribute(attr, ru);
    }
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  translatePlaceholders(el);
  if (skipped(el)) return;
  translateAttrs(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        return (n as Element).matches(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const value = n.nodeValue;
      if (value) {
        const ru = translateString(value);
        if (ru !== null && ru !== value) n.nodeValue = ru;
      }
    } else translateAttrs(n as Element);
    n = walker.nextNode();
  }
}

let started = false;

export function startRussianUi() {
  if (started || typeof document === "undefined") return;
  try {
    if (window.localStorage.getItem("buzz-ui-lang") === "en") return;
  } catch {
    /* хранилище недоступно — переводим */
  }
  started = true;
  document.documentElement.lang = "ru";

  const pending = new Set<Node>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const nodes = [...pending];
    pending.clear();
    for (const node of nodes) if (node.isConnected) translateTree(node);
  };
  const queue = (node: Node) => {
    pending.add(node);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  };

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(queue);
      else if (r.type === "characterData") queue(r.target);
      else if (r.type === "attributes" && r.target.nodeType === Node.ELEMENT_NODE) {
        const el = r.target as Element;
        if (r.attributeName === "data-placeholder" || !skipped(el)) translateAttrs(el);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
  translateTree(document.body);
}
