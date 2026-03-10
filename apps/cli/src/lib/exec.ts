import { spawn } from "node:child_process";

interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export function exec(
	cmd: string,
	args: string[],
	options?: { stdin?: string },
): Promise<ExecResult> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			stdio: "pipe",
		});
		let stdout = "";
		let stderr = "";

		if (!child.stdout || !child.stderr || !child.stdin) {
			resolve({
				exitCode: 1,
				stdout,
				stderr: "Failed to create piped child process",
			});
			return;
		}

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("close", (code) => {
			resolve({
				exitCode: code ?? 1,
				stdout,
				stderr,
			});
		});
		child.on("error", (error) => {
			resolve({
				exitCode: 1,
				stdout,
				stderr: `${stderr}${error.message}`,
			});
		});

		if (options?.stdin) {
			child.stdin.write(options.stdin);
		}
		child.stdin.end();
	});
}
