import type { AiErrorCode } from '../../shared/types'

/** Structured AI subsystem failure. Never surfaces stack traces to the renderer. */
export class AiError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

/** User-understandable message for each error code. Logs keep details; UI shows these. */
export function aiUserMessage(code: AiErrorCode): string {
  switch (code) {
    case 'AI_RUNTIME_NOT_FOUND':
      return 'AI runtime is not installed. Place llama-server next to the app resources (see model setup) and try again.'
    case 'AI_RUNTIME_START_FAILED':
      return 'The AI runtime failed to start. Restart the AI and try again.'
    case 'AI_RUNTIME_TIMEOUT':
      return 'The AI runtime took too long to start. Restart the AI and try again.'
    case 'AI_MODEL_NOT_FOUND':
      return 'Gemma 4 12B model not found. Select or import the GGUF model file to continue.'
    case 'AI_MODEL_INVALID':
      return 'The selected model file is not a valid model. Choose a valid GGUF file.'
    case 'AI_MODEL_HASH_MISMATCH':
      return 'The model file failed integrity verification. Re-import a complete model file.'
    case 'AI_MODEL_UNSUPPORTED':
      return 'This model file is not supported. Use the configured Gemma 4 12B GGUF build.'
    case 'AI_SERVER_UNAVAILABLE':
      return 'The AI runtime stopped unexpectedly. Restart the AI to continue.'
    case 'AI_GENERATION_FAILED':
      return 'Generation failed. Try again.'
    case 'AI_GENERATION_CANCELLED':
      return 'Generation stopped.'
    case 'AI_REQUEST_TOO_LARGE':
      return 'Your message is too long. Shorten it and try again.'
    case 'AI_TOO_MANY_MESSAGES':
      return 'This conversation turn has too many messages. Start a new chat.'
    case 'AI_BUSY':
      return 'The AI is already generating a response. Wait for it to finish or stop it.'
    case 'AI_OUT_OF_MEMORY':
      return 'Not enough memory to run the model. Close other apps and restart the AI.'
    case 'AI_NOT_READY':
      return 'The AI is still starting. Wait until it is ready.'
  }
}
