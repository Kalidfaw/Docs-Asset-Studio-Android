/* سجل المستخرجات: لإضافة صيغة جديدة اكتب كائناً { id, label, exts, scan(zip, opts) } وأضفه هنا */
import { pptx } from './pptx.js';
import { docx } from './docx.js';
import { xlsx } from './xlsx.js';
import { pdf } from './pdf.js';

export const EXTRACTORS = [pptx, docx, xlsx, pdf];

export function pickExtractor(filename) {
  const ext = String(filename).split('.').pop().toLowerCase();
  return EXTRACTORS.find((e) => e.exts.includes(ext)) || null;
}

export const ACCEPT = EXTRACTORS.flatMap((e) => e.exts.map((x) => '.' + x)).join(',');
export const FORMATS_LABEL = EXTRACTORS.map((e) => e.label).join(' / ');
