# [inthe] box — Scanimation Designer & Parallax Artwork Studio

`[inthe] box` is an interactive multi-directional scanimation and parallax illusion artwork designer. 

**Version 1** focuses on high-precision SVG shape parsing, zone mapping, and project configuration setups.

---

## 🚀 How to Run Locally

You can download and run this application on your local machine in just a few steps.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (version 18 or newer recommended).

### Setup and Start Instructions

1. **Unzip or Clone the project** to your local machine.
2. **Open your terminal** and navigate to your project directory:
   ```bash
   cd inthe-box
   ```
3. **Install the dependencies** via npm:
   ```bash
   npm install
   ```
4. **Boot the development server**:
   ```bash
   npm run dev
   ```
5. **Open your browser** to the local address displayed:
   ```text
   http://localhost:3000
   ```

---

## 🛠️ Usage Guide

### 1. File & Project Setup
- **Template Selection:** On launch, the workspace is automatically populated with our premium **Illusion Box** template. You can swap between pre-crafted vectors (**Concentric Waves**, **Vortex Layers**) with a single click in the sidebar dropdown.
- **Custom Uploads:** Click **Upload SVG** or drag-and-drop any standard `.svg` file directly into the app wrapper to automatically identify shapes.

### 2. Interactive SVG Mapping
- Click any outline directly inside the **Central Blueprint Viewport** to select it.
- Alternatively, select layers by searching or clicking items inside the **Detected Layers** list on the left sidebar.

### 3. Customizing Scanimation Settings
When a zone is selected, calibrate its properties in the right sidebar panel:
- **Zone Name:** Customize names to label different layers.
- **Frame Count:** Set target phases (2 - 24) to establish shift resolution.
- **Window Width (mm):** Set physical grid slit dimensions.
- **Reveal Direction Dial:** Drag the cursor on the polar dial to specify diagonal, vertical, or horizontal vectors. Standard snaps (Right, Left, Down, Up) are available for quick, exact locking!
- **Design Notes:** Type layout profiles or print information.

### 4. Direct JSON Portability
- **Save Work:** Click **Save JSON** to download a highly portable `.json` scanimation package containing your complete settings and the original SVG artwork.
- **Restore Work:** Click **Load JSON** (or drag & drop your project JSON file) to resume right where you left off!

---

## 📁 Key File Structures

- `/src/types.ts`: TypeScript definitions for project settings, coordinates, and zone models.
- `/src/sampleSvgs.ts`: Built-in templates for instantaneous testing.
- `/src/svgParser.ts`: Low-overhead browser DOM elements instrumenter and identifier mapper.
- `/src/components/SvgCanvas.tsx`: Interactive grid workspace with click delegation and mouse zoom-pan.
- `/src/components/VectorSelector.tsx`: Custom mouse-draggable polar degree direction dial.
- `/src/components/ZonePropertiesPanel.tsx`: Target fields and calibration controls for active shapes.
- `/src/components/ZoneListSidebar.tsx`: Grid filters and template controls for layers.
- `/src/App.tsx`: Core application layout, global shortcuts, and file loaders.
