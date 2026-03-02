# Enigma Export

An Obsidian plugin that exports your notes as PDF while preserving your currently active theme — what you see is what you get.

## The Problem

Obsidian's built-in PDF export strips your custom theme and outputs a plain, unstyled document. If you use a dark theme or a heavily customized theme, the exported PDF looks nothing like your notes.

## How Enigma Export Works

Instead of relying on Chromium's `printToPDF` (which strips theme styles and adds unavoidable white borders), Enigma Export takes a different approach:

1. Reads your currently active theme CSS from disk
2. Captures resolved CSS variables from the live Obsidian environment
3. Inlines everything into a standalone HTML document
4. Renders each page in a hidden browser window sized to A4
5. Captures pixel-perfect screenshots of each page
6. Assembles the screenshots into a PDF

The result is a PDF that looks exactly like your Obsidian notes — dark backgrounds, custom colors, fonts, and all.

## Installation

### From Community Plugins (coming soon)

1. Open **Settings → Community Plugins → Browse**
2. Search for **Enigma Export**
3. Click **Install**, then **Enable**

### Manual Installation

1. Clone or download this repository
2. Install dependencies and build:

```bash
cd EnigmaExport
npm install
npm run build
```

3. Copy the built plugin to your vault:

```bash
mkdir -p /path/to/your/vault/.obsidian/plugins/enigma-export
cp main.js manifest.json /path/to/your/vault/.obsidian/plugins/enigma-export/
```

4. In Obsidian, go to **Settings → Community Plugins**, refresh, and enable **Enigma Export**

## Usage

1. Open the note you want to export
2. Either:
   - Click the **download icon** in the left ribbon, or
   - Open the command palette (`Ctrl+P`) and search for **"Export current note as themed PDF"**
3. Choose where to save the PDF
4. Done — your themed PDF is ready

## What Gets Captured

-  Active theme (read from `.obsidian/themes/`)
-  Enabled CSS snippets (read from `.obsidian/snippets/`)
-  Resolved CSS variables (colors, fonts, sizes)
- Dark and light mode support
- Full background colors (no white borders)
- Headings, code blocks, blockquotes, tables, tags, links, images

## Limitations

- **Text is not selectable** in the exported PDF since pages are captured as images
- **File size is larger** than a traditional vector PDF
- **Embedded files** (like PDFs within notes) may not render
- Requires **desktop Obsidian** (not mobile)

## Development

```bash
# Clone the repo
git clone https://github.com/risshe92/EnigmaExport.git
cd EnigmaExport

# Install dependencies
npm install

# Build (development)
npm run dev

# Build (production)
npm run build
```

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
