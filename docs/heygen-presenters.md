# HeyGen presenters in Ultra Studio

Open Studio → Edit Lecture → Avatar → Realistic presenters · HeyGen.
Wayne is the tested male demo presenter. Bryan, Graham, Anthony, Silas,
Emily and Amina use verified preset identifiers from the same provider.

Selecting a presenter preserves existing audio and its voice profile. To
change the voice, use the separate Voice selector and review regeneration.
The selection is included in package export and survives publication.

Static image previews do not start a session. Start live preview explicitly
connects the provider and plays a short, prerecorded male sample. This sample
is independent of the lecture's selected voice. Closing the preview stops
its session. Classroom playback uses the lecture audio and the same presenter
for dynamically generated answers.

Configure LIVEAVATAR_API_KEY, or use the ignored .cache/liveavatar/key file.
The workspace key and session management token stay on the server. The browser
receives only the room client token and the session-scoped control URL.

The current integration uses low-quality H264 for smoother playback, one media
element for synchronized audio/video, no recording during playback, and buffered
one-second PCM chunks. The player uses LiveKit’s established dual-connection handshake, avoiding the fast-join RTC configuration mutation rejected by the in-app browser. A failed signal connection retries once with a fresh room using the same provider session. Sessions are limited to 120 seconds (trial-compatible),
and close after 30 seconds idle. Press Play to reconnect after a session ends.
Longer uninterrupted paid sessions and pre-rendered presenter caching are not
implemented here. All current classroom presenter video is streamed and bills
connected session time, even when its audio narration was prepared earlier.

Verification: package/selection round-trip tests, session ownership and credential
isolation tests, Studio catalog inspection and Wayne live preview through the
shared classroom presenter adapter. Other catalog presets were read from the
provider API; they were not each streamed during verification.
