# Third-party components and assets

- `assets/avatars/lecturer.glb`: unmodified `mpfb.glb` from [TalkingHead](https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb). Its author identifies this MPFB/Blender example as **CC0** in the [asset attribution section](https://github.com/met4citizen/TalkingHead#installation). Downloaded 2026-10-17. The model is a reusable female presenter used for this initial review slice.
- TalkingHead 1.7.0: MIT, Mika Suominen. Copy in `TalkingHead-MIT.txt`; installed through npm.
- HeadTTS 1.3.0: MIT, Mika Suominen. Installed through npm; license in the package.
- Three.js 0.180.0: MIT. Installed through npm; license in the package.
- Kokoro timestamped ONNX model and voices: Apache-2.0, per [HeadTTS dependency documentation](https://github.com/met4citizen/HeadTTS). Downloaded into ignored caches, not committed. Model: `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`; voice: `af_bella`.
- Hugging Face Transformers.js and ONNX Runtime: their respective package licenses apply; installed through npm.

No Ready Player Me or AvatarSDK models are bundled.
