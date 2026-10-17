# Checkpoint-based classroom interaction

Status: first local checkpoint implementation built; awaiting user review. Shared multi-student operation remains planned.

## Teaching and interruption policy

Student questions and raised hands never interrupt an utterance or stop narration. They enter the session queue. The lecturer reaches a predefined checkpoint in the approved delivery script before handling them. Manual admin pause remains a separate control.

Each checkpoint identifies its source context, resume segment, response collection window, follow-up idle timeout, and maximum discussion time. These values belong in the lecture plan and are configurable; the current preview uses 30 seconds for collection, 12 seconds for idle follow-ups and a 90-second discussion budget. The UI shows students the next opportunity for questions.

## Batch discussion

At a checkpoint, collect every unaddressed student question and assessment response available at the batch cutoff. Group duplicates and related concepts, identify common misconceptions, and produce a coherent response grounded in the approved material. Do not fabricate classmates, submissions, agreement, or class statistics.

Keep message IDs and coverage mappings. Messages progress through queued, selected, addressed, or explicitly deferred states. A message is only addressed after its associated feedback has actually been delivered; model selection alone does not count. Unrelated, out-of-scope, or time-limited items stay visible as deferred rather than silently disappearing.

New messages arriving while the lecturer speaks enter the next batch. They must not restart or interrupt the current response. Student answer submission alone does not end a class response window. In a real shared session, the collection window can close when every expected participant has answered or its timer expires.

## Follow-up and time budget

After delivering a batch, keep the session open for follow-up questions. Show a clear follow-up state and countdown. If new questions arrive, process the new unaddressed batch at the next speaking boundary while there is sufficient time remaining.

If no questions arrive before the idle timeout, continue the lecture. Enforce an overall discussion budget so continual questions cannot prevent material coverage. Before generating another response, reserve enough time for its spoken delivery and a transition back to the lecture. Limit response length to the available budget. Never cut speech mid-sentence to enforce the limit; allow the current sentence to finish and defer remaining items explicitly. The maximum time is therefore a scheduling budget with a bounded sentence-ending overrun.

Resume from the recorded next teaching segment, without repeating or skipping approved material. Preserve pending items for the next relevant checkpoint or a post-lecture queue. The planned lecture duration includes checkpoint budgets.

## Planned state sequence

Teaching → checkpoint collection → reviewing the pending batch → speaking feedback → follow-up window → another batch or resuming teaching.

Queued questions and raised hands do not change the Teaching state. The session remains active throughout checkpoint discussion.

## First reviewable implementation

Use the existing sample lecture and presenter. Add one explicit checkpoint, real generated feedback for submitted answers/questions, grouped coverage tracking, a timed follow-up window, and automatic return to the approved script. Validate empty queues, duplicate questions, arrivals during speech, answer submission, generation failures, time limits, and exact resumption.

The local preview can validate one browser's queue. Multi-student coverage and all-participants-answered behavior require authoritative shared session state, not the sample online roster. A student's tab visibility must not pause the class-wide clock once shared sessions are implemented.

## Deferred avatar work

Return to avatar visual quality after the interaction flow is reviewed. Evaluate male/female options, character style, clothing, facial detail, lighting, gestures, and voice selection together. Keep the current functional presenter while validating teaching behavior.
