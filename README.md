# Ultra AI Lecturer

A staged prototype of an AI lecturer, with a student classroom and a planned admin authoring studio.

## Run locally

Requires Node.js 22.13+ (tested with Node 24).

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. The server binds only to loopback. `npm start` downloads the small Bella voice file if missing. On the first spoken segment, HeadTTS downloads the Kokoro model through Transformers.js. Initial model loading needs internet access and can take time. Later speech generation runs locally on CPU; generated segment audio is cached in `.cache/speech/`. Model weights and generated audio are excluded from Git. Optional Google Fonts also use the network.

Use **My lectures → Enter classroom → Start lecture**. Enable Lecturer voice for spoken delivery, or disable it for a silent preview. Mute silences speech while keeping the synchronized timeline running. A speech failure pauses the lecture and offers retry or silent mode.

## Current behavior

- Blue Ultra interface, assumed signed-in student, sample lecture library and Omar as the only student.
- Reusable CC0 female 3D presenter, rendered with TalkingHead and Three.js. One English voice (Kokoro Bella) is included in this review slice. Presenter/voice selection is a later refinement.
- Ten approved narration segments across three HTML slides. HeadTTS generates each short segment on demand with word timestamps and visemes. This is segment-level generation, not token-by-token audio streaming.
- Upcoming speech is prefetched; repeat requests reuse content-addressed audio. Cold generation may create a brief preparation gap. The UI reports preparation rather than advancing the lecture silently.
- Real audio duration drives the timeline; captions display each approved segment and slide highlights follow its cue. The displayed total is an estimate until all clips have been prepared.
- Pause stops audio and animation; resume uses the saved audio offset and trims mouth cues to match. Restart and navigation invalidate outstanding playback callbacks.
- A 30-second answer window posts the scripted lecturer question in chat. Yellow borders and timers identify the wait. Omar is the only enrolled student in this preview: submitting his answer immediately opens the discussion checkpoint. The composer stays enabled for follow-up questions. Answers are not graded.
- Browsing slides during the answer window changes only the viewed slide; it preserves the pending question, submission and countdown. Timeout returns to the explanation.
- Returning to the library or hiding the browser tab pauses narration and freezes the answer timer. Focus mode retains collapsible chat.

The app still has no authentication, enrollment backend, shared session authority, real online presence, or shared multi-student Q&A. The solo preview advances on Omar’s answer; shared sessions will require authoritative enrollment and response tracking. No microphone is required or recorded.

## Implementation

- `lecture.mjs`: approved slide content and narration segments.
- `player.mjs`: deterministic lecture/activity state machine.
- `presenter.mjs`: avatar loading, speech fetching, audio trimming and lip-sync.
- `server.mjs`: restricted local static server, approved-segment speech endpoint, HeadTTS worker, content-addressed speech cache. It accepts segment IDs, not arbitrary text.
- `app.js`: classroom interactions, captions, highlighting, focus mode and playback coordination.
- `licenses/ASSETS.md`: provenance and licenses for the avatar and dependencies.

```sh
npm test
```

The timeline tests cover pause/resume, activity boundaries, timeout, navigation, restart and content references. Browser checks additionally cover rendered avatars, audio playback state, actual clip durations, pause/resume, submission waiting, focus mode and responsive layout. Audio quality still needs the user's listening review.

## Review gates

We stop after each part and wait for user approval.

1. Student classroom interface — approved.
2. Scripted lecture runtime and timed chat activity — approved.
3. First speaking 3D presenter — functional baseline accepted for continuing. Avatar visual quality and presenter/voice selection are deferred to a later review.
4. Local checkpoint Q&A — approved. Grouped generated feedback, message coverage, bounded follow-up windows and automatic return to teaching. See [the interaction plan](docs/interaction-plan.md).
5. Admin studio: sources, extraction, lecture plans and scripts with approvals.
6. Assets, HTML slide and detailed delivery generation; dependency tracking.
7. Publishing and operation: authentication, versioned shared sessions and end-to-end validation.

Later refinement: revisit avatar quality and presenter choices after the interaction flow has been validated.

## Part 04: local checkpoint discussion

The first discussion checkpoint follows the sample practice question. Questions and raised hands during teaching never stop the lecturer. After Omar answers or the 30-second answer window expires, all queued questions/answers are sent together to **Qwen3 14B through local Ollama**, with the approved lecture text and recent feedback as context. Kokoro speaks the response through the current avatar. The endpoint validates that every submitted message ID is either covered or explicitly deferred. Coverage is marked Addressed only after delivery finishes. This structural check is not a guarantee that the model's answer is pedagogically or factually perfect.

Ollama must be running at `http://127.0.0.1:11434` with `qwen3:14b` installed. It was already available on the development machine. Other setups can use `ollama pull qwen3:14b` and start Ollama, or set `ULTRA_CHAT_MODEL` to an installed model that supports the required structured JSON output. By default, reasoning and speech run locally. Admins can optionally connect ChatGPT for lecture planning as described below.

The checkpoint allows **90 seconds for discussion** after collection, with a **12-second idle follow-up window** after each response. New messages during a response are queued for the next batch. Generation has a 40-second request timeout; lack of remaining delivery time defers the batch. An already-playing short response finishes naturally rather than being cut off at the budget. Speech preparation that runs out of discussion time is cancelled locally. Empty queues, idle follow-up windows and exhausted budgets return to the saved narration segment. Deferred messages remain visible. The final checkpoint revisits deferred messages; there is no automated post-class answering.

`discussion.mjs` owns the queue/state/budget; `feedback.mjs` validates and generates responses. `server.mjs` temporarily registers validated generated text as speech segments (20-minute IDs, bounded to 100), so the browser cannot request arbitrary TTS text. Restart clears the local session queue. Messages live in the browser; generated audio is cached on disk and can be removed by deleting `.cache/speech/`.

This remains one browser, with Omar as its only student. Feedback addresses Omar by name. Real multi-user attendance, all-students-answered detection, shared timers, admin controls and durable discussion history remain future work. Avatar quality is intentionally unchanged.

Final Q&A revisits deferred messages after the recap and accepts repeated questions without the mid-lecture discussion budget. It closes after 30 idle seconds. Typing replaces the countdown with a waiting state; 20 seconds without further typing or submission releases the lecturer. Feedback captions and chat text wait for speech readiness, showing Thinking… meanwhile (silent mode shows text immediately).

## Part 05a: admin source review

Open /admin.html or choose Admin studio in the classroom navigation. Create named drafts, paste text or import TXT/Markdown, expand source previews, and approve the source set. Changing a title or source clears approval. Drafts persist in this browser's localStorage; JSON export provides a portable backup. This is an assumed-admin local preview, not authenticated administration. PDF/PPTX extraction is now available in the next slice below. AI plan generation, server-side draft storage and publication remain subsequent review slices.

## Part 05b: PDF and PowerPoint source extraction

Import PDF or PPTX up to 15 MB and 300 pages/slides. Extraction runs locally in a short-lived worker with a 120-second timeout. Page/slide labels and extraction warnings accompany editable text; nothing is automatically approved. The source keeps its original extracted sections as provenance alongside the reviewed text. Original files and extracted images are saved locally under ignored .cache/imports; the browser draft contains their local URLs. Deleting a draft removes its browser record, while cached files remain on this computer. JSON export does not bundle these files.

PDF text uses Mozilla PDF.js. PPTX uses fflate and fast-xml-parser, following presentation relationships rather than filename order. PDF page rendering and embedded raster image extraction are supported; PPTX embedded raster images are extracted too. OCR, legacy .ppt, speaker notes and animation playback are not supported in this slice. Scanned or image-only PDF pages retain their visual preview but need a manual transcript for planning. Review tables, equations and reading order against the originals.

## Source management and original-slide mode

Drafts and sources can be edited or deleted, with one-step Undo for deletion. Changes invalidate source approval. Original-slide mode requires a PDF with rendered page previews and retains its source ID and page order; PowerPoint must be exported to PDF for exact-layout presentation. This authoring preference is not yet published to the classroom runtime. After approval, Next: lecture plan opens a saved audience/duration/outcomes brief. AI plan generation is the next implementation slice. Older text-only imports must be re-uploaded to recover visuals.

Admin setup now follows four visible steps: New lecture → Upload material → Lecture details → Review & confirm. Successful imports add sources automatically. Title defaults to the first uploaded filename; audience, 30-minute duration and starter outcomes are prefilled and editable. Back navigation retains data, and confirmation records the complete setup before the upcoming AI plan-generation stage.

## Part 05c: AI lecture-plan generation

After confirming setup, choose Generate lecture plan. The local Ollama Qwen3 14B model receives reviewed source text, title, audience, duration, outcomes and the original-slide preference. It returns outcomes, concepts, timed teaching sections, proposed examples, interactions, assessment, next steps and gaps. Server validation rejects invented source IDs and durations that do not total the requested time. This is structural validation, not a factual quality guarantee.

Review and edit the generated Markdown, download it, and approve the plan. Changes to sources or lecture details make the plan stale; editing the plan clears its approval. Generation supports cancellation, retains the prior plan on failure, and has a three-minute timeout. This slice accepts at most 50,000 source characters without silent truncation. Plans are saved with drafts in this browser. It does not yet generate the presentation script.

### Optional ChatGPT connection for admin authoring

In the admin page, choose **Continue with ChatGPT**, complete OpenAI sign-in and consent, then select **ChatGPT plan** and an available model in the planning step. This uses the official local/open-source app sign-in flow; account eligibility and plan limits apply. Lecture material is sent to OpenAI when this provider is selected. Student Q&A and voice remain local. Errors never silently switch providers.

Use `http://127.0.0.1:4173/admin.html` for the loopback callback. Tokens are stored only in the ignored `.cache/chatgpt/` directory with owner-only permissions, never in browser storage. Disconnect clears local credentials and attempts remote revocation. Cloud generation requires a successful user sign-in before it can be verified.

### OpenRouter authoring provider

Choose **Continue with OpenRouter** in the admin page, authorize on OpenRouter, then choose **OpenRouter** and a model in lecture planning. The official OAuth PKCE flow creates a user-controlled key; no manual key paste is needed. Generation uses OpenRouter credits and sends source material to OpenRouter and the selected model provider. The picker includes models advertising structured-output support; account restrictions and provider availability can still affect requests.

The key stays in ignored `.cache/openrouter/connection.json` with owner-only permissions. Disconnect removes the local key; revoke it in OpenRouter's key settings to remove remote access. Student Q&A and voice remain local. Real authorization and generation require the admin to connect their account.

### Presentation script review

After approving the current lecture plan, choose **Next: presentation script**. Generate using the same selected provider, review/edit the Markdown, download it, and approve it. Segments include cumulative timestamps, exact narration, slide/visual requests, presenter actions and source names. Timing totals and final Q&A are validated before saving. Source or plan changes require regeneration and approval. This authoring stage does not yet publish the script into the student classroom; asset preparation is the next reviewable stage.

### Original-slide presenter instructions

After approving a script in original-slide mode, continue with uploaded slides and generate presenter instructions. The model maps script segments to extracted slide numbers and suggests tone, energy, emphasis and text-based pointing targets. Narration is copied verbatim from the approved script. The server validates complete segment coverage and existing slide references in order. Admins can edit, download and approve instructions; script/source changes make them stale. These authoring instructions are not yet executed by classroom playback. Voice preparation follows this review step.

### Modular voice preparation

After presenter-instruction approval, choose **Next: prepare voice**. Approved narration blocks are split into short clips (up to 600 characters) and synthesized locally with Kokoro-82M, Bella, English. Audio is cached under ignored `.cache/authoring-audio/`; each clip has playback, WAV download and a review checkbox. Stop waits for the current clip; retry continues missing clips. Changed presenter instructions invalidate approval. This is pre-generated narration; attaching it to avatar lip-sync and the classroom is the next stage. Timing and delivery cues are not yet applied to speech prosody.

### Avatar rehearsal

After approving the voice set, open **Preview avatar & lecture**. The rehearsal reads the selected browser draft, validates current approvals, and plays prepared Kokoro audio with its cached word/viseme timing through TalkingHead. It supports clip navigation, pause/resume, mute, captions once audio is ready, presenter cues and manual checkpoint continuation. PDF page previews preserve original layouts; decks without previews explicitly use extracted text. Live student Q&A, pointing animation, and classroom publication are not connected in this rehearsal yet.

### AI annotation generation

In rehearsal, choose **Generate AI annotations for lecture**. The selected ChatGPT or OpenRouter model receives the actual rendered slide image, presenter cues, narration and indexed speech words. It returns bounded highlight/circle/underline regions and word ranges, which are converted to cached audio timestamps. Every completed clip (including one requiring no marks) is saved, so interrupted runs resume. Manual marking is an optional correction. The selected model must accept image input; local Qwen text-only planning does not provide this capability. Review AI placements before student publication.
