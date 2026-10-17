import { mkdir, access, writeFile } from 'node:fs/promises';
const directory=new URL('../.cache/voices/',import.meta.url);
await mkdir(directory,{recursive:true});
const destination=new URL('af_bella.bin',directory);
try{await access(destination);console.log('Voice already installed');}catch{
 console.log('Downloading the Kokoro Bella voice…');
 const response=await fetch('https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_bella.bin');
 if(!response.ok)throw new Error(`Voice download failed: ${response.status}`);
 await writeFile(destination,new Uint8Array(await response.arrayBuffer()));
 console.log('Voice ready. The speech model downloads automatically on first use.');
}
