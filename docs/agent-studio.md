# Lecture package studio

`/studio.html` is the administrator lecture library. **New Lecture** and **Edit Lecture** both offer:

- **Upload**: the existing ZIP validation and publication flow. Edit also offers the current package download.
- **Use Ultra Agent**: OpenCode's native web interface inside Studio, with the Ultra agent selected and all eleven teaching skills installed automatically.
- **Connect MCP**: create a private access token and copy connection instructions for a local MCP client. Uses Streamable HTTP at `http://127.0.0.1:4173/mcp`.

Uploads are validated before publishing. Review shows slide, narration and annotation counts and duration. Publish explicitly makes the result available to students and opens its classroom. Replacement preserves the classroom ID and archives the previous snapshot. A stale replacement is rejected. Invalid packages leave the published lecture unchanged.

## Ultra Agent

`npm install` installs the pinned `opencode-ai` runtime; users do not need a global agent installation. `ULTRA_OPENCODE_BIN` optionally selects another executable. On first use Studio creates a lecture workspace and starts OpenCode on a private loopback port. The embedded interface is served through a separate authenticated loopback gateway. A full-screen link opens the same session.

Choose **Select model → OpenAI** for ChatGPT browser/device sign-in, or **OpenRouter** for an API key, then select a model. The runtime only enables these two providers. No provider credentials are imported from the host's environment or personal agent configuration. Connections are stored in the current Studio user's private OpenCode home and reused across that user's lecture workspaces. Provider availability and usage limits still apply. Speech and image generation require appropriate tools or providers separately.

**Add sources** uploads files up to 50 MB each into `sources/`. Mention the uploaded files in chat. Editing exports the existing publication and extracts it into `lecture/`, including its working files. The agent reads `PACKAGE-FORMAT.md` and is instructed to save its final ZIP to `output/ultra-lecture.zip`. **Review package** sends that file through the same full media/package validator used by Upload. The educator explicitly publishes; the agent does not publish. An editing session retains its original publication timestamp so it cannot silently overwrite a later publication.

Closing and reopening the agent in the same browser tab resumes its workspace. Successful publication clears the tab's resume pointer. Workspaces and credentials persist on disk. Up to four runtime processes are kept; the least recently used process is stopped when another is needed, and idle processes stop after an hour. Reopening restarts the process with the saved session.

## Runtime boundary

This integration matches the existing **local, administrator-only Studio**. The gateway verifies the Studio account, checks request origins, and pins API requests to the assigned workspace. Each user gets a separate OpenCode home, and each lecture gets its own files. OpenCode requests approval for shell commands and denies external-directory tool access. These are agent permissions, **not an OS sandbox**: shell commands approved by the administrator run with the Studio process's host privileges. Do not expose this runtime as a public multi-tenant service without container/OS isolation and a production gateway. The native OpenCode web frontend needs outbound network access; this is not an offline UI bundle.

## Contract and implementation

`docs/lecture-package.md` defines version 1 of the portable ZIP contract. It is included with copied/downloaded skills and the full bundle. Skills remain usable independently with external agents.

- `src/server/ultra-agent.mjs`: workspace preparation, per-user runtime environment, process lifecycle, authenticated HTTP/WebSocket gateway, source uploads and generated-package handoff.
- `src/studio/ultra-agent.jsx`: native agent frame, source upload and review controls.
- `src/studio/lecture-library.jsx`: method chooser, package management and publication.
- `src/server/lecture-packages.mjs`: bounded ZIP validation, media verification, staging, publication, replacement history and export. Audio validation requires ffprobe (or ULTRA_FFPROBE).
- `src/studio/main.jsx`, `studio-skills.json`, `studio-skills/*/SKILL.md`: portable skill catalog and download bundle.
- `src/server/server.mjs`: admin authentication and routes. Classroom media remains authenticated.

Agent data lives under `.cache/ultra-agent/<user-hash>/`; uploaded packages under `.cache/packages`; published snapshots under `.cache/published`; replaced snapshots under `.cache/publication-history`. Earlier authoring data remains available. Legacy export includes classroom images, cached audio, article and available working files; missing media yields a clear error instead of an incomplete export.

Run `npm run build:studio` after changing UI, skills or contract, and restart the Node server after backend changes. `npm test` covers package validation/publication, workspace preparation, credential separation, gateway account/origin checks, source paths and stale replacement protection. A passing suite does not prove a provider login or model-generated lecture; those require a connected account and an actual generation run.

## Local MCP

The localhost server exposes `get_teaching_instructions`, `list_lectures`, `create_workspace`, and `submit_package` using the official MCP SDK's stateless Streamable HTTP transport. Clients send `Authorization: Bearer <token>`; an administrator creates tokens in Studio. Tokens expire after 30 days, are stored only as hashes on the server, survive restarts, and can all be revoked from the connection panel. The copied instructions contain the secret; keep them private.

MCP requests require an allowed loopback Host and reject foreign browser Origins. The MCP endpoint accepts bearer authentication independently of browser sessions; existing browser APIs retain their session and origin checks. There is no MCP publication tool.

Clients need local filesystem tools on the same computer. `create_workspace` returns a directory under `.cache/mcp/workspaces/` and optionally exports the selected lecture as `current-lecture.zip`. Save the completed `ultra-lecture.zip` there. Submission reads only that workspace's ZIP, rejects symlinks outside the workspace, runs the existing package and media validator, and returns an owner-restricted Studio review URL. Editing captures the original publication timestamp; publishing a stale replacement is rejected by the existing publication API. Cloud agents cannot connect to this loopback endpoint.

Restart the server after backend changes. Studio browser sessions are in-memory, so a restart requires signing in again. MCP tokens remain valid until expiry or revocation.

## Voice and avatar editing

**Edit lecture → Voice & avatar** lists the configured ElevenLabs account's voices and previews. Avatar cards show Ultra presenter (MPFB), Brunette, Avaturn, AvatarSDK, VRoid, and No avatar, with an expandable live 3D preview and usage attribution. Changing only the avatar does not regenerate narration.

Changing voice requires explicit confirmation to regenerate every classroom audio clip. Before starting, the editor shows the clip and character counts, estimated API cost, and a rough sequential generation time range. Rates are dated and linked to the provider; plan allowances, taxes, retries, and provider load can change actual cost and time. The original lecture stays published while generation runs. Completed clips survive retries and server restarts; reopen Edit lecture to recover the pending job.

Review generated clips before publishing. Word timings are regenerated; annotation timings are scaled and require review. Bundled standalone HTML/animation source files retain their original timing, as noted in the regenerated package. Publication replaces the snapshot atomically, preserves its lecture link, saves the previous version, and rejects stale edits. The selected voice profile also controls classroom question replies; the existing Kokoro fallback remains available for replies.

Jobs persist under `.cache/lecture-settings/`, with staged media under `.cache/packages/`. `src/server/lecture-settings.mjs` implements estimates, regeneration, recovery and publication; `src/studio/lecture-presentation.jsx` provides the editor controls.
