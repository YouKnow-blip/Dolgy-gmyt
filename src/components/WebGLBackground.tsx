import { useEffect, useRef } from 'react';

interface WebGLBackgroundProps {
  theme: 'dark' | 'light';
}

export default function WebGLBackground({ theme }: WebGLBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set fallback context
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) {
      console.warn('WebGL is not supported in this browser. Falling back to background styles.');
      return;
    }

    // Vertex Shader Source
    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment Shader Source
    const fsSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_dark_mode;

      // Pseudo-random noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Simple 2D Noise
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }

      // Fractional Brownian Motion for atmospheric density
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        // Rotate to reduce axial bias
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
        for (int i = 0; i < 4; ++i) {
          v += a * noise(p);
          p = rot * p * 2.0 + shift;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= u_resolution.x / u_resolution.y;

        // Smooth parallax mouse displacement
        vec2 mouseNormalized = u_mouse / u_resolution.xy;
        vec2 m = mouseNormalized * 2.0 - 1.0;
        p += m * 0.12;

        // Animate coordinate fields
        float q_x = fbm(p + vec2(u_time * 0.05, 0.0));
        float q_y = fbm(p + vec2(0.0, u_time * 0.04));
        vec2 q = vec2(q_x, q_y);

        float r_x = fbm(p + 1.0 * q + vec2(1.7, 9.2) + u_time * 0.015);
        float r_y = fbm(p + 1.0 * q + vec2(8.3, 2.8) + u_time * 0.02);
        vec2 r = vec2(r_x, r_y);

        float f = fbm(p + r);

        // Core colors setup
        vec3 col = vec3(0.0);

        if (u_dark_mode > 0.5) {
          // Dark obsidian theme: glowing nebulae, dust clouds, and dynamic mouse flares
          vec3 space = vec3(0.02, 0.02, 0.04);
          vec3 nebulaViolet = vec3(0.13, 0.05, 0.22);
          vec3 nebulaCyan = vec3(0.03, 0.15, 0.18);
          vec3 goldDust = vec3(0.32, 0.22, 0.06);

          col = mix(space, nebulaViolet, f * 0.9);
          col = mix(col, nebulaCyan, r.x * 0.6);
          col += goldDust * pow(max(0.0, 1.0 - length(p - m * 0.3)), 4.0) * 0.45;
          col = clamp(col, 0.0, 1.0);
        } else {
          // Premium executive light theme: soft iridescent glass accents, cream white
          vec3 backgroundCream = vec3(0.96, 0.96, 0.97);
          vec3 lavenderMist = vec3(0.88, 0.91, 0.98);
          vec3 peachRose = vec3(0.98, 0.89, 0.91);
          vec3 mintPearl = vec3(0.89, 0.96, 0.92);

          col = mix(backgroundCream, lavenderMist, f * 0.45);
          col = mix(col, peachRose, r.y * 0.35);
          col = mix(col, mintPearl, clamp(length(p * 0.5), 0.0, 1.0) * 0.15);
        }

        // Vignette effect
        float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
        vignette = clamp(pow(vignette * 16.0, 0.3), 0.0, 1.0);
        col *= mix(0.75, 1.0, vignette);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    // Shader creation helper
    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    // Program creation
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    // Geometry setup
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Uniform/Attribute locations
    const positionLocation = gl.getAttribLocation(program, 'position');
    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const mouseLoc = gl.getUniformLocation(program, 'u_mouse');
    const darkModeLoc = gl.getUniformLocation(program, 'u_dark_mode');

    // Handle Resize
    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap pixel ratio to 2 for performance
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Track mouse with smoothing
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = window.innerHeight - e.clientY; // Invert Y for WebGL coords
    };
    window.addEventListener('mousemove', onMouseMove);

    // Initial mouse pos in center
    mouseRef.current.targetX = window.innerWidth / 2;
    mouseRef.current.targetY = window.innerHeight / 2;
    mouseRef.current.x = mouseRef.current.targetX;
    mouseRef.current.y = mouseRef.current.targetY;

    // Animation variables
    let animationFrameId: number;
    let startTime = Date.now();

    const render = () => {
      // Lerp mouse
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      const currentTime = (Date.now() - startTime) / 1000.0;

      // Clear
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Use Program
      gl.useProgram(program);

      // Bind positions
      gl.enableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      // Set Uniforms
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, currentTime);
      gl.uniform2f(mouseLoc, mouseRef.current.x * (canvas.width / window.innerWidth), mouseRef.current.y * (canvas.height / window.innerHeight));
      gl.uniform1f(darkModeLoc, theme === 'dark' ? 1.0 : 0.0);

      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Clean up
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', onMouseMove);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-1000 block"
      style={{ opacity: theme === 'dark' ? 0.95 : 0.9 }}
    />
  );
}
