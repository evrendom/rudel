import { useEffect, useRef } from "react";

const MAX_DEVICE_PIXEL_RATIO = 1.75;

type WrappedTunnelCanvasProps = {
	phase: number;
	slideCount: number;
};

type RendererState = {
	height: number;
	pointerTargetX: number;
	pointerTargetY: number;
	pointerX: number;
	pointerY: number;
	width: number;
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
	v_uv = a_position * 0.5 + 0.5;
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec2 v_uv;

uniform vec2 u_pointer;
uniform vec2 u_resolution;
uniform float u_phase;
uniform float u_time;

float hash(vec2 point) {
	return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 point) {
	vec2 cell = floor(point);
	vec2 local = fract(point);
	vec2 blend = local * local * (3.0 - 2.0 * local);

	float bottomLeft = hash(cell);
	float bottomRight = hash(cell + vec2(1.0, 0.0));
	float topLeft = hash(cell + vec2(0.0, 1.0));
	float topRight = hash(cell + vec2(1.0, 1.0));

	float bottom = mix(bottomLeft, bottomRight, blend.x);
	float top = mix(topLeft, topRight, blend.x);

	return mix(bottom, top, blend.y);
}

float fbm(vec2 point) {
	float value = 0.0;
	float amplitude = 0.5;

	for (int octave = 0; octave < 4; octave += 1) {
		value += amplitude * noise(point);
		point = point * 2.02 + vec2(11.4, 7.6);
		amplitude *= 0.5;
	}

	return value;
}

void main() {
	vec2 uv = v_uv * 2.0 - 1.0;
	uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

	vec2 pointer = u_pointer * 2.0 - 1.0;
	pointer.x *= u_resolution.x / max(u_resolution.y, 1.0);

	float phase = clamp(u_phase, 0.0, 1.0);
	float time = u_time * mix(0.12, 0.2, phase);
	vec2 warpedUv = uv + pointer * 0.16;
	float radius = length(warpedUv);
	float angle = atan(warpedUv.y, warpedUv.x);
	float depth = 1.0 / max(radius + 0.24, 0.24);
	float turbulence = fbm(vec2(angle * 2.4 + time * 0.3, depth * 0.8 - time * 3.8));

	float beamA = pow(max(0.0, cos(angle * 3.0 - time * 4.8 + radius * 14.0)), 18.0);
	float beamB = pow(max(0.0, sin(angle * 5.0 + time * 3.2 - radius * 20.0)), 24.0);
	float ringPulse = smoothstep(0.35, 0.95, abs(sin(depth * 17.0 - time * 12.5)));
	float lanePulse = smoothstep(0.62, 0.96, sin((angle + turbulence * 0.8) * 14.0 + time * 2.6) * 0.5 + 0.5);
	float tunnelMask = smoothstep(1.2, 0.12, radius);
	float spotlight = exp(-7.0 * radius * radius);
	float streak = pow(max(0.0, 1.0 - abs(uv.y + pointer.y * 0.22)), 10.0);
	float haze = fbm(vec2(uv.x * 2.5 - time * 0.8, uv.y * 1.8 + time * 0.5));

	vec3 deepNavy = vec3(0.01, 0.04, 0.09);
	vec3 emerald = vec3(0.26, 1.0, 0.76);
	vec3 cyan = vec3(0.22, 0.8, 1.0);
	vec3 gold = vec3(1.0, 0.77, 0.28);

	vec3 color = deepNavy;
	color += mix(emerald, cyan, turbulence) * tunnelMask * (0.14 + haze * 0.18);
	color += emerald * beamA * (0.22 + phase * 0.18);
	color += gold * beamB * (0.16 + phase * 0.24);
	color += mix(cyan, gold, phase) * ringPulse * tunnelMask * 0.18;
	color += mix(emerald, gold, 0.5 + 0.5 * sin(time)) * lanePulse * tunnelMask * 0.12;
	color += cyan * streak * (0.08 + phase * 0.1);
	color += vec3(1.0, 0.96, 0.84) * spotlight * (0.08 + phase * 0.06);

	float vignette = smoothstep(1.35, 0.18, length(uv));
	color *= vignette;

	gl_FragColor = vec4(color, 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);

	if (!shader) {
		throw new Error("Failed to allocate WebGL shader.");
	}

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		return shader;
	}

	const shaderInfoLog = gl.getShaderInfoLog(shader) ?? "Unknown shader error.";
	gl.deleteShader(shader);
	throw new Error(shaderInfoLog);
}

function createProgram(gl: WebGLRenderingContext) {
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
	const fragmentShader = createShader(
		gl,
		gl.FRAGMENT_SHADER,
		FRAGMENT_SHADER_SOURCE,
	);
	const program = gl.createProgram();

	if (!program) {
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		throw new Error("Failed to allocate WebGL program.");
	}

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);

	if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
		return program;
	}

	const programInfoLog =
		gl.getProgramInfoLog(program) ?? "Unknown program link error.";
	gl.deleteProgram(program);
	throw new Error(programInfoLog);
}

function resizeCanvas(
	canvas: HTMLCanvasElement,
	gl: WebGLRenderingContext,
	state: RendererState,
) {
	const devicePixelRatio = Math.min(
		window.devicePixelRatio || 1,
		MAX_DEVICE_PIXEL_RATIO,
	);
	const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
	const height = Math.max(
		1,
		Math.floor(canvas.clientHeight * devicePixelRatio),
	);

	if (canvas.width === width && canvas.height === height) {
		state.width = width;
		state.height = height;
		return;
	}

	canvas.width = width;
	canvas.height = height;
	state.width = width;
	state.height = height;
	gl.viewport(0, 0, width, height);
}

export function WrappedTunnelCanvas({
	phase,
	slideCount,
}: WrappedTunnelCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const phaseRef = useRef(0);

	useEffect(() => {
		phaseRef.current =
			slideCount > 1 ? Math.min(1, Math.max(0, phase / (slideCount - 1))) : 0;
	}, [phase, slideCount]);

	useEffect(() => {
		const canvas = canvasRef.current;

		if (!canvas) {
			return;
		}

		const gl = canvas.getContext("webgl", {
			alpha: true,
			antialias: true,
			powerPreference: "high-performance",
			premultipliedAlpha: true,
		});

		if (!gl) {
			console.warn("[wrapped] WebGL unavailable, tunnel canvas disabled.");
			return;
		}

		try {
			const state: RendererState = {
				height: 1,
				pointerTargetX: 0.5,
				pointerTargetY: 0.5,
				pointerX: 0.5,
				pointerY: 0.5,
				width: 1,
			};
			const program = createProgram(gl);
			const positionLocation = gl.getAttribLocation(program, "a_position");

			if (positionLocation < 0) {
				gl.deleteProgram(program);
				throw new Error("WebGL position attribute was not found.");
			}

			const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
			const timeLocation = gl.getUniformLocation(program, "u_time");
			const pointerLocation = gl.getUniformLocation(program, "u_pointer");
			const phaseLocation = gl.getUniformLocation(program, "u_phase");

			if (
				!resolutionLocation ||
				!timeLocation ||
				!pointerLocation ||
				!phaseLocation
			) {
				gl.deleteProgram(program);
				throw new Error("WebGL uniform locations were not found.");
			}

			const positionBuffer = gl.createBuffer();

			if (!positionBuffer) {
				gl.deleteProgram(program);
				throw new Error("Failed to allocate WebGL position buffer.");
			}

			gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
				gl.STATIC_DRAW,
			);
			const applyProgram = gl["useProgram"].bind(gl);

			applyProgram(program);
			gl.enableVertexAttribArray(positionLocation);
			gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
			gl.disable(gl.DEPTH_TEST);
			gl.disable(gl.CULL_FACE);

			const resize = () => resizeCanvas(canvas, gl, state);
			resize();

			const resizeObserver = new ResizeObserver(() => {
				resize();
			});

			resizeObserver.observe(canvas);

			const handlePointerMove = (event: PointerEvent) => {
				state.pointerTargetX = event.clientX / Math.max(window.innerWidth, 1);
				state.pointerTargetY = event.clientY / Math.max(window.innerHeight, 1);
			};

			const handlePointerLeave = () => {
				state.pointerTargetX = 0.5;
				state.pointerTargetY = 0.5;
			};

			window.addEventListener("pointermove", handlePointerMove, {
				passive: true,
			});
			window.addEventListener("pointerleave", handlePointerLeave);
			window.addEventListener("resize", resize);

			let animationFrameId = 0;
			const renderFrame = (timestamp: number) => {
				animationFrameId = window.requestAnimationFrame(renderFrame);
				state.pointerX += (state.pointerTargetX - state.pointerX) * 0.055;
				state.pointerY += (state.pointerTargetY - state.pointerY) * 0.055;

				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.uniform2f(resolutionLocation, state.width, state.height);
				gl.uniform1f(timeLocation, timestamp * 0.001);
				gl.uniform2f(pointerLocation, state.pointerX, 1 - state.pointerY);
				gl.uniform1f(phaseLocation, phaseRef.current);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			};

			animationFrameId = window.requestAnimationFrame(renderFrame);

			return () => {
				window.cancelAnimationFrame(animationFrameId);
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerleave", handlePointerLeave);
				window.removeEventListener("resize", resize);
				resizeObserver.disconnect();
				gl.bindBuffer(gl.ARRAY_BUFFER, null);
				gl.deleteBuffer(positionBuffer);
				applyProgram(null);
				gl.deleteProgram(program);
				const loseContextExtension = gl.getExtension("WEBGL_lose_context");

				if (loseContextExtension) {
					loseContextExtension.loseContext();
				}
			};
		} catch (error) {
			console.error("[wrapped] Failed to initialize WebGL tunnel.", error);
			return;
		}
	}, []);

	return <canvas ref={canvasRef} aria-hidden className="fifa-wrapped-webgl" />;
}
