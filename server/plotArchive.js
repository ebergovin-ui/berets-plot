import JSZip from 'jszip';
import { createHash } from 'node:crypto';

export const PLATE_PATH = 'Metadata/plate_1.gcode';
export async function buildPlotArchive(gcode) {
  const zip = new JSZip();
  // Keep the validated motion program byte-for-byte identical to the SD export.
  const program = Buffer.from(gcode, 'utf8');
  zip.file(PLATE_PATH, program);
  zip.file(`${PLATE_PATH}.md5`, createHash('md5').update(program).digest('hex').toUpperCase());
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="gcode" ContentType="application/vnd.bambulab.gcode"/><Default Extension="config" ContentType="application/xml"/><Default Extension="md5" ContentType="text/plain"/></Types>');
  zip.file('Metadata/slice_info.config', `<?xml version="1.0" encoding="UTF-8"?><config><plate><metadata key="index" value="1"/><metadata key="gcode_file" value="${PLATE_PATH}"/></plate></config>`);
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { bytes, md5: createHash('md5').update(bytes).digest('hex') };
}

export function plotStartPayload(filename, md5, sequence_id) {
  return { print: { sequence_id, command: 'project_file', param: PLATE_PATH,
    url: `ftp:///${filename}`, file: `/${filename}`, subtask_name: filename,
    project_id: '0', profile_id: '0', task_id: '0', subtask_id: '0', md5,
    timelapse: false, bed_leveling: false, bed_levelling: false,
    flow_cali: false, vibration_cali: false, layer_inspect: false, use_ams: false } };
}
