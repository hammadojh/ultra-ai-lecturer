# Third-party components and assets

- `assets/avatars/lecturer.glb`: unmodified `mpfb.glb` from [TalkingHead](https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb). Its author identifies this MPFB/Blender example as **CC0** in the [asset attribution section](https://github.com/met4citizen/TalkingHead#installation). Downloaded 2026-10-17. The model is a reusable female presenter used for this initial review slice.
- TalkingHead 1.7.0: MIT, Mika Suominen. Copy in `TalkingHead-MIT.txt`; installed through npm.
- HeadTTS 1.3.0: MIT, Mika Suominen. Installed through npm; license in the package.
- Three.js 0.180.0: MIT. Installed through npm; license in the package.
- Kokoro timestamped ONNX model and voices: Apache-2.0, per [HeadTTS dependency documentation](https://github.com/met4citizen/HeadTTS). Downloaded into ignored caches, not committed. Model: `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`; voice: `af_bella`.
- Hugging Face Transformers.js and ONNX Runtime: their respective package licenses apply; installed through npm.

Additional TalkingHead example models downloaded 2026-10-19 from https://github.com/met4citizen/TalkingHead/tree/main/avatars:
- `brunette.glb`: Ready Player Me example, CC BY-NC 4.0; attribution to the TalkingHead example and Ready Player Me. https://creativecommons.org/licenses/by-nc/4.0/
- `avaturn.glb`: Avaturn example, identified upstream for non-commercial use.
- `avatarsdk.glb`: AvatarSDK example, identified upstream for non-commercial use.
- `vroid.glb`: VRoid Studio example, identified upstream for non-commercial use. Meshopt buffer compression was decoded for compatibility with TalkingHead 1.7.0; an Armature parent node was added for the older loader. Geometry and textures are unchanged.
- Avatar PNG previews are renders of the corresponding models and carry their model's usage conditions.

Source attribution and usage statements: https://github.com/met4citizen/TalkingHead#installation. The selector displays each model's usage label and links to that source. These example assets are not a blanket commercial-use license.
