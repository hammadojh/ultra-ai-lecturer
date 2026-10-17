# Ultra AI Lecturer

A staged prototype of an AI lecturer, with a student classroom and a planned admin authoring studio.

## Run locally

Requires Node.js 20+ (tested with Node 24).

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. The server binds only to loopback. `npm start` downloads the small Bella voice file if missing. On the first spoken segment, HeadTTS downloads the Kokoro model through Transformers.js. Initial model loading needs internet access and can take time. Later speech generation runs locally on CPU; generated segment audio is cached in `.cache/speech/`. Model weights and generated audio are excluded from Git. Optional Google Fonts also use the network.

Use **My lectures → Enter classroom → Start lecture**. Enable Lecturer voice for spoken delivery, or disable it for a silent preview. Mute silences speech while keeping the synchronized timeline running. A speech failure pauses the lecture and offers retry or silent mode.

## Current behavior

- Blue Ultra interface, assumed signed-in student, sample lecture library and sample classmates.
- Reusable CC0 female 3D presenter, rendered with TalkingHead and Three.js. One English voice (Kokoro Bella) is included in this review slice. Presenter/voice selection is a later refinement.
- Ten approved narration segments across three HTML slides. HeadTTS generates each short segment on demand with word timestamps and visemes. This is segment-level generation, not token-by-token audio streaming.
- Upcoming speech is prefetched; repeat requests reuse content-addressed audio. Cold generation may create a brief preparation gap. The UI reports preparation rather than advancing the lecture silently.
- Real audio duration drives the timeline; captions display each approved segment and slide highlights follow its cue. The displayed total is an estimate until all clips have been prepared.
- Pause stops audio and animation; resume uses the saved audio offset and trims mouth cues to match. Restart and navigation invalidate outstanding playback callbacks.
- A 30-second answer window posts the scripted lecturer question in chat. Yellow borders and timers identify the wait. Submitting one answer marks it Submitted; the class continues waiting until timeout. Answers are not graded.
- Browsing slides during the answer window changes only the viewed slide; it preserves the pending question, submission and countdown. Timeout returns to the explanation.
- Returning to the library or hiding the browser tab pauses narration and freezes the answer timer. Focus mode retains collapsible chat.

The app still has no authentication, enrollment backend, shared session authority, real online presence, or shared multi-student Q&A. Sample classmates do not submit synthetic answers. Shared sessions will eventually allow advancing when all enrolled participants have answered. No microphone is required or recorded.

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
4. Local checkpoint Q&A — built; awaiting review. Grouped generated feedback, message coverage, bounded follow-up windows and automatic return to teaching. See [the interaction plan](docs/interaction-plan.md).
5. Admin studio: sources, extraction, lecture plans and scripts with approvals.
6. Assets, HTML slide and detailed delivery generation; dependency tracking.
7. Publishing and operation: authentication, versioned shared sessions and end-to-end validation.

Later refinement: revisit avatar quality and presenter choices after the interaction flow has been validated.

## Part 04: local checkpoint discussion

The first discussion checkpoint follows the sample practice question. Questions and raised hands during teaching never stop the lecturer. After the 30-second answer window, all queued questions/answers are sent together to **Qwen3 14B through local Ollama**, with the approved lecture text and recent feedback as context. Kokoro speaks the response through the current avatar. The endpoint validates that every submitted message ID is either covered or explicitly deferred. Coverage is marked Addressed only after delivery finishes. This structural check is not a guarantee that the model's answer is pedagogically or factually perfect.

Ollama must be running at `http://127.0.0.1:11434` with `qwen3:14b` installed. It was already available on the development machine. Other setups can use `ollama pull qwen3:14b` and start Ollama, or set `ULTRA_CHAT_MODEL` to an installed model that supports the required structured JSON output. Neither reasoning nor speech uses a cloud API.

The checkpoint allows **90 seconds for discussion** after collection, with a **12-second idle follow-up window** after each response. New messages during a response are queued for the next batch. Generation has a 40-second request timeout; lack of remaining delivery time defers the batch. An already-playing short response finishes naturally rather than being cut off at the budget. Speech preparation that runs out of discussion time is cancelled locally. Empty queues, idle follow-up windows and exhausted budgets return to the saved narration segment. Deferred messages remain visible. Questions after this preview's only checkpoint are saved as deferred for later; there is no automated post-class answering yet.

`discussion.mjs` owns the queue/state/budget; `feedback.mjs` validates and generates responses. `server.mjs` temporarily registers validated generated text as speech segments (20-minute IDs, bounded to 100), so the browser cannot request arbitrary TTS text. Restart clears the local session queue. Messages live in the browser; generated audio is cached on disk and can be removed by deleting `.cache/speech/`.

This remains one browser, with sample classmates. Real multi-user attendance, all-students-answered detection, shared timers, admin controls and durable discussion history remain future work. Avatar quality is intentionally unchanged.
