import { Plugin, Notice, MarkdownView, MarkdownRenderer } from "obsidian";

const { remote } = require("electron");
const fs = require("fs");
const path = require("path");

// A4 at 96 DPI
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

export default class EnigmaExport extends Plugin {
  async onload() {
    console.log("Enigma Export: loaded");

    this.addCommand({
      id: "enigma-export-themed-pdf",
      name: "Export current note as themed PDF",
      callback: () => this.exportThemedPDF(),
    });

    this.addRibbonIcon("file-down", "Enigma Export", () => {
      this.exportThemedPDF();
    });
  }

  async exportThemedPDF() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("Enigma Export: No active markdown note found");
      return;
    }

    new Notice("Enigma Export: Generating themed PDF...");

    try {
      const bodyHTML = await this.getRenderedHTML(view);
      const themeCSS = this.readActiveThemeCSS();
      const snippetCSS = this.readSnippetCSS();
      const resolvedVars = this.captureResolvedCSSVariables();
      const fullHTML = this.buildHTMLDocument(bodyHTML, themeCSS, snippetCSS, resolvedVars);

      // Measure how tall the content is
      const totalHeight = await this.measureContentHeight(fullHTML);

      // Calculate how many pages we need
      const pageCount = Math.max(1, Math.ceil(totalHeight / A4_HEIGHT));

      // Capture each page as an image
      const pageImages: Buffer[] = [];
      for (let i = 0; i < pageCount; i++) {
        const img = await this.capturePageImage(fullHTML, i);
        pageImages.push(img);
      }

      // Build a minimal PDF from the captured images
      const pdfBuffer = this.buildPDFFromImages(pageImages);

      await this.savePDF(pdfBuffer, view.file.basename);
    } catch (err: any) {
      console.error("Enigma Export error:", err);
      new Notice(`Enigma Export: Failed - ${err.message}`);
    }
  }

  async getRenderedHTML(view: MarkdownView): Promise<string> {
    const markdown = view.getViewData();
    const tempEl = document.createElement("div");
    tempEl.classList.add("markdown-preview-view", "markdown-rendered");

    await MarkdownRenderer.render(
      this.app,
      markdown,
      tempEl,
      view.file!.path,
      view
    );

    await this.sleep(200);
    return tempEl.innerHTML;
  }

  readActiveThemeCSS(): string {
    const vaultPath = this.getVaultPath();
    const appearancePath = path.join(vaultPath, ".obsidian", "appearance.json");

    let themeName = "";
    try {
      const raw = fs.readFileSync(appearancePath, "utf-8");
      const appearance = JSON.parse(raw);
      themeName = appearance.cssTheme || "";
    } catch {
      return "";
    }

    if (!themeName) return "";

    console.log(`Enigma Export: Active theme is "${themeName}"`);

    const themesDir = path.join(vaultPath, ".obsidian", "themes", themeName);
    const candidates = [
      path.join(themesDir, "theme.css"),
      path.join(themesDir, `${themeName}.css`),
    ];

    for (const cssPath of candidates) {
      try {
        return fs.readFileSync(cssPath, "utf-8");
      } catch {
        continue;
      }
    }

    return "";
  }

  readSnippetCSS(): string {
    const vaultPath = this.getVaultPath();
    const snippetsDir = path.join(vaultPath, ".obsidian", "snippets");
    const snippets: string[] = [];

    let enabledSnippets: string[] = [];
    try {
      const raw = fs.readFileSync(
        path.join(vaultPath, ".obsidian", "appearance.json"),
        "utf-8"
      );
      const appearance = JSON.parse(raw);
      enabledSnippets = appearance.enabledCssSnippets || [];
    } catch {
      return "";
    }

    for (const name of enabledSnippets) {
      const snippetPath = path.join(snippetsDir, `${name}.css`);
      try {
        snippets.push(fs.readFileSync(snippetPath, "utf-8"));
      } catch {}
    }

    return snippets.join("\n");
  }

  captureResolvedCSSVariables(): string {
    const computed = getComputedStyle(document.body);
    const vars: string[] = [];

    const varNames = [
      "--background-primary", "--background-primary-alt",
      "--background-secondary", "--background-secondary-alt",
      "--background-modifier-border", "--background-modifier-form-field",
      "--background-modifier-hover", "--background-modifier-active-hover",
      "--text-normal", "--text-muted", "--text-faint",
      "--text-accent", "--text-accent-hover", "--text-on-accent",
      "--interactive-normal", "--interactive-hover", "--interactive-accent",
      "--interactive-accent-hover",
      "--font-text", "--font-monospace", "--font-interface",
      "--font-text-size", "--line-height",
      "--h1-color", "--h1-size", "--h1-weight",
      "--h2-color", "--h2-size", "--h2-weight",
      "--h3-color", "--h3-size", "--h3-weight",
      "--h4-color", "--h4-size", "--h4-weight",
      "--h5-color", "--h5-size", "--h5-weight",
      "--h6-color", "--h6-size", "--h6-weight",
      "--code-background", "--code-normal", "--code-size",
      "--tag-color", "--tag-background",
      "--link-color", "--link-external-color",
      "--bold-color", "--italic-color",
      "--blockquote-border-color", "--blockquote-background-color",
      "--table-header-background", "--table-row-background-hover",
      "--table-border-color",
      "--list-marker-color",
      "--hr-color", "--indentation-guide-color",
    ];

    for (const v of varNames) {
      const val = computed.getPropertyValue(v).trim();
      if (val) vars.push(`  ${v}: ${val};`);
    }

    return `:root, .theme-dark, .theme-light {\n${vars.join("\n")}\n}`;
  }

  buildHTMLDocument(
    bodyHTML: string,
    themeCSS: string,
    snippetCSS: string,
    resolvedVars: string
  ): string {
    const isDark = document.body.classList.contains("theme-dark");
    const themeClass = isDark ? "theme-dark" : "theme-light";

    // Get the actual background color value to use as a fallback
    const bgColor = getComputedStyle(document.body).getPropertyValue("--background-primary").trim() || (isDark ? "#1e1e1e" : "#ffffff");

    return `<!DOCTYPE html>
<html class="${themeClass}" style="background:${bgColor};">
<head>
  <meta charset="UTF-8">
  <style>
    ${resolvedVars}
    ${themeCSS}
    ${snippetCSS}

    *, *::before, *::after {
      box-sizing: border-box;
    }

    html {
      background: ${bgColor} !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    body {
      background: ${bgColor} !important;
      color: var(--text-normal);
      font-family: var(--font-text, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      font-size: var(--font-text-size, 16px);
      line-height: var(--line-height, 1.6);
      margin: 0 !important;
      padding: 40px 50px !important;
      width: ${A4_WIDTH}px;
      min-height: ${A4_HEIGHT}px;
      overflow: hidden;
    }

    h1 { color: var(--h1-color, var(--text-normal)); font-size: var(--h1-size, 2em); }
    h2 { color: var(--h2-color, var(--text-normal)); font-size: var(--h2-size, 1.6em); }
    h3 { color: var(--h3-color, var(--text-normal)); font-size: var(--h3-size, 1.37em); }
    h4 { color: var(--h4-color, var(--text-normal)); font-size: var(--h4-size, 1.25em); }
    h5 { color: var(--h5-color, var(--text-normal)); font-size: var(--h5-size, 1.12em); }
    h6 { color: var(--h6-color, var(--text-muted)); font-size: var(--h6-size, 1em); }

    code {
      background: var(--code-background);
      color: var(--code-normal);
      font-family: var(--font-monospace, monospace);
      font-size: var(--code-size, 0.9em);
      padding: 2px 4px;
      border-radius: 4px;
    }
    pre code { display: block; padding: 1em; overflow-x: auto; }

    blockquote {
      border-left: 3px solid var(--blockquote-border-color);
      background: var(--blockquote-background-color, transparent);
      margin: 1em 0;
      padding: 0.5em 1em;
    }

    a { color: var(--link-color, var(--text-accent)); }
    a.external-link { color: var(--link-external-color, var(--text-accent)); }

    table { border-collapse: collapse; width: 100%; }
    th { background: var(--table-header-background); }
    th, td {
      border: 1px solid var(--table-border-color, var(--background-modifier-border));
      padding: 6px 12px;
    }

    .tag {
      color: var(--tag-color);
      background: var(--tag-background);
      padding: 2px 6px;
      border-radius: 4px;
    }

    hr { border-color: var(--hr-color, var(--background-modifier-border)); }
    img { max-width: 100%; height: auto; }
    .task-list-item-checkbox { margin-right: 6px; }
  </style>
</head>
<body class="markdown-preview-view markdown-rendered ${themeClass}">
  ${bodyHTML}
</body>
</html>`;
  }

  // ─── Measure total content height ───────────────────────────────────
  async measureContentHeight(html: string): Promise<number> {
    const { BrowserWindow } = remote;

    const win = new BrowserWindow({
      show: false,
      width: A4_WIDTH,
      height: A4_HEIGHT,
      webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true },
    });

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await this.sleep(1000);

    const totalHeight = await win.webContents.executeJavaScript(
      `Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)`
    );

    win.close();
    return totalHeight;
  }

  // ─── Capture a single page as PNG ──────────────────────────────────
  async capturePageImage(html: string, pageIndex: number): Promise<Buffer> {
    const { BrowserWindow } = remote;

    const yOffset = pageIndex * A4_HEIGHT;

    const win = new BrowserWindow({
      show: false,
      width: A4_WIDTH,
      height: A4_HEIGHT,
      backgroundColor: getComputedStyle(document.body).getPropertyValue("--background-primary").trim() || "#1e1e1e",
      webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true },
    });

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await this.sleep(1000);

    // Scroll to the correct page position
    await win.webContents.executeJavaScript(`window.scrollTo(0, ${yOffset})`);
    await this.sleep(300);

    // Capture the visible area
    const image = await win.webContents.capturePage({
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
    });

    win.close();
    return image.toPNG();
  }

  // ─── Build PDF from PNG images (minimal PDF spec) ──────────────────
  buildPDFFromImages(pageImages: Buffer[]): Buffer {
    // A4 in PDF points: 595.28 x 841.89
    const pageW = 595.28;
    const pageH = 841.89;

    const objects: string[] = [];
    let objectCount = 0;
    const offsets: number[] = [];

    const newObj = (content: string): number => {
      objectCount++;
      objects.push(content);
      return objectCount;
    };

    // Object 1: Catalog
    newObj(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);

    // Object 2: Pages (placeholder, we'll rebuild later)
    const pagesObjIndex = newObj(""); // placeholder

    const pageRefs: string[] = [];
    const imageStreamObjs: number[] = [];
    const imageXObjs: number[] = [];
    const pageObjs: number[] = [];

    for (let i = 0; i < pageImages.length; i++) {
      const png = pageImages[i];

      // We need to embed as a raw image. Convert PNG to raw RGB for PDF.
      // For simplicity, embed as PNG with DCTDecode workaround:
      // Actually, PDFs support embedding PNGs via FlateDecode on raw pixels.
      // Simplest approach: embed the PNG data as-is using an XObject Image.

      // Decode PNG to get raw RGBA pixel data
      const { width, height, rgbData } = this.decodePNGtoRGB(png);

      // Image stream object
      const streamData = rgbData;
      const imgObjNum = newObj(
        `${objectCount + 1} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${streamData.length} >>\n` +
        `stream\n`
      );
      imageStreamObjs.push(imgObjNum);

      // Resources dict for this page
      const resObjNum = newObj(
        `${objectCount + 1} 0 obj\n` +
        `<< /XObject << /Img${i} ${imgObjNum} 0 R >> >>\n` +
        `endobj`
      );

      // Content stream: draw image scaled to full page
      const contentStr = `q ${pageW} 0 0 ${pageH} 0 0 cm /Img${i} Do Q`;
      const contentObjNum = newObj(
        `${objectCount + 1} 0 obj\n` +
        `<< /Length ${contentStr.length} >>\n` +
        `stream\n${contentStr}\nendstream\n` +
        `endobj`
      );

      // Page object
      const pageObjNum = newObj(
        `${objectCount + 1} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Contents ${contentObjNum} 0 R /Resources ${resObjNum} 0 R >>\n` +
        `endobj`
      );
      pageObjs.push(pageObjNum);
      pageRefs.push(`${pageObjNum} 0 R`);
    }

    // Rebuild pages object
    objects[pagesObjIndex - 1] =
      `2 0 obj\n<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageImages.length} >>\nendobj`;

    // Build the final PDF binary
    const chunks: Buffer[] = [];
    chunks.push(Buffer.from("%PDF-1.4\n"));

    // Write each object, tracking offsets
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.concat(chunks).length);

      if (imageStreamObjs.includes(i + 1)) {
        // This is an image stream object - write header then binary data then endstream
        const pageIdx = imageStreamObjs.indexOf(i + 1);
        const png = pageImages[pageIdx];
        const { rgbData } = this.decodePNGtoRGB(png);

        const header = objects[i];
        chunks.push(Buffer.from(header));
        chunks.push(rgbData);
        chunks.push(Buffer.from("\nendstream\nendobj\n"));
      } else {
        chunks.push(Buffer.from(objects[i] + "\n"));
      }
    }

    // Cross-reference table
    const xrefOffset = Buffer.concat(chunks).length;
    let xref = `xref\n0 ${objectCount + 1}\n`;
    xref += `0000000000 65535 f \n`;
    for (const off of offsets) {
      xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    }

    chunks.push(Buffer.from(xref));
    chunks.push(Buffer.from(
      `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF`
    ));

    return Buffer.concat(chunks);
  }

  // ─── Decode PNG to raw RGB bytes ───────────────────────────────────
  decodePNGtoRGB(pngBuffer: Buffer): { width: number; height: number; rgbData: Buffer } {
    // Use Electron's nativeImage to decode
    const { nativeImage } = remote;
    const img = nativeImage.createFromBuffer(pngBuffer);
    const size = img.getSize();
    const bitmap = img.toBitmap();

    // Bitmap is BGRA, we need RGB
    const pixelCount = size.width * size.height;
    const rgb = Buffer.alloc(pixelCount * 3);

    for (let i = 0; i < pixelCount; i++) {
      rgb[i * 3] = bitmap[i * 4 + 2];     // R (from B position in BGRA)
      rgb[i * 3 + 1] = bitmap[i * 4 + 1]; // G
      rgb[i * 3 + 2] = bitmap[i * 4];     // B (from R position in BGRA)
    }

    return { width: size.width, height: size.height, rgbData: rgb };
  }

  // ─── Save to disk ──────────────────────────────────────────────────
  async savePDF(buffer: Buffer, basename: string) {
    const { dialog } = remote;

    const result = await dialog.showSaveDialog({
      title: "Enigma Export - Save Themed PDF",
      defaultPath: `${basename}.pdf`,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });

    if (result.canceled || !result.filePath) {
      new Notice("Enigma Export: Export cancelled");
      return;
    }

    fs.writeFileSync(result.filePath, buffer);
    new Notice(`Enigma Export: Saved to ${result.filePath}`);
  }

  getVaultPath(): string {
    // @ts-ignore
    return this.app.vault.adapter.basePath;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onunload() {
    console.log("Enigma Export: unloaded");
  }
}
