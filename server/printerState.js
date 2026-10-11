export function mergePrinterReport(previous, incoming) {
  if (incoming.print?.command !== 'push_status') return previous;
  return { ...previous, print: { ...previous?.print, ...incoming.print } };
}

export function watchFileStart(client, topic, filename, signal, timeoutMs = 20000) {
  let stop;
  const promise = new Promise((resolve) => {
    let timer, state = {}, finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); client.removeListener('message', message);
      signal.removeEventListener('abort', cancel); resolve(value);
    };
    stop = () => finish({ started: false, cancelled: true });
    const cancel = stop;
    const message = (receivedTopic, bytes) => {
      if (receivedTopic !== topic) return;
      let print; try { print = JSON.parse(bytes.toString()).print; } catch { return; }
      if (print?.command !== 'push_status') return;
      state = { ...state, ...print };
      const name = state.subtask_name || state.gcode_file || '';
      if (!name.includes(filename)) return;
      const error = Number(state.print_error || 0);
      if (error || state.gcode_state === 'FAILED') {
        finish({ started: false, error: `Printer could not start the file (state ${state.gcode_state || 'unknown'}, code 0x${error.toString(16)}).` });
      } else if (['PREPARE', 'RUNNING'].includes(state.gcode_state)) {
        finish({ started: true, state: state.gcode_state });
      }
    };
    if (signal.aborted) { cancel(); return; }
    client.on('message', message); signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => finish({ started: false, state: state.gcode_state || 'unknown' }), timeoutMs);
  });
  return { promise, stop: () => stop() };
}
