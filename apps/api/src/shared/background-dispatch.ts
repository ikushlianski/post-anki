import { log } from "./log.js";

export interface BackgroundDispatch {
  durable: boolean;
  start: () => Promise<unknown>;
  onError: (err: unknown) => void | Promise<void>;
}

async function runSettled({ start, onError }: BackgroundDispatch): Promise<void> {
  try {
    await start();
  } catch (err) {
    try {
      await onError(err);
    } catch (handlerErr) {
      log.error({ err: handlerErr }, "background_dispatch_error_handler_failed");
    }
  }
}

export async function dispatchBackground(dispatch: BackgroundDispatch): Promise<void> {
  const run = runSettled(dispatch);

  if (dispatch.durable) {
    await run;
  }
}
