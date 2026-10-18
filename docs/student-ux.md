# Student home and classroom UX review

The home screen previously mixed published lectures with unavailable sample content, displayed a hard-coded lecture count and course label, and devoted excessive space to a welcome message. Published lectures now form the primary list with an actual count, title search, loading/retry feedback and empty states. The working demo is in a separate disclosure; unavailable placeholder lectures are removed.

The classroom now uses the same restrained blue visual language as the studio: consistent control sizes, readable chat text, clearer heading hierarchy, visible focus and responsive layouts. Chat can collapse in normal and focus modes. Close checkpoint labels occupy separate timeline rows. The original slide aspect ratio is preserved, with contained images and bounded captions.

Navigation fixes include recoverable failed published links, explicitly opening the sample when requested from a published session, and returning to the loaded classroom without resetting playback. Published snapshots and studio data are not modified.

Verification: 49 automated tests passed. Browser checks covered search and no results, published classroom entry, cached-voice playback and pause, focus/chat toggles, Escape, hand acknowledgement, and a 480 CSS-pixel narrow viewport without page overflow. Live AI discussion generation was not rerun.
