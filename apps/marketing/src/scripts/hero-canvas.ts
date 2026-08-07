const canvas = document.querySelector<HTMLCanvasElement>("[data-hero-canvas]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && !reducedMotion) {
	const hero = canvas.closest<HTMLElement>("[data-hero]");
	const start = () => {
		const gl = canvas.getContext("webgl2", {
			alpha: true,
			antialias: false,
			depth: false,
			powerPreference: "low-power",
		});
		if (!gl) return;

		const vertexSource = `#version 300 es
			in vec2 position;
			void main() { gl_Position = vec4(position, 0.0, 1.0); }
		`;
		const fragmentSource = `#version 300 es
			precision highp float;
			uniform vec2 resolution;
			uniform float time;
			out vec4 color;

			float hash(vec2 p) {
				return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
			}

			void main() {
				vec2 uv = gl_FragCoord.xy / resolution;
				vec2 p = uv;
				p.x *= resolution.x / resolution.y;
				float drift = sin((p.x * 1.4 + p.y * 0.8) + time * 0.07) * 0.018;
				float bands = fract((p.x + p.y * 1.18 + drift) * 10.2);
				float line = 1.0 - smoothstep(0.0, 0.022, abs(bands - 0.5));
				float feather = smoothstep(0.01, 0.12, uv.y) * (1.0 - smoothstep(0.98, 1.02, uv.y));
				float hue = fract(uv.x * 0.72 + uv.y * 0.36 + time * 0.008);
				vec3 green = vec3(0.57, 0.88, 0.45);
				vec3 yellow = vec3(1.0, 0.79, 0.35);
				vec3 pink = vec3(1.0, 0.48, 0.66);
				vec3 accent = mix(green, yellow, smoothstep(0.0, 0.48, hue));
				accent = mix(accent, pink, smoothstep(0.46, 1.0, hue));
				float centerFade = 0.58 + 0.42 * smoothstep(0.1, 0.55, distance(uv, vec2(0.5, 0.46)));
				float alpha = line * feather * centerFade * 0.72;
				color = vec4(accent, alpha);
			}
		`;

		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) return null;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				gl.deleteShader(shader);
				return null;
			}
			return shader;
		};

		const vertex = compile(gl.VERTEX_SHADER, vertexSource);
		const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
		if (!vertex || !fragment) return;
		const program = gl.createProgram();
		if (!program) return;
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 3, -1, -1, 3]),
			gl.STATIC_DRAW,
		);
		const position = gl.getAttribLocation(program, "position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		const resolution = gl.getUniformLocation(program, "resolution");
		const time = gl.getUniformLocation(program, "time");
		gl.useProgram(program);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		let frame = 0;
		let visible = true;
		let startedAt = performance.now();

		const resize = () => {
			const bounds = canvas.getBoundingClientRect();
			const dpr = Math.min(1.5, devicePixelRatio || 1);
			const width = Math.max(1, Math.round(bounds.width * dpr));
			const height = Math.max(1, Math.round(bounds.height * dpr));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
				gl.viewport(0, 0, width, height);
			}
		};

		const paint = (now: number) => {
			resize();
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.uniform2f(resolution, canvas.width, canvas.height);
			gl.uniform1f(time, (now - startedAt) / 1000);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			hero?.setAttribute("data-canvas-ready", "");
		};

		const draw = (now: number) => {
			frame = 0;
			if (!visible || document.hidden) return;
			paint(now);
			frame = requestAnimationFrame(draw);
		};

		const resume = () => {
			if (frame !== 0 || !visible || document.hidden) return;
			startedAt = performance.now();
			frame = requestAnimationFrame(draw);
		};

		const pause = () => {
			cancelAnimationFrame(frame);
			frame = 0;
		};

		new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible) resume();
			else pause();
		}).observe(canvas);

		document.addEventListener("visibilitychange", () => {
			if (document.hidden) pause();
			else resume();
		});
		addEventListener("resize", resize, { passive: true });
		paint(performance.now());
		resume();
	};

	if ("requestIdleCallback" in window) {
		window.requestIdleCallback(start, { timeout: 900 });
	} else {
		setTimeout(start, 120);
	}
}
