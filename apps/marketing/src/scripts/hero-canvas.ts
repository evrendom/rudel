const canvas = document.querySelector<HTMLCanvasElement>("[data-hero-canvas]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const permutation = [
	151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
	36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234,
	75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237,
	149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48,
	27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105,
	92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73,
	209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
	164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38,
	147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189,
	28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101,
	155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
	178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12,
	191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31,
	181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
	138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215,
	61, 156, 180,
];

const perlinTable = new Uint16Array(512);
for (let index = 0; index < perlinTable.length; index += 1) {
	perlinTable[index] = permutation[index & 255];
}

const fade = (value: number) =>
	value * value * value * (value * (value * 6 - 15) + 10);

const gradient = (hash: number, x: number, y: number, z: number) => {
	const value = hash & 15;
	const first = value < 8 ? x : y;
	const second = value < 4 ? y : value === 12 || value === 14 ? x : z;
	return (value & 1 ? -first : first) + (value & 2 ? -second : second);
};

const perlinNoise = (x: number, y: number, z: number) => {
	const floorX = Math.floor(x);
	const floorY = Math.floor(y);
	const floorZ = Math.floor(z);
	const tableX = floorX & 255;
	const tableY = floorY & 255;
	const tableZ = floorZ & 255;
	x -= floorX;
	y -= floorY;
	z -= floorZ;
	const previousX = x - 1;
	const previousY = y - 1;
	const previousZ = z - 1;
	const blendX = fade(x);
	const blendY = fade(y);
	const blendZ = fade(z);
	const a = perlinTable[tableX] + tableY;
	const aa = perlinTable[a] + tableZ;
	const ab = perlinTable[a + 1] + tableZ;
	const b = perlinTable[tableX + 1] + tableY;
	const ba = perlinTable[b] + tableZ;
	const bb = perlinTable[b + 1] + tableZ;
	const mix = (start: number, end: number, progress: number) =>
		start + progress * (end - start);
	const front = mix(
		mix(
			gradient(perlinTable[aa], x, y, z),
			gradient(perlinTable[ba], previousX, y, z),
			blendX,
		),
		mix(
			gradient(perlinTable[ab], x, previousY, z),
			gradient(perlinTable[bb], previousX, previousY, z),
			blendX,
		),
		blendY,
	);
	const back = mix(
		mix(
			gradient(perlinTable[aa + 1], x, y, previousZ),
			gradient(perlinTable[ba + 1], previousX, y, previousZ),
			blendX,
		),
		mix(
			gradient(perlinTable[ab + 1], x, previousY, previousZ),
			gradient(perlinTable[bb + 1], previousX, previousY, previousZ),
			blendX,
		),
		blendY,
	);
	return mix(front, back, blendZ);
};

const buildTerrain = () => {
	const segments = 100;
	const rowLength = segments + 1;
	const positions = new Float32Array(rowLength * rowLength * 3);
	let positionOffset = 0;
	for (let row = 0; row <= segments; row += 1) {
		const z = -100 + row * 2;
		for (let column = 0; column <= segments; column += 1) {
			const x = -100 + column * 2;
			positions[positionOffset++] = x;
			positions[positionOffset++] = 30 * perlinNoise(x / 200, z / 200, 8);
			positions[positionOffset++] = z;
		}
	}
	const indices = new Uint16Array(segments * segments * 6);
	let indexOffset = 0;
	for (let row = 0; row < segments; row += 1) {
		for (let column = 0; column < segments; column += 1) {
			const a = row * rowLength + column;
			const b = (row + 1) * rowLength + column;
			const c = (row + 1) * rowLength + column + 1;
			const d = row * rowLength + column + 1;
			indices[indexOffset++] = a;
			indices[indexOffset++] = b;
			indices[indexOffset++] = d;
			indices[indexOffset++] = b;
			indices[indexOffset++] = c;
			indices[indexOffset++] = d;
		}
	}
	return { indices, positions };
};

const vertexSource = `#version 300 es
	precision highp float;
	in vec3 position;
	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	out vec3 vPos;
	void main() {
		vPos = position;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const fragmentSource = `#version 300 es
	precision highp float;
	uniform float time;
	uniform float lineFrequency;
	uniform vec3 meshColor;
	uniform float lineThickness;
	uniform float speed;
	uniform float lineOpacity;
	in vec3 vPos;
	out vec4 color;

	vec3 rainbowMask(float coord, float hueShift) {
		float r = sin(coord * 0.5 + hueShift + sin(vPos.x * 0.1) + time * 0.1) * 0.45 + 0.45;
		float g = sin(coord * 0.5 + hueShift + sin(vPos.z * 0.1) + time * 0.2 + 2.0) * 0.4 + 0.4;
		float b = sin(coord * 0.5 + hueShift + sin((vPos.x + vPos.z) * 0.1) + time * 0.3 + 4.0) * 0.40 + 0.40;
		return vec3(r, g, b);
	}

	void main() {
		float coord = (vPos.y * lineFrequency + time * speed) / 2.0;
		float grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord) / lineThickness;
		float line = min(grid, 1.0);
		float hueShiftAmount = mod(time * 0.5, 6.28);
		vec3 lineColor = rainbowMask((vPos.x + vPos.z) * 0.0001, hueShiftAmount);
		color = vec4(mix(lineColor, meshColor, line), lineOpacity);
	}
`;

if (canvas && !reducedMotion) {
	const stage = canvas.closest<HTMLElement>("[data-hero-canvas-stage]");
	const start = () => {
		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: true,
			powerPreference: "low-power",
			premultipliedAlpha: true,
			preserveDrawingBuffer: false,
		});
		if (!gl) return;
		if ("drawingBufferColorSpace" in gl) gl.drawingBufferColorSpace = "srgb";

		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) return null;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				console.error(gl.getShaderInfoLog(shader));
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
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error(gl.getProgramInfoLog(program));
			return;
		}

		const { indices, positions } = buildTerrain();
		const positionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
		const indexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
		gl.useProgram(program);
		const position = gl.getAttribLocation(program, "position");
		gl.enableVertexAttribArray(position);
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 12, 0);

		const modelViewMatrix = gl.getUniformLocation(program, "modelViewMatrix");
		const projectionMatrix = gl.getUniformLocation(program, "projectionMatrix");
		const time = gl.getUniformLocation(program, "time");
		gl.uniformMatrix4fv(
			modelViewMatrix,
			false,
			new Float32Array([
				1, 0, 0, 0, 0, 0.0001, 1, 0, 0, -1, 0.0001, 0, 0, -0.01, -100, 1,
			]),
		);
		gl.uniform1f(gl.getUniformLocation(program, "lineFrequency"), 2);
		gl.uniform3f(gl.getUniformLocation(program, "meshColor"), 1, 1, 1);
		gl.uniform1f(gl.getUniformLocation(program, "lineThickness"), 1);
		gl.uniform1f(gl.getUniformLocation(program, "speed"), 0.4);
		gl.uniform1f(gl.getUniformLocation(program, "lineOpacity"), 0.3);
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);
		gl.frontFace(gl.CCW);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		const projection = new Float32Array(16);
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
			projection.fill(0);
			projection[0] = height / (25 * width);
			projection[5] = 0.04;
			projection[10] = -2 / 999.9;
			projection[14] = -1000.1 / 999.9;
			projection[15] = 1;
			gl.uniformMatrix4fv(projectionMatrix, false, projection);
		};

		const fixedTime = new URLSearchParams(location.search).get(
			"opaline-canvas-time",
		);
		const fixedSeconds = fixedTime === null ? null : Number(fixedTime) || 0;
		let elapsedBeforePause = 0;
		let resumedAt = performance.now();
		let frame = 0;
		let visible = true;
		const paint = (now: number) => {
			resize();
			gl.clearColor(1, 1, 1, 1);
			gl.clearDepth(1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			const forcedTime = Number(
				document.documentElement.dataset.opalineCanvasTime,
			);
			const elapsed =
				fixedSeconds === null
					? elapsedBeforePause + (now - resumedAt) / 1000
					: Number.isFinite(forcedTime)
						? forcedTime
						: fixedSeconds;
			gl.uniform1f(time, elapsed);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
			stage?.setAttribute("data-canvas-ready", "");
		};
		const draw = (now: number) => {
			frame = 0;
			if (!visible || document.hidden) return;
			paint(now);
			if (fixedSeconds === null) frame = requestAnimationFrame(draw);
		};
		const pause = () => {
			if (fixedSeconds === null) {
				elapsedBeforePause += (performance.now() - resumedAt) / 1000;
			}
			cancelAnimationFrame(frame);
			frame = 0;
		};
		const resume = () => {
			if (frame !== 0 || !visible || document.hidden) return;
			resumedAt = performance.now();
			frame = requestAnimationFrame(draw);
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
		addEventListener("resize", () => paint(performance.now()), {
			passive: true,
		});
		paint(performance.now());
		resume();
	};

	if ("requestIdleCallback" in window) {
		window.requestIdleCallback(start, { timeout: 900 });
	} else {
		setTimeout(start, 120);
	}
}
