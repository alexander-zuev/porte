import { Color, Mesh, Program, Renderer, Triangle } from 'ogl'
import { useEffect, useMemo, useRef } from 'react'

import { cn } from '#/lib/utils.ts'
import { resolveColorChannels } from '#/ui/components/react-bits/resolve-color.ts'

/**
 * CRT terminal field rendered with WebGL.
 *
 * Adapted from React Bits (https://reactbits.dev/backgrounds/faulty-terminal).
 * The tint comes from a design token, and reduced motion freezes the animation.
 */

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision mediump float;

varying vec2 vUv;

uniform float iTime;
uniform vec3  iResolution;
uniform float uScale;

uniform vec2  uGridMul;
uniform float uDigitSize;
uniform float uScanlineIntensity;
uniform float uGlitchAmount;
uniform float uFlickerAmount;
uniform float uNoiseAmp;
uniform float uChromaticAberration;
uniform float uDither;
uniform float uCurvature;
uniform vec3  uTint;
uniform vec2  uMouse;
uniform float uMouseStrength;
uniform float uUseMouse;
uniform float uPageLoadProgress;
uniform float uUsePageLoadAnimation;
uniform float uBrightness;

float time;

float hash21(vec2 p){
  p = fract(p * 234.56);
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(vec2 p)
{
  return sin(p.x * 10.0) * sin(p.y * (3.0 + sin(time * 0.090909))) + 0.2;
}

mat2 rotate(float angle)
{
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float fbm(vec2 p)
{
  p *= 1.1;
  float f = 0.0;
  float amp = 0.5 * uNoiseAmp;

  mat2 modify0 = rotate(time * 0.02);
  f += amp * noise(p);
  p = modify0 * p * 2.0;
  amp *= 0.454545;

  mat2 modify1 = rotate(time * 0.02);
  f += amp * noise(p);
  p = modify1 * p * 2.0;
  amp *= 0.454545;

  mat2 modify2 = rotate(time * 0.08);
  f += amp * noise(p);

  return f;
}

float pattern(vec2 p, out vec2 q, out vec2 r) {
  vec2 offset1 = vec2(1.0);
  vec2 offset0 = vec2(0.0);
  mat2 rot01 = rotate(0.1 * time);
  mat2 rot1 = rotate(0.1);

  q = vec2(fbm(p + offset1), fbm(rot01 * p + offset1));
  r = vec2(fbm(rot1 * q + offset0), fbm(q + offset0));
  return fbm(p + r);
}

float digit(vec2 p){
    vec2 grid = uGridMul * 15.0;
    vec2 s = floor(p * grid) / grid;
    p = p * grid;
    vec2 q, r;
    float intensity = pattern(s * 0.1, q, r) * 1.3 - 0.03;

    if(uUseMouse > 0.5){
        vec2 mouseWorld = uMouse * uScale;
        float distToMouse = distance(s, mouseWorld);
        float mouseInfluence = exp(-distToMouse * 8.0) * uMouseStrength * 10.0;
        intensity += mouseInfluence;

        float ripple = sin(distToMouse * 20.0 - iTime * 5.0) * 0.1 * mouseInfluence;
        intensity += ripple;
    }

    if(uUsePageLoadAnimation > 0.5){
        float cellRandom = fract(sin(dot(s, vec2(12.9898, 78.233))) * 43758.5453);
        float cellDelay = cellRandom * 0.8;
        float cellProgress = clamp((uPageLoadProgress - cellDelay) / 0.2, 0.0, 1.0);

        float fadeAlpha = smoothstep(0.0, 1.0, cellProgress);
        intensity *= fadeAlpha;
    }

    p = fract(p);
    p *= uDigitSize;

    float px5 = p.x * 5.0;
    float py5 = (1.0 - p.y) * 5.0;
    float x = fract(px5);
    float y = fract(py5);

    float i = floor(py5) - 2.0;
    float j = floor(px5) - 2.0;
    float n = i * i + j * j;
    float f = n * 0.0625;

    float isOn = step(0.1, intensity - f);
    float brightness = isOn * (0.2 + y * 0.8) * (0.75 + x * 0.25);

    return step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0) * brightness;
}

float onOff(float a, float b, float c)
{
  return step(c, sin(iTime + a * cos(iTime * b))) * uFlickerAmount;
}

float displace(vec2 look)
{
    float y = look.y - mod(iTime * 0.25, 1.0);
    float window = 1.0 / (1.0 + 50.0 * y * y);
    return sin(look.y * 20.0 + iTime) * 0.0125 * onOff(4.0, 2.0, 0.8) * (1.0 + cos(iTime * 60.0)) * window;
}

vec3 getColor(vec2 p){

    float bar = step(mod(p.y + time * 20.0, 1.0), 0.2) * 0.4 + 1.0;
    bar *= uScanlineIntensity;

    float displacement = displace(p);
    p.x += displacement;

    if (uGlitchAmount != 1.0) {
      float extra = displacement * (uGlitchAmount - 1.0);
      p.x += extra;
    }

    float middle = digit(p);

    const float off = 0.002;
    float sum = digit(p + vec2(-off, -off)) + digit(p + vec2(0.0, -off)) + digit(p + vec2(off, -off)) +
                digit(p + vec2(-off, 0.0)) + digit(p + vec2(0.0, 0.0)) + digit(p + vec2(off, 0.0)) +
                digit(p + vec2(-off, off)) + digit(p + vec2(0.0, off)) + digit(p + vec2(off, off));

    vec3 baseColor = vec3(0.9) * middle + sum * 0.1 * vec3(1.0) * bar;
    return baseColor;
}

vec2 barrel(vec2 uv){
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= 1.0 + uCurvature * r2;
  return c * 0.5 + 0.5;
}

void main() {
    time = iTime * 0.333333;
    vec2 uv = vUv;

    if(uCurvature != 0.0){
      uv = barrel(uv);
    }

    vec2 p = uv * uScale;
    vec3 col = getColor(p);

    if(uChromaticAberration != 0.0){
      vec2 ca = vec2(uChromaticAberration) / iResolution.xy;
      col.r = getColor(p + ca).r;
      col.b = getColor(p - ca).b;
    }

    col *= uTint;
    col *= uBrightness;

    if(uDither > 0.0){
      float rnd = hash21(gl_FragCoord.xy);
      col += (rnd - 0.5) * (uDither * 0.003922);
    }

    gl_FragColor = vec4(col, 1.0);
}
`

const LOAD_ANIMATION_MS = 2000
const MOUSE_DAMPING = 0.08
const MAX_PIXEL_RATIO = 2
const DEFAULT_GRID_MUL: readonly [number, number] = [2, 1]

export type FaultyTerminalProps = {
  readonly scale?: number
  readonly gridMul?: readonly [number, number]
  readonly digitSize?: number
  readonly timeScale?: number
  readonly pause?: boolean
  readonly scanlineIntensity?: number
  readonly glitchAmount?: number
  readonly flickerAmount?: number
  readonly noiseAmp?: number
  readonly chromaticAberration?: number
  readonly dither?: number
  readonly curvature?: number
  /** Custom property holding the tint applied to every glyph. */
  readonly tintVar?: string
  readonly mouseReact?: boolean
  readonly mouseStrength?: number
  readonly pageLoadAnimation?: boolean
  readonly brightness?: number
  readonly className?: string
}

export function FaultyTerminal({
  scale = 1,
  gridMul = DEFAULT_GRID_MUL,
  digitSize = 1.5,
  timeScale = 0.3,
  pause = false,
  scanlineIntensity = 0.3,
  glitchAmount = 1,
  flickerAmount = 1,
  noiseAmp = 1,
  chromaticAberration = 0,
  dither = 0,
  curvature = 0.2,
  tintVar = '--color-foreground',
  mouseReact = true,
  mouseStrength = 0.2,
  pageLoadAnimation = true,
  brightness = 1,
  className,
}: FaultyTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const smoothMouseRef = useRef({ x: 0.5, y: 0.5 })
  const [gridX, gridY] = gridMul
  const gridUniform = useMemo(() => new Float32Array([gridX, gridY]), [gridX, gridY])

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return undefined

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tint = resolveColorChannels(getComputedStyle(container).getPropertyValue(tintVar).trim())
    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) })
    const gl = renderer.gl
    const canvas = gl.canvas
    if (!(canvas instanceof HTMLCanvasElement)) return undefined
    gl.clearColor(0, 0, 0, 1)

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height),
        },
        uScale: { value: scale },
        uGridMul: { value: gridUniform },
        uDigitSize: { value: digitSize },
        uScanlineIntensity: { value: scanlineIntensity },
        uGlitchAmount: { value: glitchAmount },
        uFlickerAmount: { value: flickerAmount },
        uNoiseAmp: { value: noiseAmp },
        uChromaticAberration: { value: chromaticAberration },
        uDither: { value: dither },
        uCurvature: { value: curvature },
        uTint: { value: new Color(tint[0], tint[1], tint[2]) },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseStrength: { value: mouseStrength },
        uUseMouse: { value: mouseReact && !reducedMotion ? 1 : 0 },
        uPageLoadProgress: { value: pageLoadAnimation && !reducedMotion ? 0 : 1 },
        uUsePageLoadAnimation: { value: pageLoadAnimation && !reducedMotion ? 1 : 0 },
        uBrightness: { value: brightness },
      },
    })

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const resize = () => {
      renderer.setSize(container.offsetWidth, container.offsetHeight)
      program.uniforms.iResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / gl.canvas.height,
      )
    }

    const observer = new ResizeObserver(() => {
      resize()
    })
    observer.observe(container)
    resize()

    const frozen = pause || reducedMotion
    let loadStart = 0
    let frame = 0
    const timeOffset = Math.random() * 100

    const update = (elapsed: number) => {
      frame = requestAnimationFrame(update)
      if (loadStart === 0) loadStart = elapsed

      program.uniforms.iTime.value = frozen ? 0 : (elapsed * 0.001 + timeOffset) * timeScale

      if (pageLoadAnimation && !reducedMotion) {
        program.uniforms.uPageLoadProgress.value = Math.min(
          (elapsed - loadStart) / LOAD_ANIMATION_MS,
          1,
        )
      }

      if (mouseReact && !reducedMotion) {
        const smooth = smoothMouseRef.current
        smooth.x += (mouseRef.current.x - smooth.x) * MOUSE_DAMPING
        smooth.y += (mouseRef.current.y - smooth.y) * MOUSE_DAMPING
        // SAFETY: uMouse is created above as a Float32Array and never reassigned.
        const uniform = program.uniforms.uMouse.value as Float32Array
        uniform[0] = smooth.x
        uniform[1] = smooth.y
      }

      renderer.render({ scene: mesh })
    }

    frame = requestAnimationFrame(update)
    container.appendChild(canvas)

    const trackPointer = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      mouseRef.current = {
        x: (event.clientX - rect.left) / rect.width,
        y: 1 - (event.clientY - rect.top) / rect.height,
      }
    }

    if (mouseReact && !reducedMotion) {
      container.addEventListener('pointermove', trackPointer, { passive: true })
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      container.removeEventListener('pointermove', trackPointer)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [
    brightness,
    chromaticAberration,
    curvature,
    digitSize,
    dither,
    flickerAmount,
    glitchAmount,
    gridUniform,
    mouseReact,
    mouseStrength,
    noiseAmp,
    pageLoadAnimation,
    pause,
    scale,
    scanlineIntensity,
    timeScale,
    tintVar,
  ])

  return <div ref={containerRef} aria-hidden className={cn('absolute inset-0', className)} />
}
