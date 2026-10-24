const { spawn } = require("node:child_process");

const migrate = spawn(
  "pnpm",
  ["--filter", "@tumi/database", "exec", "prisma", "migrate", "deploy"],
  { stdio: "inherit", shell: true },
);

migrate.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }
  const child = spawn(process.argv[2], process.argv.slice(3), { stdio: "inherit" });
  child.on("exit", (status) => process.exit(status ?? 1));
});
