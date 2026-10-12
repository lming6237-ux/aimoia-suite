import * as pdfjsLib from './vendor/pdfjs/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new Event('pdfjs-ready'));
