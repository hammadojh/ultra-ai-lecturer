# Ultra AI Lecturer

## Run Part 01

Run `python3 -m http.server 4173 --bind 127.0.0.1` in this folder and open http://127.0.0.1:4173.

Part 01 is a student classroom interface prototype. It includes a waiting-room entry, three reviewable slides, caption toggle, local hand-raising and question queue, and a sample explanation reveal. It has no authentication, backend, voice, actual 3D avatar, AI answers, or shared session. Questions reset on reload. Google Fonts are optional network resources with local font fallbacks.

## Review gates

We stop after each part and wait for user approval before starting the next.

1. Student classroom layout and interactions — built; awaiting review.
2. Lecture runtime — structured segments, synchronized cues, pause/resume and shared session semantics.
3. Presenter — reusable male/female 3D models, streaming approved speech, captions and lip-sync; cached clips as fallback.
4. Grounded Q&A and assessments — planned interruptions and reliable return to lecture.
5. Admin studio — source upload, extraction and approved lecture plan/script stages.
6. Assets, HTML slides and delivery script generation — dependency tracking and targeted regeneration.
7. Publishing and operation — authentication, lecture library, scheduling, versioned sessions and end-to-end validation.

The boundaries can be adjusted after each review. The initial assumption is an admin-controlled shared class. Slide navigation in Part 01 is explicitly a review affordance, not the final shared-session behavior.

Part 01 revision: blue Ultra branding, assumed signed-in student, lecture library, floating avatar placeholder, hand raising in the chat panel, sample online classmates, and focus mode (Escape to exit). Presence and account identity are illustrative, not authenticated.

Focus mode retains the chat and classmates panel by default, with Hide chat / Show chat controls. On mobile the chat stays below the slides. Escape exits focus mode.
