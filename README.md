# Ultra AI Lecturer

## Run the preview

Run `python3 -m http.server 4173 --bind 127.0.0.1` in this folder and open http://127.0.0.1:4173.

Part 01 is a student classroom interface prototype. It includes a waiting-room entry, three reviewable slides, caption toggle, local hand-raising and question queue, and a sample explanation reveal. It has no authentication, backend, voice, actual 3D avatar, AI answers, or shared session. Questions reset on reload. Google Fonts are optional network resources with local font fallbacks.

## Review gates

We stop after each part and wait for user approval before starting the next.

1. Student classroom layout and interactions — approved.
2. Local lecture runtime — structured segments, timed captions/highlights, pause/resume, activity break — built; awaiting review. Shared session transport remains for publishing and operation.
3. Presenter — reusable male/female 3D models, streaming approved speech, captions and lip-sync; cached clips as fallback.
4. Grounded Q&A and assessments — planned interruptions and reliable return to lecture.
5. Admin studio — source upload, extraction and approved lecture plan/script stages.
6. Assets, HTML slides and delivery script generation — dependency tracking and targeted regeneration.
7. Publishing and operation — authentication, lecture library, scheduling, versioned sessions and end-to-end validation.

The boundaries can be adjusted after each review. The initial assumption is an admin-controlled shared class. Slide navigation in Part 01 is explicitly a review affordance, not the final shared-session behavior.

Part 01 revision: blue Ultra branding, assumed signed-in student, lecture library, floating avatar placeholder, hand raising in the chat panel, sample online classmates, and focus mode (Escape to exit). Presence and account identity are illustrative, not authenticated.

Focus mode retains the chat and classmates panel by default, with Hide chat / Show chat controls. On mobile the chat stays below the slides. Escape exits focus mode.

## Part 02: scripted runtime

`lecture.mjs` defines the approved sample slides and ten timed segments. `player.mjs` is the deterministic timeline; `app.js` connects it to the UI. Timing uses a monotonic browser clock. There is no speech yet; segment durations are provisional until actual audio timing is available.

Start the lecture to watch captions and highlights advance across three slides. The player waits after the question at 0:36; submit an answer, skip to the explanation, or let the 30-second answer timer expire to continue. Narration duration is 0:47, excluding time spent answering. Pause preserves the exact segment offset. During narration, slide navigation seeks to the start of a slide and pauses. During an answer window, navigation only changes the viewed slide: the pending question and countdown are preserved, and submission or timeout returns to the explanation. Restart resets to ready. Returning to the library or hiding the browser tab pauses playback. Focus mode and chat collapsing preserve playback state.

Run meaningful timeline checks with `node --test tests/player.test.mjs`. This remains a single-browser preview: no shared classroom authority, persistence, AI answers, or actual speech. Part 03 will connect audio timing to this player; shared session control requires a backend in a later part.

Part 02 review revision: captions overlay slides. An activity adds a yellow border and waiting badge, posts the scripted lecturer prompt in chat, and counts down 30 seconds. Submit queues a question during narration and submits an answer during an active response window, without grading. No message-type dropdown is shown. The countdown freezes when the document is hidden or the lecture library is open.

The answer countdown is displayed prominently both on the slide and above the chat composer.
