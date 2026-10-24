const { spawn } = require("node:child_process");

const child = spawn(process.argv[2], process.argv.slice(3), { stdio: "inherit" });
child.on("exit", (status) => process.exit(status ?? 1));
