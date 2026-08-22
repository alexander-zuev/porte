import { FaultyTerminal } from '@web/ui/components/react-bits/faulty-terminal.tsx'

/** Terminal field behind the landing page. Tune the look here, not per page. */
export function LandingBackground() {
  return (
    <FaultyTerminal
      brightness={0.18}
      className="-z-10"
      curvature={0.1}
      digitSize={1.2}
      flickerAmount={0.6}
      mouseStrength={0.3}
      scale={1.6}
      scanlineIntensity={0.4}
      timeScale={0.4}
    />
  )
}
