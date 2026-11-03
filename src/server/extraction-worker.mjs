import { parentPort, workerData } from 'node:worker_threads';
import { extractDocument } from './extraction.mjs';
try{parentPort.postMessage({result:await extractDocument(workerData.bytes,workerData.filename,workerData.storage)});}
catch(error){parentPort.postMessage({error:error.message});}
