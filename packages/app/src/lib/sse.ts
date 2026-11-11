/** Incremental Server-Sent Events parser. Feed it decoded text as it arrives;
 *  it calls `onData` once per complete `data:` payload and tolerates chunks
 *  that split a line or an event in half. Comment lines (":keep-alive") are ignored. */
export function createSseParser(onData: (data: string) => void) {
  let buffer = "";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length > 0) onData(dataLines.join("\n"));
    dataLines = [];
  };

  const handleLine = (line: string) => {
    if (line === "") return dispatch();
    if (line.startsWith(":")) return;
    if (line.startsWith("data:")) dataLines.push(line.slice(line[5] === " " ? 6 : 5));
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        handleLine(buffer.slice(0, newline).replace(/\r$/, ""));
        buffer = buffer.slice(newline + 1);
      }
    },
    end() {
      if (buffer) handleLine(buffer.replace(/\r$/, ""));
      buffer = "";
      dispatch();
    },
  };
}
