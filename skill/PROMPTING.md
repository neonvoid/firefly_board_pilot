# Prompting in Firefly Boards: what we learned (Oct 2026)

This guide covers the prompt bar with canvas refs. Every point comes from real generations; points still waiting on a
test are marked **untested**.

## 1. Refs are addressed by position

- A ref is attached by clicking the Image slot, then a canvas item. It becomes `@Image-N`, numbered in click order.
- The model sees the refs in that order, so name them by position and give each one a job:

      Use the reference images: the first image is <what it is, what to take from it>. The second image is <…>.
      The third image is <…>.

- One clause per ref, saying what to take from it: **layout**, **world/look**, **character design**, **medium**,
  **style**.
- **Removing a chip renumbers the rest.** If the order changes, rewrite the prompt. Otherwise the plate silently becomes
  "the fourth image" and the roles swap.
- **Load** (on a result) restores the refs and the prompt, but not the model. Re-check the model picker.

## 2. Sheets and grids

- For a sheet: "the same character six times in a 3x2 grid, full body, the same pose … **only X changes**", then
  list the six variations in reading order.
- Add "keep the design identical in every panel" when only the technique or material should change.
- To pair two sheets panel by panel: "the figure **from the same position in the first image**".
- End with "Professional character design sheet. No text, no labels."

## 3. Mixed media in one frame

To keep two subjects in two different media (e.g. a photographed handmade puppet beside a pencil drawing):
- **Name each subject's material**: "a real felt-and-fabric puppet with visible stitching"; "a pencil-and-marker drawing
  on paper, cut out and composited flat into the photo, no shadow".
- Add **"each keeps its own material"**.
- Set the scene as a photograph, e.g. "a behind-the-scenes photograph on a stop-motion animator's table, grey paper sweep,
  soft studio light", so the drawing reads as something *in* the photo.
- A generic 3D render next to a generic sketch on a flat colour reads weak. A photographed handmade object next to a real
  drawing on paper reads intentional.
- **Model choice matters** (§6). FLUX.2 merges everything into one style. Nano Banana keeps the split.

## 4. Layout plates (pose → render → restyle)

The idea: block the scene in 3D (grey boxes, posed figures, a camera), render grey "plates", then restyle each plate with
style refs, so composition and poses come from the plate and the look from the refs.

What we found:
- **"Keep its exact camera, framing and positions" is not enough.** Nano Banana re-framed both test plates to a flatter,
  more frontal view. It kept who is where, loosely, but not the camera.
- **Match the output aspect to the plate.** "Landscape" produced **4:3** from **16:9** plates, so the model had to
  re-compose. Pick an aspect that matches the plate.
- **Describe each subject's pose as it is in this plate.** A sentence written for one plate contradicts another: "seen
  edge-on as a thin strip" is right at 87° and wrong at 45°. Keep one sentence per variant.
- **Untested:** Boards' "Sample from canvas → Use as composition reference", and the **Restyle** preset (Firefly Image 4)
  with the plate in its **Composition** slot. These may hold the layout better than words.

### Worked example (anonymised)

Plate: a grey 3D layout of a theatre aisle. A rigid puppet hangs by its arms between two seat backs. A flat paper figure
stands in the next gap, turned at an angle. Refs, in click order:
1. the plate;
2. a photo of a miniature set (the look);
3. the puppet's character sheet;
4. the paper figure's drawing.

    Use the reference images: the first image is a grey 3D layout plate. Keep its exact camera, framing, seat rows and
    the two characters' positions and poses. Re-render it in the world and look of the second image: a
    behind-the-scenes photograph of a handmade miniature set of an old theatre, velvet seats, warm light beam above
    their heads, dust in the light. The grey figure hanging by his arms over the two seat backs is the puppet from the
    third image: a real felt-and-fabric puppet, stuck in the narrow gap with his feet dangling. The flat figure in the
    next gap is the character from the fourth image, a pencil-and-marker drawing on a paper cut-out: <POSE SENTENCE>.
    Keep him a flat drawing, never a 3D figure. No text.

    <POSE SENTENCE> per plate:
      0°   facing the camera, flat like a sheet of paper standing upright
      45°  he has turned halfway, like a sheet of paper seen at an angle, starting to slip sideways through the gap,
           so his drawing looks squeezed and foreshortened
      87°  he has turned edge-on like a sheet of paper and shows only as a very thin upright strip with a sliver of
           drawing on its edge; do not turn him to face the camera

What came out:
- The look transferred well.
- At 45° the paper figure read convincingly as a drawn card turned at an angle.
- The camera drifted to a frontal view, and the hanging puppet ended up standing.

Next things to try: a matching aspect, then a composition reference.

## 5. Hygiene

- End every prompt with **"No text."**, or **"No text, no labels."** for sheets.
- **Keep game, franchise and character-IP names out.** Firefly's filter may block them. Describe the look instead.
- One generation per request. Judge it, then change one thing.

## 5b. Words that pull tropes, and steps that become captions

- **A loaded word can outweigh the reference image.** Asked to give a puppet "the alien's body shape" with a cute,
  bead-eyed alien as the ref, Nano Banana 2 produced the stock grey alien (huge almond eyes). The word "alien" won.
  Describe the *shape* in neutral terms instead ("a big round head about as wide as the shoulders, a tiny tapered body,
  short stubby limbs"), and name the features to keep ("his own small bead eyes and closed smile").
- **A list of named steps renders as captions.** Six "panel 1: …, panel 2: …" phrases came back as a captioned
  infographic despite "No text, no labels". Describe the variation as one range ("from his own proportions to the most
  extreme") and add "no captions".

## 6. Models in the Boards picker (Oct 2026)

| Model (picker) | Notes |
|---|---|
| Gemini 3.1 (w/ Nano Banana 2) | Holds a 3D + 2D medium split across up to 4 refs. Model id reads `nano-banana-3`. **20 credits.** Re-frames layout plates (§4). |
| GPT Image 2.5 | Richest costume detail, cleanest grids and sheets. |
| FLUX.2 [pro] | Unifies all subjects into one style, so it's wrong for mixed media. |
| Firefly Image 5 | Accepts only **1** ref. |
| FLUX Kontext (presets) | Built for edits that keep the layout. **Untested** for plates. |

Credit costs other than Nano Banana 2 were not recorded. Read them off the picker.
