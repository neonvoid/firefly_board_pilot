# Firefly Boards: built-in features an agent can drive (catalogue, 2026-10-14)

What a browser agent can reach in the Boards web UI with real clicks, found by opening every toolbar, menu and panel on
a live board (Chrome at 67 %, a 1920 px window) and reading the page. Nothing here calls Boards' internals. Credit costs
are what the UI showed at the time; they change.

**Legend:**
- **[tested]**: the agent used it and checked the result.
- **[seen]**: opened and read, not used.
- **[acts]**: a click changes the board or spends credits at once (not a menu).

## Where things are

```
┌ header ─────────────────────────────────────────────────────────────────────────────┐
│ ☰ Main menu   Fi   board name          zoom %  ↶ ↷  Discover  Share  Help   avatar  │
├──┬───────────────────────────────────────────────────────────────────────────────┬──┤
│  │                                                                               │  │
│L │                       canvas                                                  │R │
│e │                                                                               │a │
│f │                                                                               │i │
│t │                                                                               │l │
│  │               [ Generate image | Generate video | Presets ]                   │  │
└──┴───────────────────────────────────────────────────────────────────────────────┴──┘
Left toolbar:  Selection · Artboard (A) · Collection · Text (T) · Shapes · Annotate · Add content
Right rail:    AI Assistant (beta) · Properties · Generation history · Search · Comments
```

## Main menu (☰) [seen]

- Back to home, New board, Open recent ▸, Move to project.
- **Save a copy**: duplicates the whole board. Use it to try an organizer run safely.
- Import ▸ Your device / **Adobe cloud storage**. "Your device" opens the native file picker, which a browser agent
  cannot operate. "Adobe cloud storage" is a picker inside the page, so it may be a way for an agent to add files that
  sit in Creative Cloud storage. Untested.

## Left toolbar

- **Add content** ▸ Your device / Adobe cloud storage [seen], as above.
- **Artboard (A)**, **Collection**, **Annotate**, Shapes, Text: creation tools [seen as buttons only]. Artboards carry
  names, the one place a board holds a label an agent can read.

## Right rail

- **Properties** [tested]. With nothing selected: the canvas fill colour. With ONE item selected, under Transform:
  **W, H, X, Y** (the same board units as an agent's world boxes, checked to within 7 units), rotation, lock aspect,
  flip, rotate 45°, Scale to original size; under Appearance: blend mode and opacity. Typing X or Y and pressing Enter
  moves the item exactly ("Change X" in the undo history). This is the reliable way to organize a board.
- **Generation history** [tested earlier]: every result, Load prompt, Place on canvas.
- **Search** [seen]: Adobe Stock search ("Find inspiration…"), colour chips (Sunset, B&W, Cream, …) and a
  search-by-image button.
- **AI Assistant (beta)** [seen]: Adobe's own chat agent. It takes the selection as context and "/" lists its
  skills. It starts with Create mockups, Create storyboard, Create a brand kit, Build a moodboard, and "What can I do
  with Boards?". Its model setting is "Auto". Credit cost unknown.
- **Comments** [seen]: a comment box, @mentions, emoji, and **pins placed on the board view**; filter by reviewer;
  show annotations. Posting messages collaborators, so an agent needs the operator's yes for each one.

## Bottom bar

- **Generate image** [tested]. The panel row shows:
  - **model** picker: Firefly Image 5, FLUX.2 [pro], Gemini 3.1 (Nano Banana 2), GPT Image 2.5 Sunburst / Flare,
    Runway Gen-4 Image. Under **More models**: Firefly Image 4 Ultra / 4 / 3 / 3 Fast, FLUX.1 Kontext [pro] / [max],
    FLUX1.1 [pro] / Ultra / Ultra Raw, Gemini 3 (Nano Banana Pro), GPT Image 2 / 1.5 / 1.
  - **aspect**: Auto, Cinematic Banner, Panorama, Ultra Wide, Widescreen, Classic, Landscape, Wide, Square, Standard,
    Portrait, Tall, Vertical, Vertical Banner, Vertical Strip.
  - **resolution**: 512p, 1K, 2K, 4K (FLUX.2 [pro] has none).
  - **Seed** [tested]: a popover with an editable seed. It persists until cleared; empty means random.
  - **Use Google Search** switch, and the credit cost (Nano Banana 2 at 1K: 20 credits).

  Above the prompt:
  - **Effects** [seen]: a side panel of preset prompt "ingredients" (Popular, Lighting, Colors, Styles, Scenes,
    Subjects; e.g. Zen brushwork, Misty layers, Dramatic spotlight). Its own Close button closes it.
  - **Elements** (@) [seen]: needs the board inside a project; opens "Move board to project".
  - **Capture area as reference** and **Sample from canvas** [seen as buttons]: refs and prompt text taken from the
    canvas.
- **Generate video** [seen]: model Veo 3.1 (default; widescreen, 720p, 8 s, audio, **400 credits**), Gemini Omni
  Flash, Runway Gen-4.5 Video, Runway Aleph 2.0, Ray 3.14, Firefly Video 2, More models; inputs Image and First frame.
- **Presets** [seen], 37 cards:
  - **Image:** Sketch to image, Mashup, Ideate Logo, Virtual try-on, Electric party, Change pose, Change
    perspective, Restyle, Add to scene, Character and product, Product swap, Product photo, Candid, Street style,
    Cinema, Ink wash, Impasto painting, Loose sketch, Colorize, Cartoonify, 3D Illustration, Isometric 3D, Groovy
    graphic, Polished, Remove text, Y2K, and more.
  - **Video:** Sweeping crane, Slow zoom, Quick zoom, Vertical tilt, Rack focus, Hand held jitter.

  For character work: Change pose and Change perspective (turnarounds), Virtual try-on (costumes), Restyle.

## A selected image's toolbar

| Button | What it opens |
|---|---|
| **Load** (generated images only) | restores that generation's refs and prompt into the panel [tested earlier] |
| **Vary** | "Vary image": Style / Scene / Custom ▸, **6 images for 30 credits** on a partner model [seen]. About 5 credits per image, against 20 for one Nano Banana 2 image |
| **Edit** | Edit with prompt · Insert · Remove · Expand · Edit text in image · Edit in Firefly image editor [seen]. Insert and Remove are generative fill: fix one detail without a full redo |
| **Convert** | **Image to video** · **Image to 3D** [seen] |
| Create element | "Move board to project" dialog (Cancel) |
| icons | Upscale with Topaz Bloom, Remove background, Crop, Link options, Download |
| **More** (also the right-click menu) | Open in ▸ (Photoshop, Illustrator, Adobe Express, Premiere, Frame.io, Timeline beta) · Save as · Cut / Copy / Paste · **Copy as ▸ (Copy as PNG, Ctrl+Shift+C; Copy link to selection)** · Duplicate (Ctrl+D) · Scale to original size · Delete · **Find similar inspiration** · Reorder ▸ (Bring to front Alt+Ctrl+], Bring forward Ctrl+], Send backward Ctrl+[, Send to back Alt+Ctrl+[) · Flip ▸ |

**Copy as PNG** puts the image on the clipboard, which local tools can save to disk without a browser download.
**Copy link to selection** gives a deep link to exactly what is selected (a round), for sharing.

## Grouping and context: artboards, collect, group, projects, Elements

Adobe uses "elements" in two senses: any visual item on a board, and the **Elements** feature below. Sources: Adobe Help
"Collect, arrange, and align elements in canvas" (updated 2026-08-18), "Add artboards to the canvas" (2025-09-24) and
"Create an element" (2026-08-19); the Adobe Community post "Create consistent Characters & Elements in Firefly Boards".

- **Artboards** are named frames on the canvas. Draw one with the Artboard tool (A), or right-click a multi-selection →
  **Artboard from selection**. Properties sets an artboard's size, position, rotation, colour, blend mode and opacity.
  Items dragged inside belong to it.
- **Collect items** (multi-select toolbar or context menu) gathers the selection into a grid inside a new artboard.
  Unavailable when the selection includes text.
- **Arrange** (Rows / Columns / Mosaic) then shows a magenta spacer bar: drag it to set the spacing. **Align**: left,
  center, right, top, middle, bottom, distribute horizontally / vertically. **Group** and the layer order sit under More.
  Adobe's help says to HOVER these icons to open their options; clicking Arrange applied a layout at once.
- **Projects** hold boards and their **Elements**. Elements and Create element on a board need the board inside a
  project ("Move board to project"), a change to how the operator's files are organized: the operator decides.
- **Elements** (beta, "unified generation and editing experience"): reusable Characters, Locations and Objects that
  keep a subject's look consistent across generations.
  - **Create** one from a generated image ("Create element") or with "+ Create new element".
  - **Fields:** a type (Character / Location / Object), a name, a description (what to keep, and what to ignore), and
    extra reference images (several angles help).
  - **Character sheet:** a Character element can generate one (Head, expressions & features; Body, poses & movement →
    Generate all). It keeps generating in the background, and credits apply.
  - **Use:** generation bar → Image / Video → Elements → the element's name (the @ button in the Boards panel).
    Create / Manage add, edit and delete them.
- **The manual equivalent** (Community post): a four-view, A-pose character sheet in one widescreen frame, attached as
  a numbered reference and named by number in prompts. The post recommends Gemini 3.1 (Nano Banana 2) at 4K.

## Two or more items selected

The toolbar shows **Remix**, **Collect items**, **Arrange**, **Align** and More. **[acts]**: clicking Arrange
immediately laid the selection out in a row; its menu (Rows / Columns / Mosaic) only switches the layout. Assume the
same of Collect items and Align until tested. Hover for tooltips; never click to explore.

## Keyboard (through Claude in Chrome)

- Alt+Ctrl+0 Fit all content works.
- Ctrl+0 (Zoom to selection), Ctrl+± and other page-zoom keys are blocked by the extension.
- Ctrl+Z / Ctrl+Shift+Z undo / redo on the canvas.
- Ctrl+D duplicate; Ctrl+[ and Ctrl+] reorder.
- Escape closes menus, and also the whole Generate panel.

## Not yet explored

- Artboard and Collection tools in use.
- Naming an artboard.
- Collect items and Align (beyond the tooltip).
- Capture area as reference; Sample from canvas.
- The AI Assistant's "/" skills.
- Image to 3D and Image to video costs.
- Adobe cloud storage as a way to add files.
- Comment pins.
- Discover (header).
