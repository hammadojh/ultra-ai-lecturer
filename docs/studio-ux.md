# Studio UX revision

## Information architecture

The lecture library and current lecture workflow occupy the left navigation. The working document occupies the main area. AI connection and backup recovery settings live in a native dialog. The student classroom remains a separate destination.

Navigation represents the real workflow rather than a four-step setup wizard that ends prematurely. Original-slide lectures continue through presenter instructions, voice and annotation review. Generated-slide lectures stop honestly at the implemented asset stage. Approval gates still check current input fingerprints.

## Interaction and visual changes

- Current stage, completed stages and prerequisites are visible together.
- Source edits must be saved or cancelled before changing stages.
- Read mode is the default for generated documents, with an explicit Markdown editing mode. Preview content is inserted as text nodes, not executable HTML.
- Voice rows expand for narration and playback; status remains visible when collapsed.
- Annotation clip details expand on demand; coordinates have descriptive labels.
- Annotation approval no longer unexpectedly navigates away. Rehearsal and publication are separate actions after approval.
- Existing global and local generation progress remains in place.
- Settings use a native modal with focus containment and Escape dismissal.
- One blue accent, consistent control sizes, readable text, visible focus and restrained spacing establish hierarchy.
- At narrow widths, the library collapses and workflow navigation scrolls horizontally.

## Verification

49 existing tests pass. Syntax checks and git whitespace checks pass. Browser checks covered settings, manual source entry, setup navigation, reload recovery at review, document Read/Edit modes, temporary draft cleanup, desktop layout and the narrow layout at the browser's 480 CSS-pixel minimum. No new cloud generation or live publication was triggered during UX testing.

## Remaining product boundaries

HTML slide generation from newly generated assets is not implemented. This is now stated at slide-mode selection and at the asset stage. Original slide decks remain the supported end-to-end publication path. This revision does not replace the existing preview identity model with production authentication or claim formal accessibility certification.
