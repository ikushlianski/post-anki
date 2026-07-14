export type PauseForHumanParams = {
  ms?: number
  force?: boolean
}

const DEFAULT_MS = 1500

export async function pauseForHuman(
  params: PauseForHumanParams = {},
): Promise<void> {
  const { ms = DEFAULT_MS, force = false } = params

  if (!force && process.env.HEADED !== 'true') {
    return
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function inspectionPause(ms = 6000): Promise<void> {
  if (process.env.HEADED !== 'true') {
    return
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
