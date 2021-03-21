import * as inspector from "inspector";
import { CustomConsole, LogType, LogMessage } from "@jest/console";

// set a simple console instead of the JestConsole that is printing
// too much info to the terminal.
function simpleFormatter(type: LogType, message: LogMessage): string {
  return message
    .split(/\n/)
    .map(line => `      ${line}`)
    .join("\n");
}

const simple = new CustomConsole(process.stdout, process.stderr, simpleFormatter);

// when debugging set jest test timeout to 1hr
const isDebugging = (typeof inspector.url() === "string");
simple.info(`jestSetup: isDebugging=${isDebugging}`);
if (isDebugging) {
  global.console = simple;
  jest.setTimeout(3_600_000);
} else {
  jest.setTimeout(10_000);
}
