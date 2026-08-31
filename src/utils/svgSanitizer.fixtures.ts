import { sanitizeSvg } from "./svgSanitizer";

interface SanitizerFixture {
  name: string;
  input: string;
  includes: string[];
  excludes: string[];
}

export const SVG_SANITIZER_FIXTURES: SanitizerFixture[] = [
  {
    name: "preserves normal grouped path artwork",
    input: '<svg viewBox="0 0 20 20"><defs><clipPath id="crop"><rect width="10" height="10"/></clipPath></defs><g id="layer" transform="translate(2 3)" clip-path="url(#crop)"><path id="curve" d="M0 0L10 10" fill="#fff" stroke="#000"/></g></svg>',
    includes: ['viewBox="0 0 20 20"', '<g id="layer"', 'transform="translate(2 3)"', 'clip-path="url(#crop)"', '<path id="curve"'],
    excludes: [],
  },
  {
    name: "removes script elements",
    input: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0L1 1"/></svg>',
    includes: ['<path d="M0 0L1 1"'],
    excludes: ["<script", "alert(1)"],
  },
  {
    name: "removes inline event handlers",
    input: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><image onerror="alert(2)"/><path onclick="alert(3)" d="M0 0L1 1"/></svg>',
    includes: ['<path d="M0 0L1 1"'],
    excludes: ["onload", "onerror", "onclick", "alert("],
  },
  {
    name: "removes javascript and external references",
    input: '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><path d="M0 0L1 1"/></a><use href="https://example.com/art.svg#shape"/><set attributeName="href" to="javascript:alert(2)"/><image href="data:image/png;base64,AAAA"/></svg>',
    includes: ['<path d="M0 0L1 1"', 'href="data:image/png;base64,AAAA"'],
    excludes: ["javascript:", "https://example.com", "<set"],
  },
  {
    name: "removes embedded HTML",
    input: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject><circle cx="5" cy="5" r="4"/></svg>',
    includes: ["<circle"],
    excludes: ["foreignObject", "<div", "unsafe"],
  },
];

/** Deterministic browser-DOM fixture runner for the centralized sanitizer. */
export function runSvgSanitizerFixtures(): void {
  for (const fixture of SVG_SANITIZER_FIXTURES) {
    const sanitized = sanitizeSvg(fixture.input);
    for (const expected of fixture.includes) {
      if (!sanitized.includes(expected)) {
        throw new Error(`${fixture.name}: expected output to include ${expected}`);
      }
    }
    for (const forbidden of fixture.excludes) {
      if (sanitized.includes(forbidden)) {
        throw new Error(`${fixture.name}: expected output to exclude ${forbidden}`);
      }
    }
  }
}
