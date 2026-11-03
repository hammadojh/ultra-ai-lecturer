# Ultra classroom package format — version 1

## What students see

The classroom displays slide images in order, plays supplied narration through the built-in presenter, shows captions from segment text, and runs question/discussion checkpoints on the timeline. Optional annotations highlight regions at clip-relative times. Word timestamps improve streaming captions and lip sync. Without timestamps, captions use the classroom's fallback and lip sync is less precise.

Version 1 plays PNG/JPEG/WebP slides and WAV/MP3 audio. Editable HTML, animations, plans, sources and scripts are preserved in the ZIP for editing outside Ultra, but HTML/JavaScript animations are **not executed in the classroom**. Render essential animation states as separate slides with corresponding narration. Supported avatar IDs are `default`, `brunette`, `avaturn`, `avatarsdk`, `vroid`, and `none`. HeyGen realistic IDs are `heygen-wayne`, `heygen-bryan`, `heygen-graham`, `heygen-anthony`, `heygen-silas`, `heygen-emily`, and `heygen-amina`. They require the server LiveAvatar connection and streaming credits; the package does not contain a prerecorded presenter video. Arbitrary custom avatar URLs are not supported.

## ZIP structure

Put `lecture.json` at the ZIP root, not inside a parent folder. Use relative ASCII paths (letters, numbers, slash, dash, underscore, dot); no absolute paths, `..`, URLs or missing files. Limit: 200 MB compressed AND expanded, at most 2,000 entries. One lecture per ZIP.

```text
lecture.json
article.md
plan.md
script.md
toned-script.md
slides.html
slides/01.png
slides/02.png
audio/01.wav
audio/02.wav
```

`lecture.json`, its referenced article, every slide image and every narration audio file are required. Other working files are optional but strongly recommended for editing. Keep original sources only when appropriate to include in the package.

## Manifest example

This is a shape example, not a playable package. Generate the referenced files and measure audio durations; do not fabricate audio or timestamps.

```json
{
  "format": "ultra-lecture",
  "version": 1,
  "title": "Introduction to functions",
  "article": "article.md",
  "avatar": "default",
  "slides": [
    {"id": "cover", "title": "Introduction to functions", "image": "slides/01.png"},
    {"id": "practice", "title": "Try an input", "image": "slides/02.png"}
  ],
  "segments": [
    {"id": "clip-01", "slide": "cover", "text": "Welcome. Today we will explore functions.", "audio": "audio/01.wav", "duration": 4.2, "kind": "narration"},
    {"id": "clip-02", "slide": "practice", "text": "If the rule doubles seven, what is the output?", "audio": "audio/02.wav", "duration": 4.8, "kind": "checkpoint", "question": "What is seven doubled?", "answerSeconds": 30,
      "annotations": [{"style": "highlight", "x": 0.2, "y": 0.3, "w": 0.4, "h": 0.15, "start": 1.0, "duration": 2.0}]}
  ]
}
```

## Exact field rules

- `format`: exactly `ultra-lecture`; `version`: integer `1`.
- `title`: nonempty string, max 200 characters.
- `article`: relative path to a nonempty UTF-8 Markdown file. Its contents ground classroom Q&A. Include the approved lesson article, not just a filename or outline.
- `avatar`: omitted (default presenter), or `default`, `brunette`, `avaturn`, `avatarsdk`, `vroid`, `none`, or one of the HeyGen IDs above.
- `slides`: 1–300 objects, in teaching order. Each has a unique string `id` (max 80 characters), nonempty `title` (max 300), and `image` path. Recommended image canvas: 1600×900, consistent aspect ratio. Each slide must have at least one narration segment.
- `segments`: 1–2,000 objects in playback order. `id` is unique (max 80); `slide` references a slide ID; `text` is exact spoken narration (max 10,000 characters); `audio` references a real WAV or MP3; `duration` is its measured length in seconds, >0 and ≤3,600. Do not include stage directions in spoken text.
- `kind`: `narration` (default), `checkpoint` (pause for answers/discussion), or `final_qa` (final discussion). Mark only the final clip of a checkpoint passage, so the lecturer finishes speaking before questions.
- `question`: optional plain text prompt; defaults to narration. `answerSeconds`: authoring agents must choose and write a custom duration for each checkpoint based on task complexity and learner effort; include it in the overall teaching budget. For older packages, optional 1–600 seconds; default 30.
- `words`, `wtimes`, `wdurations`: optional arrays of equal length. Words are strings. Word start times and durations are nonnegative **milliseconds relative to this audio clip**. All ends must fit inside its measured duration. Supply all three arrays or omit all three. Use actual provider/alignment timestamps.
- `annotations`: optional array; omit or use `[]` to skip. Each mark has `style` (`highlight`, `circle`, `underline`), normalized slide coordinates `x,y,w,h` in [0,1] with positive dimensions and boxes fully inside the image, and `start,duration` in **seconds relative to the clip**, with positive duration and end inside the audio. Coordinates apply to the full rendered image, including its margins.

## Agent assembly and review

1. Read the sources; obtain the audience, goals and time budget. Produce and review the article and teaching plan.
2. Create cover, objectives, section, content, practice and ending slides. Keep slides minimal; put graphs on dedicated slides with short captions. Include slide numbers, breadcrumb and footer. Preserve stable IDs through edits.
3. Retouch and optionally animate the editable HTML. Export every classroom-visible state as a slide image. Inspect images for clipping, missing fonts and unreadable text.
4. Write and tone narration in sync with the final slide order. Generate real audio with the user's chosen provider; measure it and obtain word alignment when supported. Ask for a speech tool if none is available.
5. Optionally add timed annotation boxes. Keep annotation and caption timing tied to the same final audio; regenerate timing when narration changes.
6. Assemble the manifest with relative file references. Open every image, play representative audio clips, validate all IDs/files/times and ensure all slides are covered. Compress the files at the ZIP root.
7. Give the admin the ZIP, a concise inventory, duration, and any limitations. They upload it to Studio, review validation, then explicitly publish it. Do not publish on their behalf without authorization.

## Editing an existing lecture

Unzip the downloaded package. Read the manifest, article and working files before editing. Preserve unaffected IDs and assets. After changes, update slide references, audio, timings and annotations together. Return a complete replacement ZIP, not a patch. The admin uploads it from that lecture's Edit Lecture → Upload screen; Ultra retains its classroom URL and archives the previous published snapshot.

### Voice continuity for live questions

Packages may include a `voiceProfile` in `lecture.json`, for example:

```json
{"provider":"elevenlabs","voiceId":"YOUR_VOICE_ID","model":"eleven_flash_v2_5","settings":{"speed":1}}
```

Use the voice ID, model and settings used to create the narration. Never include an API key. The profile is validated and saved with the published classroom. Legacy authoring captures profiles from generated clips and recovers available cached clip metadata. Older packages without voice metadata use the configured server voice; exact matching cannot be inferred from an audio file.

Live replies stream as independently playable sentences with word timings. The server starts speech synthesis while the answer model continues generating. Each sentence is buffered as a complete audio clip before playback; this is not raw token/audio-frame streaming. ElevenLabs failures fall back to local Kokoro-82M `af_bella` for the rest of that reply. If speech is unavailable, the answer stays visible with a retry button during the checkpoint. Preparation time does not consume the discussion budget, and message coverage commits only after the complete answer validates and is delivered.

`ULTRA_REPLY_MODEL` overrides the answer model independently of authoring. The default remains `ULTRA_CHATGPT_MODEL` or `gpt-6.1-sol`; `ULTRA_REPLY_REASONING` defaults to `low`. For lectures without a saved profile, `ULTRA_REPLY_VOICE_MODEL` defaults to `eleven_flash_v2_5`. Saved lecture profiles take precedence. `ULTRA_PORT` defaults to 4173; alternate ports are useful for isolated QA (ChatGPT OAuth callback remains on 4173).
