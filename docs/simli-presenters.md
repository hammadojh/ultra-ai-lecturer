# Simli presenters

Ultra Studio offers Sabour, Fred, Mark and Hank from Simli's default face catalog. Sabour is the presenter used in the local trial. Choosing a presenter preserves the existing lecture voice.

The workspace key is read server-side from SIMLI_API_KEY or .cache/simli/key. Only short-lived session tokens reach the browser. Browsing selector cards and static previews makes no avatar-generation or live-session request.

Prepared narration uses Simli's static audio-to-video API. Ultra converts the complete narration clip to mono 16 kHz WAV, hashes the selected face and actual audio, and saves the resulting MP4 in .cache/simli/videos. Concurrent requests for the same clip share one generation job. Simli can return a video URL before the MP4 exists; Ultra polls that URL while rendering completes. The accepted job is saved before downloading, so retries after an interrupted download reuse it without resubmitting generation. Replays and seeking use the saved video, with its embedded audio; no live session is opened. The first playback of a new face/audio combination waits for generation and can incur a provider charge. Switching face or regenerating narration creates a different cache entry. Static-video billing must be verified with Simli; do not assume its live per-minute rate applies.

Dynamic replies use the same face via Simli's LiveKit transport and mono 16 kHz PCM. Each spoken reply clip opens a session, closes after speaking, and is bounded to 120 seconds with a 10-second idle limit. The existing streamed-answer pipeline can produce several reply clips, each with a separate session. Interrupt and page exit stop the client. Live preview explicitly uses this live path and consumes credits.

Build the browser SDK with npm run build:simli after updating simli-client; build Studio with npm run build:studio. Test with npm test.

Provider reference: https://docs.simli.com/api-reference/preset-faces and https://docs.simli.com/api-reference/generate-static-video
