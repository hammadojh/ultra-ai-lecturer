# Live Q&A reply pipeline — 19 October 2026

Implemented sentence-level streaming: the answer model emits completed sentences; speech generation overlaps subsequent answer generation; timed clips play in order. This does not yet stream raw audio frames within a sentence. The student sees answer text as it arrives.

Published authoring saves the actual voice profile. Package manifests accept a validated voiceProfile. Existing authored lectures can recover cached voice metadata. Imported audio without metadata cannot establish the original speaker identity; it uses the configured default.

ElevenLabs is the primary provider. Missing configuration, provider errors, invalid audio/timing responses, or an 8-second request timeout trigger Kokoro-82M af_bella. Once a reply falls back, the remainder stays on Kokoro. Local speech has a bounded wait; if both providers fail, text remains readable and voice can be retried during the checkpoint. Network preparation and buffering do not consume the discussion budget. Question coverage is committed only after the final response validates and delivery finishes. Follow-up context now contains student questions and lecturer replies together.

## Verification

- Full Node suite: 109 passing at final implementation check; the subsequently added portable voice-profile test also passed with its relevant suite.
- Real ElevenLabs Flash request: timed audio returned in 1,321 ms for an eight-word sample. This is one request, not an end-to-end latency guarantee.
- Real browser Q&A: first audio at 6,832 ms; reply finished, entered history, and reopened follow-ups.
- Forced unavailable ElevenLabs model in an isolated QA server: actual Kokoro generated speech (5,787 ms and 3,390 ms for two clips), browser completed playback and displayed Kokoro fallback.
- Injected both-provider failure: text delivered, retry button displayed; retry played audio and returned to follow-up without duplicating history.
- Restart during a delayed response: player reset to ready, question/history state cleared, no stale reply appeared.
- Tests cover split transport UTF-8, partial JSON escapes, early audio before model completion, final coverage failure, cancellation, skipped repeated speech failures, timer preservation, paired history, voice profile precedence, and credential exclusion from public profiles.

## Small model comparison

Three demo questions covered a wrong numerical answer, a conceptual question, and an out-of-scope weather request. This is a smoke comparison, not a course-wide benchmark.

- gpt-6.1-sol: first sentence 5.97–6.86 s with previous reasoning defaults; out-of-scope question correctly deferred.
- gpt-6-luna: first sentence 5.37–15.27 s; incorrectly marked the weather request addressed and gave a weaker correction for nine.
- gpt-6.1-sol with low reasoning: first sentence 4.84–5.89 s; correction and deferral remained appropriate for these questions.

Kept gpt-6.1-sol, added an independent ULTRA_REPLY_MODEL override, and selected low reasoning by default for short replies. Timing samples are retained in output/qa/reply-model-benchmark.json and output/qa/reply-low-reasoning-benchmark.json. Remaining latency is mainly answer generation; there is no evidence here for a universal subsecond response promise.

## Imported Java lecture voice repair

For publication `385183d0-2a40-42e0-9b5b-2b8490a56019`, the package's `audio-generation.json` identifies Nichalia Schwartz - Bright and Friendly, voice ID `XfNU2rGpBa01ckF309OY`, model `eleven_v4`, stability 0.5, similarity_boost 0.75. The initial importer ignored this bundled metadata, causing Q&A to choose the global voice. The published snapshot now stores that exact profile (with a backup in publication-history). Package import and legacy published-package recovery now recognize this metadata. Explicit manifest profiles retain precedence.

Sixteen relevant tests passed. A real request using the recovered profile returned timed ElevenLabs audio in 2,715 ms; output/qa/java-original-voice-reply.mp3 contains that test clip. This verifies provider selection and generation, not perceptual identity across arbitrary utterances. Kokoro remains an intentional different-voice fallback on provider failure.
