const BLOCKED_ELEMENTS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "base",
  "discard",
  "embed",
  "foreignobject",
  "handler",
  "iframe",
  "link",
  "listener",
  "meta",
  "object",
  "script",
  "set",
]);

const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href"]);
const URL_PRESENTATION_ATTRIBUTES = new Set([
  "clip-path",
  "cursor",
  "fill",
  "filter",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
]);

const SAFE_RASTER_DATA_URL = /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;
const LOCAL_FRAGMENT_URL = /^#[A-Za-z_][\w:.-]*$/;
const LOCAL_URL_FUNCTION = /^url\(\s*(["']?)#[A-Za-z_][\w:.-]*\1\s*\)$/i;

type XmlParser = {
  parseFromString(source: string, mimeType: string): Document;
};

type XmlSerializer = {
  serializeToString(node: Node): string;
};

export interface SvgSanitizerEnvironment {
  parser: XmlParser;
  serializer: XmlSerializer;
}

function browserEnvironment(): SvgSanitizerEnvironment {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    throw new Error("SVG sanitization requires DOMParser and XMLSerializer support");
  }

  return {
    parser: new DOMParser(),
    serializer: new XMLSerializer(),
  };
}

function normalizedAttributeName(attribute: Attr): string {
  return attribute.name.toLowerCase();
}

function containsUnsafeCss(css: string): boolean {
  return /(?:javascript\s*:|vbscript\s*:|expression\s*\(|-moz-binding\s*:|behavior\s*:|@|\\)/i.test(css);
}

function sanitizeCss(css: string): string {
  if (containsUnsafeCss(css)) return "";

  return css.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, _quote: string, rawUrl: string) => {
    return LOCAL_FRAGMENT_URL.test(rawUrl.trim()) ? match : "none";
  });
}

function isSafeDirectReference(value: string, elementName: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  if (LOCAL_FRAGMENT_URL.test(normalized)) return true;

  return elementName === "image" && SAFE_RASTER_DATA_URL.test(normalized);
}

function sanitizeElement(element: Element): void {
  const elementName = element.localName.toLowerCase();

  for (const attribute of Array.from(element.attributes)) {
    const name = normalizedAttributeName(attribute);
    const localName = attribute.localName.toLowerCase();
    const value = attribute.value;

    if (localName.startsWith("on") || name.startsWith("on")) {
      element.removeAttributeNode(attribute);
      continue;
    }

    if (name === "style") {
      const safeStyle = sanitizeCss(value);
      if (safeStyle) element.setAttribute(attribute.name, safeStyle);
      else element.removeAttributeNode(attribute);
      continue;
    }

    if ((URL_ATTRIBUTES.has(name) || URL_ATTRIBUTES.has(localName)) && !isSafeDirectReference(value, elementName)) {
      element.removeAttributeNode(attribute);
      continue;
    }

    if (URL_PRESENTATION_ATTRIBUTES.has(name)) {
      const normalized = value.trim();
      if (/^url\(/i.test(normalized) && !LOCAL_URL_FUNCTION.test(normalized)) {
        element.removeAttributeNode(attribute);
      }
    }
  }

  if (elementName === "style") {
    element.textContent = sanitizeCss(element.textContent || "");
  }
}

export function sanitizeSvg(
  svgText: string,
  environment: SvgSanitizerEnvironment = browserEnvironment(),
): string {
  const doc = environment.parser.parseFromString(svgText, "image/svg+xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error(parserError.textContent || "Invalid SVG XML syntax");
  }

  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== "svg") {
    throw new Error("No <svg> element found in the uploaded content");
  }

  const elements = [root, ...Array.from(root.getElementsByTagName("*"))];
  for (const element of elements) {
    if (BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.parentNode?.removeChild(element);
      continue;
    }
    sanitizeElement(element);
  }

  return environment.serializer.serializeToString(doc);
}
